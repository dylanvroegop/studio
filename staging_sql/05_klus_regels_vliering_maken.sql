-- Constructievloer hout (vliering-maken) regels
-- Source of truth: src/lib/klus-regels-static.ts

WITH input_rows(slug, klus_type, klus_regels) AS (
VALUES
  ('vliering-maken', 'vliering-maken', $kr${
  "meta": {
    "description": "Constructievloer hout (vliering-maken)",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "vliering-maken",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "floor_length_mm": "maatwerk_item.lengte",
    "floor_width_mm": "maatwerk_item.breedte",
    "balkafstand_mm": "maatwerk_item.balkafstand",
    "openings_source": "maatwerk_item.openings",
    "opening_width_mm": "opening.openingWidth ?? opening.width",
    "opening_height_mm": "opening.openingHeight ?? opening.height",
    "opening_area_m2": "(opening_width_mm * opening_height_mm) / 1000000",
    "total_openings_area_m2": "sum(opening_area_m2)",
    "vloer_bruto_m2": "(floor_length_mm * floor_width_mm) / 1000000",
    "vloer_netto_m2": "max(0, vloer_bruto_m2 - total_openings_area_m2)",
    "vlizotrap_openings": "filter openings where type in ['vlizotrap', 'hatch']",
    "vlizotrap_count": "count(vlizotrap_openings)",
    "vlizotrap_perimeter_m1": "sum((2 * (opening_width_mm + opening_height_mm)) / 1000 for vlizotrap_openings)",
    "beam_count": "ceil(floor_length_mm / balkafstand_mm) + 1",
    "randbalk_total_mm": "2 * floor_length_mm",
    "vloerbalk_total_mm": "beam_count * floor_width_mm",
    "raveel_extra_mm": "sum((2 * opening_width_mm) + (2 * opening_height_mm) for vlizotrap_openings)",
    "koof_items": "maatwerk_item.koven",
    "koof_total_surface_m2": "sum((((koof.lengte * koof.hoogte) + (koof.lengte * koof.diepte)) / 1000000) * (koof.aantal ?? 1) for koof_items)",
    "koof_total_lineair_mm": "sum(((2 * koof.lengte) + (2 * koof.hoogte) + (2 * koof.diepte)) * (koof.aantal ?? 1) for koof_items)"
  },
  "calculation_rules": {
    "constructievloer": {
      "randbalken": {
        "sectionKey": "randbalken",
        "logic": "2 randbalken langs vloer-lengte",
        "formula": "aantal = ceil((randbalk_total_mm) / material.lengte_mm)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "vloerbalken": {
        "sectionKey": "vloerbalken",
        "logic": "balken op h.o.h. + extra raveelhout bij vlizotrap-openingen",
        "formula": "totale_lengte_mm = vloerbalk_total_mm + raveel_extra_mm; aantal = ceil((totale_lengte_mm) / material.lengte_mm)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.breedte",
          "maatwerk_item.balkafstand",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "balkdragers": {
        "sectionKey": "balkdragers",
        "logic": "2 dragers per interne balk + extra per vlizotrap-raveling",
        "formula": "interne_balken = max(0, beam_count - 2); basis = interne_balken * 2; raveel = vlizotrap_count * 4; aantal = ceil((basis + raveel))",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.balkafstand"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "beplating": {
      "beplating": {
        "sectionKey": "beplating",
        "logic": "vloer-oppervlakte minus openingen",
        "formula": "plaat_m2 = material.lengte_m * material.breedte_m; aantal = ceil((vloer_netto_m2) / plaat_m2)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.breedte",
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "toegang": {
      "vlizotrap_unit": {
        "sectionKey": "vlizotrap_unit",
        "logic": "1 per vlizotrap-opening of expliciete materiaalhoeveelheid",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else if vlizotrap_count > 0 then aantal = vlizotrap_count; else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.openings || material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "luik_afwerking": {
        "sectionKey": "luik_afwerking",
        "logic": "omtrek van vlizotrap/luik-openingen",
        "formula": "lineair_m1 = vlizotrap_perimeter_m1; aantal = ceil((lineair_m1) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.openings",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "koof": {
      "koof_regelwerk": {
        "sectionKey": "koof_regelwerk",
        "logic": "lineair koof-frame op basis van koven[]",
        "formula": "aantal = ceil((koof_total_lineair_mm) / material.lengte_mm)",
        "required_inputs": [
          "maatwerk_item.koven",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "koof_constructieplaat": {
        "sectionKey": "koof_constructieplaat",
        "logic": "koof-oppervlakte (front + onderzijde)",
        "formula": "plaat_m2 = material.lengte_m * material.breedte_m; aantal = ceil((koof_total_surface_m2) / plaat_m2)",
        "required_inputs": [
          "maatwerk_item.koven",
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "koof_afwerkplaat": {
        "sectionKey": "koof_afwerkplaat",
        "logic": "zelfde oppervlak als koof_constructieplaat",
        "formula": "plaat_m2 = material.lengte_m * material.breedte_m; aantal = ceil((koof_total_surface_m2) / plaat_m2)",
        "required_inputs": [
          "maatwerk_item.koven",
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "koof_isolatie": {
        "sectionKey": "koof_isolatie",
        "logic": "koof-oppervlakte met pack-detectie",
        "formula": "element_m2 = material.lengte_m * material.breedte_m; stuks = ceil((koof_total_surface_m2) / element_m2)",
        "pack_handling": "if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = stuks",
        "required_inputs": [
          "maatwerk_item.koven",
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "isolatie_folies": {
      "folie_buiten": {
        "sectionKey": "folie_buiten",
        "logic": "oppervlakte vloer minus openingen",
        "formula": "dekkings_m2 = material.lengte_m * material.breedte_m; aantal = ceil((vloer_netto_m2) / dekkings_m2)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.breedte",
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "isolatie_basis": {
        "sectionKey": "isolatie_basis",
        "logic": "oppervlakte vloer minus openingen met pack-detectie",
        "formula": "element_m2 = material.lengte_m * material.breedte_m; stuks = ceil((vloer_netto_m2) / element_m2)",
        "pack_handling": "if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = stuks",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.breedte",
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "afwerking": {
      "plinten_plafond": {
        "sectionKey": "plinten_plafond",
        "logic": "perimeter van vloer/plafondvlak",
        "formula": "lineair_m1 = (2 * (floor_length_mm + floor_width_mm)) / 1000; aantal = ceil((lineair_m1) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.breedte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "gips_vuller": {
        "sectionKey": "gips_vuller",
        "logic": "verbruik per m2 (materiaalgestuurd)",
        "formula": "if material.verbruik_per_m2 || material.verbruik exists then totaal = vloer_netto_m2 * (material.verbruik_per_m2 ?? material.verbruik); else requires_manual_input",
        "pack_handling": "if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.breedte",
          "material.verbruik_per_m2 || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "gips_finish": {
        "sectionKey": "gips_finish",
        "logic": "verbruik per m2 (materiaalgestuurd)",
        "formula": "if material.verbruik_per_m2 || material.verbruik exists then totaal = vloer_netto_m2 * (material.verbruik_per_m2 ?? material.verbruik); else requires_manual_input",
        "pack_handling": "if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.breedte",
          "material.verbruik_per_m2 || material.verbruik"
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

-- Verificatie: vliering-maken moet 15 sectionKeys hebben.
SELECT
  kr.klus_regels->>'slug' AS slug,
  COUNT(*) FILTER (WHERE rule_obj ? 'sectionKey') AS sectionkey_count
FROM public.klus_regels kr
CROSS JOIN LATERAL jsonb_each(kr.klus_regels->'calculation_rules') AS topcat(top_key, top_val)
CROSS JOIN LATERAL jsonb_each(top_val) AS rule(rule_key, rule_obj)
WHERE kr.klus_regels->>'slug' = 'vliering-maken'
GROUP BY kr.klus_regels->>'slug';
