-- Gevelbekleding regels (static + Supabase sync)
-- Source of truth: src/lib/klus-regels-static.ts

WITH input_rows(slug, klus_type, klus_regels) AS (
VALUES
  ('gevelbekleding-trespa-hpl', 'gevelbekleding-trespa-hpl', $kr${
  "meta": {
    "description": "Gevelbekleding Trespa/HPL",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "gevelbekleding-trespa-hpl",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "gevel_lengte_mm": "maatwerk_item.lengte",
    "gevel_hoogte_mm": "maatwerk_item.hoogte",
    "tengelafstand_mm": "maatwerk_item.tengelafstand",
    "latafstand_mm": "maatwerk_item.latafstand",
    "openings_source": "maatwerk_item.openings",
    "opening_width_mm": "opening.openingWidth ?? opening.width",
    "opening_height_mm": "opening.openingHeight ?? opening.height",
    "openingen_m2": "sum((opening_width_mm * opening_height_mm) / 1000000)",
    "gevel_bruto_m2": "(gevel_lengte_mm * gevel_hoogte_mm) / 1000000",
    "gevel_netto_m2": "max(0, gevel_bruto_m2 - openingen_m2)",
    "openings_waterslag_m1": "sum(opening_width_mm / 1000 for opening in openings_source where opening.type in ['window', 'frame-outer', 'frame-inner'])"
  },
  "calculation_rules": {
    "hout": {
      "regelwerk_basis": {
        "sectionKey": "regelwerk_basis",
        "logic": "verticale tengels + horizontale regels op opgegeven h.o.h.",
        "formula": "vertical_count = ceil(gevel_lengte_mm / tengelafstand_mm) + 1; vertical_total_mm = vertical_count * gevel_hoogte_mm; horizontal_count = ceil(gevel_hoogte_mm / latafstand_mm) + 1; horizontal_total_mm = horizontal_count * gevel_lengte_mm; totaal_mm = vertical_total_mm + horizontal_total_mm; aantal = ceil((totaal_mm) / material.lengte_mm)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "maatwerk_item.tengelafstand",
          "maatwerk_item.latafstand",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "isolatie": {
      "folie_buiten": {
        "sectionKey": "folie_buiten",
        "logic": "oppervlakte gevel minus openingen",
        "formula": "dekkings_m2 = material.lengte_m * material.breedte_m; aantal = ceil((gevel_netto_m2) / dekkings_m2)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "isolatie_gevel": {
        "sectionKey": "isolatie_gevel",
        "logic": "oppervlakte gevel minus openingen met pack-detectie",
        "formula": "element_m2 = material.lengte_m * material.breedte_m; stuks = ceil((gevel_netto_m2) / element_m2)",
        "pack_handling": "if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = stuks",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "bekleding": {
      "gevelplaat": {
        "sectionKey": "gevelplaat",
        "logic": "gevelbekleding op netto oppervlak met optionele werkende-breedte logica",
        "formula": "if material.werkende_breedte_mm exists then rows = ceil(gevel_hoogte_mm / material.werkende_breedte_mm); cols = ceil(gevel_lengte_mm / material.lengte_mm); stuks = rows * cols; else plaat_m2 = material.lengte_m * material.breedte_m; stuks = ceil(gevel_netto_m2 / plaat_m2); aantal = ceil(stuks)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "bevestiging": {
      "ventilatieprofiel": {
        "sectionKey": "ventilatieprofiel",
        "logic": "onder- en bovenzijde van het gevelvlak",
        "formula": "lineair_m1 = (2 * gevel_lengte_mm) / 1000; aantal = ceil((lineair_m1) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "waterslag": {
        "sectionKey": "waterslag",
        "logic": "lineair over raam/opening-breedtes",
        "formula": "if openings_waterslag_m1 > 0 then aantal = ceil((openings_waterslag_m1) / material.lengte_m); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.openings",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    }
  }
}$kr$::jsonb),
  ('gevelbekleding-rockpanel', 'gevelbekleding-rockpanel', $kr${
  "meta": {
    "description": "Gevelbekleding Rockpanel",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "gevelbekleding-rockpanel",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "gevel_lengte_mm": "maatwerk_item.lengte",
    "gevel_hoogte_mm": "maatwerk_item.hoogte",
    "tengelafstand_mm": "maatwerk_item.tengelafstand",
    "latafstand_mm": "maatwerk_item.latafstand",
    "openings_source": "maatwerk_item.openings",
    "opening_width_mm": "opening.openingWidth ?? opening.width",
    "opening_height_mm": "opening.openingHeight ?? opening.height",
    "openingen_m2": "sum((opening_width_mm * opening_height_mm) / 1000000)",
    "gevel_bruto_m2": "(gevel_lengte_mm * gevel_hoogte_mm) / 1000000",
    "gevel_netto_m2": "max(0, gevel_bruto_m2 - openingen_m2)",
    "openings_waterslag_m1": "sum(opening_width_mm / 1000 for opening in openings_source where opening.type in ['window', 'frame-outer', 'frame-inner'])"
  },
  "calculation_rules": {
    "hout": {
      "regelwerk_basis": {
        "sectionKey": "regelwerk_basis",
        "logic": "verticale tengels + horizontale regels op opgegeven h.o.h.",
        "formula": "vertical_count = ceil(gevel_lengte_mm / tengelafstand_mm) + 1; vertical_total_mm = vertical_count * gevel_hoogte_mm; horizontal_count = ceil(gevel_hoogte_mm / latafstand_mm) + 1; horizontal_total_mm = horizontal_count * gevel_lengte_mm; totaal_mm = vertical_total_mm + horizontal_total_mm; aantal = ceil((totaal_mm) / material.lengte_mm)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "maatwerk_item.tengelafstand",
          "maatwerk_item.latafstand",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "isolatie": {
      "folie_buiten": {
        "sectionKey": "folie_buiten",
        "logic": "oppervlakte gevel minus openingen",
        "formula": "dekkings_m2 = material.lengte_m * material.breedte_m; aantal = ceil((gevel_netto_m2) / dekkings_m2)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "isolatie_gevel": {
        "sectionKey": "isolatie_gevel",
        "logic": "oppervlakte gevel minus openingen met pack-detectie",
        "formula": "element_m2 = material.lengte_m * material.breedte_m; stuks = ceil((gevel_netto_m2) / element_m2)",
        "pack_handling": "if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = stuks",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "bekleding": {
      "gevelplaat_rockpanel": {
        "sectionKey": "gevelplaat_rockpanel",
        "logic": "gevelbekleding op netto oppervlak met optionele werkende-breedte logica",
        "formula": "if material.werkende_breedte_mm exists then rows = ceil(gevel_hoogte_mm / material.werkende_breedte_mm); cols = ceil(gevel_lengte_mm / material.lengte_mm); stuks = rows * cols; else plaat_m2 = material.lengte_m * material.breedte_m; stuks = ceil(gevel_netto_m2 / plaat_m2); aantal = ceil(stuks)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "bevestiging": {
      "ventilatieprofiel": {
        "sectionKey": "ventilatieprofiel",
        "logic": "onder- en bovenzijde van het gevelvlak",
        "formula": "lineair_m1 = (2 * gevel_lengte_mm) / 1000; aantal = ceil((lineair_m1) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "waterslag": {
        "sectionKey": "waterslag",
        "logic": "lineair over raam/opening-breedtes",
        "formula": "if openings_waterslag_m1 > 0 then aantal = ceil((openings_waterslag_m1) / material.lengte_m); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.openings",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    }
  }
}$kr$::jsonb),
  ('gevelbekleding-hout', 'gevelbekleding-hout', $kr${
  "meta": {
    "description": "Gevelbekleding Hout",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "gevelbekleding-hout",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "gevel_lengte_mm": "maatwerk_item.lengte",
    "gevel_hoogte_mm": "maatwerk_item.hoogte",
    "tengelafstand_mm": "maatwerk_item.tengelafstand",
    "latafstand_mm": "maatwerk_item.latafstand",
    "openings_source": "maatwerk_item.openings",
    "opening_width_mm": "opening.openingWidth ?? opening.width",
    "opening_height_mm": "opening.openingHeight ?? opening.height",
    "openingen_m2": "sum((opening_width_mm * opening_height_mm) / 1000000)",
    "gevel_bruto_m2": "(gevel_lengte_mm * gevel_hoogte_mm) / 1000000",
    "gevel_netto_m2": "max(0, gevel_bruto_m2 - openingen_m2)",
    "openings_waterslag_m1": "sum(opening_width_mm / 1000 for opening in openings_source where opening.type in ['window', 'frame-outer', 'frame-inner'])"
  },
  "calculation_rules": {
    "hout": {
      "regelwerk_basis": {
        "sectionKey": "regelwerk_basis",
        "logic": "verticale tengels + horizontale regels op opgegeven h.o.h.",
        "formula": "vertical_count = ceil(gevel_lengte_mm / tengelafstand_mm) + 1; vertical_total_mm = vertical_count * gevel_hoogte_mm; horizontal_count = ceil(gevel_hoogte_mm / latafstand_mm) + 1; horizontal_total_mm = horizontal_count * gevel_lengte_mm; totaal_mm = vertical_total_mm + horizontal_total_mm; aantal = ceil((totaal_mm) / material.lengte_mm)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "maatwerk_item.tengelafstand",
          "maatwerk_item.latafstand",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "isolatie": {
      "folie_buiten": {
        "sectionKey": "folie_buiten",
        "logic": "oppervlakte gevel minus openingen",
        "formula": "dekkings_m2 = material.lengte_m * material.breedte_m; aantal = ceil((gevel_netto_m2) / dekkings_m2)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "isolatie_gevel": {
        "sectionKey": "isolatie_gevel",
        "logic": "oppervlakte gevel minus openingen met pack-detectie",
        "formula": "element_m2 = material.lengte_m * material.breedte_m; stuks = ceil((gevel_netto_m2) / element_m2)",
        "pack_handling": "if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = stuks",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "bekleding": {
      "gevelbekleding_hout": {
        "sectionKey": "gevelbekleding_hout",
        "logic": "gevelbekleding op netto oppervlak met optionele werkende-breedte logica",
        "formula": "if material.werkende_breedte_mm exists then rows = ceil(gevel_hoogte_mm / material.werkende_breedte_mm); cols = ceil(gevel_lengte_mm / material.lengte_mm); stuks = rows * cols; else plaat_m2 = material.lengte_m * material.breedte_m; stuks = ceil(gevel_netto_m2 / plaat_m2); aantal = ceil(stuks)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "bevestiging": {
      "ventilatieprofiel": {
        "sectionKey": "ventilatieprofiel",
        "logic": "onder- en bovenzijde van het gevelvlak",
        "formula": "lineair_m1 = (2 * gevel_lengte_mm) / 1000; aantal = ceil((lineair_m1) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "waterslag": {
        "sectionKey": "waterslag",
        "logic": "lineair over raam/opening-breedtes",
        "formula": "if openings_waterslag_m1 > 0 then aantal = ceil((openings_waterslag_m1) / material.lengte_m); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.openings",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "hoek_hout": {
        "sectionKey": "hoek_hout",
        "logic": "lineair op buitenhoeken",
        "formula": "if maatwerk_item.aantal_hoeken exists then lineair_m1 = (maatwerk_item.aantal_hoeken * gevel_hoogte_mm) / 1000; aantal = ceil((lineair_m1) / material.lengte_m); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.hoogte",
          "maatwerk_item.aantal_hoeken",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    }
  }
}$kr$::jsonb),
  ('gevelbekleding-keralit', 'gevelbekleding-keralit', $kr${
  "meta": {
    "description": "Gevelbekleding Keralit",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "gevelbekleding-keralit",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "gevel_lengte_mm": "maatwerk_item.lengte",
    "gevel_hoogte_mm": "maatwerk_item.hoogte",
    "tengelafstand_mm": "maatwerk_item.tengelafstand",
    "latafstand_mm": "maatwerk_item.latafstand",
    "openings_source": "maatwerk_item.openings",
    "opening_width_mm": "opening.openingWidth ?? opening.width",
    "opening_height_mm": "opening.openingHeight ?? opening.height",
    "openingen_m2": "sum((opening_width_mm * opening_height_mm) / 1000000)",
    "gevel_bruto_m2": "(gevel_lengte_mm * gevel_hoogte_mm) / 1000000",
    "gevel_netto_m2": "max(0, gevel_bruto_m2 - openingen_m2)",
    "openings_waterslag_m1": "sum(opening_width_mm / 1000 for opening in openings_source where opening.type in ['window', 'frame-outer', 'frame-inner'])"
  },
  "calculation_rules": {
    "hout": {
      "regelwerk_basis": {
        "sectionKey": "regelwerk_basis",
        "logic": "verticale tengels + horizontale regels op opgegeven h.o.h.",
        "formula": "vertical_count = ceil(gevel_lengte_mm / tengelafstand_mm) + 1; vertical_total_mm = vertical_count * gevel_hoogte_mm; horizontal_count = ceil(gevel_hoogte_mm / latafstand_mm) + 1; horizontal_total_mm = horizontal_count * gevel_lengte_mm; totaal_mm = vertical_total_mm + horizontal_total_mm; aantal = ceil((totaal_mm) / material.lengte_mm)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "maatwerk_item.tengelafstand",
          "maatwerk_item.latafstand",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "isolatie": {
      "folie_buiten": {
        "sectionKey": "folie_buiten",
        "logic": "oppervlakte gevel minus openingen",
        "formula": "dekkings_m2 = material.lengte_m * material.breedte_m; aantal = ceil((gevel_netto_m2) / dekkings_m2)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "isolatie_gevel": {
        "sectionKey": "isolatie_gevel",
        "logic": "oppervlakte gevel minus openingen met pack-detectie",
        "formula": "element_m2 = material.lengte_m * material.breedte_m; stuks = ceil((gevel_netto_m2) / element_m2)",
        "pack_handling": "if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = stuks",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "bekleding": {
      "gevelbekleding_kunststof": {
        "sectionKey": "gevelbekleding_kunststof",
        "logic": "gevelbekleding op netto oppervlak met optionele werkende-breedte logica",
        "formula": "if material.werkende_breedte_mm exists then rows = ceil(gevel_hoogte_mm / material.werkende_breedte_mm); cols = ceil(gevel_lengte_mm / material.lengte_mm); stuks = rows * cols; else plaat_m2 = material.lengte_m * material.breedte_m; stuks = ceil(gevel_netto_m2 / plaat_m2); aantal = ceil(stuks)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "bevestiging": {
      "ventilatieprofiel": {
        "sectionKey": "ventilatieprofiel",
        "logic": "onder- en bovenzijde van het gevelvlak",
        "formula": "lineair_m1 = (2 * gevel_lengte_mm) / 1000; aantal = ceil((lineair_m1) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "waterslag": {
        "sectionKey": "waterslag",
        "logic": "lineair over raam/opening-breedtes",
        "formula": "if openings_waterslag_m1 > 0 then aantal = ceil((openings_waterslag_m1) / material.lengte_m); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.openings",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "keralit_startprofiel": {
        "sectionKey": "keralit_startprofiel",
        "logic": "lineair onderzijde gevel",
        "formula": "lineair_m1 = gevel_lengte_mm / 1000; aantal = ceil((lineair_m1) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "keralit_eindprofiel": {
        "sectionKey": "keralit_eindprofiel",
        "logic": "lineair linker + rechter zijkant",
        "formula": "lineair_m1 = (2 * gevel_hoogte_mm) / 1000; aantal = ceil((lineair_m1) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.hoogte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "keralit_hoekprofiel": {
        "sectionKey": "keralit_hoekprofiel",
        "logic": "lineair op opgegeven buitenhoeken",
        "formula": "if maatwerk_item.aantal_hoeken exists then lineair_m1 = (maatwerk_item.aantal_hoeken * gevel_hoogte_mm) / 1000; aantal = ceil((lineair_m1) / material.lengte_m); else requires_manual_input",
        "required_inputs": [
          "maatwerk_item.hoogte",
          "maatwerk_item.aantal_hoeken",
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

-- Verificatie: sectionKey-aantallen per gevelbekleding variant.
SELECT
  kr.klus_regels->>'slug' AS slug,
  COUNT(*) FILTER (WHERE rule_obj ? 'sectionKey') AS sectionkey_count
FROM public.klus_regels kr
CROSS JOIN LATERAL jsonb_each(kr.klus_regels->'calculation_rules') AS topcat(top_key, top_val)
CROSS JOIN LATERAL jsonb_each(top_val) AS rule(rule_key, rule_obj)
WHERE kr.klus_regels->>'slug' IN (
  'gevelbekleding-trespa-hpl',
  'gevelbekleding-rockpanel',
  'gevelbekleding-hout',
  'gevelbekleding-keralit'
)
GROUP BY kr.klus_regels->>'slug'
ORDER BY slug;
