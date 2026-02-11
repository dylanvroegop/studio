-- Dakrenovatie regels (Pannen / EPDM / Golfplaat)
-- Source of truth: src/lib/klus-regels-static.ts

WITH input_rows(slug, klus_type, klus_regels) AS (
VALUES
  ('hellend-dak', 'hellend-dak', $kr${
  "meta": {
    "description": "Dakrenovatie - Hellend dak (pannen)",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "hellend-dak",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "dak_lengte_mm": "maatwerk_item.lengte",
    "dak_hoogte_mm": "maatwerk_item.hoogte",
    "tengelafstand_mm": "maatwerk_item.balkafstand",
    "panlatafstand_mm": "maatwerk_item.latafstand",
    "openings_source": "maatwerk_item.openings",
    "opening_width_mm": "opening.openingWidth ?? opening.width",
    "opening_height_mm": "opening.openingHeight ?? opening.height",
    "openingen_m2": "sum((opening_width_mm * opening_height_mm) / 1000000 for opening in openings_source)",
    "dak_bruto_m2": "(dak_lengte_mm * dak_hoogte_mm) / 1000000",
    "dak_netto_m2": "max(0, dak_bruto_m2 - openingen_m2)"
  },
  "calculation_rules": {
    "beplating": {
      "constructieplaat": {
        "sectionKey": "constructieplaat",
        "logic": "oppervlakte dakvlak minus openingen",
        "formula": "plaat_m2 = material.lengte_m * material.breedte_m; aantal = ceil((dak_netto_m2 * (1 + waste/100)) / plaat_m2)",
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
    "isolatie": {
      "isolatie_dak": {
        "sectionKey": "isolatie_dak",
        "logic": "oppervlakte dakvlak minus openingen met pack-detectie",
        "formula": "element_m2 = material.lengte_m * material.breedte_m; stuks = ceil((dak_netto_m2 * (1 + waste/100)) / element_m2)",
        "pack_handling": "if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = stuks",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "folie_buiten": {
        "sectionKey": "folie_buiten",
        "logic": "oppervlakte dakvlak minus openingen",
        "formula": "dekkings_m2 = material.lengte_m * material.breedte_m; aantal = ceil((dak_netto_m2 * (1 + waste/100)) / dekkings_m2)",
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
    "hout": {
      "tengels": {
        "sectionKey": "tengels",
        "logic": "verticale regels op tengelafstand (h.o.h.)",
        "formula": "count = ceil(dak_lengte_mm / tengelafstand_mm) + 1; totaal_mm = count * dak_hoogte_mm; aantal = ceil((totaal_mm * (1 + waste/100)) / material.lengte_mm)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "maatwerk_item.balkafstand",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "panlatten": {
        "sectionKey": "panlatten",
        "logic": "horizontale panlatten op panlatafstand (h.o.h.)",
        "formula": "count = ceil(dak_hoogte_mm / panlatafstand_mm) + 1; totaal_mm = count * dak_lengte_mm; aantal = ceil((totaal_mm * (1 + waste/100)) / material.lengte_mm)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "maatwerk_item.latafstand",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "ruiter": {
        "sectionKey": "ruiter",
        "logic": "lineair over de nok",
        "formula": "lineair_m1 = dak_lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "dak": {
      "dakvoetprofiel": {
        "sectionKey": "dakvoetprofiel",
        "logic": "lineair langs de dakvoet",
        "formula": "lineair_m1 = dak_lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "dakpannen": {
        "sectionKey": "dakpannen",
        "logic": "primair op aantal pannen (breedte x hoogte), fallback op m2-dekking",
        "formula": "if maatwerk_item.aantal_pannen_breedte && maatwerk_item.aantal_pannen_hoogte then stuks = maatwerk_item.aantal_pannen_breedte * maatwerk_item.aantal_pannen_hoogte; else if material.dekking_m2 exists then stuks = ceil(dak_netto_m2 / material.dekking_m2); else requires_manual_input; aantal = ceil(stuks * (1 + waste/100))",
        "required_inputs": [
          "maatwerk_item.aantal_pannen_breedte || material.dekking_m2",
          "maatwerk_item.aantal_pannen_hoogte || material.dekking_m2"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "gevelpannen": {
        "sectionKey": "gevelpannen",
        "logic": "2 gevelranden op aantal pannenhoogte",
        "formula": "if maatwerk_item.aantal_pannen_hoogte exists then stuks = 2 * maatwerk_item.aantal_pannen_hoogte; else requires_manual_input; aantal = ceil(stuks * (1 + waste/100))",
        "required_inputs": [
          "maatwerk_item.aantal_pannen_hoogte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "ondervorst": {
        "sectionKey": "ondervorst",
        "logic": "lineair over de nok",
        "formula": "lineair_m1 = dak_lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "nokvorsten": {
        "sectionKey": "nokvorsten",
        "logic": "lineair over de nok",
        "formula": "lineair_m1 = dak_lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "afwerking_dak": {
      "lood": {
        "sectionKey": "lood",
        "logic": "lineair langs beide zijkanten van dakvlak",
        "formula": "lineair_m1 = (2 * dak_hoogte_mm) / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.hoogte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "dakgoot": {
        "sectionKey": "dakgoot",
        "logic": "lineair langs dakvoet",
        "formula": "lineair_m1 = dak_lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "nok_kit": {
        "sectionKey": "nok_kit",
        "logic": "verbruik per meter over de nok",
        "formula": "lineair_m1 = dak_lengte_mm / 1000; if material.verbruik_per_m1 || material.verbruik exists then totaal = lineair_m1 * (1 + waste/100) * (material.verbruik_per_m1 ?? material.verbruik); else requires_manual_input",
        "pack_handling": "if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "material.verbruik_per_m1 || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "boeiboord": {
      "boeiboord_placeholder": {
        "sectionKey": "boeiboord_placeholder",
        "logic": "optionele post, alleen op expliciete invoer",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else requires_manual_input",
        "required_inputs": [
          "material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    }
  }
}$kr$::jsonb),
  ('epdm-dakbedekking', 'epdm-dakbedekking', $kr${
  "meta": {
    "description": "Dakrenovatie - EPDM",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "epdm-dakbedekking",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "dak_lengte_mm": "maatwerk_item.lengte",
    "dak_hoogte_mm": "maatwerk_item.hoogte",
    "dakrand_breedte_mm": "maatwerk_item.dakrand_breedte",
    "edge_top": "maatwerk_item.edge_top",
    "edge_bottom": "maatwerk_item.edge_bottom",
    "edge_left": "maatwerk_item.edge_left",
    "edge_right": "maatwerk_item.edge_right",
    "openings_source": "maatwerk_item.openings",
    "opening_width_mm": "opening.openingWidth ?? opening.width",
    "opening_height_mm": "opening.openingHeight ?? opening.height",
    "openingen_m2": "sum((opening_width_mm * opening_height_mm) / 1000000 for opening in openings_source)",
    "dak_bruto_m2": "(dak_lengte_mm * dak_hoogte_mm) / 1000000",
    "dak_netto_m2": "max(0, dak_bruto_m2 - openingen_m2)",
    "perimeter_mm": "(2 * dak_lengte_mm) + (2 * dak_hoogte_mm)",
    "opstand_m2": "(perimeter_mm * dakrand_breedte_mm) / 1000000",
    "basis_m2": "dak_netto_m2 + opstand_m2"
  },
  "calculation_rules": {
    "beplating": {
      "constructieplaat": {
        "sectionKey": "constructieplaat",
        "logic": "oppervlakte dakvlak minus openingen",
        "formula": "plaat_m2 = material.lengte_m * material.breedte_m; aantal = ceil((dak_netto_m2 * (1 + waste/100)) / plaat_m2)",
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
    "isolatie": {
      "folie_binnen": {
        "sectionKey": "folie_binnen",
        "logic": "oppervlakte dakvlak minus openingen",
        "formula": "dekkings_m2 = material.lengte_m * material.breedte_m; aantal = ceil((dak_netto_m2 * (1 + waste/100)) / dekkings_m2)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "isolatie_dak": {
        "sectionKey": "isolatie_dak",
        "logic": "oppervlakte dakvlak minus openingen met pack-detectie",
        "formula": "element_m2 = material.lengte_m * material.breedte_m; stuks = ceil((dak_netto_m2 * (1 + waste/100)) / element_m2)",
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
    "dak": {
      "epdm_folie": {
        "sectionKey": "epdm_folie",
        "logic": "dakvlak plus opstand op basis van dakrandbreedte",
        "formula": "dekking_m2 = material.dekking_m2 ?? (material.lengte_m * material.breedte_m); aantal = ceil((basis_m2 * (1 + waste/100)) / dekking_m2)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "maatwerk_item.dakrand_breedte",
          "material.lengte || material.dekking_m2"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "epdm_lijm": {
        "sectionKey": "epdm_lijm",
        "logic": "verbruik per m2 op EPDM totaaloppervlak",
        "formula": "if material.verbruik_per_m2 || material.verbruik exists then totaal = basis_m2 * (1 + waste/100) * (material.verbruik_per_m2 ?? material.verbruik); else requires_manual_input",
        "pack_handling": "if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "maatwerk_item.dakrand_breedte",
          "material.verbruik_per_m2 || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "afwerking_dak": {
      "daktrim": {
        "sectionKey": "daktrim",
        "logic": "lineair over vrije randen",
        "formula": "free_top_mm = (maatwerk_item.edge_top == 'free' ? dak_lengte_mm : 0); free_bottom_mm = (maatwerk_item.edge_bottom == 'free' ? dak_lengte_mm : 0); free_left_mm = (maatwerk_item.edge_left == 'free' ? dak_hoogte_mm : 0); free_right_mm = (maatwerk_item.edge_right == 'free' ? dak_hoogte_mm : 0); lineair_m1 = (free_top_mm + free_bottom_mm + free_left_mm + free_right_mm) / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "maatwerk_item.edge_top",
          "maatwerk_item.edge_bottom",
          "maatwerk_item.edge_left",
          "maatwerk_item.edge_right",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "daktrim_hoeken": {
        "sectionKey": "daktrim_hoeken",
        "logic": "hoekstukken alleen op expliciete invoer",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else requires_manual_input",
        "required_inputs": [
          "material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "hwa_uitloop": {
        "sectionKey": "hwa_uitloop",
        "logic": "aantal uitlopen alleen op expliciete invoer",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else requires_manual_input",
        "required_inputs": [
          "material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "lood": {
        "sectionKey": "lood",
        "logic": "lineair over randen die tegen gevel/muur liggen",
        "formula": "wall_top_mm = (maatwerk_item.edge_top == 'wall' ? dak_lengte_mm : 0); wall_bottom_mm = (maatwerk_item.edge_bottom == 'wall' ? dak_lengte_mm : 0); wall_left_mm = (maatwerk_item.edge_left == 'wall' ? dak_hoogte_mm : 0); wall_right_mm = (maatwerk_item.edge_right == 'wall' ? dak_hoogte_mm : 0); lineair_m1 = (wall_top_mm + wall_bottom_mm + wall_left_mm + wall_right_mm) / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "maatwerk_item.edge_top",
          "maatwerk_item.edge_bottom",
          "maatwerk_item.edge_left",
          "maatwerk_item.edge_right",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "boeiboord": {
      "boeiboord_placeholder": {
        "sectionKey": "boeiboord_placeholder",
        "logic": "optionele post, alleen op expliciete invoer",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else requires_manual_input",
        "required_inputs": [
          "material.aantal"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    }
  }
}$kr$::jsonb),
  ('golfplaat-dak', 'golfplaat-dak', $kr${
  "meta": {
    "description": "Dakrenovatie - Golfplaat",
    "version": 1,
    "strategy": "input_driven_no_hardcoded_defaults"
  },
  "slug": "golfplaat-dak",
  "input_mapping": {
    "maatwerk_item": "body.quote.klussen[*].maatwerk.basis.items[0]",
    "material_entry": "body.quote.klussen[*].materialen.materialen_lijst[*]",
    "section_key": "body.quote.klussen[*].materialen.materialen_lijst[*].sectionKey",
    "waste": "body.quote.klussen[*].materialen.materialen_lijst[*].wastePercentage"
  },
  "derived_inputs": {
    "dak_lengte_mm": "maatwerk_item.lengte",
    "dak_hoogte_mm": "maatwerk_item.hoogte",
    "gordingafstand_mm": "maatwerk_item.balkafstand",
    "tengelafstand_mm": "maatwerk_item.latafstand",
    "openings_source": "maatwerk_item.openings",
    "opening_width_mm": "opening.openingWidth ?? opening.width",
    "opening_height_mm": "opening.openingHeight ?? opening.height",
    "openingen_m2": "sum((opening_width_mm * opening_height_mm) / 1000000 for opening in openings_source)",
    "dak_bruto_m2": "(dak_lengte_mm * dak_hoogte_mm) / 1000000",
    "dak_netto_m2": "max(0, dak_bruto_m2 - openingen_m2)"
  },
  "calculation_rules": {
    "hout": {
      "gordingen": {
        "sectionKey": "gordingen",
        "logic": "horizontale dragers op balkafstand (h.o.h.)",
        "formula": "count = ceil(dak_hoogte_mm / gordingafstand_mm) + 1; totaal_mm = count * dak_lengte_mm; aantal = ceil((totaal_mm * (1 + waste/100)) / material.lengte_mm)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "maatwerk_item.balkafstand",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "tengels": {
        "sectionKey": "tengels",
        "logic": "verticale regels op latafstand (h.o.h.)",
        "formula": "count = ceil(dak_lengte_mm / tengelafstand_mm) + 1; totaal_mm = count * dak_hoogte_mm; aantal = ceil((totaal_mm * (1 + waste/100)) / material.lengte_mm)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "maatwerk_item.latafstand",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "isolatie": {
      "isolatie_dak": {
        "sectionKey": "isolatie_dak",
        "logic": "oppervlakte dakvlak minus openingen met pack-detectie",
        "formula": "element_m2 = material.lengte_m * material.breedte_m; stuks = ceil((dak_netto_m2 * (1 + waste/100)) / element_m2)",
        "pack_handling": "if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = stuks",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "material.lengte",
          "material.breedte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "folie": {
        "sectionKey": "folie",
        "logic": "oppervlakte dakvlak minus openingen",
        "formula": "dekkings_m2 = material.lengte_m * material.breedte_m; aantal = ceil((dak_netto_m2 * (1 + waste/100)) / dekkings_m2)",
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
    "dak": {
      "golfplaten": {
        "sectionKey": "golfplaten",
        "logic": "vlakvulling op werkende breedte, fallback op m2",
        "formula": "if material.werkende_breedte_mm exists then rows = ceil(dak_hoogte_mm / material.werkende_breedte_mm); cols = ceil(dak_lengte_mm / material.lengte_mm); stuks = rows * cols; else plaat_m2 = material.lengte_m * material.breedte_m; stuks = ceil(dak_netto_m2 / plaat_m2); aantal = ceil(stuks * (1 + waste/100))",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "lichtplaten": {
        "sectionKey": "lichtplaten",
        "logic": "op expliciete invoer of op aantal dakraam-openingen",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else if count(openings where opening.type == 'dakraam') > 0 then aantal = count(openings where opening.type == 'dakraam'); else requires_manual_input",
        "required_inputs": [
          "material.aantal || maatwerk_item.openings"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "nokstukken": {
        "sectionKey": "nokstukken",
        "logic": "lineair over de nok",
        "formula": "lineair_m1 = dak_lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "hoekstukken": {
        "sectionKey": "hoekstukken",
        "logic": "lineair over linker + rechter zijkant",
        "formula": "lineair_m1 = (2 * dak_hoogte_mm) / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.hoogte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      }
    },
    "afwerking_dak": {
      "golfplaatschroeven": {
        "sectionKey": "golfplaatschroeven",
        "logic": "verbruik per m2 op netto dakvlak",
        "formula": "if material.verbruik_per_m2 || material.verbruik exists then totaal = dak_netto_m2 * (1 + waste/100) * (material.verbruik_per_m2 ?? material.verbruik); else requires_manual_input",
        "pack_handling": "if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "maatwerk_item.hoogte",
          "material.verbruik_per_m2 || material.verbruik"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "dakgoot": {
        "sectionKey": "dakgoot",
        "logic": "lineair langs dakvoet",
        "formula": "lineair_m1 = dak_lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
        "required_inputs": [
          "maatwerk_item.lengte",
          "material.lengte"
        ],
        "missing_input_behavior": "requires_manual_input",
        "wastePercentage": "user_input"
      },
      "hwa": {
        "sectionKey": "hwa",
        "logic": "aantal afvoeren alleen op expliciete invoer",
        "formula": "if material.aantal exists then aantal = ceil(material.aantal); else requires_manual_input",
        "required_inputs": [
          "material.aantal"
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

-- Verificatie: sectionKey-aantallen per dakvariant.
SELECT
  kr.klus_regels->>'slug' AS slug,
  COUNT(*) FILTER (WHERE rule_obj ? 'sectionKey') AS sectionkey_count
FROM public.klus_regels kr
CROSS JOIN LATERAL jsonb_each(kr.klus_regels->'calculation_rules') AS topcat(top_key, top_val)
CROSS JOIN LATERAL jsonb_each(top_val) AS rule(rule_key, rule_obj)
WHERE kr.klus_regels->>'slug' IN (
  'hellend-dak',
  'epdm-dakbedekking',
  'golfplaat-dak'
)
GROUP BY kr.klus_regels->>'slug'
ORDER BY slug;
