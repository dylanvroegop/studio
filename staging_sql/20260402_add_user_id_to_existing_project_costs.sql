BEGIN;

ALTER TABLE IF EXISTS public.project_costs
  ADD COLUMN IF NOT EXISTS user_id text;

CREATE INDEX IF NOT EXISTS project_costs_user_id_idx
  ON public.project_costs (user_id);

CREATE INDEX IF NOT EXISTS project_costs_user_id_offerte_id_idx
  ON public.project_costs (user_id, offerte_id);

COMMIT;
