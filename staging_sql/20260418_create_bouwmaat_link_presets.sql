create table if not exists public.bouwmaat_link_presets (
  id text primary key,
  gebruikerid text not null,
  name text not null,
  links jsonb not null default '[]'::jsonb,
  max_pages_per_url integer null,
  ai_audit_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bouwmaat_link_presets_user
  on public.bouwmaat_link_presets (gebruikerid);

create unique index if not exists idx_bouwmaat_link_presets_user_name
  on public.bouwmaat_link_presets (gebruikerid, name);
