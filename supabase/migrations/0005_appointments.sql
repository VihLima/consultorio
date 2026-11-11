-- =============================================================================
-- Appointments: visits scheduled for a date and time, shown in the Agenda next
-- to the consultations already finished or still open.
--
-- A cancelled appointment keeps its row (cancelled_at set) so the agenda can
-- show it struck through; it can also be deleted.
--
-- Run once in the Supabase SQL Editor, after 0001–0004. Re-running is safe.
-- =============================================================================

create table if not exists public.appointments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users,
  created_at   timestamptz not null default now(),
  patient_id   uuid not null references public.patients,
  scheduled_at timestamptz not null,
  note         text,
  cancelled_at timestamptz
);

create index if not exists appointments_user_scheduled on public.appointments (user_id, scheduled_at);
create index if not exists appointments_patient_id     on public.appointments (patient_id);

grant select, insert, update, delete on public.appointments to authenticated;

alter table public.appointments enable row level security;

drop policy if exists appointments_select_own on public.appointments;
create policy appointments_select_own on public.appointments for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists appointments_insert_own on public.appointments;
create policy appointments_insert_own on public.appointments for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists appointments_update_own on public.appointments;
create policy appointments_update_own on public.appointments for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists appointments_delete_own on public.appointments;
create policy appointments_delete_own on public.appointments for delete to authenticated
  using (user_id = (select auth.uid()));

-- The patient must be one of the caller's own (the lookup runs through RLS).
create or replace function public.appointments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.patients p where p.id = new.patient_id) then
    raise exception 'patient_not_found';
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_guard on public.appointments;
create trigger appointments_guard
  before insert or update on public.appointments
  for each row execute function public.appointments_guard();
