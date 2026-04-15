drop index if exists public.idx_bank_transactions_bunq_payment_id_unique;

create index if not exists idx_bank_transactions_bunq_payment_id
  on public.bank_transactions(bunq_payment_id)
  where bunq_payment_id is not null;
