create extension if not exists pgcrypto;

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  quote_id text null,
  work_date date not null,
  worked_hours numeric(6,2) not null check (worked_hours >= 0 and worked_hours <= 24),
  quoted_hours numeric(6,2) null check (quoted_hours >= 0 and quoted_hours <= 24),
  source text not null,
  note text null,
  start_time text null,
  end_time text null,
  break_duration_minutes integer null check (break_duration_minutes is null or break_duration_minutes >= 0),
  exact_minutes integer null check (exact_minutes is null or exact_minutes >= 0),
  rounding_rule text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_time_entries_user_date
  on public.time_entries (user_id, work_date desc);

create index if not exists idx_time_entries_user_quote_date
  on public.time_entries (user_id, quote_id, work_date desc);

create table if not exists public.time_entry_prompt_state (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  prompt_key text not null,
  quote_id text not null,
  work_date date not null,
  action text not null check (action in ('later', 'not_worked')),
  snooze_until timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, prompt_key)
);

create index if not exists idx_time_entry_prompt_state_user_work_date
  on public.time_entry_prompt_state (user_id, work_date desc);

alter table public.time_entries enable row level security;
alter table public.time_entry_prompt_state enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'time_entries'
      and policyname = 'time_entries_user_isolation'
  ) then
    create policy time_entries_user_isolation
      on public.time_entries
      for all
      using (auth.uid()::text = user_id)
      with check (auth.uid()::text = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'time_entry_prompt_state'
      and policyname = 'time_entry_prompt_state_user_isolation'
  ) then
    create policy time_entry_prompt_state_user_isolation
      on public.time_entry_prompt_state
      for all
      using (auth.uid()::text = user_id)
      with check (auth.uid()::text = user_id);
  end if;
end $$;
