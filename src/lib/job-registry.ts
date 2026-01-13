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
  { key: 'staanders_en_liggers', label: 'Staanders & Liggers', categoryFilter: 'Balkhout', category: 'hout' },
  { key: 'ventilatie_latten', label: 'Tengelwerk / Rachels', categoryFilter: 'Balkhout', category: 'hout' },

  // 2. ISOLATIE & FOLIES
  { key: 'folie_buiten', label: 'Folies', categoryFilter: 'Folies', category: 'isolatie' },
  { key: 'isolatie_basis', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie' },

  // 3. BEPLATING
  { key: 'constructieplaat', label: 'Constructieplaat', categoryFilter: 'Plaatmateriaal', category: 'beplating' },
  { key: 'beplating', label: 'Afwerkplaat', categoryFilter: 'Plaatmateriaal', category: 'beplating' },

 // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
 { key: 'koof_regelwerk', label: 'Regelwerk', categoryFilter: 'Balkhout', category: 'Koof' },
 { key: 'koof_beplating', label: 'Beplating', categoryFilter: 'Plaatmateriaal', category: 'Koof' },
 { key: 'koof_isolatie', label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof' }, // Often needed for drain pipes

  // 4. AFWERKEN (TIMMERWERK)
  // These are the wooden finishes the carpenter installs
  { key: 'dagkanten', label: 'Dagkanten', categoryFilter: 'Plaatmateriaal', category: 'afwerking' },
  { key: 'vensterbanken', label: 'Vensterbanken', categoryFilter: 'Vensterbanken', category: 'afwerking' },
  { key: 'plinten_vloer', label: 'Vloerplinten', categoryFilter: 'Plinten', category: 'afwerking' },
  { key: 'plinten_plafond', label: 'Plafondplinten', categoryFilter: 'Plinten', category: 'afwerking' },

  { key: 'kabelkanaal', label: 'Elektra Buizen / Flex', categoryFilter: 'Elektra', category: 'Installatie' },
  // The blue boxes that clamp into the hollow wall (ESSENTIAL)
  { key: 'hollewanddozen', label: 'Hollewanddozen', categoryFilter: 'Elektra', category: 'Installatie' },
  // The actual wire to bring power from the nearest point
  { key: 'elektrakabel', label: 'Installatiekabel', categoryFilter: 'Elektra', category: 'Installatie' },
  // The visible finish: Sockets for TV/Haard and Switches for LEDs
  { key: 'schakelmateriaal_basis', label: 'Stopcontacten & Schakelaars', categoryFilter: 'Schakelmateriaal', category: 'Installatie' },
  
  // 5. AFWERKEN (GIPS & WAND)
  // This is the new section for smoothing the wall
  { key: 'hoekafwerking', label: 'Hoekprofielen', categoryFilter: 'Profielen', category: 'gips_afwerking' },
  { key: 'gips_vuller', label: 'Voegenmiddel', categoryFilter: 'Afwerking', category: 'gips_afwerking' },
  { key: 'gips_finish', label: 'Finish Pasta', categoryFilter: 'Afwerking', category: 'gips_afwerking' },

  // 6. KOZIJNEN
  { key: 'kozijn_element', label: 'Kozijnen', categoryFilter: 'Kozijnen', category: 'Kozijnen' },
  { key: 'glas_roosters', label: 'Glas & Roosters', categoryFilter: 'Glas_of_roosters', category: 'Kozijnen' },

  // 7. DEUREN & BESLAG
  { key: 'deur_blad', label: 'Binnendeuren', categoryFilter: 'Deuren', category: 'Deuren' },
  { key: 'deur_scharnieren', label: 'Scharnieren', categoryFilter: 'Ijzerwaren', category: 'Deuren' },
  { key: 'deur_sloten', label: 'Sloten', categoryFilter: 'Ijzerwaren', category: 'Deuren' },
  { key: 'deur_krukken', label: 'Deurbeslag', categoryFilter: 'Ijzerwaren', category: 'Deuren' },
  { key: 'deur_rooster', label: 'Deurroosters', categoryFilter: 'Ventilatie', category: 'Deuren' },
];

const METALSTUD_VOORZETWAND_BINNEN_MATS: MaterialSection[] = [
  // 1. METAAL & CONSTRUCTIE
  // SPLIT: Now the user picks the Floor/Ceiling track...
  { key: 'ms_liggers', label: 'Liggers (U-profielen)', categoryFilter: 'Metalstud', category: 'metaal' },
  // ...and then picks the Vertical Studs separately.
  { key: 'ms_staanders', label: 'Staanders (C-profielen)', categoryFilter: 'Metalstud', category: 'metaal' },
  
  // Don't forget the UA (Door reinforcement)
  { key: 'ms_ua_profiel', label: 'Verstevigingsprofielen (UA)', categoryFilter: 'Metalstud', category: 'metaal' },

  // 2. ISOLATIE & FOLIES
  { key: 'folie_buiten', label: 'Folies', categoryFilter: 'Folies', category: 'isolatie' },
  { key: 'isolatie_basis', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie' },

  // 3. BEPLATING
  { key: 'constructieplaat', label: 'Constructieplaat', categoryFilter: 'Plaatmateriaal', category: 'beplating' },
  { key: 'beplating', label: 'Afwerkplaat', categoryFilter: 'Plaatmateriaal', category: 'beplating' },

  { key: 'kabelkanaal', label: 'Elektra Buizen / Flex', categoryFilter: 'Elektra', category: 'Installatie' },
  // The blue boxes that clamp into the hollow wall (ESSENTIAL)
  { key: 'hollewanddozen', label: 'Hollewanddozen', categoryFilter: 'Elektra', category: 'Installatie' },
  // The actual wire to bring power from the nearest point
  { key: 'elektrakabel', label: 'Installatiekabel', categoryFilter: 'Elektra', category: 'Installatie' },
  // The visible finish: Sockets for TV/Haard and Switches for LEDs
  { key: 'schakelmateriaal_basis', label: 'Stopcontacten & Schakelaars', categoryFilter: 'Schakelmateriaal', category: 'Schakelmateriaal' },
  
   // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
   { key: 'koof_regelwerk', label: 'Regelwerk', categoryFilter: 'Balkhout', category: 'Koof' },
   { key: 'koof_beplating', label: 'Beplating', categoryFilter: 'Plaatmateriaal', category: 'Koof' },
   { key: 'koof_isolatie', label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof' }, // Often needed for drain pipes
 
  // 4. AFWERKEN (TIMMERWERK)
  { key: 'dagkanten', label: 'Dagkanten', categoryFilter: 'Plaatmateriaal', category: 'afwerking' },
  { key: 'vensterbanken', label: 'Vensterbanken', categoryFilter: 'Vensterbanken', category: 'afwerking' },
  { key: 'plinten_vloer', label: 'Vloerplinten', categoryFilter: 'Plinten', category: 'afwerking' },
  { key: 'plinten_plafond', label: 'Plafondplinten', categoryFilter: 'Plinten', category: 'afwerking' },

  // 5. AFWERKEN (GIPS / STUC)
  { key: 'hoekafwerking', label: 'Hoekprofielen', categoryFilter: 'Profielen', category: 'gips_afwerking' },
  { key: 'gips_wapening', label: 'Wapeningsband', categoryFilter: 'Afwerking', category: 'gips_afwerking' },
  { key: 'gips_vuller', label: 'Voegenmiddel', categoryFilter: 'Afwerking', category: 'gips_afwerking' },
  { key: 'gips_finish', label: 'Finish Pasta', categoryFilter: 'Afwerking', category: 'gips_afwerking' },

  // 6. KOZIJNEN
  { key: 'kozijn_element', label: 'Raamkozijnen', categoryFilter: 'Kozijnen', category: 'Kozijnen' },
  { key: 'deur_kozijn', label: 'Deurkozijnen', categoryFilter: 'Kozijnen', category: 'Kozijnen' },
  { key: 'glas_roosters', label: 'Glas & Roosters', categoryFilter: 'Glas_of_roosters', category: 'Kozijnen' },

  // 7. DEUREN & BESLAG
  { key: 'deur_blad', label: 'Binnendeuren', categoryFilter: 'Deuren', category: 'Deuren' },
  { key: 'deur_scharnieren', label: 'Scharnieren', categoryFilter: 'Ijzerwaren', category: 'Deuren' },
  { key: 'deur_sloten', label: 'Sloten', categoryFilter: 'Ijzerwaren', category: 'Deuren' },
  { key: 'deur_krukken', label: 'Deurbeslag', categoryFilter: 'Ijzerwaren', category: 'Deuren' },
  { key: 'deur_rooster', label: 'Deurroosters', categoryFilter: 'Ventilatie', category: 'Deuren' },
];



const HSB_TUSSENWAND_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE
  { key: 'staanders_en_liggers', label: 'Staanders & Liggers', categoryFilter: 'Balkhout', category: 'hout' },

  // 2. ISOLATIE & FOLIES
  { key: 'isolatie_basis', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie' },
  { key: 'folie_buiten', label: 'Folies', categoryFilter: 'Folies', category: 'isolatie' },

  // 3. BEPLATING (ZIJDE 1)
  { key: 'constructieplaat_1', label: 'Constructieplaat (Zijde 1)', categoryFilter: 'Plaatmateriaal', category: 'beplating' },
  { key: 'constructieplaat_2', label: 'Constructieplaat (Zijde 2)', categoryFilter: 'Plaatmateriaal', category: 'beplating' },
  { key: 'beplating_1', label: 'Afwerkplaat (Zijde 1)', categoryFilter: 'Plaatmateriaal', category: 'beplating' },
  { key: 'beplating_2', label: 'Afwerkplaat (Zijde 2)', categoryFilter: 'Plaatmateriaal', category: 'beplating' },

  // 4. AFWERKEN (TIMMERWERK)
  { key: 'dagkanten', label: 'Dagkanten', categoryFilter: 'Plaatmateriaal', category: 'afwerking' },
  { key: 'vensterbanken', label: 'Vensterbanken', categoryFilter: 'Vensterbanken', category: 'afwerking' },
  { key: 'plinten_vloer', label: 'Vloerplinten', categoryFilter: 'Plinten', category: 'afwerking' },
  { key: 'plinten_plafond', label: 'Plafondplinten', categoryFilter: 'Plinten', category: 'afwerking' },

   // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
   { key: 'koof_regelwerk', label: 'Regelwerk', categoryFilter: 'Balkhout', category: 'Koof' },
   { key: 'koof_beplating', label: 'Beplating', categoryFilter: 'Plaatmateriaal', category: 'Koof' },
   { key: 'koof_isolatie', label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof' }, // Often needed for drain pipes

  
  { key: 'kabelkanaal', label: 'Elektra Buizen / Flex', categoryFilter: 'Elektra', category: 'Installatie' },
  // The blue boxes that clamp into the hollow wall (ESSENTIAL)
  { key: 'hollewanddozen', label: 'Hollewanddozen', categoryFilter: 'Elektra', category: 'Installatie' },
  // The actual wire to bring power from the nearest point
  { key: 'elektrakabel', label: 'Installatiekabel', categoryFilter: 'Elektra', category: 'Installatie' },
  // The visible finish: Sockets for TV/Haard and Switches for LEDs
  { key: 'schakelmateriaal_basis', label: 'Stopcontacten & Schakelaars', categoryFilter: 'Schakelmateriaal', category: 'Schakelmateriaal' },
  
  // 5. AFWERKEN (GIPS & WAND)
  { key: 'hoekafwerking', label: 'Hoekprofielen', categoryFilter: 'Profielen', category: 'gips_afwerking' },
  { key: 'gips_vuller', label: 'Voegenmiddel', categoryFilter: 'Afwerking', category: 'gips_afwerking' },
  { key: 'gips_finish', label: 'Finish Pasta', categoryFilter: 'Afwerking', category: 'gips_afwerking' },

  // 6. KOZIJNEN
  { key: 'kozijn_element', label: 'Kozijnen', categoryFilter: 'Kozijnen', category: 'Kozijnen' },
  { key: 'glas_roosters', label: 'Glas & Roosters', categoryFilter: 'Glas_of_roosters', category: 'Kozijnen' },

  // 7. DEUREN & BESLAG
  { key: 'deur_blad', label: 'Binnendeuren', categoryFilter: 'Deuren', category: 'Deuren' },
  { key: 'deur_scharnieren', label: 'Scharnieren', categoryFilter: 'Ijzerwaren', category: 'Deuren' },
  { key: 'deur_sloten', label: 'Sloten', categoryFilter: 'Ijzerwaren', category: 'Deuren' },
  { key: 'deur_krukken', label: 'Deurbeslag', categoryFilter: 'Ijzerwaren', category: 'Deuren' },
  { key: 'deur_rooster', label: 'Deurroosters', categoryFilter: 'Ventilatie', category: 'Deuren' },
];



const METALSTUD_TUSSENWAND_MATS: MaterialSection[] = [
  // 1. METAAL & CONSTRUCTIE
  { key: 'ms_liggers', label: 'Liggers (U-profielen)', categoryFilter: 'Metalstud', category: 'metaal' },
  { key: 'ms_staanders', label: 'Staanders (C-profielen)', categoryFilter: 'Metalstud', category: 'metaal' },
  { key: 'ms_ua_profiel', label: 'Verstevigingsprofielen (UA)', categoryFilter: 'Metalstud', category: 'metaal' },

  // 2. ISOLATIE & FOLIES
  // Folies are optional for partitions (bathroom side), but kept for consistency
  { key: 'folie_buiten', label: 'Folies', categoryFilter: 'Folies', category: 'isolatie' },
  { key: 'isolatie_basis', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie' },

  // 3. BEPLATING (ZIJDE 1)
  { key: 'constructieplaat_1', label: 'Constructieplaat (Zijde 1)', categoryFilter: 'Plaatmateriaal', category: 'beplating' },
  { key: 'constructieplaat_2', label: 'Constructieplaat (Zijde 2)', categoryFilter: 'Plaatmateriaal', category: 'beplating' },
  { key: 'beplating_1', label: 'Afwerkplaat (Zijde 1)', categoryFilter: 'Plaatmateriaal', category: 'beplating' },
  { key: 'beplating_2', label: 'Afwerkplaat (Zijde 2)', categoryFilter: 'Plaatmateriaal', category: 'beplating' },

  // 4. AFWERKEN (TIMMERWERK)
  { key: 'dagkanten', label: 'Dagkanten', categoryFilter: 'Plaatmateriaal', category: 'afwerking' },
  { key: 'vensterbanken', label: 'Vensterbanken', categoryFilter: 'Vensterbanken', category: 'afwerking' },
  { key: 'plinten_vloer', label: 'Vloerplinten', categoryFilter: 'Plinten', category: 'afwerking' },
  { key: 'plinten_plafond', label: 'Plafondplinten', categoryFilter: 'Plinten', category: 'afwerking' },

  
   // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
   { key: 'koof_regelwerk', label: 'Regelwerk', categoryFilter: 'Balkhout', category: 'Koof' },
   { key: 'koof_beplating', label: 'Beplating', categoryFilter: 'Plaatmateriaal', category: 'Koof' },
   { key: 'koof_isolatie', label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof' }, // Often needed for drain pipes

   
  { key: 'kabelkanaal', label: 'Elektra Buizen / Flex', categoryFilter: 'Elektra', category: 'Installatie' },
  // The blue boxes that clamp into the hollow wall (ESSENTIAL)
  { key: 'hollewanddozen', label: 'Hollewanddozen', categoryFilter: 'Elektra', category: 'Installatie' },
  // The actual wire to bring power from the nearest point
  { key: 'elektrakabel', label: 'Installatiekabel', categoryFilter: 'Elektra', category: 'Installatie' },
  // The visible finish: Sockets for TV/Haard and Switches for LEDs
  { key: 'schakelmateriaal_basis', label: 'Stopcontacten & Schakelaars', categoryFilter: 'Schakelmateriaal', category: 'Schakelmateriaal' },
  
  // 5. NADEN & STUCWERK
  { key: 'hoekafwerking', label: 'Hoekprofielen', categoryFilter: 'Profielen', category: 'gips_afwerking' },
  { key: 'gips_wapening', label: 'Wapeningsband', categoryFilter: 'Afwerking', category: 'gips_afwerking' },
  { key: 'gips_vuller', label: 'Voegenmiddel', categoryFilter: 'Afwerking', category: 'gips_afwerking' },
  { key: 'gips_finish', label: 'Finish Pasta', categoryFilter: 'Afwerking', category: 'gips_afwerking' },

  // 6. KOZIJNEN
  { key: 'kozijn_element', label: 'Raamkozijnen', categoryFilter: 'Kozijnen', category: 'Kozijnen' },
  { key: 'glas_roosters', label: 'Glas & Roosters', categoryFilter: 'Glas_of_roosters', category: 'Kozijnen' },

  // 7. DEUREN & BESLAG
  { key: 'deur_blad', label: 'Binnendeuren', categoryFilter: 'Deuren', category: 'Deuren' },
  { key: 'deur_scharnieren', label: 'Scharnieren', categoryFilter: 'Ijzerwaren', category: 'Deuren' },
  { key: 'deur_sloten', label: 'Sloten', categoryFilter: 'Ijzerwaren', category: 'Deuren' },
  { key: 'deur_krukken', label: 'Deurbeslag', categoryFilter: 'Ijzerwaren', category: 'Deuren' },
  { key: 'deur_rooster', label: 'Deurroosters', categoryFilter: 'Ventilatie', category: 'Deuren' },
];



const HSB_BUITENWAND_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE
  // Main structural skeleton
  { key: 'regelwerk_hoofd', label: 'Staanders & Liggers', categoryFilter: 'Balkhout', category: 'hout' },
  // Service cavity (leidingspouw) - distinct from main frame
  { key: 'regelwerk_inst', label: 'Regelwerk (Leidingspouw)', categoryFilter: 'Balkhout', category: 'hout' },
  // Exterior ventilation strips
  { key: 'regelwerk_vent', label: 'Ventilatielatten', categoryFilter: 'Balkhout', category: 'hout' },

  // 2. ISOLATIE & FOLIES
  { key: 'folie_buiten', label: 'Folie Buiten', categoryFilter: 'Folies', category: 'isolatie' },
  { key: 'folie_binnen', label: 'Folie Binnen', categoryFilter: 'Folies', category: 'isolatie' },
  { key: 'isolatie_hoofd', label: 'Isolatiemateriaal (Constructie)', categoryFilter: 'Isolatie', category: 'isolatie' },
  { key: 'isolatie_inst', label: 'Isolatiemateriaal (Leidingspouw)', categoryFilter: 'Isolatie', category: 'isolatie' },

  // 3. BEPLATING (BINNEN & BUITEN)
  { key: 'gevelbekleding', label: 'Gevelbekleding', categoryFilter: 'Gevelbekleding', category: 'beplating' }, 
  { key: 'plaat_buiten', label: 'Constructieplaat (Buiten)', categoryFilter: 'Plaatmateriaal', category: 'beplating' },
  { key: 'osb_binnen', label: 'Constructieplaat (Binnen)', categoryFilter: 'Plaatmateriaal', category: 'beplating' },
  { key: 'gips_binnen', label: 'Afwerkplaat', categoryFilter: 'Plaatmateriaal', category: 'beplating' },

  // 4. AFWERKEN (TIMMERWERK - BINNEN)
  { key: 'dagkant_binnen', label: 'Dagkanten (Binnen)', categoryFilter: 'Plaatmateriaal', category: 'afwerking_binnen' },
  { key: 'vensterbank', label: 'Vensterbanken', categoryFilter: 'Vensterbanken', category: 'afwerking_binnen' },
  { key: 'plinten', label: 'Vloerplinten', categoryFilter: 'Plinten', category: 'afwerking_binnen' },

  // 5. AFWERKEN (BUITEN)
  { key: 'waterslag', label: 'Waterslagen', categoryFilter: 'Profielen', category: 'afwerking_buiten' },
  { key: 'dagkant_buiten', label: 'Dagkanten (Buiten)', categoryFilter: 'Gevelbekleding', category: 'afwerking_buiten' },
  { key: 'hoek_buiten', label: 'Gevelhoeken', categoryFilter: 'Tuinhout', category: 'afwerking_buiten' },

  // 6. AFWERKEN (GIPS & WAND)
  // Standard interior finish like the other walls
  { key: 'hoekafwerking', label: 'Hoekprofielen', categoryFilter: 'Profielen', category: 'gips_afwerking' },
  { key: 'gips_vuller', label: 'Voegenmiddel', categoryFilter: 'Afwerking', category: 'gips_afwerking' },
  { key: 'gips_finish', label: 'Finish Pasta', categoryFilter: 'Afwerking', category: 'gips_afwerking' },

  // 7. KOZIJNEN
  { key: 'stelkozijn', label: 'Stelkozijnen', categoryFilter: 'Plaatmateriaal', category: 'Kozijnen' },
  { key: 'kozijn_element', label: 'Raamkozijnen', categoryFilter: 'Kozijnen', category: 'Kozijnen' },
  { key: 'deur_kozijn', label: 'Deurkozijnen', categoryFilter: 'Kozijnen', category: 'Kozijnen' },
  { key: 'glas_roosters', label: 'Glas & Roosters', categoryFilter: 'Glas_of_roosters', category: 'Kozijnen' },

  // 8. DEUREN & BESLAG
  { key: 'deur_blad', label: 'Buitendeuren', categoryFilter: 'Deuren', category: 'Deuren' },
  { key: 'deur_scharnieren', label: 'Scharnieren', categoryFilter: 'Ijzerwaren', category: 'Deuren' },
  { key: 'deur_sloten', label: 'Sloten', categoryFilter: 'Ijzerwaren', category: 'Deuren' },
  { key: 'deur_krukken', label: 'Deurbeslag', categoryFilter: 'Ijzerwaren', category: 'Deuren' },
];



const CINEWALL_TV_WAND_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE (FRAMEWERK)
  { key: 'staanders_en_liggers', label: 'Staanders & Liggers', categoryFilter: 'Balkhout', category: 'hout' },
  { key: 'regelwerk_nissen', label: 'Regelwerk (Nissen & Details)', categoryFilter: 'Balkhout', category: 'hout' },
  { key: 'achterhout', label: 'Achterhout (TV-ophanging)', categoryFilter: 'Balkhout', category: 'hout' },

// 2. INSTALLATIE & ELEKTRA (Expanded)
  // The tunnel for HDMI cables
  { key: 'kabelkanaal', label: 'Elektra Buizen / Flex', categoryFilter: 'Elektra', category: 'Installatie' },
  // The blue boxes that clamp into the hollow wall (ESSENTIAL)
  { key: 'hollewanddozen', label: 'Hollewanddozen', categoryFilter: 'Elektra', category: 'Installatie' },
  // The actual wire to bring power from the nearest point
  { key: 'elektrakabel', label: 'Installatiekabel', categoryFilter: 'Elektra', category: 'Installatie' },
  // The visible finish: Sockets for TV/Haard and Switches for LEDs
  { key: 'schakelmateriaal_basis', label: 'Stopcontacten & Schakelaars', categoryFilter: 'Schakelmateriaal', category: 'Schakelmateriaal' },
  
  // 3. ISOLATIE & FOLIES
  { key: 'folie_buiten', label: 'Folies', categoryFilter: 'Folies', category: 'isolatie' },
  { key: 'isolatie_basis', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie' },

   // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
   { key: 'koof_regelwerk', label: 'Regelwerk', categoryFilter: 'Balkhout', category: 'Koof' },
   { key: 'koof_beplating', label: 'Beplating', categoryFilter: 'Plaatmateriaal', category: 'Koof' },
   { key: 'koof_isolatie', label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof' }, // Often needed for drain pipes

   
  // 4. BEPLATING
  { key: 'constructieplaat', label: 'Constructieplaat', categoryFilter: 'Plaatmateriaal', category: 'beplating' },
  { key: 'beplating', label: 'Afwerkplaat', categoryFilter: 'Plaatmateriaal', category: 'beplating' },
  { key: 'akoestische_panelen', label: 'Akoestische Panelen', categoryFilter: 'Wandbekleding', category: 'beplating' },

  // 5. AFWERKEN (TIMMERWERK)
  { key: 'dagkanten', label: 'Dagkanten', categoryFilter: 'Plaatmateriaal', category: 'afwerking' },
  { key: 'plinten_vloer', label: 'Vloerplinten', categoryFilter: 'Plinten', category: 'afwerking' },
  { key: 'plinten_plafond', label: 'Plafondplinten', categoryFilter: 'Plinten', category: 'afwerking' },

  // 6. NADEN & STUCWERK
  { key: 'hoekafwerking', label: 'Hoekprofielen', categoryFilter: 'Profielen', category: 'gips_afwerking' },
  { key: 'gips_vuller', label: 'Voegenmiddel', categoryFilter: 'Afwerking', category: 'gips_afwerking' },
  { key: 'gips_finish', label: 'Finish Pasta', categoryFilter: 'Afwerking', category: 'gips_afwerking' },

  // 7. CINEWALL ELEMENTEN (The "Fancy Stuff")
  { key: 'sfeerhaard', label: 'Inbouw Sfeerhaard', categoryFilter: 'Haarden', category: 'Cinewall' },
  { key: 'tv_beugel', label: 'TV-Beugel', categoryFilter: 'Beugels', category: 'Cinewall' },
  { key: 'led_strips', label: 'LED-Verlichting', categoryFilter: 'Verlichting', category: 'Cinewall' },
];



const KNIESCHOTTEN_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE
  { key: 'staanders_en_liggers', label: 'Staanders & Liggers', categoryFilter: 'Balkhout', category: 'hout' },

  // 2. ISOLATIE & FOLIES
  // Consistent labels with HSB Tussenwand
  { key: 'folie_buiten', label: 'Folies', categoryFilter: 'Folies', category: 'isolatie' },
  { key: 'isolatie_basis', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie' },

  // 3. BEPLATING
  // For the fixed parts of the knee wall
  { key: 'constructieplaat', label: 'Constructieplaat', categoryFilter: 'Plaatmateriaal', category: 'beplating' },
  { key: 'beplating', label: 'Afwerkplaat', categoryFilter: 'Plaatmateriaal', category: 'beplating' },

  // 4. AFWERKEN (TIMMERWERK)
  { key: 'plinten_vloer', label: 'Vloerplinten', categoryFilter: 'Plinten', category: 'afwerking' },
  // SPECIFIC: The finishing strip against the slanted roof
  { key: 'afwerklatten', label: 'Plafondplinten', categoryFilter: 'Plinten', category: 'afwerking' },

   // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
   { key: 'koof_regelwerk', label: 'Regelwerk', categoryFilter: 'Balkhout', category: 'Koof' },
   { key: 'koof_beplating', label: 'Beplating', categoryFilter: 'Plaatmateriaal', category: 'Koof' },
   { key: 'koof_isolatie', label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof' }, // Often needed for drain pipes
 
  { key: 'kabelkanaal', label: 'Elektra Buizen / Flex', categoryFilter: 'Elektra', category: 'Installatie' },
  // The blue boxes that clamp into the hollow wall (ESSENTIAL)
  { key: 'hollewanddozen', label: 'Hollewanddozen', categoryFilter: 'Elektra', category: 'Installatie' },
  // The actual wire to bring power from the nearest point
  { key: 'elektrakabel', label: 'Installatiekabel', categoryFilter: 'Elektra', category: 'Installatie' },
  // The visible finish: Sockets for TV/Haard and Switches for LEDs
  { key: 'schakelmateriaal_basis', label: 'Stopcontacten & Schakelaars', categoryFilter: 'Schakelmateriaal', category: 'Schakelmateriaal' },
  
  // 5. AFWERKEN (GIPS & WAND)
  // Included for consistency if the user builds a fixed gypsum knee wall
  { key: 'hoekafwerking', label: 'Hoekprofielen', categoryFilter: 'Profielen', category: 'gips_afwerking' },
  { key: 'gips_vuller', label: 'Voegenmiddel', categoryFilter: 'Afwerking', category: 'gips_afwerking' },
  { key: 'gips_finish', label: 'Finish Pasta', categoryFilter: 'Afwerking', category: 'gips_afwerking' },

  // 6. SCHUIFWANDEN (Replaces Standard Doors)
  // These keys fit into your existing 'Deuren' category
  { key: 'schuifdeur_rails', label: 'Schuifdeurrails', categoryFilter: 'Ijzerwaren', category: 'Schuifdeuren' },
  { key: 'schuifdeur_paneel', label: 'Schuifdeurpanelen', categoryFilter: 'Plaatmateriaal', category: 'Schuifdeuren' },
  { key: 'schuifdeur_greep', label: 'Komgrepen', categoryFilter: 'Ijzerwaren', category: 'Schuifdeuren' },
];



const OVERIG_WANDEN_MATS: MaterialSection[] = [
  { key: 'constructie', label: 'Constructiemateriaal', categoryFilter: 'Balkhout' },
  { key: 'isolatie', label: 'Isolatie', categoryFilter: 'Isolatie' },
  { key: 'beplating', label: 'Beplating', categoryFilter: 'Plaatmateriaal' },
  { key: 'beschermlagen', label: 'Beschermlagen', categoryFilter: 'Verf' },
  { key: 'bevestiging', label: 'Bevestigingsmateriaal', categoryFilter: 'Bevestiging' },
  { key: 'afwerking', label: 'Afwerkingsmateriaal', categoryFilter: 'Afwerking' },
];

// #endregion

//#region ========================================== MATERIAL SECTIONS - PLAFONDS XXX==========================================

const PLAFOND_HOUT_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE (FRAMEWERK)
  { key: 'randhout', label: 'Randhout', categoryFilter: 'Balkhout', category: 'hout' },
  { key: 'stroken', label: 'Stelhout', categoryFilter: 'Balkhout', category: 'hout' },
  { key: 'rachels', label: 'Rachelwerk', categoryFilter: 'Balkhout', category: 'hout' },

  // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
  { key: 'koof_regelwerk', label: 'Regelwerk', categoryFilter: 'Balkhout', category: 'Koof' },
  { key: 'koof_beplating', label: 'Beplating', categoryFilter: 'Plaatmateriaal', category: 'Koof' },
  { key: 'koof_isolatie', label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof' }, // Often needed for drain pipes

  // 3. GORDIJNKOF (Specifiek voor gordijnen)
  { key: 'gordijn_regelwerk', label: 'Regelwerk', categoryFilter: 'Balkhout', category: 'Gordijnkoof' },
  { key: 'gordijn_beplating', label: 'Beplating', categoryFilter: 'Plaatmateriaal', category: 'Gordijnkoof' },
  { key: 'gordijn_achterhout', label: 'Achterhout', categoryFilter: 'Balkhout', category: 'Gordijnkoof' }, // Crucial for heavy curtains

  // 4. ELEKTRA (RUWBOUW)
  { key: 'kabelkanaal', label: 'Elektra Buizen / Flex', categoryFilter: 'Elektra', category: 'Installatie' },
  { key: 'centraaldoos', label: 'Centraaldozen', categoryFilter: 'Elektra', category: 'Installatie' },
  { key: 'elektrakabel', label: 'Installatiekabel', categoryFilter: 'Elektra', category: 'Installatie' },

  // 5. VERLICHTING & SCHAKELMATERIAAL (COUNTERS)
  { key: 'inbouwspots', label: 'Inbouwspots', categoryFilter: 'Verlichting', category: 'Schakelmateriaal' },
  { key: 'schakelaar_element', label: 'Schakelaar / Dimmer', categoryFilter: 'Schakelmateriaal', category: 'Schakelmateriaal' },

  // 6. ISOLATIE & FOLIES
  { key: 'folie_buiten', label: 'Folies', categoryFilter: 'Folies', category: 'isolatie' },
  { key: 'isolatie_basis', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie' },

  // 7. BEPLATING
  { key: 'constructieplaat', label: 'Constructieplaat', categoryFilter: 'Plaatmateriaal', category: 'beplating' },
  { key: 'beplating', label: 'Afwerkplaat', categoryFilter: 'Plaatmateriaal', category: 'beplating' },

  // 8. AFWERKEN (TIMMERWERK)
  { key: 'plinten_plafond', label: 'Plafondplinten', categoryFilter: 'Lijstwerk', category: 'afwerking' },
 
  // 14. VLIZOTRAP
  { key: 'vlizotrap_unit', label: 'Luik / Vlizotrap', categoryFilter: 'Luiken', category: 'Toegang' },
  { key: 'luik_afwerking', label: 'Koplatten', categoryFilter: 'Lijstwerk', category: 'Toegang' },

  // 9. NADEN & STUCWERK
  { key: 'gips_vuller', label: 'Voegenmiddel', categoryFilter: 'Afwerking', category: 'gips_afwerking' },
  { key: 'gips_finish', label: 'Finish Pasta', categoryFilter: 'Afwerking', category: 'gips_afwerking' },
  { key: 'gips_wapening', label: 'Wapeningsband', categoryFilter: 'Afwerking', category: 'gips_afwerking' },
];



const PLAFOND_METALSTUD_MATS: MaterialSection[] = [
  // 1. METAAL & CONSTRUCTIE (FRAMEWERK)
  { key: 'randprofielen', label: 'Randprofielen', categoryFilter: 'Metalstud', category: 'metaal' },
  { key: 'draagprofielen', label: 'Draagprofielen', categoryFilter: 'Metalstud', category: 'metaal' },

  // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
  { key: 'koof_regelwerk', label: 'Regelwerk', categoryFilter: 'Balkhout', category: 'Koof' },
  { key: 'koof_beplating', label: 'Beplating', categoryFilter: 'Plaatmateriaal', category: 'Koof' },
  { key: 'koof_isolatie', label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof' },

  // 3. GORDIJNKOOF (Specifiek voor gordijnen)
  { key: 'gordijn_regelwerk', label: 'Regelwerk', categoryFilter: 'Balkhout', category: 'Gordijnkoof' },
  { key: 'gordijn_beplating', label: 'Beplating', categoryFilter: 'Plaatmateriaal', category: 'Gordijnkoof' },
  { key: 'gordijn_achterhout', label: 'Achterhout', categoryFilter: 'Balkhout', category: 'Gordijnkoof' },

  // 4. ELEKTRA (RUWBOUW)
  { key: 'kabelkanaal', label: 'Elektra Buizen / Flex', categoryFilter: 'Elektra', category: 'Installatie' },
  { key: 'centraaldoos', label: 'Centraaldozen', categoryFilter: 'Elektra', category: 'Installatie' },
  { key: 'elektrakabel', label: 'Installatiekabel', categoryFilter: 'Elektra', category: 'Installatie' },

  // 5. VERLICHTING & SCHAKELMATERIAAL (COUNTERS)
  { key: 'inbouwspots', label: 'Inbouwspots', categoryFilter: 'Verlichting', category: 'Schakelmateriaal' },
  { key: 'schakelaar_element', label: 'Schakelaar / Dimmer', categoryFilter: 'Schakelmateriaal', category: 'Schakelmateriaal' },

  // 6. ISOLATIE & FOLIES
  { key: 'folie_buiten', label: 'Folies', categoryFilter: 'Folies', category: 'isolatie' },
  { key: 'isolatie_basis', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie' },

  // 7. BEPLATING
  { key: 'constructieplaat', label: 'Constructieplaat', categoryFilter: 'Plaatmateriaal', category: 'beplating' },
  { key: 'beplating', label: 'Afwerkplaat', categoryFilter: 'Plaatmateriaal', category: 'beplating' },

  // 8. AFWERKEN (TIMMERWERK)
  { key: 'plinten_plafond', label: 'Plafondplinten', categoryFilter: 'Lijstwerk', category: 'afwerking' },

  // 14. VLIZOTRAP
  { key: 'vlizotrap_unit', label: 'Luik / Vlizotrap', categoryFilter: 'Luiken', category: 'Toegang' },
  { key: 'luik_afwerking', label: 'Koplatten', categoryFilter: 'Lijstwerk', category: 'Toegang' },

  // 9. NADEN & STUCWERK
  { key: 'gips_vuller', label: 'Voegenmiddel', categoryFilter: 'Afwerking', category: 'gips_afwerking' },
  { key: 'gips_finish', label: 'Finish Pasta', categoryFilter: 'Afwerking', category: 'gips_afwerking' },
  { key: 'gips_wapening', label: 'Wapeningsband', categoryFilter: 'Afwerking', category: 'gips_afwerking' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - VLOEREN XXX==========================================

const MASSIEF_HOUTEN_VLOER_FINISH_MATS: MaterialSection[] = [
  // 1. VOORBEREIDING & ONDERVLOER
  { key: 'primer', label: 'Primer', categoryFilter: 'Lijmen', category: 'Vloer_Voorbereiding' },
  { key: 'ondervloer', label: 'Ondervloer', categoryFilter: 'Plaatmateriaal', category: 'Vloer_Voorbereiding' },
  { key: 'egaline', label: 'Egaline', categoryFilter: 'Mortels', category: 'Vloer_Voorbereiding' },

  // 2. VLOERDELEN & PLAATSING
  { key: 'vloerdelen', label: 'Houten vloerplanken', categoryFilter: 'Vloerdelen', category: 'Vloer_Hout' },
  { key: 'parketlijm', label: 'Parketlijm', categoryFilter: 'Lijmen', category: 'Vloer_Hout' },

  // 3. AFWERKING & BEHANDELING
  { key: 'plinten', label: 'Plinten', categoryFilter: 'Plinten', category: 'Vloer_Afwerking' },
  { key: 'deklatten', label: 'Deklatten', categoryFilter: 'Afwerking', category: 'Vloer_Afwerking' },
  { key: 'dorpels', label: 'Overgangsprofielen / Dorpels', categoryFilter: 'Profielen', category: 'Vloer_Afwerking' },
  { key: 'vloerolie', label: 'Vloerolie', categoryFilter: 'Verf', category: 'Vloer_Afwerking' },
];


const VLOER_AFWERK_MATS: MaterialSection[] = [
  // 1. VOORBEREIDING
  { key: 'egaliseren', label: 'Egaline', categoryFilter: 'Vloer', category: 'Vloer_Voorbereiding' },
  { key: 'egaliseren', label: 'Reparatiemortel', categoryFilter: 'Vloer', category: 'Vloer_Voorbereiding' },
  { key: 'folie', label: 'Dampremmende Folie', categoryFilter: 'Folies', category: 'Vloer_Voorbereiding' },
  { key: 'ondervloer', label: 'Ondervloer', categoryFilter: 'Ondervloer', category: 'Vloer_Voorbereiding' },

  // 2. VLOERDELEN (LAMINAAT / PVC)
  { key: 'vloerdelen', label: 'Laminaat / PVC Panelen', categoryFilter: 'Vloer', category: 'Vloer_Laminaat' },

  // 3. AFWERKING & PROFIELEN
  { key: 'plinten_muur', label: 'Vloerplinten', categoryFilter: 'Plinten', category: 'Vloer_Afwerking' },
  
  // Split profiles for accurate ordering
  { key: 'profielen_overgang', label: 'Overgangsprofielen / Drempels', categoryFilter: 'Profielen', category: 'Vloer_Afwerking' },
  { key: 'profielen_eind', label: 'Eindprofielen', categoryFilter: 'Profielen', category: 'Vloer_Afwerking' },
  { key: 'kruipluik', label: 'Kruipluik Profiel / Matomranding', categoryFilter: 'Profielen', category: 'Vloer_Afwerking' },
];


const VLONDER_MATS: MaterialSection[] = [
  // 1. GRONDWERK & FUNDERING
  { key: 'worteldoek', label: 'Worteldoek', categoryFilter: 'Folies', category: 'Vlonder_Fundering' },
  { key: 'stabilisatie', label: 'Ophoogzand / Stabilisatie', categoryFilter: 'Zand', category: 'Vlonder_Fundering' },
  { key: 'piketten', label: 'Piketten / Palen', categoryFilter: 'Tuinhout', category: 'Vlonder_Fundering' },
  { key: 'dragers', label: 'Tegels / Stelpoten', categoryFilter: 'Tegels', category: 'Vlonder_Fundering' }, // Tiles or plastic adjustable feet

  // 2. CONSTRUCTIE (ONDERBOUW)
  { key: 'moerbalken', label: 'Moerbalken', categoryFilter: 'Tuinhout', category: 'Vlonder_Constructie' }, // Main heavy beams
  { key: 'onderregels', label: 'Onderregels', categoryFilter: 'Tuinhout', category: 'Vlonder_Constructie' }, // Cross joists

  // 3. VLONDER & AFWERKING
  { key: 'vlonderplanken', label: 'Vlonderplanken', categoryFilter: 'Tuinhout', category: 'Vlonder_Dek' },
  { key: 'bevestiging', label: 'Vlonderschroeven / Clips', categoryFilter: 'Bevestiging', category: 'Vlonder_Dek' },
  { key: 'kantplanken', label: 'Kantplanken', categoryFilter: 'Tuinhout', category: 'Vlonder_Dek' },
  { key: 'afwatering', label: 'Drainagegoot', categoryFilter: 'Riolering', category: 'Vlonder_Dek' },
];

const BALKLAAG_CONSTRUCTIEVLOER_MATS: MaterialSection[] = [
  // 1. BALKLAAG (CONSTRUCTIE)
  { key: 'muurplaat', label: 'Muurplaat', categoryFilter: 'Balkhout', category: 'Constructievloer' },
  { key: 'vloerbalken', label: 'Randbalken', categoryFilter: 'Balkhout', category: 'Constructievloer' },
  { key: 'vloerbalken', label: 'Vloerbalken', categoryFilter: 'Balkhout', category: 'Constructievloer' },
  { key: 'balkdragers', label: 'Balkdragers', categoryFilter: 'Bevestiging', category: 'Constructievloer' },

  // 2. ISOLATIE & GELUID
  { key: 'isolatie', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie' },
  { key: 'geluidsstroken', label: 'Geluidsisolatie Stroken', categoryFilter: 'Isolatie', category: 'isolatie' }, // Felt/Rubber strips on top of beams

  // 3. BEPLATING (DEK)
  { key: 'beplating', label: 'Constructieplaat', categoryFilter: 'Plaatmateriaal', category: 'beplating' }, // OSB / Underlayment
];



    const VLIERING_MATS: MaterialSection[] = [
      // ==========================================
      // DEEL 1: DE VLOER (BOVENKANT / CONSTRUCTIE)
      // ==========================================
      { key: 'randbalken', label: 'Randbalken', categoryFilter: 'Balkhout', category: 'Constructievloer' },
      { key: 'vloerbalken', label: 'Vloerbalken', categoryFilter: 'Balkhout', category: 'Constructievloer' },
      { key: 'balkdragers', label: 'Balkdragers', categoryFilter: 'Bevestiging', category: 'Constructievloer' },
    
      { key: 'beplating', label: 'Constructieplaat', categoryFilter: 'Plaatmateriaal', category: 'beplating' },
      // ==========================================
      // DEEL 2: TOEGANG (TUSSENIN)
      // ==========================================
      { key: 'vlizotrap_unit', label: 'Luik / Vlizotrap', categoryFilter: 'Luiken', category: 'Toegang' },
      { key: 'luik_afwerking', label: 'Koplatten', categoryFilter: 'Lijstwerk', category: 'Toegang' },
    
      // ==========================================
      // DEEL 3: HET PLAFOND (ONDERKANT)
      // ==========================================
      
      // --- A. FRAMEWERK (Hout of Metaal) ---
      { key: 'randhout', label: 'Randhout', categoryFilter: 'Balkhout', category: 'hout' },
      { key: 'stroken', label: 'Stelhout', categoryFilter: 'Balkhout', category: 'hout' },
      { key: 'rachels', label: 'Rachelwerk', categoryFilter: 'Balkhout', category: 'hout' },
    
      { key: 'randprofielen', label: 'Randprofielen', categoryFilter: 'Metalstud', category: 'metaal' },
      { key: 'draagprofielen', label: 'Draagprofielen', categoryFilter: 'Metalstud', category: 'metaal' },
    
      // --- B. SPECIALS (Koven) ---
      { key: 'koof_regelwerk', label: 'Regelwerk', categoryFilter: 'Balkhout', category: 'Koof' },
      { key: 'koof_beplating', label: 'Beplating', categoryFilter: 'Plaatmateriaal', category: 'Koof' },
      { key: 'koof_isolatie', label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof' },
    
      { key: 'gordijn_regelwerk', label: 'Regelwerk', categoryFilter: 'Balkhout', category: 'Gordijnkoof' },
      { key: 'gordijn_beplating', label: 'Beplating', categoryFilter: 'Plaatmateriaal', category: 'Gordijnkoof' },
      { key: 'gordijn_achterhout', label: 'Achterhout', categoryFilter: 'Balkhout', category: 'Gordijnkoof' },
    
      // --- C. INSTALLATIE ---
      { key: 'kabelkanaal', label: 'Elektra Buizen / Flex', categoryFilter: 'Elektra', category: 'Installatie' },
      { key: 'centraaldoos', label: 'Centraaldozen', categoryFilter: 'Elektra', category: 'Installatie' },
      { key: 'elektrakabel', label: 'Installatiekabel', categoryFilter: 'Elektra', category: 'Installatie' },
      { key: 'inbouwspots', label: 'Inbouwspots', categoryFilter: 'Verlichting', category: 'Schakelmateriaal' },
      { key: 'schakelaar_element', label: 'Schakelaar / Dimmer', categoryFilter: 'Schakelmateriaal', category: 'Schakelmateriaal' },
    
      // --- D. ISOLATIE ---
      { key: 'folie_buiten', label: 'Folies', categoryFilter: 'Folies', category: 'isolatie' },
      { key: 'isolatie_basis', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie' },
    
      // --- E. BEPLATING (Plafond) ---
      { key: 'beplating', label: 'Afwerkplaat', categoryFilter: 'Plaatmateriaal', category: 'beplating_afwerking' },
    
      // --- F. AFWERKING ---
      { key: 'plinten_plafond', label: 'Plafondplinten', categoryFilter: 'Lijstwerk', category: 'afwerking' },
      { key: 'gips_vuller', label: 'Voegenmiddel', categoryFilter: 'Afwerking', category: 'gips_afwerking' },
      { key: 'gips_finish', label: 'Finish Pasta', categoryFilter: 'Afwerking', category: 'gips_afwerking' },
    ];

//#endregion

//#region ========================================== MATERIAL SECTIONS - KEUKENS ==========================================

const KEUKEN_MATS: MaterialSection[] = [

];

// #endregion

//#region ========================================== MATERIAL SECTIONS - INTERIEUR & AFWERKINGEN ==========================================

const INTERIEUR_MATS: MaterialSection[] = [
  { key: 'constructie', label: 'Basismateriaal / Corpus', categoryFilter: 'Plaatmateriaal' },
  { key: 'fronten', label: 'Fronten & Zichtwerk', categoryFilter: 'Plaatmateriaal' },
  { key: 'beslag', label: 'Scharnieren & Ladegeleiders', categoryFilter: 'Deurbeslag' },
  { key: 'inrichting', label: 'Interieurinrichting (roedes/planken)', categoryFilter: 'Kastinterieur' },
  { key: 'afwerking', label: 'Afwerking & Lakwerk', categoryFilter: 'Afwerking' },
];
// #endregion

//#region ========================================== MATERIAL SECTIONS - AFWERKINGEN ==========================================


const DAGKANT_MATS: MaterialSection[] = [
  { key: 'frame', label: 'Regelwerk', categoryFilter: 'Hout', category: 'hout' },
  { key: 'dagkant', label: 'Afwerk Hout', categoryFilter: 'Platen', category: 'afwerking' },
  { key: 'hoekprofiel', label: 'Hoek- of Stopcontactprofielen', categoryFilter: 'Afwerking', category: 'afwerking' },
];

const PLINTEN_MATS: MaterialSection[] = [
  { key: 'plinten', label: 'Plafondplinten', categoryFilter: 'Hout', category: 'afwerking' },
  { key: 'latten', label: 'Koplatten', categoryFilter: 'Hout', category: 'afwerking' },
  { key: 'latten', label: 'Vloerplinten', categoryFilter: 'Hout', category: 'afwerking' },
];

const OMKASTING_KOVEN_MATS: MaterialSection[] = [
  { key: 'frame', label: 'Regelwerk', categoryFilter: 'Hout', category: 'hout' },
  { key: 'beplating', label: 'Afwerk Hout', categoryFilter: 'Platen', category: 'afwerking' },
];

const VENSTERBANK_MATS: MaterialSection[] = [
  { key: 'frame', label: 'Regelwerk', categoryFilter: 'Hout', category: 'hout' },
  { key: 'vensterbank', label: 'Vensterbank', categoryFilter: 'Hout', category: 'afwerking' },
  { key: 'roosters', label: 'Ventilatieroosters', categoryFilter: 'Afwerking', category: 'afwerking' },
  { key: 'behandeling', label: 'Olie, Lak of Beits', categoryFilter: 'Verf', category: 'afwerking' },
];

// #endregion

//#region ========================================== MATERIAL SECTIONS - DEUREN XXX==========================================

const DEUR_BINNEN_MATS: MaterialSection[] = [
  // Deurblad
  { key: 'deurblad', label: 'Binnendeuren', categoryFilter: 'deuren', category: 'Deuren' },

  // Beslag & sloten
  { key: 'scharnieren', label: 'Scharnieren / Paumelles', categoryFilter: 'deurbeslag', category: 'deurbeslag' },
  { key: 'slotmechanisme', label: 'Sloten', categoryFilter: 'deurbeslag', category: 'deurbeslag' },
  { key: 'deurbeslag_kruk', label: 'Deurbeslag (Schild & Kruk)', categoryFilter: 'deurbeslag', category: 'deurbeslag' },
  { key: 'cilinder', label: 'Cilinder', categoryFilter: 'deurbeslag', category: 'deurbeslag' },


  // Glas
  { key: 'glas', label: 'Glas', categoryFilter: 'glas', category: 'glas' },
  { key: 'glaslatten', label: 'Glaslatten', categoryFilter: 'glas', category: 'glas' },

  { key: 'valdorp', label: 'Tochtvaldorp', categoryFilter: 'tochtstrips', category: 'tochtstrips' },
  { key: 'tochtstrips', label: 'Tochtstrips', categoryFilter: 'tochtstrips', category: 'tochtstrips' },

  // Ventilatie
  { key: 'ventilatierooster', label: 'Deurroosters', categoryFilter: 'ventilatie', category: 'ventilatie' },
];



const DEUR_BUITEN_MATS: MaterialSection[] = [
  // Deurblad
  { key: 'deurblad', label: 'Buitendeur', categoryFilter: 'deuren', category: 'Deuren' },

  // Beslag & sloten
  { key: 'scharnieren', label: 'Scharnieren', categoryFilter: 'deurbeslag', category: 'deurbeslag' },
  { key: 'slotmechanisme', label: 'Sloten', categoryFilter: 'deurbeslag', category: 'deurbeslag' },
  { key: 'meerpuntsluiting', label: 'Meerpuntsluiting', categoryFilter: 'deurbeslag', category: 'deurbeslag' },
  { key: 'deurbeslag_kruk', label: 'Deurbeslag (Schild & Kruk)', categoryFilter: 'deurbeslag', category: 'deurbeslag' },
  { key: 'cilinder', label: 'Cilinder', categoryFilter: 'deurbeslag', category: 'deurbeslag' },


  // Glas
  { key: 'glas', label: 'Glas', categoryFilter: 'glas', category: 'glas' },
  { key: 'glaslatten', label: 'Glaslatten', categoryFilter: 'glas', category: 'glas' },

  // Tochtwering
  { key: 'valdorp', label: 'Tochtvaldorp', categoryFilter: 'tochtstrips', category: 'tochtstrips' },
  { key: 'tochtstrips', label: 'Tochtstrips', categoryFilter: 'tochtstrips', category: 'tochtstrips' },

  // Ventilatie
  { key: 'ventilatierooster', label: 'Deurroosters', categoryFilter: 'ventilatie', category: 'ventilatie' },
];

// #endregion

//#region ========================================== MATERIAL SECTIONS - DAKRENOVATIE ==========================================

const DAK_HELLEND_MATS: MaterialSection[] = [
  // 1. ONDERGROND & ISOLATIE
  { key: 'constructieplaat', label: 'Constructieplaat', categoryFilter: 'Plaatmateriaal', category: 'beplating' },
  { key: 'isolatie_dak', label: 'Dakisolatie', categoryFilter: 'Isolatie', category: 'isolatie' },
  { key: 'folie_buiten', label: 'Folie', categoryFilter: 'Folies', category: 'isolatie' },

// 2. HOUTWERK (Tengels & Panlatten)
{ key: 'tengels', label: 'Tengels', categoryFilter: 'Balkhout', category: 'hout' },
{ key: 'panlatten', label: 'Panlatten', categoryFilter: 'Balkhout', category: 'hout' },
{ key: 'ruiter', label: 'Ruiter (Nokbalk)', categoryFilter: 'Balkhout', category: 'hout' }, // <--- ADD THIS LINE

  // 3. DAKVOET & PANNEN (Category: 'dak')
  { key: 'dakvoetprofiel', label: 'Dakvoetprofiel / Vogelschroot', categoryFilter: 'Dakprofielen', category: 'dak' },
  { key: 'dakpannen', label: 'Dakpannen', categoryFilter: 'Dakpannen', category: 'dak' },
  { key: 'gevelpannen', label: 'Gevelpannen / Kantpannen', categoryFilter: 'Dakpannen', category: 'dak' },
  { key: 'ondervorst', label: 'Ondervorst', categoryFilter: 'Dakprofielen', category: 'dak' },
  { key: 'nokvorsten', label: 'Nokvorsten', categoryFilter: 'Dakpannen', category: 'dak' },

  // 4. AFWERKING (Category: 'afwerking_dak') <--- CHANGED THIS
  { key: 'lood', label: 'Lood', categoryFilter: 'Lood', category: 'afwerking_dak' },
  { key: 'dakgoot', label: 'Dakgoot', categoryFilter: 'HWA', category: 'afwerking_dak' },
];

const DAK_EPDM_MATS: MaterialSection[] = [
  // 1. ONDERGROND & ISOLATIE (Opbouw Warm Dak)
  // Standard 'constructieplaat' key (OSB/Underlayment)
  { key: 'constructieplaat', label: 'Constructieplaat', categoryFilter: 'Plaatmateriaal', category: 'beplating' },
  // Standard 'folie_binnen' key (Dampremmende folie goes UNDER the insulation)
  { key: 'folie_binnen', label: 'Dampremmende Folie', categoryFilter: 'Folies', category: 'isolatie' },
  // Standard 'isolatie_dak' key (PIR Plates)
  { key: 'isolatie_dak', label: 'Dakisolatie', categoryFilter: 'Isolatie', category: 'isolatie' },

  // 2. DAKBEDEKKING (EPDM)
  { key: 'epdm_folie', label: 'EPDM', categoryFilter: 'Dakbedekking', category: 'dak' },

  // 3. AFWERKING & DETAILS
  { key: 'daktrim', label: 'Daktrim', categoryFilter: 'Daktrim', category: 'afwerking_dak' },
  { key: 'daktrim_hoeken', label: 'Daktrim Hoeken', categoryFilter: 'Daktrim', category: 'afwerking_dak' },
  { key: 'hwa_uitloop', label: 'HWA Stadsuitloop / Onderuitloop', categoryFilter: 'HWA', category: 'afwerking_dak' },
  { key: 'lood', label: 'Lood', categoryFilter: 'Lood', category: 'afwerking_dak' },
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
  { key: 'regelwerk_basis', label: 'Tengelwerk / Rachels', categoryFilter: 'Balkhout', category: 'hout' },
  { key: 'folie_buiten', label: 'Folie', categoryFilter: 'Folies', category: 'isolatie' },
  { key: 'isolatie_gevel', label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie' },
  { key: 'ventilatieprofiel', label: 'Ventilatieprofiel (Ongedierte)', categoryFilter: 'Profielen', category: 'hout' },

  // 2. THE CHOICE (AFWERKPLAAT)
  // Option A: Wood
  { key: 'gevelbekleding_hout', label: 'Houten Bekleding (Rabat/Zweeds)', categoryFilter: 'Tuinhout', category: 'gevel_hout' },
  { key: 'hoek_hout', label: 'Houten Hoeklatten', categoryFilter: 'Lijstwerk', category: 'gevel_hout' },

  // Option B: Keralit (Plastic)
  { key: 'gevelbekleding_kunststof', label: 'Kunststof Panelen (Keralit)', categoryFilter: 'Gevelbekleding', category: 'gevel_kunststof' },
  { key: 'profiel_keralit', label: 'Keralit Profielen (Start/Eind/Hoek)', categoryFilter: 'Profielen', category: 'gevel_kunststof' },

  // Option C: Trespa (Plate)
  { key: 'gevelplaat', label: 'Volkern/HPL Plaat (Trespa)', categoryFilter: 'Plaatmateriaal', category: 'gevel_plaat' },

  { key: 'gevelplaat', label: 'Volkern/HPL Plaat (Trespa)', categoryFilter: 'Plaatmateriaal', category: 'gevel_plaat_lijm' },

  { key: 'waterslag', label: 'Waterslagen (Aluminium)', categoryFilter: 'Dakprofielen', category: 'bevestiging' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - KOZIJNEN XXX==========================================

const KOZIJN_BINNEN_HOUT_MATS: MaterialSection[] = [
  // Hout
  { key: 'kozijnhout', label: 'Kozijnhout', categoryFilter: 'hout', category: 'hout' },
  { key: 'binnendorpel', label: 'Binnendorpel', categoryFilter: 'dorpels', category: 'hout' },

  // Beslag
  { key: 'scharnieren', label: 'Scharnieren', categoryFilter: 'deurbeslag', category: 'beslag' },
  { key: 'sluitplaat', label: 'Sluitplaat', categoryFilter: 'deurbeslag', category: 'beslag' },

  // Glas
  { key: 'glas_bovenlicht', label: 'Glas', categoryFilter: 'glas', category: 'glas' },
  { key: 'glaslatten', label: 'Glaslatten', categoryFilter: 'glas', category: 'glas' },

  // Afwerking
  { key: 'koplatten', label: 'Koplatten', categoryFilter: 'lijstwerk', category: 'afwerking' },
  { key: 'neuten', label: 'Neuten', categoryFilter: 'lijstwerk', category: 'afwerking' },
];

// ==========================================
// 2. BINNEN KOZIJNEN (STAAL)
// ==========================================
const KOZIJN_BINNEN_STAAL_MATS: MaterialSection[] = [
  // Stalen Kozijn
  { key: 'stalen_kozijn', label: 'Stalen Kozijn', categoryFilter: 'kozijnen', category: 'Stalen kozijn' },

  // Beslag & Rubber
  { key: 'paumelles_staal', label: 'Paumelles', categoryFilter: 'deurbeslag', category: 'beslag' },
  { key: 'aanslagrubber', label: 'Aanslagrubber', categoryFilter: 'tochtstrips', category: 'beslag' },

  // Glas
  { key: 'glas_bovenlicht', label: 'Glas', categoryFilter: 'glas', category: 'glas' },
  { key: 'glaslatten_klik', label: 'Glaslatten', categoryFilter: 'glas', category: 'glas' },
];

// ==========================================
// 3. BUITEN KOZIJNEN - HOUT (PREFAB / FABRIEK)
// ==========================================
const KOZIJN_BUITEN_HOUT_MATS: MaterialSection[] = [
  // Element
  { key: 'prefab_kozijnelement', label: 'Kozijnelement', categoryFilter: 'kozijnen', category: 'element' },
  { key: 'stelkozijnen', label: 'Stelkozijnen', categoryFilter: 'hout', category: 'element' },

  // Afwerking Buiten
  { key: 'raamdorpel_steen', label: 'Raamdorpelstenen', categoryFilter: 'dorpels', category: 'afwerking_buiten' },
  { key: 'lood_dpc', label: 'Lood / DPC', categoryFilter: 'afwerking', category: 'afwerking_buiten' },

  // Afwerking Binnen
  { key: 'dagkantafwerking', label: 'Dagkantbetimmering', categoryFilter: 'plaatmateriaal', category: 'afwerking_binnen' },
  { key: 'vensterbank', label: 'Vensterbank', categoryFilter: 'dorpels', category: 'afwerking_binnen' },
  { key: 'koplatten', label: 'Koplatten', categoryFilter: 'lijstwerk', category: 'afwerking_binnen' },
];

// ==========================================
// 4. BUITEN KOZIJNEN - KUNSTSTOF (PREFAB)
// ==========================================
const KOZIJN_BUITEN_KUNSTSTOF_MATS: MaterialSection[] = [
  // Element
  { key: 'profiel', label: 'Kozijnelement', categoryFilter: 'kozijnen', category: 'element' },
  { key: 'onderdorpel', label: 'Onderdorpel', categoryFilter: 'dorpels', category: 'element' },
  
  // Montage (Excl klein materiaal)
  { key: 'stelkozijn', label: 'Stelkozijn', categoryFilter: 'balkhout', category: 'montage' },

  // Afwerking
  { key: 'dagkanten', label: 'Dagkantafwerking', categoryFilter: 'profielen', category: 'afwerking' },
  { key: 'waterslag', label: 'Waterslag', categoryFilter: 'daktrim', category: 'afwerking' },
  { key: 'inzethorren', label: 'Inzethorren', categoryFilter: 'accessoires', category: 'afwerking' },
];

// ==========================================
// 5. AMBACHTELIJK TIMMERWERK (CUSTOM / RENOVATIE)
// ==========================================
const KOZIJN_TIMMERWERK_MATS: MaterialSection[] = [
  // Job 1: Kozijn (Vast)
  { key: 'kozijnhout_buiten', label: 'Kozijnhout', categoryFilter: 'hout', category: 'hout' },
  { key: 'onderdorpel', label: 'Onderdorpel', categoryFilter: 'dorpels', category: 'hout' },

  // Job 2: Raam (Draaiend)
  { key: 'raamhout', label: 'Raamhout', categoryFilter: 'hout', category: 'raam' },

  // Beslag
  { key: 'scharnieren', label: 'Scharnieren', categoryFilter: 'deurbeslag', category: 'beslag' },
  { key: 'raamboom', label: 'Raamboom', categoryFilter: 'raambeslag', category: 'beslag' },
  { key: 'raamuitzetter', label: 'Raamuitzetter', categoryFilter: 'raambeslag', category: 'beslag' },
  { key: 'meerpuntsluiting', label: 'Meerpuntsluiting', categoryFilter: 'deurbeslag', category: 'beslag' },

  // Glas & Ventilatie
  { key: 'glas_buiten', label: 'Glas', categoryFilter: 'glas', category: 'glas' },
  { key: 'neuslatten', label: 'Neuslatten', categoryFilter: 'glas', category: 'glas' },
  { key: 'ventilatierooster', label: 'Ventilatierooster', categoryFilter: 'ventilatie', category: 'glas' },

  // Afwerking
  { key: 'tochtkader', label: 'Tochtkader', categoryFilter: 'tochtstrips', category: 'afwerking' },
  { key: 'waterkering', label: 'Lood / DPC', categoryFilter: 'afwerking', category: 'afwerking' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - SCHUTTING ==========================================

const SCHUTTING_MATS: MaterialSection[] = [
  // 1. FUNDERING & PALEN (GENERAL)
  { key: 'snelbeton', label: 'Snelbeton', categoryFilter: 'Bouwstoffen', category: 'fundering' },
  { key: 'opsluitbanden', label: 'Opsluitbanden', categoryFilter: 'Bestrating', category: 'fundering' },
  { key: 'paalpunthouder', label: 'Paalpunthouder', categoryFilter: 'Ijzerwaren', category: 'fundering' },

  // 2. OPTIE: HOUT
  { key: 'schuttingpalen_hout', label: 'Schuttingpalen hout', categoryFilter: 'Tuinhout', category: 'schutting_hout' },
  { key: 'paalkap', label: 'Paalkappen', categoryFilter: 'Ijzerwaren', category: 'schutting_hout' },
  { key: 'tuinscherm_hout', label: 'Tuinscherm hout', categoryFilter: 'Tuinhout', category: 'schutting_hout' },
  { key: 'afdeklat_hout', label: 'Afdeklat hout', categoryFilter: 'Tuinhout', category: 'schutting_hout' },
  { key: 'tuinplanken', label: 'Losse tuinplanken', categoryFilter: 'Tuinhout', category: 'schutting_hout' },

  // 3. OPTIE: BETON SYSTEEM
  { key: 'betonpalen', label: 'Betonpalen', categoryFilter: 'Bestrating', category: 'schutting_beton' },
  { key: 'onderplaten', label: 'Onderplaten', categoryFilter: 'Bestrating', category: 'schutting_beton' },
  { key: 'afdekkap_beton', label: 'Afdekkappen beton', categoryFilter: 'Bestrating', category: 'schutting_beton' },
  { key: 'unibeslag', label: 'Unibeslag', categoryFilter: 'Ijzerwaren', category: 'schutting_beton' },

  // 4. OPTIE: COMPOSIET
  { key: 'aluminium_palen', label: 'Aluminium palen', categoryFilter: 'Tuinhout', category: 'schutting_composiet' },
  { key: 'paalvoet', label: 'Paalvoeten', categoryFilter: 'Ijzerwaren', category: 'schutting_composiet' },
  { key: 'tuinscherm_composiet', label: 'Tuinscherm composiet', categoryFilter: 'Tuinhout', category: 'schutting_composiet' },
  { key: 'u_profiel', label: 'U profielen', categoryFilter: 'Profielen', category: 'schutting_composiet' },

  // 5. POORT & TOEGANG
  { key: 'tuinpoort', label: 'Tuinpoort', categoryFilter: 'Tuinhout', category: 'poort' },
  { key: 'stalen_frame', label: 'Stalen frame', categoryFilter: 'Ijzerwaren', category: 'poort' },
  { key: 'kozijnbalken', label: 'Kozijnbalken', categoryFilter: 'Tuinhout', category: 'poort' },

  // 6. TUINDEUR BESLAG
  { key: 'hengselset', label: 'Hengselset', categoryFilter: 'Ijzerwaren', category: 'beslag' },
  { key: 'hengen', label: 'Hengen', categoryFilter: 'Ijzerwaren', category: 'beslag' },
  { key: 'plaatduimen', label: 'Plaatduimen', categoryFilter: 'Ijzerwaren', category: 'beslag' },
  { key: 'poortbeslag', label: 'Poortbeslag', categoryFilter: 'Ijzerwaren', category: 'beslag' },
  { key: 'cilinderslot', label: 'Cilinderslot', categoryFilter: 'Ijzerwaren', category: 'beslag' },
  { key: 'grondgrendel', label: 'Grondgrendel', categoryFilter: 'Ijzerwaren', category: 'beslag' },
  { key: 'vloerstop', label: 'Vloerstop', categoryFilter: 'Ijzerwaren', category: 'beslag' },
];


//#endregion

//#region ========================================== MATERIAL SECTIONS - HOUTBOUW & OVERKAPPING ==========================================

const HOUTBOUW_MATS: MaterialSection[] = [
  
];


//#endregion

//#region ========================================== MATERIAL SECTIONS - TRAPPEN ==========================================

const TRAPRENOVATIE_OVERZETTREDEN_MATS: MaterialSection[] = [
  { key: 'treden', label: 'Overzettrede', categoryFilter: 'Hout', category: 'basis' },
  { key: 'stootborden', label: 'Stootbord', categoryFilter: 'Hout', category: 'basis' },
  { key: 'profiel', label: 'Trapneusprofiel', categoryFilter: 'Afwerking', category: 'afwerking' },
  { key: 'antislip', label: 'Antislipstrip', categoryFilter: 'Beslag', category: 'afwerking' }, // Beslag uitzondering
];

const VLIZOTRAP_MATS: MaterialSection[] = [
  { key: 'balken', label: 'Raveling balkhout', categoryFilter: 'Hout', category: 'hout' },
  { key: 'trap', label: 'Vlizotrap (Complete set)', categoryFilter: 'Dakraam', category: 'basis' },
  { key: 'luik', label: 'Zolderluik', categoryFilter: 'Dakraam', category: 'basis' },
  { key: 'traphek', label: 'Veiligheidshek', categoryFilter: 'Hout', category: 'veiligheid' },
  { key: 'poortje', label: 'Veiligheidspoortje', categoryFilter: 'Beslag', category: 'veiligheid' },
  { key: 'scharnieren', label: 'Scharnier', categoryFilter: 'Beslag', category: 'beslag' },
  { key: 'sluiting', label: 'Grendel / Sluiting', categoryFilter: 'Beslag', category: 'beslag' },
  { key: 'veer', label: 'Zelfsluitende veer', categoryFilter: 'Beslag', category: 'beslag' },
  { key: 'handgreep', label: 'Handgreep', categoryFilter: 'Beslag', category: 'beslag' },
  { key: 'architraaf', label: 'Koplatten', categoryFilter: 'Hout', category: 'afwerking' },
];

const NIEUWE_TRAP_PLAATSEN_MATS: MaterialSection[] = [
  // CONSTRUCTIE & RAVELING
  { key: 'balken', label: 'Raveling balkhout', categoryFilter: 'Hout', category: 'hout' },
  { key: 'balkdragers', label: 'Balkdrager', categoryFilter: 'Beslag', category: 'hout' }, // Beslag uitzondering

  // DE TRAP (BASIS ONDERDELEN)
  { key: 'trap', label: 'Bouwpakket trap', categoryFilter: 'Hout', category: 'trap' },
  { key: 'trapboom', label: 'Trapboom', categoryFilter: 'Hout', category: 'trap' },
  { key: 'trede', label: 'Trede', categoryFilter: 'Hout', category: 'trap' },
  { key: 'stootbord', label: 'Stootbord', categoryFilter: 'Hout', category: 'trap' },

  // VEILIGHEID & BESLAG
  { key: 'trapaal', label: 'Trapaal', categoryFilter: 'Hout', category: 'veiligheid' },
  { key: 'spijlen', label: 'Spijl', categoryFilter: 'Beslag', category: 'beslag' }, // Beslag uitzondering
  { key: 'leuning', label: 'Trapleuning', categoryFilter: 'Hout', category: 'veiligheid' },
  { key: 'houders', label: 'Leuninghouder', categoryFilter: 'Beslag', category: 'beslag' }, // Beslag uitzondering
  { key: 'balustrade', label: 'Balustrade', categoryFilter: 'Hout', category: 'veiligheid' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - HOUTROTREPARATIE ==========================================

const HOUTROTREPARATIE_MATS: MaterialSection[] = [
  // Voorbereiding & Stabilisatie
  { key: 'houtrotstop', label: 'Houtrotstop vloeistof', categoryFilter: 'Verf & Toebehoren', category: 'reparatie' },
  { key: 'stabilisator', label: 'Houtstabilisator', categoryFilter: 'Verf & Toebehoren', category: 'reparatie' },

  // Reparatie & Vulling
  { key: 'epoxy_vuller', label: 'Twee-componenten epoxy vuller', categoryFilter: 'Bouwstoffen', category: 'reparatie' },
  { key: 'hout_inzetstuk', label: 'Vervangend hout inzetstuk', categoryFilter: 'Tuinhout', category: 'reparatie' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - KEUKENS ==========================================

const KEUKEN_MONTAGE_MATS: MaterialSection[] = [
  // BASIS
  { key: 'corpus', label: 'Keukenkast', categoryFilter: 'Hout', category: 'basis' },
  { key: 'werkblad', label: 'Aanrechtblad', categoryFilter: 'Platen', category: 'werkblad' },
  
  // APPARATUUR & SPOELBAK
  { key: 'apparatuur', label: 'Inbouwapparaat', categoryFilter: 'Afwerking', category: 'werkblad' },
  { key: 'spoelbak', label: 'Spoelbak', categoryFilter: 'Afwerking', category: 'beslag' },
  { key: 'kraan', label: 'Keukenkraan', categoryFilter: 'Beslag', category: 'beslag' }, // Beslag
  
  // DETAILS
  { key: 'grepen', label: 'Handgreep', categoryFilter: 'Beslag', category: 'beslag' }, // Beslag
  { key: 'plint', label: 'Keukenplint', categoryFilter: 'Hout', category: 'beslag' },
  { key: 'verlichting', label: 'Keukenverlichting', categoryFilter: 'Afwerking', category: 'beslag' },
];

const KEUKEN_RENOVATIE_MATS: MaterialSection[] = [
  // ZICHTWERK
  { key: 'fronten', label: 'Keukenfront', categoryFilter: 'Platen', category: 'basis' },
  { key: 'werkblad', label: 'Aanrechtblad', categoryFilter: 'Platen', category: 'werkblad' },
  
  // HARDWARE (BESLAG)
  { key: 'scharnieren', label: 'Scharnier', categoryFilter: 'Beslag', category: 'beslag' }, // Beslag
  { key: 'geleiders', label: 'Ladegeleider', categoryFilter: 'Beslag', category: 'beslag' }, // Beslag
  { key: 'grepen', label: 'Handgreep', categoryFilter: 'Beslag', category: 'beslag' }, // Beslag
  
  // UPGRADES
  { key: 'apparatuur', label: 'Inbouwapparaat', categoryFilter: 'Afwerking', category: 'werkblad' },
  { key: 'kraan', label: 'Keukenkraan', categoryFilter: 'Beslag', category: 'beslag' }, // Beslag
];


//#endregion

//#region ========================================== MATERIAL SECTIONS - INBOUWKASTEN ==========================================


const INBOUWKAST_MATS: MaterialSection[] = [
  { key: 'corpus', label: 'Interieur / Corpus (MDF, Melamine, Multiplex)', categoryFilter: 'Platen', category: 'basis' },
  { key: 'fronten', label: 'Deuren', categoryFilter: 'Platen', category: 'afwerking' },
  { key: 'fronten', label: 'Fronten', categoryFilter: 'Platen', category: 'afwerking' },
  { key: 'lades', label: 'Ladesystemen', categoryFilter: 'Beslag', category: 'beslag' },
  { key: 'scharnieren', label: 'Scharnier', categoryFilter: 'Beslag', category: 'beslag' },
  { key: 'grepen', label: 'Meubelgreep', categoryFilter: 'Beslag', category: 'beslag' },
  { key: 'snappers', label: 'Push-to-open systeem', categoryFilter: 'Beslag', category: 'beslag' },
  { key: 'garderobe', label: 'Kledingroede', categoryFilter: 'Beslag', category: 'beslag' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - MEUBEL OP MAAT ==========================================

const MEUBEL_MATS: MaterialSection[] = [
  { key: 'materiaal', label: 'Hoofdmateriaal', categoryFilter: 'Hout', category: 'basis' },
  { key: 'beslag', label: 'Meubelbeslag', categoryFilter: 'Beslag', category: 'afwerking' },
  { key: 'afwerking', label: 'Olie, Lak, Beits', categoryFilter: 'Verf', category: 'afwerking' },
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
  { key: 'glas', label: 'Glas', categoryFilter: 'Glas', category: 'glas' },
  { key: 'roosters', label: 'Ventilatie roosters', categoryFilter: 'Deuren & Kozijnen', category: 'glas' },
  { key: 'glaslatten', label: 'Glaslatten', categoryFilter: 'Hout', category: 'glas' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - DAKRAMEN ==========================================


const VELUX_MATS: MaterialSection[] = [
  { key: 'venster', label: 'Velux dakraam set', categoryFilter: 'Dakraam', category: 'vensterset' },
  { key: 'venster', label: 'Velux Venster', categoryFilter: 'Dakraam', category: 'venster' },
  { key: 'gootstuk', label: 'Gootstukken', categoryFilter: 'Dakraam', category: 'gootstuk' },
  { key: 'betimmering', label: 'Interieur afwerking', categoryFilter: 'Hout', category: 'afwerking' },
];

const LICHTKOEPEL_MATS: MaterialSection[] = [
  { key: 'koepel', label: 'Lichtkoepel', categoryFilter: 'Dakraam', category: 'koepel' },
  { key: 'opstand', label: 'Opstand Houtbalk of Prefab Set', categoryFilter: 'Dakraam', category: 'opstand' },
  { key: 'dakbedekking', label: 'Dakbedekking', categoryFilter: 'Dakbedekking', category: 'afwerking' },
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