-- Schutting regels (Hout / Beton / Composiet)
-- Source of truth: src/lib/klus-regels-static.ts

WITH input_rows(slug, klus_type, klus_regels) AS (
VALUES
  ('schutting-hout', 'schutting-hout', $kr${
  "meta": {
    "description": "Schutting - Hout",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "schutting-hout",
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
        "formula": "if material.verbruik_per_paal || material.verbruik exists then totaal = post_count * (material.verbruik_per_paal ?? material.verbruik); else requires_manual_input",
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
        "formula": "lineair_m1 = fence_length_mm / 1000; aantal = ceil((lineair_m1) / material.lengte_m)",
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
        "formula": "aantal = ceil(post_count)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.paalafstand"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "schutting_hout": {
      "schuttingpalen_hout": {
        "sectionKey": "schuttingpalen_hout",
        "logic": "palen op vaste maat tussen palen + hoekcorrectie",
        "formula": "posts_total = post_count + max(0, hoek_count); aantal = ceil(posts_total)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.paalafstand"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "paalkap": {
        "sectionKey": "paalkap",
        "logic": "1 kap per paalpositie",
        "formula": "posts_total = post_count + max(0, hoek_count); aantal = ceil(posts_total)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.paalafstand"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "tuinscherm_hout": {
        "sectionKey": "tuinscherm_hout",
        "logic": "primair 1 scherm per vak; fallback op netto oppervlak",
        "formula": "if type_schutting == 'schermen' then stuks = panel_count; else if material.lengte && material.breedte then plaat_m2 = material.lengte_m * material.breedte_m; stuks = ceil(fence_area_m2 / plaat_m2); else requires_manual_input; aantal = ceil(stuks)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "maatwerk_item.paalafstand"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "afdeklat_hout": {
        "sectionKey": "afdeklat_hout",
        "logic": "lineair over bovenzijde schutting",
        "formula": "lineair_m1 = fence_length_mm / 1000; aantal = ceil((lineair_m1) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "tuinplanken": {
        "sectionKey": "tuinplanken",
        "logic": "plankverdeling voor planken-systeem, fallback op oppervlakte",
        "formula": "if type_schutting == 'planken' && material.werkende_breedte_mm exists then rows = ceil(effective_height_mm / material.werkende_breedte_mm); cols = ceil(fence_length_mm / material.lengte_mm); stuks = rows * cols; else if type_schutting == 'planken' && material.lengte && material.breedte then plaat_m2 = material.lengte_m * material.breedte_m; stuks = ceil(fence_area_m2 / plaat_m2); else requires_manual_input; aantal = ceil(stuks)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "poort": {
      "tuinpoort": {
        "sectionKey": "tuinpoort",
        "logic": "alleen bij expliciete poort-input",
        "formula": "if maatwerk_item.poort_aanwezig == true && material.aantal exists then aantal = ceil(material.aantal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && material.aantal exists then aantal = ceil(material.aantal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && material.aantal exists then aantal = ceil(material.aantal); else if maatwerk_item.poort_aanwezig == true && material.lengte && material.verbruik_per_poort exists then lineair_m1 = material.verbruik_per_poort; aantal = ceil((lineair_m1) / material.lengte_m); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)); aantal = ceil(totaal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)); aantal = ceil(totaal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)); aantal = ceil(totaal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)); aantal = ceil(totaal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)); aantal = ceil(totaal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)); aantal = ceil(totaal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)); aantal = ceil(totaal); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.poort_aanwezig",
          "material.aantal || material.verbruik_per_poort || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    }
  }
}$kr$::jsonb),
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
        "formula": "if material.verbruik_per_paal || material.verbruik exists then totaal = post_count * (material.verbruik_per_paal ?? material.verbruik); else requires_manual_input",
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
        "formula": "lineair_m1 = fence_length_mm / 1000; aantal = ceil((lineair_m1) / material.lengte_m)",
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
        "formula": "aantal = ceil(post_count)",
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
        "formula": "posts_total = post_count + max(0, hoek_count); aantal = ceil(posts_total)",
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
        "formula": "aantal = ceil(panel_count)",
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
        "formula": "posts_total = post_count + max(0, hoek_count); aantal = ceil(posts_total)",
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
        "formula": "if material.verbruik_per_vak || material.verbruik exists then totaal = panel_count * (material.verbruik_per_vak ?? material.verbruik); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && material.aantal exists then aantal = ceil(material.aantal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && material.aantal exists then aantal = ceil(material.aantal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && material.aantal exists then aantal = ceil(material.aantal); else if maatwerk_item.poort_aanwezig == true && material.lengte && material.verbruik_per_poort exists then lineair_m1 = material.verbruik_per_poort; aantal = ceil((lineair_m1) / material.lengte_m); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)); aantal = ceil(totaal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)); aantal = ceil(totaal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)); aantal = ceil(totaal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)); aantal = ceil(totaal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)); aantal = ceil(totaal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)); aantal = ceil(totaal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)); aantal = ceil(totaal); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.poort_aanwezig",
          "material.aantal || material.verbruik_per_poort || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    }
  }
}$kr$::jsonb),
  ('schutting-composiet', 'schutting-composiet', $kr${
  "meta": {
    "description": "Schutting - Composiet",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "schutting-composiet",
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
        "formula": "if material.verbruik_per_paal || material.verbruik exists then totaal = post_count * (material.verbruik_per_paal ?? material.verbruik); else requires_manual_input",
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
        "formula": "lineair_m1 = fence_length_mm / 1000; aantal = ceil((lineair_m1) / material.lengte_m)",
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
        "formula": "aantal = ceil(post_count)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.paalafstand"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "schutting_composiet": {
      "aluminium_palen": {
        "sectionKey": "aluminium_palen",
        "logic": "palen op vaste maat tussen palen + hoekcorrectie",
        "formula": "posts_total = post_count + max(0, hoek_count); aantal = ceil(posts_total)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.paalafstand"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "paalvoet": {
        "sectionKey": "paalvoet",
        "logic": "1 paalvoet per paalpositie",
        "formula": "posts_total = post_count + max(0, hoek_count); aantal = ceil(posts_total)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.paalafstand"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "tuinscherm_composiet": {
        "sectionKey": "tuinscherm_composiet",
        "logic": "primair 1 scherm per vak; fallback op netto oppervlak",
        "formula": "if type_schutting == 'schermen' then stuks = panel_count; else if material.lengte && material.breedte then plaat_m2 = material.lengte_m * material.breedte_m; stuks = ceil(fence_area_m2 / plaat_m2); else requires_manual_input; aantal = ceil(stuks)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "maatwerk_item.paalafstand"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "u_profiel": {
        "sectionKey": "u_profiel",
        "logic": "2 zijprofielen per vak over effectieve schuttinghoogte",
        "formula": "lineair_m1 = (2 * panel_count * effective_height_mm) / 1000; aantal = ceil((lineair_m1) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "maatwerk_item.paalafstand",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "poort": {
      "tuinpoort": {
        "sectionKey": "tuinpoort",
        "logic": "alleen bij expliciete poort-input",
        "formula": "if maatwerk_item.poort_aanwezig == true && material.aantal exists then aantal = ceil(material.aantal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && material.aantal exists then aantal = ceil(material.aantal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && material.aantal exists then aantal = ceil(material.aantal); else if maatwerk_item.poort_aanwezig == true && material.lengte && material.verbruik_per_poort exists then lineair_m1 = material.verbruik_per_poort; aantal = ceil((lineair_m1) / material.lengte_m); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)); aantal = ceil(totaal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)); aantal = ceil(totaal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)); aantal = ceil(totaal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)); aantal = ceil(totaal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)); aantal = ceil(totaal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)); aantal = ceil(totaal); else requires_manual_input",
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
        "formula": "if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)); aantal = ceil(totaal); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.poort_aanwezig",
          "material.aantal || material.verbruik_per_poort || material.verbruik"
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

-- Verificatie: sectionKey-aantallen per schutting variant.
SELECT
  kr.klus_regels->>'slug' AS slug,
  COUNT(*) FILTER (WHERE rule_obj ? 'sectionKey') AS sectionkey_count
FROM public.klus_regels kr
CROSS JOIN LATERAL jsonb_each(kr.klus_regels->'calculation_rules') AS topcat(top_key, top_val)
CROSS JOIN LATERAL jsonb_each(top_val) AS rule(rule_key, rule_obj)
WHERE kr.klus_regels->>'slug' IN (
  'schutting-hout',
  'schutting-beton',
  'schutting-composiet'
)
GROUP BY kr.klus_regels->>'slug'
ORDER BY slug;
