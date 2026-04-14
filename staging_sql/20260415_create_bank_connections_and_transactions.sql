create extension if not exists pgcrypto;

create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  provider text not null default 'gocardless',
  link_ref text not null unique,
  requisition_id text not null unique,
  institution_id text not null,
  institution_name text,
  status text not null default 'pending' check (status in ('pending', 'linked', 'connected', 'error', 'revoked')),
  accounts jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bank_connections_user_id on public.bank_connections(user_id);
create index if not exists idx_bank_connections_status on public.bank_connections(status);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  external_id text not null,
  source text not null default 'bank_transactions',
  connection_id uuid references public.bank_connections(id) on delete set null,
  account_id text,
  description text not null default '',
  counterparty_name text,
  amount numeric(12,2) not null default 0,
  currency text not null default 'EUR',
  direction text not null default 'debit' check (direction in ('debit', 'credit')),
  booked_at timestamptz not null,
  category text not null default 'overig',
  linked_cost_id text,
  status text not null default 'new' check (status in ('new', 'processed', 'ignored')),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, external_id)
);

create index if not exists idx_bank_transactions_user_booked_at on public.bank_transactions(user_id, booked_at desc);
create index if not exists idx_bank_transactions_connection on public.bank_transactions(connection_id);

