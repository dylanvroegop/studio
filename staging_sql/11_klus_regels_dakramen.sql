-- Dakramen regels (Diverse dakramen / Velux dakraam)
-- Source of truth: src/lib/klus-regels-static.ts

WITH input_rows(slug, klus_type, klus_regels) AS (
VALUES
  ('velux-dakraam', 'velux-dakraam', $kr${
  "meta": {
    "description": "Dakramen - Diverse dakramen (Velux)",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "velux-dakraam",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "window_width_mm": "maatwerk_item.breedte",
    "window_height_mm": "maatwerk_item.hoogte",
    "window_count": "maatwerk_item.aantal",
    "window_area_m2": "(window_width_mm * window_height_mm) / 1000000",
    "window_total_area_m2": "window_area_m2 * window_count",
    "window_perimeter_m1": "(2 * (window_width_mm + window_height_mm)) / 1000"
  },
  "calculation_rules": {
    "vensterset": {
      "vensterset_compleet": {
        "sectionKey": "vensterset_compleet",
        "logic": "complete set per dakraam",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else aantal = ceil(window_count)",
        "required_inputs": [
          "maatwerk_item.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "venster": {
      "venster_los": {
        "sectionKey": "venster_los",
        "logic": "los venster per dakraam",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else aantal = ceil(window_count)",
        "required_inputs": [
          "maatwerk_item.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "gootstuk": {
      "gootstuk": {
        "sectionKey": "gootstuk",
        "logic": "stuk-per-raam of lineair op raamomtrek",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else if material.eenheid == 'stuk' then aantal = ceil(window_count); else if material.lengte exists then lineair_m1 = (window_perimeter_m1 * window_count); aantal = ceil((lineair_m1) / material.lengte_m); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.breedte",
          "maatwerk_item.hoogte",
          "maatwerk_item.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "afwerking": {
      "betimmering": {
        "sectionKey": "betimmering",
        "logic": "aftimmering op totaal opening-oppervlak",
        "formula": "if material.lengte && material.breedte then plaat_m2 = material.lengte_m * material.breedte_m; aantal = ceil((window_total_area_m2) / plaat_m2); else if material.aantal exists then aantal = ceil(material.aantal); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.breedte",
          "maatwerk_item.hoogte",
          "maatwerk_item.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "plinten": {
        "sectionKey": "plinten",
        "logic": "lineair over omtrek van alle dakramen",
        "formula": "lineair_m1 = window_perimeter_m1 * window_count; aantal = ceil((lineair_m1) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.breedte",
          "maatwerk_item.hoogte",
          "maatwerk_item.aantal",
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

-- Verificatie: sectionKey-aantal voor velux-dakraam.
SELECT
  kr.klus_regels->>'slug' AS slug,
  COUNT(*) FILTER (WHERE rule_obj ? 'sectionKey') AS sectionkey_count
FROM public.klus_regels kr
CROSS JOIN LATERAL jsonb_each(kr.klus_regels->'calculation_rules') AS topcat(top_key, top_val)
CROSS JOIN LATERAL jsonb_each(top_val) AS rule(rule_key, rule_obj)
WHERE kr.klus_regels->>'slug' IN ('velux-dakraam')
GROUP BY kr.klus_regels->>'slug';
