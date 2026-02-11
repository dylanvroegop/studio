-- Fix: ensure schutting-beton exists in public.klus_regels
-- Source of truth: staging_sql/08_klus_regels_schutting.sql

WITH input_rows(slug, klus_type, klus_regels) AS (
VALUES
  ('schutting-beton', 'schutting-beton', $kr${
  "meta": {
    "description": "Schutting - Beton",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "schutting-beton",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "fence_length_mm": "maatwerk_item.lengte",
    "fence_height_mm": "maatwerk_item.hoogte",
    "post_spacing_mm": "maatwerk_item.paalafstand",
    "type_schutting": "maatwerk_item.type_schutting",
    "betonband_height_mm": "maatwerk_item.betonband_hoogte",
    "poort_aanwezig": "maatwerk_item.poort_aanwezig",
    "hoek_count": "maatwerk_item.aantal_hoeken",
    "post_count": "ceil(fence_length_mm / post_spacing_mm) + 1",
    "panel_count": "max(1, post_count - 1)",
    "effective_height_mm": "max(0, fence_height_mm - (betonband_height_mm ?? 0))",
    "fence_area_m2": "(fence_length_mm * effective_height_mm) / 1000000"
  },
  "calculation_rules": {
    "fundering": {
      "snelbeton": {
        "sectionKey": "snelbeton",
        "logic": "verbruik per paal (materiaalgestuurd)",
        "formula": "if material.verbruik_per_paal || material.verbruik exists then totaal = post_count * (1 + waste/100) * (material.verbruik_per_paal ?? material.verbruik); else requires_manual_input",
        "pack_handling": "if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.paalafstand",
          "material.verbruik_per_paal || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "opsluitbanden": {
        "sectionKey": "opsluitbanden",
        "logic": "lineair over totale schuttinglengte",
        "formula": "lineair_m1 = fence_length_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "paalpunthouder": {
        "sectionKey": "paalpunthouder",
        "logic": "1 per paalpositie",
        "formula": "aantal = ceil(post_count * (1 + waste/100))",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.paalafstand"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "schutting_beton": {
      "betonpalen": {
        "sectionKey": "betonpalen",
        "logic": "palen op vaste maat tussen palen + hoekcorrectie",
        "formula": "posts_total = post_count + max(0, hoek_count); aantal = ceil(posts_total * (1 + waste/100))",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.paalafstand"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "onderplaten": {
        "sectionKey": "onderplaten",
        "logic": "1 onderplaat per vak",
        "formula": "aantal = ceil(panel_count * (1 + waste/100))",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.paalafstand"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "afdekkap_beton": {
        "sectionKey": "afdekkap_beton",
        "logic": "1 kap per paalpositie",
        "formula": "posts_total = post_count + max(0, hoek_count); aantal = ceil(posts_total * (1 + waste/100))",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.paalafstand"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "unibeslag": {
        "sectionKey": "unibeslag",
        "logic": "verbruik per vak (materiaalgestuurd)",
        "formula": "if material.verbruik_per_vak || material.verbruik exists then totaal = panel_count * (1 + waste/100) * (material.verbruik_per_vak ?? material.verbruik); else requires_manual_input",
        "pack_handling": "if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.paalafstand",
          "material.verbruik_per_vak || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "poort": {
      "tuinpoort": {
        "sectionKey": "tuinpoort",
        "logic": "alleen bij expliciete poort-input",
        "formula": "if maatwerk_item.poort_aanwezig == true && material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.poort_aanwezig",
          "material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "stalen_frame": {
        "sectionKey": "stalen_frame",
        "logic": "alleen bij expliciete poort-input",
        "formula": "if maatwerk_item.poort_aanwezig == true && material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.poort_aanwezig",
          "material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "kozijnbalken": {
        "sectionKey": "kozijnbalken",
        "logic": "poortkader lineair op expliciete input",
        "formula": "if maatwerk_item.poort_aanwezig == true && material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if maatwerk_item.poort_aanwezig == true && material.lengte && material.verbruik_per_poort exists then lineair_m1 = material.verbruik_per_poort; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.poort_aanwezig",
          "material.aantal || (material.verbruik_per_poort && material.lengte)"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "beslag": {
      "hengselset": {
        "sectionKey": "hengselset",
        "logic": "set per poort (materiaalgestuurd)",
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.poort_aanwezig",
          "material.aantal || material.verbruik_per_poort || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "hengen": {
        "sectionKey": "hengen",
        "logic": "set per poort (materiaalgestuurd)",
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.poort_aanwezig",
          "material.aantal || material.verbruik_per_poort || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "plaatduimen": {
        "sectionKey": "plaatduimen",
        "logic": "set per poort (materiaalgestuurd)",
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.poort_aanwezig",
          "material.aantal || material.verbruik_per_poort || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "poortbeslag": {
        "sectionKey": "poortbeslag",
        "logic": "set per poort (materiaalgestuurd)",
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.poort_aanwezig",
          "material.aantal || material.verbruik_per_poort || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "cilinderslot": {
        "sectionKey": "cilinderslot",
        "logic": "set per poort (materiaalgestuurd)",
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.poort_aanwezig",
          "material.aantal || material.verbruik_per_poort || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "grondgrendel": {
        "sectionKey": "grondgrendel",
        "logic": "set per poort (materiaalgestuurd)",
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.poort_aanwezig",
          "material.aantal || material.verbruik_per_poort || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "vloerstop": {
        "sectionKey": "vloerstop",
        "logic": "set per poort (materiaalgestuurd)",
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.poort_aanwezig",
          "material.aantal || material.verbruik_per_poort || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    }
  }
}$kr$::jsonb
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

SELECT id, klus_regels->>'slug' AS slug FROM public.klus_regels WHERE klus_regels->>'slug' = 'schutting-beton';
