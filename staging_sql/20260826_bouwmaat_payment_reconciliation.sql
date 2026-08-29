-- Bouwmaat payment state and split-invoice reconciliation.
-- Additive migration: existing imported costs remain valid and are marked unknown
-- until they are re-imported or explicitly enriched.

ALTER TABLE public.project_costs
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS supplier_invoice_number text,
  ADD COLUMN IF NOT EXISTS reconciliation_group_id text,
  ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'unmatched',
  ADD COLUMN IF NOT EXISTS paid_bank_transaction_id text,
  ADD COLUMN IF NOT EXISTS paid_at date,
  ADD COLUMN IF NOT EXISTS source_email text,
  ADD COLUMN IF NOT EXISTS source_filename text;

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS reconciliation_group_id text,
  ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'unmatched';

CREATE INDEX IF NOT EXISTS project_costs_bouwmaat_payment_idx
  ON public.project_costs (user_id, supplier_name, payment_type, payment_status, due_date);

CREATE INDEX IF NOT EXISTS project_costs_reconciliation_group_idx
  ON public.project_costs (user_id, reconciliation_group_id);

CREATE INDEX IF NOT EXISTS bank_transactions_reconciliation_group_idx
  ON public.bank_transactions (user_id, reconciliation_group_id, reconciliation_status);
