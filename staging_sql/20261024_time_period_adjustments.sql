create table public.time_period_adjustments (
id uuid primary key default gen_random_uuid(),
user_id text not null,
start_date date not null,
end_date date not null check (end_date >= start_date),
minutes integer not null check (minutes > 0),
note text,
worked_days integer check (worked_days > 0),
created_at timestamptz not null default now()
);
alter table public.time_period_adjustments enable row level security;
revoke all on public.time_period_adjustments from anon, authenticated;
grant all on public.time_period_adjustments to service_role;
create index time_period_adjustments_user_period on public.time_period_adjustments(user_id, start_date, end_date);
