-- Preserve the existing material catalog for historical quote references while
-- hiding it from normal catalog reads. New materials are active by default.
ALTER TABLE public.main_material_list
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE public.main_material_list
SET is_active = false
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_main_material_list_user_active
  ON public.main_material_list (gebruikerid, is_active);

COMMENT ON COLUMN public.main_material_list.is_active IS
  'Active rows are shown in the current material catalog; inactive rows remain available for historical quote references.';
