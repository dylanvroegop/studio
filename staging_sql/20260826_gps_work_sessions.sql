create extension if not exists pgcrypto;

create table if not exists public.gps_work_settings (
  user_id text primary key,
  enabled_from date not null default current_date,
  last_analyzed_date date null,
  include_outbound_travel boolean not null default true,
  include_return_travel boolean not null default true,
  include_supplier_time boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gps_work_sessions (
  id uuid primary key,
  user_id text not null,
  work_date date not null,
  address_key text not null,
  address_label text not null,
  quote_id text null,
  candidate_quotes jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'dismissed')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  onsite_minutes integer not null default 0 check (onsite_minutes >= 0),
  outbound_travel_minutes integer not null default 0 check (outbound_travel_minutes >= 0),
  return_travel_minutes integer not null default 0 check (return_travel_minutes >= 0),
  supplier_travel_minutes integer not null default 0 check (supplier_travel_minutes >= 0),
  supplier_stop_minutes integer not null default 0 check (supplier_stop_minutes >= 0),
  supplier_visits jsonb not null default '[]'::jsonb,
  included_minutes integer not null default 0 check (included_minutes >= 0),
  time_entry_id uuid null references public.time_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, work_date, address_key, start_at)
);

create index if not exists idx_gps_work_sessions_user_status_date
  on public.gps_work_sessions (user_id, status, work_date desc);

alter table public.time_entries
  add column if not exists onsite_minutes integer null check (onsite_minutes is null or onsite_minutes >= 0),
  add column if not exists outbound_travel_minutes integer null check (outbound_travel_minutes is null or outbound_travel_minutes >= 0),
  add column if not exists return_travel_minutes integer null check (return_travel_minutes is null or return_travel_minutes >= 0),
  add column if not exists supplier_travel_minutes integer null check (supplier_travel_minutes is null or supplier_travel_minutes >= 0),
  add column if not exists supplier_stop_minutes integer null check (supplier_stop_minutes is null or supplier_stop_minutes >= 0),
  add column if not exists supplier_visits jsonb null,
  add column if not exists gps_work_session_id uuid null references public.gps_work_sessions(id) on delete set null;

alter table public.gps_work_settings enable row level security;
alter table public.gps_work_sessions enable row level security;

drop policy if exists gps_work_settings_user_isolation on public.gps_work_settings;
create policy gps_work_settings_user_isolation on public.gps_work_settings
  for all using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists gps_work_sessions_user_isolation on public.gps_work_sessions;
create policy gps_work_sessions_user_isolation on public.gps_work_sessions
  for all using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);
