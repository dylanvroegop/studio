create table public.vision_workspaces (
  user_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.vision_workspaces enable row level security;
revoke all on public.vision_workspaces from public, anon, authenticated;
grant select, insert, update on public.vision_workspaces to service_role;
