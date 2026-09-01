alter table if exists public.gps_work_sessions
  add column if not exists client_transfer_minutes integer not null default 0,
  add column if not exists unallocated_minutes integer not null default 0;

alter table if exists public.time_entries
  add column if not exists client_transfer_minutes integer null,
  add column if not exists unallocated_minutes integer null;

alter table if exists public.gps_work_sessions
  drop constraint if exists gps_work_sessions_client_transfer_minutes_check,
  drop constraint if exists gps_work_sessions_unallocated_minutes_check;

alter table if exists public.gps_work_sessions
  add constraint gps_work_sessions_client_transfer_minutes_check
    check (client_transfer_minutes >= 0),
  add constraint gps_work_sessions_unallocated_minutes_check
    check (unallocated_minutes >= 0);

alter table if exists public.time_entries
  drop constraint if exists time_entries_client_transfer_minutes_check,
  drop constraint if exists time_entries_unallocated_minutes_check;

alter table if exists public.time_entries
  add constraint time_entries_client_transfer_minutes_check
    check (client_transfer_minutes is null or client_transfer_minutes >= 0),
  add constraint time_entries_unallocated_minutes_check
    check (unallocated_minutes is null or unallocated_minutes >= 0);
