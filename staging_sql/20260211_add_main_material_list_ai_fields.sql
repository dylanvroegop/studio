-- Adds AI-related material fields used in the n8n upsert flow.
-- NOTE:
-- - Requested names: werkende_breedte_maat, werkende_hoogte_maat, verbruik_per_m2
-- - Compatibility names used by existing calculation logic: werkende_breedte_mm, werkende_hoogte_mm

ALTER TABLE public.main_material_list
  ADD COLUMN IF NOT EXISTS werkende_breedte_maat numeric,
  ADD COLUMN IF NOT EXISTS werkende_hoogte_maat numeric,
  ADD COLUMN IF NOT EXISTS verbruik_per_m2 numeric,
  ADD COLUMN IF NOT EXISTS werkende_breedte_mm numeric,
  ADD COLUMN IF NOT EXISTS werkende_hoogte_mm numeric;

UPDATE public.main_material_list
SET
  werkende_breedte_mm = COALESCE(werkende_breedte_mm, werkende_breedte_maat),
  werkende_hoogte_mm = COALESCE(werkende_hoogte_mm, werkende_hoogte_maat)
WHERE
  werkende_breedte_mm IS NULL
  OR werkende_hoogte_mm IS NULL;
