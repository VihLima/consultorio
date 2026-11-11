-- Free-text notes about the patient (allergies, contact, anything fixed that
-- is not part of a single consultation). Optional; can be run again safely.
alter table public.patients add column if not exists notes text;
