create extension if not exists pgcrypto;

create table if not exists public.tracking_positions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  device_id text not null,
  latitude numeric(10, 7) not null check (latitude >= -90 and latitude <= 90),
  longitude numeric(10, 7) not null check (longitude >= -180 and longitude <= 180),
  accuracy_m numeric(10, 2) null check (accuracy_m is null or accuracy_m >= 0),
  speed_kmh numeric(10, 2) null check (speed_kmh is null or speed_kmh >= 0),
  recorded_at timestamptz not null,
  source text not null default 'test',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_tracking_positions_user_recorded_at
  on public.tracking_positions (user_id, recorded_at desc);

create index if not exists idx_tracking_positions_user_device_recorded_at
  on public.tracking_positions (user_id, device_id, recorded_at desc);

alter table public.tracking_positions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tracking_positions'
      and policyname = 'tracking_positions_user_isolation'
  ) then
    create policy tracking_positions_user_isolation
      on public.tracking_positions
      for all
      using (auth.uid()::text = user_id)
      with check (auth.uid()::text = user_id);
  end if;
end $$;
