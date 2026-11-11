-- =============================================================================
-- Payments: a patient can pay part of a consultation now and the rest later.
--
-- * consultations.amount_pyg stays the amount CHARGED for the consultation;
-- * every amount actually RECEIVED is a row in payments, in the shift (open at
--   that moment) where it was received — shift income is the sum of payments;
-- * a patient's pending balance = charged (closed consultations) − paid.
--
-- Existing closed consultations are recorded as fully paid in cash, in the
-- shift and at the time they were closed, so past totals do not change.
--
-- Run once in the Supabase SQL Editor, after 0001–0003. Re-running is safe.
-- New error messages for the frontend: invalid_method, patient_not_found.
-- =============================================================================

create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users,
  created_at      timestamptz not null default now(),
  patient_id      uuid not null references public.patients,
  -- set when the payment was made while closing that consultation
  consultation_id uuid references public.consultations,
  shift_id        uuid not null references public.shifts,
  amount_pyg      bigint not null check (amount_pyg > 0),
  method          text not null check (method in ('cash', 'transfer', 'card')),
  paid_at         timestamptz not null default now()
);

create index if not exists payments_patient_id      on public.payments (patient_id);
create index if not exists payments_shift_id        on public.payments (shift_id);
create index if not exists payments_consultation_id on public.payments (consultation_id);

-- Payments are never edited; one taken by mistake can be removed while its
-- shift is still open (the trigger below enforces it).
grant select, insert, delete on public.payments to authenticated;

alter table public.payments enable row level security;

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists payments_insert_own on public.payments;
create policy payments_insert_own on public.payments for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists payments_delete_own on public.payments;
create policy payments_delete_own on public.payments for delete to authenticated
  using (user_id = (select auth.uid()));


-- -----------------------------------------------------------------------------
-- Backfill: past consultations count as paid in full when they were closed.
-- Done with the guard trigger absent, because those shifts are already closed.
-- -----------------------------------------------------------------------------

drop trigger if exists payments_guard on public.payments;

insert into public.payments
  (user_id, patient_id, consultation_id, shift_id, amount_pyg, method, paid_at, created_at)
select c.user_id, c.patient_id, c.id, c.shift_id, c.amount_pyg, 'cash', c.closed_at, c.closed_at
from public.consultations c
where c.status = 'closed'
  and c.amount_pyg > 0
  and not exists (select 1 from public.payments p where p.consultation_id = c.id);


-- -----------------------------------------------------------------------------
-- Guard: a payment lands only in an open shift, for one of the caller's own
-- patients (lookups run as the caller, through RLS), with the server's clock;
-- it can be removed only while its shift is open.
-- -----------------------------------------------------------------------------

create or replace function public.payments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1 from public.shifts s
      where s.id = old.shift_id and s.closed_at is not null
    ) then
      raise exception 'shift_closed';
    end if;
    return old;
  end if;

  if not exists (
    select 1 from public.shifts s
    where s.id = new.shift_id and s.closed_at is null
  ) then
    raise exception 'shift_closed';
  end if;
  if not exists (select 1 from public.patients p where p.id = new.patient_id) then
    raise exception 'patient_not_found';
  end if;
  new.paid_at := now();
  return new;
end;
$$;

create trigger payments_guard
  before insert or delete on public.payments
  for each row execute function public.payments_guard();


-- -----------------------------------------------------------------------------
-- RPC: close_consultation, now with the part paid at closing.
-- p_paid null means "paid in full" (what the previous two-argument version
-- did), so an app version that does not send it keeps working. p_paid 0
-- leaves the whole amount pending.
-- -----------------------------------------------------------------------------

drop function if exists public.close_consultation(uuid, bigint);

create or replace function public.close_consultation(
  p_consultation_id uuid,
  p_amount bigint,
  p_paid bigint default null,
  p_method text default 'cash'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_shift_id   uuid;
  v_patient_id uuid;
  v_paid       bigint := coalesce(p_paid, p_amount);
begin
  if p_amount is null or p_amount < 0 or v_paid < 0 then
    raise exception 'invalid_amount';
  end if;
  if p_method is null or p_method not in ('cash', 'transfer', 'card') then
    raise exception 'invalid_method';
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
  where id = p_consultation_id and status = 'open'
  returning patient_id into v_patient_id;

  if v_patient_id is null then
    raise exception 'consultation_not_open';
  end if;

  if v_paid > 0 then
    insert into public.payments (patient_id, consultation_id, shift_id, amount_pyg, method)
    values (v_patient_id, p_consultation_id, v_shift_id, v_paid, p_method);
  end if;
end;
$$;

revoke execute on function public.close_consultation(uuid, bigint, bigint, text) from public, anon;
grant execute on function public.close_consultation(uuid, bigint, bigint, text) to authenticated;
