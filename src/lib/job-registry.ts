// src/lib/job-registry.ts


export const MATERIAL_CATEGORY_INFO = {
  // --- EXISTING STRUCTURE ---
  Stalen_Kozijn: { title: 'Stalen Kozijn', order: 1 }, // Legacy/Fallback
  'Stalen kozijn': { title: 'Stalen Kozijn', order: 1 }, // ✅ Matches new code (with space)
  hout: { title: 'Framewerk', order: 1 },
  raam: { title: 'Ramen', order: 2 }, // ✅ Added for Custom work
  metaal: { title: 'Framewerk', order: 1 },
  dak: { title: 'Dakwerk & Bedekking', order: 2 },
  gevel: { title: 'Gevelbekleding', order: 3 },
  werkblad: { title: 'werkblad', order: 3 },
  // --- DAKRAMEN & LICHTKOEPELS ---
  venster: { title: 'Basis: Het Venster', order: 1 },
  gootstuk: { title: 'Waterdichtheid: Gootstukken', order: 2 },
  koepel: { title: 'De Koepel', order: 1 },
  opstand: { title: 'De Opstand (Basis)', order: 2 },
  basis: { title: 'Afwerking & Aftimmering', order: 3 },
  afwerking: { title: 'Afwerking & Aftimmering', order: 3 },
  trap: { title: 'De Trap (Basis)', order: 1 },
  veiligheid: { title: 'Leuningen & Hekwerken', order: 2 },
  // --- PREFAB / ELEMENTEN ---
  // --- TUIN & SCHUTTING ---
  fundering: { title: 'Fundering & Palen', order: 1 },
  schutting_hout: { title: 'Schutting (Hout)', order: 2 },
  schutting_beton: { title: 'Schutting (Beton)', order: 2 },
  schutting_composiet: { title: 'Schutting (Composiet)', order: 2 },
  poort: { title: 'Poort & Toegang', order: 3 },
  element: { title: 'Elementen', order: 1 }, // ✅ Added for Prefab
  montage: { title: 'Montage & Afdichting', order: 2 }, // ✅ Added for Prefab/Kunststof
  afwerking_dak: { title: 'Afwerking (Dak)', order: 5 },
  // --- CONSTRUCTIE ---
  Constructievloer: { title: 'Balklaag & Constructie', order: 1 },
  Vlonder_Fundering: { title: 'Grondwerk & Fundering', order: 1 },
  dorpels: { title: 'Dorpels', order: 2 }, // ✅ Added for separate sills
  // --- GEVEL OPTIES (VARIANTS) ---
  gevel_hout: { title: 'Gevelbekleding (Hout)', order: 3 },
  gevel_kunststof: { title: 'Gevelbekleding (Kunststof)', order: 3 },
  gevel_cement: { title: 'Gevelbekleding (Cementvezel)', order: 3 },
  gevel_plaat: { title: 'Gevelbekleding (Platen)', order: 3 },
  gevel_plaat_lijm: { title: 'Gevelbekleding (Platen)', order: 3 },
  // --- ALGEMEEN ---
  bevestiging: { title: 'Bevestiging & Montage', order: 99 }, // Generic category for screws/kit
  // --- BESLAG & TOEGANG ---
  deurbeslag: { title: 'Deurbeslag & Sloten', order: 8 },
  beslag: { title: 'Hang- & Sluitwerk', order: 8 },
  Kozijnen: { title: 'Kozijnen', order: 7 },
  Deuren: { title: 'Deuren', order: 8 },
  Schuifdeuren: { title: 'Schuifdeuren', order: 8 },
  Toegang: { title: 'Toegang & Vlizotrap', order: 14 },
  vensterset: { title: 'vensterset', order: 14 },
  // --- GLAS & ISOLATIE ---
  glas: { title: 'Glas & Beglazing', order: 9 },
  ventilatie: { title: 'Ventilatie', order: 10 },
  tochtstrips: { title: 'Tochtwering', order: 9 },
  isolatie: { title: 'Isolatie & Folies', order: 2 },

  // --- AFWERKING ---
  beplating: { title: 'Beplating', order: 3 },
  beplating_afwerking: { title: 'Beplating (Plafond)', order: 11 },
  afwerking_binnen: { title: 'Afwerken (Binnen)', order: 4 },
  afwerking_buiten: { title: 'Afwerken (Buiten)', order: 5 },
  lijstwerk: { title: 'Lijstwerk', order: 4 }, // ✅ Added for Koplatten/Neuten
  gips_afwerking: { title: 'Naden & Stucwerk', order: 6 },
  Koof: { title: 'Leidingkoof / Omkasting', order: 9 },
  Gordijnkoof: { title: 'Gordijnkoof', order: 10 },
  Cinewall: { title: 'Cinewall Elementen', order: 21 },
  // --- TUIN & SCHUTTING ---

  //#region --- VLOEREN ---
  Vlonder_Constructie: { title: 'Constructie (Onderbouw)', order: 2 },
  Vloer_Voorbereiding: { title: 'Voorbereiding', order: 2 },
  Vloer_Hout: { title: 'Parket', order: 3 },
  Vloer_Laminaat: { title: 'Vloerdelen', order: 3 },
  Vlonder_Dek: { title: 'Vlonder & Afwerking', order: 3 },
  Vloer_Afwerking: { title: 'Afwerking', order: 4 },

  // --- INSTALLATIE ---
  Installatie: { title: 'Installatie & Elektra', order: 20 },
  Schakelmateriaal: { title: 'Schakelmateriaal', order: 22 },
  // --- HOUTROTREPARATIE ---
  reparatie: { title: 'Reparatie & Herstel', order: 1 },
  // --- VLIERING ---
  Vliering_Constructie: { title: '1. Constructie & Vloer (Bovenzijde)', order: 1 },
  Vliering_Plafond_Hout: { title: '2. Plafondafwerking (Hout)', order: 2 },
  Vliering_Plafond_Metaal: { title: '2. Plafondafwerking (Metal Stud)', order: 3 },
  Vliering_Toegang: { title: '3. Vlizotrap & Toegang', order: 4 },
  Vliering_Isolatie: { title: '4. Isolatie & Elektra', order: 5 },
} as const;


//#region total category extra info
export type MaterialCategoryKey = keyof typeof MATERIAL_CATEGORY_INFO;

// 2. THE PRESETS (So you don't have to copy-paste orders 100 times)
// You can reference these inside your cards below.

export const WALL_CONFIG = MATERIAL_CATEGORY_INFO; // Default

export const CEILING_CONFIG = {
  ...MATERIAL_CATEGORY_INFO,
  // Custom Ceiling Order:
  Koof: { ...MATERIAL_CATEGORY_INFO.Koof, order: 2 },
  Gordijnkoof: { ...MATERIAL_CATEGORY_INFO.Gordijnkoof, order: 3 },
  Installatie: { ...MATERIAL_CATEGORY_INFO.Installatie, order: 4 }, // Installatie comes earlier in ceilings
  isolatie: { ...MATERIAL_CATEGORY_INFO.isolatie, order: 6 },
};

export const VLIERING_CONFIG = {
  ...MATERIAL_CATEGORY_INFO,
  Vliering_Constructie: { ...MATERIAL_CATEGORY_INFO.Vliering_Constructie, order: 1 },
  Vliering_Plafond_Hout: { ...MATERIAL_CATEGORY_INFO.Vliering_Plafond_Hout, order: 2 },
  Vliering_Plafond_Metaal: { ...MATERIAL_CATEGORY_INFO.Vliering_Plafond_Metaal, order: 3 },
  Vliering_Toegang: { ...MATERIAL_CATEGORY_INFO.Vliering_Toegang, order: 4 },
  Vliering_Isolatie: { ...MATERIAL_CATEGORY_INFO.Vliering_Isolatie, order: 5 },
};
export const FLOOR_CONFIG = {
  ...MATERIAL_CATEGORY_INFO,
  // Custom Floor Order:
  Constructievloer: { ...MATERIAL_CATEGORY_INFO.Constructievloer, order: 1 },
  Vloer_Voorbereiding: { ...MATERIAL_CATEGORY_INFO.Vloer_Voorbereiding, order: 2 },
  Vloer_Hout: { ...MATERIAL_CATEGORY_INFO.Vloer_Hout, order: 3 },
  Vloer_Laminaat: { ...MATERIAL_CATEGORY_INFO.Vloer_Laminaat, order: 3 },
  Vloer_Afwerking: { ...MATERIAL_CATEGORY_INFO.Vloer_Afwerking, order: 4 },
};

export const GARDEN_CONFIG = {
  ...MATERIAL_CATEGORY_INFO,
  Vlonder_Fundering: { ...MATERIAL_CATEGORY_INFO.Vlonder_Fundering, order: 1 },
  Vlonder_Constructie: { ...MATERIAL_CATEGORY_INFO.Vlonder_Constructie, order: 2 },
  Vlonder_Dek: { ...MATERIAL_CATEGORY_INFO.Vlonder_Dek, order: 3 },
};

// ==========================================
// 2. INTERFACES (Types)
// ==========================================

export interface MeasurementField {
  key: string;
  label: string;
  type: 'number' | 'text' | 'textarea';
  suffix?: string;
  placeholder?: string;
  defaultValue?: string | number;
}

export interface MaterialSection {
  key: string;              // Database ID (e.g. 'balkhout')
  label: string;            // UI Title (e.g. 'Houten regelwerk')
  categoryFilter?: string;  // Search filter for the modal (e.g. 'Balkhout')
  category?: MaterialCategoryKey; // Now this works because Key is defined above
  category_ultra_filter?: string; // Reserved for future filtering
}

export interface JobSubItem {
  title: string;
  description: string;
  slug: string;
  measurementLabel?: string;
  measurements?: MeasurementField[];
  materialSections?: MaterialSection[];
  categoryConfig?: Record<string, { title: string; order: number }>; // PER-JOB CATEGORY ORDERING
}

export interface CategoryConfig {
  title: string;
  searchPlaceholder: string;
  items: JobSubItem[];
}

//#endregion

// #region 3. MEASUREMENT CONFIGURATIONS
// ==========================================
// 3. MEASUREMENT CONFIGURATIONS
// ==========================================

const STANDARD_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
  { key: 'hoogte', label: 'Hoogte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 2600' },
  { key: 'opmerkingen', label: 'Extra opmerkingen', type: 'textarea', placeholder: 'Bijzondere details...' }
];

const WALL_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
  { key: 'hoogte', label: 'Hoogte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 2600' },
  { key: 'balkafstand', label: 'Balkafstand (h.o.h.)', type: 'number', suffix: 'mm', defaultValue: 600 },
  { key: 'opmerkingen', label: 'Extra opmerkingen', type: 'textarea', placeholder: 'Bijzondere details...' }
];

const CEILLING_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
  { key: 'hoogte', label: 'Hoogte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 2600' },
  { key: 'balkafstand', label: 'Balkafstand (h.o.h.)', type: 'number', suffix: 'mm', defaultValue: 700 },
  { key: 'latafstand', label: 'Latafstand (h.o.h.)', type: 'number', suffix: 'mm', defaultValue: 300 },
  { key: 'opmerkingen', label: 'Extra opmerkingen', type: 'textarea', placeholder: 'Bijzondere details...' }
];

const AREA_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
  { key: 'breedte', label: 'Breedte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 4000' },
  { key: 'opmerkingen', label: 'Extra opmerkingen', type: 'textarea', placeholder: 'Bijzondere details...' }
];

const COUNT_FIELDS: MeasurementField[] = [
  { key: 'breedte', label: 'Breedte per stuk', type: 'number', suffix: 'mm', placeholder: 'Bijv. 930' },
  { key: 'hoogte', label: 'Hoogte per stuk', type: 'number', suffix: 'mm', placeholder: 'Bijv. 2315' },
  { key: 'aantal', label: 'Aantal', type: 'number', suffix: 'stuks', placeholder: 'Bijv. 1' },
  { key: 'opmerkingen', label: 'Extra opmerkingen', type: 'textarea', placeholder: 'Bijzondere details...' }
];
// #endregion

// ==========================================
// 4. MATERIAL CONFIGURATIONS (Cards)
// ==========================================



//#region ========================================== MATERIAL SECTIONS - WANDEN XXX==========================================

const HSB_VOORZETWAND_BINNEN_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE
  { key: 'staanders_en_liggers', label: 'Staanders & Liggers', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },
  { key: 'ventilatie_latten', label: 'Tengelwerk / Rachels', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },

  // 2. ISOLATIE & FOLIES
  { key: 'folie_buiten', label: 'Folies', categoryFilter: 'Overig', category: 'isolatie', category_ultra_filter: '' },
  { key: 'isolatie_basis', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', category_ultra_filter: '' },

  // 3. BEPLATING
  { key: 'constructieplaat', label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },
  { key: 'beplating', label: 'Afwerkplaat', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },

  // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
  { key: 'koof_regelwerk', label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Koof', category_ultra_filter: '' },
  { key: 'koof_beplating', label: 'Beplating', categoryFilter: 'Constructieplaten', category: 'Koof', category_ultra_filter: '' },
  { key: 'koof_isolatie', label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', category_ultra_filter: '' }, // Often needed for drain pipes

  // 4. AFWERKEN (TIMMERWERK)
  // These are the wooden finishes the carpenter installs
  { key: 'dagkanten', label: 'Dagkanten', categoryFilter: 'Constructieplaten', category: 'afwerking', category_ultra_filter: '' },
  { key: 'vensterbanken', label: 'Vensterbanken', categoryFilter: 'Vensterbanken', category: 'afwerking', category_ultra_filter: '' },
  { key: 'plinten_vloer', label: 'Vloerplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', category_ultra_filter: '' },
  { key: 'plinten_plafond', label: 'Plafondplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', category_ultra_filter: '' },

  { key: 'kabelkanaal', label: 'Elektra Buizen / Flex', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  // The blue boxes that clamp into the hollow wall (ESSENTIAL)
  { key: 'hollewanddozen', label: 'Hollewanddozen', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  // The actual wire to bring power from the nearest point
  { key: 'elektrakabel', label: 'Installatiekabel', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  // The visible finish: Sockets for TV/Haard and Switches for LEDs
  { key: 'schakelmateriaal_basis', label: 'Stopcontacten & Schakelaars', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },

  // 5. AFWERKEN (GIPS & WAND)
  // This is the new section for smoothing the wall
  { key: 'hoekafwerking', label: 'Hoekprofielen', categoryFilter: 'Overig', category: 'gips_afwerking', category_ultra_filter: '' },
  { key: 'gips_vuller', label: 'Voegenmiddel', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },
  { key: 'gips_finish', label: 'Finish Pasta', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },

  // 6. KOZIJNEN
  { key: 'kozijn_element', label: 'Kozijnen', categoryFilter: 'Binnenkozijnen', category: 'Kozijnen', category_ultra_filter: '' },
  { key: 'glas_roosters', label: 'Glas & Roosters', categoryFilter: 'Overig', category: 'Kozijnen', category_ultra_filter: '' },

  // 7. DEUREN & BESLAG
  { key: 'deur_blad', label: 'Binnendeuren', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },
  { key: 'deur_scharnieren', label: 'Scharnieren', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },
  { key: 'deur_sloten', label: 'Sloten', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },
  { key: 'deur_krukken', label: 'Deurbeslag', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },
  { key: 'deur_rooster', label: 'Deurroosters', categoryFilter: 'Overig', category: 'Deuren', category_ultra_filter: '' },
];

const METALSTUD_VOORZETWAND_BINNEN_MATS: MaterialSection[] = [
  // 1. METAAL & CONSTRUCTIE
  // SPLIT: Now the user picks the Floor/Ceiling track...
  { key: 'ms_liggers', label: 'Liggers (U-profielen)', categoryFilter: 'Metalstud Profielen', category: 'metaal', category_ultra_filter: '' },
  // ...and then picks the Vertical Studs separately.
  { key: 'ms_staanders', label: 'Staanders (C-profielen)', categoryFilter: 'Metalstud Profielen', category: 'metaal', category_ultra_filter: '' },

  // Don't forget the UA (Door reinforcement)
  { key: 'ms_ua_profiel', label: 'Verstevigingsprofielen (UA)', categoryFilter: 'Metalstud Profielen', category: 'metaal', category_ultra_filter: '' },

  // 2. ISOLATIE & FOLIES
  { key: 'folie_buiten', label: 'Folies', categoryFilter: 'Overig', category: 'isolatie', category_ultra_filter: '' },
  { key: 'isolatie_basis', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', category_ultra_filter: '' },

  // 3. BEPLATING
  { key: 'constructieplaat', label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },
  { key: 'beplating', label: 'Afwerkplaat', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },

  { key: 'kabelkanaal', label: 'Elektra Buizen / Flex', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  // The blue boxes that clamp into the hollow wall (ESSENTIAL)
  { key: 'hollewanddozen', label: 'Hollewanddozen', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  // The actual wire to bring power from the nearest point
  { key: 'elektrakabel', label: 'Installatiekabel', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  // The visible finish: Sockets for TV/Haard and Switches for LEDs
  { key: 'schakelmateriaal_basis', label: 'Stopcontacten & Schakelaars', categoryFilter: 'Overig', category: 'Schakelmateriaal', category_ultra_filter: '' },

  // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
  { key: 'koof_regelwerk', label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Koof', category_ultra_filter: '' },
  { key: 'koof_beplating', label: 'Beplating', categoryFilter: 'Constructieplaten', category: 'Koof', category_ultra_filter: '' },
  { key: 'koof_isolatie', label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', category_ultra_filter: '' }, // Often needed for drain pipes

  // 4. AFWERKEN (TIMMERWERK)
  { key: 'dagkanten', label: 'Dagkanten', categoryFilter: 'Constructieplaten', category: 'afwerking', category_ultra_filter: '' },
  { key: 'vensterbanken', label: 'Vensterbanken', categoryFilter: 'Vensterbanken', category: 'afwerking', category_ultra_filter: '' },
  { key: 'plinten_vloer', label: 'Vloerplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', category_ultra_filter: '' },
  { key: 'plinten_plafond', label: 'Plafondplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', category_ultra_filter: '' },

  // 5. AFWERKEN (GIPS / STUC)
  { key: 'hoekafwerking', label: 'Hoekprofielen', categoryFilter: 'Overig', category: 'gips_afwerking', category_ultra_filter: '' },
  { key: 'gips_wapening', label: 'Wapeningsband', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },
  { key: 'gips_vuller', label: 'Voegenmiddel', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },
  { key: 'gips_finish', label: 'Finish Pasta', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },

  // 6. KOZIJNEN
  { key: 'kozijn_element', label: 'Raamkozijnen', categoryFilter: 'Binnenkozijnen', category: 'Kozijnen', category_ultra_filter: '' },
  { key: 'deur_kozijn', label: 'Deurkozijnen', categoryFilter: 'Binnenkozijnen', category: 'Kozijnen', category_ultra_filter: '' },
  { key: 'glas_roosters', label: 'Glas & Roosters', categoryFilter: 'Overig', category: 'Kozijnen', category_ultra_filter: '' },

  // 7. DEUREN & BESLAG
  { key: 'deur_blad', label: 'Binnendeuren', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },
  { key: 'deur_scharnieren', label: 'Scharnieren', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },
  { key: 'deur_sloten', label: 'Sloten', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },
  { key: 'deur_krukken', label: 'Deurbeslag', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },
  { key: 'deur_rooster', label: 'Deurroosters', categoryFilter: 'Overig', category: 'Deuren', category_ultra_filter: '' },
];



const HSB_TUSSENWAND_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE
  { key: 'staanders_en_liggers', label: 'Staanders & Liggers', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },

  // 2. ISOLATIE & FOLIES
  { key: 'isolatie_basis', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', category_ultra_filter: '' },
  { key: 'folie_buiten', label: 'Folies', categoryFilter: 'Overig', category: 'isolatie', category_ultra_filter: '' },

  // 3. BEPLATING (ZIJDE 1)
  { key: 'constructieplaat_1', label: 'Constructieplaat (Zijde 1)', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },
  { key: 'constructieplaat_2', label: 'Constructieplaat (Zijde 2)', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },
  { key: 'beplating_1', label: 'Afwerkplaat (Zijde 1)', categoryFilter: 'Gipsplaten', category: 'beplating', category_ultra_filter: '' },
  { key: 'beplating_2', label: 'Afwerkplaat (Zijde 2)', categoryFilter: 'Gipsplaten', category: 'beplating', category_ultra_filter: '' },

  // 4. AFWERKEN (TIMMERWERK)
  { key: 'dagkanten', label: 'Dagkanten', categoryFilter: 'Constructieplaten', category: 'afwerking', category_ultra_filter: '' },
  { key: 'vensterbanken', label: 'Vensterbanken', categoryFilter: 'Vensterbanken', category: 'afwerking', category_ultra_filter: '' },
  { key: 'plinten_vloer', label: 'Vloerplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', category_ultra_filter: '' },
  { key: 'plinten_plafond', label: 'Plafondplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', category_ultra_filter: '' },

  // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
  { key: 'koof_regelwerk', label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Koof', category_ultra_filter: '' },
  { key: 'koof_beplating', label: 'Beplating', categoryFilter: 'Constructieplaten', category: 'Koof', category_ultra_filter: '' },
  { key: 'koof_isolatie', label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', category_ultra_filter: '' }, // Often needed for drain pipes


  { key: 'kabelkanaal', label: 'Elektra Buizen / Flex', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  // The blue boxes that clamp into the hollow wall (ESSENTIAL)
  { key: 'hollewanddozen', label: 'Hollewanddozen', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  // The actual wire to bring power from the nearest point
  { key: 'elektrakabel', label: 'Installatiekabel', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  // The visible finish: Sockets for TV/Haard and Switches for LEDs
  { key: 'schakelmateriaal_basis', label: 'Stopcontacten & Schakelaars', categoryFilter: 'Overig', category: 'Schakelmateriaal', category_ultra_filter: '' },

  // 5. AFWERKEN (GIPS & WAND)
  { key: 'hoekafwerking', label: 'Hoekprofielen', categoryFilter: 'Overig', category: 'gips_afwerking', category_ultra_filter: '' },
  { key: 'gips_vuller', label: 'Voegenmiddel', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },
  { key: 'gips_finish', label: 'Finish Pasta', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },

  // 6. KOZIJNEN
  { key: 'kozijn_element', label: 'Kozijnen', categoryFilter: 'Binnenkozijnen', category: 'Kozijnen', category_ultra_filter: '' },
  { key: 'glas_roosters', label: 'Glas & Roosters', categoryFilter: 'Overig', category: 'Kozijnen', category_ultra_filter: '' },

  // 7. DEUREN & BESLAG
  { key: 'deur_blad', label: 'Binnendeuren', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },
  { key: 'deur_scharnieren', label: 'Scharnieren', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },
  { key: 'deur_sloten', label: 'Sloten', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },
  { key: 'deur_krukken', label: 'Deurbeslag', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },
  { key: 'deur_rooster', label: 'Deurroosters', categoryFilter: 'Overig', category: 'Deuren', category_ultra_filter: '' },
];



const METALSTUD_TUSSENWAND_MATS: MaterialSection[] = [
  // 1. METAAL & CONSTRUCTIE
  { key: 'ms_liggers', label: 'Liggers (U-profielen)', categoryFilter: 'Metalstud Profielen', category: 'metaal', category_ultra_filter: '' },
  { key: 'ms_staanders', label: 'Staanders (C-profielen)', categoryFilter: 'Metalstud Profielen', category: 'metaal', category_ultra_filter: '' },
  { key: 'ms_ua_profiel', label: 'Verstevigingsprofielen (UA)', categoryFilter: 'Metalstud Profielen', category: 'metaal', category_ultra_filter: '' },

  // 2. ISOLATIE & FOLIES
  // Folies are optional for partitions (bathroom side), but kept for consistency
  { key: 'folie_buiten', label: 'Folies', categoryFilter: 'Overig', category: 'isolatie', category_ultra_filter: '' },
  { key: 'isolatie_basis', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', category_ultra_filter: '' },

  // 3. BEPLATING (ZIJDE 1)
  { key: 'constructieplaat_1', label: 'Constructieplaat (Zijde 1)', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },
  { key: 'constructieplaat_2', label: 'Constructieplaat (Zijde 2)', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },
  { key: 'beplating_1', label: 'Afwerkplaat (Zijde 1)', categoryFilter: 'Gipsplaten', category: 'beplating', category_ultra_filter: '' },
  { key: 'beplating_2', label: 'Afwerkplaat (Zijde 2)', categoryFilter: 'Gipsplaten', category: 'beplating', category_ultra_filter: '' },

  // 4. AFWERKEN (TIMMERWERK)
  { key: 'dagkanten', label: 'Dagkanten', categoryFilter: 'Constructieplaten', category: 'afwerking', category_ultra_filter: '' },
  { key: 'vensterbanken', label: 'Vensterbanken', categoryFilter: 'Vensterbanken', category: 'afwerking', category_ultra_filter: '' },
  { key: 'plinten_vloer', label: 'Vloerplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', category_ultra_filter: '' },
  { key: 'plinten_plafond', label: 'Plafondplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', category_ultra_filter: '' },


  // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
  { key: 'koof_regelwerk', label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Koof', category_ultra_filter: '' },
  { key: 'koof_beplating', label: 'Beplating', categoryFilter: 'Constructieplaten', category: 'Koof', category_ultra_filter: '' },
  { key: 'koof_isolatie', label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', category_ultra_filter: '' }, // Often needed for drain pipes


  { key: 'kabelkanaal', label: 'Elektra Buizen / Flex', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  // The blue boxes that clamp into the hollow wall (ESSENTIAL)
  { key: 'hollewanddozen', label: 'Hollewanddozen', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  // The actual wire to bring power from the nearest point
  { key: 'elektrakabel', label: 'Installatiekabel', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  // The visible finish: Sockets for TV/Haard and Switches for LEDs
  { key: 'schakelmateriaal_basis', label: 'Stopcontacten & Schakelaars', categoryFilter: 'Overig', category: 'Schakelmateriaal', category_ultra_filter: '' },

  // 5. NADEN & STUCWERK
  { key: 'hoekafwerking', label: 'Hoekprofielen', categoryFilter: 'Overig', category: 'gips_afwerking', category_ultra_filter: '' },
  { key: 'gips_wapening', label: 'Wapeningsband', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },
  { key: 'gips_vuller', label: 'Voegenmiddel', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },
  { key: 'gips_finish', label: 'Finish Pasta', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },

  // 6. KOZIJNEN
  { key: 'kozijn_element', label: 'Raamkozijnen', categoryFilter: 'Binnenkozijnen', category: 'Kozijnen', category_ultra_filter: '' },
  { key: 'glas_roosters', label: 'Glas & Roosters', categoryFilter: 'Overig', category: 'Kozijnen', category_ultra_filter: '' },

  // 7. DEUREN & BESLAG
  { key: 'deur_blad', label: 'Binnendeuren', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },
  { key: 'deur_scharnieren', label: 'Scharnieren', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },
  { key: 'deur_sloten', label: 'Sloten', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },
  { key: 'deur_krukken', label: 'Deurbeslag', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },
  { key: 'deur_rooster', label: 'Deurroosters', categoryFilter: 'Overig', category: 'Deuren', category_ultra_filter: '' },
];



const HSB_BUITENWAND_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE
  // Main structural skeleton
  { key: 'regelwerk_hoofd', label: 'Staanders & Liggers', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },
  // Service cavity (leidingspouw) - distinct from main frame
  { key: 'regelwerk_inst', label: 'Regelwerk (Leidingspouw)', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },
  // Exterior ventilation strips
  { key: 'regelwerk_vent', label: 'Ventilatielatten', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },

  // 2. ISOLATIE & FOLIES
  { key: 'folie_buiten', label: 'Folie Buiten', categoryFilter: 'Isolatie', category: 'isolatie', category_ultra_filter: '' },
  { key: 'folie_binnen', label: 'Folie Binnen', categoryFilter: 'Isolatie', category: 'isolatie', category_ultra_filter: '' },
  { key: 'isolatie_hoofd', label: 'Isolatiemateriaal (Constructie)', categoryFilter: 'Isolatie', category: 'isolatie', category_ultra_filter: '' },
  { key: 'isolatie_inst', label: 'Isolatiemateriaal (Leidingspouw)', categoryFilter: 'Isolatie', category: 'isolatie', category_ultra_filter: '' },

  // 3. BEPLATING (BINNEN & BUITEN)
  { key: 'gevelbekleding', label: 'Gevelbekleding', categoryFilter: 'Houten Gevelbekleding', category: 'beplating', category_ultra_filter: '' },
  { key: 'plaat_buiten', label: 'Constructieplaat (Buiten)', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },
  { key: 'osb_binnen', label: 'Constructieplaat (Binnen)', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },
  { key: 'gips_binnen', label: 'Afwerkplaat', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },

  // 4. AFWERKEN (TIMMERWERK - BINNEN)
  { key: 'dagkant_binnen', label: 'Dagkanten (Binnen)', categoryFilter: 'Constructieplaten', category: 'afwerking_binnen', category_ultra_filter: '' },
  { key: 'vensterbank', label: 'Vensterbanken', categoryFilter: 'Vensterbanken', category: 'afwerking_binnen', category_ultra_filter: '' },
  { key: 'plinten', label: 'Vloerplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking_binnen', category_ultra_filter: '' },

  // 5. AFWERKEN (BUITEN)
  { key: 'waterslag', label: 'Waterslagen', categoryFilter: 'Metalstud Profielen', category: 'afwerking_buiten', category_ultra_filter: '' },
  { key: 'dagkant_buiten', label: 'Dagkanten (Buiten)', categoryFilter: 'Houten Gevelbekleding', category: 'afwerking_buiten', category_ultra_filter: '' },
  { key: 'hoek_buiten', label: 'Gevelhoeken', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'afwerking_buiten', category_ultra_filter: '' },

  // 6. AFWERKEN (GIPS & WAND)
  // Standard interior finish like the other walls
  { key: 'hoekafwerking', label: 'Hoekprofielen', categoryFilter: 'Overig', category: 'gips_afwerking', category_ultra_filter: '' },
  { key: 'gips_vuller', label: 'Voegenmiddel', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },
  { key: 'gips_finish', label: 'Finish Pasta', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },

  // 7. KOZIJNEN
  { key: 'stelkozijn', label: 'Stelkozijnen', categoryFilter: 'Constructieplaten', category: 'Kozijnen', category_ultra_filter: '' },
  { key: 'kozijn_element', label: 'Raamkozijnen', categoryFilter: 'Binnenkozijnen', category: 'Kozijnen', category_ultra_filter: '' },
  { key: 'deur_kozijn', label: 'Deurkozijnen', categoryFilter: 'Binnenkozijnen', category: 'Kozijnen', category_ultra_filter: '' },
  { key: 'glas_roosters', label: 'Glas & Roosters', categoryFilter: 'Overig', category: 'Kozijnen', category_ultra_filter: '' },

  // 8. DEUREN & BESLAG
  { key: 'deur_blad', label: 'Buitendeuren', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },
  { key: 'deur_scharnieren', label: 'Scharnieren', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },
  { key: 'deur_sloten', label: 'Sloten', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },
  { key: 'deur_krukken', label: 'Deurbeslag', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },
];



const CINEWALL_TV_WAND_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE (FRAMEWERK)
  { key: 'staanders_en_liggers', label: 'Staanders & Liggers', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },
  { key: 'regelwerk_nissen', label: 'Regelwerk (Nissen & Details)', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },
  { key: 'achterhout', label: 'Achterhout (TV-ophanging)', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },

  // 2. INSTALLATIE & ELEKTRA (Expanded)
  // The tunnel for HDMI cables
  { key: 'kabelkanaal', label: 'Elektra Buizen / Flex', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  // The blue boxes that clamp into the hollow wall (ESSENTIAL)
  { key: 'hollewanddozen', label: 'Hollewanddozen', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  // The actual wire to bring power from the nearest point
  { key: 'elektrakabel', label: 'Installatiekabel', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  // The visible finish: Sockets for TV/Haard and Switches for LEDs
  { key: 'schakelmateriaal_basis', label: 'Stopcontacten & Schakelaars', categoryFilter: 'Overig', category: 'Schakelmateriaal', category_ultra_filter: '' },

  // 3. ISOLATIE & FOLIES
  { key: 'folie_buiten', label: 'Folies', categoryFilter: 'Overig', category: 'isolatie', category_ultra_filter: '' },
  { key: 'isolatie_basis', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', category_ultra_filter: '' },

  // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
  { key: 'koof_regelwerk', label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Koof', category_ultra_filter: '' },
  { key: 'koof_beplating', label: 'Beplating', categoryFilter: 'Constructieplaten', category: 'Koof', category_ultra_filter: '' },
  { key: 'koof_isolatie', label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', category_ultra_filter: '' }, // Often needed for drain pipes


  // 4. BEPLATING
  { key: 'constructieplaat', label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },
  { key: 'beplating', label: 'Afwerkplaat', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },
  { key: 'akoestische_panelen', label: 'Akoestische Panelen', categoryFilter: 'Wanddecoratie', category: 'beplating', category_ultra_filter: '' },

  // 5. AFWERKEN (TIMMERWERK)
  { key: 'dagkanten', label: 'Dagkanten', categoryFilter: 'Constructieplaten', category: 'afwerking', category_ultra_filter: '' },
  { key: 'plinten_vloer', label: 'Vloerplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', category_ultra_filter: '' },
  { key: 'plinten_plafond', label: 'Plafondplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', category_ultra_filter: '' },

  // 6. NADEN & STUCWERK
  { key: 'hoekafwerking', label: 'Hoekprofielen', categoryFilter: 'Overig', category: 'gips_afwerking', category_ultra_filter: '' },
  { key: 'gips_vuller', label: 'Voegenmiddel', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },
  { key: 'gips_finish', label: 'Finish Pasta', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },

  // 7. CINEWALL ELEMENTEN (The "Fancy Stuff")
  { key: 'sfeerhaard', label: 'Inbouw Sfeerhaard', categoryFilter: 'Overig', category: 'Cinewall', category_ultra_filter: '' },
  { key: 'tv_beugel', label: 'TV-Beugel', categoryFilter: 'Overig', category: 'Cinewall', category_ultra_filter: '' },
  { key: 'led_strips', label: 'LED-Verlichting', categoryFilter: 'Overig', category: 'Cinewall', category_ultra_filter: '' },
];



const KNIESCHOTTEN_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE
  { key: 'staanders_en_liggers', label: 'Staanders & Liggers', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },

  // 2. ISOLATIE & FOLIES
  // Consistent labels with HSB Tussenwand
  { key: 'folie_buiten', label: 'Folies', categoryFilter: 'Overig', category: 'isolatie', category_ultra_filter: '' },
  { key: 'isolatie_basis', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', category_ultra_filter: '' },

  // 3. BEPLATING
  // For the fixed parts of the knee wall
  { key: 'constructieplaat', label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },
  { key: 'beplating', label: 'Afwerkplaat', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },

  // 4. AFWERKEN (TIMMERWERK)
  { key: 'plinten_vloer', label: 'Vloerplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', category_ultra_filter: '' },
  // SPECIFIC: The finishing strip against the slanted roof
  { key: 'afwerklatten', label: 'Plafondplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', category_ultra_filter: '' },

  // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
  { key: 'koof_regelwerk', label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Koof', category_ultra_filter: '' },
  { key: 'koof_beplating', label: 'Beplating', categoryFilter: 'Constructieplaten', category: 'Koof', category_ultra_filter: '' },
  { key: 'koof_isolatie', label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', category_ultra_filter: '' }, // Often needed for drain pipes

  { key: 'kabelkanaal', label: 'Elektra Buizen / Flex', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  // The blue boxes that clamp into the hollow wall (ESSENTIAL)
  { key: 'hollewanddozen', label: 'Hollewanddozen', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  // The actual wire to bring power from the nearest point
  { key: 'elektrakabel', label: 'Installatiekabel', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  // The visible finish: Sockets for TV/Haard and Switches for LEDs
  { key: 'schakelmateriaal_basis', label: 'Stopcontacten & Schakelaars', categoryFilter: 'Overig', category: 'Schakelmateriaal', category_ultra_filter: '' },

  // 5. AFWERKEN (GIPS & WAND)
  // Included for consistency if the user builds a fixed gypsum knee wall
  { key: 'hoekafwerking', label: 'Hoekprofielen', categoryFilter: 'Overig', category: 'gips_afwerking', category_ultra_filter: '' },
  { key: 'gips_vuller', label: 'Voegenmiddel', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },
  { key: 'gips_finish', label: 'Finish Pasta', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },

  // 6. SCHUIFWANDEN (Replaces Standard Doors)
  // These keys fit into your existing 'Deuren' category
  { key: 'schuifdeur_rails', label: 'Schuifdeurrails', categoryFilter: 'Binnendeuren & Beslag', category: 'Schuifdeuren', category_ultra_filter: '' },
  { key: 'schuifdeur_paneel', label: 'Schuifdeurpanelen', categoryFilter: 'Constructieplaten', category: 'Schuifdeuren', category_ultra_filter: '' },
  { key: 'schuifdeur_greep', label: 'Komgrepen', categoryFilter: 'Binnendeuren & Beslag', category: 'Schuifdeuren', category_ultra_filter: '' },
];



const OVERIG_WANDEN_MATS: MaterialSection[] = [
  { key: 'constructie', label: 'Constructiemateriaal', categoryFilter: 'Constructiehout', category_ultra_filter: '' },
  { key: 'isolatie', label: 'Isolatie', categoryFilter: 'Isolatie', category_ultra_filter: '' },
  { key: 'beplating', label: 'Beplating', categoryFilter: 'Constructieplaten', category_ultra_filter: '' },
  { key: 'beschermlagen', label: 'Beschermlagen', categoryFilter: 'Overig', category_ultra_filter: '' },
  { key: 'bevestiging', label: 'Bevestigingsmateriaal', categoryFilter: 'Overig', category_ultra_filter: '' },
  { key: 'afwerking', label: 'Afwerkingsmateriaal', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category_ultra_filter: '' },
];

// #endregion

//#region ========================================== MATERIAL SECTIONS - PLAFONDS XXX==========================================

const PLAFOND_HOUT_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE (FRAMEWERK)
  { key: 'randhout', label: 'Randhout', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },
  { key: 'stroken', label: 'Stelhout', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },
  { key: 'rachels', label: 'Rachelwerk', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },

  // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
  { key: 'koof_regelwerk', label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Koof', category_ultra_filter: '' },
  { key: 'koof_beplating', label: 'Beplating', categoryFilter: 'Constructieplaten', category: 'Koof', category_ultra_filter: '' },
  { key: 'koof_isolatie', label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', category_ultra_filter: '' }, // Often needed for drain pipes

  // 3. GORDIJNKOF (Specifiek voor gordijnen)
  { key: 'gordijn_regelwerk', label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Gordijnkoof', category_ultra_filter: '' },
  { key: 'gordijn_beplating', label: 'Beplating', categoryFilter: 'Constructieplaten', category: 'Gordijnkoof', category_ultra_filter: '' },
  { key: 'gordijn_achterhout', label: 'Achterhout', categoryFilter: 'Constructiehout', category: 'Gordijnkoof', category_ultra_filter: '' }, // Crucial for heavy curtains

  // 4. ELEKTRA (RUWBOUW)
  { key: 'kabelkanaal', label: 'Elektra Buizen / Flex', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  { key: 'centraaldoos', label: 'Centraaldozen', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  { key: 'elektrakabel', label: 'Installatiekabel', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },

  // 5. VERLICHTING & SCHAKELMATERIAAL (COUNTERS)
  { key: 'inbouwspots', label: 'Inbouwspots', categoryFilter: 'Overig', category: 'Schakelmateriaal', category_ultra_filter: '' },
  { key: 'schakelaar_element', label: 'Schakelaar / Dimmer', categoryFilter: 'Overig', category: 'Schakelmateriaal', category_ultra_filter: '' },

  // 6. ISOLATIE & FOLIES
  { key: 'folie_buiten', label: 'Folies', categoryFilter: 'Overig', category: 'isolatie', category_ultra_filter: '' },
  { key: 'isolatie_basis', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', category_ultra_filter: '' },

  // 7. BEPLATING
  { key: 'constructieplaat', label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },
  { key: 'beplating', label: 'Afwerkplaat', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },

  // 8. AFWERKEN (TIMMERWERK)
  { key: 'plinten_plafond', label: 'Plafondplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', category_ultra_filter: '' },

  // 14. VLIZOTRAP
  { key: 'vlizotrap_unit', label: 'Luik / Vlizotrap', categoryFilter: 'Trappen & Zolderluiken', category: 'Toegang', category_ultra_filter: '' },
  { key: 'luik_afwerking', label: 'Koplatten', categoryFilter: 'Aftimmerhout & Plinten', category: 'Toegang', category_ultra_filter: '' },

  // 9. NADEN & STUCWERK
  { key: 'gips_vuller', label: 'Voegenmiddel', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },
  { key: 'gips_finish', label: 'Finish Pasta', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },
  { key: 'gips_wapening', label: 'Wapeningsband', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },
];



const PLAFOND_METALSTUD_MATS: MaterialSection[] = [
  // 1. METAAL & CONSTRUCTIE (FRAMEWERK)
  { key: 'randprofielen', label: 'Randprofielen', categoryFilter: 'Metalstud Profielen', category: 'metaal', category_ultra_filter: '' },
  { key: 'draagprofielen', label: 'Draagprofielen', categoryFilter: 'Metalstud Profielen', category: 'metaal', category_ultra_filter: '' },

  // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
  { key: 'koof_regelwerk', label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Koof', category_ultra_filter: '' },
  { key: 'koof_beplating', label: 'Beplating', categoryFilter: 'Constructieplaten', category: 'Koof', category_ultra_filter: '' },
  { key: 'koof_isolatie', label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', category_ultra_filter: '' },

  // 3. GORDIJNKOOF (Specifiek voor gordijnen)
  { key: 'gordijn_regelwerk', label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Gordijnkoof', category_ultra_filter: '' },
  { key: 'gordijn_beplating', label: 'Beplating', categoryFilter: 'Constructieplaten', category: 'Gordijnkoof', category_ultra_filter: '' },
  { key: 'gordijn_achterhout', label: 'Achterhout', categoryFilter: 'Constructiehout', category: 'Gordijnkoof', category_ultra_filter: '' },

  // 4. ELEKTRA (RUWBOUW)
  { key: 'kabelkanaal', label: 'Elektra Buizen / Flex', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  { key: 'centraaldoos', label: 'Centraaldozen', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  { key: 'elektrakabel', label: 'Installatiekabel', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },

  // 5. VERLICHTING & SCHAKELMATERIAAL (COUNTERS)
  { key: 'inbouwspots', label: 'Inbouwspots', categoryFilter: 'Overig', category: 'Schakelmateriaal', category_ultra_filter: '' },
  { key: 'schakelaar_element', label: 'Schakelaar / Dimmer', categoryFilter: 'Overig', category: 'Schakelmateriaal', category_ultra_filter: '' },

  // 6. ISOLATIE & FOLIES
  { key: 'folie_buiten', label: 'Folies', categoryFilter: 'Overig', category: 'isolatie', category_ultra_filter: '' },
  { key: 'isolatie_basis', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', category_ultra_filter: '' },

  // 7. BEPLATING
  { key: 'constructieplaat', label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },
  { key: 'beplating', label: 'Afwerkplaat', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },

  // 8. AFWERKEN (TIMMERWERK)
  { key: 'plinten_plafond', label: 'Plafondplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', category_ultra_filter: '' },

  // 14. VLIZOTRAP
  { key: 'vlizotrap_unit', label: 'Luik / Vlizotrap', categoryFilter: 'Trappen & Zolderluiken', category: 'Toegang', category_ultra_filter: '' },
  { key: 'luik_afwerking', label: 'Koplatten', categoryFilter: 'Aftimmerhout & Plinten', category: 'Toegang', category_ultra_filter: '' },

  // 9. NADEN & STUCWERK
  { key: 'gips_vuller', label: 'Voegenmiddel', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },
  { key: 'gips_finish', label: 'Finish Pasta', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },
  { key: 'gips_wapening', label: 'Wapeningsband', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - VLOEREN XXX==========================================

const MASSIEF_HOUTEN_VLOER_FINISH_MATS: MaterialSection[] = [
  // 1. VOORBEREIDING & ONDERVLOER
  { key: 'primer', label: 'Primer', categoryFilter: 'Egaline & Vloerafwerking', category: 'Vloer_Voorbereiding', category_ultra_filter: '' },
  { key: 'ondervloer', label: 'Ondervloer', categoryFilter: 'Constructieplaten', category: 'Vloer_Voorbereiding', category_ultra_filter: '' },
  { key: 'egaline', label: 'Egaline', categoryFilter: 'Stenen, Lateien & Mortels', category: 'Vloer_Voorbereiding', category_ultra_filter: '' },

  // 2. VLOERDELEN & PLAATSING
  { key: 'vloerdelen', label: 'Houten vloerplanken', categoryFilter: 'Plaatmateriaal Interieur', category: 'Vloer_Hout', category_ultra_filter: '' },
  { key: 'parketlijm', label: 'Parketlijm', categoryFilter: 'Egaline & Vloerafwerking', category: 'Vloer_Hout', category_ultra_filter: '' },

  // 3. AFWERKING & BEHANDELING
  { key: 'plinten', label: 'Plinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'Vloer_Afwerking', category_ultra_filter: '' },
  { key: 'deklatten', label: 'Deklatten', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'Vloer_Afwerking', category_ultra_filter: '' },
  { key: 'dorpels', label: 'Overgangsprofielen / Dorpels', categoryFilter: 'Metalstud Profielen', category: 'Vloer_Afwerking', category_ultra_filter: '' },
  { key: 'vloerolie', label: 'Vloerolie', categoryFilter: 'Overig', category: 'Vloer_Afwerking', category_ultra_filter: '' },
];


const VLOER_AFWERK_MATS: MaterialSection[] = [
  // 1. VOORBEREIDING
  { key: 'egaliseren', label: 'Egaline', categoryFilter: 'Egaline & Vloerafwerking', category: 'Vloer_Voorbereiding', category_ultra_filter: '' },
  { key: 'egaliseren', label: 'Reparatiemortel', categoryFilter: 'Egaline & Vloerafwerking', category: 'Vloer_Voorbereiding', category_ultra_filter: '' },
  { key: 'folie', label: 'Dampremmende Folie', categoryFilter: 'Isolatie', category: 'Vloer_Voorbereiding', category_ultra_filter: '' },
  { key: 'ondervloer', label: 'Ondervloer', categoryFilter: 'Egaline & Vloerafwerking', category: 'Vloer_Voorbereiding', category_ultra_filter: '' },

  // 2. VLOERDELEN (LAMINAAT / PVC)
  { key: 'vloerdelen', label: 'Laminaat / PVC Panelen', categoryFilter: 'Egaline & Vloerafwerking', category: 'Vloer_Laminaat', category_ultra_filter: '' },

  // 3. AFWERKING & PROFIELEN
  { key: 'plinten_muur', label: 'Vloerplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'Vloer_Afwerking', category_ultra_filter: '' },

  // Split profiles for accurate ordering
  { key: 'profielen_overgang', label: 'Overgangsprofielen / Drempels', categoryFilter: 'Metalstud Profielen', category: 'Vloer_Afwerking', category_ultra_filter: '' },
  { key: 'profielen_eind', label: 'Eindprofielen', categoryFilter: 'Metalstud Profielen', category: 'Vloer_Afwerking', category_ultra_filter: '' },
  { key: 'kruipluik', label: 'Kruipluik Profiel / Matomranding', categoryFilter: 'Metalstud Profielen', category: 'Vloer_Afwerking', category_ultra_filter: '' },
];


const VLONDER_MATS: MaterialSection[] = [
  // 1. GRONDWERK & FUNDERING
  { key: 'worteldoek', label: 'Worteldoek', categoryFilter: 'Isolatie', category: 'Vlonder_Fundering', category_ultra_filter: '' },
  { key: 'stabilisatie', label: 'Ophoogzand / Stabilisatie', categoryFilter: 'Fundering & Bekisting', category: 'Vlonder_Fundering', category_ultra_filter: '' },
  { key: 'piketten', label: 'Piketten / Palen', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'Vlonder_Fundering', category_ultra_filter: '' },
  { key: 'dragers', label: 'Tegels / Stelpoten', categoryFilter: 'Fundering & Bekisting', category: 'Vlonder_Fundering', category_ultra_filter: '' }, // Tiles or plastic adjustable feet

  // 2. CONSTRUCTIE (ONDERBOUW)
  { key: 'moerbalken', label: 'Moerbalken', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'Vlonder_Constructie', category_ultra_filter: '' }, // Main heavy beams
  { key: 'onderregels', label: 'Onderregels', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'Vlonder_Constructie', category_ultra_filter: '' }, // Cross joists

  // 3. VLONDER & AFWERKING
  { key: 'vlonderplanken', label: 'Vlonderplanken', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'Vlonder_Dek', category_ultra_filter: '' },
  { key: 'bevestiging', label: 'Vlonderschroeven / Clips', categoryFilter: 'Overig', category: 'Vlonder_Dek', category_ultra_filter: '' },
  { key: 'kantplanken', label: 'Kantplanken', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'Vlonder_Dek', category_ultra_filter: '' },
  { key: 'afwatering', label: 'Drainagegoot', categoryFilter: 'Overig', category: 'Vlonder_Dek', category_ultra_filter: '' },
];

const BALKLAAG_CONSTRUCTIEVLOER_MATS: MaterialSection[] = [
  // 1. BALKLAAG (CONSTRUCTIE)
  { key: 'muurplaat', label: 'Muurplaat', categoryFilter: 'Constructiehout', category: 'Constructievloer', category_ultra_filter: '' },
  { key: 'vloerbalken', label: 'Randbalken', categoryFilter: 'Constructiehout', category: 'Constructievloer', category_ultra_filter: '' },
  { key: 'vloerbalken', label: 'Vloerbalken', categoryFilter: 'Constructiehout', category: 'Constructievloer', category_ultra_filter: '' },
  { key: 'balkdragers', label: 'Balkdragers', categoryFilter: 'Overig', category: 'Constructievloer', category_ultra_filter: '' },

  // 2. ISOLATIE & GELUID
  { key: 'isolatie', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', category_ultra_filter: '' },
  { key: 'geluidsstroken', label: 'Geluidsisolatie Stroken', categoryFilter: 'Isolatie', category: 'isolatie', category_ultra_filter: '' }, // Felt/Rubber strips on top of beams

  // 3. BEPLATING (DEK)
  { key: 'beplating', label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' }, // OSB / Underlayment
];



const VLIERING_MATS: MaterialSection[] = [
  // ==========================================
  // DEEL 1: DE VLOER (BOVENKANT / CONSTRUCTIE)
  // ==========================================
  { key: 'randbalken', label: 'Randbalken', categoryFilter: 'Constructiehout', category: 'Constructievloer', category_ultra_filter: '' },
  { key: 'vloerbalken', label: 'Vloerbalken', categoryFilter: 'Constructiehout', category: 'Constructievloer', category_ultra_filter: '' },
  { key: 'balkdragers', label: 'Balkdragers', categoryFilter: 'Overig', category: 'Constructievloer', category_ultra_filter: '' },

  { key: 'beplating', label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },
  // ==========================================
  // DEEL 2: TOEGANG (TUSSENIN)
  // ==========================================
  { key: 'vlizotrap_unit', label: 'Luik / Vlizotrap', categoryFilter: 'Trappen & Zolderluiken', category: 'Toegang', category_ultra_filter: '' },
  { key: 'luik_afwerking', label: 'Koplatten', categoryFilter: 'Aftimmerhout & Plinten', category: 'Toegang', category_ultra_filter: '' },

  // ==========================================
  // DEEL 3: HET PLAFOND (ONDERKANT)
  // ==========================================

  // --- A. FRAMEWERK (Hout of Metaal) ---
  { key: 'randhout', label: 'Randhout', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },
  { key: 'stroken', label: 'Stelhout', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },
  { key: 'rachels', label: 'Rachelwerk', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },

  { key: 'randprofielen', label: 'Randprofielen', categoryFilter: 'Metalstud Profielen', category: 'metaal', category_ultra_filter: '' },
  { key: 'draagprofielen', label: 'Draagprofielen', categoryFilter: 'Metalstud Profielen', category: 'metaal', category_ultra_filter: '' },

  // --- B. SPECIALS (Koven) ---
  { key: 'koof_regelwerk', label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Koof', category_ultra_filter: '' },
  { key: 'koof_beplating', label: 'Beplating', categoryFilter: 'Constructieplaten', category: 'Koof', category_ultra_filter: '' },
  { key: 'koof_isolatie', label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', category_ultra_filter: '' },

  { key: 'gordijn_regelwerk', label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Gordijnkoof', category_ultra_filter: '' },
  { key: 'gordijn_beplating', label: 'Beplating', categoryFilter: 'Constructieplaten', category: 'Gordijnkoof', category_ultra_filter: '' },
  { key: 'gordijn_achterhout', label: 'Achterhout', categoryFilter: 'Constructiehout', category: 'Gordijnkoof', category_ultra_filter: '' },

  // --- C. INSTALLATIE ---
  { key: 'kabelkanaal', label: 'Elektra Buizen / Flex', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  { key: 'centraaldoos', label: 'Centraaldozen', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  { key: 'elektrakabel', label: 'Installatiekabel', categoryFilter: 'Overig', category: 'Installatie', category_ultra_filter: '' },
  { key: 'inbouwspots', label: 'Inbouwspots', categoryFilter: 'Overig', category: 'Schakelmateriaal', category_ultra_filter: '' },
  { key: 'schakelaar_element', label: 'Schakelaar / Dimmer', categoryFilter: 'Overig', category: 'Schakelmateriaal', category_ultra_filter: '' },

  // --- D. ISOLATIE ---
  { key: 'folie_buiten', label: 'Folies', categoryFilter: 'Overig', category: 'isolatie', category_ultra_filter: '' },
  { key: 'isolatie_basis', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', category_ultra_filter: '' },

  // --- E. BEPLATING (Plafond) ---
  { key: 'beplating', label: 'Afwerkplaat', categoryFilter: 'Constructieplaten', category: 'beplating_afwerking', category_ultra_filter: '' },

  // --- F. AFWERKING ---
  { key: 'plinten_plafond', label: 'Plafondplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', category_ultra_filter: '' },
  { key: 'gips_vuller', label: 'Voegenmiddel', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },
  { key: 'gips_finish', label: 'Finish Pasta', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - KEUKENS ==========================================

const KEUKEN_MATS: MaterialSection[] = [

];

// #endregion

//#region ========================================== MATERIAL SECTIONS - INTERIEUR & AFWERKINGEN ==========================================

const INTERIEUR_MATS: MaterialSection[] = [
  { key: 'constructie', label: 'Basismateriaal / Corpus', categoryFilter: 'Constructieplaten', category_ultra_filter: '' },
  { key: 'fronten', label: 'Fronten & Zichtwerk', categoryFilter: 'Constructieplaten', category_ultra_filter: '' },
  { key: 'beslag', label: 'Scharnieren & Ladegeleiders', categoryFilter: 'Binnendeuren & Beslag', category_ultra_filter: '' },
  { key: 'inrichting', label: 'Interieurinrichting (roedes/planken)', categoryFilter: 'Overig', category_ultra_filter: '' },
  { key: 'afwerking', label: 'Afwerking & Lakwerk', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category_ultra_filter: '' },
];
// #endregion

//#region ========================================== MATERIAL SECTIONS - AFWERKINGEN ==========================================


const DAGKANT_MATS: MaterialSection[] = [
  { key: 'frame', label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },
  { key: 'dagkant', label: 'Afwerk Hout', categoryFilter: 'Constructieplaten', category: 'afwerking', category_ultra_filter: '' },
  { key: 'hoekprofiel', label: 'Hoek- of Stopcontactprofielen', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'afwerking', category_ultra_filter: '' },
];

const PLINTEN_MATS: MaterialSection[] = [
  { key: 'plinten', label: 'Plafondplinten', categoryFilter: 'Constructiehout', category: 'afwerking', category_ultra_filter: '' },
  { key: 'latten', label: 'Koplatten', categoryFilter: 'Constructiehout', category: 'afwerking', category_ultra_filter: '' },
  { key: 'latten', label: 'Vloerplinten', categoryFilter: 'Constructiehout', category: 'afwerking', category_ultra_filter: '' },
];

const OMKASTING_KOVEN_MATS: MaterialSection[] = [
  { key: 'frame', label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },
  { key: 'beplating', label: 'Afwerk Hout', categoryFilter: 'Constructieplaten', category: 'afwerking', category_ultra_filter: '' },
];

const VENSTERBANK_MATS: MaterialSection[] = [
  { key: 'frame', label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },
  { key: 'vensterbank', label: 'Vensterbank', categoryFilter: 'Constructiehout', category: 'afwerking', category_ultra_filter: '' },
  { key: 'roosters', label: 'Ventilatieroosters', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'afwerking', category_ultra_filter: '' },
  { key: 'behandeling', label: 'Olie, Lak of Beits', categoryFilter: 'Overig', category: 'afwerking', category_ultra_filter: '' },
];

// #endregion

//#region ========================================== MATERIAL SECTIONS - DEUREN XXX==========================================

const DEUR_BINNEN_MATS: MaterialSection[] = [
  // Deurblad
  { key: 'deurblad', label: 'Binnendeuren', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },

  // Beslag & sloten
  { key: 'scharnieren', label: 'Scharnieren / Paumelles', categoryFilter: 'Binnendeuren & Beslag', category: 'deurbeslag', category_ultra_filter: '' },
  { key: 'slotmechanisme', label: 'Sloten', categoryFilter: 'Binnendeuren & Beslag', category: 'deurbeslag', category_ultra_filter: '' },
  { key: 'deurbeslag_kruk', label: 'Deurbeslag (Schild & Kruk)', categoryFilter: 'Binnendeuren & Beslag', category: 'deurbeslag', category_ultra_filter: '' },
  { key: 'cilinder', label: 'Cilinder', categoryFilter: 'Binnendeuren & Beslag', category: 'deurbeslag', category_ultra_filter: '' },


  // Glas
  { key: 'glas', label: 'Glas', categoryFilter: 'Binnenkozijnen', category: 'glas', category_ultra_filter: '' },
  { key: 'glaslatten', label: 'Glaslatten', categoryFilter: 'Binnenkozijnen', category: 'glas', category_ultra_filter: '' },

  { key: 'valdorp', label: 'Tochtvaldorp', categoryFilter: 'Binnendeuren & Beslag', category: 'tochtstrips', category_ultra_filter: '' },
  { key: 'tochtstrips', label: 'Tochtstrips', categoryFilter: 'Binnendeuren & Beslag', category: 'tochtstrips', category_ultra_filter: '' },

  // Ventilatie
  { key: 'ventilatierooster', label: 'Deurroosters', categoryFilter: 'Overig', category: 'ventilatie', category_ultra_filter: '' },
];



const DEUR_BUITEN_MATS: MaterialSection[] = [
  // Deurblad
  { key: 'deurblad', label: 'Buitendeur', categoryFilter: 'Binnendeuren & Beslag', category: 'Deuren', category_ultra_filter: '' },

  // Beslag & sloten
  { key: 'scharnieren', label: 'Scharnieren', categoryFilter: 'Binnendeuren & Beslag', category: 'deurbeslag', category_ultra_filter: '' },
  { key: 'slotmechanisme', label: 'Sloten', categoryFilter: 'Binnendeuren & Beslag', category: 'deurbeslag', category_ultra_filter: '' },
  { key: 'meerpuntsluiting', label: 'Meerpuntsluiting', categoryFilter: 'Binnendeuren & Beslag', category: 'deurbeslag', category_ultra_filter: '' },
  { key: 'deurbeslag_kruk', label: 'Deurbeslag (Schild & Kruk)', categoryFilter: 'Binnendeuren & Beslag', category: 'deurbeslag', category_ultra_filter: '' },
  { key: 'cilinder', label: 'Cilinder', categoryFilter: 'Binnendeuren & Beslag', category: 'deurbeslag', category_ultra_filter: '' },


  // Glas
  { key: 'glas', label: 'Glas', categoryFilter: 'Binnenkozijnen', category: 'glas', category_ultra_filter: '' },
  { key: 'glaslatten', label: 'Glaslatten', categoryFilter: 'Binnenkozijnen', category: 'glas', category_ultra_filter: '' },

  // Tochtwering
  { key: 'valdorp', label: 'Tochtvaldorp', categoryFilter: 'Binnendeuren & Beslag', category: 'tochtstrips', category_ultra_filter: '' },
  { key: 'tochtstrips', label: 'Tochtstrips', categoryFilter: 'Binnendeuren & Beslag', category: 'tochtstrips', category_ultra_filter: '' },

  // Ventilatie
  { key: 'ventilatierooster', label: 'Deurroosters', categoryFilter: 'Overig', category: 'ventilatie', category_ultra_filter: '' },
];

// #endregion

//#region ========================================== MATERIAL SECTIONS - DAKRENOVATIE ==========================================

const DAK_HELLEND_MATS: MaterialSection[] = [
  // 1. ONDERGROND & ISOLATIE
  { key: 'constructieplaat', label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },
  { key: 'isolatie_dak', label: 'Dakisolatie', categoryFilter: 'Isolatie', category: 'isolatie', category_ultra_filter: '' },
  { key: 'folie_buiten', label: 'Folie', categoryFilter: 'Isolatie', category: 'isolatie', category_ultra_filter: '' },

  // 2. HOUTWERK (Tengels & Panlatten)
  { key: 'tengels', label: 'Tengels', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },
  { key: 'panlatten', label: 'Panlatten', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },
  { key: 'ruiter', label: 'Ruiter (Nokbalk)', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' }, // <--- ADD THIS LINE

  // 3. DAKVOET & PANNEN (Category: 'dak')
  { key: 'dakvoetprofiel', label: 'Dakvoetprofiel / Vogelschroot', categoryFilter: 'Dakwerk & HWA', category: 'dak', category_ultra_filter: '' },
  { key: 'dakpannen', label: 'Dakpannen', categoryFilter: 'Dakwerk & HWA', category: 'dak', category_ultra_filter: '' },
  { key: 'gevelpannen', label: 'Gevelpannen / Kantpannen', categoryFilter: 'Dakwerk & HWA', category: 'dak', category_ultra_filter: '' },
  { key: 'ondervorst', label: 'Ondervorst', categoryFilter: 'Dakwerk & HWA', category: 'dak', category_ultra_filter: '' },
  { key: 'nokvorsten', label: 'Nokvorsten', categoryFilter: 'Dakwerk & HWA', category: 'dak', category_ultra_filter: '' },

  // 4. AFWERKING (Category: 'afwerking_dak') <--- CHANGED THIS
  { key: 'lood', label: 'Lood', categoryFilter: 'Dakwerk & HWA', category: 'afwerking_dak', category_ultra_filter: '' },
  { key: 'dakgoot', label: 'Dakgoot', categoryFilter: 'Dakwerk & HWA', category: 'afwerking_dak', category_ultra_filter: '' },
];

const DAK_EPDM_MATS: MaterialSection[] = [
  // 1. ONDERGROND & ISOLATIE (Opbouw Warm Dak)
  // Standard 'constructieplaat' key (OSB/Underlayment)
  { key: 'constructieplaat', label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', category_ultra_filter: '' },
  // Standard 'folie_binnen' key (Dampremmende folie goes UNDER the insulation)
  { key: 'folie_binnen', label: 'Dampremmende Folie', categoryFilter: 'Isolatie', category: 'isolatie', category_ultra_filter: '' },
  // Standard 'isolatie_dak' key (PIR Plates)
  { key: 'isolatie_dak', label: 'Dakisolatie', categoryFilter: 'Isolatie', category: 'isolatie', category_ultra_filter: '' },

  // 2. DAKBEDEKKING (EPDM)
  { key: 'epdm_folie', label: 'EPDM', categoryFilter: 'Dakwerk & HWA', category: 'dak', category_ultra_filter: '' },

  // 3. AFWERKING & DETAILS
  { key: 'daktrim', label: 'Daktrim', categoryFilter: 'Dakwerk & HWA', category: 'afwerking_dak', category_ultra_filter: '' },
  { key: 'daktrim_hoeken', label: 'Daktrim Hoeken', categoryFilter: 'Dakwerk & HWA', category: 'afwerking_dak', category_ultra_filter: '' },
  { key: 'hwa_uitloop', label: 'HWA Stadsuitloop / Onderuitloop', categoryFilter: 'Dakwerk & HWA', category: 'afwerking_dak', category_ultra_filter: '' },
  { key: 'lood', label: 'Lood', categoryFilter: 'Dakwerk & HWA', category: 'afwerking_dak', category_ultra_filter: '' },
];

const DAK_GOLFPLAAT_MATS: MaterialSection[] = [

];


// #endregion

//#region ========================================== MATERIAL SECTIONS - BOEIBOORDEN ==========================================
// Re-using the Boeiboord definition from previous context as it wasn't redefined in the input
const BOEIBOORD_MATS: MaterialSection[] = [
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - GEVELBEKLEDING ==========================================

const GEVEL_BEKLEDING_MATS: MaterialSection[] = [
  // 1. BASIS (SKELETON) - The same for everyone
  { key: 'regelwerk_basis', label: 'Tengelwerk / Rachels', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },
  { key: 'folie_buiten', label: 'Folie', categoryFilter: 'Isolatie', category: 'isolatie', category_ultra_filter: '' },
  { key: 'isolatie_gevel', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', category_ultra_filter: '' },
  { key: 'ventilatieprofiel', label: 'Ventilatieprofiel (Ongedierte)', categoryFilter: 'Metalstud Profielen', category: 'hout', category_ultra_filter: '' },

  // 2. THE CHOICE (AFWERKPLAAT)
  // Option A: Wood
  { key: 'gevelbekleding_hout', label: 'Houten Bekleding (Rabat/Zweeds)', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'gevel_hout', category_ultra_filter: '' },
  { key: 'hoek_hout', label: 'Houten Hoeklatten', categoryFilter: 'Aftimmerhout & Plinten', category: 'gevel_hout', category_ultra_filter: '' },

  // Option B: Keralit (Plastic)
  { key: 'gevelbekleding_kunststof', label: 'Kunststof Panelen (Keralit)', categoryFilter: 'Houten Gevelbekleding', category: 'gevel_kunststof', category_ultra_filter: '' },
  { key: 'profiel_keralit', label: 'Keralit Profielen (Start/Eind/Hoek)', categoryFilter: 'Metalstud Profielen', category: 'gevel_kunststof', category_ultra_filter: '' },

  // Option C: Trespa (Plate)
  { key: 'gevelplaat', label: 'Volkern/HPL Plaat (Trespa)', categoryFilter: 'Constructieplaten', category: 'gevel_plaat', category_ultra_filter: '' },

  { key: 'gevelplaat', label: 'Volkern/HPL Plaat (Trespa)', categoryFilter: 'Constructieplaten', category: 'gevel_plaat_lijm', category_ultra_filter: '' },

  { key: 'waterslag', label: 'Waterslagen (Aluminium)', categoryFilter: 'Dakwerk & HWA', category: 'bevestiging', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - KOZIJNEN XXX==========================================

const KOZIJN_BINNEN_HOUT_MATS: MaterialSection[] = [
  // Hout
  { key: 'kozijnhout', label: 'Kozijnhout', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },
  { key: 'binnendorpel', label: 'Binnendorpel', categoryFilter: 'Kozijnhout, Raamhout, Kozijnstijl, Dorpels & Glaslatten', category: 'hout', category_ultra_filter: '' },

  // Beslag
  { key: 'scharnieren', label: 'Scharnieren', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },
  { key: 'sluitplaat', label: 'Sluitplaat', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },

  // Glas
  { key: 'glas_bovenlicht', label: 'Glas', categoryFilter: 'Binnenkozijnen', category: 'glas', category_ultra_filter: '' },
  { key: 'glaslatten', label: 'Glaslatten', categoryFilter: 'Binnenkozijnen', category: 'glas', category_ultra_filter: '' },

  // Afwerking
  { key: 'koplatten', label: 'Koplatten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', category_ultra_filter: '' },
  { key: 'neuten', label: 'Neuten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', category_ultra_filter: '' },
];

// ==========================================
// 2. BINNEN KOZIJNEN (STAAL)
// ==========================================
const KOZIJN_BINNEN_STAAL_MATS: MaterialSection[] = [
  // Stalen Kozijn
  { key: 'stalen_kozijn', label: 'Stalen Kozijn', categoryFilter: 'Binnenkozijnen', category: 'Stalen kozijn', category_ultra_filter: '' },

  // Beslag & Rubber
  { key: 'paumelles_staal', label: 'Paumelles', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },
  { key: 'aanslagrubber', label: 'Aanslagrubber', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },

  // Glas
  { key: 'glas_bovenlicht', label: 'Glas', categoryFilter: 'Binnenkozijnen', category: 'glas', category_ultra_filter: '' },
  { key: 'glaslatten_klik', label: 'Glaslatten', categoryFilter: 'Binnenkozijnen', category: 'glas', category_ultra_filter: '' },
];

// ==========================================
// 3. BUITEN KOZIJNEN - HOUT (PREFAB / FABRIEK)
// ==========================================
const KOZIJN_BUITEN_HOUT_MATS: MaterialSection[] = [
  // Element
  { key: 'prefab_kozijnelement', label: 'Kozijnelement', categoryFilter: 'Binnenkozijnen', category: 'element', category_ultra_filter: '' },
  { key: 'stelkozijnen', label: 'Stelkozijnen', categoryFilter: 'Constructiehout', category: 'element', category_ultra_filter: '' },

  // Afwerking Buiten
  { key: 'raamdorpel_steen', label: 'Raamdorpelstenen', categoryFilter: 'Kozijnhout, Raamhout, Kozijnstijl, Dorpels & Glaslatten', category: 'afwerking_buiten', category_ultra_filter: '' },
  { key: 'lood_dpc', label: 'Lood / DPC', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'afwerking_buiten', category_ultra_filter: '' },

  // Afwerking Binnen
  { key: 'dagkantafwerking', label: 'Dagkantbetimmering', categoryFilter: 'Constructieplaten', category: 'afwerking_binnen', category_ultra_filter: '' },
  { key: 'vensterbank', label: 'Vensterbank', categoryFilter: 'Kozijnhout, Raamhout, Kozijnstijl, Dorpels & Glaslatten', category: 'afwerking_binnen', category_ultra_filter: '' },
  { key: 'koplatten', label: 'Koplatten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking_binnen', category_ultra_filter: '' },
];

// ==========================================
// 4. BUITEN KOZIJNEN - KUNSTSTOF (PREFAB)
// ==========================================
const KOZIJN_BUITEN_KUNSTSTOF_MATS: MaterialSection[] = [
  // Element
  { key: 'profiel', label: 'Kozijnelement', categoryFilter: 'Binnenkozijnen', category: 'element', category_ultra_filter: '' },
  { key: 'onderdorpel', label: 'Onderdorpel', categoryFilter: 'Kozijnhout, Raamhout, Kozijnstijl, Dorpels & Glaslatten', category: 'element', category_ultra_filter: '' },

  // Montage (Excl klein materiaal)
  { key: 'stelkozijn', label: 'Stelkozijn', categoryFilter: 'Constructiehout', category: 'montage', category_ultra_filter: '' },

  // Afwerking
  { key: 'dagkanten', label: 'Dagkantafwerking', categoryFilter: 'Metalstud Profielen', category: 'afwerking', category_ultra_filter: '' },
  { key: 'waterslag', label: 'Waterslag', categoryFilter: 'Dakwerk & HWA', category: 'afwerking', category_ultra_filter: '' },
  { key: 'inzethorren', label: 'Inzethorren', categoryFilter: 'Overig', category: 'afwerking', category_ultra_filter: '' },
];

// ==========================================
// 5. AMBACHTELIJK TIMMERWERK (CUSTOM / RENOVATIE)
// ==========================================
const KOZIJN_TIMMERWERK_MATS: MaterialSection[] = [
  // Job 1: Kozijn (Vast)
  { key: 'kozijnhout_buiten', label: 'Kozijnhout', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },
  { key: 'onderdorpel', label: 'Onderdorpel', categoryFilter: 'Kozijnhout, Raamhout, Kozijnstijl, Dorpels & Glaslatten', category: 'hout', category_ultra_filter: '' },

  // Job 2: Raam (Draaiend)
  { key: 'raamhout', label: 'Raamhout', categoryFilter: 'Constructiehout', category: 'raam', category_ultra_filter: '' },

  // Beslag
  { key: 'scharnieren', label: 'Scharnieren', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },
  { key: 'raamboom', label: 'Raamboom', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },
  { key: 'raamuitzetter', label: 'Raamuitzetter', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },
  { key: 'meerpuntsluiting', label: 'Meerpuntsluiting', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },

  // Glas & Ventilatie
  { key: 'glas_buiten', label: 'Glas', categoryFilter: 'Binnenkozijnen', category: 'glas', category_ultra_filter: '' },
  { key: 'neuslatten', label: 'Neuslatten', categoryFilter: 'Binnenkozijnen', category: 'glas', category_ultra_filter: '' },
  { key: 'ventilatierooster', label: 'Ventilatierooster', categoryFilter: 'Overig', category: 'glas', category_ultra_filter: '' },

  // Afwerking
  { key: 'tochtkader', label: 'Tochtkader', categoryFilter: 'Binnendeuren & Beslag', category: 'afwerking', category_ultra_filter: '' },
  { key: 'waterkering', label: 'Lood / DPC', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'afwerking', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - SCHUTTING ==========================================

const SCHUTTING_MATS: MaterialSection[] = [
  // 1. FUNDERING & PALEN (GENERAL)
  { key: 'snelbeton', label: 'Snelbeton', categoryFilter: 'Fundering & Bekisting', category: 'fundering', category_ultra_filter: '' },
  { key: 'opsluitbanden', label: 'Opsluitbanden', categoryFilter: 'Fundering & Bekisting', category: 'fundering', category_ultra_filter: '' },
  { key: 'paalpunthouder', label: 'Paalpunthouder', categoryFilter: 'Binnendeuren & Beslag', category: 'fundering', category_ultra_filter: '' },

  // 2. OPTIE: HOUT
  { key: 'schuttingpalen_hout', label: 'Schuttingpalen hout', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'schutting_hout', category_ultra_filter: '' },
  { key: 'paalkap', label: 'Paalkappen', categoryFilter: 'Binnendeuren & Beslag', category: 'schutting_hout', category_ultra_filter: '' },
  { key: 'tuinscherm_hout', label: 'Tuinscherm hout', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'schutting_hout', category_ultra_filter: '' },
  { key: 'afdeklat_hout', label: 'Afdeklat hout', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'schutting_hout', category_ultra_filter: '' },
  { key: 'tuinplanken', label: 'Losse tuinplanken', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'schutting_hout', category_ultra_filter: '' },

  // 3. OPTIE: BETON SYSTEEM
  { key: 'betonpalen', label: 'Betonpalen', categoryFilter: 'Fundering & Bekisting', category: 'schutting_beton', category_ultra_filter: '' },
  { key: 'onderplaten', label: 'Onderplaten', categoryFilter: 'Fundering & Bekisting', category: 'schutting_beton', category_ultra_filter: '' },
  { key: 'afdekkap_beton', label: 'Afdekkappen beton', categoryFilter: 'Fundering & Bekisting', category: 'schutting_beton', category_ultra_filter: '' },
  { key: 'unibeslag', label: 'Unibeslag', categoryFilter: 'Binnendeuren & Beslag', category: 'schutting_beton', category_ultra_filter: '' },

  // 4. OPTIE: COMPOSIET
  { key: 'aluminium_palen', label: 'Aluminium palen', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'schutting_composiet', category_ultra_filter: '' },
  { key: 'paalvoet', label: 'Paalvoeten', categoryFilter: 'Binnendeuren & Beslag', category: 'schutting_composiet', category_ultra_filter: '' },
  { key: 'tuinscherm_composiet', label: 'Tuinscherm composiet', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'schutting_composiet', category_ultra_filter: '' },
  { key: 'u_profiel', label: 'U profielen', categoryFilter: 'Metalstud Profielen', category: 'schutting_composiet', category_ultra_filter: '' },

  // 5. POORT & TOEGANG
  { key: 'tuinpoort', label: 'Tuinpoort', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'poort', category_ultra_filter: '' },
  { key: 'stalen_frame', label: 'Stalen frame', categoryFilter: 'Binnendeuren & Beslag', category: 'poort', category_ultra_filter: '' },
  { key: 'kozijnbalken', label: 'Kozijnbalken', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'poort', category_ultra_filter: '' },

  // 6. TUINDEUR BESLAG
  { key: 'hengselset', label: 'Hengselset', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },
  { key: 'hengen', label: 'Hengen', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },
  { key: 'plaatduimen', label: 'Plaatduimen', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },
  { key: 'poortbeslag', label: 'Poortbeslag', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },
  { key: 'cilinderslot', label: 'Cilinderslot', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },
  { key: 'grondgrendel', label: 'Grondgrendel', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },
  { key: 'vloerstop', label: 'Vloerstop', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },
];


//#endregion

//#region ========================================== MATERIAL SECTIONS - HOUTBOUW & OVERKAPPING ==========================================

const HOUTBOUW_MATS: MaterialSection[] = [

];


//#endregion

//#region ========================================== MATERIAL SECTIONS - TRAPPEN ==========================================

const TRAPRENOVATIE_OVERZETTREDEN_MATS: MaterialSection[] = [
  { key: 'treden', label: 'Overzettrede', categoryFilter: 'Constructiehout', category: 'basis', category_ultra_filter: '' },
  { key: 'stootborden', label: 'Stootbord', categoryFilter: 'Constructiehout', category: 'basis', category_ultra_filter: '' },
  { key: 'profiel', label: 'Trapneusprofiel', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'afwerking', category_ultra_filter: '' },
  { key: 'antislip', label: 'Antislipstrip', categoryFilter: 'Binnendeuren & Beslag', category: 'afwerking', category_ultra_filter: '' }, // Beslag uitzondering
];

const VLIZOTRAP_MATS: MaterialSection[] = [
  { key: 'balken', label: 'Raveling balkhout', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },
  { key: 'trap', label: 'Vlizotrap (Complete set)', categoryFilter: 'Dakramen & Koepels', category: 'basis', category_ultra_filter: '' },
  { key: 'luik', label: 'Zolderluik', categoryFilter: 'Dakramen & Koepels', category: 'basis', category_ultra_filter: '' },
  { key: 'traphek', label: 'Veiligheidshek', categoryFilter: 'Constructiehout', category: 'veiligheid', category_ultra_filter: '' },
  { key: 'poortje', label: 'Veiligheidspoortje', categoryFilter: 'Binnendeuren & Beslag', category: 'veiligheid', category_ultra_filter: '' },
  { key: 'scharnieren', label: 'Scharnier', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },
  { key: 'sluiting', label: 'Grendel / Sluiting', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },
  { key: 'veer', label: 'Zelfsluitende veer', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },
  { key: 'handgreep', label: 'Handgreep', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },
  { key: 'architraaf', label: 'Koplatten', categoryFilter: 'Constructiehout', category: 'afwerking', category_ultra_filter: '' },
];

const NIEUWE_TRAP_PLAATSEN_MATS: MaterialSection[] = [
  // CONSTRUCTIE & RAVELING
  { key: 'balken', label: 'Raveling balkhout', categoryFilter: 'Constructiehout', category: 'hout', category_ultra_filter: '' },
  { key: 'balkdragers', label: 'Balkdrager', categoryFilter: 'Binnendeuren & Beslag', category: 'hout', category_ultra_filter: '' }, // Beslag uitzondering

  // DE TRAP (BASIS ONDERDELEN)
  { key: 'trap', label: 'Bouwpakket trap', categoryFilter: 'Constructiehout', category: 'trap', category_ultra_filter: '' },
  { key: 'trapboom', label: 'Trapboom', categoryFilter: 'Constructiehout', category: 'trap', category_ultra_filter: '' },
  { key: 'trede', label: 'Trede', categoryFilter: 'Constructiehout', category: 'trap', category_ultra_filter: '' },
  { key: 'stootbord', label: 'Stootbord', categoryFilter: 'Constructiehout', category: 'trap', category_ultra_filter: '' },

  // VEILIGHEID & BESLAG
  { key: 'trapaal', label: 'Trapaal', categoryFilter: 'Constructiehout', category: 'veiligheid', category_ultra_filter: '' },
  { key: 'spijlen', label: 'Spijl', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' }, // Beslag uitzondering
  { key: 'leuning', label: 'Trapleuning', categoryFilter: 'Constructiehout', category: 'veiligheid', category_ultra_filter: '' },
  { key: 'houders', label: 'Leuninghouder', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' }, // Beslag uitzondering
  { key: 'balustrade', label: 'Balustrade', categoryFilter: 'Constructiehout', category: 'veiligheid', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - HOUTROTREPARATIE ==========================================

const HOUTROTREPARATIE_MATS: MaterialSection[] = [
  // Voorbereiding & Stabilisatie
  { key: 'houtrotstop', label: 'Houtrotstop vloeistof', categoryFilter: 'Overig', category: 'reparatie', category_ultra_filter: '' },
  { key: 'stabilisator', label: 'Houtstabilisator', categoryFilter: 'Overig', category: 'reparatie', category_ultra_filter: '' },

  // Reparatie & Vulling
  { key: 'epoxy_vuller', label: 'Twee-componenten epoxy vuller', categoryFilter: 'Fundering & Bekisting', category: 'reparatie', category_ultra_filter: '' },
  { key: 'hout_inzetstuk', label: 'Vervangend hout inzetstuk', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'reparatie', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - KEUKENS ==========================================

const KEUKEN_MONTAGE_MATS: MaterialSection[] = [
  // BASIS
  { key: 'corpus', label: 'Keukenkast', categoryFilter: 'Constructiehout', category: 'basis', category_ultra_filter: '' },
  { key: 'werkblad', label: 'Aanrechtblad', categoryFilter: 'Constructieplaten', category: 'werkblad', category_ultra_filter: '' },

  // APPARATUUR & SPOELBAK
  { key: 'apparatuur', label: 'Inbouwapparaat', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'werkblad', category_ultra_filter: '' },
  { key: 'spoelbak', label: 'Spoelbak', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'beslag', category_ultra_filter: '' },
  { key: 'kraan', label: 'Keukenkraan', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' }, // Beslag

  // DETAILS
  { key: 'grepen', label: 'Handgreep', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' }, // Beslag
  { key: 'plint', label: 'Keukenplint', categoryFilter: 'Constructiehout', category: 'beslag', category_ultra_filter: '' },
  { key: 'verlichting', label: 'Keukenverlichting', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'beslag', category_ultra_filter: '' },
];

const KEUKEN_RENOVATIE_MATS: MaterialSection[] = [
  // ZICHTWERK
  { key: 'fronten', label: 'Keukenfront', categoryFilter: 'Constructieplaten', category: 'basis', category_ultra_filter: '' },
  { key: 'werkblad', label: 'Aanrechtblad', categoryFilter: 'Constructieplaten', category: 'werkblad', category_ultra_filter: '' },

  // HARDWARE (BESLAG)
  { key: 'scharnieren', label: 'Scharnier', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' }, // Beslag
  { key: 'geleiders', label: 'Ladegeleider', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' }, // Beslag
  { key: 'grepen', label: 'Handgreep', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' }, // Beslag

  // UPGRADES
  { key: 'apparatuur', label: 'Inbouwapparaat', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'werkblad', category_ultra_filter: '' },
  { key: 'kraan', label: 'Keukenkraan', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' }, // Beslag
];


//#endregion

//#region ========================================== MATERIAL SECTIONS - INBOUWKASTEN ==========================================


const INBOUWKAST_MATS: MaterialSection[] = [
  { key: 'corpus', label: 'Interieur / Corpus (MDF, Melamine, Multiplex)', categoryFilter: 'Constructieplaten', category: 'basis', category_ultra_filter: '' },
  { key: 'fronten', label: 'Deuren', categoryFilter: 'Constructieplaten', category: 'afwerking', category_ultra_filter: '' },
  { key: 'fronten', label: 'Fronten', categoryFilter: 'Constructieplaten', category: 'afwerking', category_ultra_filter: '' },
  { key: 'lades', label: 'Ladesystemen', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },
  { key: 'scharnieren', label: 'Scharnier', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },
  { key: 'grepen', label: 'Meubelgreep', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },
  { key: 'snappers', label: 'Push-to-open systeem', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },
  { key: 'garderobe', label: 'Kledingroede', categoryFilter: 'Binnendeuren & Beslag', category: 'beslag', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - MEUBEL OP MAAT ==========================================

const MEUBEL_MATS: MaterialSection[] = [
  { key: 'materiaal', label: 'Hoofdmateriaal', categoryFilter: 'Constructiehout', category: 'basis', category_ultra_filter: '' },
  { key: 'beslag', label: 'Meubelbeslag', categoryFilter: 'Binnendeuren & Beslag', category: 'afwerking', category_ultra_filter: '' },
  { key: 'afwerking', label: 'Olie, Lak, Beits', categoryFilter: 'Overig', category: 'afwerking', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - DAKKAPELLEN ==========================================


const DAKKAPEL_NIEUW_MATS: MaterialSection[] = [

];

const DAKKAPEL_RENOVATIE_MATS: MaterialSection[] = [
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - GLAS ZETTEN ==========================================

const ISOLATIEGLAS_MATS: MaterialSection[] = [
  { key: 'glas', label: 'Glas', categoryFilter: 'Binnenkozijnen', category: 'glas', category_ultra_filter: '' },
  { key: 'roosters', label: 'Ventilatie roosters', categoryFilter: 'Deuren & Kozijnen', category: 'glas', category_ultra_filter: '' },
  { key: 'glaslatten', label: 'Glaslatten', categoryFilter: 'Constructiehout', category: 'glas', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - DAKRAMEN ==========================================


const VELUX_MATS: MaterialSection[] = [
  { key: 'venster', label: 'Velux dakraam set', categoryFilter: 'Dakramen & Koepels', category: 'vensterset', category_ultra_filter: '' },
  { key: 'venster', label: 'Velux Venster', categoryFilter: 'Dakramen & Koepels', category: 'venster', category_ultra_filter: '' },
  { key: 'gootstuk', label: 'Gootstukken', categoryFilter: 'Dakramen & Koepels', category: 'gootstuk', category_ultra_filter: '' },
  { key: 'betimmering', label: 'Interieur afwerking', categoryFilter: 'Constructiehout', category: 'afwerking', category_ultra_filter: '' },
];

const LICHTKOEPEL_MATS: MaterialSection[] = [
  { key: 'koepel', label: 'Lichtkoepel', categoryFilter: 'Dakramen & Koepels', category: 'koepel', category_ultra_filter: '' },
  { key: 'opstand', label: 'Opstand Houtbalk of Prefab Set', categoryFilter: 'Dakramen & Koepels', category: 'opstand', category_ultra_filter: '' },
  { key: 'dakbedekking', label: 'Dakbedekking', categoryFilter: 'Dakwerk & HWA', category: 'afwerking', category_ultra_filter: '' },
];





// ==========================================
// 4. THE REGISTRY (Database)
// ==========================================


//#endregion

export const JOB_REGISTRY: Record<string, CategoryConfig> = {

  //#region --- TRAPPEN ---
  trappen: {
    title: 'Trappen',
    searchPlaceholder: 'Zoek traptype...',
    items: [
      {
        title: 'Overzettreden',
        description: 'Overzet op bestaande trap',
        slug: 'traprenovatie-overzettreden',
        measurementLabel: 'Trap',
        measurements: STANDARD_FIELDS,
        materialSections: TRAPRENOVATIE_OVERZETTREDEN_MATS,
        categoryConfig: {
          basis: { title: 'Treden & Stootborden', order: 1 },
          afwerking: { title: 'Veiligheid', order: 2 },
        },
      },
      {
        title: 'Vlizotrap',
        description: 'Plaatsen van vlizotrap',
        slug: 'vlizotrap',
        measurementLabel: 'Trap',
        measurements: STANDARD_FIELDS,
        materialSections: VLIZOTRAP_MATS,
        categoryConfig: {
          hout: { title: 'Constructie & Raveling', order: 1 },
          basis: { title: 'Vlizotrap & Zolderluik', order: 2 },
          veiligheid: { title: 'Veiligheid', order: 3 },
          beslag: { title: 'Hekwerk Beslag', order: 4 },
          afwerking: { title: 'Afwerking', order: 5 },
        },
      },
      {
        title: 'Nieuwe trap plaatsen',
        description: 'Plaatsen van nieuwe trap',
        slug: 'nieuwe-trap-plaatsen',
        measurementLabel: 'Trap',
        measurements: STANDARD_FIELDS,
        materialSections: NIEUWE_TRAP_PLAATSEN_MATS,
        categoryConfig: {
          hout: { title: 'Constructie & Raveling', order: 1 },
          trap: { title: 'De Trap (Basis)', order: 2 },
          veiligheid: { title: 'Leuningen & Hekwerken', order: 3 },
          beslag: { title: 'Luxe Beslag & Hardware', order: 4 },
        },
      },
    ],
  },

  //#endregion

  //#region --- HOUTROTREPARATIE ---
  houtrotreparatie: {
    title: 'Houtrotreparatie',
    searchPlaceholder: 'Zoek reparatietype...',
    items: [
      {
        title: 'Houtrotreparatie',
        description: 'Herstel met epoxy/inzetstukken',
        slug: 'houtrotreparatie',
        measurementLabel: 'Onderdeel',
        measurements: STANDARD_FIELDS,
        materialSections: HOUTROTREPARATIE_MATS,
        categoryConfig: {
          reparatie: { title: 'Voorbereiding & Vulling', order: 1 },
        }
      },
    ],
  },

  //#endregion

  //#region --- WANDEN ---
  wanden: {
    title: 'Wanden',
    searchPlaceholder: 'Zoek wandtype...',
    items: [
      {
        title: 'HSB Voorzetwand',
        description: 'Enkelzijdig bekleed',
        slug: 'hsb-voorzetwand',
        measurementLabel: 'Wand',
        measurements: WALL_FIELDS,
        materialSections: HSB_VOORZETWAND_BINNEN_MATS,
        categoryConfig: {
          hout: { title: 'Framewerk', order: 1 },
          isolatie: { title: 'Isolatie & Folies', order: 2 },
          beplating: { title: 'Beplating', order: 3 },
          afwerking: { title: 'Afwerken', order: 5 },
          gips_afwerking: { title: 'Naden & Stucwerk', order: 7 },
          Kozijnen: { title: 'Kozijnen', order: 8 },
          Deuren: { title: 'Deuren', order: 9 },
          Koof: { title: 'Leidingkoof / Omkasting', order: 10 },
          Installatie: { title: 'Installatie & Elektra', order: 11 },
        }
      },
      {
        title: 'Metalstud Voorzetwand',
        description: 'Enkelzijdig bekleed',
        slug: 'metalstud-voorzetwand',
        measurementLabel: 'Wand',
        measurements: WALL_FIELDS,
        materialSections: METALSTUD_VOORZETWAND_BINNEN_MATS,
        categoryConfig: {
          metaal: { title: 'Metal Stud Framewerk', order: 1 },
          isolatie: { title: 'Isolatie & Folies', order: 2 },
          beplating: { title: 'Beplating', order: 3 },
          Installatie: { title: 'Installatie & Elektra', order: 4 },
          Schakelmateriaal: { title: 'Schakelmateriaal', order: 5 },
          Koof: { title: 'Leidingkoof / Omkasting', order: 6 },
          afwerking: { title: 'Afwerken', order: 7 },
          gips_afwerking: { title: 'Naden & Stucwerk', order: 8 },
          Kozijnen: { title: 'Kozijnen', order: 9 },
          Deuren: { title: 'Deuren', order: 10 },
        }
      },
      {
        title: 'HSB Buiten Wand',
        description: 'Volledige gevelopbouw incl. bekleding',
        slug: 'HBS-buiten-wand',
        measurementLabel: 'Wand',
        measurements: WALL_FIELDS,
        materialSections: HSB_BUITENWAND_MATS,
        categoryConfig: {
          hout: { title: 'Constructie & Regelwerk', order: 1 },
          isolatie: { title: 'Isolatie, Folies & Spouw', order: 2 },
          beplating: { title: 'Beplating & Gevelbekleding', order: 3 },
          afwerking_buiten: { title: 'Buitenafwerking', order: 4 },
          afwerking_binnen: { title: 'Binnenafwerking', order: 5 },
          gips_afwerking: { title: 'Stucwerk', order: 6 },
          Kozijnen: { title: 'Kozijnen & Ramen', order: 7 },
          Deuren: { title: 'Buitendeuren & Hang- en Sluitwerk', order: 8 },
        }
      },
      {
        title: 'HSB Tussenwand',
        description: 'Dubbelzijdig bekleed',
        slug: 'hsb-tussenwand',
        measurementLabel: 'Wand',
        measurements: WALL_FIELDS,
        materialSections: HSB_TUSSENWAND_MATS,
        categoryConfig: {
          hout: { title: 'Framewerk', order: 1 },
          isolatie: { title: 'Isolatie & Folies', order: 2 },
          beplating: { title: 'Beplating', order: 3 },
          afwerking: { title: 'Afwerken', order: 4 },
          gips_afwerking: { title: 'Naden & Stucwerk', order: 5 },
          kozijnen: { title: 'Kozijnen', order: 6 },
          deuren: { title: 'Deuren', order: 7 },
          koof: { title: 'Leidingkoof / Omkasting', order: 8 },
          Installatie: { title: 'Installatie & Elektra', order: 9 },
          Schakelmateriaal: { title: 'Schakelmateriaal', order: 10 }
        }
      },
      {
        title: 'Metalstud Tussenwand',
        description: 'Dubbelzijdig bekleed',
        slug: 'metalstud-tussenwand',
        measurementLabel: 'Wand',
        measurements: WALL_FIELDS,
        materialSections: METALSTUD_TUSSENWAND_MATS,
        categoryConfig: {
          metalstud: { title: 'Framewerk', order: 1 }, // Check: key must match the section ID in your MATS file
          isolatie: { title: 'Isolatie & Folies', order: 2 },
          beplating: { title: 'Beplating', order: 3 },
          afwerking: { title: 'Afwerken', order: 4 },
          gips_afwerking: { title: 'Naden & Stucwerk', order: 5 },
          kozijnen: { title: 'Kozijnen', order: 6 },
          deuren: { title: 'Deuren', order: 7 },
          koof: { title: 'Leidingkoof / Omkasting', order: 8 },
          Installatie: { title: 'Installatie & Elektra', order: 9 },
          Schakelmateriaal: { title: 'Schakelmateriaal', order: 10 }
        }
      },
      {
        title: 'Knieschotten',
        description: 'Aftimmeren schuine zijde (schuif/vast)',
        slug: 'knieschotten',
        measurementLabel: 'Wand',
        measurements: WALL_FIELDS,
        materialSections: KNIESCHOTTEN_MATS,
        categoryConfig: {
          hout: { title: 'Framewerk', order: 1 },
          isolatie: { title: 'Isolatie & Folies', order: 2 },
          beplating: { title: 'Beplating', order: 3 },
          afwerking: { title: 'Afwerken', order: 4 },
          gips_afwerking: { title: 'Naden & Stucwerk', order: 5 },
          schuifdeuren: { title: 'Schuifdeuren', order: 6 },
          koof: { title: 'Leidingkoof / Omkasting', order: 7 },
          Installatie: { title: 'Installatie & Elektra', order: 8 },
          Schakelmateriaal: { title: 'Schakelmateriaal', order: 9 }
        }
      },
      {
        title: 'Cinewall / TV-wand',
        description: 'Met nissen en kabelmanagement',
        slug: 'cinewall-tv-wand',
        measurementLabel: 'Wand',
        measurements: WALL_FIELDS,
        materialSections: CINEWALL_TV_WAND_MATS,
        categoryConfig: {
          hout: { title: 'Framewerk', order: 1 },
          Installatie: { title: 'Installatie & Elektra', order: 2 }, // Earlier for Cinewall
          Schakelmateriaal: { title: 'Schakelmateriaal', order: 3 },
          isolatie: { title: 'Isolatie & Folies', order: 4 },
          Koof: { title: 'Leidingkoof / Omkasting', order: 5 },
          beplating: { title: 'Beplating', order: 6 },
          afwerking: { title: 'Afwerken', order: 7 },
          gips_afwerking: { title: 'Naden & Stucwerk', order: 8 },
          Cinewall: { title: 'Cinewall Elementen', order: 9 }, // Special category for Cinewall
        }
      },
      {
        title: 'Overig Wanden',
        description: 'Afwijkende wandopbouw',
        slug: 'overig-wanden',
        measurementLabel: 'Wand',
        measurements: STANDARD_FIELDS,
        materialSections: OVERIG_WANDEN_MATS
      },
    ],
  },

  //#endregion

  //#region --- PLAFONDS ---
  plafonds: {
    title: 'Plafonds',
    searchPlaceholder: 'Zoek plafondtype...',
    items: [
      {
        title: 'Plafond – Houten Framewerk',
        description: 'Houten draagconstructie',
        slug: 'plafond-houten-framework',
        measurementLabel: 'Plafond',
        measurements: CEILLING_FIELDS,
        materialSections: PLAFOND_HOUT_MATS,
        categoryConfig: {
          hout: { title: 'Framewerk', order: 1 },
          Koof: { title: 'Leidingkoof / Omkasting', order: 2 },
          Gordijnkoof: { title: 'Gordijnkoof', order: 3 },
          Installatie: { title: 'Installatie & Elektra', order: 4 },
          Schakelmateriaal: { title: 'Schakelmateriaal', order: 5 },
          isolatie: { title: 'Isolatie & Folies', order: 6 },
          beplating: { title: 'Beplating', order: 7 },
          afwerking: { title: 'Afwerken', order: 8 },
          Toegang: { title: 'Toegang & Vlizotrap', order: 9 },
          gips_afwerking: { title: 'Naden & Stucwerk', order: 10 },
        }
      },
      {
        title: 'Plafond – Metalstud C/U',
        description: 'Metalen plafondconstructie',
        slug: 'plafond-metalstud',
        measurementLabel: 'Plafond',
        measurements: CEILLING_FIELDS,
        materialSections: PLAFOND_METALSTUD_MATS,
        categoryConfig: {
          metaal: { title: 'Metal Stud Framewerk', order: 1 },
          Koof: { title: 'Leidingkoof / Omkasting', order: 2 },
          Gordijnkoof: { title: 'Gordijnkoof', order: 3 },
          Installatie: { title: 'Installatie & Elektra', order: 4 },
          Schakelmateriaal: { title: 'Schakelmateriaal', order: 5 },
          isolatie: { title: 'Isolatie & Folies', order: 6 },
          beplating: { title: 'Beplating', order: 7 },
          afwerking: { title: 'Afwerken', order: 8 },
          Toegang: { title: 'Toegang & Vlizotrap', order: 9 },
          gips_afwerking: { title: 'Naden & Stucwerk', order: 10 },
        }
      },
      {
        title: 'Overig Plafonds',
        description: 'Niet-standaard plafondoplossingen',
        slug: 'overig-plafonds',
        measurementLabel: 'Plafond',
        measurements: CEILLING_FIELDS,
        materialSections: []
      },
    ],
  },

  // --- VLOEREN ---
  vloeren: {
    title: 'Vloeren & Vlieringen',
    searchPlaceholder: 'Zoek vloertype...',
    items: [
      {
        title: 'Massief Houten Vloer (finish)',
        description: 'Eindafwerking (verlijmd/genageld)',
        slug: 'massief-houten-vloer',
        measurementLabel: 'Vloer',
        measurements: AREA_FIELDS,
        materialSections: MASSIEF_HOUTEN_VLOER_FINISH_MATS,
        categoryConfig: {
          voorbereiding: { title: 'Voorbereiding', order: 1 },
          parket: { title: 'Parket', order: 2 },
          afwerking: { title: 'Afwerking', order: 3 }
        }
      },
      {
        title: 'Laminaat / PVC / Klik-Vinyl',
        description: 'Afwerkvloer (zwevend)',
        slug: 'laminaat-pvc',
        measurementLabel: 'Vloer',
        measurements: AREA_FIELDS,
        materialSections: VLOER_AFWERK_MATS,
        categoryConfig: {
          voorbereiding: { title: 'Voorbereiding', order: 1 },
          vloerdelen: { title: 'Vloerdelen', order: 2 },
          afwerking: { title: 'Afwerking', order: 3 }
        }
      },
      {
        title: 'Vlonder / Terrasconstructie',
        description: 'Buitenconstructie (hout/composiet)',
        slug: 'vlonder-terras',
        measurementLabel: 'Terras',
        measurements: AREA_FIELDS,
        materialSections: VLONDER_MATS,
        categoryConfig: {
          Vlonder_Fundering: { title: 'Grondwerk & Fundering', order: 1 },
          Vlonder_Constructie: { title: 'Constructie (Onderbouw)', order: 2 },
          Vlonder_Dek: { title: 'Vlonder & Afwerking', order: 3 }
        }
      },
      {
        title: 'Begane Grond Constructievloer',
        description: 'Constructieve opbouw',
        slug: 'balklaag-constructievloer',
        measurementLabel: 'Vloer',
        measurements: WALL_FIELDS,
        materialSections: BALKLAAG_CONSTRUCTIEVLOER_MATS,
        categoryConfig: {
          balklaag: { title: 'Balklaag & Constructie', order: 1 },
          isolatie: { title: 'Isolatie & Folies', order: 2 },
          beplating: { title: 'Beplating', order: 3 }
        }
      },
      {
        title: 'Tussenvloer / Bergzolder',
        description: 'Extra opslagruimte in nok',
        slug: 'vliering-maken',
        measurementLabel: 'Vloer',
        measurements: AREA_FIELDS,
        materialSections: VLIERING_MATS,
        categoryConfig: {
          Constructievloer: { title: 'Constructie & Vloer (Bovenzijde)', order: 1 },
          beplating: { title: 'Beplating (Constructie)', order: 2 }, // Nieuwe positie voor de vloer-constructieplaat
          isolatie: { title: 'Isolatie & Folies', order: 3 },        // Verplaatst naar order 3
          Toegang: { title: 'Toegang & Vlizotrap', order: 4 },
          hout: { title: 'Plafond Framewerk (Hout)', order: 5 },
          metaal: { title: 'Plafond Framewerk (Metal Stud)', order: 6 },
          Koof: { title: 'Leidingkoof', order: 7 },
          Gordijnkoof: { title: 'Gordijnkoof', order: 8 },
          Installatie: { title: 'Installatie & Elektra', order: 9 },
          Schakelmateriaal: { title: 'Schakelmateriaal', order: 10 },
          beplating_afwerking: { title: 'Beplating (Plafond)', order: 11 },
          afwerking: { title: 'Afwerken', order: 12 },
          gips_afwerking: { title: 'Naden & Stucwerk', order: 13 },
        }
      },
      {
        title: 'Overig Vloeren',
        description: 'Vloeroplossingen buiten standaard',
        slug: 'overig-vloeren',
        measurementLabel: 'Vloer',
        measurements: AREA_FIELDS,
        materialSections: []
      },
    ],
  },

  //#endregion

  //#region --- DAKKAPELLEN ---
  dakkapellen: {
    title: 'Dakkapellen',
    searchPlaceholder: 'Zoek dakkapelklus...',
    items: [
      {
        title: 'Dakkapel – Nieuw plaatsen',
        description: 'Prefab of maatwerk opbouw',
        slug: 'dakkapel-nieuw',
        measurementLabel: 'Dakkapel',
        measurements: COUNT_FIELDS,
        materialSections: DAKKAPEL_NIEUW_MATS,
        categoryConfig: {
          hout: { title: 'Constructie & Casco', order: 1 },
          dak: { title: 'Dakwerk & Bedekking', order: 2 },   // Custom for Dakkapel
          gevel: { title: 'Gevelbekleding', order: 3 },      // Custom for Dakkapel
          isolatie: { title: 'Isolatie & Folies', order: 4 },
          beplating: { title: 'Beplating', order: 5 },
          afwerking: { title: 'Binnenafwerking', order: 6 },
          Kozijnen: { title: 'Kozijnen', order: 7 },
        }
      },
      {
        title: 'Dakkapel – Renovatie',
        description: 'Bekleding/Dakbedekking vervangen',
        slug: 'dakkapel-renovatie',
        measurementLabel: 'Dakkapel',
        measurements: COUNT_FIELDS,
        materialSections: DAKKAPEL_RENOVATIE_MATS
      }
    ]
  },

  //#endregion

  //#region --- INBOUWKASTEN ---
  interieur: {
    title: 'INBOUWKASTEN',
    searchPlaceholder: 'Zoek interieurklus...',
    items: [
      {
        title: 'Inbouwkasten',
        description: 'Maatwerk (wandvullend)',
        slug: 'inbouwkasten',
        measurementLabel: 'Kast',
        measurements: STANDARD_FIELDS,
        materialSections: INBOUWKAST_MATS,
        categoryConfig: {
          basis: { title: 'Binnenwerk', order: 1 },
          afwerking: { title: 'Deuren & Fronten', order: 2 },
          beslag: { title: 'Luxe Beslag & Ladesystemen', order: 3 },
        }
      },
    ]
  },

  //#endregion

  //#region --- MEUBLS OP MAAT ---

  MEUBELS_OP_MAAT: {
    title: 'MEUBELS OP MAAT',
    searchPlaceholder: 'Zoek interieurklus...',
    items: [
      {
        title: 'Meubel op maat',
        description: 'Tafels, banken, losse kasten',
        slug: 'meubel-op-maat',
        measurementLabel: 'Meubel',
        measurements: STANDARD_FIELDS,
        materialSections: MEUBEL_MATS,
        categoryConfig: {
          basis: { title: 'Hoofdmateriaal', order: 1 },
          beslag: { title: 'Meubelbeslag & Montage', order: 2 },
          afwerking: { title: 'Afwerking', order: 3 },
        }
      }
    ]
  },

  //#endregion

  //#region --- AFWERKINGEN ---
  afwerkingen: {
    title: 'Afwerkingen',
    searchPlaceholder: 'Zoek afwerking...',
    items: [
      {
        title: 'Dagkanten',
        description: 'Afwerking rondom kozijnen',
        slug: 'dagkanten',
        measurementLabel: 'Dagkant',
        measurements: COUNT_FIELDS,
        materialSections: DAGKANT_MATS,
        categoryConfig: {
          hout: { title: 'Constructie Regelwerk', order: 1 },
          afwerking: { title: 'Afwerking', order: 2 },
        },
      },
      {
        title: 'Plinten en afwerklatten',
        description: 'Vloer- en wandafwerking',
        slug: 'plinten-afwerklatten',
        measurementLabel: 'Ruimte',
        measurements: AREA_FIELDS,
        materialSections: PLINTEN_MATS,
        categoryConfig: {
          plinten: { title: 'Plinten', order: 1 },
          afwerking: { title: 'Afwerklatten', order: 2 },
        },
      },
      {
        title: 'Omkastingen en koven',
        description: 'Leidingen en balken wegwerken',
        slug: 'omkastingen-koven',
        measurementLabel: 'Omkasting',
        measurements: COUNT_FIELDS,
        materialSections: OMKASTING_KOVEN_MATS,
        categoryConfig: {
          hout: { title: 'Constructie Regelwerk', order: 1 },
          afwerking: { title: 'Beplating', order: 2 },
        },
      },
      {
        title: 'Vensterbanken',
        description: 'Plaatsing of vervanging',
        slug: 'vensterbanken',
        measurementLabel: 'Vensterbank',
        measurements: COUNT_FIELDS,
        materialSections: VENSTERBANK_MATS,
        categoryConfig: {
          hout: { title: 'Constructie Regelwerk', order: 1 },
          afwerking: { title: 'Vensterbank', order: 2 },
        },
      },
    ],
  },




  //#endregion

  //#region --- DEUREN ---
  deuren: {
    title: 'Deuren & Beveiliging',
    searchPlaceholder: 'Zoek deurtype...',
    items: [
      {
        title: 'Binnendeuren',
        description: 'Stomp of opdek',
        slug: 'binnendeur-afhangen',
        measurementLabel: 'Deur',
        measurements: COUNT_FIELDS,
        materialSections: DEUR_BINNEN_MATS,
        categoryConfig: {
          Deuren: { title: 'Deurblad', order: 1 },
          deurbeslag: { title: 'Deurbeslag & Sloten', order: 2 },
          glas: { title: 'Glas & Beglazing', order: 3 },
          tochtstrips: { title: 'Tochtwering', order: 4 },
          ventilatie: { title: 'Ventilatie', order: 5 },
        }
      },
      {
        title: 'Buitendeuren',
        description: 'Voordeur/Achterdeur',
        slug: 'buitendeur-afhangen',
        measurementLabel: 'Deur',
        measurements: COUNT_FIELDS,
        materialSections: DEUR_BUITEN_MATS,
        categoryConfig: {
          Deuren: { title: 'Buitendeur', order: 1 },
          deurbeslag: { title: 'Beveiliging & Sloten', order: 2 },
          glas: { title: 'Glas & Beglazing', order: 3 },
          tochtstrips: { title: 'Tochtwering', order: 4 },
          ventilatie: { title: 'Ventilatie', order: 5 },
        }
      },
      {
        title: 'Schuifdeuren',
        description: 'Schuifdeuren systeem',
        slug: 'Schuifdeuren',
        measurementLabel: 'Deur',
        measurements: COUNT_FIELDS,
        materialSections: DEUR_BUITEN_MATS,
      },
      {
        title: 'Overig Deuren',
        description: 'Afwijkend deurwerk',
        slug: 'overig-deuren',
        measurementLabel: 'Deur',
        measurements: COUNT_FIELDS,
        materialSections: []
      },
    ],
  },

  //#endregion

  //#region --- DAKRENOVATIE ---
  dakrenovatie: {
    title: 'Dakrenovatie',
    searchPlaceholder: 'Zoek daktype...',
    items: [
      {
        title: 'Hellend Dak Vervangen',
        description: 'Nieuwe pannen/dakopbouw',
        slug: 'hellend-dak',
        measurementLabel: 'Dakvlak',
        measurements: AREA_FIELDS,
        materialSections: DAK_HELLEND_MATS,
        categoryConfig: {
          beplating: { title: 'Dakbeschot', order: 1 },
          isolatie: { title: 'Isolatie & Folies', order: 2 },
          hout: { title: 'Tengels & Panlatten', order: 3 },
          dak: { title: 'Dakpannen', order: 4 }, // Split
          afwerking_dak: { title: '5. Afwerking', order: 5 }, // New Split
        },
      },
      {
        title: 'EPDM Dakbedekking',
        description: 'Platte daken',
        slug: 'epdm-dakbedekking',
        measurementLabel: 'Dakvlak',
        measurements: AREA_FIELDS,
        materialSections: DAK_EPDM_MATS,
        categoryConfig: {
          beplating: { title: 'Beplating', order: 3 },
          isolatie: { title: 'Isolatie & Folies', order: 2 },
          dak: { title: 'EPDM', order: 3 },
          afwerking_dak: { title: 'Afwerking', order: 4 },
        },
      },
      {
        title: 'Golfplaat Dak',
        description: 'Op houten constructie',
        slug: 'golfplaat-dak',
        measurementLabel: 'Dakvlak',
        measurements: AREA_FIELDS,
        materialSections: DAK_GOLFPLAAT_MATS
      },
    ],
  },

  //#endregion

  //#region --- BOEIBOORDEN ---
  boeiboorden: {
    title: 'Boeiboorden',
    searchPlaceholder: 'Zoek boeiboordtype...',
    items: [
      {
        title: 'Boeiboord Hout',
        description: 'Multiplex of Red Cedar',
        slug: 'boeiboord-hout',
        measurementLabel: 'Boeiboord',
        measurements: AREA_FIELDS,
        materialSections: BOEIBOORD_MATS
      },
      {
        title: 'Boeiboord Trespa/Keralit',
        description: 'Kunststof bekleding',
        slug: 'boeiboord-kunststof',
        measurementLabel: 'Boeiboord',
        measurements: AREA_FIELDS,
        materialSections: BOEIBOORD_MATS
      },
    ],
  },

  //#endregion

  //#region --- GEVELBEKLEDING ---
  gevelbekleding: {
    title: 'Gevelbekleding',
    searchPlaceholder: 'Zoek geveltype...',
    items: [
      {
        title: 'Gevelbekleding Vervangen',
        description: 'Hout, Keralit of Trespa',
        slug: 'gevelbekleding-compleet',
        measurementLabel: 'Gevel',
        measurements: AREA_FIELDS,
        materialSections: GEVEL_BEKLEDING_MATS,
        categoryConfig: {
          hout: { title: 'Basis (Regelwerk)', order: 1 },
          isolatie: { title: 'Isolatie & Folie', order: 2 },

          // The "Flavor" Selection
          gevel_hout: { title: 'Hout', order: 3 },
          gevel_kunststof: { title: 'Keralit', order: 4 },
          gevel_plaat: { title: 'Trespa/HPL (Geschroefd)', order: 5 },


          gevel_plaat_lijm: { title: 'Trespa/HPL (Verlijmd)', order: 7 },

          bevestiging: { title: 'Afwerking', order: 9 },
        }
      },
    ],
  },
  //#endregion

  //#region --- KOZIJNEN ---
  kozijnen: {
    title: 'Kozijnen & Luiken',
    searchPlaceholder: 'Zoek kozijntype...',
    items: [
      {
        title: 'Binnendeur Kozijnen – Hout',
        description: 'Kant-en-klaar element',
        slug: 'binnen-kozijn-hout',
        measurementLabel: 'Kozijn',
        measurements: COUNT_FIELDS,
        materialSections: KOZIJN_BINNEN_HOUT_MATS,
        categoryConfig: {
          hout: { title: 'Kozijnhout', order: 1 },
          beslag: { title: 'Hang- & Sluitwerk', order: 2 },
          glas: { title: 'Glas & Beglazing', order: 3 },
          afwerking: { title: 'Afwerking', order: 4 },
        }
      },
      {
        title: 'Binnen Kozijnen – Staal',
        description: 'Kant-en-klaar element',
        slug: 'binnen-kozijn-staal',
        measurementLabel: 'Kozijn',
        measurements: COUNT_FIELDS,
        materialSections: KOZIJN_BINNEN_STAAL_MATS,
        categoryConfig: {
          'Stalen kozijn': { title: 'Stalen Kozijn', order: 1 },
          beslag: { title: 'Hang- & Sluitwerk', order: 2 },
          glas: { title: 'Glas & Beglazing', order: 3 },
        }
      },
      {
        title: 'Buiten kozijnen – Hout',
        description: 'Kant-en-klaar element',
        slug: 'buiten-kozijn-hout',
        measurementLabel: 'Kozijn',
        measurements: COUNT_FIELDS,
        materialSections: KOZIJN_BUITEN_HOUT_MATS,
        categoryConfig: {
          element: { title: 'Kozijnelement', order: 1 },
          afwerking_buiten: { title: 'Afwerking Buiten', order: 2 },
          afwerking_binnen: { title: 'Afwerking Binnen', order: 3 },
        }
      },
      {
        title: 'Buiten Kozijnen – Kunststof',
        description: 'Kant-en-klaar element',
        slug: 'buiten-kozijn-kunststof',
        measurementLabel: 'Kozijn',
        measurements: COUNT_FIELDS,
        materialSections: KOZIJN_BUITEN_KUNSTSTOF_MATS,
        categoryConfig: {
          element: { title: 'Kozijnelement', order: 1 },
          montage: { title: 'Montage', order: 2 },
          afwerking: { title: 'Afwerking', order: 3 },
        }
      },
      {
        title: 'Zelf gemaakte houtkozijnen',
        description: 'Productie in eigen werkplaats',
        slug: 'zelfgemaakte-kozijnen',
        measurementLabel: 'Kozijn',
        measurements: COUNT_FIELDS,
        materialSections: KOZIJN_TIMMERWERK_MATS,
        categoryConfig: {
          hout: { title: 'Kozijnhout', order: 1 },
          raam: { title: 'Ramen', order: 2 },
          beslag: { title: 'Hang- & Sluitwerk', order: 3 },
          glas: { title: 'Glas & Beglazing', order: 4 },
          afwerking: { title: 'Afwerking', order: 5 },
        }
      },

      {
        title: 'Overig Kozijnen',
        description: 'Renovatie of reparatie',
        slug: 'overig-kozijnen',
        measurementLabel: 'Kozijn',
        measurements: COUNT_FIELDS,
        materialSections: []
      },
    ],
  },

  //#endregion

  //#region --- SCHUTTING ---
  schutting: {
    title: 'Schutting & Tuin',
    searchPlaceholder: 'Zoek schuttingklus...',
    items: [
      {
        title: 'Schutting plaatsen',
        description: 'Hout, Beton of Composiet',
        slug: 'schutting-compleet',
        measurementLabel: 'Schutting',
        measurements: STANDARD_FIELDS,
        materialSections: SCHUTTING_MATS,
        categoryConfig: {
          fundering: { title: 'Basis & Fundering', order: 1 },
          schutting_hout: { title: 'Optie: Hout', order: 2 },
          schutting_beton: { title: 'Optie: Beton', order: 3 },
          schutting_composiet: { title: 'Optie: Composiet', order: 4 },
          poort: { title: 'Poort & Toegang', order: 5 },
          beslag: { title: 'Tuindeur Beslag', order: 6 },
        },
      },
    ]
  },

  //#endregion

  //#region --- OVERKAPPING ---
  overkapping: {
    title: 'Overkapping & Houtbouw',
    searchPlaceholder: 'Zoek constructie...',
    items: [
      { title: 'Overkapping & Carport', description: 'Vrijstaand of aan huis', slug: 'overkapping-carport', measurementLabel: 'Overkapping', measurements: AREA_FIELDS, materialSections: HOUTBOUW_MATS },
      { title: 'Veranda & Serre', description: 'Aanbouw met lichtstraten', slug: 'veranda-serre', measurementLabel: 'Veranda', measurements: AREA_FIELDS, materialSections: HOUTBOUW_MATS },
      { title: 'Garage / Schuur (Houtbouw)', description: 'Volledig gesloten constructie', slug: 'garage-schuur', measurementLabel: 'Garage', measurements: AREA_FIELDS, materialSections: HOUTBOUW_MATS },
      { title: 'Tuinhuis / Blokhut', description: 'Berging in de tuin', slug: 'tuinhuis-blokhut', measurementLabel: 'Tuinhuis', measurements: AREA_FIELDS, materialSections: HOUTBOUW_MATS },
      { title: 'Pergola', description: 'Open constructie', slug: 'pergola', measurementLabel: 'Pergola', measurements: AREA_FIELDS, materialSections: VLONDER_MATS },
    ],
  },

  //#endregion

  //#region --- GLAS ZETTEN ---
  'glas-zetten': {
    title: 'Glas zetten',
    searchPlaceholder: 'Zoek glasklus...',
    items: [
      {
        title: 'Glas zetten',
        description: 'Isolatieglas zetten',
        slug: 'isolatieglas',
        measurementLabel: 'Ruit',
        measurements: COUNT_FIELDS,
        materialSections: ISOLATIEGLAS_MATS,
        categoryConfig: {
          glas: { title: 'Glas & Afwerking', order: 1 }
        },
      },
    ]
  },

  //#endregion

  //#region --- KEUKENS ---
  keukens: {
    title: 'Keukens',
    searchPlaceholder: 'Zoek keukenklus...',
    items: [
      {
        title: 'Keukenmontage',
        description: 'Plaatsen van nieuwe keuken',
        slug: 'keuken-montage',
        measurementLabel: 'Keuken',
        measurements: COUNT_FIELDS,
        materialSections: KEUKEN_MONTAGE_MATS,
        categoryConfig: {
          basis: { title: 'Keukenelementen & Kasten', order: 1 },
          werkblad: { title: 'Werkblad & Apparatuur', order: 2 },
          beslag: { title: 'Luxe Beslag & Accessoires', order: 3 },
        },
      },
      {
        title: 'Keukenrenovatie',
        description: 'Vervangen frontjes/blad/apparatuur',
        slug: 'keuken-renovatie',
        measurementLabel: 'Keuken',
        measurements: COUNT_FIELDS,
        materialSections: KEUKEN_RENOVATIE_MATS,
        categoryConfig: {
          basis: { title: 'Fronten & Zichtwerk', order: 1 },
          werkblad: { title: 'Werkblad & Apparatuur', order: 2 },
          beslag: { title: 'Luxe Beslag & Hardware', order: 3 },
        },
      },
    ]
  },

  //#endregion

  //#region --- DAKRAMEN ---
  dakramen: {
    title: 'Dakramen / Lichtkoepel',
    searchPlaceholder: 'Zoek dakraamklus...',
    items: [
      {
        title: 'Velux Dakraam',
        description: 'Plaatsen of vervangen',
        slug: 'velux-dakraam',
        measurementLabel: 'Dakraam',
        measurements: COUNT_FIELDS,
        materialSections: VELUX_MATS,
        categoryConfig: {
          vensterset: { title: 'Dakraam Set', order: 1 },
          venster: { title: 'Dakraam', order: 1 },
          gootstuk: { title: 'Gootstukken', order: 2 },
          afwerking: { title: 'Aftimmering', order: 3 },
        },
      },
      {
        title: 'Lichtkoepel',
        description: 'Voor plat dak',
        slug: 'lichtkoepel',
        measurementLabel: 'Koepel',
        measurements: COUNT_FIELDS,
        materialSections: LICHTKOEPEL_MATS,
        categoryConfig: {
          koepel: { title: 'Koepel', order: 1 },
          opstand: { title: 'Opstand', order: 2 },
          afwerking: { title: 'Dakafwerking', order: 3 },
        },
      }
    ]
  },

  //#endregion

  overige: {
    title: 'Overige werkzaamheden',
    searchPlaceholder: 'Zoek werkzaamheden...',
    items: [
      { title: 'Timmerwerk Algemeen', description: 'Diverse klussen', slug: 'timmerwerk-algemeen', measurementLabel: 'Klus', measurements: AREA_FIELDS, materialSections: [] },
    ],
  },
};