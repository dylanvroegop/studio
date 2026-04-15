create extension if not exists pgcrypto;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bank_connections'
      and column_name = 'user_id'
      and data_type <> 'uuid'
  ) then
    alter table public.bank_connections
      alter column user_id type uuid
      using (
        (
          substr(md5(coalesce(user_id::text, '')), 1, 8) || '-' ||
          substr(md5(coalesce(user_id::text, '')), 9, 4) || '-4' ||
          substr(md5(coalesce(user_id::text, '')), 14, 3) || '-' ||
          substr('89ab', (get_byte(decode(substr(md5(coalesce(user_id::text, '')), 17, 2), 'hex'), 0) % 4) + 1, 1) ||
          substr(md5(coalesce(user_id::text, '')), 19, 3) || '-' ||
          substr(md5(coalesce(user_id::text, '')), 22, 12)
        )::uuid
      );
  end if;
end $$;

create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null default 'gocardless',
  institution_id text not null,
  institution_name text,
  requisition_id text unique,
  agreement_id text,
  status text not null default 'pending',
  reference text,
  linked_account_ids jsonb not null default '[]'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bank_connections
  add column if not exists institution_id text,
  add column if not exists agreement_id text,
  add column if not exists reference text,
  add column if not exists linked_account_ids jsonb not null default '[]'::jsonb;

update public.bank_connections
set linked_account_ids = coalesce(linked_account_ids, '[]'::jsonb)
where linked_account_ids is null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bank_connections'
      and column_name = 'accounts'
  ) then
    execute $migrate_accounts$
      update public.bank_connections
      set linked_account_ids = coalesce(accounts, '[]'::jsonb)
      where linked_account_ids = '[]'::jsonb
    $migrate_accounts$;
  end if;
end $$;

alter table public.bank_connections
  alter column provider set default 'gocardless',
  alter column status set default 'pending';

create index if not exists idx_bank_connections_user_id on public.bank_connections(user_id);
create index if not exists idx_bank_connections_requisition_id on public.bank_connections(requisition_id);

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.bank_connections(id) on delete cascade,
  external_account_id text unique not null,
  iban text,
  name text,
  currency text,
  owner_name text,
  product text,
  cash_account_type text,
  status text default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bank_accounts_connection_id on public.bank_accounts(connection_id);

create table if not exists public.bank_balances (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  balance_type text,
  amount numeric(14,2),
  currency text,
  reference_date date,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_bank_balances_account_id on public.bank_balances(bank_account_id);
create index if not exists idx_bank_balances_reference_date on public.bank_balances(reference_date);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  external_transaction_id text,
  booking_date date,
  value_date date,
  amount numeric(14,2) not null,
  currency text not null,
  direction text not null,
  counterparty_name text,
  counterparty_iban text,
  remittance_information text,
  internal_transaction_id text,
  status text,
  raw jsonb,
  hash text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bank_transactions
  add column if not exists bank_account_id uuid references public.bank_accounts(id) on delete cascade,
  add column if not exists external_transaction_id text,
  add column if not exists booking_date date,
  add column if not exists value_date date,
  add column if not exists counterparty_iban text,
  add column if not exists remittance_information text,
  add column if not exists internal_transaction_id text,
  add column if not exists hash text;

create unique index if not exists idx_bank_transactions_hash_unique on public.bank_transactions(hash);
create index if not exists idx_bank_transactions_account_date on public.bank_transactions(bank_account_id, booking_date desc);

alter table public.bank_connections enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.bank_balances enable row level security;
alter table public.bank_transactions enable row level security;

drop policy if exists bank_connections_owner_read on public.bank_connections;
drop policy if exists bank_connections_owner_write on public.bank_connections;
create policy bank_connections_owner_read
  on public.bank_connections for select
  using (auth.uid() = user_id);
create policy bank_connections_owner_write
  on public.bank_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists bank_accounts_owner_read on public.bank_accounts;
drop policy if exists bank_accounts_owner_write on public.bank_accounts;
create policy bank_accounts_owner_read
  on public.bank_accounts for select
  using (
    exists (
      select 1
      from public.bank_connections bc
      where bc.id = bank_accounts.connection_id
        and bc.user_id = auth.uid()
    )
  );
create policy bank_accounts_owner_write
  on public.bank_accounts for all
  using (
    exists (
      select 1
      from public.bank_connections bc
      where bc.id = bank_accounts.connection_id
        and bc.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.bank_connections bc
      where bc.id = bank_accounts.connection_id
        and bc.user_id = auth.uid()
    )
  );

drop policy if exists bank_balances_owner_read on public.bank_balances;
drop policy if exists bank_balances_owner_write on public.bank_balances;
create policy bank_balances_owner_read
  on public.bank_balances for select
  using (
    exists (
      select 1
      from public.bank_accounts ba
      join public.bank_connections bc on bc.id = ba.connection_id
      where ba.id = bank_balances.bank_account_id
        and bc.user_id = auth.uid()
    )
  );
create policy bank_balances_owner_write
  on public.bank_balances for all
  using (
    exists (
      select 1
      from public.bank_accounts ba
      join public.bank_connections bc on bc.id = ba.connection_id
      where ba.id = bank_balances.bank_account_id
        and bc.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.bank_accounts ba
      join public.bank_connections bc on bc.id = ba.connection_id
      where ba.id = bank_balances.bank_account_id
        and bc.user_id = auth.uid()
    )
  );

drop policy if exists bank_transactions_owner_read on public.bank_transactions;
drop policy if exists bank_transactions_owner_write on public.bank_transactions;
create policy bank_transactions_owner_read
  on public.bank_transactions for select
  using (
    exists (
      select 1
      from public.bank_accounts ba
      join public.bank_connections bc on bc.id = ba.connection_id
      where ba.id = bank_transactions.bank_account_id
        and bc.user_id = auth.uid()
    )
  );
create policy bank_transactions_owner_write
  on public.bank_transactions for all
  using (
    exists (
      select 1
      from public.bank_accounts ba
      join public.bank_connections bc on bc.id = ba.connection_id
      where ba.id = bank_transactions.bank_account_id
        and bc.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.bank_accounts ba
      join public.bank_connections bc on bc.id = ba.connection_id
      where ba.id = bank_transactions.bank_account_id
        and bc.user_id = auth.uid()
    )
  );
