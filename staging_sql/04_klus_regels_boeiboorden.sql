-- Boeiboord regels (static + Supabase sync)
-- Source of truth: src/lib/klus-regels-static.ts

WITH input_rows(slug, klus_type, klus_regels) AS (
VALUES
  ('boeiboorden-trespa', 'boeiboorden-trespa', $kr${
  "meta": {
    "description": "Boeidelen (Trespa/HPL) - Vervangen door Trespa/HPL",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "boeiboorden-trespa",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "panel_source_priority": [
      "maatwerk_item.boeiboord_panelen",
      "legacy_virtual_panels_from_raw_fields"
    ],
    "legacy_virtual_panels_from_raw_fields": "if boeiboord_panelen ontbreekt: maak panelen uit lengte/hoogte (voorzijde) en lengte_onderzijde||lengte + breedte (onderzijde), met boeiboord_aantallen of boeiboord_mirror",
    "panel_height_mm": "paneel.hoogte ?? paneel.breedte",
    "panel_area_m2": "(paneel.lengte * panel_height_mm) / 1000000",
    "total_panel_area_m2": "sum(panel_area_m2)",
    "front_length_m1": "sum(paneel.lengte where paneel.zijde='voorzijde') / 1000",
    "underside_length_m1": "sum(paneel.lengte where paneel.zijde='onderzijde') / 1000",
    "kopkanten_area_m2": "if maatwerk_item.kopkanten=true then (2 * maatwerk_item.kopkant_breedte * maatwerk_item.kopkant_hoogte) / 1000000 else 0",
    "kopkanten_length_m1": "if maatwerk_item.kopkanten=true then (2 * (maatwerk_item.kopkant_breedte + maatwerk_item.kopkant_hoogte)) / 1000 else 0",
    "seam_thickness_mm": "maatwerk_item['naad dikte tussen 2 platen kopkant']",
    "front_latafstand_mm": "maatwerk_item.voorzijde_latafstand",
    "underside_latafstand_mm": "maatwerk_item.onderzijde_latafstand"
  },
  "calculation_rules": {
    "hout": {
      "regelwerk": {
        "sectionKey": "regelwerk",
        "logic": "primary latten_samenvatting; fallback geometry",
        "primary_formula": "total_latten_mm = sum(item.lengte_mm * item.aantal from maatwerk_item.latten_samenvatting.totaal.items); stuks = ceil((total_latten_mm * (1 + waste/100)) / material.lengte_mm)",
        "fallback_formula": "rows_per_panel = ceil(panel_height_mm / side_latafstand_mm) + 1; total_latten_mm = sum(rows_per_panel * paneel.lengte); stuks = ceil((total_latten_mm * (1 + waste/100)) / material.lengte_mm)",
        "required_inputs_fallback": [
          "front_latafstand_mm",
          "underside_latafstand_mm",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "pack_handling": "if materiaalnaam matches /(\\d+)\\s*st\\s*per\\s*pak/i then aantal = ceil(stuks / pack_size) else aantal = stuks",
        "wastePercentage": "user_input"
      }
    },
    "isolatie_folies": {
      "folie_buiten": {
        "sectionKey": "folie_buiten",
        "logic": "area based",
        "formula": "bruto_m2 = total_panel_area_m2 + kopkanten_area_m2; netto_m2 = bruto_m2 * (1 + waste/100); dekking_m2 = material.lengte_m * material.breedte_m; aantal = ceil(netto_m2 / dekking_m2)",
        "required_inputs": [
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "isolatie": {
        "sectionKey": "isolatie",
        "logic": "area based with pack detection",
        "formula": "bruto_m2 = total_panel_area_m2 + kopkanten_area_m2; netto_m2 = bruto_m2 * (1 + waste/100); element_m2 = material.lengte_m * material.breedte_m; stuks = ceil(netto_m2 / element_m2)",
        "required_inputs": [
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "pack_handling": "if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = stuks",
        "wastePercentage": "user_input"
      }
    },
    "beplating": {
      "boeiboord_plaat": {
        "sectionKey": "boeiboord_plaat",
        "logic": "visual_center_joint_layout",
        "joint_alignment": "centered",
        "formula": "for each strip: segments_per_strip = ceil((strip_length_mm + seam_thickness_mm) / (sheet_length_mm + seam_thickness_mm)); segment_length_mm = (strip_length_mm - ((segments_per_strip - 1) * seam_thickness_mm)) / segments_per_strip; segments_needed = sum(segments_per_strip); segments_per_lane = floor(sheet_length_mm / segment_length_mm); lanes_per_sheet = floor(sheet_width_mm / strip_height_mm); sheets_layout = ceil(segments_needed / max(1, segments_per_lane * lanes_per_sheet)); sheets_area_guard = ceil(((total_panel_area_m2 + kopkanten_area_m2) * (1 + waste/100)) / ((sheet_length_mm * sheet_width_mm) / 1000000)); aantal = max(sheets_layout, sheets_area_guard)",
        "required_inputs": [
          "material.lengte",
          "material.breedte",
          "maatwerk_item['naad dikte tussen 2 platen kopkant']"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "afwerking": {
      "ventilatieprofiel": {
        "sectionKey": "ventilatieprofiel",
        "logic": "lineair voorzijde + onderzijde",
        "formula": "lineair_m1 = front_length_m1 + underside_length_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "voegband": {
        "sectionKey": "voegband",
        "logic": "naadlengte + kopkanten",
        "formula": "seam_m1 = sum((segments_per_strip - 1) * strip_height_mm / 1000) + kopkanten_length_m1; aantal = ceil((seam_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "material.lengte",
          "maatwerk_item['naad dikte tussen 2 platen kopkant']"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "eindprofiel": {
        "sectionKey": "eindprofiel",
        "logic": "kopkanten afsluiting",
        "formula": "lineair_m1 = kopkanten_length_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "afwerk_profiel": {
        "sectionKey": "afwerk_profiel",
        "logic": "zichtbare randen",
        "formula": "lineair_m1 = front_length_m1 + underside_length_m1 + kopkanten_length_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "bevestiging": {
        "sectionKey": "bevestiging",
        "logic": "verbruik gestuurd",
        "formula": "if material.verbruik exists then totaal = cladding_m2 * verbruik; else requires_manual_input",
        "pack_handling": "if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)",
        "wastePercentage": "user_input"
      }
    },
    "daktrim": {
      "daktrim": {
        "sectionKey": "daktrim",
        "logic": "lineair voorzijde",
        "formula": "lineair_m1 = front_length_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    }
  }
}$kr$::jsonb),
  ('boeiboorden-rockpanel', 'boeiboorden-rockpanel', $kr${
  "meta": {
    "description": "Boeidelen (Rockpanel) - Vervangen door Rockpanel",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "boeiboorden-rockpanel",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "panel_source_priority": [
      "maatwerk_item.boeiboord_panelen",
      "legacy_virtual_panels_from_raw_fields"
    ],
    "legacy_virtual_panels_from_raw_fields": "if boeiboord_panelen ontbreekt: maak panelen uit lengte/hoogte (voorzijde) en lengte_onderzijde||lengte + breedte (onderzijde), met boeiboord_aantallen of boeiboord_mirror",
    "panel_height_mm": "paneel.hoogte ?? paneel.breedte",
    "panel_area_m2": "(paneel.lengte * panel_height_mm) / 1000000",
    "total_panel_area_m2": "sum(panel_area_m2)",
    "front_length_m1": "sum(paneel.lengte where paneel.zijde='voorzijde') / 1000",
    "underside_length_m1": "sum(paneel.lengte where paneel.zijde='onderzijde') / 1000",
    "kopkanten_area_m2": "if maatwerk_item.kopkanten=true then (2 * maatwerk_item.kopkant_breedte * maatwerk_item.kopkant_hoogte) / 1000000 else 0",
    "kopkanten_length_m1": "if maatwerk_item.kopkanten=true then (2 * (maatwerk_item.kopkant_breedte + maatwerk_item.kopkant_hoogte)) / 1000 else 0",
    "seam_thickness_mm": "maatwerk_item['naad dikte tussen 2 platen kopkant']",
    "front_latafstand_mm": "maatwerk_item.voorzijde_latafstand",
    "underside_latafstand_mm": "maatwerk_item.onderzijde_latafstand"
  },
  "calculation_rules": {
    "hout": {
      "regelwerk": {
        "sectionKey": "regelwerk",
        "logic": "primary latten_samenvatting; fallback geometry",
        "primary_formula": "total_latten_mm = sum(item.lengte_mm * item.aantal from maatwerk_item.latten_samenvatting.totaal.items); stuks = ceil((total_latten_mm * (1 + waste/100)) / material.lengte_mm)",
        "fallback_formula": "rows_per_panel = ceil(panel_height_mm / side_latafstand_mm) + 1; total_latten_mm = sum(rows_per_panel * paneel.lengte); stuks = ceil((total_latten_mm * (1 + waste/100)) / material.lengte_mm)",
        "required_inputs_fallback": [
          "front_latafstand_mm",
          "underside_latafstand_mm",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "pack_handling": "if materiaalnaam matches /(\\d+)\\s*st\\s*per\\s*pak/i then aantal = ceil(stuks / pack_size) else aantal = stuks",
        "wastePercentage": "user_input"
      }
    },
    "isolatie_folies": {
      "folie_buiten": {
        "sectionKey": "folie_buiten",
        "logic": "area based",
        "formula": "bruto_m2 = total_panel_area_m2 + kopkanten_area_m2; netto_m2 = bruto_m2 * (1 + waste/100); dekking_m2 = material.lengte_m * material.breedte_m; aantal = ceil(netto_m2 / dekking_m2)",
        "required_inputs": [
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "isolatie": {
        "sectionKey": "isolatie",
        "logic": "area based with pack detection",
        "formula": "bruto_m2 = total_panel_area_m2 + kopkanten_area_m2; netto_m2 = bruto_m2 * (1 + waste/100); element_m2 = material.lengte_m * material.breedte_m; stuks = ceil(netto_m2 / element_m2)",
        "required_inputs": [
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "pack_handling": "if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = stuks",
        "wastePercentage": "user_input"
      }
    },
    "beplating": {
      "boeiboord_plaat": {
        "sectionKey": "boeiboord_plaat",
        "logic": "visual_center_joint_layout",
        "joint_alignment": "centered",
        "formula": "for each strip: segments_per_strip = ceil((strip_length_mm + seam_thickness_mm) / (sheet_length_mm + seam_thickness_mm)); segment_length_mm = (strip_length_mm - ((segments_per_strip - 1) * seam_thickness_mm)) / segments_per_strip; segments_needed = sum(segments_per_strip); segments_per_lane = floor(sheet_length_mm / segment_length_mm); lanes_per_sheet = floor(sheet_width_mm / strip_height_mm); sheets_layout = ceil(segments_needed / max(1, segments_per_lane * lanes_per_sheet)); sheets_area_guard = ceil(((total_panel_area_m2 + kopkanten_area_m2) * (1 + waste/100)) / ((sheet_length_mm * sheet_width_mm) / 1000000)); aantal = max(sheets_layout, sheets_area_guard)",
        "required_inputs": [
          "material.lengte",
          "material.breedte",
          "maatwerk_item['naad dikte tussen 2 platen kopkant']"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "afwerking": {
      "ventilatieprofiel": {
        "sectionKey": "ventilatieprofiel",
        "logic": "lineair voorzijde + onderzijde",
        "formula": "lineair_m1 = front_length_m1 + underside_length_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "voegband": {
        "sectionKey": "voegband",
        "logic": "naadlengte + kopkanten",
        "formula": "seam_m1 = sum((segments_per_strip - 1) * strip_height_mm / 1000) + kopkanten_length_m1; aantal = ceil((seam_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "material.lengte",
          "maatwerk_item['naad dikte tussen 2 platen kopkant']"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "eindprofiel": {
        "sectionKey": "eindprofiel",
        "logic": "kopkanten afsluiting",
        "formula": "lineair_m1 = kopkanten_length_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "afwerk_profiel": {
        "sectionKey": "afwerk_profiel",
        "logic": "zichtbare randen",
        "formula": "lineair_m1 = front_length_m1 + underside_length_m1 + kopkanten_length_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "bevestiging": {
        "sectionKey": "bevestiging",
        "logic": "verbruik gestuurd",
        "formula": "if material.verbruik exists then totaal = cladding_m2 * verbruik; else requires_manual_input",
        "pack_handling": "if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)",
        "wastePercentage": "user_input"
      }
    },
    "daktrim": {
      "daktrim": {
        "sectionKey": "daktrim",
        "logic": "lineair voorzijde",
        "formula": "lineair_m1 = front_length_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    }
  }
}$kr$::jsonb),
  ('boeiboorden-hout', 'boeiboorden-hout', $kr${
  "meta": {
    "description": "Boeidelen (Hout) - Vervangen door Hardhout/Meranti",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "boeiboorden-hout",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "panel_source_priority": [
      "maatwerk_item.boeiboord_panelen",
      "legacy_virtual_panels_from_raw_fields"
    ],
    "legacy_virtual_panels_from_raw_fields": "if boeiboord_panelen ontbreekt: maak panelen uit lengte/hoogte (voorzijde) en lengte_onderzijde||lengte + breedte (onderzijde), met boeiboord_aantallen of boeiboord_mirror",
    "panel_height_mm": "paneel.hoogte ?? paneel.breedte",
    "panel_area_m2": "(paneel.lengte * panel_height_mm) / 1000000",
    "total_panel_area_m2": "sum(panel_area_m2)",
    "front_length_m1": "sum(paneel.lengte where paneel.zijde='voorzijde') / 1000",
    "underside_length_m1": "sum(paneel.lengte where paneel.zijde='onderzijde') / 1000",
    "kopkanten_area_m2": "if maatwerk_item.kopkanten=true then (2 * maatwerk_item.kopkant_breedte * maatwerk_item.kopkant_hoogte) / 1000000 else 0",
    "kopkanten_length_m1": "if maatwerk_item.kopkanten=true then (2 * (maatwerk_item.kopkant_breedte + maatwerk_item.kopkant_hoogte)) / 1000 else 0",
    "seam_thickness_mm": "maatwerk_item['naad dikte tussen 2 platen kopkant']",
    "front_latafstand_mm": "maatwerk_item.voorzijde_latafstand",
    "underside_latafstand_mm": "maatwerk_item.onderzijde_latafstand"
  },
  "calculation_rules": {
    "hout": {
      "regelwerk": {
        "sectionKey": "regelwerk",
        "logic": "primary latten_samenvatting; fallback geometry",
        "primary_formula": "total_latten_mm = sum(item.lengte_mm * item.aantal from maatwerk_item.latten_samenvatting.totaal.items); stuks = ceil((total_latten_mm * (1 + waste/100)) / material.lengte_mm)",
        "fallback_formula": "rows_per_panel = ceil(panel_height_mm / side_latafstand_mm) + 1; total_latten_mm = sum(rows_per_panel * paneel.lengte); stuks = ceil((total_latten_mm * (1 + waste/100)) / material.lengte_mm)",
        "required_inputs_fallback": [
          "front_latafstand_mm",
          "underside_latafstand_mm",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "pack_handling": "if materiaalnaam matches /(\\d+)\\s*st\\s*per\\s*pak/i then aantal = ceil(stuks / pack_size) else aantal = stuks",
        "wastePercentage": "user_input"
      }
    },
    "isolatie_folies": {
      "folie_buiten": {
        "sectionKey": "folie_buiten",
        "logic": "area based",
        "formula": "bruto_m2 = total_panel_area_m2 + kopkanten_area_m2; netto_m2 = bruto_m2 * (1 + waste/100); dekking_m2 = material.lengte_m * material.breedte_m; aantal = ceil(netto_m2 / dekking_m2)",
        "required_inputs": [
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "isolatie": {
        "sectionKey": "isolatie",
        "logic": "area based with pack detection",
        "formula": "bruto_m2 = total_panel_area_m2 + kopkanten_area_m2; netto_m2 = bruto_m2 * (1 + waste/100); element_m2 = material.lengte_m * material.breedte_m; stuks = ceil(netto_m2 / element_m2)",
        "required_inputs": [
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "pack_handling": "if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = stuks",
        "wastePercentage": "user_input"
      }
    },
    "beplating": {
      "boeiboord_hout": {
        "sectionKey": "boeiboord_hout",
        "logic": "visual_center_joint_layout",
        "joint_alignment": "centered",
        "formula": "for each strip: segments_per_strip = ceil((strip_length_mm + seam_thickness_mm) / (sheet_length_mm + seam_thickness_mm)); segment_length_mm = (strip_length_mm - ((segments_per_strip - 1) * seam_thickness_mm)) / segments_per_strip; segments_needed = sum(segments_per_strip); segments_per_lane = floor(sheet_length_mm / segment_length_mm); lanes_per_sheet = floor(sheet_width_mm / strip_height_mm); sheets_layout = ceil(segments_needed / max(1, segments_per_lane * lanes_per_sheet)); sheets_area_guard = ceil(((total_panel_area_m2 + kopkanten_area_m2) * (1 + waste/100)) / ((sheet_length_mm * sheet_width_mm) / 1000000)); aantal = max(sheets_layout, sheets_area_guard)",
        "required_inputs": [
          "material.lengte",
          "material.breedte",
          "maatwerk_item['naad dikte tussen 2 platen kopkant']"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "afwerking": {
      "ventilatieprofiel": {
        "sectionKey": "ventilatieprofiel",
        "logic": "lineair voorzijde + onderzijde",
        "formula": "lineair_m1 = front_length_m1 + underside_length_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "voegband": {
        "sectionKey": "voegband",
        "logic": "naadlengte + kopkanten",
        "formula": "seam_m1 = sum((segments_per_strip - 1) * strip_height_mm / 1000) + kopkanten_length_m1; aantal = ceil((seam_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "material.lengte",
          "maatwerk_item['naad dikte tussen 2 platen kopkant']"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "eindprofiel": {
        "sectionKey": "eindprofiel",
        "logic": "kopkanten afsluiting",
        "formula": "lineair_m1 = kopkanten_length_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "bevestiging": {
        "sectionKey": "bevestiging",
        "logic": "verbruik gestuurd",
        "formula": "if material.verbruik exists then totaal = cladding_m2 * verbruik; else requires_manual_input",
        "pack_handling": "if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)",
        "wastePercentage": "user_input"
      },
      "afwerklatten": {
        "sectionKey": "afwerklatten",
        "logic": "zichtbare randen",
        "formula": "lineair_m1 = front_length_m1 + underside_length_m1 + kopkanten_length_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "daktrim": {
      "daktrim": {
        "sectionKey": "daktrim",
        "logic": "lineair voorzijde",
        "formula": "lineair_m1 = front_length_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    }
  }
}$kr$::jsonb),
  ('boeiboorden-keralit', 'boeiboorden-keralit', $kr${
  "meta": {
    "description": "Boeidelen (Keralit) - Vervangen door Keralit",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "boeiboorden-keralit",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "panel_source_priority": [
      "maatwerk_item.boeiboord_panelen",
      "legacy_virtual_panels_from_raw_fields"
    ],
    "legacy_virtual_panels_from_raw_fields": "if boeiboord_panelen ontbreekt: maak panelen uit lengte/hoogte (voorzijde) en lengte_onderzijde||lengte + breedte (onderzijde), met boeiboord_aantallen of boeiboord_mirror",
    "panel_height_mm": "paneel.hoogte ?? paneel.breedte",
    "panel_area_m2": "(paneel.lengte * panel_height_mm) / 1000000",
    "total_panel_area_m2": "sum(panel_area_m2)",
    "front_length_m1": "sum(paneel.lengte where paneel.zijde='voorzijde') / 1000",
    "underside_length_m1": "sum(paneel.lengte where paneel.zijde='onderzijde') / 1000",
    "kopkanten_area_m2": "if maatwerk_item.kopkanten=true then (2 * maatwerk_item.kopkant_breedte * maatwerk_item.kopkant_hoogte) / 1000000 else 0",
    "kopkanten_length_m1": "if maatwerk_item.kopkanten=true then (2 * (maatwerk_item.kopkant_breedte + maatwerk_item.kopkant_hoogte)) / 1000 else 0",
    "seam_thickness_mm": "maatwerk_item['naad dikte tussen 2 platen kopkant']",
    "front_latafstand_mm": "maatwerk_item.voorzijde_latafstand",
    "underside_latafstand_mm": "maatwerk_item.onderzijde_latafstand"
  },
  "calculation_rules": {
    "hout": {
      "regelwerk": {
        "sectionKey": "regelwerk",
        "logic": "primary latten_samenvatting; fallback geometry",
        "primary_formula": "total_latten_mm = sum(item.lengte_mm * item.aantal from maatwerk_item.latten_samenvatting.totaal.items); stuks = ceil((total_latten_mm * (1 + waste/100)) / material.lengte_mm)",
        "fallback_formula": "rows_per_panel = ceil(panel_height_mm / side_latafstand_mm) + 1; total_latten_mm = sum(rows_per_panel * paneel.lengte); stuks = ceil((total_latten_mm * (1 + waste/100)) / material.lengte_mm)",
        "required_inputs_fallback": [
          "front_latafstand_mm",
          "underside_latafstand_mm",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "pack_handling": "if materiaalnaam matches /(\\d+)\\s*st\\s*per\\s*pak/i then aantal = ceil(stuks / pack_size) else aantal = stuks",
        "wastePercentage": "user_input"
      }
    },
    "isolatie_folies": {
      "folie_buiten": {
        "sectionKey": "folie_buiten",
        "logic": "area based",
        "formula": "bruto_m2 = total_panel_area_m2 + kopkanten_area_m2; netto_m2 = bruto_m2 * (1 + waste/100); dekking_m2 = material.lengte_m * material.breedte_m; aantal = ceil(netto_m2 / dekking_m2)",
        "required_inputs": [
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "isolatie": {
        "sectionKey": "isolatie",
        "logic": "area based with pack detection",
        "formula": "bruto_m2 = total_panel_area_m2 + kopkanten_area_m2; netto_m2 = bruto_m2 * (1 + waste/100); element_m2 = material.lengte_m * material.breedte_m; stuks = ceil(netto_m2 / element_m2)",
        "required_inputs": [
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "pack_handling": "if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = stuks",
        "wastePercentage": "user_input"
      }
    },
    "beplating": {
      "keralit_panelen": {
        "sectionKey": "keralit_panelen",
        "logic": "visual_center_joint_layout",
        "joint_alignment": "centered",
        "formula": "for each strip: segments_per_strip = ceil((strip_length_mm + seam_thickness_mm) / (sheet_length_mm + seam_thickness_mm)); segment_length_mm = (strip_length_mm - ((segments_per_strip - 1) * seam_thickness_mm)) / segments_per_strip; segments_needed = sum(segments_per_strip); segments_per_lane = floor(sheet_length_mm / segment_length_mm); lanes_per_sheet = floor(sheet_width_mm / strip_height_mm); sheets_layout = ceil(segments_needed / max(1, segments_per_lane * lanes_per_sheet)); sheets_area_guard = ceil(((total_panel_area_m2 + kopkanten_area_m2) * (1 + waste/100)) / ((sheet_length_mm * sheet_width_mm) / 1000000)); aantal = max(sheets_layout, sheets_area_guard)",
        "required_inputs": [
          "material.lengte",
          "material.breedte",
          "maatwerk_item['naad dikte tussen 2 platen kopkant']"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "afwerking": {
      "ventilatieprofiel": {
        "sectionKey": "ventilatieprofiel",
        "logic": "lineair voorzijde + onderzijde",
        "formula": "lineair_m1 = front_length_m1 + underside_length_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "voegband": {
        "sectionKey": "voegband",
        "logic": "naadlengte + kopkanten",
        "formula": "seam_m1 = sum((segments_per_strip - 1) * strip_height_mm / 1000) + kopkanten_length_m1; aantal = ceil((seam_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "material.lengte",
          "maatwerk_item['naad dikte tussen 2 platen kopkant']"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "eindprofiel": {
        "sectionKey": "eindprofiel",
        "logic": "kopkanten afsluiting",
        "formula": "lineair_m1 = kopkanten_length_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "bevestiging": {
        "sectionKey": "bevestiging",
        "logic": "verbruik gestuurd",
        "formula": "if material.verbruik exists then totaal = cladding_m2 * verbruik; else requires_manual_input",
        "pack_handling": "if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)",
        "wastePercentage": "user_input"
      },
      "keralit_profielen": {
        "sectionKey": "keralit_profielen",
        "logic": "zichtbare randen",
        "formula": "lineair_m1 = front_length_m1 + underside_length_m1 + kopkanten_length_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "daktrim": {
      "daktrim": {
        "sectionKey": "daktrim",
        "logic": "lineair voorzijde",
        "formula": "lineair_m1 = front_length_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
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

-- Verificatie: alle boeiboord-slugs moeten 10 sectionKeys hebben.
SELECT
  kr.klus_regels->>'slug' AS slug,
  COUNT(*) FILTER (WHERE rule_obj ? 'sectionKey') AS sectionkey_count
FROM public.klus_regels kr
CROSS JOIN LATERAL jsonb_each(kr.klus_regels->'calculation_rules') AS topcat(top_key, top_val)
CROSS JOIN LATERAL jsonb_each(top_val) AS rule(rule_key, rule_obj)
WHERE kr.klus_regels->>'slug' IN (
  'boeiboorden-trespa',
  'boeiboorden-rockpanel',
  'boeiboorden-hout',
  'boeiboorden-keralit'
)
GROUP BY kr.klus_regels->>'slug'
ORDER BY slug;
