-- Patient phone number, as typed (e.g. '0981 123 456' or '+55 11 91234-5678').
-- Optional; the app turns it into a WhatsApp link. Can be run again safely.
alter table public.patients add column if not exists phone text;
