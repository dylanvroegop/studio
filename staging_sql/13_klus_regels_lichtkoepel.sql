-- Lichtkoepel regels (Diverse lichtkoepels)
-- Source of truth: src/lib/klus-regels-static.ts

WITH input_rows(slug, klus_type, klus_regels) AS (
VALUES
  ('lichtkoepel', 'lichtkoepel', $kr${
  "meta": {
    "description": "Lichtkoepel - Diverse lichtkoepels",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "lichtkoepel",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "unit_width_mm": "maatwerk_item.breedte",
    "unit_height_mm": "maatwerk_item.hoogte",
    "unit_count": "maatwerk_item.aantal",
    "opening_area_m2": "(unit_width_mm * unit_height_mm) / 1000000",
    "total_opening_area_m2": "opening_area_m2 * unit_count",
    "opening_perimeter_m1": "(2 * (unit_width_mm + unit_height_mm)) / 1000",
    "total_perimeter_m1": "opening_perimeter_m1 * unit_count"
  },
  "calculation_rules": {
    "koepel": {
      "koepel": {
        "sectionKey": "koepel",
        "logic": "koepel per opening of expliciete materiaalhoeveelheid",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else aantal = ceil(unit_count * (1 + waste/100))",
        "required_inputs": [
          "maatwerk_item.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "opstand": {
      "opstand": {
        "sectionKey": "opstand",
        "logic": "prefab opstand per opening; fallback lineair op omtrek",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if material.eenheid == 'stuk' then aantal = ceil(unit_count * (1 + waste/100)); else if material.lengte exists then lineair_m1 = total_perimeter_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.aantal || material.aantal || material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "afwerking_dak": {
      "dakbedekking": {
        "sectionKey": "dakbedekking",
        "logic": "oppervlakte op totale koepel-openingen",
        "formula": "if material.dekking_m2 exists then aantal = ceil((total_opening_area_m2 * (1 + waste/100)) / material.dekking_m2); else if material.lengte && material.breedte then dekkings_m2 = material.lengte_m * material.breedte_m; aantal = ceil((total_opening_area_m2 * (1 + waste/100)) / dekkings_m2); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input",
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
        "logic": "aftimmering op oppervlakte of lineair omtrek",
        "formula": "if material.lengte && material.breedte then plaat_m2 = material.lengte_m * material.breedte_m; aantal = ceil((total_opening_area_m2 * (1 + waste/100)) / plaat_m2); else if material.lengte exists then lineair_m1 = total_perimeter_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input",
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
        "logic": "lineair over omtrek van alle lichtkoepel-openingen",
        "formula": "lineair_m1 = total_perimeter_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
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

-- Verificatie: lichtkoepel moet 5 sectionKeys hebben.
SELECT
  kr.klus_regels->>'slug' AS slug,
  COUNT(*) FILTER (WHERE rule_obj ? 'sectionKey') AS sectionkey_count
FROM public.klus_regels kr
CROSS JOIN LATERAL jsonb_each(kr.klus_regels->'calculation_rules') AS topcat(top_key, top_val)
CROSS JOIN LATERAL jsonb_each(top_val) AS rule(rule_key, rule_obj)
WHERE kr.klus_regels->>'slug' = 'lichtkoepel'
GROUP BY kr.klus_regels->>'slug';
