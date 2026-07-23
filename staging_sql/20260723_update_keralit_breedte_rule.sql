-- Keralit gevelpanelen must use the material's breedte as working width.
-- Never fall back to an m2 calculation when breedte is missing.
UPDATE public.klus_regels
SET klus_regels = jsonb_set(
  jsonb_set(
    jsonb_set(
      klus_regels,
      '{calculation_rules,bekleding,gevelbekleding_kunststof,logic}',
      to_jsonb('Keralit-panelen op vaste werkende breedte uit material.breedte; zonder m2-fallback'::text),
      false
    ),
    '{calculation_rules,bekleding,gevelbekleding_kunststof,formula}',
    to_jsonb('if material.breedte exists then if maatwerk_item.keralit_panelen_orientation == ''vertical'' then banen = ceil(gevel_lengte_mm / material.breedte); if maatwerk_item.keralit_panelen_afval_volgende_baan == true then totaal_banen_mm = banen * gevel_hoogte_mm; stuks = ceil(totaal_banen_mm / material.lengte); else segmenten_per_baan = ceil(gevel_hoogte_mm / material.lengte); stuks = banen * segmenten_per_baan; else rows = ceil(gevel_hoogte_mm / material.breedte); cols = ceil(gevel_lengte_mm / material.lengte); stuks = rows * cols; aantal = ceil(stuks); else requires_manual_input and return error; never use m2, dekking_m2 or area fallback'::text),
    false
  ),
  '{calculation_rules,bekleding,gevelbekleding_kunststof,required_inputs}',
  '["maatwerk_item.lengte", "maatwerk_item.hoogte", "material.lengte", "material.breedte"]'::jsonb,
  false
)
WHERE klus_type = 'gevelbekleding-keralit';
