-- =============================================================================
-- Appointment service: what the visit is for (consultation, ultrasound,
-- surgery or something else). Rows saved before this migration become
-- consultations.
--
-- Run once in the Supabase SQL Editor, after 0005 and BEFORE publishing the
-- version of the site that uses it. Re-running is safe.
-- =============================================================================

alter table public.appointments
  add column if not exists service text not null default 'consulta';

alter table public.appointments
  drop constraint if exists appointments_service_check;

alter table public.appointments
  add constraint appointments_service_check
  check (service in ('consulta', 'ecografia', 'cirugia', 'otro'));
