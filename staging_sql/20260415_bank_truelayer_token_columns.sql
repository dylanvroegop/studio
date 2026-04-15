alter table public.bank_connections
  add column if not exists access_token text,
  add column if not exists refresh_token text,
  add column if not exists access_token_expires_at timestamptz;

alter table public.bank_connections
  alter column provider set default 'truelayer';

create index if not exists idx_bank_connections_user_institution
  on public.bank_connections(user_id, institution_id);
