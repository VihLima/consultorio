-- =============================================================================
-- 0001_init.sql — Consultorio Dra. Iachel
-- Schema, RLS, business-rule triggers, close_consultation RPC and Storage.
--
-- Run once in the Supabase SQL Editor (or `supabase db push`). Re-running is
-- safe: every object is created with IF NOT EXISTS / OR REPLACE, policies are
-- dropped before being recreated and the bucket insert ignores conflicts.
--
-- Error messages raised by the triggers/RPC are a contract with the frontend:
--   consultation_closed, consultation_patient_immutable, shift_closed,
--   no_open_shift, consultation_not_open, invalid_amount
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table if not exists public.shifts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  opened_at  timestamptz not null default now(),
  closed_at  timestamptz
);

create table if not exists public.patients (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users,
  created_at  timestamptz not null default now(),
  full_name   text not null check (length(trim(full_name)) > 0),
  birth_date  date,
  cedula      text,
  -- '1.234.567', '1234567' and ' 1 234 567 ' all normalize to '1234567'.
  -- regexp_replace / coalesce / nullif are immutable, as a stored generated
  -- column requires.
  cedula_norm text generated always as (
    nullif(regexp_replace(coalesce(cedula, ''), '[^0-9A-Za-z]', '', 'g'), '')
  ) stored
);

create table if not exists public.consultations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users,
  created_at       timestamptz not null default now(),
  patient_id       uuid not null references public.patients,
  -- shift in which the consultation was closed; null while it is a draft
  shift_id         uuid references public.shifts,
  clinical_history text not null default '',
  amount_pyg       bigint check (amount_pyg >= 0),
  status           text not null default 'open' check (status in ('open', 'closed')),
  started_at       timestamptz not null default now(),
  closed_at        timestamptz,
  constraint consultations_closed_complete check (
    status = 'open'
    or (shift_id is not null and amount_pyg is not null and closed_at is not null)
  )
);

create table if not exists public.consultation_files (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users,
  created_at      timestamptz not null default now(),
  consultation_id uuid not null references public.consultations,
  storage_path    text not null unique,
  file_name       text not null,
  mime_type       text not null,
  size_bytes      bigint not null check (size_bytes <= 10485760)
);

create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users,
  created_at  timestamptz not null default now(),
  shift_id    uuid not null references public.shifts,
  description text not null check (length(trim(description)) > 0),
  amount_pyg  bigint not null check (amount_pyg > 0)
);


-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

-- At most one open shift per user (also protects against a double tap).
create unique index if not exists shifts_one_open
  on public.shifts (user_id) where closed_at is null;

-- Same cedula (after normalization) cannot be registered twice.
create unique index if not exists patients_cedula
  on public.patients (user_id, cedula_norm) where cedula_norm is not null;

-- Name search.
create index if not exists patients_full_name_lower
  on public.patients (lower(full_name));

-- At most one open consultation per patient (also protects against a double tap).
create unique index if not exists consultations_one_open
  on public.consultations (patient_id) where status = 'open';

-- Foreign-key lookups (patient history, shift income, files, shift expenses).
create index if not exists consultations_patient_id on public.consultations (patient_id);
create index if not exists consultations_shift_id   on public.consultations (shift_id);
create index if not exists consultation_files_consultation_id
  on public.consultation_files (consultation_id);
create index if not exists expenses_shift_id on public.expenses (shift_id);


-- -----------------------------------------------------------------------------
-- Privileges
-- Explicit, so the app does not depend on the project's default grants.
-- Only signed-in users (role authenticated) get table access; RLS below then
-- limits them to their own rows. DELETE only where a delete policy exists.
-- -----------------------------------------------------------------------------

grant select, insert, update
  on public.shifts, public.patients, public.consultations,
     public.consultation_files, public.expenses
  to authenticated;

grant delete on public.consultation_files, public.expenses to authenticated;


-- -----------------------------------------------------------------------------
-- Row Level Security
-- Every row is visible/changeable only by its owner (user_id = auth.uid()).
-- DELETE policies exist only for expenses and consultation_files; patients,
-- consultations and shifts can never be deleted through the API.
-- -----------------------------------------------------------------------------

alter table public.shifts             enable row level security;
alter table public.patients           enable row level security;
alter table public.consultations      enable row level security;
alter table public.consultation_files enable row level security;
alter table public.expenses           enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['shifts', 'patients', 'consultations', 'consultation_files', 'expenses']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (user_id = (select auth.uid()))',
      t || '_select_own', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (user_id = (select auth.uid()))',
      t || '_insert_own', t);

    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t || '_update_own', t);
  end loop;

  foreach t in array array['consultation_files', 'expenses']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (user_id = (select auth.uid()))',
      t || '_delete_own', t);
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- Business-rule triggers (enforced in the database, not only in the UI)
-- Trigger functions run as the caller (security invoker), so their lookups
-- go through RLS like any other query of the user.
-- -----------------------------------------------------------------------------

-- consultations:
-- * a consultation is always created open (closing goes through
--   close_consultation(), so income always lands in an open shift);
-- * a closed consultation is read-only; the patient never changes;
-- * the open -> closed transition must point at a shift that is still open.
-- close_consultation() passes: OLD.status is still 'open' at that moment and
-- it sets shift_id to the caller's open shift. Any later update is rejected.
create or replace function public.consultations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'open' then
      raise exception 'consultation_closed';
    end if;
    return new;
  end if;

  if old.status = 'closed' then
    raise exception 'consultation_closed';
  end if;
  if new.patient_id is distinct from old.patient_id then
    raise exception 'consultation_patient_immutable';
  end if;
  if new.status = 'closed' and not exists (
    select 1 from public.shifts s
    where s.id = new.shift_id and s.closed_at is null
  ) then
    raise exception 'shift_closed';
  end if;
  return new;
end;
$$;

create or replace trigger consultations_guard
  before insert or update on public.consultations
  for each row execute function public.consultations_guard();


-- consultation_files: files of a closed consultation cannot be added, changed
-- or removed.
create or replace function public.consultation_files_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and exists (
    select 1 from public.consultations c
    where c.id = old.consultation_id and c.status = 'closed'
  ) then
    raise exception 'consultation_closed';
  end if;

  if tg_op in ('INSERT', 'UPDATE') and exists (
    select 1 from public.consultations c
    where c.id = new.consultation_id and c.status = 'closed'
  ) then
    raise exception 'consultation_closed';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace trigger consultation_files_closed_guard
  before insert or update or delete on public.consultation_files
  for each row execute function public.consultation_files_guard();


-- expenses: expenses of a closed shift cannot be added, changed or removed.
create or replace function public.expenses_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and exists (
    select 1 from public.shifts s
    where s.id = old.shift_id and s.closed_at is not null
  ) then
    raise exception 'shift_closed';
  end if;

  if tg_op in ('INSERT', 'UPDATE') and exists (
    select 1 from public.shifts s
    where s.id = new.shift_id and s.closed_at is not null
  ) then
    raise exception 'shift_closed';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace trigger expenses_shift_closed_guard
  before insert or update or delete on public.expenses
  for each row execute function public.expenses_guard();


-- shifts: once closed, a shift is read-only (closing it is the last update).
-- The closing time comes from the server clock, whatever the client sent.
create or replace function public.shifts_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.closed_at is not null then
    raise exception 'shift_closed';
  end if;
  if new.closed_at is not null then
    new.closed_at := now();
  end if;
  return new;
end;
$$;

create or replace trigger shifts_immutable_when_closed
  before update on public.shifts
  for each row execute function public.shifts_guard_update();


-- -----------------------------------------------------------------------------
-- RPC: close_consultation
-- Closes an open consultation in the caller's open shift, recording the amount
-- charged. Runs as the caller (security invoker), so RLS restricts it to the
-- caller's own shift and consultation.
-- -----------------------------------------------------------------------------

create or replace function public.close_consultation(p_consultation_id uuid, p_amount bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_shift_id uuid;
  v_rows     integer;
begin
  if p_amount is null or p_amount < 0 then
    raise exception 'invalid_amount';
  end if;

  select s.id into v_shift_id
  from public.shifts s
  where s.user_id = auth.uid() and s.closed_at is null;

  if v_shift_id is null then
    raise exception 'no_open_shift';
  end if;

  update public.consultations
  set status     = 'closed',
      amount_pyg = p_amount,
      shift_id   = v_shift_id,
      closed_at  = now()
  where id = p_consultation_id and status = 'open';

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'consultation_not_open';
  end if;
end;
$$;

revoke execute on function public.close_consultation(uuid, bigint) from public, anon;
grant execute on function public.close_consultation(uuid, bigint) to authenticated;


-- -----------------------------------------------------------------------------
-- Storage: private bucket patient-files
-- Path: {user_id}/{patient_id}/{consultation_id}/{uuid}-{file name}
-- Access is granted by the first path segment (= owner's user id).
-- Files are shown through short-lived signed URLs (bucket is not public).
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('patient-files', 'patient-files', false, 10485760, array['image/*', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "patient_files_select_own" on storage.objects;
create policy "patient_files_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'patient-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "patient_files_insert_own" on storage.objects;
create policy "patient_files_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'patient-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "patient_files_delete_own" on storage.objects;
create policy "patient_files_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'patient-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
