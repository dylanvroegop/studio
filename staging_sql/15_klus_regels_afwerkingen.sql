-- Afwerkingen regels (Plinten, vensterbanken & betimmering)
-- Source of truth: src/lib/klus-regels-static.ts

WITH input_rows(slug, klus_type, klus_regels) AS (
VALUES
  ('plinten-afwerklatten', 'plinten-afwerklatten', $kr${
  "meta": {
    "description": "Afwerkingen - Plinten en afwerklatten",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "plinten-afwerklatten",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "lengte_mm": "maatwerk_item.lengte",
    "hoogte_mm": "maatwerk_item.hoogte"
  },
  "calculation_rules": {
    "plinten": {
      "plinten": {
        "sectionKey": "plinten",
        "logic": "lineair langs opgegeven lengte",
        "formula": "if material.lengte exists then lineair_m1 = lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else if material.dekking_m1 exists then lineair_m1 = lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.dekking_m1); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.lengte",
          "material.lengte || material.dekking_m1 || material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "vloerplinten": {
        "sectionKey": "vloerplinten",
        "logic": "lineair langs opgegeven lengte",
        "formula": "if material.lengte exists then lineair_m1 = lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else if material.dekking_m1 exists then lineair_m1 = lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.dekking_m1); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.lengte",
          "material.lengte || material.dekking_m1 || material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "afwerking": {
      "koplatten": {
        "sectionKey": "koplatten",
        "logic": "lineair op som van lengte + hoogte",
        "formula": "if material.lengte exists then lineair_m1 = (lengte_mm + hoogte_mm) / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "material.lengte || material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    }
  }
}$kr$::jsonb),
  ('vensterbanken', 'vensterbanken', $kr${
  "meta": {
    "description": "Afwerkingen - Vensterbanken",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "vensterbanken",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "opening_width_mm": "maatwerk_item.breedte",
    "opening_height_mm": "maatwerk_item.hoogte",
    "opening_count": "maatwerk_item.aantal",
    "opening_area_m2": "(opening_width_mm * opening_height_mm) / 1000000"
  },
  "calculation_rules": {
    "hout": {
      "frame": {
        "sectionKey": "frame",
        "logic": "regelwerk rondom vensteropening (2x hoogte + 1x breedte) per stuk",
        "formula": "lineair_m1 = (((2 * opening_height_mm) + opening_width_mm) * opening_count) / 1000; if material.lengte exists then aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.breedte",
          "maatwerk_item.hoogte",
          "maatwerk_item.aantal",
          "material.lengte || material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "afwerking": {
      "vensterbank": {
        "sectionKey": "vensterbank",
        "logic": "primair lineair op vensterbankbreedte; fallback op plaatoppervlakte",
        "formula": "lineair_m1 = (opening_width_mm * opening_count) / 1000; if material.lengte exists then aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else if material.lengte && material.breedte then totaal_m2 = opening_area_m2 * opening_count; plaat_m2 = material.lengte_m * material.breedte_m; aantal = ceil((totaal_m2 * (1 + waste/100)) / plaat_m2); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.breedte",
          "maatwerk_item.hoogte",
          "maatwerk_item.aantal",
          "material.lengte || (material.lengte && material.breedte) || material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "roosters": {
        "sectionKey": "roosters",
        "logic": "roosters per vensterbank of expliciete materiaalhoeveelheid",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if material.verbruik_per_stuk || material.verbruik exists then totaal = opening_count * (1 + waste/100) * (material.verbruik_per_stuk ?? material.verbruik); aantal = ceil(totaal); else aantal = ceil(opening_count * (1 + waste/100))",
        "required_inputs": [
          "maatwerk_item.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "behandeling": {
        "sectionKey": "behandeling",
        "logic": "behandeling op verbruik-per-m2 of expliciete materiaalhoeveelheid",
        "formula": "if material.verbruik_per_m2 || material.verbruik exists then totaal = (opening_area_m2 * opening_count) * (1 + waste/100) * (material.verbruik_per_m2 ?? material.verbruik); else if material.dekking_m2 exists then totaal = ceil(((opening_area_m2 * opening_count) * (1 + waste/100)) / material.dekking_m2); else if material.aantal exists then totaal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input",
        "pack_handling": "if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)",
        "required_inputs": [
          "maatwerk_item.breedte",
          "maatwerk_item.hoogte",
          "maatwerk_item.aantal",
          "material.verbruik_per_m2 || material.verbruik || material.dekking_m2 || material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    }
  }
}$kr$::jsonb),
  ('dagkanten', 'dagkanten', $kr${
  "meta": {
    "description": "Afwerkingen - Dagkanten (betimmering rondom kozijnen)",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "dagkanten",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "opening_width_mm": "maatwerk_item.breedte",
    "opening_height_mm": "maatwerk_item.hoogte",
    "opening_count": "maatwerk_item.aantal"
  },
  "calculation_rules": {
    "hout": {
      "frame": {
        "sectionKey": "frame",
        "logic": "regelwerk rondom dagkantopening (2x hoogte + 1x breedte) per stuk",
        "formula": "lineair_m1 = (((2 * opening_height_mm) + opening_width_mm) * opening_count) / 1000; if material.lengte exists then aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.breedte",
          "maatwerk_item.hoogte",
          "maatwerk_item.aantal",
          "material.lengte || material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "afwerking": {
      "dagkant": {
        "sectionKey": "dagkant",
        "logic": "betimmering rondom opening, lineair of op verbruik",
        "formula": "lineair_m1 = (((2 * opening_height_mm) + opening_width_mm) * opening_count) / 1000; if material.lengte exists then aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else if material.verbruik_per_m1 || material.verbruik exists then totaal = lineair_m1 * (1 + waste/100) * (material.verbruik_per_m1 ?? material.verbruik); aantal = ceil(totaal); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.breedte",
          "maatwerk_item.hoogte",
          "maatwerk_item.aantal",
          "material.lengte || material.verbruik_per_m1 || material.verbruik || material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "hoekprofiel": {
        "sectionKey": "hoekprofiel",
        "logic": "hoekprofiel over verticale dagkanthoogtes",
        "formula": "lineair_m1 = ((2 * opening_height_mm) * opening_count) / 1000; if material.lengte exists then aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.hoogte",
          "maatwerk_item.aantal",
          "material.lengte || material.aantal"
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

-- Verificatie: sectionKey-aantallen per afwerkingen-slug.
SELECT
  kr.klus_regels->>'slug' AS slug,
  COUNT(*) FILTER (WHERE rule_obj ? 'sectionKey') AS sectionkey_count
FROM public.klus_regels kr
CROSS JOIN LATERAL jsonb_each(kr.klus_regels->'calculation_rules') AS topcat(top_key, top_val)
CROSS JOIN LATERAL jsonb_each(top_val) AS rule(rule_key, rule_obj)
WHERE kr.klus_regels->>'slug' IN ('plinten-afwerklatten', 'vensterbanken', 'dagkanten')
GROUP BY kr.klus_regels->>'slug'
ORDER BY kr.klus_regels->>'slug';
