-- Stores free-form AI follow-up answers (e.g. set composition details)
-- so they are not lost in only the materiaalnaam.
ALTER TABLE public.main_material_list
  ADD COLUMN IF NOT EXISTS ai_extra_data jsonb;

COMMENT ON COLUMN public.main_material_list.ai_extra_data IS
  'Vrije AI metadata, zoals safety_answers en extra productomschrijving.';
