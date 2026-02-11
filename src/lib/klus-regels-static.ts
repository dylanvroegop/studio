export const KLUS_REGELS_STATIC_VERSION = 1;

export interface MaterialRuleMeta {
  source: 'static_file';
  slug: string;
  sectionKey: string | null;
  version: number;
  status?: 'resolved' | 'missing';
}

export interface MaterialRuleAttachment {
  rule: Record<string, any> | null;
  rule_meta: MaterialRuleMeta;
}

function createBoeiboordRuleSet(config: {
  sectionKeyBeplating: 'boeiboord_plaat' | 'boeiboord_hout' | 'keralit_panelen';
  sectionKeyAfwerking: 'afwerk_profiel' | 'afwerklatten' | 'keralit_profielen';
}): Record<string, Record<string, any>> {
  return {
    regelwerk: {
      sectionKey: 'regelwerk',
      logic: 'primary latten_samenvatting; fallback geometry',
      primary_formula: 'total_latten_mm = sum(item.lengte_mm * item.aantal from maatwerk_item.latten_samenvatting.totaal.items); stuks = ceil((total_latten_mm * (1 + waste/100)) / material.lengte_mm)',
      fallback_formula: 'rows_per_panel = ceil(panel_height_mm / side_latafstand_mm) + 1; total_latten_mm = sum(rows_per_panel * paneel.lengte); stuks = ceil((total_latten_mm * (1 + waste/100)) / material.lengte_mm)',
      required_inputs_fallback: [
        'maatwerk_item.voorzijde_latafstand',
        'maatwerk_item.onderzijde_latafstand',
        'material.lengte',
      ],
      missing_input_behavior: 'requires_manual_input',
      pack_handling: 'if materiaalnaam matches /(\\d+)\\s*st\\s*per\\s*pak/i then aantal = ceil(stuks / pack_size) else aantal = stuks',
      wastePercentage: 'user_input',
    },
    folie_buiten: {
      sectionKey: 'folie_buiten',
      logic: 'area based',
      formula: 'bruto_m2 = total_panel_area_m2 + kopkanten_area_m2; netto_m2 = bruto_m2 * (1 + waste/100); dekking_m2 = material.lengte_m * material.breedte_m; aantal = ceil(netto_m2 / dekking_m2)',
      required_inputs: ['material.lengte', 'material.breedte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    isolatie: {
      sectionKey: 'isolatie',
      logic: 'area based with pack detection',
      formula: 'bruto_m2 = total_panel_area_m2 + kopkanten_area_m2; netto_m2 = bruto_m2 * (1 + waste/100); element_m2 = material.lengte_m * material.breedte_m; stuks = ceil(netto_m2 / element_m2)',
      required_inputs: ['material.lengte', 'material.breedte'],
      missing_input_behavior: 'requires_manual_input',
      pack_handling: 'if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = stuks',
      wastePercentage: 'user_input',
    },
    [config.sectionKeyBeplating]: {
      sectionKey: config.sectionKeyBeplating,
      logic: 'visual_center_joint_layout',
      joint_alignment: 'centered',
      formula: 'for each strip: segments_per_strip = ceil((strip_length_mm + seam_thickness_mm) / (sheet_length_mm + seam_thickness_mm)); segment_length_mm = (strip_length_mm - ((segments_per_strip - 1) * seam_thickness_mm)) / segments_per_strip; segments_needed = sum(segments_per_strip); segments_per_lane = floor(sheet_length_mm / segment_length_mm); lanes_per_sheet = floor(sheet_width_mm / strip_height_mm); sheets_layout = ceil(segments_needed / max(1, segments_per_lane * lanes_per_sheet)); sheets_area_guard = ceil(((total_panel_area_m2 + kopkanten_area_m2) * (1 + waste/100)) / ((sheet_length_mm * sheet_width_mm) / 1000000)); aantal = max(sheets_layout, sheets_area_guard)',
      required_inputs: [
        'material.lengte',
        'material.breedte',
        "maatwerk_item['naad dikte tussen 2 platen kopkant']",
      ],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    ventilatieprofiel: {
      sectionKey: 'ventilatieprofiel',
      logic: 'lineair voorzijde + onderzijde',
      formula: 'lineair_m1 = front_length_m1 + underside_length_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    voegband: {
      sectionKey: 'voegband',
      logic: 'naadlengte + kopkanten',
      formula: 'seam_m1 = sum((segments_per_strip - 1) * strip_height_mm / 1000) + kopkanten_length_m1; aantal = ceil((seam_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['material.lengte', "maatwerk_item['naad dikte tussen 2 platen kopkant']"],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    eindprofiel: {
      sectionKey: 'eindprofiel',
      logic: 'kopkanten afsluiting',
      formula: 'lineair_m1 = kopkanten_length_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    [config.sectionKeyAfwerking]: {
      sectionKey: config.sectionKeyAfwerking,
      logic: 'zichtbare randen',
      formula: 'lineair_m1 = front_length_m1 + underside_length_m1 + kopkanten_length_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    bevestiging: {
      sectionKey: 'bevestiging',
      logic: 'verbruik gestuurd',
      formula: 'if material.verbruik exists then totaal = cladding_m2 * verbruik; else requires_manual_input',
      pack_handling: 'if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)',
      wastePercentage: 'user_input',
    },
    daktrim: {
      sectionKey: 'daktrim',
      logic: 'lineair voorzijde',
      formula: 'lineair_m1 = front_length_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
  };
}

function createVlieringRuleSet(): Record<string, Record<string, any>> {
  return {
    randbalken: {
      sectionKey: 'randbalken',
      group: 'constructievloer',
      logic: '2 randbalken langs vloer-lengte',
      formula: 'aantal = ceil(((2 * floor_length_mm) * (1 + waste/100)) / material.lengte_mm)',
      required_inputs: ['maatwerk_item.lengte', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    vloerbalken: {
      sectionKey: 'vloerbalken',
      group: 'constructievloer',
      logic: 'balken op h.o.h. + extra raveelhout bij vlizotrap-openingen',
      formula: 'beam_count = ceil(floor_length_mm / balkafstand_mm) + 1; vloerbalk_total_mm = beam_count * floor_width_mm; raveel_extra_mm = sum((2 * opening_width_mm) + (2 * opening_height_mm) for opening in vlizotrap_openings); totale_lengte_mm = vloerbalk_total_mm + raveel_extra_mm; aantal = ceil((totale_lengte_mm * (1 + waste/100)) / material.lengte_mm)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.breedte', 'maatwerk_item.balkafstand', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    balkdragers: {
      sectionKey: 'balkdragers',
      group: 'constructievloer',
      logic: '2 dragers per interne balk + extra per vlizotrap-raveling',
      formula: 'beam_count = ceil(floor_length_mm / balkafstand_mm) + 1; interne_balken = max(0, beam_count - 2); basis = interne_balken * 2; raveel = vlizotrap_count * 4; aantal = ceil((basis + raveel) * (1 + waste/100))',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.balkafstand'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    beplating: {
      sectionKey: 'beplating',
      group: 'beplating',
      logic: 'vloer-oppervlakte minus openingen',
      formula: 'vloer_bruto_m2 = (floor_length_mm * floor_width_mm) / 1000000; total_openings_area_m2 = sum(((opening_width_mm * opening_height_mm) / 1000000) for opening in openings_source); vloer_netto_m2 = max(0, vloer_bruto_m2 - total_openings_area_m2); plaat_m2 = material.lengte_m * material.breedte_m; aantal = ceil((vloer_netto_m2 * (1 + waste/100)) / plaat_m2)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.breedte', 'material.lengte', 'material.breedte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    vlizotrap_unit: {
      sectionKey: 'vlizotrap_unit',
      group: 'toegang',
      logic: '1 per vlizotrap-opening of expliciete materiaalhoeveelheid',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal); else if vlizotrap_count > 0 then aantal = vlizotrap_count; else requires_manual_input',
      required_inputs: ['maatwerk_item.openings || material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    luik_afwerking: {
      sectionKey: 'luik_afwerking',
      group: 'toegang',
      logic: 'omtrek van vlizotrap/luik-openingen',
      formula: "vlizotrap_perimeter_m1 = sum((2 * (opening_width_mm + opening_height_mm)) / 1000 for opening in openings where opening.type in ['vlizotrap', 'hatch']); aantal = ceil((vlizotrap_perimeter_m1 * (1 + waste/100)) / material.lengte_m)",
      required_inputs: ['maatwerk_item.openings', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    koof_regelwerk: {
      sectionKey: 'koof_regelwerk',
      group: 'koof',
      logic: 'lineair koof-frame op basis van koven[]',
      formula: 'koof_total_lineair_mm = sum(((2 * koof.lengte) + (2 * koof.hoogte) + (2 * koof.diepte)) * (koof.aantal ?? 1) for koof in koof_items); aantal = ceil((koof_total_lineair_mm * (1 + waste/100)) / material.lengte_mm)',
      required_inputs: ['maatwerk_item.koven', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    koof_constructieplaat: {
      sectionKey: 'koof_constructieplaat',
      group: 'koof',
      logic: 'koof-oppervlakte (front + onderzijde)',
      formula: 'koof_total_surface_m2 = sum((((koof.lengte * koof.hoogte) + (koof.lengte * koof.diepte)) / 1000000) * (koof.aantal ?? 1) for koof in koof_items); plaat_m2 = material.lengte_m * material.breedte_m; aantal = ceil((koof_total_surface_m2 * (1 + waste/100)) / plaat_m2)',
      required_inputs: ['maatwerk_item.koven', 'material.lengte', 'material.breedte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    koof_afwerkplaat: {
      sectionKey: 'koof_afwerkplaat',
      group: 'koof',
      logic: 'zelfde oppervlak als koof_constructieplaat',
      formula: 'koof_total_surface_m2 = sum((((koof.lengte * koof.hoogte) + (koof.lengte * koof.diepte)) / 1000000) * (koof.aantal ?? 1) for koof in koof_items); plaat_m2 = material.lengte_m * material.breedte_m; aantal = ceil((koof_total_surface_m2 * (1 + waste/100)) / plaat_m2)',
      required_inputs: ['maatwerk_item.koven', 'material.lengte', 'material.breedte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    koof_isolatie: {
      sectionKey: 'koof_isolatie',
      group: 'koof',
      logic: 'koof-oppervlakte met pack-detectie',
      formula: 'koof_total_surface_m2 = sum((((koof.lengte * koof.hoogte) + (koof.lengte * koof.diepte)) / 1000000) * (koof.aantal ?? 1) for koof in koof_items); element_m2 = material.lengte_m * material.breedte_m; stuks = ceil((koof_total_surface_m2 * (1 + waste/100)) / element_m2)',
      pack_handling: 'if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = stuks',
      required_inputs: ['maatwerk_item.koven', 'material.lengte', 'material.breedte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    folie_buiten: {
      sectionKey: 'folie_buiten',
      group: 'isolatie_folies',
      logic: 'oppervlakte vloer minus openingen',
      formula: 'vloer_bruto_m2 = (floor_length_mm * floor_width_mm) / 1000000; total_openings_area_m2 = sum(((opening_width_mm * opening_height_mm) / 1000000) for opening in openings_source); vloer_netto_m2 = max(0, vloer_bruto_m2 - total_openings_area_m2); dekkings_m2 = material.lengte_m * material.breedte_m; aantal = ceil((vloer_netto_m2 * (1 + waste/100)) / dekkings_m2)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.breedte', 'material.lengte', 'material.breedte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    isolatie_basis: {
      sectionKey: 'isolatie_basis',
      group: 'isolatie_folies',
      logic: 'oppervlakte vloer minus openingen met pack-detectie',
      formula: 'vloer_bruto_m2 = (floor_length_mm * floor_width_mm) / 1000000; total_openings_area_m2 = sum(((opening_width_mm * opening_height_mm) / 1000000) for opening in openings_source); vloer_netto_m2 = max(0, vloer_bruto_m2 - total_openings_area_m2); element_m2 = material.lengte_m * material.breedte_m; stuks = ceil((vloer_netto_m2 * (1 + waste/100)) / element_m2)',
      pack_handling: 'if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = stuks',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.breedte', 'material.lengte', 'material.breedte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    plinten_plafond: {
      sectionKey: 'plinten_plafond',
      group: 'afwerking',
      logic: 'perimeter van vloer/plafondvlak',
      formula: 'lineair_m1 = (2 * (floor_length_mm + floor_width_mm)) / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.breedte', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    gips_vuller: {
      sectionKey: 'gips_vuller',
      group: 'afwerking',
      logic: 'verbruik per m2 (materiaalgestuurd)',
      formula: 'vloer_bruto_m2 = (floor_length_mm * floor_width_mm) / 1000000; total_openings_area_m2 = sum(((opening_width_mm * opening_height_mm) / 1000000) for opening in openings_source); vloer_netto_m2 = max(0, vloer_bruto_m2 - total_openings_area_m2); if material.verbruik_per_m2 || material.verbruik exists then totaal = vloer_netto_m2 * (1 + waste/100) * (material.verbruik_per_m2 ?? material.verbruik); else requires_manual_input',
      pack_handling: 'if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.breedte', 'material.verbruik_per_m2 || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    gips_finish: {
      sectionKey: 'gips_finish',
      group: 'afwerking',
      logic: 'verbruik per m2 (materiaalgestuurd)',
      formula: 'vloer_bruto_m2 = (floor_length_mm * floor_width_mm) / 1000000; total_openings_area_m2 = sum(((opening_width_mm * opening_height_mm) / 1000000) for opening in openings_source); vloer_netto_m2 = max(0, vloer_bruto_m2 - total_openings_area_m2); if material.verbruik_per_m2 || material.verbruik exists then totaal = vloer_netto_m2 * (1 + waste/100) * (material.verbruik_per_m2 ?? material.verbruik); else requires_manual_input',
      pack_handling: 'if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.breedte', 'material.verbruik_per_m2 || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
  };
}

function createGevelbekledingRuleSet(config: {
  sectionKeyBekleding: 'gevelplaat' | 'gevelplaat_rockpanel' | 'gevelbekleding_hout' | 'gevelbekleding_kunststof';
  extraRules?: Record<string, Record<string, any>>;
}): Record<string, Record<string, any>> {
  return {
    regelwerk_basis: {
      sectionKey: 'regelwerk_basis',
      group: 'hout',
      logic: 'verticale tengels + horizontale regels op opgegeven h.o.h.',
      formula: 'vertical_count = ceil(gevel_lengte_mm / tengelafstand_mm) + 1; vertical_total_mm = vertical_count * gevel_hoogte_mm; horizontal_count = ceil(gevel_hoogte_mm / latafstand_mm) + 1; horizontal_total_mm = horizontal_count * gevel_lengte_mm; totaal_mm = vertical_total_mm + horizontal_total_mm; aantal = ceil((totaal_mm * (1 + waste/100)) / material.lengte_mm)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'maatwerk_item.tengelafstand', 'maatwerk_item.latafstand', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    folie_buiten: {
      sectionKey: 'folie_buiten',
      group: 'isolatie',
      logic: 'oppervlakte gevel minus openingen',
      formula: 'gevel_bruto_m2 = (gevel_lengte_mm * gevel_hoogte_mm) / 1000000; openingen_m2 = sum((opening_width_mm * opening_height_mm) / 1000000); gevel_netto_m2 = max(0, gevel_bruto_m2 - openingen_m2); dekking_m2 = material.lengte_m * material.breedte_m; aantal = ceil((gevel_netto_m2 * (1 + waste/100)) / dekking_m2)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'material.lengte', 'material.breedte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    isolatie_gevel: {
      sectionKey: 'isolatie_gevel',
      group: 'isolatie',
      logic: 'oppervlakte gevel minus openingen met pack-detectie',
      formula: 'gevel_bruto_m2 = (gevel_lengte_mm * gevel_hoogte_mm) / 1000000; openingen_m2 = sum((opening_width_mm * opening_height_mm) / 1000000); gevel_netto_m2 = max(0, gevel_bruto_m2 - openingen_m2); element_m2 = material.lengte_m * material.breedte_m; stuks = ceil((gevel_netto_m2 * (1 + waste/100)) / element_m2)',
      pack_handling: 'if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = stuks',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'material.lengte', 'material.breedte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    [config.sectionKeyBekleding]: {
      sectionKey: config.sectionKeyBekleding,
      group: 'bekleding',
      logic: 'gevelbekleding op netto oppervlak met optionele werkende-breedte logica',
      formula: 'if material.werkende_breedte_mm exists then rows = ceil(gevel_hoogte_mm / material.werkende_breedte_mm); cols = ceil(gevel_lengte_mm / material.lengte_mm); stuks = rows * cols; else plaat_m2 = material.lengte_m * material.breedte_m; stuks = ceil(gevel_netto_m2 / plaat_m2); aantal = ceil(stuks * (1 + waste/100))',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    ventilatieprofiel: {
      sectionKey: 'ventilatieprofiel',
      group: 'bevestiging',
      logic: 'onder- en bovenzijde van het gevelvlak',
      formula: 'lineair_m1 = (2 * gevel_lengte_mm) / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['maatwerk_item.lengte', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    waterslag: {
      sectionKey: 'waterslag',
      group: 'bevestiging',
      logic: 'lineair over raam/opening-breedtes',
      formula: "openings_waterslag_m1 = sum(opening_width_mm / 1000 for opening in openings_source where opening.type in ['window', 'frame-outer', 'frame-inner']); if openings_waterslag_m1 > 0 then aantal = ceil((openings_waterslag_m1 * (1 + waste/100)) / material.lengte_m); else requires_manual_input",
      required_inputs: ['maatwerk_item.openings', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    ...(config.extraRules || {}),
  };
}

function createHellendDakRuleSet(): Record<string, Record<string, any>> {
  return {
    constructieplaat: {
      sectionKey: 'constructieplaat',
      group: 'beplating',
      logic: 'oppervlakte dakvlak minus openingen',
      formula: 'dak_bruto_m2 = (dak_lengte_mm * dak_hoogte_mm) / 1000000; openingen_m2 = sum((opening_width_mm * opening_height_mm) / 1000000 for opening in openings_source); dak_netto_m2 = max(0, dak_bruto_m2 - openingen_m2); plaat_m2 = material.lengte_m * material.breedte_m; aantal = ceil((dak_netto_m2 * (1 + waste/100)) / plaat_m2)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'material.lengte', 'material.breedte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    isolatie_dak: {
      sectionKey: 'isolatie_dak',
      group: 'isolatie',
      logic: 'oppervlakte dakvlak minus openingen met pack-detectie',
      formula: 'dak_bruto_m2 = (dak_lengte_mm * dak_hoogte_mm) / 1000000; openingen_m2 = sum((opening_width_mm * opening_height_mm) / 1000000 for opening in openings_source); dak_netto_m2 = max(0, dak_bruto_m2 - openingen_m2); element_m2 = material.lengte_m * material.breedte_m; stuks = ceil((dak_netto_m2 * (1 + waste/100)) / element_m2)',
      pack_handling: 'if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = stuks',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'material.lengte', 'material.breedte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    folie_buiten: {
      sectionKey: 'folie_buiten',
      group: 'isolatie',
      logic: 'oppervlakte dakvlak minus openingen',
      formula: 'dak_bruto_m2 = (dak_lengte_mm * dak_hoogte_mm) / 1000000; openingen_m2 = sum((opening_width_mm * opening_height_mm) / 1000000 for opening in openings_source); dak_netto_m2 = max(0, dak_bruto_m2 - openingen_m2); dekking_m2 = material.lengte_m * material.breedte_m; aantal = ceil((dak_netto_m2 * (1 + waste/100)) / dekking_m2)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'material.lengte', 'material.breedte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    tengels: {
      sectionKey: 'tengels',
      group: 'hout',
      logic: 'verticale regels op tengelafstand (h.o.h.)',
      formula: 'count = ceil(dak_lengte_mm / tengelafstand_mm) + 1; totaal_mm = count * dak_hoogte_mm; aantal = ceil((totaal_mm * (1 + waste/100)) / material.lengte_mm)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'maatwerk_item.balkafstand', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    panlatten: {
      sectionKey: 'panlatten',
      group: 'hout',
      logic: 'horizontale panlatten op panlatafstand (h.o.h.)',
      formula: 'count = ceil(dak_hoogte_mm / panlatafstand_mm) + 1; totaal_mm = count * dak_lengte_mm; aantal = ceil((totaal_mm * (1 + waste/100)) / material.lengte_mm)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'maatwerk_item.latafstand', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    ruiter: {
      sectionKey: 'ruiter',
      group: 'hout',
      logic: 'lineair over de nok',
      formula: 'lineair_m1 = dak_lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['maatwerk_item.lengte', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    dakvoetprofiel: {
      sectionKey: 'dakvoetprofiel',
      group: 'dak',
      logic: 'lineair langs de dakvoet',
      formula: 'lineair_m1 = dak_lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['maatwerk_item.lengte', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    dakpannen: {
      sectionKey: 'dakpannen',
      group: 'dak',
      logic: 'primair op aantal pannen (breedte x hoogte), fallback op m2-dekking',
      formula: 'if maatwerk_item.aantal_pannen_breedte && maatwerk_item.aantal_pannen_hoogte then stuks = maatwerk_item.aantal_pannen_breedte * maatwerk_item.aantal_pannen_hoogte; else if material.dekking_m2 exists then stuks = ceil(dak_netto_m2 / material.dekking_m2); else requires_manual_input; aantal = ceil(stuks * (1 + waste/100))',
      required_inputs: ['maatwerk_item.aantal_pannen_breedte || material.dekking_m2', 'maatwerk_item.aantal_pannen_hoogte || material.dekking_m2'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    gevelpannen: {
      sectionKey: 'gevelpannen',
      group: 'dak',
      logic: '2 gevelranden op aantal pannenhoogte',
      formula: 'if maatwerk_item.aantal_pannen_hoogte exists then stuks = 2 * maatwerk_item.aantal_pannen_hoogte; else requires_manual_input; aantal = ceil(stuks * (1 + waste/100))',
      required_inputs: ['maatwerk_item.aantal_pannen_hoogte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    ondervorst: {
      sectionKey: 'ondervorst',
      group: 'dak',
      logic: 'lineair over de nok',
      formula: 'lineair_m1 = dak_lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['maatwerk_item.lengte', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    nokvorsten: {
      sectionKey: 'nokvorsten',
      group: 'dak',
      logic: 'lineair over de nok',
      formula: 'lineair_m1 = dak_lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['maatwerk_item.lengte', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    lood: {
      sectionKey: 'lood',
      group: 'afwerking_dak',
      logic: 'lineair langs beide zijkanten van dakvlak',
      formula: 'lineair_m1 = (2 * dak_hoogte_mm) / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['maatwerk_item.hoogte', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    dakgoot: {
      sectionKey: 'dakgoot',
      group: 'afwerking_dak',
      logic: 'lineair langs dakvoet',
      formula: 'lineair_m1 = dak_lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['maatwerk_item.lengte', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    nok_kit: {
      sectionKey: 'nok_kit',
      group: 'afwerking_dak',
      logic: 'verbruik per meter over de nok',
      formula: 'lineair_m1 = dak_lengte_mm / 1000; if material.verbruik_per_m1 || material.verbruik exists then totaal = lineair_m1 * (1 + waste/100) * (material.verbruik_per_m1 ?? material.verbruik); else requires_manual_input',
      pack_handling: 'if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)',
      required_inputs: ['maatwerk_item.lengte', 'material.verbruik_per_m1 || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    boeiboord_placeholder: {
      sectionKey: 'boeiboord_placeholder',
      group: 'boeiboord',
      logic: 'optionele post, alleen op expliciete invoer',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal); else requires_manual_input',
      required_inputs: ['material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
  };
}

function createEpdmDakRuleSet(): Record<string, Record<string, any>> {
  return {
    constructieplaat: {
      sectionKey: 'constructieplaat',
      group: 'beplating',
      logic: 'oppervlakte dakvlak minus openingen',
      formula: 'dak_bruto_m2 = (dak_lengte_mm * dak_hoogte_mm) / 1000000; openingen_m2 = sum((opening_width_mm * opening_height_mm) / 1000000 for opening in openings_source); dak_netto_m2 = max(0, dak_bruto_m2 - openingen_m2); plaat_m2 = material.lengte_m * material.breedte_m; aantal = ceil((dak_netto_m2 * (1 + waste/100)) / plaat_m2)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'material.lengte', 'material.breedte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    folie_binnen: {
      sectionKey: 'folie_binnen',
      group: 'isolatie',
      logic: 'oppervlakte dakvlak minus openingen',
      formula: 'dak_bruto_m2 = (dak_lengte_mm * dak_hoogte_mm) / 1000000; openingen_m2 = sum((opening_width_mm * opening_height_mm) / 1000000 for opening in openings_source); dak_netto_m2 = max(0, dak_bruto_m2 - openingen_m2); dekking_m2 = material.lengte_m * material.breedte_m; aantal = ceil((dak_netto_m2 * (1 + waste/100)) / dekking_m2)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'material.lengte', 'material.breedte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    isolatie_dak: {
      sectionKey: 'isolatie_dak',
      group: 'isolatie',
      logic: 'oppervlakte dakvlak minus openingen met pack-detectie',
      formula: 'dak_bruto_m2 = (dak_lengte_mm * dak_hoogte_mm) / 1000000; openingen_m2 = sum((opening_width_mm * opening_height_mm) / 1000000 for opening in openings_source); dak_netto_m2 = max(0, dak_bruto_m2 - openingen_m2); element_m2 = material.lengte_m * material.breedte_m; stuks = ceil((dak_netto_m2 * (1 + waste/100)) / element_m2)',
      pack_handling: 'if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = stuks',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'material.lengte', 'material.breedte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    epdm_folie: {
      sectionKey: 'epdm_folie',
      group: 'dak',
      logic: 'dakvlak plus opstand op basis van dakrandbreedte',
      formula: 'dak_bruto_m2 = (dak_lengte_mm * dak_hoogte_mm) / 1000000; openingen_m2 = sum((opening_width_mm * opening_height_mm) / 1000000 for opening in openings_source); dak_netto_m2 = max(0, dak_bruto_m2 - openingen_m2); perimeter_mm = (2 * dak_lengte_mm) + (2 * dak_hoogte_mm); opstand_m2 = (perimeter_mm * dakrand_breedte_mm) / 1000000; basis_m2 = dak_netto_m2 + opstand_m2; dekking_m2 = material.dekking_m2 ?? (material.lengte_m * material.breedte_m); aantal = ceil((basis_m2 * (1 + waste/100)) / dekking_m2)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'maatwerk_item.dakrand_breedte', 'material.lengte || material.dekking_m2'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    epdm_lijm: {
      sectionKey: 'epdm_lijm',
      group: 'dak',
      logic: 'verbruik per m2 op EPDM totaaloppervlak',
      formula: 'dak_bruto_m2 = (dak_lengte_mm * dak_hoogte_mm) / 1000000; openingen_m2 = sum((opening_width_mm * opening_height_mm) / 1000000 for opening in openings_source); dak_netto_m2 = max(0, dak_bruto_m2 - openingen_m2); perimeter_mm = (2 * dak_lengte_mm) + (2 * dak_hoogte_mm); opstand_m2 = (perimeter_mm * dakrand_breedte_mm) / 1000000; basis_m2 = dak_netto_m2 + opstand_m2; if material.verbruik_per_m2 || material.verbruik exists then totaal = basis_m2 * (1 + waste/100) * (material.verbruik_per_m2 ?? material.verbruik); else requires_manual_input',
      pack_handling: 'if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'maatwerk_item.dakrand_breedte', 'material.verbruik_per_m2 || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    daktrim: {
      sectionKey: 'daktrim',
      group: 'afwerking_dak',
      logic: 'lineair over vrije randen',
      formula: "free_top_mm = (maatwerk_item.edge_top == 'free' ? dak_lengte_mm : 0); free_bottom_mm = (maatwerk_item.edge_bottom == 'free' ? dak_lengte_mm : 0); free_left_mm = (maatwerk_item.edge_left == 'free' ? dak_hoogte_mm : 0); free_right_mm = (maatwerk_item.edge_right == 'free' ? dak_hoogte_mm : 0); lineair_m1 = (free_top_mm + free_bottom_mm + free_left_mm + free_right_mm) / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'maatwerk_item.edge_top', 'maatwerk_item.edge_bottom', 'maatwerk_item.edge_left', 'maatwerk_item.edge_right', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    daktrim_hoeken: {
      sectionKey: 'daktrim_hoeken',
      group: 'afwerking_dak',
      logic: 'hoekstukken alleen op expliciete invoer',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal); else requires_manual_input',
      required_inputs: ['material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    hwa_uitloop: {
      sectionKey: 'hwa_uitloop',
      group: 'afwerking_dak',
      logic: 'aantal uitlopen alleen op expliciete invoer',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal); else requires_manual_input',
      required_inputs: ['material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    lood: {
      sectionKey: 'lood',
      group: 'afwerking_dak',
      logic: 'lineair over randen die tegen gevel/muur liggen',
      formula: "wall_top_mm = (maatwerk_item.edge_top == 'wall' ? dak_lengte_mm : 0); wall_bottom_mm = (maatwerk_item.edge_bottom == 'wall' ? dak_lengte_mm : 0); wall_left_mm = (maatwerk_item.edge_left == 'wall' ? dak_hoogte_mm : 0); wall_right_mm = (maatwerk_item.edge_right == 'wall' ? dak_hoogte_mm : 0); lineair_m1 = (wall_top_mm + wall_bottom_mm + wall_left_mm + wall_right_mm) / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)",
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'maatwerk_item.edge_top', 'maatwerk_item.edge_bottom', 'maatwerk_item.edge_left', 'maatwerk_item.edge_right', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    boeiboord_placeholder: {
      sectionKey: 'boeiboord_placeholder',
      group: 'boeiboord',
      logic: 'optionele post, alleen op expliciete invoer',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal); else requires_manual_input',
      required_inputs: ['material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
  };
}

function createGolfplaatDakRuleSet(): Record<string, Record<string, any>> {
  return {
    gordingen: {
      sectionKey: 'gordingen',
      group: 'hout',
      logic: 'horizontale dragers op balkafstand (h.o.h.)',
      formula: 'count = ceil(dak_hoogte_mm / gordingafstand_mm) + 1; totaal_mm = count * dak_lengte_mm; aantal = ceil((totaal_mm * (1 + waste/100)) / material.lengte_mm)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'maatwerk_item.balkafstand', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    tengels: {
      sectionKey: 'tengels',
      group: 'hout',
      logic: 'verticale regels op latafstand (h.o.h.)',
      formula: 'count = ceil(dak_lengte_mm / tengelafstand_mm) + 1; totaal_mm = count * dak_hoogte_mm; aantal = ceil((totaal_mm * (1 + waste/100)) / material.lengte_mm)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'maatwerk_item.latafstand', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    isolatie_dak: {
      sectionKey: 'isolatie_dak',
      group: 'isolatie',
      logic: 'oppervlakte dakvlak minus openingen met pack-detectie',
      formula: 'dak_bruto_m2 = (dak_lengte_mm * dak_hoogte_mm) / 1000000; openingen_m2 = sum((opening_width_mm * opening_height_mm) / 1000000 for opening in openings_source); dak_netto_m2 = max(0, dak_bruto_m2 - openingen_m2); element_m2 = material.lengte_m * material.breedte_m; stuks = ceil((dak_netto_m2 * (1 + waste/100)) / element_m2)',
      pack_handling: 'if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = stuks',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'material.lengte', 'material.breedte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    folie: {
      sectionKey: 'folie',
      group: 'isolatie',
      logic: 'oppervlakte dakvlak minus openingen',
      formula: 'dak_bruto_m2 = (dak_lengte_mm * dak_hoogte_mm) / 1000000; openingen_m2 = sum((opening_width_mm * opening_height_mm) / 1000000 for opening in openings_source); dak_netto_m2 = max(0, dak_bruto_m2 - openingen_m2); dekking_m2 = material.lengte_m * material.breedte_m; aantal = ceil((dak_netto_m2 * (1 + waste/100)) / dekking_m2)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'material.lengte', 'material.breedte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    golfplaten: {
      sectionKey: 'golfplaten',
      group: 'dak',
      logic: 'vlakvulling op werkende breedte, fallback op m2',
      formula: 'if material.werkende_breedte_mm exists then rows = ceil(dak_hoogte_mm / material.werkende_breedte_mm); cols = ceil(dak_lengte_mm / material.lengte_mm); stuks = rows * cols; else plaat_m2 = material.lengte_m * material.breedte_m; stuks = ceil(dak_netto_m2 / plaat_m2); aantal = ceil(stuks * (1 + waste/100))',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    lichtplaten: {
      sectionKey: 'lichtplaten',
      group: 'dak',
      logic: 'op expliciete invoer of op aantal dakraam-openingen',
      formula: "if material.aantal exists then aantal = ceil(material.aantal); else if count(openings where opening.type == 'dakraam') > 0 then aantal = count(openings where opening.type == 'dakraam'); else requires_manual_input",
      required_inputs: ['material.aantal || maatwerk_item.openings'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    nokstukken: {
      sectionKey: 'nokstukken',
      group: 'dak',
      logic: 'lineair over de nok',
      formula: 'lineair_m1 = dak_lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['maatwerk_item.lengte', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    hoekstukken: {
      sectionKey: 'hoekstukken',
      group: 'dak',
      logic: 'lineair over linker + rechter zijkant',
      formula: 'lineair_m1 = (2 * dak_hoogte_mm) / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['maatwerk_item.hoogte', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    golfplaatschroeven: {
      sectionKey: 'golfplaatschroeven',
      group: 'afwerking_dak',
      logic: 'verbruik per m2 op netto dakvlak',
      formula: 'dak_bruto_m2 = (dak_lengte_mm * dak_hoogte_mm) / 1000000; openingen_m2 = sum((opening_width_mm * opening_height_mm) / 1000000 for opening in openings_source); dak_netto_m2 = max(0, dak_bruto_m2 - openingen_m2); if material.verbruik_per_m2 || material.verbruik exists then totaal = dak_netto_m2 * (1 + waste/100) * (material.verbruik_per_m2 ?? material.verbruik); else requires_manual_input',
      pack_handling: 'if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'material.verbruik_per_m2 || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    dakgoot: {
      sectionKey: 'dakgoot',
      group: 'afwerking_dak',
      logic: 'lineair langs dakvoet',
      formula: 'lineair_m1 = dak_lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['maatwerk_item.lengte', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    hwa: {
      sectionKey: 'hwa',
      group: 'afwerking_dak',
      logic: 'aantal afvoeren alleen op expliciete invoer',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal); else requires_manual_input',
      required_inputs: ['material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
  };
}

function createSchuttingRuleSet(config: {
  variant: 'hout' | 'beton' | 'composiet';
  postSectionKey: 'schuttingpalen_hout' | 'betonpalen' | 'aluminium_palen';
  panelSectionKey: 'tuinscherm_hout' | 'onderplaten' | 'tuinscherm_composiet';
  capSectionKey?: 'paalkap' | 'afdekkap_beton';
  topLatSectionKey?: 'afdeklat_hout';
  plankSectionKey?: 'tuinplanken';
  footSectionKey?: 'paalvoet';
  uProfileSectionKey?: 'u_profiel';
  uniBeslagSectionKey?: 'unibeslag';
}): Record<string, Record<string, any>> {
  const rules: Record<string, Record<string, any>> = {
    snelbeton: {
      sectionKey: 'snelbeton',
      group: 'fundering',
      logic: 'verbruik per paal (materiaalgestuurd)',
      formula: 'if material.verbruik_per_paal || material.verbruik exists then totaal = post_count * (1 + waste/100) * (material.verbruik_per_paal ?? material.verbruik); else requires_manual_input',
      pack_handling: 'if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.paalafstand', 'material.verbruik_per_paal || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    opsluitbanden: {
      sectionKey: 'opsluitbanden',
      group: 'fundering',
      logic: 'lineair over totale schuttinglengte',
      formula: 'lineair_m1 = fence_length_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['maatwerk_item.lengte', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    paalpunthouder: {
      sectionKey: 'paalpunthouder',
      group: 'fundering',
      logic: '1 per paalpositie',
      formula: 'aantal = ceil(post_count * (1 + waste/100))',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.paalafstand'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    [config.postSectionKey]: {
      sectionKey: config.postSectionKey,
      group: config.variant === 'hout' ? 'schutting_hout' : config.variant === 'beton' ? 'schutting_beton' : 'schutting_composiet',
      logic: 'palen op vaste maat tussen palen + hoekcorrectie',
      formula: 'posts_total = post_count + max(0, hoek_count); aantal = ceil(posts_total * (1 + waste/100))',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.paalafstand'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    [config.panelSectionKey]: {
      sectionKey: config.panelSectionKey,
      group: config.variant === 'hout' ? 'schutting_hout' : config.variant === 'beton' ? 'schutting_beton' : 'schutting_composiet',
      logic: config.variant === 'beton'
        ? '1 onderplaat per vak'
        : 'primair 1 scherm per vak; fallback op netto oppervlak',
      formula: config.variant === 'beton'
        ? 'aantal = ceil(panel_count * (1 + waste/100))'
        : "if type_schutting == 'schermen' then stuks = panel_count; else if material.lengte && material.breedte then plaat_m2 = material.lengte_m * material.breedte_m; stuks = ceil(fence_area_m2 / plaat_m2); else requires_manual_input; aantal = ceil(stuks * (1 + waste/100))",
      required_inputs: config.variant === 'beton'
        ? ['maatwerk_item.lengte', 'maatwerk_item.paalafstand']
        : ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'maatwerk_item.paalafstand'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    tuinpoort: {
      sectionKey: 'tuinpoort',
      group: 'poort',
      logic: 'alleen bij expliciete poort-input',
      formula: 'if maatwerk_item.poort_aanwezig == true && material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      required_inputs: ['maatwerk_item.poort_aanwezig', 'material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    stalen_frame: {
      sectionKey: 'stalen_frame',
      group: 'poort',
      logic: 'alleen bij expliciete poort-input',
      formula: 'if maatwerk_item.poort_aanwezig == true && material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      required_inputs: ['maatwerk_item.poort_aanwezig', 'material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    kozijnbalken: {
      sectionKey: 'kozijnbalken',
      group: 'poort',
      logic: 'poortkader lineair op expliciete input',
      formula: 'if maatwerk_item.poort_aanwezig == true && material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if maatwerk_item.poort_aanwezig == true && material.lengte && material.verbruik_per_poort exists then lineair_m1 = material.verbruik_per_poort; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else requires_manual_input',
      required_inputs: ['maatwerk_item.poort_aanwezig', 'material.aantal || (material.verbruik_per_poort && material.lengte)'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    hengselset: {
      sectionKey: 'hengselset',
      group: 'beslag',
      logic: 'set per poort (materiaalgestuurd)',
      formula: 'if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input',
      required_inputs: ['maatwerk_item.poort_aanwezig', 'material.aantal || material.verbruik_per_poort || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    hengen: {
      sectionKey: 'hengen',
      group: 'beslag',
      logic: 'set per poort (materiaalgestuurd)',
      formula: 'if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input',
      required_inputs: ['maatwerk_item.poort_aanwezig', 'material.aantal || material.verbruik_per_poort || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    plaatduimen: {
      sectionKey: 'plaatduimen',
      group: 'beslag',
      logic: 'set per poort (materiaalgestuurd)',
      formula: 'if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input',
      required_inputs: ['maatwerk_item.poort_aanwezig', 'material.aantal || material.verbruik_per_poort || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    poortbeslag: {
      sectionKey: 'poortbeslag',
      group: 'beslag',
      logic: 'set per poort (materiaalgestuurd)',
      formula: 'if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input',
      required_inputs: ['maatwerk_item.poort_aanwezig', 'material.aantal || material.verbruik_per_poort || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    cilinderslot: {
      sectionKey: 'cilinderslot',
      group: 'beslag',
      logic: 'set per poort (materiaalgestuurd)',
      formula: 'if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input',
      required_inputs: ['maatwerk_item.poort_aanwezig', 'material.aantal || material.verbruik_per_poort || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    grondgrendel: {
      sectionKey: 'grondgrendel',
      group: 'beslag',
      logic: 'set per poort (materiaalgestuurd)',
      formula: 'if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input',
      required_inputs: ['maatwerk_item.poort_aanwezig', 'material.aantal || material.verbruik_per_poort || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    vloerstop: {
      sectionKey: 'vloerstop',
      group: 'beslag',
      logic: 'set per poort (materiaalgestuurd)',
      formula: 'if maatwerk_item.poort_aanwezig == true && (material.aantal || material.verbruik_per_poort || material.verbruik) exists then totaal = (material.aantal ?? (material.verbruik_per_poort ?? material.verbruik)) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input',
      required_inputs: ['maatwerk_item.poort_aanwezig', 'material.aantal || material.verbruik_per_poort || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
  };

  if (config.capSectionKey) {
    rules[config.capSectionKey] = {
      sectionKey: config.capSectionKey,
      group: config.variant === 'hout' ? 'schutting_hout' : 'schutting_beton',
      logic: '1 kap per paalpositie',
      formula: 'posts_total = post_count + max(0, hoek_count); aantal = ceil(posts_total * (1 + waste/100))',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.paalafstand'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    };
  }

  if (config.topLatSectionKey) {
    rules[config.topLatSectionKey] = {
      sectionKey: config.topLatSectionKey,
      group: 'schutting_hout',
      logic: 'lineair over bovenzijde schutting',
      formula: 'lineair_m1 = fence_length_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['maatwerk_item.lengte', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    };
  }

  if (config.plankSectionKey) {
    rules[config.plankSectionKey] = {
      sectionKey: config.plankSectionKey,
      group: 'schutting_hout',
      logic: 'plankverdeling voor planken-systeem, fallback op oppervlakte',
      formula: "if type_schutting == 'planken' && material.werkende_breedte_mm exists then rows = ceil(effective_height_mm / material.werkende_breedte_mm); cols = ceil(fence_length_mm / material.lengte_mm); stuks = rows * cols; else if type_schutting == 'planken' && material.lengte && material.breedte then plaat_m2 = material.lengte_m * material.breedte_m; stuks = ceil(fence_area_m2 / plaat_m2); else requires_manual_input; aantal = ceil(stuks * (1 + waste/100))",
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    };
  }

  if (config.footSectionKey) {
    rules[config.footSectionKey] = {
      sectionKey: config.footSectionKey,
      group: 'schutting_composiet',
      logic: '1 paalvoet per paalpositie',
      formula: 'posts_total = post_count + max(0, hoek_count); aantal = ceil(posts_total * (1 + waste/100))',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.paalafstand'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    };
  }

  if (config.uProfileSectionKey) {
    rules[config.uProfileSectionKey] = {
      sectionKey: config.uProfileSectionKey,
      group: 'schutting_composiet',
      logic: '2 zijprofielen per vak over effectieve schuttinghoogte',
      formula: 'lineair_m1 = (2 * panel_count * effective_height_mm) / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'maatwerk_item.paalafstand', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    };
  }

  if (config.uniBeslagSectionKey) {
    rules[config.uniBeslagSectionKey] = {
      sectionKey: config.uniBeslagSectionKey,
      group: 'schutting_beton',
      logic: 'verbruik per vak (materiaalgestuurd)',
      formula: 'if material.verbruik_per_vak || material.verbruik exists then totaal = panel_count * (1 + waste/100) * (material.verbruik_per_vak ?? material.verbruik); else requires_manual_input',
      pack_handling: 'if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.paalafstand', 'material.verbruik_per_vak || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    };
  }

  return rules;
}

function createIsolatieglasRuleSet(): Record<string, Record<string, any>> {
  return {
    glas: {
      sectionKey: 'glas',
      group: 'glas',
      logic: 'primair stuk, fallback op dekking/oppervlakte',
      formula: "if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if material.eenheid == 'stuk' then aantal = ceil(1 * (1 + waste/100)); else if material.dekking_m2 exists then aantal = ceil((ruit_area_m2 * (1 + waste/100)) / material.dekking_m2); else if material.lengte && material.breedte then plaat_m2 = material.lengte_m * material.breedte_m; aantal = ceil((ruit_area_m2 * (1 + waste/100)) / plaat_m2); else requires_manual_input",
      required_inputs: ['maatwerk_item.breedte', 'maatwerk_item.hoogte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    roosters: {
      sectionKey: 'roosters',
      group: 'glas',
      logic: 'verbruik per ruit of expliciete aantallen',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if material.verbruik_per_ruit || material.verbruik exists then totaal = (material.verbruik_per_ruit ?? material.verbruik) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input',
      required_inputs: ['material.aantal || material.verbruik_per_ruit || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    glaslatten: {
      sectionKey: 'glaslatten',
      group: 'glas',
      logic: 'lineair over ruitomtrek',
      formula: 'lineair_m1 = ruit_perimeter_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['maatwerk_item.breedte', 'maatwerk_item.hoogte', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
  };
}

function createDakraamRuleSet(): Record<string, Record<string, any>> {
  return {
    vensterset_compleet: {
      sectionKey: 'vensterset_compleet',
      group: 'vensterset',
      logic: 'complete set per dakraam',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else aantal = ceil(window_count * (1 + waste/100))',
      required_inputs: ['maatwerk_item.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    venster_los: {
      sectionKey: 'venster_los',
      group: 'venster',
      logic: 'los venster per dakraam',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else aantal = ceil(window_count * (1 + waste/100))',
      required_inputs: ['maatwerk_item.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    gootstuk: {
      sectionKey: 'gootstuk',
      group: 'gootstuk',
      logic: 'stuk-per-raam of lineair op raamomtrek',
      formula: "if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if material.eenheid == 'stuk' then aantal = ceil(window_count * (1 + waste/100)); else if material.lengte exists then lineair_m1 = (window_perimeter_m1 * window_count); aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else requires_manual_input",
      required_inputs: ['maatwerk_item.breedte', 'maatwerk_item.hoogte', 'maatwerk_item.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    betimmering: {
      sectionKey: 'betimmering',
      group: 'afwerking',
      logic: 'aftimmering op totaal opening-oppervlak',
      formula: 'if material.lengte && material.breedte then plaat_m2 = material.lengte_m * material.breedte_m; aantal = ceil((window_total_area_m2 * (1 + waste/100)) / plaat_m2); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      required_inputs: ['maatwerk_item.breedte', 'maatwerk_item.hoogte', 'maatwerk_item.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    plinten: {
      sectionKey: 'plinten',
      group: 'afwerking',
      logic: 'lineair over omtrek van alle dakramen',
      formula: 'lineair_m1 = window_perimeter_m1 * window_count; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['maatwerk_item.breedte', 'maatwerk_item.hoogte', 'maatwerk_item.aantal', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
  };
}

function createVlizotrapRuleSet(): Record<string, Record<string, any>> {
  return {
    balken: {
      sectionKey: 'balken',
      group: 'hout',
      logic: 'raveling rondom trapopening',
      formula: 'lineair_m1 = trap_perimeter_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    trap: {
      sectionKey: 'trap',
      group: 'basis',
      logic: 'complete trapset per trapopening of expliciete materiaalhoeveelheid',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if trap_lengte_mm && trap_hoogte_mm then aantal = ceil(1 * (1 + waste/100)); else requires_manual_input',
      required_inputs: ['material.aantal || (maatwerk_item.lengte && maatwerk_item.hoogte)'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    luik: {
      sectionKey: 'luik',
      group: 'basis',
      logic: 'zolderluik per trapopening of expliciete materiaalhoeveelheid',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if trap_lengte_mm && trap_hoogte_mm then aantal = ceil(1 * (1 + waste/100)); else requires_manual_input',
      required_inputs: ['material.aantal || (maatwerk_item.lengte && maatwerk_item.hoogte)'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    traphek: {
      sectionKey: 'traphek',
      group: 'veiligheid',
      logic: 'veiligheidshek op expliciet aantal, verbruik-per-meter of lineair over opening',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if material.verbruik_per_m1 || material.verbruik exists then totaal = trap_perimeter_m1 * (1 + waste/100) * (material.verbruik_per_m1 ?? material.verbruik); aantal = ceil(totaal); else if material.lengte exists then lineair_m1 = trap_perimeter_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else requires_manual_input',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'material.aantal || material.verbruik_per_m1 || material.verbruik || material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    poortje: {
      sectionKey: 'poortje',
      group: 'veiligheid',
      logic: 'veiligheidspoort op expliciet aantal of verbruik-per-set',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if material.verbruik_per_set || material.verbruik exists then totaal = (material.verbruik_per_set ?? material.verbruik) * (1 + waste/100); aantal = ceil(totaal); else if trap_lengte_mm && trap_hoogte_mm then aantal = ceil(1 * (1 + waste/100)); else requires_manual_input',
      required_inputs: ['material.aantal || material.verbruik_per_set || material.verbruik || (maatwerk_item.lengte && maatwerk_item.hoogte)'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    scharnieren: {
      sectionKey: 'scharnieren',
      group: 'beslag',
      logic: 'beslag op expliciet aantal of verbruik-per-set',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if material.verbruik_per_set || material.verbruik exists then totaal = (material.verbruik_per_set ?? material.verbruik) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input',
      required_inputs: ['material.aantal || material.verbruik_per_set || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    sluiting: {
      sectionKey: 'sluiting',
      group: 'beslag',
      logic: 'beslag op expliciet aantal of verbruik-per-set',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if material.verbruik_per_set || material.verbruik exists then totaal = (material.verbruik_per_set ?? material.verbruik) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input',
      required_inputs: ['material.aantal || material.verbruik_per_set || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    veer: {
      sectionKey: 'veer',
      group: 'beslag',
      logic: 'beslag op expliciet aantal of verbruik-per-set',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if material.verbruik_per_set || material.verbruik exists then totaal = (material.verbruik_per_set ?? material.verbruik) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input',
      required_inputs: ['material.aantal || material.verbruik_per_set || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    handgreep: {
      sectionKey: 'handgreep',
      group: 'beslag',
      logic: 'beslag op expliciet aantal of verbruik-per-set',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if material.verbruik_per_set || material.verbruik exists then totaal = (material.verbruik_per_set ?? material.verbruik) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input',
      required_inputs: ['material.aantal || material.verbruik_per_set || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    architraaf: {
      sectionKey: 'architraaf',
      group: 'afwerking',
      logic: 'koplatten lineair over omtrek van trapopening',
      formula: 'lineair_m1 = trap_perimeter_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
  };
}

function createLichtkoepelRuleSet(): Record<string, Record<string, any>> {
  return {
    koepel: {
      sectionKey: 'koepel',
      group: 'koepel',
      logic: 'koepel per opening of expliciete materiaalhoeveelheid',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else aantal = ceil(unit_count * (1 + waste/100))',
      required_inputs: ['maatwerk_item.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    opstand: {
      sectionKey: 'opstand',
      group: 'opstand',
      logic: 'prefab opstand per opening; fallback lineair op omtrek',
      formula: "if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if material.eenheid == 'stuk' then aantal = ceil(unit_count * (1 + waste/100)); else if material.lengte exists then lineair_m1 = total_perimeter_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else requires_manual_input",
      required_inputs: ['maatwerk_item.aantal || material.aantal || material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    dakbedekking: {
      sectionKey: 'dakbedekking',
      group: 'afwerking_dak',
      logic: 'oppervlakte op totale koepel-openingen',
      formula: "if material.dekking_m2 exists then aantal = ceil((total_opening_area_m2 * (1 + waste/100)) / material.dekking_m2); else if material.lengte && material.breedte then dekkings_m2 = material.lengte_m * material.breedte_m; aantal = ceil((total_opening_area_m2 * (1 + waste/100)) / dekkings_m2); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input",
      required_inputs: ['maatwerk_item.breedte', 'maatwerk_item.hoogte', 'maatwerk_item.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    betimmering: {
      sectionKey: 'betimmering',
      group: 'afwerking',
      logic: 'aftimmering op oppervlakte of lineair omtrek',
      formula: 'if material.lengte && material.breedte then plaat_m2 = material.lengte_m * material.breedte_m; aantal = ceil((total_opening_area_m2 * (1 + waste/100)) / plaat_m2); else if material.lengte exists then lineair_m1 = total_perimeter_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      required_inputs: ['maatwerk_item.breedte', 'maatwerk_item.hoogte', 'maatwerk_item.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    plinten: {
      sectionKey: 'plinten',
      group: 'afwerking',
      logic: 'lineair over omtrek van alle lichtkoepel-openingen',
      formula: 'lineair_m1 = total_perimeter_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
      required_inputs: ['maatwerk_item.breedte', 'maatwerk_item.hoogte', 'maatwerk_item.aantal', 'material.lengte'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
  };
}

function createVloerAfwerkingRuleSet(config: {
  variant: 'laminaat_pvc' | 'massief_hout';
  egaliseerSectionKey: 'egaliseren' | 'egaline';
  plintSectionKey: 'plinten_muur' | 'plinten';
}): Record<string, Record<string, any>> {
  const rules: Record<string, Record<string, any>> = {
    [config.egaliseerSectionKey]: {
      sectionKey: config.egaliseerSectionKey,
      group: 'Vloer_Voorbereiding',
      logic: 'egaliseren op verbruik-per-m2 of expliciete materiaalhoeveelheid',
      formula: 'if material.verbruik_per_m2 || material.verbruik exists then totaal = vloer_area_m2 * (1 + waste/100) * (material.verbruik_per_m2 ?? material.verbruik); else if material.dekking_m2 exists then totaal = ceil((vloer_area_m2 * (1 + waste/100)) / material.dekking_m2); else if material.aantal exists then totaal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      pack_handling: 'if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.breedte', 'material.verbruik_per_m2 || material.verbruik || material.dekking_m2 || material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    ondervloer: {
      sectionKey: 'ondervloer',
      group: 'Vloer_Voorbereiding',
      logic: 'oppervlakte gebaseerd met pack-detectie',
      formula: 'if material.dekking_m2 exists then stuks = ceil((vloer_area_m2 * (1 + waste/100)) / material.dekking_m2); else if material.lengte && material.breedte then element_m2 = material.lengte_m * material.breedte_m; stuks = ceil((vloer_area_m2 * (1 + waste/100)) / element_m2); else if material.aantal exists then stuks = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      pack_handling: 'if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = ceil(stuks)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.breedte', 'material.dekking_m2 || (material.lengte && material.breedte) || material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    vloerdelen: {
      sectionKey: 'vloerdelen',
      group: config.variant === 'massief_hout' ? 'Vloer_Hout' : 'Vloer_Laminaat',
      logic: 'vloeroppervlakte met dekking/werkende maat + pack-detectie',
      formula: 'if material.dekking_m2 exists then stuks = ceil((vloer_area_m2 * (1 + waste/100)) / material.dekking_m2); else if material.werkende_breedte_mm && material.lengte exists then element_m2 = material.lengte_m * (material.werkende_breedte_mm / 1000); stuks = ceil((vloer_area_m2 * (1 + waste/100)) / element_m2); else if material.lengte && material.breedte then element_m2 = material.lengte_m * material.breedte_m; stuks = ceil((vloer_area_m2 * (1 + waste/100)) / element_m2); else if material.aantal exists then stuks = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      pack_handling: 'if materiaalnaam matches /(pak\\s*(\\d+)st|\\((\\d+)st)/i then aantal = ceil(stuks / pack_size) else aantal = ceil(stuks)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.breedte', 'material.dekking_m2 || material.werkende_breedte_mm || (material.lengte && material.breedte) || material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    [config.plintSectionKey]: {
      sectionKey: config.plintSectionKey,
      group: 'Vloer_Afwerking',
      logic: 'lineair over vloeromtrek',
      formula: 'if material.lengte exists then lineair_m1 = vloer_perimeter_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else if material.dekking_m1 exists then aantal = ceil((vloer_perimeter_m1 * (1 + waste/100)) / material.dekking_m1); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.breedte', 'material.lengte || material.dekking_m1 || material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
  };

  if (config.variant === 'laminaat_pvc') {
    rules.folie = {
      sectionKey: 'folie',
      group: 'Vloer_Voorbereiding',
      logic: 'oppervlakte gebaseerd met overlap via waste',
      formula: 'if material.dekking_m2 exists then aantal = ceil((vloer_area_m2 * (1 + waste/100)) / material.dekking_m2); else if material.lengte && material.breedte then dekkings_m2 = material.lengte_m * material.breedte_m; aantal = ceil((vloer_area_m2 * (1 + waste/100)) / dekkings_m2); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.breedte', 'material.dekking_m2 || (material.lengte && material.breedte) || material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    };
    rules.profielen_overgang = {
      sectionKey: 'profielen_overgang',
      group: 'Vloer_Afwerking',
      logic: 'overgangsprofielen op expliciete aantallen of verbruik-per-overgang',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if material.verbruik_per_overgang || material.verbruik exists then totaal = (material.verbruik_per_overgang ?? material.verbruik) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input',
      required_inputs: ['material.aantal || material.verbruik_per_overgang || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    };
    rules.profielen_eind = {
      sectionKey: 'profielen_eind',
      group: 'Vloer_Afwerking',
      logic: 'eindprofielen op expliciete aantallen of verbruik-per-overgang',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if material.verbruik_per_overgang || material.verbruik exists then totaal = (material.verbruik_per_overgang ?? material.verbruik) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input',
      required_inputs: ['material.aantal || material.verbruik_per_overgang || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    };
    rules.kruipluik = {
      sectionKey: 'kruipluik',
      group: 'Vloer_Afwerking',
      logic: 'kruipluikprofiel op expliciet aantal of verbruik',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if material.verbruik || material.verbruik_per_stuk exists then totaal = (material.verbruik_per_stuk ?? material.verbruik) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input',
      required_inputs: ['material.aantal || material.verbruik || material.verbruik_per_stuk'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    };
  }

  if (config.variant === 'massief_hout') {
    rules.primer = {
      sectionKey: 'primer',
      group: 'Vloer_Voorbereiding',
      logic: 'primer op verbruik-per-m2 of expliciete materiaalhoeveelheid',
      formula: 'if material.verbruik_per_m2 || material.verbruik exists then totaal = vloer_area_m2 * (1 + waste/100) * (material.verbruik_per_m2 ?? material.verbruik); else if material.dekking_m2 exists then totaal = ceil((vloer_area_m2 * (1 + waste/100)) / material.dekking_m2); else if material.aantal exists then totaal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      pack_handling: 'if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.breedte', 'material.verbruik_per_m2 || material.verbruik || material.dekking_m2 || material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    };
    rules.parketlijm = {
      sectionKey: 'parketlijm',
      group: 'Vloer_Hout',
      logic: 'lijmverbruik op m2 of expliciete hoeveelheid',
      formula: 'if material.verbruik_per_m2 || material.verbruik exists then totaal = vloer_area_m2 * (1 + waste/100) * (material.verbruik_per_m2 ?? material.verbruik); else if material.aantal exists then totaal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      pack_handling: 'if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.breedte', 'material.verbruik_per_m2 || material.verbruik || material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    };
    rules.deklatten = {
      sectionKey: 'deklatten',
      group: 'Vloer_Afwerking',
      logic: 'lineair over vloeromtrek',
      formula: 'if material.lengte exists then lineair_m1 = vloer_perimeter_m1; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.breedte', 'material.lengte || material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    };
    rules.dorpels = {
      sectionKey: 'dorpels',
      group: 'Vloer_Afwerking',
      logic: 'overgangsprofielen/dorpels op expliciete aantallen of verbruik-per-overgang',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if material.verbruik_per_overgang || material.verbruik exists then totaal = (material.verbruik_per_overgang ?? material.verbruik) * (1 + waste/100); aantal = ceil(totaal); else requires_manual_input',
      required_inputs: ['material.aantal || material.verbruik_per_overgang || material.verbruik'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    };
    rules.vloerolie = {
      sectionKey: 'vloerolie',
      group: 'Vloer_Afwerking',
      logic: 'afwerklaag op verbruik-per-m2 of expliciete hoeveelheid',
      formula: 'if material.verbruik_per_m2 || material.verbruik exists then totaal = vloer_area_m2 * (1 + waste/100) * (material.verbruik_per_m2 ?? material.verbruik); else if material.dekking_m2 exists then totaal = ceil((vloer_area_m2 * (1 + waste/100)) / material.dekking_m2); else if material.aantal exists then totaal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      pack_handling: 'if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.breedte', 'material.verbruik_per_m2 || material.verbruik || material.dekking_m2 || material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    };
  }

  return rules;
}

function createPlintenAfwerklattenRuleSet(): Record<string, Record<string, any>> {
  return {
    plinten: {
      sectionKey: 'plinten',
      group: 'plinten',
      logic: 'lineair langs opgegeven lengte',
      formula: 'if material.lengte exists then lineair_m1 = lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else if material.dekking_m1 exists then lineair_m1 = lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.dekking_m1); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      required_inputs: ['maatwerk_item.lengte', 'material.lengte || material.dekking_m1 || material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    vloerplinten: {
      sectionKey: 'vloerplinten',
      group: 'plinten',
      logic: 'lineair langs opgegeven lengte',
      formula: 'if material.lengte exists then lineair_m1 = lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else if material.dekking_m1 exists then lineair_m1 = lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.dekking_m1); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      required_inputs: ['maatwerk_item.lengte', 'material.lengte || material.dekking_m1 || material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    koplatten: {
      sectionKey: 'koplatten',
      group: 'afwerking',
      logic: 'lineair op som van lengte + hoogte',
      formula: 'if material.lengte exists then lineair_m1 = (lengte_mm + hoogte_mm) / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      required_inputs: ['maatwerk_item.lengte', 'maatwerk_item.hoogte', 'material.lengte || material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
  };
}

function createVensterbankenRuleSet(): Record<string, Record<string, any>> {
  return {
    frame: {
      sectionKey: 'frame',
      group: 'hout',
      logic: 'regelwerk rondom vensteropening (2x hoogte + 1x breedte) per stuk',
      formula: 'lineair_m1 = (((2 * opening_height_mm) + opening_width_mm) * opening_count) / 1000; if material.lengte exists then aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      required_inputs: ['maatwerk_item.breedte', 'maatwerk_item.hoogte', 'maatwerk_item.aantal', 'material.lengte || material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    vensterbank: {
      sectionKey: 'vensterbank',
      group: 'afwerking',
      logic: 'primair lineair op vensterbankbreedte; fallback op plaatoppervlakte',
      formula: 'lineair_m1 = (opening_width_mm * opening_count) / 1000; if material.lengte exists then aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else if material.lengte && material.breedte then totaal_m2 = opening_area_m2 * opening_count; plaat_m2 = material.lengte_m * material.breedte_m; aantal = ceil((totaal_m2 * (1 + waste/100)) / plaat_m2); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      required_inputs: ['maatwerk_item.breedte', 'maatwerk_item.hoogte', 'maatwerk_item.aantal', 'material.lengte || (material.lengte && material.breedte) || material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    roosters: {
      sectionKey: 'roosters',
      group: 'afwerking',
      logic: 'roosters per vensterbank of expliciete materiaalhoeveelheid',
      formula: 'if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else if material.verbruik_per_stuk || material.verbruik exists then totaal = opening_count * (1 + waste/100) * (material.verbruik_per_stuk ?? material.verbruik); aantal = ceil(totaal); else aantal = ceil(opening_count * (1 + waste/100))',
      required_inputs: ['maatwerk_item.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    behandeling: {
      sectionKey: 'behandeling',
      group: 'afwerking',
      logic: 'behandeling op verbruik-per-m2 of expliciete materiaalhoeveelheid',
      formula: 'if material.verbruik_per_m2 || material.verbruik exists then totaal = (opening_area_m2 * opening_count) * (1 + waste/100) * (material.verbruik_per_m2 ?? material.verbruik); else if material.dekking_m2 exists then totaal = ceil(((opening_area_m2 * opening_count) * (1 + waste/100)) / material.dekking_m2); else if material.aantal exists then totaal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      pack_handling: 'if packaging count known then aantal = ceil(totaal / verpakkingseenheid) else aantal = ceil(totaal)',
      required_inputs: ['maatwerk_item.breedte', 'maatwerk_item.hoogte', 'maatwerk_item.aantal', 'material.verbruik_per_m2 || material.verbruik || material.dekking_m2 || material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
  };
}

function createDagkantenRuleSet(): Record<string, Record<string, any>> {
  return {
    frame: {
      sectionKey: 'frame',
      group: 'hout',
      logic: 'regelwerk rondom dagkantopening (2x hoogte + 1x breedte) per stuk',
      formula: 'lineair_m1 = (((2 * opening_height_mm) + opening_width_mm) * opening_count) / 1000; if material.lengte exists then aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      required_inputs: ['maatwerk_item.breedte', 'maatwerk_item.hoogte', 'maatwerk_item.aantal', 'material.lengte || material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    dagkant: {
      sectionKey: 'dagkant',
      group: 'afwerking',
      logic: 'betimmering rondom opening, lineair of op verbruik',
      formula: 'lineair_m1 = (((2 * opening_height_mm) + opening_width_mm) * opening_count) / 1000; if material.lengte exists then aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else if material.verbruik_per_m1 || material.verbruik exists then totaal = lineair_m1 * (1 + waste/100) * (material.verbruik_per_m1 ?? material.verbruik); aantal = ceil(totaal); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      required_inputs: ['maatwerk_item.breedte', 'maatwerk_item.hoogte', 'maatwerk_item.aantal', 'material.lengte || material.verbruik_per_m1 || material.verbruik || material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
    hoekprofiel: {
      sectionKey: 'hoekprofiel',
      group: 'afwerking',
      logic: 'hoekprofiel over verticale dagkanthoogtes',
      formula: 'lineair_m1 = ((2 * opening_height_mm) * opening_count) / 1000; if material.lengte exists then aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else if material.aantal exists then aantal = ceil(material.aantal * (1 + waste/100)); else requires_manual_input',
      required_inputs: ['maatwerk_item.hoogte', 'maatwerk_item.aantal', 'material.lengte || material.aantal'],
      missing_input_behavior: 'requires_manual_input',
      wastePercentage: 'user_input',
    },
  };
}

const STATIC_RULES_BY_SLUG: Record<string, Record<string, Record<string, any>>> = {
  'metalstud-voorzetwand': {
    ms_liggers: {
      logic: '1 bovenligger + 1 onderligger over volledige wandlengte',
      context: 'Metalstud Voorzetwand',
      formula: 'ceil((2 * wandlengte) / material.lengte)',
      sectionKey: 'ms_liggers',
      total_length: '2 * wandlengte',
    },
    ms_staanders: {
      logic: 'Verticale staanders op vaste h.o.h.-afstand',
      context: 'Metalstud Voorzetwand',
      formula: 'ceil((stud_count * stud_length) / material.lengte)',
      sectionKey: 'ms_staanders',
      stud_count: 'calculatedData.beams.length || (ceil(wandlengte / balkafstand) + 1)',
      stud_length: 'wandhoogte - 10',
    },
    ms_ua_profiel: {
      logic: 'horizontal rows at fixed spacing',
      count: 'ceil(wandhoogte / rachel_afstand)',
      length_per_row: 'wandlengte',
      sectionKey: 'ms_ua_profiel',
      wastePercentage: 'user_input',
    },
    folie_buiten: {
      logic: 'bruto oppervlakte + overlap',
      formula: 'bruto_m2 * (1 + (user_input_wastePercentage / 100))',
      sectionKey: 'folie_buiten',
      wastePercentage: 'user_input',
    },
    isolatie_basis: {
      logic: 'netto oppervlakte',
      formula: 'ceil(platen_nodig * (1 + (user_input_wastePercentage / 100)))',
      netto_m2: 'bruto_m2 - openingen_m2',
      plaat_m2: 'material.lengte * material.breedte / 1000000',
      platen_nodig: 'ceil(netto_m2 / plaat_m2)',
      sectionKey: 'isolatie_basis',
      wastePercentage: 'user_input',
    },
    constructieplaat: {
      logic: 'row_based_calculation',
      method: 'ceil(ceil(wandhoogte / material.breedte) * wandlengte / material.lengte)',
      orientation: 'liggend',
      sectionKey: 'constructieplaat',
      wastePercentage: 'user_input',
    },
    afwerkplaat: {
      logic: 'vertical_position_based',
      method: 'vertical sheets; move by material.breedte per column',
      orientation: 'staand',
      sectionKey: 'afwerkplaat',
      plate_width: 'material.breedte',
      plate_height: 'material.lengte',
      wastePercentage: 'user_input',
    },
    constructieplaat_1: {
      logic: 'row_based_calculation',
      method: 'ceil(ceil(wandhoogte / material.breedte) * wandlengte / material.lengte)',
      orientation: 'liggend',
      sectionKey: 'constructieplaat_1',
      wastePercentage: 'user_input',
    },
    beplating_1: {
      logic: 'vertical_position_based',
      method: 'vertical sheets; move by material.breedte per column',
      orientation: 'staand',
      sectionKey: 'beplating_1',
      plate_width: 'material.breedte',
      plate_height: 'material.lengte',
      wastePercentage: 'user_input',
    },
    dagkanten: {
      logic: 'stroken op basis van opening type en kozijndiepte',
      sectionKey: 'dagkanten',
      wastePercentage: 'niet nodig - nesting berekent exact',
    },
    vensterbanken: {
      logic: '1 per raamopening breedte',
      length: 'openingbreedte',
      sectionKey: 'vensterbanken',
    },
    plinten_vloer: {
      logic: 'wandlengte / material.lengte',
      formula: 'ceil(wandlengte / material.lengte)',
      sectionKey: 'plinten_vloer',
      wastePercentage: 'user_input',
    },
    hoekafwerking: {
      logic: 'lineair metrage binnenhoeken + buitenhoeken',
      formula: 'ceil((aantal_hoeken * wandhoogte) / material.lengte)',
      sectionKey: 'hoekafwerking',
    },
    koof_regelwerk: {
      logic: 'frame around pipe chase',
      formula: 'ceil((2 * kooflengte + (ceil(kooflengte / 600) * koofhoogte)) / material.lengte)',
      sectionKey: 'koof_regelwerk',
      wastePercentage: 'user_input',
    },
    koof_constructieplaat: {
      logic: '2 vlakken (front + onderzijde)',
      formula: 'ceil(koof_m2 / plaat_m2)',
      koof_m2: '(kooflengte * koofhoogte) + (kooflengte * koofdiepte)',
      sectionKey: 'koof_constructieplaat',
      wastePercentage: 'user_input',
    },
    koof_afwerkplaat: {
      logic: 'same as constructieplaat',
      sectionKey: 'koof_afwerkplaat',
      wastePercentage: 'user_input',
    },
    deur_blad: {
      logic: '1 deurblad per deuropening',
      sectionKey: 'deur_blad',
    },
    deur_scharnieren: {
      logic: 'set per deur',
      sectionKey: 'deur_scharnieren',
    },
    deur_krukken: {
      logic: 'set per deur',
      sectionKey: 'deur_krukken',
    },
    kozijn_element: {
      logic: 'lineair op kozijn omtrek',
      formula: 'ceil(kozijn_omtrek / material.lengte)',
      sectionKey: 'kozijn_element',
      wastePercentage: 'user_input',
    },
    glas: {
      logic: 'oppervlakte per opening',
      size: 'openingbreedte x openinghoogte',
      sectionKey: 'glas',
    },
  },
  'hsb-voorzetwand': {
    plinten_vloer: {
      logic: 'linear meters',
      formula: 'wandlengte * (1 + (user_input_wastePercentage / 100))',
      sectionKey: 'plinten_vloer',
    },
    afwerkplaat: {
      logic: 'vertical_position_based',
      sectionKey: 'afwerkplaat',
    },
    constructieplaat: {
      logic: 'row_based_calculation',
      sectionKey: 'constructieplaat',
    },
    deur_blad: {
      logic: '1 per opening',
      sectionKey: 'deur_blad',
    },
    deur_krukken: {
      logic: '1 set per deur (schild + kruk)',
      sectionKey: 'deur_krukken',
    },
    deur_scharnieren: {
      logic: '3 per deur standaard',
      sectionKey: 'deur_scharnieren',
    },
    ventilatie_latten: {
      logic: 'horizontal rows at fixed spacing',
      count: 'ceil(wandhoogte / rachel_afstand)',
      sectionKey: 'ventilatie_latten',
    },
    hoekafwerking: {
      logic: 'lineair metrage binnenhoeken + buitenhoeken',
      formula: 'ceil((aantal_hoeken * wandhoogte) / material.lengte)',
      sectionKey: 'hoekafwerking',
    },
    kozijn_compleet: {
      logic: '1 per kozijn',
      sectionKey: 'kozijn_compleet',
    },
    glas: {
      logic: '1 per kozijn',
      sectionKey: 'glas',
    },
    kozijn_element: {
      logic: '2x hoogte + 1x breedte per kozijn',
      formula: 'ceil(((2 * kozijnhoogte) + kozijnbreedte) / material.lengte)',
      sectionKey: 'kozijn_element',
    },
    koof_afwerkplaat: {
      logic: 'same as constructieplaat',
      sectionKey: 'koof_afwerkplaat',
    },
    koof_constructieplaat: {
      logic: '2 vlakken (front + onderzijde)',
      formula: 'ceil(koof_m2 / plaat_m2)',
      sectionKey: 'koof_constructieplaat',
    },
    koof_regelwerk: {
      logic: 'frame around pipe chase',
      formula: 'ceil((2 * kooflengte + (ceil(kooflengte / 600) * koofhoogte)) / material.lengte)',
      sectionKey: 'koof_regelwerk',
    },
    vensterbanken: {
      logic: '1 per raamopening breedte',
      sectionKey: 'vensterbanken',
    },
    folie_buiten: {
      logic: 'bruto oppervlakte + overlap',
      formula: 'bruto_m2 * (1 + (user_input_wastePercentage / 100))',
      sectionKey: 'folie_buiten',
    },
    isolatie_basis: {
      logic: 'netto oppervlakte',
      formula: 'ceil(platen_nodig * (1 + (user_input_wastePercentage / 100)))',
      sectionKey: 'isolatie_basis',
    },
  },
  'hbs-buiten-wand': {
    dagkant_binnen: {
      logic: 'linear_meter_perimeter',
      formula: '(height * 2) + width',
      sectionKey: 'dagkant_binnen',
    },
    hoekafwerking: {
      logic: 'full_length_no_stacking',
      sectionKey: 'hoekafwerking',
    },
    osb_binnen: {
      logic: 'full_sheet_increment',
      sectionKey: 'osb_binnen',
    },
    gevelbekleding: {
      logic: 'effective_width_calculation',
      formula: '((total_height / effective_width) * total_length) * waste_multiplier',
      sectionKey: 'gevelbekleding',
    },
    gips_finish: {
      logic: 'no_deduction_openings_lt_4m2',
      sectionKey: 'gips_finish',
    },
    regelwerk_hoofd: {
      logic: 'single_piece_structural_studs',
      sectionKey: 'regelwerk_hoofd',
    },
    isolatie_hoofd: {
      logic: 'full_packs_only',
      sectionKey: 'isolatie_hoofd',
    },
    regelwerk_inst: {
      logic: 'vertical_hoh_matching_studs',
      sectionKey: 'regelwerk_inst',
    },
    stelkozijn: {
      logic: 'perimeter_plus_waste',
      sectionKey: 'stelkozijn',
    },
  },
  knieschotten: {
    hoekafwerking: {
      logic: 'vertical_corners_only',
      formula: 'number_of_corners * height',
      sectionKey: 'hoekafwerking',
    },
    plinten_vloer: {
      logic: 'm1_plus_waste',
      sectionKey: 'plinten_vloer',
    },
    beplating: {
      logic: 'vertical_sheet_distribution',
      sectionKey: 'beplating',
    },
    staanders_en_liggers: {
      logic: 'hoh_stud_distribution',
      formula: '((length / hoh) + 1) * height',
      sectionKey: 'staanders_en_liggers',
    },
    afwerklatten: {
      logic: 'point_based_wiring',
      sectionKey: 'afwerklatten',
    },
    folie_buiten: {
      logic: 'm2_plus_overlap',
      sectionKey: 'folie_buiten',
    },
    isolatie_basis: {
      logic: 'full_packs_only',
      sectionKey: 'isolatie_basis',
    },
    koof_constructieplaat: {
      logic: 'linear_meter_if_width_lt_300mm',
      sectionKey: 'koof_constructieplaat',
    },
    schuifdeur_paneel: {
      logic: 'panel_overlap_calculation',
      formula: 'ceil(total_length / (panel_width - overlap))',
      sectionKey: 'schuifdeur_paneel',
    },
    schuifdeur_rails: {
      logic: 'full_length_rails',
      formula: 'total_length',
      sectionKey: 'schuifdeur_rails',
    },
  },
  'plafond-houten-framework': {
    plinten_plafond: {
      logic: 'perimeter of ceiling',
      formula: 'ceil((perimeter * wastePercentage) / material.lengte)',
      sectionKey: 'plinten_plafond',
    },
    beplating: {
      logic: 'horizontal rows, staggered joints',
      formula: 'ceil((netto_m2 * wastePercentage) / plaat_m2)',
      sectionKey: 'beplating',
    },
    koof_afwerkplaat: {
      logic: 'same surface area as constructieplaat',
      formula: 'ceil((koof_m2 * wastePercentage) / plaat_m2)',
      sectionKey: 'koof_afwerkplaat',
    },
    koof_constructieplaat: {
      logic: '3 visible sides (front + 2x sides) OR (front + bottom) depending on config',
      formula: 'ceil((koof_m2 * wastePercentage) / plaat_m2)',
      sectionKey: 'koof_constructieplaat',
    },
    koof_regelwerk: {
      logic: 'frame around pipe chase - 2 rails + vertical studs',
      formula: 'ceil(((2 * koof_lengte + ((ceil(koof_lengte / 600) + 1) * (koof_hoogte + koof_diepte))) * wastePercentage) / material.lengte)',
      sectionKey: 'koof_regelwerk',
    },
    luik_afwerking: {
      logic: 'perimeter of trap opening',
      formula: 'ceil((perimeter * wastePercentage) / material.lengte)',
      sectionKey: 'luik_afwerking',
    },
    vlizotrap_unit: {
      logic: '1 per vlizotrap component',
      formula: '1',
      sectionKey: 'vlizotrap_unit',
    },
    randhout: {
      logic: 'longitudinal beams at fixed spacing',
      formula: 'ceil((stud_count * stud_length * wastePercentage) / material.lengte)',
      sectionKey: 'randhout',
    },
    rachels: {
      logic: 'cross members perpendicular to balken at latafstand',
      formula: 'ceil((count * length_per_rachel * wastePercentage) / material.lengte)',
      count: 'ceil(plafond_lengte / latafstand) + 1',
      sectionKey: 'rachels',
    },
  },
  'vliering-maken': createVlieringRuleSet(),
  'gevelbekleding-trespa-hpl': createGevelbekledingRuleSet({
    sectionKeyBekleding: 'gevelplaat',
  }),
  'gevelbekleding-rockpanel': createGevelbekledingRuleSet({
    sectionKeyBekleding: 'gevelplaat_rockpanel',
  }),
  'gevelbekleding-hout': createGevelbekledingRuleSet({
    sectionKeyBekleding: 'gevelbekleding_hout',
    extraRules: {
      hoek_hout: {
        sectionKey: 'hoek_hout',
        group: 'bevestiging',
        logic: 'lineair op buitenhoeken',
        formula: 'if maatwerk_item.aantal_hoeken exists then lineair_m1 = (maatwerk_item.aantal_hoeken * gevel_hoogte_mm) / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else requires_manual_input',
        required_inputs: ['maatwerk_item.hoogte', 'maatwerk_item.aantal_hoeken', 'material.lengte'],
        missing_input_behavior: 'requires_manual_input',
        wastePercentage: 'user_input',
      },
    },
  }),
  'gevelbekleding-keralit': createGevelbekledingRuleSet({
    sectionKeyBekleding: 'gevelbekleding_kunststof',
    extraRules: {
      keralit_startprofiel: {
        sectionKey: 'keralit_startprofiel',
        group: 'bevestiging',
        logic: 'lineair onderzijde gevel',
        formula: 'lineair_m1 = gevel_lengte_mm / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
        required_inputs: ['maatwerk_item.lengte', 'material.lengte'],
        missing_input_behavior: 'requires_manual_input',
        wastePercentage: 'user_input',
      },
      keralit_eindprofiel: {
        sectionKey: 'keralit_eindprofiel',
        group: 'bevestiging',
        logic: 'lineair linker + rechter zijkant',
        formula: 'lineair_m1 = (2 * gevel_hoogte_mm) / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m)',
        required_inputs: ['maatwerk_item.hoogte', 'material.lengte'],
        missing_input_behavior: 'requires_manual_input',
        wastePercentage: 'user_input',
      },
      keralit_hoekprofiel: {
        sectionKey: 'keralit_hoekprofiel',
        group: 'bevestiging',
        logic: 'lineair op opgegeven buitenhoeken',
        formula: 'if maatwerk_item.aantal_hoeken exists then lineair_m1 = (maatwerk_item.aantal_hoeken * gevel_hoogte_mm) / 1000; aantal = ceil((lineair_m1 * (1 + waste/100)) / material.lengte_m); else requires_manual_input',
        required_inputs: ['maatwerk_item.hoogte', 'maatwerk_item.aantal_hoeken', 'material.lengte'],
        missing_input_behavior: 'requires_manual_input',
        wastePercentage: 'user_input',
      },
    },
  }),
  'hellend-dak': createHellendDakRuleSet(),
  'epdm-dakbedekking': createEpdmDakRuleSet(),
  'golfplaat-dak': createGolfplaatDakRuleSet(),
  'velux-dakraam': createDakraamRuleSet(),
  'massief-houten-vloer': createVloerAfwerkingRuleSet({
    variant: 'massief_hout',
    egaliseerSectionKey: 'egaline',
    plintSectionKey: 'plinten',
  }),
  'laminaat-pvc': createVloerAfwerkingRuleSet({
    variant: 'laminaat_pvc',
    egaliseerSectionKey: 'egaliseren',
    plintSectionKey: 'plinten_muur',
  }),
  'plinten-afwerklatten': createPlintenAfwerklattenRuleSet(),
  vensterbanken: createVensterbankenRuleSet(),
  dagkanten: createDagkantenRuleSet(),
  lichtkoepel: createLichtkoepelRuleSet(),
  vlizotrap: createVlizotrapRuleSet(),
  isolatieglas: createIsolatieglasRuleSet(),
  'schutting-hout': createSchuttingRuleSet({
    variant: 'hout',
    postSectionKey: 'schuttingpalen_hout',
    panelSectionKey: 'tuinscherm_hout',
    capSectionKey: 'paalkap',
    topLatSectionKey: 'afdeklat_hout',
    plankSectionKey: 'tuinplanken',
  }),
  'schutting-beton': createSchuttingRuleSet({
    variant: 'beton',
    postSectionKey: 'betonpalen',
    panelSectionKey: 'onderplaten',
    capSectionKey: 'afdekkap_beton',
    uniBeslagSectionKey: 'unibeslag',
  }),
  'schutting-composiet': createSchuttingRuleSet({
    variant: 'composiet',
    postSectionKey: 'aluminium_palen',
    panelSectionKey: 'tuinscherm_composiet',
    footSectionKey: 'paalvoet',
    uProfileSectionKey: 'u_profiel',
  }),
  'boeiboorden-trespa': createBoeiboordRuleSet({
    sectionKeyBeplating: 'boeiboord_plaat',
    sectionKeyAfwerking: 'afwerk_profiel',
  }),
  'boeiboorden-rockpanel': createBoeiboordRuleSet({
    sectionKeyBeplating: 'boeiboord_plaat',
    sectionKeyAfwerking: 'afwerk_profiel',
  }),
  'boeiboorden-hout': createBoeiboordRuleSet({
    sectionKeyBeplating: 'boeiboord_hout',
    sectionKeyAfwerking: 'afwerklatten',
  }),
  'boeiboorden-keralit': createBoeiboordRuleSet({
    sectionKeyBeplating: 'keralit_panelen',
    sectionKeyAfwerking: 'keralit_profielen',
  }),
};

const SLUG_ALIASES: Record<string, string> = {
  'hsb-buiten-wand': 'hbs-buiten-wand',
  'hsb-buitenwand': 'hbs-buiten-wand',
  'balklaag-constructievloer': 'vliering-maken',
  'metalstud-wand': 'metalstud-voorzetwand',
  'gevelbekleding-trespa': 'gevelbekleding-trespa-hpl',
  'dakrenovatie-pannen': 'hellend-dak',
  'dakrenovatie-epdm': 'epdm-dakbedekking',
  'dakrenovatie-golfplaat': 'golfplaat-dak',
  'dakrenovatie-golfplaten': 'golfplaat-dak',
  'glas-zetten': 'isolatieglas',
  glaszetten: 'isolatieglas',
  dakramen: 'velux-dakraam',
  dakraam: 'velux-dakraam',
  'diverse-dakramen': 'velux-dakraam',
  laminaat: 'laminaat-pvc',
  'pvc-vloer': 'laminaat-pvc',
  'vinyl-vloer': 'laminaat-pvc',
  'klik-vinyl': 'laminaat-pvc',
  'laminaat-vinyl': 'laminaat-pvc',
  'laminaat-pvc-vinyl': 'laminaat-pvc',
  parketvloer: 'massief-houten-vloer',
  'houten-vloer': 'massief-houten-vloer',
  'massief-hout-vloer': 'massief-houten-vloer',
  'plinten-en-afwerklatten': 'plinten-afwerklatten',
  plintenafwerking: 'plinten-afwerklatten',
  vensterbank: 'vensterbanken',
  dagkant: 'dagkanten',
  lichtkoepels: 'lichtkoepel',
  'diverse-lichtkoepels': 'lichtkoepel',
  'licht-koepel': 'lichtkoepel',
  vlizotrappen: 'vlizotrap',
  zoldertrap: 'vlizotrap',
  zoldertrappen: 'vlizotrap',
  'zoldertrappen-vlizotrappen': 'vlizotrap',
  'zoldertrappen-&-vlizotrappen': 'vlizotrap',
  'zoldertrappen-en-vlizotrappen': 'vlizotrap',
  'schutting-houten': 'schutting-hout',
  'schutting-betonnen': 'schutting-beton',
  'schutting-composite': 'schutting-composiet',
  'boeidelen-trespa': 'boeiboorden-trespa',
  'boeidelen-rockpanel': 'boeiboorden-rockpanel',
  'boeidelen-hout': 'boeiboorden-hout',
  'boeidelen-keralit': 'boeiboorden-keralit',
};

const SECTION_KEY_ALIASES_BY_SLUG: Record<string, Record<string, string>> = {
  'vliering-maken': {
    muurplaat: 'randbalken',
    isolatie: 'isolatie_basis',
    balken: 'vloerbalken',
    trap: 'vlizotrap_unit',
    vlizotrap: 'vlizotrap_unit',
    luik: 'vlizotrap_unit',
    architraaf: 'luik_afwerking',
    regelwerk: 'koof_regelwerk',
    constructieplaat: 'koof_constructieplaat',
    koof_beplating: 'koof_constructieplaat',
    afwerkplaat: 'koof_afwerkplaat',
  },
  'gevelbekleding-trespa-hpl': {
    gevelbekleding: 'gevelplaat',
    isolatie_basis: 'isolatie_gevel',
  },
  'gevelbekleding-rockpanel': {
    gevelbekleding: 'gevelplaat_rockpanel',
    isolatie_basis: 'isolatie_gevel',
    gevelplaat: 'gevelplaat_rockpanel',
  },
  'gevelbekleding-hout': {
    gevelbekleding: 'gevelbekleding_hout',
    isolatie_basis: 'isolatie_gevel',
  },
  'gevelbekleding-keralit': {
    gevelbekleding: 'gevelbekleding_kunststof',
    keralit_panelen: 'gevelbekleding_kunststof',
    isolatie_basis: 'isolatie_gevel',
  },
  'hellend-dak': {
    folie: 'folie_buiten',
    isolatie: 'isolatie_dak',
    nokkit: 'nok_kit',
    nokvorst_kit: 'nok_kit',
    boeiboord: 'boeiboord_placeholder',
  },
  'epdm-dakbedekking': {
    epdm: 'epdm_folie',
    lijm: 'epdm_lijm',
    folie: 'folie_binnen',
    isolatie: 'isolatie_dak',
    uitloop: 'hwa_uitloop',
    boeiboord: 'boeiboord_placeholder',
  },
  'golfplaat-dak': {
    isolatie: 'isolatie_dak',
    schroeven: 'golfplaatschroeven',
    golfplaat_schroeven: 'golfplaatschroeven',
    afvoer: 'hwa',
  },
  isolatieglas: {
    ventilatierooster: 'roosters',
    ventilatie_roosters: 'roosters',
    ventilatie_rooster: 'roosters',
    rooster: 'roosters',
    glaslat: 'glaslatten',
    glaslatten_klik: 'glaslatten',
  },
  'velux-dakraam': {
    vensterset: 'vensterset_compleet',
    dakraam_set: 'vensterset_compleet',
    venster: 'venster_los',
    dakraam: 'venster_los',
    gootstukken: 'gootstuk',
    aftimmering: 'betimmering',
    afwerkplaat: 'betimmering',
    plint: 'plinten',
  },
  lichtkoepel: {
    lichtkoepel_set: 'koepel',
    koepel_set: 'koepel',
    prefab_opstand: 'opstand',
    opstand_prefab: 'opstand',
    opstand_hout: 'opstand',
    dakbedekking_epdm: 'dakbedekking',
    dakbedekking_rol: 'dakbedekking',
    afwerkplaat: 'betimmering',
    aftimmering: 'betimmering',
    plint: 'plinten',
  },
  'laminaat-pvc': {
    egaline: 'egaliseren',
    reparatiemortel: 'egaliseren',
    dampfolie: 'folie',
    ondervloer_folie: 'folie',
    plinten: 'plinten_muur',
    overgangsprofiel: 'profielen_overgang',
    overgangsprofielen: 'profielen_overgang',
    drempel: 'profielen_overgang',
    eindprofiel: 'profielen_eind',
    eindprofielen: 'profielen_eind',
    matomranding: 'kruipluik',
  },
  'massief-houten-vloer': {
    egaliseren: 'egaline',
    plinten_muur: 'plinten',
    overgangsprofiel: 'dorpels',
    overgangsprofielen: 'dorpels',
    drempel: 'dorpels',
    olie: 'vloerolie',
    vloerlak: 'vloerolie',
    lak: 'vloerolie',
  },
  'plinten-afwerklatten': {
    plafondplinten: 'plinten',
    plinten_muur: 'vloerplinten',
    afwerklatten: 'koplatten',
    deklatten: 'koplatten',
  },
  vensterbanken: {
    regelwerk: 'frame',
    ventilatierooster: 'roosters',
    ventilatie_roosters: 'roosters',
    olie: 'behandeling',
    lak: 'behandeling',
    beits: 'behandeling',
  },
  dagkanten: {
    regelwerk: 'frame',
    betimmering: 'dagkant',
    dagkantafwerking: 'dagkant',
    hoekprofielen: 'hoekprofiel',
  },
  'schutting-hout': {
    schuttingpalen: 'schuttingpalen_hout',
    palen: 'schuttingpalen_hout',
    tuinscherm: 'tuinscherm_hout',
    schermen: 'tuinscherm_hout',
    afdeklat: 'afdeklat_hout',
    tuinplank: 'tuinplanken',
    poort: 'tuinpoort',
    opsluitband: 'opsluitbanden',
    paalpunt: 'paalpunthouder',
  },
  'schutting-beton': {
    palen: 'betonpalen',
    schuttingpalen: 'betonpalen',
    schermen: 'onderplaten',
    tuinscherm: 'onderplaten',
    afdekkap: 'afdekkap_beton',
    poort: 'tuinpoort',
    opsluitband: 'opsluitbanden',
    paalpunt: 'paalpunthouder',
  },
  'schutting-composiet': {
    palen: 'aluminium_palen',
    schermen: 'tuinscherm_composiet',
    tuinscherm: 'tuinscherm_composiet',
    paalvoeten: 'paalvoet',
    paalvoet_composiet: 'paalvoet',
    uprofiel: 'u_profiel',
    poort: 'tuinpoort',
    opsluitband: 'opsluitbanden',
    paalpunt: 'paalpunthouder',
  },
  vlizotrap: {
    vlizotrap: 'trap',
    vlizotrap_unit: 'trap',
    zolderluik: 'luik',
    luik_afwerking: 'architraaf',
    koplatten: 'architraaf',
    veiligheidshek: 'traphek',
    veiligheidspoortje: 'poortje',
    scharnier: 'scharnieren',
  },
};

function normalizeSlug(value: string): string {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  return SLUG_ALIASES[normalized] || normalized;
}

function normalizeSectionKey(value?: string | null): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function resolveRuleForSection(
  slug: string,
  rulesForSlug: Record<string, Record<string, any>>,
  sectionKey: string
): Record<string, any> | null {
  const direct = rulesForSlug[sectionKey];
  if (direct) return direct;

  const aliasMap = SECTION_KEY_ALIASES_BY_SLUG[slug];
  const aliasedSectionKey = aliasMap?.[sectionKey];
  if (aliasedSectionKey) {
    const aliased = rulesForSlug[aliasedSectionKey];
    if (aliased) return aliased;
  }

  // Typical side-based keys are stored as _1 in rules and reused for _2.
  if (sectionKey.endsWith('_2')) {
    const baseSectionKey = sectionKey.replace(/_2$/, '_1');
    const fallback = rulesForSlug[baseSectionKey];
    if (fallback) return fallback;

    const aliasedBaseSectionKey = aliasMap?.[baseSectionKey];
    if (aliasedBaseSectionKey) {
      const aliasedFallback = rulesForSlug[aliasedBaseSectionKey];
      if (aliasedFallback) return aliasedFallback;
    }
  }

  return null;
}

export function getMaterialRule(jobSlug: string, sectionKey?: string | null): MaterialRuleAttachment | null {
  const slug = normalizeSlug(jobSlug);
  if (!slug) return null;

  const rulesForSlug = STATIC_RULES_BY_SLUG[slug];
  if (!rulesForSlug) return null;

  const normalizedSectionKey = normalizeSectionKey(sectionKey);
  if (!normalizedSectionKey) {
    return {
      rule: null,
      rule_meta: {
        source: 'static_file',
        slug,
        sectionKey: null,
        version: KLUS_REGELS_STATIC_VERSION,
        status: 'missing',
      },
    };
  }

  const rule = resolveRuleForSection(slug, rulesForSlug, normalizedSectionKey);
  if (!rule) {
    return {
      rule: null,
      rule_meta: {
        source: 'static_file',
        slug,
        sectionKey: normalizedSectionKey,
        version: KLUS_REGELS_STATIC_VERSION,
        status: 'missing',
      },
    };
  }

  const normalizedRule =
    typeof rule.sectionKey === 'string' && rule.sectionKey !== normalizedSectionKey
      ? { ...rule, sectionKey: normalizedSectionKey }
      : { ...rule };

  return {
    rule: normalizedRule,
    rule_meta: {
      source: 'static_file',
      slug,
      sectionKey: normalizedSectionKey,
      version: KLUS_REGELS_STATIC_VERSION,
      status: 'resolved',
    },
  };
}
