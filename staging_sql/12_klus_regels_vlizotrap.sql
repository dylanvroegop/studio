-- Vlizotrappen regels (Zoldertrappen & vlizotrappen)
-- Source of truth: src/lib/klus-regels-static.ts

WITH input_rows(slug, klus_type, klus_regels) AS (
VALUES
  ('vlizotrap', 'vlizotrap', $kr${
  "meta": {
    "description": "Vlizotrappen - Zoldertrappen & vlizotrappen",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "vlizotrap",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "trap_lengte_mm": "maatwerk_item.lengte",
    "trap_hoogte_mm": "maatwerk_item.hoogte",
    "trap_perimeter_m1": "(2 * (trap_lengte_mm + trap_hoogte_mm)) / 1000",
    "trap_area_m2": "(trap_lengte_mm * trap_hoogte_mm) / 1000000"
  },
  "calculation_rules": {
    "hout": {
      "balken": {
        "sectionKey": "balken",
        "logic": "raveling rondom trapopening",
        "formula": "lineair_m1 = trap_perimeter_m1; aantal = ceil((lineair_m1) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "basis": {
      "trap": {
        "sectionKey": "trap",
        "logic": "complete trapset per trapopening of expliciete materiaalhoeveelheid",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else if trap_lengte_mm && trap_hoogte_mm then aantal = ceil(1); else requires_manual_input",
        "required_inputs": [
          "material.aantal || (maatwerk_item.lengte && maatwerk_item.hoogte)"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "luik": {
        "sectionKey": "luik",
        "logic": "zolderluik per trapopening of expliciete materiaalhoeveelheid",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else if trap_lengte_mm && trap_hoogte_mm then aantal = ceil(1); else requires_manual_input",
        "required_inputs": [
          "material.aantal || (maatwerk_item.lengte && maatwerk_item.hoogte)"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "veiligheid": {
      "traphek": {
        "sectionKey": "traphek",
        "logic": "veiligheidshek op expliciet aantal, verbruik-per-meter of lineair over opening",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else if material.verbruik_per_m1 || material.verbruik exists then totaal = trap_perimeter_m1 * (material.verbruik_per_m1 ?? material.verbruik); aantal = ceil(totaal); else if material.lengte exists then lineair_m1 = trap_perimeter_m1; aantal = ceil((lineair_m1) / material.lengte_m); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "material.aantal || material.verbruik_per_m1 || material.verbruik || material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "poortje": {
        "sectionKey": "poortje",
        "logic": "veiligheidspoort op expliciet aantal of verbruik-per-set",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else if material.verbruik_per_set || material.verbruik exists then totaal = (material.verbruik_per_set ?? material.verbruik); aantal = ceil(totaal); else if trap_lengte_mm && trap_hoogte_mm then aantal = ceil(1); else requires_manual_input",
        "required_inputs": [
          "material.aantal || material.verbruik_per_set || material.verbruik || (maatwerk_item.lengte && maatwerk_item.hoogte)"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "beslag": {
      "scharnieren": {
        "sectionKey": "scharnieren",
        "logic": "beslag op expliciet aantal of verbruik-per-set",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else if material.verbruik_per_set || material.verbruik exists then totaal = (material.verbruik_per_set ?? material.verbruik); aantal = ceil(totaal); else requires_manual_input",
        "required_inputs": [
          "material.aantal || material.verbruik_per_set || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "sluiting": {
        "sectionKey": "sluiting",
        "logic": "beslag op expliciet aantal of verbruik-per-set",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else if material.verbruik_per_set || material.verbruik exists then totaal = (material.verbruik_per_set ?? material.verbruik); aantal = ceil(totaal); else requires_manual_input",
        "required_inputs": [
          "material.aantal || material.verbruik_per_set || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "veer": {
        "sectionKey": "veer",
        "logic": "beslag op expliciet aantal of verbruik-per-set",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else if material.verbruik_per_set || material.verbruik exists then totaal = (material.verbruik_per_set ?? material.verbruik); aantal = ceil(totaal); else requires_manual_input",
        "required_inputs": [
          "material.aantal || material.verbruik_per_set || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "handgreep": {
        "sectionKey": "handgreep",
        "logic": "beslag op expliciet aantal of verbruik-per-set",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else if material.verbruik_per_set || material.verbruik exists then totaal = (material.verbruik_per_set ?? material.verbruik); aantal = ceil(totaal); else requires_manual_input",
        "required_inputs": [
          "material.aantal || material.verbruik_per_set || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "afwerking": {
      "architraaf": {
        "sectionKey": "architraaf",
        "logic": "koplatten lineair over omtrek van trapopening",
        "formula": "lineair_m1 = trap_perimeter_m1; aantal = ceil((lineair_m1) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.lengte",
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

-- Verificatie: vlizotrap moet 10 sectionKeys hebben.
SELECT
  kr.klus_regels->>'slug' AS slug,
  COUNT(*) FILTER (WHERE rule_obj ? 'sectionKey') AS sectionkey_count
FROM public.klus_regels kr
CROSS JOIN LATERAL jsonb_each(kr.klus_regels->'calculation_rules') AS topcat(top_key, top_val)
CROSS JOIN LATERAL jsonb_each(top_val) AS rule(rule_key, rule_obj)
WHERE kr.klus_regels->>'slug' = 'vlizotrap'
GROUP BY kr.klus_regels->>'slug';
