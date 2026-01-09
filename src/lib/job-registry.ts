// src/lib/job-registry.ts


export const MATERIAL_CATEGORY_INFO = {
  // --- STRUCTURE ---
  hout: { title: 'Framewerk', order: 1 },
  metaal: { title: 'Framewerk', order: 1 },
  Constructievloer: { title: 'Balklaag & Constructie', order: 1 },
  Vlonder_Fundering: { title: 'Grondwerk & Fundering', order: 1 },
  deurbeslag: { title: 'Deurbeslag & Sloten', order: 8 },
  tochtstrips: { title: 'Tochtwering', order: 9 },
  ventilatie: { title: 'Ventilatie', order: 10 },
  glas: { title: 'Glas & Beglazing', order: 9 },
  isolatie: { title: 'Isolatie & Folies', order: 2 },
  beplating: { title: 'Beplating', order: 3 },
  Vlonder_Constructie: { title: 'Constructie (Onderbouw)', order: 2 },
  Vloer_Voorbereiding: { title: 'Voorbereiding', order: 2 },
  beplating_afwerking: { title: 'Beplating (Plafond)', order: 11 },
  Vloer_Hout: { title: 'Parket', order: 3 },
  Vloer_Laminaat: { title: 'Vloerdelen', order: 3 },
  Vlonder_Dek: { title: 'Vlonder & Afwerking', order: 3 },
  afwerking: { title: 'Afwerken', order: 4 },
  afwerking_binnen: { title: 'Afwerken (Binnen)', order: 4 },
  afwerking_buiten: { title: 'Afwerken (Buiten)', order: 5 },
  gips_afwerking: { title: 'Naden & Stucwerk', order: 6 },
  Vloer_Afwerking: { title: 'Afwerking', order: 4 },
  Kozijnen: { title: 'Kozijnen', order: 7 },
  Deuren: { title: 'Deuren', order: 8 },
  Schuifdeuren: { title: 'Schuifdeuren', order: 8 },
  Koof: { title: 'Leidingkoof / Omkasting', order: 9 },
  Gordijnkoof: { title: 'Gordijnkoof', order: 10 },
  Toegang: { title: 'Toegang & Vlizotrap', order: 14 },
  Installatie: { title: 'Installatie & Elektra', order: 20 },
  Cinewall: { title: 'Cinewall Elementen', order: 21 },
  Schakelmateriaal: { title: 'Schakelmateriaal', order: 22 },
  Vliering_Constructie: { title: '1. Constructie & Vloer (Bovenzijde)', order: 1 },
  Vliering_Plafond_Hout: { title: '2. Plafondafwerking (Hout)', order: 2 },
  Vliering_Plafond_Metaal: { title: '2. Plafondafwerking (Metal Stud)', order: 3 },
  Vliering_Toegang: { title: '3. Vlizotrap & Toegang', order: 4 },
  Vliering_Isolatie: { title: '4. Isolatie & Elektra', order: 5 },
} as const;

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
  { key: 'aantal', label: 'Aantal', type: 'number', suffix: 'stuks', placeholder: 'Bijv. 1' },
  { key: 'breedte', label: 'Breedte per stuk', type: 'number', suffix: 'mm', placeholder: 'Bijv. 930' },
  { key: 'hoogte', label: 'Hoogte per stuk', type: 'number', suffix: 'mm', placeholder: 'Bijv. 2315' },
  { key: 'opmerkingen', label: 'Extra opmerkingen', type: 'textarea', placeholder: 'Bijzondere details...' }
];

// ==========================================
// 4. MATERIAL CONFIGURATIONS (Cards)
// ==========================================

// --- WANDEN (DETAILED) ---

const HSB_VOORZETWAND_BINNEN_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE
  { key: 'regelwerk_basis', label: 'Staanders & Liggers', categoryFilter: 'Balkhout', category: 'hout' },
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
  { key: 'schakelmateriaal_basis', label: 'Stopcontacten & Schakelaars', categoryFilter: 'Schakelmateriaal', category: 'Schakelmateriaal' },
  
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
  { key: 'regelwerk_basis', label: 'Staanders & Liggers', categoryFilter: 'Balkhout', category: 'hout' },

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
  { key: 'regelwerk_basis', label: 'Staanders & Liggers', categoryFilter: 'Balkhout', category: 'hout' },
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
  { key: 'regelwerk_basis', label: 'Staanders & Liggers', categoryFilter: 'Balkhout', category: 'hout' },

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


// --- PLAFONDS (DETAILED) ---

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

// --- VLOEREN & VLIERINGEN (DETAILED) ---

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




// ---ISOLATIEWERKEN---

const DAK_ISO_BUITEN_MATS: MaterialSection[] = [
  { key: 'damprem', label: '1. Damprem – luchtdichtingslaag (op dakbeschot)', categoryFilter: 'Folies & Tape' },
  { key: 'constructie', label: '2. Constructie – dakvoetbalk (afschuifbeveiliging)', categoryFilter: 'Hout' },
  { key: 'isolatie', label: '3. Isolatie – harde platen (PIR/Resol)', categoryFilter: 'Isolatie' },
  { key: 'luchtdichting', label: '4. Luchtdichting – naden & kieren (tape/schuim)', categoryFilter: 'Folies & Tape' },
  { key: 'bevestiging', label: '5. Bevestiging – isolatieschroeven (constructief)', categoryFilter: 'Bevestiging' },
  { key: 'tengels', label: '6. Regelwerk – tengels (verticaal)', categoryFilter: 'Hout' },
  { key: 'panlatten', label: '7. Regelwerk – panlatten (horizontaal)', categoryFilter: 'Hout' },
  { key: 'dakramen', label: '8. Dakramen – verhogingskader (opstand)', categoryFilter: 'Hout' },
  { key: 'dakkapel', label: '9. Dakkapel – wangen & dak (aansluiting)', categoryFilter: 'Plaatmateriaal' },
  { key: 'schoorsteen', label: '10. Schoorsteen – loodvervanging/loketten', categoryFilter: 'Dakmaterialen' },
  { key: 'dakvoet', label: '11. Dakvoet – gootdetail (beugels/vogelschroot)', categoryFilter: 'Dakmaterialen' },
  { key: 'nok', label: '12. Nokafwerking – ruiter & ondervorst', categoryFilter: 'Dakmaterialen' },
  { key: 'randafwerking', label: '13. Randafwerking – windveren/boeidelen', categoryFilter: 'Plaatmateriaal' },
  { key: 'dakbedekking', label: '14. Dakbedekking – pannen (hergebruik/nieuw)', categoryFilter: 'Dakmaterialen' },
];

const DAK_ISO_BINNEN_MATS: MaterialSection[] = [
  { key: 'regelwerk_gording', label: '1. Regelwerk – opdikken gordingen (diepte)', categoryFilter: 'Hout' },
  { key: 'isolatie', label: '2. Isolatie – vakvulling (wol/plaat)', categoryFilter: 'Isolatie' },
  { key: 'damprem', label: '3. Damprem – folie & tape (klimaat/PE)', categoryFilter: 'Folies & Tape' },
  { key: 'regelwerk_rachels', label: '4. Regelwerk – rachels (gipsbasis)', categoryFilter: 'Hout' },
  { key: 'beplating', label: '5. Beplating – dakvlak (afwerking)', categoryFilter: 'Plaatmateriaal' },
  { key: 'knieschot_frame', label: '6. Knieschot – constructie (frame)', categoryFilter: 'Hout' },
  { key: 'knieschot_plaat', label: '7. Knieschot – beplating (wand/schuif)', categoryFilter: 'Plaatmateriaal' },
  { key: 'dakramen', label: '8. Dakramen – dagkanten (aftimmering)', categoryFilter: 'Plaatmateriaal' },
  { key: 'omkasting', label: '9. Gordingen – omkasting (koof)', categoryFilter: 'Plaatmateriaal' },
  { key: 'vliering', label: '10. Vliering – plafondconstructie (optioneel)', categoryFilter: 'Hout' },
  { key: 'afwerking', label: '11. Afwerking – naden & plinten', categoryFilter: 'Afwerking' },
];

const WAND_ISO_BUITEN_MATS: MaterialSection[] = [
  { key: 'voorbereiding', label: '1. Voorbereiding – gevelreiniging (optioneel)', categoryFilter: 'Overig' },
  { key: 'startprofiel', label: '2. Startprofiel – fundering (kantplank/profiel)', categoryFilter: 'Bouwmaterialen' },
  { key: 'basisregelwerk', label: '3. Constructie – basisregelwerk (uitvlakken)', categoryFilter: 'Hout' },
  { key: 'isolatie', label: '4. Isolatie – gevelvlak (vakvulling/plaat)', categoryFilter: 'Isolatie' },
  { key: 'folie', label: '5. Folie – gevelfolie (waterkerend/UV)', categoryFilter: 'Folies & Tape' },
  { key: 'ventilatielatten', label: '6. Regelwerk – ventilatielatten (spouw)', categoryFilter: 'Hout' },
  { key: 'ventilatie', label: '7. Ventilatie – ongediertewering (roosters)', categoryFilter: 'Bouwmaterialen' },
  { key: 'gevelbekleding', label: '8. Gevelbekleding – afwerking (rabat/composiet)', categoryFilter: 'Gevelbekleding' },
  { key: 'stelkozijn', label: '9. Sparingen – stelkozijnverlengers (kader)', categoryFilter: 'Hout' },
  { key: 'waterslagen', label: '10. Sparingen – waterslagen (vervanging)', categoryFilter: 'Deuren & Kozijnen' },
  { key: 'dagkanten', label: '11. Sparingen – dagkanten (negge afwerking)', categoryFilter: 'Plaatmateriaal' },
  { key: 'hoeken', label: '12. Hoekafwerking – buitenhoeken (profiel/zetwerk)', categoryFilter: 'Afwerking' },
  { key: 'dakrand', label: '13. Aansluiting – dakrand/overstek (boeiboord)', categoryFilter: 'Plaatmateriaal' },
  { key: 'hwa', label: '14. Aansluiting – hemelwaterafvoer (beugels/pijp)', categoryFilter: 'Dakmaterialen' },
];

const WAND_ISO_BINNEN_MATS: MaterialSection[] = [
  { key: 'voorbereiding', label: '1. Voorbereiding – muurherstel (gaten/kieren)', categoryFilter: 'Bouwmaterialen' },
  { key: 'folie_spouw', label: '2. Folie – spouwzijde (dampopen/waterkerend)', categoryFilter: 'Folies & Tape' },
  { key: 'ventilatielatten', label: '3. Regelwerk – ventilatielatten (spouw)', categoryFilter: 'Hout' },
  { key: 'frame', label: '4. Constructie – isolatieframewerk (los van muur)', categoryFilter: 'Hout' },
  { key: 'isolatie_hoofd', label: '5. Isolatie – thermische laag (hoofdwaarde)', categoryFilter: 'Isolatie' },
  { key: 'damprem', label: '6. Damprem – binnenzijde (klimaatfolie)', categoryFilter: 'Folies & Tape' },
  { key: 'regelwerk_installatie', label: '7. Regelwerk – installatiezone (leidingspouw)', categoryFilter: 'Hout' },
  { key: 'isolatie_installatie', label: '8. Isolatie – installatiezone (aanvullend)', categoryFilter: 'Isolatie' },
  { key: 'beplating', label: '9. Beplating – wandafwerking (gips/vezel)', categoryFilter: 'Plaatmateriaal' },
  { key: 'dagkanten', label: '10. Sparingen – dagkanten (diepe negge)', categoryFilter: 'Plaatmateriaal' },
  { key: 'vensterbanken', label: '11. Vensterbanken – vervanging (overzet/nieuw)', categoryFilter: 'Hout' },
  { key: 'radiator', label: '12. Installaties – radiator omleggen (leidingwerk)', categoryFilter: 'Installatie' },
  { key: 'afwerking_plafond', label: '13. Afwerking – plafondlijst', categoryFilter: 'Afwerking' },
];

const VLOER_ISO_MATS: MaterialSection[] = [
  { key: 'bodem', label: '1. Bodemafsluiting – kruipruimte (folie/zand)', categoryFilter: 'Bouwmaterialen' },
  { key: 'ventilatie', label: '2. Ventilatie – kruipruimte (renovatiekokers)', categoryFilter: 'Bouwmaterialen' },
  { key: 'isolatie_balk', label: '3. Isolatie – balklaag (tussen balken)', categoryFilter: 'Isolatie' },
  { key: 'isolatie_onder', label: '4. Isolatie – vlakke vloer (onderzijde/kruipruimte)', categoryFilter: 'Isolatie' },
  { key: 'isolatie_boven', label: '5. Isolatie – dekvloer (bovenzijde/woonkamer)', categoryFilter: 'Isolatie' },
  { key: 'bevestiging_opsluiting', label: '6. Bevestiging – opsluiting (latten/draad)', categoryFilter: 'Bevestiging' },
  { key: 'bevestiging_mech', label: '7. Bevestiging – mechanisch (isolatiepluggen)', categoryFilter: 'Bevestiging' },
  { key: 'luchtdichting', label: '8. Luchtdichting – randen (PUR/kit)', categoryFilter: 'Lijmen & Kitten' },
  { key: 'folie_damp', label: '9. Folie – dampremmend (bovenzijde)', categoryFilter: 'Folies & Tape' },
  { key: 'kruipluik_iso', label: '10. Kruipluik – isolatie & tochtwering', categoryFilter: 'Isolatie' },
  { key: 'kruipluik_kader', label: '11. Kruipluik – matrand/kader', categoryFilter: 'IJzerwaren' },
  { key: 'blindvloer', label: '12. Afwerking – houten blindvloer (onderzijde)', categoryFilter: 'Hout' },
  { key: 'installaties', label: '13. Installaties – electra aanpassing (dozen/buis)', categoryFilter: 'Elektra' },
  { key: 'plinten', label: '14. Afwerking – plinten (vloer)', categoryFilter: 'Afwerking' },
];




// --- KEUKENS (NIEUW) ---
const KEUKEN_MATS: MaterialSection[] = [
  { key: 'montage', label: 'Montagemateriaal / Kleinmateriaal', categoryFilter: 'Bevestiging' },
  { key: 'blad', label: 'Werkblad & afwerking', categoryFilter: 'Plaatmateriaal' },
  { key: 'apparatuur', label: 'Aansluitmateriaal apparatuur', categoryFilter: 'Installatie' },
  { key: 'afwerking', label: 'Plinten & Passtukken', categoryFilter: 'Afwerking' },
];




// --- INTERIEUR & KASTEN (NIEUW) ---
const INTERIEUR_MATS: MaterialSection[] = [
  { key: 'constructie', label: 'Basismateriaal / Corpus', categoryFilter: 'Plaatmateriaal' },
  { key: 'fronten', label: 'Fronten & Zichtwerk', categoryFilter: 'Plaatmateriaal' },
  { key: 'beslag', label: 'Scharnieren & Ladegeleiders', categoryFilter: 'Deurbeslag' },
  { key: 'inrichting', label: 'Interieurinrichting (roedes/planken)', categoryFilter: 'Kastinterieur' },
  { key: 'afwerking', label: 'Afwerking & Lakwerk', categoryFilter: 'Afwerking' },
];




// --- AFWERKINGEN (DETAILED) ---

const VENSTERBANK_MATS: MaterialSection[] = [
  { key: 'voorbereiding', label: 'Voorbereiding – uitvlakken (ondergrond)', categoryFilter: 'Uitvlakken' },
  { key: 'vensterbank_nieuw', label: 'Vensterbank – paneel (nieuw)', categoryFilter: 'Vensterbanken' },
  { key: 'vensterbank_overzet', label: 'Vensterbank – overzet (renovatie)', categoryFilter: 'Vensterbanken' },
  { key: 'montage', label: 'Bevestiging – montage (kit/schuim)', categoryFilter: 'Lijmen' },
  { key: 'ondersteuning', label: 'Ondersteuning – beugels/klossen', categoryFilter: 'Bevestiging' },
  { key: 'kopschotten', label: 'Afwerking – kopschotten (zijkant)', categoryFilter: 'Accessoires' }, // Vensterbanken accessories
  { key: 'kitnaden', label: 'Afwerking – kitnaden', categoryFilter: 'Kit' },
  { key: 'schilderwerk', label: 'Afwerking – schilderwerk (lak)', categoryFilter: 'Verf' },
  { key: 'dagkanten', label: 'Aansluiting – dagkanten (herstel)', categoryFilter: 'Plaatmateriaal' },
  { key: 'radiator', label: 'Radiator – ombouw/rooster', categoryFilter: 'Ventilatie' },
];

const DAGKANT_MATS: MaterialSection[] = [
  { key: 'voorbereiding', label: 'Voorbereiding – uitvulling (regelwerk)', categoryFilter: 'Balkhout' },
  { key: 'isolatie', label: 'Isolatie – koudebrug (dunne plaat)', categoryFilter: 'Isolatie' },
  { key: 'aftimmering', label: 'Aftimmering – dagkantstukken (MDF/Hout)', categoryFilter: 'Plaatmateriaal' },
  { key: 'beplating', label: 'Beplating – gips/stucplaat', categoryFilter: 'Plaatmateriaal' },
  { key: 'prefab', label: 'Prefab – kunststof/melamine', categoryFilter: 'Vensterbanken' }, // Often categorized with sills
  { key: 'montage', label: 'Bevestiging – montage (lijm/schuim)', categoryFilter: 'Lijmen' },
  { key: 'koplatten', label: 'Afwerking – koplatten (architraaf)', categoryFilter: 'Lijstwerk' },
  { key: 'hoekprofielen', label: 'Afwerking – hoekprofielen', categoryFilter: 'Profielen' },
  { key: 'aansluiting', label: 'Aansluiting – kozijn (kit/band)', categoryFilter: 'Kit' },
  { key: 'schilderwerk', label: 'Afwerking – schilderwerk', categoryFilter: 'Verf' },
];

const PLINTEN_MATS: MaterialSection[] = [
  { key: 'hoge_plinten', label: 'Hoge plinten – muur', categoryFilter: 'Plinten' },
  { key: 'systeemplinten', label: 'Systeemplinten – kabelgoot', categoryFilter: 'Plinten' },
  { key: 'plakplinten', label: 'Plakplinten – vlak', categoryFilter: 'Plinten' },
  { key: 'plafond_kroon', label: 'Plafondlijsten – kroon/hol', categoryFilter: 'Lijstwerk' },
  { key: 'plafond_plat', label: 'Plafondlijsten – plat', categoryFilter: 'Lijstwerk' },
  { key: 'architraven', label: 'Koplatten – architraven', categoryFilter: 'Lijstwerk' },
  { key: 'neuten', label: 'Neuten – overgangsstukken', categoryFilter: 'Lijstwerk' },
  { key: 'verlijming', label: 'Bevestiging – verlijmen (High Tack)', categoryFilter: 'Lijmen' },
  { key: 'mechanisch', label: 'Bevestiging – mechanisch (Schroef/Clip)', categoryFilter: 'Bevestiging' },
  { key: 'afkitten', label: 'Afwerking – afkitten', categoryFilter: 'Kit' },
  { key: 'schilderwerk', label: 'Afwerking – schilderwerk', categoryFilter: 'Verf' },
  { key: 'reparaties', label: 'Reparaties – muurherstel', categoryFilter: 'Vulmiddelen' },
];

const OMKASTING_KOVEN_MATS: MaterialSection[] = [
  { key: 'voorbereiding', label: 'Voorbereiding – uitvulling', categoryFilter: 'Balkhout' },
  { key: 'constructie', label: 'Constructie – basisframe', categoryFilter: 'Balkhout' },
  { key: 'isolatie', label: 'Isolatie – akoestisch', categoryFilter: 'Isolatie' },
  { key: 'stucbasis', label: 'Beplating – stucbasis (gips)', categoryFilter: 'Plaatmateriaal' },
  { key: 'schilderwerk_plaat', label: 'Beplating – schilderwerk (MDF)', categoryFilter: 'Plaatmateriaal' },
  { key: 'rad_front', label: 'Radiator – frontpaneel (webbing)', categoryFilter: 'Plaatmateriaal' }, // or Decoratie
  { key: 'rad_rooster', label: 'Radiator – warmtedoorlat (roosters)', categoryFilter: 'Ventilatie' },
  { key: 'rad_blad', label: 'Radiator – vensterbank (bovenblad)', categoryFilter: 'Vensterbanken' },
  { key: 'gordijnkof', label: 'Gordijnkof – versteviging', categoryFilter: 'Balkhout' },
  { key: 'luik', label: 'Toegang – inspectieluik', categoryFilter: 'Luiken' },
  { key: 'deuren', label: 'Toegang – deuren/scharnieren', categoryFilter: 'Deurbeslag' },
  { key: 'elektra', label: 'Elektra – spotjes', categoryFilter: 'Verlichting' },
  { key: 'hoekprofielen', label: 'Afwerking – hoekprofielen', categoryFilter: 'Profielen' },
  { key: 'naden', label: 'Afwerking – naden & kieren', categoryFilter: 'Kit' },
  { key: 'schilderwerk', label: 'Afwerking – schilderwerk', categoryFilter: 'Verf' },
];


// --- DEUREN (DETAILED) ---


const DEUR_BINNEN_MATS: MaterialSection[] = [
  // Deurblad
  { key: 'deurblad', label: 'Binnendeuren', categoryFilter: 'deuren', category: 'Deuren' },

  // Beslag & sloten
  { key: 'scharnieren', label: 'Scharnieren', categoryFilter: 'deurbeslag', category: 'deurbeslag' },
  { key: 'slotmechanisme', label: 'Sloten', categoryFilter: 'deurbeslag', category: 'deurbeslag' },
  { key: 'deurbeslag_kruk', label: 'Deurbeslag', categoryFilter: 'deurbeslag', category: 'deurbeslag' },
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
  { key: 'deurbeslag_kruk', label: 'Deurbeslag', categoryFilter: 'deurbeslag', category: 'deurbeslag' },
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





// --- DAKRENOVATIE (DETAILED) ---

const DAK_HELLEND_MATS: MaterialSection[] = [
  { key: 'onderdak', label: 'Onderdak – folie (dampopen)', categoryFilter: 'Folies' },
  { key: 'tengels', label: 'Regelwerk – tengels (verticaal)', categoryFilter: 'Balkhout' },
  { key: 'panlatten', label: 'Regelwerk – panlatten (horizontaal)', categoryFilter: 'Balkhout' },
  { key: 'dakpannen', label: 'Dakbedekking – dakpannen (vlak)', categoryFilter: 'Dakpannen' },
  { key: 'nok', label: 'Nokafwerking – ruiter & vorsten', categoryFilter: 'Dakpannen' },
  { key: 'gevelpannen', label: 'Randafwerking – gevelpannen', categoryFilter: 'Dakpannen' },
  { key: 'windveren', label: 'Randafwerking – windveren (timmerwerk)', categoryFilter: 'Tuinhout' },
  { key: 'dakvoet', label: 'Dakvoet – vogelschroot & panlat', categoryFilter: 'Dakpannen' }, // or Accessoires
  { key: 'kilkepers', label: 'Kilkepers – lood & constructie', categoryFilter: 'Dakbedekking' },
  { key: 'hoekkepers', label: 'Hoekkepers – ruiter & vorsten', categoryFilter: 'Dakpannen' },
  { key: 'ventilatie', label: 'Doorvoeren – ventilatiepannen', categoryFilter: 'Dakpannen' },
  { key: 'dakraam', label: 'Doorvoeren – dakraam aansluiting', categoryFilter: 'Dakramen' },
  { key: 'schoorsteen', label: 'Schoorsteen – loodloketten', categoryFilter: 'Dakbedekking' },
];

const DAK_EPDM_MATS: MaterialSection[] = [
  { key: 'primer', label: 'Ondergrond – voorbehandeling', categoryFilter: 'Lijmen' },
  { key: 'damprem', label: 'Damprem – folie (onder isolatie)', categoryFilter: 'Folies' },
  { key: 'isolatie', label: 'Isolatie – PIR platen (EPDM)', categoryFilter: 'Isolatie' },
  { key: 'bevestiging_iso', label: 'Bevestiging – isolatie (drukverdeel)', categoryFilter: 'Bevestiging' },
  { key: 'epdm', label: 'Dakbedekking – EPDM membraan', categoryFilter: 'EPDM' },
  { key: 'lijm_vlak', label: 'Lijm – vlak (bodemlijm)', categoryFilter: 'Lijmen' },
  { key: 'lijm_rand', label: 'Lijm – randen & opstanden (contact)', categoryFilter: 'Lijmen' },
  { key: 'kimfixatie', label: 'Kimfixatie – russisch (strip)', categoryFilter: 'Bevestiging' },
  { key: 'hwa', label: 'Afvoer – HWA (stadsuitloop)', categoryFilter: 'Riolering' },
  { key: 'noodoverstort', label: 'Afvoer – noodoverstort (spuwer)', categoryFilter: 'Riolering' },
  { key: 'daktrim', label: 'Randafwerking – daktrim (alu)', categoryFilter: 'Daktrim' },
  { key: 'knelstrip', label: 'Muuraansluiting – knelstrip', categoryFilter: 'Profielen' },
  { key: 'loodvervanger', label: 'Muuraansluiting – loodvervanger', categoryFilter: 'Dakbedekking' },
  { key: 'hoeken', label: 'Hoeken – prefab (binnen/buiten)', categoryFilter: 'EPDM' },
  { key: 'lichtkoepel', label: 'Lichtkoepel – opstand & inwerken', categoryFilter: 'Dakramen' },
];

const DAK_GOLFPLAAT_MATS: MaterialSection[] = [
  { key: 'gordingen', label: 'Constructie – gordingen', categoryFilter: 'Balkhout' },
  { key: 'folie', label: 'Folie – anti-condens (onder metaal)', categoryFilter: 'Folies' },
  { key: 'golfplaten', label: 'Dakbedekking – golfplaten (dicht)', categoryFilter: 'Golfplaten' },
  { key: 'lichtplaten', label: 'Dakbedekking – lichtplaten', categoryFilter: 'Golfplaten' },
  { key: 'schroeven', label: 'Bevestiging – schroeven (top)', categoryFilter: 'Bevestiging' },
  { key: 'afstandhouders', label: 'Ondersteuning – afstandhouders', categoryFilter: 'Bevestiging' },
  { key: 'nok', label: 'Nokafwerking – nokstukken', categoryFilter: 'Golfplaten' },
  { key: 'windveren', label: 'Randafwerking – windveren (gevel)', categoryFilter: 'Golfplaten' },
  { key: 'afdichting', label: 'Afdichting – profielvulling', categoryFilter: 'Isolatie' },
  { key: 'muurprofiel', label: 'Aansluiting – muurprofiel', categoryFilter: 'Profielen' },
  { key: 'doorvoer', label: 'Doorvoeren – buisdoorvoer', categoryFilter: 'Riolering' },
];

// Re-using the Boeiboord definition from previous context as it wasn't redefined in the input
const BOEIBOORD_MATS: MaterialSection[] = [
  { key: 'achterhout', label: 'Achterhout / Ventilatie', categoryFilter: 'Balkhout' },
  { key: 'bekleding', label: 'Boeideel bekleding', categoryFilter: 'Gevelbekleding' },
  { key: 'randafwerking', label: 'Randprofielen / Trim', categoryFilter: 'Profielen' },
  { key: 'bevestiging', label: 'Bevestigingsmateriaal', categoryFilter: 'Bevestiging' },
];




// --- GEVELBEKLEDING (DETAILED) ---

const GEVEL_HOUT_MATS: MaterialSection[] = [
  { key: 'folie', label: 'Folie – achterwand (UV-bestendig)', categoryFilter: 'Folies' },
  { key: 'regelwerk_basis', label: 'Regelwerk – basislaag (ventilatie)', categoryFilter: 'Balkhout' },
  { key: 'regelwerk_kruis', label: 'Regelwerk – kruislaag (bij verticaal)', categoryFilter: 'Balkhout' },
  { key: 'ventilatie', label: 'Ventilatie – ongediertewering', categoryFilter: 'Ventilatie' },
  { key: 'bekleding', label: 'Gevelbekleding – planken (profielhout)', categoryFilter: 'Gevelbekleding' },
  { key: 'bevestiging_zicht', label: 'Bevestiging – zichtbaar (tacker/schroef)', categoryFilter: 'Bevestiging' },
  { key: 'bevestiging_blind', label: 'Bevestiging – blind (clips/B-fix)', categoryFilter: 'Bevestiging' },
  { key: 'hoekafwerking', label: 'Hoekafwerking – buitenhoek (profiel/verstek)', categoryFilter: 'Tuinhout' },
  { key: 'dagkanten', label: 'Dagkanten – afwerking (negge)', categoryFilter: 'Tuinhout' },
  { key: 'waterslagen', label: 'Waterslagen – aanpassing', categoryFilter: 'Daktrim' }, // Or Profielen
  { key: 'aansluiting_dak', label: 'Aansluiting – dakrand (kopschot)', categoryFilter: 'Tuinhout' },
  { key: 'aansluiting_maaiveld', label: 'Aansluiting – maaiveld (spatrand)', categoryFilter: 'Profielen' },
  { key: 'behandeling', label: 'Behandeling – coating (olie/verf)', categoryFilter: 'Verf' },
];

const GEVEL_KUNSTSTOF_MATS: MaterialSection[] = [
  { key: 'folie', label: 'Folie – achterwand (dampopen/zwart)', categoryFilter: 'Folies' },
  { key: 'regelwerk', label: 'Regelwerk – basislaag (ventilatie)', categoryFilter: 'Balkhout' },
  { key: 'ventilatie', label: 'Ventilatie – ongediertewering', categoryFilter: 'Ventilatie' },
  { key: 'startprofiel', label: 'Startprofiel – basis (aluminium)', categoryFilter: 'Profielen' },
  { key: 'panelen', label: 'Gevelpanelen – vlakvulling', categoryFilter: 'Gevelbekleding' }, // Sponningdeel/Potdeksel
  { key: 'dakrandpanelen', label: 'Dakrandpanelen – boeiboord', categoryFilter: 'Gevelbekleding' },
  { key: 'bevestiging', label: 'Bevestiging – montage (RVS torx)', categoryFilter: 'Bevestiging' },
  { key: 'koppeling', label: 'Koppeling – verlenging (tussenstuk)', categoryFilter: 'Profielen' },
  { key: 'buitenhoek', label: 'Hoekafwerking – buitenhoek', categoryFilter: 'Profielen' },
  { key: 'binnenhoek', label: 'Hoekafwerking – binnenhoek', categoryFilter: 'Profielen' },
  { key: 'eindprofiel', label: 'Randafwerking – eindprofiel', categoryFilter: 'Profielen' },
  { key: 'dagkanten', label: 'Dagkanten – afwerking (negge)', categoryFilter: 'Gevelbekleding' },
  { key: 'daktrim', label: 'Aansluiting – daktrim (bij boeiboord)', categoryFilter: 'Daktrim' },
  { key: 'waterslagen', label: 'Waterslagen – aanpassing', categoryFilter: 'Daktrim' },
];





//-------------------------------------------------------------------------------------------------------------------------------------














//kozijnen



// ✅ KOZIJNEN (HOUT) – BINNEN
const KOZIJN_BINNEN_HOUT_MATS: MaterialSection[] = [
  // Kozijn / hout
  { key: 'kozijnhout', label: 'Kozijnhout', categoryFilter: 'kozijnen', category: 'Kozijnen' },
  { key: 'aftimmerlatten', label: 'Aftimmerlatten', categoryFilter: 'kozijnen', category: 'Kozijnen' },

  // Beslag (simpel binnen)
  { key: 'scharnieren', label: 'Scharnieren', categoryFilter: 'deurbeslag', category: 'deurbeslag' },
  { key: 'slotmechanisme', label: 'Sloten', categoryFilter: 'deurbeslag', category: 'deurbeslag' },
  { key: 'kozijnbeslag', label: 'Kozijnbeslag', categoryFilter: 'deurbeslag', category: 'deurbeslag' },

  // Afwerken
  { key: 'montage', label: 'Montage & Bevestiging', categoryFilter: 'afwerking', category: 'afwerking' },
  { key: 'kitten', label: 'Kit & Afdichting', categoryFilter: 'afwerking', category: 'afwerking' },
];

const KOZIJN_BINNEN_STAAL_MATS: MaterialSection[] = [
  { key: 'basisset', label: 'Kozijn – basisset', categoryFilter: 'Kozijnen' },
  { key: 'garnituur', label: 'Kozijn – garnituur (montageset)', categoryFilter: 'Bevestiging' },
  { key: 'bovenlicht', label: 'Bovenlicht – glas/paneel', categoryFilter: 'Glas' },
  { key: 'glaslatten', label: 'Bovenlicht – glaslatten (klik)', categoryFilter: 'Profielen' },
  { key: 'dichting', label: 'Dichting – kaderprofiel', categoryFilter: 'Tochtstrips' },
  { key: 'scharnieren', label: 'Scharnieren – kozijndeel', categoryFilter: 'Deurbeslag' },
  { key: 'sluitplaat', label: 'Sponning – sluitplaat', categoryFilter: 'Deurbeslag' },
  { key: 'demping', label: 'Sponning – aanslagdopjes', categoryFilter: 'Deurbeslag' },
  { key: 'lakstift', label: 'Afwerking – lakstift', categoryFilter: 'Verf' },
  { key: 'kitnaden', label: 'Afwerking – kitnaden', categoryFilter: 'Kit' },
];

// ✅ KOZIJNEN (HOUT) – BUITEN (incl. RAMEN + volledig “deuren-achtige” beslag-structuur)
const KOZIJN_BUITEN_HOUT_MATS: MaterialSection[] = [
  // Kozijn / hout
  { key: 'kozijnhout', label: 'Kozijnhout (buiten)', categoryFilter: 'kozijnen', category: 'Kozijnen' },
  { key: 'raamhout', label: 'Raamhout / Vleugels', categoryFilter: 'ramen', category: 'Kozijnen' },

  // Glas
  { key: 'glas', label: 'Glas', categoryFilter: 'glas', category: 'glas' },
  { key: 'glaslatten', label: 'Glaslatten', categoryFilter: 'glas', category: 'glas' },

  // Raambeslag (zelfde diepte als deuren)
  { key: 'raamscharnieren', label: 'Scharnieren', categoryFilter: 'raambeslag', category: 'deurbeslag' },
  { key: 'raamsluiting', label: 'Raamsluiting', categoryFilter: 'raambeslag', category: 'deurbeslag' },
  { key: 'draaikiepbeslag', label: 'Draaikiepbeslag', categoryFilter: 'raambeslag', category: 'deurbeslag' },
  { key: 'raamkruk', label: 'Raamkruk', categoryFilter: 'raambeslag', category: 'deurbeslag' },
  { key: 'raamcilinder', label: 'Raamcilinder', categoryFilter: 'raambeslag', category: 'deurbeslag' },

  // Tochtwering
  { key: 'valdorp', label: 'Tochtvaldorp', categoryFilter: 'tochtstrips', category: 'tochtstrips' },
  { key: 'tochtstrips', label: 'Tochtstrips', categoryFilter: 'tochtstrips', category: 'tochtstrips' },

  // Ventilatie
  { key: 'ventilatierooster', label: 'Ventilatieroosters', categoryFilter: 'ventilatie', category: 'ventilatie' },

  // Afwerken / montage
  { key: 'montage', label: 'Montage & Bevestiging', categoryFilter: 'afwerking', category: 'afwerking' },
  { key: 'kitten', label: 'Kit & Afdichting', categoryFilter: 'afwerking', category: 'afwerking' },
];

const KOZIJN_BUITEN_KUNSTSTOF_MATS: MaterialSection[] = [
  { key: 'profiel', label: 'Kozijnprofiel – basis', categoryFilter: 'Kozijnen' }, // Vlak/Verdiept
  { key: 'onderdorpel', label: 'Onderdorpel – deur/laag', categoryFilter: 'Dorpels' }, // DTS/Isostone
  { key: 'draaidelen', label: 'Draaidelen – ramen/deuren', categoryFilter: 'Kozijnen' },
  { key: 'glas', label: 'Glas – isolatieglas (HR++/Triple)', categoryFilter: 'Glas' },
  { key: 'ventilatie', label: 'Ventilatie – roosters', categoryFilter: 'Ventilatie' },
  { key: 'stelkozijn', label: 'Montage – stelkozijn', categoryFilter: 'Balkhout' }, // Kunststof/Hout
  { key: 'ankers', label: 'Montage – ankers', categoryFilter: 'Bevestiging' },
  { key: 'compriband', label: 'Dichting – compriband', categoryFilter: 'Tape' },
  { key: 'luchtdichting', label: 'Dichting – luchtdichting', categoryFilter: 'Kit' }, // PUR/Kit
  { key: 'dagkanten', label: 'Afwerking – dagkanten', categoryFilter: 'Profielen' },
  { key: 'waterslag', label: 'Afwerking – waterslag', categoryFilter: 'Daktrim' },
  { key: 'accessoires', label: 'Accessoires – inzethorren', categoryFilter: 'Accessoires' },
];

const KOZIJN_ZELF_MATS: MaterialSection[] = [
  { key: 'houtstaat', label: 'Houtstaat – balkhout (Massief)', categoryFilter: 'Balkhout' },
  { key: 'verbindingen', label: 'Bewerking – verbindingen', categoryFilter: 'Bevestiging' }, // Pen-en-gat/Deuvel
  { key: 'onderdorpel', label: 'Onderdorpel – detail', categoryFilter: 'Dorpels' },
  { key: 'raamhout', label: 'Draaidelen – raamhout', categoryFilter: 'Balkhout' }, // Zelfbouw vleugel
  { key: 'verlijming', label: 'Assemblage – verlijming', categoryFilter: 'Lijmen' }, // Bruislijm D4
  { key: 'beslag', label: 'Hang- & Sluitwerk – infrezen', categoryFilter: 'Deurbeslag' },
  { key: 'tochtwering', label: 'Tochtwering – kaderprofiel', categoryFilter: 'Tochtstrips' },
  { key: 'glaslatten', label: 'Glaslatten – maatwerk', categoryFilter: 'Latten' },
  { key: 'glas', label: 'Glas – bestelling (Maatwerk)', categoryFilter: 'Glas' },
  { key: 'conservering', label: 'Conservering – grondverf', categoryFilter: 'Verf' },
  { key: 'plaatsing', label: 'Montage – plaatsing (Stelwerk)', categoryFilter: 'Bevestiging' },
  { key: 'lood_latten', label: 'Afwerking – aansluiting', categoryFilter: 'Afwerking' }, // Lood/Latten
];




// --- SCHUTTINGEN (DETAILED) ---

const HOUT_SCHUTTING_MATS: MaterialSection[] = [
  { key: 'palen', label: 'Palen – hardhout/geïmpregneerd', categoryFilter: 'Tuinhout' },
  { key: 'vulling', label: 'Vulling – tuinschermen/planken', categoryFilter: 'Tuinhout' },
  { key: 'bevestiging', label: 'Bevestiging – L-beslag & schroeven', categoryFilter: 'IJzerwaren' },
  { key: 'fundering', label: 'Fundering – snelbeton', categoryFilter: 'Bouwmaterialen' },
  { key: 'poort', label: 'Poort – deur & kozijn (optioneel)', categoryFilter: 'Tuinhout' },
  { key: 'poortbeslag', label: 'Poortbeslag – hang- & sluitwerk', categoryFilter: 'Deurbeslag' },
];

const BETON_HOUT_MATS: MaterialSection[] = [
  { key: 'betonpalen', label: 'Palen – betonpalen', categoryFilter: 'Bestrating & Tuin' },
  { key: 'onderplaten', label: 'Onderplaten – beton', categoryFilter: 'Bestrating & Tuin' },
  { key: 'schermen', label: 'Vulling – houten schermen', categoryFilter: 'Tuinhout' },
  { key: 'montageset', label: 'Montage – beslagset betonpaal', categoryFilter: 'IJzerwaren' },
  { key: 'afdeklat', label: 'Afwerking – afdeklat (optioneel)', categoryFilter: 'Tuinhout' },
];

const COMPOSIET_SCHUTTING_MATS: MaterialSection[] = [
  { key: 'systeem', label: 'Systeem – palen & strips', categoryFilter: 'Composiet' },
  { key: 'vulling', label: 'Vulling – composiet panelen', categoryFilter: 'Composiet' },
  { key: 'bevestiging', label: 'Bevestiging – clips & ankers', categoryFilter: 'IJzerwaren' },
  { key: 'verlichting', label: 'Verlichting – inbouwspots (optioneel)', categoryFilter: 'Elektra' },
];




// --- OVERKAPPING & HOUTBOUW ---
const HOUTBOUW_MATS: MaterialSection[] = [
  { key: 'fundering', label: 'Fundering / Betonpoeren', categoryFilter: 'Beton' },
  { key: 'constructie', label: 'Constructiehout', categoryFilter: 'Tuinhout' },
  { key: 'wanden', label: 'Wandbekleding', categoryFilter: 'Gevelbekleding' },
  { key: 'dak', label: 'Dakconstructie & Bedekking', categoryFilter: 'Dakbedekking' },
  { key: 'afvoer', label: 'Hemelwaterafvoer', categoryFilter: 'Riolering' },
  { key: 'bevestiging', label: 'Bevestigingsmateriaal', categoryFilter: 'Bevestiging' },
];




// --- TRAPPEN ---
const VLIZOTRAP_MATS: MaterialSection[] = [
  { key: 'vlizotrap', label: 'Vlizotrap – cassette unit', categoryFilter: 'Vlizotrappen' },
  { key: 'raveelwerk', label: 'Balkhout – raveelconstructie', categoryFilter: 'Balkhout' },
  { key: 'aftimmering', label: 'Aftimmering – plafondluik', categoryFilter: 'Afwerking' },
  { key: 'luchtdichting', label: 'Luchtdichting – naden & kieren', categoryFilter: 'Tape' },
  { key: 'veiligheid', label: 'Veiligheid – hekwerk zolder', categoryFilter: 'Veiligheid' },
];
const TRAPRENOVATIE_OVERZETTREDEN_MATS: MaterialSection[] = [
  { key: 'treden', label: 'Treden – overzetstukken', categoryFilter: 'Treden' },
  { key: 'stootborden', label: 'Stootborden – tegentreden', categoryFilter: 'Plaatmateriaal' },
  { key: 'wangen', label: 'Wangen – zijwangbekleding', categoryFilter: 'Plaatmateriaal' },
  { key: 'bevestiging', label: 'Bevestiging – montagekit', categoryFilter: 'Lijmen' },
  { key: 'veiligheid', label: 'Veiligheid – antislip strips', categoryFilter: 'Veiligheid' },
  { key: 'trapleuning', label: 'Trapleuning – leuning & houders', categoryFilter: 'Leuningen' },
  { key: 'afwerking', label: 'Afwerking – kitnaden', categoryFilter: 'Afwerking' },
];
const NIEUWE_TRAP_PLAATSEN_MATS: MaterialSection[] = [
  { key: 'trap', label: 'Trap – bouwpakket / maatwerk', categoryFilter: 'Trappen' },
  { key: 'montage', label: 'Montage – verankering & bevestiging', categoryFilter: 'Bevestiging' },
  { key: 'hekwerk', label: 'Hekwerk – balustrade vide', categoryFilter: 'Veiligheid' },
  { key: 'trapleuning', label: 'Trapleuning – wandmontage', categoryFilter: 'Leuningen' },
  { key: 'aftimmering', label: 'Aftimmering – trapgat & raveel', categoryFilter: 'Afwerking' },
];



// ---HOUTROTREPARATIE---
const HOUTROTREPARATIE_MATS: MaterialSection[] = [
  { key: 'voorbereiding', label: 'Voorbereiding – freeswerk & houtrotstop', categoryFilter: 'Voorbereiding' },
  { key: 'hout', label: 'Hout – inzetstukken', categoryFilter: 'Balkhout' },
  { key: 'vulmiddel', label: 'Vulmiddel – 2-componenten epoxy', categoryFilter: 'Vulmiddelen' },
  { key: 'afwerking', label: 'Afwerking – schuren & gronden', categoryFilter: 'Afwerking' },
];



// --- KEUKENS (DETAILED) ---

const KEUKEN_MONTAGE_MATS: MaterialSection[] = [
  { key: 'montage', label: 'Boven & onderkasten', categoryFilter: 'Bevestiging' },
  { key: 'werkblad', label: 'Werkblad & achterwand', categoryFilter: 'Plaatmateriaal' },
  { key: 'apparatuur', label: 'Apparatuur – inbouw & aansluiting', categoryFilter: 'Installatie' },
  { key: 'afwerking', label: 'Afwerking – plinten, passtukken & koof', categoryFilter: 'Afwerking' },
  { key: 'accessoires', label: 'Accessoires – spoelbak/kraan/grepen', categoryFilter: 'Accessoires' },
];

const KEUKEN_RENOVATIE_MATS: MaterialSection[] = [
  { key: 'fronten', label: 'Fronten – deurtjes & panelen', categoryFilter: 'Plaatmateriaal' },
  { key: 'werkblad', label: 'Werkblad – vervanging', categoryFilter: 'Plaatmateriaal' },
  { key: 'scharnieren', label: 'Hang- & Sluitwerk – scharnieren/laderails', categoryFilter: 'Deurbeslag' },
  { key: 'apparatuur', label: 'Apparatuur – vervanging', categoryFilter: 'Installatie' },
  { key: 'grepen', label: 'Afwerking – handgrepen & beslag', categoryFilter: 'Deurbeslag' },
];





// --- INTERIEUR & KASTEN (DETAILED) ---

const INBOUWKAST_MATS: MaterialSection[] = [
  { key: 'corpus', label: 'Corpus – plaatmateriaal interieur', categoryFilter: 'Plaatmateriaal' },
  { key: 'fronten', label: 'Fronten – deuren & zichtwerk', categoryFilter: 'Plaatmateriaal' },
  { key: 'inrichting', label: 'Inrichting – planken/lades/roedes', categoryFilter: 'Interieur' },
  { key: 'beslag', label: 'Beslag – scharnieren & ladegeleiders', categoryFilter: 'Deurbeslag' },
  { key: 'afwerking', label: 'Afwerking – paslatten & plinten', categoryFilter: 'Afwerking' },
];

const ENSUITE_MATS: MaterialSection[] = [
  { key: 'constructie', label: 'Constructie – stijl- & regelwerk', categoryFilter: 'Hout' },
  { key: 'ombouw', label: 'Ombouw – beplating & kasten', categoryFilter: 'Plaatmateriaal' },
  { key: 'deuren', label: 'Deuren – schuifdeuren & panelen', categoryFilter: 'Deuren' },
  { key: 'railsysteem', label: 'Railsysteem – rails & rollers', categoryFilter: 'Deurbeslag' },
  { key: 'afwerking', label: 'Afwerking – lijsten & architraven', categoryFilter: 'Afwerking' },
];

const RADIATOR_MATS: MaterialSection[] = [
  { key: 'basis', label: 'Basis – raamwerk & constructie', categoryFilter: 'Hout' },
  { key: 'bekleding', label: 'Bekleding – frontpaneel & roosters', categoryFilter: 'Plaatmateriaal' },
  { key: 'vensterbank', label: 'Topblad – vensterbank/blad', categoryFilter: 'Hout' },
  { key: 'montage', label: 'Montage – bevestigingsmateriaal', categoryFilter: 'Bevestiging' },
  { key: 'afwerking', label: 'Afwerking – lakwerk/olie', categoryFilter: 'Verf & Afwerking' },
];

const MEUBEL_MATS: MaterialSection[] = [
  { key: 'basismateriaal', label: 'Basismateriaal – massief/plaat', categoryFilter: 'Hout' },
  { key: 'onderstel', label: 'Onderstel – poten/frame', categoryFilter: 'IJzerwaren' },
  { key: 'verbindingen', label: 'Verbindingen – lijm/deuvels/schroeven', categoryFilter: 'Bevestiging' },
  { key: 'afwerking', label: 'Afwerking – lak/beits/olie', categoryFilter: 'Verf & Afwerking' },
];



// --- DAKKAPELLEN (DETAILED) ---

const DAKKAPEL_NIEUW_MATS: MaterialSection[] = [
  { key: 'casco', label: 'Casco – balkhout & constructieplaat', categoryFilter: 'Hout' },
  { key: 'dak', label: 'Dak – EPDM/Bitumen & isolatie', categoryFilter: 'Dakmaterialen' },
  { key: 'kozijn', label: 'Kozijn – kunststof/hout & glas', categoryFilter: 'Deuren & Kozijnen' },
  { key: 'bekleding', label: 'Bekleding – zijwangen & boeiboord', categoryFilter: 'Gevelbekleding' },
  { key: 'lood', label: 'Waterdichting – lood/vervangende loodslab', categoryFilter: 'Dakmaterialen' },
  { key: 'binnen', label: 'Binnenafwerking – vensterbank & gips', categoryFilter: 'Afwerking' },
];

const DAKKAPEL_RENOVATIE_MATS: MaterialSection[] = [
  { key: 'bekleding', label: 'Bekleding – vervanging wangen/front', categoryFilter: 'Gevelbekleding' },
  { key: 'dakbedekking', label: 'Dakbedekking – vervanging laag & trim', categoryFilter: 'Dakmaterialen' },
  { key: 'boeiboord', label: 'Boeiboord – afwerking dakrand', categoryFilter: 'Plaatmateriaal' },
  { key: 'lood', label: 'Lood – vervanging aansluiting', categoryFilter: 'Dakmaterialen' },
  { key: 'isolatie', label: 'Na-isolatie – (optioneel)', categoryFilter: 'Isolatie' },
];



// --- GLAS ZETTEN (DETAILED) ---

const ISOLATIEGLAS_MATS: MaterialSection[] = [
  { key: 'glas', label: 'Glas – HR++ of Triple paneel', categoryFilter: 'Glas' },
  { key: 'glaslatten', label: 'Glaslatten – neuslatten & opdeklatten', categoryFilter: 'Hout' },
  { key: 'montage', label: 'Montage – glasband & blokjes', categoryFilter: 'Bouwmaterialen' },
  { key: 'kit', label: 'Afdichting – beglazingskit', categoryFilter: 'Verf & Afwerking' },
  { key: 'roosters', label: 'Ventilatie – roosters (optioneel)', categoryFilter: 'Deuren & Kozijnen' },
];

const ENKEL_GLAS_MATS: MaterialSection[] = [
  { key: 'glas', label: 'Glas – enkel/gelaagd glas', categoryFilter: 'Glas' },
  { key: 'glaslatten', label: 'Glaslatten – standaard latten', categoryFilter: 'Hout' },
  { key: 'montage', label: 'Montage – glasband/kroonband', categoryFilter: 'Bouwmaterialen' },
  { key: 'kit', label: 'Afdichting – beglazingskit', categoryFilter: 'Verf & Afwerking' },
];




const VELUX_MATS: MaterialSection[] = [
  { key: 'dakraam', label: 'Dakraam – tuimel/uitzetvenster', categoryFilter: 'Deuren & Kozijnen' },
  { key: 'gootstuk', label: 'Gootstuk – aansluiting dakpannen', categoryFilter: 'Dakmaterialen' },
  { key: 'waterkerend', label: 'Waterkering – manchet (BFX)', categoryFilter: 'Dakmaterialen' },
  { key: 'aftimmering', label: 'Interieur – aftimmering binnenkant', categoryFilter: 'Plaatmateriaal' },
  { key: 'raamdecoratie', label: 'Decoratie – rolgordijn/zonwering (optioneel)', categoryFilter: 'Accessoires' },
];

const LICHTKOEPEL_MATS: MaterialSection[] = [
  { key: 'koepel', label: 'Lichtkoepel – glas/kunststof schaal', categoryFilter: 'Dakmaterialen' },
  { key: 'opstand', label: 'Opstand – dakopstand', categoryFilter: 'Dakmaterialen' },
  { key: 'inplakken', label: 'Inplakken – bitumen/EPDM stroken', categoryFilter: 'Dakmaterialen' },
  { key: 'binnenafwerking', label: 'Binnenafwerking – uitsparingskader', categoryFilter: 'Plaatmateriaal' },
  { key: 'beveiliging', label: 'Beveiliging – inbraakwerend beslag', categoryFilter: 'IJzerwaren' },
];





// ==========================================
// 4. THE REGISTRY (Database)
// ==========================================


export const JOB_REGISTRY: Record<string, CategoryConfig> = {

  // --- TRAPPEN ---
  trappen: {
    title: 'Trappen',
    searchPlaceholder: 'Zoek traptype...',
    items: [
      {
        title: 'Traprenovatie (Overzettreden)',
        description: 'Overzet op bestaande trap',
        slug: 'traprenovatie-overzettreden',
        measurementLabel: 'Trap',
        measurements: STANDARD_FIELDS,
        materialSections: TRAPRENOVATIE_OVERZETTREDEN_MATS,
      },
      {
        title: 'Vlizotrap',
        description: 'Plaatsen van vlizotrap',
        slug: 'vlizotrap',
        measurementLabel: 'Trap',
        measurements: STANDARD_FIELDS,
        materialSections: VLIZOTRAP_MATS,
      },
      {
        title: 'Nieuwe trap plaatsen',
        description: 'Plaatsen van nieuwe trap',
        slug: 'nieuwe-trap-plaatsen',
        measurementLabel: 'Trap',
        measurements: STANDARD_FIELDS,
        materialSections: NIEUWE_TRAP_PLAATSEN_MATS,
      },
      { 
        title: 'Overig Trappen', 
        description: 'Afwijkende trapklussen', 
        slug: 'overig-trappen',
        measurementLabel: 'Trap',
        measurements: STANDARD_FIELDS,
        materialSections: [] 
      },
    ],
  },

  // --- HOUTROTREPARATIE ---
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
      },
    ],
  },

  // --- WANDEN ---
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
          Koof: { title: 'Leidingkoof / Omkasting', order: 4 },
          afwerking: { title: 'Afwerken', order: 5 },
          Installatie: { title: 'Installatie & Elektra', order: 6 },
          Schakelmateriaal: { title: 'Schakelmateriaal', order: 7 },
          gips_afwerking: { title: 'Naden & Stucwerk', order: 8 },
          Kozijnen: { title: 'Kozijnen', order: 9 },
          Deuren: { title: 'Deuren', order: 10 },
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

  // --- PLAFONDS ---
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

  // --- DAKKAPELLEN ---
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
        materialSections: DAKKAPEL_NIEUW_MATS 
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

  // --- INTERIEUR ---
  interieur: {
    title: 'Interieur & Kasten',
    searchPlaceholder: 'Zoek interieurklus...',
    items: [
      { 
        title: 'Inbouwkasten / Kastenwand', 
        description: 'Maatwerk (wandvullend)', 
        slug: 'inbouwkasten', 
        measurementLabel: 'Kast', 
        measurements: STANDARD_FIELDS,
        materialSections: INBOUWKAST_MATS 
      },
      { 
        title: 'Ensuite & Scheidingswanden', 
        description: 'Kamer-en-suite constructies', 
        slug: 'ensuite-scheidingswanden', 
        measurementLabel: 'Wand', 
        measurements: STANDARD_FIELDS,
        materialSections: ENSUITE_MATS 
      },
      { 
        title: 'Radiatorombouw', 
        description: 'Radiatorbekleding op maat', 
        slug: 'radiatorombouw', 
        measurementLabel: 'Ombouw', 
        measurements: STANDARD_FIELDS,
        materialSections: RADIATOR_MATS 
      },
      { 
        title: 'Meubel op maat', 
        description: 'Tafels, banken, losse kasten', 
        slug: 'meubel-op-maat', 
        measurementLabel: 'Meubel', 
        measurements: STANDARD_FIELDS,
        materialSections: MEUBEL_MATS 
      }
    ]
  },

  // --- ISOLATIEWERKEN ---
  isolatiewerken: {
    title: 'Isolatiewerken',
    searchPlaceholder: 'Zoek isolatieklus...',
    items: [
      { 
        title: 'Dak isoleren – Buitenzijde (Hellend)', 
        description: 'Isolatie op dakbeschot (Sarking)', 
        slug: 'dakisolatie-buiten', 
        measurementLabel: 'Dakvlak', 
        measurements: STANDARD_FIELDS, 
        materialSections: DAK_ISO_BUITEN_MATS 
      },
      { 
        title: 'Dak isoleren – Binnenzijde', 
        description: 'Isolatie schuin dak', 
        slug: 'dakisolatie-binnen', 
        measurementLabel: 'Dakvlak', 
        measurements: STANDARD_FIELDS, 
        materialSections: DAK_ISO_BINNEN_MATS 
      },
      { 
        title: 'Wand isoleren – Buitenzijde', 
        description: 'Gevelisolatie', 
        slug: 'wand-isolatie-buiten', 
        measurementLabel: 'Gevel', 
        measurements: STANDARD_FIELDS, 
        materialSections: WAND_ISO_BUITEN_MATS 
      },
      { 
        title: 'Wand isoleren (Binnenzijde)', 
        description: 'Voorzetwand isolatie', 
        slug: 'wand-isolatie-binnen', 
        measurementLabel: 'Wand', 
        measurements: STANDARD_FIELDS, 
        materialSections: WAND_ISO_BINNEN_MATS 
      },
      { 
        title: 'Vloer isoleren', 
        description: 'Vloer- en kruipruimte', 
        slug: 'vloer-isolatie', 
        measurementLabel: 'Vloer', 
        measurements: AREA_FIELDS, 
        materialSections: VLOER_ISO_MATS 
      }
    ]
  },

  // --- AFWERKINGEN ---
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
        materialSections: DAGKANT_MATS 
      },
      { 
        title: 'Plinten en afwerklatten', 
        description: 'Vloer- en wandafwerking', 
        slug: 'plinten-afwerklatten', 
        measurementLabel: 'Ruimte', 
        measurements: AREA_FIELDS, 
        materialSections: PLINTEN_MATS 
      },
      { 
        title: 'Omkastingen en koven', 
        description: 'Leidingen en balken wegwerken', 
        slug: 'omkastingen-koven', 
        measurementLabel: 'Omkasting', 
        measurements: COUNT_FIELDS, 
        materialSections: OMKASTING_KOVEN_MATS 
      },
      { 
        title: 'Vensterbanken', 
        description: 'Plaatsing of vervanging', 
        slug: 'vensterbanken', 
        measurementLabel: 'Vensterbank', 
        measurements: COUNT_FIELDS, 
        materialSections: VENSTERBANK_MATS 
      },
      { 
        title: 'Specifiek aftimmerwerk', 
        description: 'Maatwerk betimmering', 
        slug: 'specifiek-aftimmerwerk', 
        measurementLabel: 'Object', 
        measurements: AREA_FIELDS, 
        materialSections: OMKASTING_KOVEN_MATS 
      },
    ],
  },




  // --- DEUREN ---
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
        title: 'Overig Deuren', 
        description: 'Afwijkend deurwerk', 
        slug: 'overig-deuren', 
        measurementLabel: 'Deur', 
        measurements: COUNT_FIELDS, 
        materialSections: [] 
      },
    ],
  },

  // --- DAKRENOVATIE ---
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
        materialSections: DAK_HELLEND_MATS 
      },
      { 
        title: 'EPDM Dakbedekking', 
        description: 'Platte daken', 
        slug: 'epdm-dakbedekking', 
        measurementLabel: 'Dakvlak', 
        measurements: AREA_FIELDS, 
        materialSections: DAK_EPDM_MATS 
      },
      { 
        title: 'Golfplaat Dak', 
        description: 'Op houten constructie', 
        slug: 'golfplaat-dak', 
        measurementLabel: 'Dakvlak', 
        measurements: AREA_FIELDS, 
        materialSections: DAK_GOLFPLAAT_MATS 
      },
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
      { 
        title: 'Overig Dakrenovatie', 
        description: 'Loodwerk/Schoorsteen', 
        slug: 'overig-dakrenovatie', 
        measurementLabel: 'Dak', 
        measurements: AREA_FIELDS, 
        materialSections: [] 
      },
    ],
  },

  // --- GEVELBEKLEDING ---
  gevelbekleding: {
    title: 'Gevelbekleding',
    searchPlaceholder: 'Zoek geveltype...',
    items: [
      { 
        title: 'Houten Gevelbekleding', 
        description: 'Rabat, channelsiding, open gevel', 
        slug: 'houten-gevelbekleding', 
        measurementLabel: 'Gevel', 
        measurements: AREA_FIELDS, 
        materialSections: GEVEL_HOUT_MATS 
      },
      { 
        title: 'Keralit / Kunststof Panelen', 
        description: 'Onderhoudsarm (Sponningdeel/Potdeksel)', 
        slug: 'keralit-panelen', 
        measurementLabel: 'Gevel', 
        measurements: AREA_FIELDS, 
        materialSections: GEVEL_KUNSTSTOF_MATS 
      },
      { 
        title: 'Overig Gevelbekleding', 
        description: 'Zink/Leien/Staal', 
        slug: 'overig-gevelbekleding', 
        measurementLabel: 'Gevel', 
        measurements: AREA_FIELDS, 
        materialSections: [] 
      },
    ],
  },



















  // --- KOZIJNEN ---
  kozijnen: {
    title: 'Kozijnen & Luiken',
    searchPlaceholder: 'Zoek kozijntype...',
    items: [
      { 
        title: 'Binnen Kozijnen – Hout', 
        description: 'Stomp of opdek, inclusief aftimmering', 
        slug: 'binnen-kozijn-hout', 
        measurementLabel: 'Kozijn', 
        measurements: COUNT_FIELDS, 
        materialSections: KOZIJN_BINNEN_HOUT_MATS,
        categoryConfig: {
          Kozijnen: { title: 'Kozijn & Raam', order: 1 },
          deurbeslag: { title: 'Hang- & Sluitwerk', order: 2 },
          glas: { title: 'Glas & Beglazing', order: 3 },
          afwerking: { title: 'Montage & Afwerking', order: 4 },
        }
        
      },
      { 
        title: 'Binnen Kozijnen – Staal', 
        description: 'Taats of scharnier (industriële look)', 
        slug: 'binnen-kozijn-staal', 
        measurementLabel: 'Kozijn', 
        measurements: COUNT_FIELDS, 
        materialSections: KOZIJN_BINNEN_STAAL_MATS 
      },
      { 
        title: 'Buiten kozijnen – Hout', 
        description: 'Hardhout met glas en aflak', 
        slug: 'buiten-kozijn-hout', 
        measurementLabel: 'Kozijn', 
        measurements: COUNT_FIELDS, 
        materialSections: KOZIJN_BUITEN_HOUT_MATS,
        
      },
      { 
        title: 'Buiten Kozijnen – Kunststof', 
        description: 'Onderhoudsarm met hoge isolatiewaarde', 
        slug: 'buiten-kozijn-kunststof', 
        measurementLabel: 'Kozijn', 
        measurements: COUNT_FIELDS, 
        materialSections: KOZIJN_BUITEN_KUNSTSTOF_MATS 
      },
      { 
        title: 'Zelfgemaakte Kozijnen', 
        description: 'Ambachtelijk werk (Massief/DTS)', 
        slug: 'zelfgemaakte-kozijnen', 
        measurementLabel: 'Kozijn', 
        measurements: COUNT_FIELDS, 
        materialSections: KOZIJN_ZELF_MATS 
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

  // --- SCHUTTING ---
  schutting: {
    title: 'Schutting & Tuin',
    searchPlaceholder: 'Zoek schuttingklus...',
    items: [
      { 
        title: 'Houten Schutting', 
        description: 'Planken of schermen', 
        slug: 'houten-schutting', 
        measurementLabel: 'Schutting', 
        measurements: STANDARD_FIELDS, 
        materialSections: HOUT_SCHUTTING_MATS 
      },
      { 
        title: 'Beton / Hout Schutting', 
        description: 'Betonnen palen & onderplaten', 
        slug: 'beton-hout-schutting', 
        measurementLabel: 'Schutting', 
        measurements: STANDARD_FIELDS, 
        materialSections: BETON_HOUT_MATS 
      },
      { 
        title: 'Composiet Schutting', 
        description: 'Onderhoudsarm', 
        slug: 'composiet-schutting', 
        measurementLabel: 'Schutting', 
        measurements: STANDARD_FIELDS, 
        materialSections: COMPOSIET_SCHUTTING_MATS 
      }
    ]
  },

  // --- OVERKAPPING ---
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

  // --- GLAS ZETTEN ---
  glas_zetten: {
    title: 'Glas zetten',
    searchPlaceholder: 'Zoek glasklus...',
    items: [
      { 
        title: 'Dubbel Glas (HR++) / Triple', 
        description: 'Isolatieglas zetten', 
        slug: 'isolatieglas', 
        measurementLabel: 'Ruit', 
        measurements: COUNT_FIELDS, 
        materialSections: ISOLATIEGLAS_MATS 
      },
      { 
        title: 'Enkel Glas', 
        description: 'Voor binnen of schuur', 
        slug: 'enkel-glas', 
        measurementLabel: 'Ruit', 
        measurements: COUNT_FIELDS, 
        materialSections: ENKEL_GLAS_MATS 
      }
    ]
  },

  // --- KEUKENS ---
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
        materialSections: KEUKEN_MONTAGE_MATS 
      },
      { 
        title: 'Keukenrenovatie', 
        description: 'Vervangen frontjes/blad/apparatuur', 
        slug: 'keuken-renovatie', 
        measurementLabel: 'Keuken', 
        measurements: COUNT_FIELDS, 
        materialSections: KEUKEN_RENOVATIE_MATS 
      },
      { 
        title: 'Overig Keukens', 
        description: 'Aanpassingen en reparaties', 
        slug: 'overig-keukens', 
        measurementLabel: 'Klus', 
        measurements: COUNT_FIELDS, 
        materialSections: [] 
      }
    ]
  },

  // --- DAKRAMEN ---
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
        materialSections: VELUX_MATS 
      },
      { 
        title: 'Lichtkoepel', 
        description: 'Voor plat dak', 
        slug: 'lichtkoepel', 
        measurementLabel: 'Koepel', 
        measurements: COUNT_FIELDS, 
        materialSections: LICHTKOEPEL_MATS 
      }
    ]
  },  

  // --- OVERIGE ---
  overige: {
    title: 'Overige werkzaamheden',
    searchPlaceholder: 'Zoek werkzaamheden...',
    items: [
      { title: 'Timmerwerk Algemeen', description: 'Diverse klussen', slug: 'timmerwerk-algemeen', measurementLabel: 'Klus', measurements: AREA_FIELDS, materialSections: [] },
    ],
  },
};