-- Afwerk vloer regels (Laminaat / PVC / Hout / Vinyl)
-- Source of truth: src/lib/klus-regels-static.ts

WITH input_rows(slug, klus_type, klus_regels) AS (
VALUES
  ('laminaat-pvc', 'laminaat-pvc', $kr${
  "meta": {
    "description": "Afwerk Vloer - Laminaat / PVC / Klik-Vinyl",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "laminaat-pvc",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "vloer_lengte_mm": "maatwerk_item.lengte",
    "vloer_breedte_mm": "maatwerk_item.breedte",
    "vloer_area_m2": "(vloer_lengte_mm * vloer_breedte_mm) / 1000000",
    "vloer_perimeter_m1": "(2 * (vloer_lengte_mm + vloer_breedte_mm)) / 1000"
  },
  "calculation_rules": {
    "Vloer_Voorbereiding": {
      "egaliseren": {
        "sectionKey": "egaliseren",
        "logic": "egaliseren op verbruik-per-m2 of expliciete materiaalhoeveelheid",
        "formula": "if material.verbruik_per_m2 || material.verbruik exists then totaal = vloer_area_m2 * (material.verbruik_per_m2 ?? material.verbruik); else if material.dekking_m2 exists then totaal = ceil((vloer_area_m2) / material.dekking_m2); else if material.aantal exists then totaal = ceil(material.aantal); else requires_manual_input",
        "pack_handling": "if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.breedte",
          "material.verbruik_per_m2 || material.verbruik || material.dekking_m2 || material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "folie": {
        "sectionKey": "folie",
        "logic": "oppervlakte gebaseerd met overlap via waste",
        "formula": "if material.dekking_m2 exists then aantal = ceil((vloer_area_m2) / material.dekking_m2); else if material.lengte && material.breedte then dekkings_m2 = material.lengte_m * material.breedte_m; aantal = ceil((vloer_area_m2) / dekkings_m2); else if material.aantal exists then aantal = ceil(material.aantal); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.breedte",
          "material.dekking_m2 || (material.lengte && material.breedte) || material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "ondervloer": {
        "sectionKey": "ondervloer",
        "logic": "oppervlakte gebaseerd met pack-detectie",
        "formula": "if material.dekking_m2 exists then stuks = ceil((vloer_area_m2) / material.dekking_m2); else if material.lengte && material.breedte then element_m2 = material.lengte_m * material.breedte_m; stuks = ceil((vloer_area_m2) / element_m2); else if material.aantal exists then stuks = ceil(material.aantal); else requires_manual_input",
        "pack_handling": "if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = ceil(stuks)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.breedte",
          "material.dekking_m2 || (material.lengte && material.breedte) || material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "Vloer_Laminaat": {
      "vloerdelen": {
        "sectionKey": "vloerdelen",
        "logic": "vloeroppervlakte met dekking/werkende maat + pack-detectie",
        "formula": "if material.dekking_m2 exists then stuks = ceil((vloer_area_m2) / material.dekking_m2); else if material.werkende_breedte_mm && material.lengte exists then element_m2 = material.lengte_m * (material.werkende_breedte_mm / 1000); stuks = ceil((vloer_area_m2) / element_m2); else if material.lengte && material.breedte then element_m2 = material.lengte_m * material.breedte_m; stuks = ceil((vloer_area_m2) / element_m2); else if material.aantal exists then stuks = ceil(material.aantal); else requires_manual_input",
        "pack_handling": "if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = ceil(stuks)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.breedte",
          "material.dekking_m2 || material.werkende_breedte_mm || (material.lengte && material.breedte) || material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "Vloer_Afwerking": {
      "plinten_muur": {
        "sectionKey": "plinten_muur",
        "logic": "lineair over vloeromtrek",
        "formula": "if material.lengte exists then lineair_m1 = vloer_perimeter_m1; aantal = ceil((lineair_m1) / material.lengte_m); else if material.dekking_m1 exists then aantal = ceil((vloer_perimeter_m1) / material.dekking_m1); else if material.aantal exists then aantal = ceil(material.aantal); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.breedte",
          "material.lengte || material.dekking_m1 || material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "profielen_overgang": {
        "sectionKey": "profielen_overgang",
        "logic": "overgangsprofielen op expliciete aantallen of verbruik-per-overgang",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else if material.verbruik_per_overgang || material.verbruik exists then totaal = (material.verbruik_per_overgang ?? material.verbruik); aantal = ceil(totaal); else requires_manual_input",
        "required_inputs": [
          "material.aantal || material.verbruik_per_overgang || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "profielen_eind": {
        "sectionKey": "profielen_eind",
        "logic": "eindprofielen op expliciete aantallen of verbruik-per-overgang",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else if material.verbruik_per_overgang || material.verbruik exists then totaal = (material.verbruik_per_overgang ?? material.verbruik); aantal = ceil(totaal); else requires_manual_input",
        "required_inputs": [
          "material.aantal || material.verbruik_per_overgang || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "kruipluik": {
        "sectionKey": "kruipluik",
        "logic": "kruipluikprofiel op expliciet aantal of verbruik",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else if material.verbruik || material.verbruik_per_stuk exists then totaal = (material.verbruik_per_stuk ?? material.verbruik); aantal = ceil(totaal); else requires_manual_input",
        "required_inputs": [
          "material.aantal || material.verbruik || material.verbruik_per_stuk"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    }
  }
}$kr$::jsonb),
  ('massief-houten-vloer', 'massief-houten-vloer', $kr${
  "meta": {
    "description": "Afwerk Vloer - Massief Houten Vloer",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "massief-houten-vloer",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "vloer_lengte_mm": "maatwerk_item.lengte",
    "vloer_breedte_mm": "maatwerk_item.breedte",
    "vloer_area_m2": "(vloer_lengte_mm * vloer_breedte_mm) / 1000000",
    "vloer_perimeter_m1": "(2 * (vloer_lengte_mm + vloer_breedte_mm)) / 1000"
  },
  "calculation_rules": {
    "Vloer_Voorbereiding": {
      "primer": {
        "sectionKey": "primer",
        "logic": "primer op verbruik-per-m2 of expliciete materiaalhoeveelheid",
        "formula": "if material.verbruik_per_m2 || material.verbruik exists then totaal = vloer_area_m2 * (material.verbruik_per_m2 ?? material.verbruik); else if material.dekking_m2 exists then totaal = ceil((vloer_area_m2) / material.dekking_m2); else if material.aantal exists then totaal = ceil(material.aantal); else requires_manual_input",
        "pack_handling": "if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.breedte",
          "material.verbruik_per_m2 || material.verbruik || material.dekking_m2 || material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "ondervloer": {
        "sectionKey": "ondervloer",
        "logic": "oppervlakte gebaseerd met pack-detectie",
        "formula": "if material.dekking_m2 exists then stuks = ceil((vloer_area_m2) / material.dekking_m2); else if material.lengte && material.breedte then element_m2 = material.lengte_m * material.breedte_m; stuks = ceil((vloer_area_m2) / element_m2); else if material.aantal exists then stuks = ceil(material.aantal); else requires_manual_input",
        "pack_handling": "if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = ceil(stuks)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.breedte",
          "material.dekking_m2 || (material.lengte && material.breedte) || material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "egaline": {
        "sectionKey": "egaline",
        "logic": "egaliseren op verbruik-per-m2 of expliciete materiaalhoeveelheid",
        "formula": "if material.verbruik_per_m2 || material.verbruik exists then totaal = vloer_area_m2 * (material.verbruik_per_m2 ?? material.verbruik); else if material.dekking_m2 exists then totaal = ceil((vloer_area_m2) / material.dekking_m2); else if material.aantal exists then totaal = ceil(material.aantal); else requires_manual_input",
        "pack_handling": "if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.breedte",
          "material.verbruik_per_m2 || material.verbruik || material.dekking_m2 || material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "Vloer_Hout": {
      "vloerdelen": {
        "sectionKey": "vloerdelen",
        "logic": "vloeroppervlakte met dekking/werkende maat + pack-detectie",
        "formula": "if material.dekking_m2 exists then stuks = ceil((vloer_area_m2) / material.dekking_m2); else if material.werkende_breedte_mm && material.lengte exists then element_m2 = material.lengte_m * (material.werkende_breedte_mm / 1000); stuks = ceil((vloer_area_m2) / element_m2); else if material.lengte && material.breedte then element_m2 = material.lengte_m * material.breedte_m; stuks = ceil((vloer_area_m2) / element_m2); else if material.aantal exists then stuks = ceil(material.aantal); else requires_manual_input",
        "pack_handling": "if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = ceil(stuks)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.breedte",
          "material.dekking_m2 || material.werkende_breedte_mm || (material.lengte && material.breedte) || material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "parketlijm": {
        "sectionKey": "parketlijm",
        "logic": "lijmverbruik op m2 of expliciete hoeveelheid",
        "formula": "if material.verbruik_per_m2 || material.verbruik exists then totaal = vloer_area_m2 * (material.verbruik_per_m2 ?? material.verbruik); else if material.aantal exists then totaal = ceil(material.aantal); else requires_manual_input",
        "pack_handling": "if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.breedte",
          "material.verbruik_per_m2 || material.verbruik || material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "Vloer_Afwerking": {
      "plinten": {
        "sectionKey": "plinten",
        "logic": "lineair over vloeromtrek",
        "formula": "if material.lengte exists then lineair_m1 = vloer_perimeter_m1; aantal = ceil((lineair_m1) / material.lengte_m); else if material.dekking_m1 exists then aantal = ceil((vloer_perimeter_m1) / material.dekking_m1); else if material.aantal exists then aantal = ceil(material.aantal); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.breedte",
          "material.lengte || material.dekking_m1 || material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "deklatten": {
        "sectionKey": "deklatten",
        "logic": "lineair over vloeromtrek",
        "formula": "if material.lengte exists then lineair_m1 = vloer_perimeter_m1; aantal = ceil((lineair_m1) / material.lengte_m); else if material.aantal exists then aantal = ceil(material.aantal); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.breedte",
          "material.lengte || material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "dorpels": {
        "sectionKey": "dorpels",
        "logic": "overgangsprofielen/dorpels op expliciete aantallen of verbruik-per-overgang",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else if material.verbruik_per_overgang || material.verbruik exists then totaal = (material.verbruik_per_overgang ?? material.verbruik); aantal = ceil(totaal); else requires_manual_input",
        "required_inputs": [
          "material.aantal || material.verbruik_per_overgang || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "vloerolie": {
        "sectionKey": "vloerolie",
        "logic": "afwerklaag op verbruik-per-m2 of expliciete hoeveelheid",
        "formula": "if material.verbruik_per_m2 || material.verbruik exists then totaal = vloer_area_m2 * (material.verbruik_per_m2 ?? material.verbruik); else if material.dekking_m2 exists then totaal = ceil((vloer_area_m2) / material.dekking_m2); else if material.aantal exists then totaal = ceil(material.aantal); else requires_manual_input",
        "pack_handling": "if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.breedte",
          "material.verbruik_per_m2 || material.verbruik || material.dekking_m2 || material.aantal"
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

-- Verificatie: laminaat-pvc (8) en massief-houten-vloer (9) sectionKeys.
SELECT
  kr.klus_regels->>'slug' AS slug,
  COUNT(*) FILTER (WHERE rule_obj ? 'sectionKey') AS sectionkey_count
FROM public.klus_regels kr
CROSS JOIN LATERAL jsonb_each(kr.klus_regels->'calculation_rules') AS topcat(top_key, top_val)
CROSS JOIN LATERAL jsonb_each(top_val) AS rule(rule_key, rule_obj)
WHERE kr.klus_regels->>'slug' IN ('laminaat-pvc', 'massief-houten-vloer')
GROUP BY kr.klus_regels->>'slug'
ORDER BY kr.klus_regels->>'slug';
