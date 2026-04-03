BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.project_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE public.project_costs
  ADD COLUMN IF NOT EXISTS user_id text,
  ADD COLUMN IF NOT EXISTS offerte_id text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS supplier_name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS line_items jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS amount_excl_btw numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS btw_percentage numeric(5,2) DEFAULT 21,
  ADD COLUMN IF NOT EXISTS btw_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_incl_btw numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.project_costs
SET
  line_items = COALESCE(line_items, '[]'::jsonb),
  amount_excl_btw = COALESCE(amount_excl_btw, 0),
  btw_percentage = COALESCE(btw_percentage, 21),
  btw_amount = COALESCE(btw_amount, 0),
  amount_incl_btw = COALESCE(amount_incl_btw, 0),
  date = COALESCE(date, CURRENT_DATE),
  status = COALESCE(NULLIF(status, ''), 'confirmed'),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now());

ALTER TABLE public.project_costs
  ALTER COLUMN line_items SET DEFAULT '[]'::jsonb,
  ALTER COLUMN amount_excl_btw SET DEFAULT 0,
  ALTER COLUMN btw_percentage SET DEFAULT 21,
  ALTER COLUMN btw_amount SET DEFAULT 0,
  ALTER COLUMN amount_incl_btw SET DEFAULT 0,
  ALTER COLUMN date SET DEFAULT CURRENT_DATE,
  ALTER COLUMN status SET DEFAULT 'confirmed',
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS project_costs_user_id_idx
  ON public.project_costs (user_id);

CREATE INDEX IF NOT EXISTS project_costs_offerte_id_idx
  ON public.project_costs (offerte_id);

CREATE INDEX IF NOT EXISTS project_costs_user_id_offerte_id_idx
  ON public.project_costs (user_id, offerte_id);

CREATE INDEX IF NOT EXISTS project_costs_date_idx
  ON public.project_costs (date DESC);

CREATE INDEX IF NOT EXISTS project_costs_category_idx
  ON public.project_costs (category);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_costs_category_chk'
      AND conrelid = 'public.project_costs'::regclass
  ) THEN
    ALTER TABLE public.project_costs
      ADD CONSTRAINT project_costs_category_chk
      CHECK (category IN ('materiaal', 'brandstof', 'gereedschap', 'overig')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_costs_line_items_array_chk'
      AND conrelid = 'public.project_costs'::regclass
  ) THEN
    ALTER TABLE public.project_costs
      ADD CONSTRAINT project_costs_line_items_array_chk
      CHECK (jsonb_typeof(line_items) = 'array') NOT VALID;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_costs_set_updated_at ON public.project_costs;
CREATE TRIGGER trg_project_costs_set_updated_at
  BEFORE UPDATE ON public.project_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

ALTER TABLE public.project_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_costs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_costs_service_role_all ON public.project_costs;
CREATE POLICY project_costs_service_role_all
  ON public.project_costs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
