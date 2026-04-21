create table if not exists public.supplier_import_preferences (
  gebruikerid text not null,
  supplier_key text not null default 'bouwmaat',
  price_mode text not null default 'excl',
  ai_audit_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (gebruikerid, supplier_key)
);

create index if not exists idx_supplier_import_preferences_user
  on public.supplier_import_preferences (gebruikerid);
