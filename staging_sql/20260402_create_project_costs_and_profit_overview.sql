BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.project_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  offerte_id text,
  category text NOT NULL,
  supplier_name text NOT NULL,
  description text NOT NULL,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  amount_excl_btw numeric(10,2) NOT NULL DEFAULT 0,
  btw_percentage numeric(5,2) NOT NULL DEFAULT 21,
  btw_amount numeric(10,2) NOT NULL DEFAULT 0,
  amount_incl_btw numeric(10,2) NOT NULL DEFAULT 0,
  date date NOT NULL,
  receipt_url text,
  status text NOT NULL DEFAULT 'confirmed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_costs_category_chk CHECK (category IN ('materiaal', 'brandstof', 'gereedschap', 'overig')),
  CONSTRAINT project_costs_line_items_array_chk CHECK (jsonb_typeof(line_items) = 'array')
);

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

CREATE TABLE IF NOT EXISTS public.profit_overview (
  offerte_id text PRIMARY KEY,
  quoted_price numeric(10,2) NOT NULL DEFAULT 0,
  total_material_cost numeric(10,2) NOT NULL DEFAULT 0,
  total_fuel_cost numeric(10,2) NOT NULL DEFAULT 0,
  total_tool_cost numeric(10,2) NOT NULL DEFAULT 0,
  total_other_cost numeric(10,2) NOT NULL DEFAULT 0,
  total_labor_cost numeric(10,2) NOT NULL DEFAULT 0,
  total_costs numeric(10,2) NOT NULL DEFAULT 0,
  profit numeric(10,2) NOT NULL DEFAULT 0,
  margin_pct numeric(5,1) NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profit_overview_last_updated_idx
  ON public.profit_overview (last_updated DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_last_updated_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.last_updated := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_costs_set_updated_at ON public.project_costs;
CREATE TRIGGER trg_project_costs_set_updated_at
  BEFORE UPDATE ON public.project_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_profit_overview_set_last_updated ON public.profit_overview;
CREATE TRIGGER trg_profit_overview_set_last_updated
  BEFORE UPDATE ON public.profit_overview
  FOR EACH ROW
  EXECUTE FUNCTION public.set_last_updated_timestamp();

ALTER TABLE public.project_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_costs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.profit_overview ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_overview FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_costs_service_role_all ON public.project_costs;
CREATE POLICY project_costs_service_role_all
  ON public.project_costs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS profit_overview_service_role_all ON public.profit_overview;
CREATE POLICY profit_overview_service_role_all
  ON public.profit_overview
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'receipts',
      'receipts',
      true,
      15728640,
      ARRAY[
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif'
      ]
    )
    ON CONFLICT (id) DO NOTHING;

    UPDATE storage.buckets
    SET
      public = true,
      file_size_limit = 15728640,
      allowed_mime_types = ARRAY[
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif'
      ]
    WHERE id = 'receipts';

    DROP POLICY IF EXISTS receipts_service_role_all ON storage.objects;
    CREATE POLICY receipts_service_role_all
      ON storage.objects
      FOR ALL
      TO service_role
      USING (bucket_id = 'receipts')
      WITH CHECK (bucket_id = 'receipts');
  END IF;
END
$$;

COMMIT;
