alter table if exists public.time_entries
  add column if not exists worked_days numeric(6,2) null;

alter table if exists public.time_entries
  drop constraint if exists time_entries_worked_days_check;

alter table if exists public.time_entries
  add constraint time_entries_worked_days_check
  check (worked_days is null or (worked_days >= 0 and worked_days <= 31));

update public.time_entries
set worked_days = round((worked_hours / 8.0)::numeric, 2)
where worked_days is null and worked_hours is not null;
