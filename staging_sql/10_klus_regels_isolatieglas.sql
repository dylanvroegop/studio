-- Glas zetten regels (Isolatieglas)
-- Source of truth: src/lib/klus-regels-static.ts

WITH input_rows(slug, klus_type, klus_regels) AS (
VALUES
  ('isolatieglas', 'isolatieglas', $kr${
  "meta": {
    "description": "Glas zetten - Isolatieglas",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "isolatieglas",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "ruit_breedte_mm": "maatwerk_item.breedte",
    "ruit_hoogte_mm": "maatwerk_item.hoogte",
    "ruit_area_m2": "(ruit_breedte_mm * ruit_hoogte_mm) / 1000000",
    "ruit_perimeter_m1": "(2 * (ruit_breedte_mm + ruit_hoogte_mm)) / 1000"
  },
  "calculation_rules": {
    "glas": {
      "glas": {
        "sectionKey": "glas",
        "logic": "primair stuk, fallback op dekking/oppervlakte",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if material.eenheid == 'stuk' then aantal = ceil(1 * (1 + waste/100)); else if material.dekking_m2 exists then aantal = ceil((ruit_area_m2 * (1 + waste/100)) / material.dekking_m2); else if material.lengte && material.breedte then plaat_m2 = material.lengte_m * material.breedte_m; aantal = ceil((ruit_area_m2 * (1 + waste/100)) / plaat_m2); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.breedte",
          "maatwerk_item.hoogte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "roosters": {
        "sectionKey": "roosters",
        "logic": "verbruik per ruit of expliciete aantallen",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if material.verbruik_per_ruit || material.verbruik exists then totaal = (material.verbruik_per_ruit ?? material.verbruik) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input",
        "required_inputs": [
          "material.aantal || material.verbruik_per_ruit || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "glaslatten": {
        "sectionKey": "glaslatten",
        "logic": "lineair over ruitomtrek",
        "formula": "lineair_m1 = ruit_perimeter_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.breedte",
          "maatwerk_item.hoogte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    }
  }
}$kr$::jsonb)
),
updated AS (
  UPDATE public.klus_regels kr
  SET
    klus_type = ir.klus_type,
    klus_regels = ir.klus_regels,
    pending_updates = NULL
  FROM input_rows ir
  WHERE kr.klus_regels->>'slug' = ir.slug
  RETURNING ir.slug
)
INSERT INTO public.klus_regels (klus_type, klus_regels, pending_updates)
SELECT ir.klus_type, ir.klus_regels, NULL
FROM input_rows ir
WHERE NOT EXISTS (
  SELECT 1
  FROM public.klus_regels kr
  WHERE kr.klus_regels->>'slug' = ir.slug
);

-- Verificatie: sectionKey-aantal voor isolatieglas.
SELECT
  kr.klus_regels->>'slug' AS slug,
  COUNT(*) FILTER (WHERE rule_obj ? 'sectionKey') AS sectionkey_count
FROM public.klus_regels kr
CROSS JOIN LATERAL jsonb_each(kr.klus_regels->'calculation_rules') AS topcat(top_key, top_val)
CROSS JOIN LATERAL jsonb_each(top_val) AS rule(rule_key, rule_obj)
WHERE kr.klus_regels->>'slug' IN ('isolatieglas')
GROUP BY kr.klus_regels->>'slug';
