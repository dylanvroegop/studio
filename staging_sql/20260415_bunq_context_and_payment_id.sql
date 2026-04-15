create table if not exists public.bunq_context (
  id int primary key default 1,
  client_private_key text not null,
  client_public_key text not null,
  server_public_key text,
  installation_token text,
  device_id bigint,
  session_token text,
  session_expires_at timestamptz,
  user_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bunq_context_single_row check (id = 1)
);

alter table public.bank_transactions
  add column if not exists bunq_payment_id bigint,
  add column if not exists bunq_account_id bigint;

create unique index if not exists idx_bank_transactions_bunq_payment_id_unique
  on public.bank_transactions(bunq_payment_id)
  where bunq_payment_id is not null;

create index if not exists idx_bank_transactions_bunq_account_id
  on public.bank_transactions(bunq_account_id)
  where bunq_account_id is not null;
