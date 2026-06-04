BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_costs'
      AND column_name = 'offerte_id'
  ) THEN
    ALTER TABLE public.project_costs
      ALTER COLUMN offerte_id DROP NOT NULL;
  END IF;
END
$$;

COMMIT;
