create table if not exists public.bank_transaction_category_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  bank_transaction_id uuid not null references public.bank_transactions(id) on delete cascade,
  category text not null check (category in (
    'materiaal',
    'autokosten',
    'boetes',
    'schulden',
    'afval',
    'brandstof',
    'gereedschap',
    'eigen_verbruik',
    'hotel',
    'telefoon',
    'leadkosten',
    'overig'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, bank_transaction_id)
);

create index if not exists bank_transaction_category_overrides_user_idx
  on public.bank_transaction_category_overrides (user_id);

alter table public.bank_transaction_category_overrides enable row level security;

comment on table public.bank_transaction_category_overrides is
  'Manual category choices for Knab cost-ledger rows. The bank transaction amount remains authoritative.';
