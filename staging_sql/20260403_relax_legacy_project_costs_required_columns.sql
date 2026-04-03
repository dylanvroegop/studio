BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_costs'
      AND column_name = 'supplier_order_number'
  ) THEN
    ALTER TABLE public.project_costs
      ALTER COLUMN supplier_order_number DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_costs'
      AND column_name = 'order_number'
  ) THEN
    ALTER TABLE public.project_costs
      ALTER COLUMN order_number DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_costs'
      AND column_name = 'supplier_invoice_number'
  ) THEN
    ALTER TABLE public.project_costs
      ALTER COLUMN supplier_invoice_number DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_costs'
      AND column_name = 'invoice_number'
  ) THEN
    ALTER TABLE public.project_costs
      ALTER COLUMN invoice_number DROP NOT NULL;
  END IF;
END
$$;

COMMIT;
