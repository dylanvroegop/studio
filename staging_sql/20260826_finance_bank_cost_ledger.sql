create table if not exists public.finance_bank_costs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  bank_transaction_id uuid not null references public.bank_transactions(id) on delete cascade,
  booking_date date,
  supplier_name text not null default '',
  description text not null default '',
  amount numeric(14,2) not null check (amount >= 0),
  category text not null default 'overig',
  is_private boolean not null default false,
  source_cost_ids jsonb not null default '[]'::jsonb,
  source_amount numeric(14,2) not null default 0,
  source_delta numeric(14,2) not null default 0,
  match_status text not null default 'unmatched',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, bank_transaction_id)
);

create index if not exists finance_bank_costs_user_date_idx
  on public.finance_bank_costs (user_id, booking_date desc);
create index if not exists finance_bank_costs_user_category_idx
  on public.finance_bank_costs (user_id, category);
create index if not exists finance_bank_costs_user_status_idx
  on public.finance_bank_costs (user_id, match_status);

alter table public.finance_bank_costs enable row level security;

comment on table public.finance_bank_costs is
  'Exact cash-cost ledger derived one-for-one from bank debits. Invoice/receipt rows are supporting evidence only.';
