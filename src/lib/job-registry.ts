

export const MATERIAL_CATEGORY_INFO = {
  // --- EXISTING STRUCTURE ---
  Stalen_Kozijn: { title: 'Stalen Kozijn', order: 1 },
  'Stalen kozijn': { title: 'Stalen Kozijn', order: 1 },
  hout: { title: 'Framewerk', order: 1 },
  raam: { title: 'Ramen', order: 2 },
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
  element: { title: 'Elementen', order: 1 },
  montage: { title: 'Montage & Afdichting', order: 2 },
  afwerking_dak: { title: 'Afwerking (Dak)', order: 5 },
  // --- CONSTRUCTIE ---
  Constructievloer: { title: 'Balklaag & Constructie', order: 1 },
  Vlonder_Fundering: { title: 'Grondwerk & Fundering', order: 1 },
  dorpels: { title: 'Dorpels', order: 2 },
  // --- GEVEL OPTIES (VARIANTS) ---
  gevel_hout: { title: 'Gevelbekleding (Hout)', order: 3 },
  gevel_kunststof: { title: 'Gevelbekleding (Kunststof)', order: 3 },
  gevel_cement: { title: 'Gevelbekleding (Cementvezel)', order: 3 },
  gevel_plaat: { title: 'Gevelbekleding (Platen)', order: 3 },
  gevel_plaat_lijm: { title: 'Gevelbekleding (Platen)', order: 3 },
  // --- ALGEMEEN ---
  bevestiging: { title: 'Bevestiging & Montage', order: 99 },
  // --- BESLAG & TOEGANG ---
  deurbeslag: { title: 'Deurbeslag & Sloten', order: 8 },
  beslag: { title: 'Hang- & Sluitwerk', order: 8 },
  Kozijnen: { title: 'Kozijnen', order: 7 },
  Deuren: { title: 'Deuren', order: 8 },
  Dagkant: { title: 'Dagkanten', order: 8 },
  Vensterbank: { title: 'Vensterbanken', order: 8 },
  Schuifdeuren: { title: 'Schuifdeuren', order: 8 },
  Toegang: { title: 'Toegang & Vlizotrap', order: 14 },
  vensterset: { title: 'vensterset', order: 14 },
  // --- GLAS & ISOLATIE ---
  glas: { title: 'Glas & Beglazing', order: 9 },
  ventilatie: { title: 'Ventilatie', order: 10 },
  tochtstrips: { title: 'Tochtwering', order: 9 },
  isolatie: { title: 'Isolatie & Folies', order: 2 },
  plafond: { title: 'Plafond', order: 15 },

  // --- AFWERKING ---
  beplating: { title: 'Beplating', order: 3 },
  beplating_afwerking: { title: 'Beplating (Plafond)', order: 11 },
  afwerking_binnen: { title: 'Afwerken (Binnen)', order: 4 },
  afwerking_buiten: { title: 'Afwerken (Buiten)', order: 5 },
  lijstwerk: { title: 'Lijstwerk', order: 4 },
  gips_afwerking: { title: '(knauf) gipsproducten', order: 6 },
  Koof: { title: 'Koof', order: 9 },
  Cinewall: { title: 'Cinewall Elementen', order: 21 },
  // --- TUIN & SCHUTTING ---

  //#region --- VLOEREN ---
  Vlonder_Constructie: { title: 'Constructie (Onderbouw)', order: 2 },
  Vloer_Voorbereiding: { title: 'Voorbereiding', order: 2 },
  Vloer_Hout: { title: 'Parket', order: 3 },
  Vloer_Laminaat: { title: 'Vloerdelen', order: 3 },
  Vlonder_Dek: { title: 'Vlonder & Afwerking', order: 3 },
  Vloer_Afwerking: { title: 'Afwerking', order: 4 },

  // --- HOUTROTREPARATIE ---
  reparatie: { title: 'Reparatie & Herstel', order: 1 },
  // --- VLIERING ---
  Vliering_Constructie: { title: '1. Constructie & Vloer (Bovenzijde)', order: 1 },
  Vliering_Plafond_Hout: { title: '2. Plafondafwerking (Hout)', order: 2 },
  Vliering_Plafond_Metaal: { title: '2. Plafondafwerking (Metal Stud)', order: 3 },
  Vliering_Toegang: { title: '3. Vlizotrap & Toegang', order: 4 },
  Vliering_Isolatie: { title: '4. Isolatie & Elektra', order: 5 },
  // --- NEW CATEGORIES ---
  sloopwerk: { title: 'Sloopwerk & Materialen', order: 1 },
  project_overheads: { title: 'Project Overheads', order: 99 },
  constructie: { title: 'Constructie', order: 1 },
  beveiliging: { title: 'Beveiliging', order: 1 },
  exterieur_details: { title: 'Exterieur Details', order: 1 },
  boeiboord: { title: 'Boeidelen', order: 15 },
  daktrim: { title: 'Daktrim', order: 99 },
  Installatie: { title: 'Installatie', order: 20 },
  Schakelmateriaal: { title: 'Schakelmateriaal', order: 21 },
} as const;

//#region total category extra info
export type MaterialCategoryKey = keyof typeof MATERIAL_CATEGORY_INFO;

// 2. THE PRESETS (So you don't have to copy-paste orders 100 times)

export const WALL_CONFIG = MATERIAL_CATEGORY_INFO;

export const CEILING_CONFIG = {
  ...MATERIAL_CATEGORY_INFO,
  Koof: { ...MATERIAL_CATEGORY_INFO.Koof, order: 2 },
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

// 2. INTERFACES (Types)

export interface MeasurementField {
  key: string;
  label: string;
  type: 'number' | 'text' | 'textarea' | 'select' | 'boolean';
  suffix?: string;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  group?: string;
  options?: { label: string; value: string }[];
  optional?: boolean;
}

export interface MaterialSection {
  key: string;
  label: string;
  categoryFilter?: string | string[];
  category?: MaterialCategoryKey;
  category_ultra_filter?: string;
  multiEntry?: boolean;
}

export interface JobSubItem {
  title: string;
  description: string;
  slug: string;
  measurementLabel?: string;
  measurements?: MeasurementField[];
  materialSections?: MaterialSection[];
  categoryConfig?: Record<string, { title: string; order: number }>;
  hidden?: boolean;
}

export interface CategoryConfig {
  title: string;
  searchPlaceholder: string;
  items: JobSubItem[];
}

//#endregion

// 3. MEASUREMENT CONFIGURATIONS

const STANDARD_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
  { key: 'hoogte', label: 'Hoogte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 2600' },

];

const WALL_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
  { key: 'hoogte', label: 'Hoogte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 2600' },
  { key: 'balkafstand', label: 'Balkafstand (h.o.h.)', type: 'number', suffix: 'mm' },
];

const HSB_VOORZETWAND_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
  { key: 'hoogte', label: 'Hoogte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 2600' },
  { key: 'balkafstand', label: 'Balkafstand (h.o.h.)', type: 'number', suffix: 'mm', defaultValue: 600 },
  // Koof
  { key: 'koof_lengte', label: 'Lengte Koof', type: 'number', suffix: 'mm', group: 'koof', optional: true },
  { key: 'koof_hoogte', label: 'Hoogte Koof', type: 'number', suffix: 'mm', group: 'koof', optional: true },
  { key: 'koof_diepte', label: 'Diepte Koof', type: 'number', suffix: 'mm', group: 'koof', optional: true },
  // Dagkanten
  { key: 'dagkant_diepte', label: 'Diepte Dagkant', type: 'number', suffix: 'mm', group: 'dagkant', optional: true },
  { key: 'dagkant_lengte', label: 'Totale Lengte Dagkant', type: 'number', suffix: 'mm', group: 'dagkant', optional: true },
  // Vensterbanken
  { key: 'vensterbank_diepte', label: 'Diepte Vensterbank', type: 'number', suffix: 'mm', group: 'vensterbank', optional: true },
  { key: 'vensterbank_lengte', label: 'Totale Lengte Vensterbank', type: 'number', suffix: 'mm', group: 'vensterbank', optional: true },
];

const CEILLING_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
  { key: 'breedte', label: 'Breedte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 4000' },
  { key: 'balkafstand', label: 'Balkafstand (h.o.h.)', type: 'number', suffix: 'mm', group: 'spacing', optional: true },
  { key: 'latafstand', label: 'Latafstand (h.o.h.)', type: 'number', suffix: 'mm', defaultValue: 300, group: 'spacing' },
]

const METAL_STUD_CEILING_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
  { key: 'breedte', label: 'Breedte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 4000' },
  { key: 'balkafstand', label: 'Balkafstand (h.o.h.)', type: 'number', suffix: 'mm', group: 'spacing', optional: true },
  { key: 'latafstand', label: 'Profielafstand (h.o.h.)', type: 'number', suffix: 'mm', defaultValue: 300, group: 'spacing' },
]

const EPDM_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
  { key: 'hoogte', label: 'Breedte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 4000' },
  { key: 'dakrand_breedte', label: 'Breedte Dakrand', type: 'number', suffix: 'mm', defaultValue: 50, group: 'dakrand_structuur' },
  { key: 'dakrand_hoogte', label: 'Hoogte Dakrand', type: 'number', suffix: 'mm', placeholder: 'Bijv. 70', group: 'dakrand_structuur', optional: true },
  {
    key: 'edge_top',
    label: 'Rand Boven',
    type: 'select',
    options: [{ label: 'Vrij (Dakrand)', value: 'free' }, { label: 'Muur (Gevel)', value: 'wall' }],
    defaultValue: 'free'
  },
  {
    key: 'edge_bottom',
    label: 'Rand Onder',
    type: 'select',
    options: [{ label: 'Vrij (Dakrand)', value: 'free' }, { label: 'Muur (Gevel)', value: 'wall' }],
    defaultValue: 'free'
  },
  {
    key: 'edge_left',
    label: 'Rand Links',
    type: 'select',
    options: [{ label: 'Vrij (Dakrand)', value: 'free' }, { label: 'Muur (Gevel)', value: 'wall' }],
    defaultValue: 'free'
  },
  {
    key: 'edge_right',
    label: 'Rand Rechts',
    type: 'select',
    options: [{ label: 'Vrij (Dakrand)', value: 'free' }, { label: 'Muur (Gevel)', value: 'wall' }],
    defaultValue: 'free'
  },

];

const AREA_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
  { key: 'breedte', label: 'Breedte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 4000' },

];

const VLIERING_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
  { key: 'breedte', label: 'Breedte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 4000' },
  { key: 'balkafstand', label: 'Balkafstand (h.o.h.)', type: 'number', suffix: 'mm', defaultValue: 400 },
];

const FLOOR_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
  { key: 'breedte', label: 'Breedte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 4000' },
];

const VLONDER_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
  { key: 'breedte', label: 'Breedte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 4000' },
  { key: 'balkafstand', label: 'Balkafstand (h.o.h.)', type: 'number', suffix: 'mm', defaultValue: 400 },

];

const COUNT_FIELDS: MeasurementField[] = [
  { key: 'breedte', label: 'Breedte per stuk', type: 'number', suffix: 'mm', placeholder: 'Bijv. 930' },
  { key: 'hoogte', label: 'Hoogte per stuk', type: 'number', suffix: 'mm', placeholder: 'Bijv. 2315' },
  { key: 'aantal', label: 'Aantal', type: 'number', suffix: 'stuks', placeholder: 'Bijv. 1', defaultValue: 1 },

];

const GLAS_FIELDS: MeasurementField[] = [
  { key: 'breedte', label: 'Breedte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 800' },
  { key: 'hoogte', label: 'Hoogte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 1200' },
];

const KOOF_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 2500' },
  { key: 'hoogte', label: 'Hoogte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 300' },
  { key: 'diepte', label: 'Diepte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 300' },
  { key: 'aantal', label: 'Aantal', type: 'number', suffix: 'stuks', defaultValue: 1 },

];

const BOEIBOORD_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte Voorzijde', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
  { key: 'hoogte', label: 'Hoogte Voorzijde', type: 'number', suffix: 'mm', placeholder: 'Bijv. 250' },
  { key: 'lengte_onderzijde', label: 'Lengte Onderzijde', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
  { key: 'breedte', label: 'Breedte Onderzijde', type: 'number', suffix: 'mm', placeholder: 'Bijv. 300' },
  { key: 'balkafstand', label: 'Balkafstand (h.o.h.)', type: 'number', suffix: 'mm', optional: true },
  { key: 'latafstand', label: 'Latafstand Voorzijde (h.o.h.) *', type: 'number', suffix: 'mm', defaultValue: 300 },
  { key: 'onderzijde_latafstand', label: 'Latafstand Onderzijde (h.o.h.) *', type: 'number', suffix: 'mm', defaultValue: 300, optional: true },
  { key: 'kopkanten', label: 'Kopkanten', type: 'boolean', defaultValue: false },
  { key: 'kopkant_breedte', label: 'Breedte Kopkant', type: 'number', suffix: 'mm', defaultValue: 300, optional: true },
  { key: 'kopkant_hoogte', label: 'Hoogte Kopkant', type: 'number', suffix: 'mm', defaultValue: 250, optional: true },
];

const GEVELBEKLEDING_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
  { key: 'hoogte', label: 'Hoogte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 2500' },
  { key: 'balkafstand', label: 'Balkafstand (h.o.h.)', type: 'number', suffix: 'mm', optional: true },
  { key: 'tengelafstand', label: 'Tengelafstand (h.o.h.) *', type: 'number', suffix: 'mm', optional: true },
  { key: 'latafstand', label: 'Latafstand (h.o.h.) *', type: 'number', suffix: 'mm', defaultValue: 300 },
];

const SCHUTTING_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Totale Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 10000' },
  { key: 'hoogte', label: 'Hoogte Schutting', type: 'number', suffix: 'mm', placeholder: 'Bijv. 1800' },
  { key: 'paalafstand', label: 'Maat tussen palen', type: 'number', suffix: 'mm', defaultValue: 1800, group: 'constructie' },
  {
    key: 'type_schutting',
    label: 'Type Schutting',
    type: 'select',
    options: [
      { label: 'Recht (Planken)', value: 'planken' },
      { label: 'Schermen', value: 'schermen' }
    ],
    defaultValue: 'schermen',
    group: 'constructie'
  },
  {
    key: 'plank_richting',
    label: 'Plank Richting',
    type: 'select',
    options: [{ label: 'Horizontaal', value: 'horizontal' }, { label: 'Verticaal', value: 'vertical' }],
    defaultValue: 'horizontal',
    group: 'constructie'
  },
  { key: 'betonband_hoogte', label: 'Hoogte Betonband', type: 'number', suffix: 'mm', defaultValue: 100, group: 'constructie', optional: true },
  { key: 'aantal_hoeken', label: 'Aantal Hoeken', type: 'number', suffix: 'stuks', defaultValue: 0, group: 'constructie', optional: true },
  { key: 'poort_aanwezig', label: 'Poort Aanwezig', type: 'boolean', defaultValue: false, group: 'toegang' },
];

// 4. MATERIAL CONFIGURATIONS (Cards)

//#region ========================================== MATERIAL SECTIONS - WANDEN XXX==========================================

const HSB_VOORZETWAND_BINNEN_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE
  { label: 'Staanders & Liggers', categoryFilter: 'Vuren hout', category: 'hout', key: 'staanders_en_liggers', category_ultra_filter: '' },
  { label: 'Tengelwerk / Rachels', categoryFilter: 'Vuren hout', category: 'hout', key: 'ventilatie_latten', category_ultra_filter: '' },

  // 2. ISOLATIE & FOLIES
  { label: 'Folies', categoryFilter: 'Folieën', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_basis', category_ultra_filter: '' },

  // 3. BEPLATING
  { label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', key: 'constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten, Brandwerende platen', category: 'beplating', key: 'afwerkplaat', category_ultra_filter: '' },

  // 4. KOOF
  { label: 'Regelwerk', categoryFilter: 'Vuren hout', category: 'Koof', key: 'koof_regelwerk', category_ultra_filter: '' },
  { label: 'Constructieplaat', categoryFilter: 'Interieur Platen', category: 'Koof', key: 'koof_constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten, Interieur Platen', category: 'Koof', key: 'koof_afwerkplaat', category_ultra_filter: '' },
  { label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', key: 'koof_isolatie', category_ultra_filter: '' },

  // 5. AFWERKEN (TIMMERWERK)
  { label: 'Dagkanten', categoryFilter: 'Interieur Platen', category: 'Dagkant', key: 'dagkanten', category_ultra_filter: '' },
  { label: 'Vensterbanken', categoryFilter: 'Interieur Platen', category: 'Vensterbank', key: 'vensterbanken', category_ultra_filter: '' },
  { label: 'Vloerplinten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'plinten_vloer', category_ultra_filter: '' },
  { label: 'Plafondplinten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'plinten_plafond', category_ultra_filter: '' },

  // 6. AFWERKEN (GIPS & WAND)
  { label: 'Hoekprofielen', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'hoekafwerking', category_ultra_filter: '' },
  { label: 'Voegenmiddel', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'gips_vuller', category_ultra_filter: '' },
  { label: 'Finish Pasta', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'gips_finish', category_ultra_filter: '' },

  // 7. KOZIJNEN
  { label: 'Kozijnen (Complete Set)', categoryFilter: 'Montage kozijnen', category: 'Kozijnen', key: 'kozijn_compleet', category_ultra_filter: '' },
  { label: 'Kozijnhout (Zelfbouw)', categoryFilter: 'Kozijnhout', category: 'Kozijnen', key: 'kozijn_element', category_ultra_filter: '' },
  { label: 'Glas', categoryFilter: 'Overig', category: 'Kozijnen', key: 'glas', category_ultra_filter: '' },
  { label: 'Ventilatieroosters', categoryFilter: 'Overig', category: 'Kozijnen', key: 'roosters', category_ultra_filter: '' },

  // 8. DEUREN & BE SLAG
  { label: 'Binnendeuren', categoryFilter: 'Binnendeuren', category: 'Deuren', key: 'deur_blad', category_ultra_filter: '' },
  { label: 'Scharnieren', categoryFilter: 'Deurbeslag', category: 'Deuren', key: 'deur_scharnieren', category_ultra_filter: '' },
  { label: 'Sloten', categoryFilter: 'Deurbeslag', category: 'Deuren', key: 'deur_sloten', category_ultra_filter: '' },
  { label: 'Deurbeslag', categoryFilter: 'Deurbeslag', category: 'Deuren', key: 'deur_krukken', category_ultra_filter: '' },
  { label: 'Deurroosters', categoryFilter: 'Overig', category: 'Deuren', key: 'deur_rooster', category_ultra_filter: '' },
];

const HSB_SCHEIDINGSWAND_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE
  { label: 'Staanders & Liggers', categoryFilter: 'Vuren hout', category: 'hout', key: 'staanders_en_liggers', category_ultra_filter: '' },
  { label: 'Tengelwerk / Rachels', categoryFilter: 'Vuren hout', category: 'hout', key: 'ventilatie_latten', category_ultra_filter: '' },

  // 2. ISOLATIE
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_basis', category_ultra_filter: '' },

  // 3. BEPLATING
  { label: 'Constructieplaat (Zijde 1)', categoryFilter: 'Constructieplaten', category: 'beplating', key: 'constructieplaat_1', category_ultra_filter: '' },
  { label: 'Constructieplaat (Zijde 2)', categoryFilter: 'Constructieplaten', category: 'beplating', key: 'constructieplaat_2', category_ultra_filter: '' },
  { label: 'Afwerkplaat (Zijde 1)', categoryFilter: 'Gipsplaten, Brandwerende platen', category: 'beplating', key: 'afwerkplaat_1', category_ultra_filter: '' },
  { label: 'Afwerkplaat (Zijde 2)', categoryFilter: 'Gipsplaten, Brandwerende platen', category: 'beplating', key: 'afwerkplaat_2', category_ultra_filter: '' },

  // 4. KOOF
  { label: 'Regelwerk', categoryFilter: 'Vuren hout', category: 'Koof', key: 'koof_regelwerk', category_ultra_filter: '' },
  { label: 'Constructieplaat', categoryFilter: 'Interieur Platen', category: 'Koof', key: 'koof_constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten, Interieur Platen', category: 'Koof', key: 'koof_afwerkplaat', category_ultra_filter: '' },
  { label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', key: 'koof_isolatie', category_ultra_filter: '' },

  // 5. AFWERKEN (TIMMERWERK)
  { label: 'Dagkanten', categoryFilter: 'Interieur Platen', category: 'Dagkant', key: 'dagkanten', category_ultra_filter: '' },
  { label: 'Vensterbanken', categoryFilter: 'Interieur Platen', category: 'Vensterbank', key: 'vensterbanken', category_ultra_filter: '' },
  { label: 'Vloerplinten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'plinten_vloer', category_ultra_filter: '' },
  { label: 'Plafondplinten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'plinten_plafond', category_ultra_filter: '' },

  // 6. INSTALLATIE

  // 7. AFWERKEN (GIPS & WAND)
  { label: 'Hoekprofielen', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'hoekafwerking', category_ultra_filter: '' },
  { label: 'Voegenmiddel', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'gips_vuller', category_ultra_filter: '' },
  { label: 'Finish Pasta', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'gips_finish', category_ultra_filter: '' },

  // 8. KOZIJNEN
  { label: 'Kozijnen (Complete Set)', categoryFilter: 'Montage kozijnen', category: 'Kozijnen', key: 'kozijn_compleet', category_ultra_filter: '' },
  { label: 'Kozijnhout (Zelfbouw)', categoryFilter: 'Kozijnhout', category: 'Kozijnen', key: 'kozijn_element', category_ultra_filter: '' },
  { label: 'Glas', categoryFilter: 'Overig', category: 'Kozijnen', key: 'glas', category_ultra_filter: '' },
  { label: 'Ventilatieroosters', categoryFilter: 'Overig', category: 'Kozijnen', key: 'roosters', category_ultra_filter: '' },

  // 9. DEUREN & BESLAG
  { label: 'Binnendeuren', categoryFilter: 'Binnendeuren', category: 'Deuren', key: 'deur_blad', category_ultra_filter: '' },
  { label: 'Scharnieren', categoryFilter: 'Deurbeslag', category: 'Deuren', key: 'deur_scharnieren', category_ultra_filter: '' },
  { label: 'Sloten', categoryFilter: 'Deurbeslag', category: 'Deuren', key: 'deur_sloten', category_ultra_filter: '' },
  { label: 'Deurbeslag', categoryFilter: 'Deurbeslag', category: 'Deuren', key: 'deur_krukken', category_ultra_filter: '' },
  { label: 'Deurroosters', categoryFilter: 'Overig', category: 'Deuren', key: 'deur_rooster', category_ultra_filter: '' },
];

const METALSTUD_VOORZETWAND_BINNEN_MATS: MaterialSection[] = [
  // 1. METAAL & CONSTRUCTIE
  { label: 'Liggers (U-profielen)', categoryFilter: 'Metalstud profielen', category: 'metaal', key: 'ms_liggers', category_ultra_filter: '' },
  { label: 'Staanders (C-profielen)', categoryFilter: 'Metalstud profielen', category: 'metaal', key: 'ms_staanders', category_ultra_filter: '' },
  { label: 'Verstevigingsprofielen (UA)', categoryFilter: 'Metalstud profielen', category: 'metaal', key: 'ms_ua_profiel', category_ultra_filter: '' },

  // 2. ISOLATIE & FOLIES
  { label: 'Folies', categoryFilter: 'Folieën', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_basis', category_ultra_filter: '' },

  // 3. BEPLATING
  { label: 'Constructieplaat (Zijde 1)', categoryFilter: 'Constructieplaten, Interieur Platen', category: 'beplating', key: 'constructieplaat_1', category_ultra_filter: '' },
  { label: 'Constructieplaat (Zijde 2)', categoryFilter: 'Constructieplaten, Interieur Platen', category: 'beplating', key: 'constructieplaat_2', category_ultra_filter: '' },
  { label: 'Afwerkplaat (Zijde 1)', categoryFilter: 'Gipsplaten, Brandwerende platen', category: 'beplating', key: 'beplating_1', category_ultra_filter: '' },
  { label: 'Afwerkplaat (Zijde 2)', categoryFilter: 'Gipsplaten, Brandwerende platen', category: 'beplating', key: 'beplating_2', category_ultra_filter: '' },

  // 4. KOOF (Omkasting voor buizen/afvoer)
  { label: 'Regelwerk', categoryFilter: 'Vuren hout', category: 'Koof', key: 'koof_regelwerk', category_ultra_filter: '' },
  { label: 'Beplating', categoryFilter: 'Interieur Platen', category: 'Koof', key: 'koof_constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten, Interieur Platen', category: 'Koof', key: 'koof_afwerkplaat', category_ultra_filter: '' },
  { label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', key: 'koof_isolatie', category_ultra_filter: '' },

  // 5. AFWERKEN (TIMMERWERK)
  { label: 'Dagkanten', categoryFilter: 'Interieur Platen, Merantie', category: 'Dagkant', key: 'dagkanten', category_ultra_filter: '' },
  { label: 'Vensterbanken', categoryFilter: 'Interieur Platen', category: 'Vensterbank', key: 'vensterbanken', category_ultra_filter: '' },
  { label: 'Vloerplinten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'plinten_vloer', category_ultra_filter: '' },
  { label: 'Plafondplinten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'plinten_plafond', category_ultra_filter: '' },

  // 6. INSTALLATIE

  // 7. AFWERKEN (GIPS / STUC)
  { label: 'Hoekprofielen', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'hoekafwerking', category_ultra_filter: '' },
  { label: 'Voegenmiddel', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'gips_vuller', category_ultra_filter: '' },
  { label: 'Finish Pasta', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'gips_finish', category_ultra_filter: '' },

  // 8. KOZIJNEN
  { label: 'Raamkozijnen', categoryFilter: 'Kozijnhout', category: 'Kozijnen', key: 'kozijn_element', category_ultra_filter: '' },
  { label: 'Deurkozijnen', categoryFilter: 'Kozijnhout', category: 'Kozijnen', key: 'deur_kozijn', category_ultra_filter: '' },
  { label: 'Glas', categoryFilter: 'Overig', category: 'Kozijnen', key: 'glas', category_ultra_filter: '' },
  { label: 'Ventilatieroosters', categoryFilter: 'Overig', category: 'Kozijnen', key: 'roosters', category_ultra_filter: '' },

  // 9. DEUREN & BESLAG
  { label: 'Binnendeuren', categoryFilter: 'Binnendeuren', category: 'Deuren', key: 'deur_blad', category_ultra_filter: '' },
  { label: 'Scharnieren', categoryFilter: 'Deurbeslag', category: 'Deuren', key: 'deur_scharnieren', category_ultra_filter: '' },
  { label: 'Sloten', categoryFilter: 'Deurbeslag', category: 'Deuren', key: 'deur_sloten', category_ultra_filter: '' },
  { label: 'Deurbeslag', categoryFilter: 'Deurbeslag', category: 'Deuren', key: 'deur_krukken', category_ultra_filter: '' },
  { label: 'Deurroosters', categoryFilter: 'Overig', category: 'Deuren', key: 'deur_rooster', category_ultra_filter: '' },
];

const METALSTUD_SCHEIDINGSWAND_MATS: MaterialSection[] = [
  // 1. METAAL & CONSTRUCTIE
  { label: 'Liggers (U-profielen)', categoryFilter: 'Metalstud profielen', category: 'metaal', key: 'ms_liggers', category_ultra_filter: '' },
  { label: 'Staanders (C-profielen)', categoryFilter: 'Metalstud profielen', category: 'metaal', key: 'ms_staanders', category_ultra_filter: '' },
  { label: 'Verstevigingsprofielen (UA)', categoryFilter: 'Metalstud profielen', category: 'metaal', key: 'ms_ua_profiel', category_ultra_filter: '' },

  // 2. ISOLATIE (No folies for separation walls)
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_basis', category_ultra_filter: '' },

  // 3. BEPLATING
  { label: 'Constructieplaat (Zijde 1)', categoryFilter: 'Constructieplaten, Interieur Platen', category: 'beplating', key: 'constructieplaat_1', category_ultra_filter: '' },
  { label: 'Constructieplaat (Zijde 2)', categoryFilter: 'Constructieplaten, Interieur Platen', category: 'beplating', key: 'constructieplaat_2', category_ultra_filter: '' },
  { label: 'Afwerkplaat (Zijde 1)', categoryFilter: 'Gipsplaten, Brandwerende platen', category: 'beplating', key: 'beplating_1', category_ultra_filter: '' },
  { label: 'Afwerkplaat (Zijde 2)', categoryFilter: 'Gipsplaten, Brandwerende platen', category: 'beplating', key: 'beplating_2', category_ultra_filter: '' },

  // 4. KOOF (Omkasting voor buizen/afvoer)
  { label: 'Regelwerk', categoryFilter: 'Vuren hout', category: 'Koof', key: 'koof_regelwerk', category_ultra_filter: '' },
  { label: 'Beplating', categoryFilter: 'Interieur Platen', category: 'Koof', key: 'koof_constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten, Interieur Platen', category: 'Koof', key: 'koof_afwerkplaat', category_ultra_filter: '' },
  { label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', key: 'koof_isolatie', category_ultra_filter: '' },

  // 5. AFWERKEN (TIMMERWERK)
  { label: 'Dagkanten', categoryFilter: 'Interieur Platen, Merantie', category: 'Dagkant', key: 'dagkanten', category_ultra_filter: '' },
  { label: 'Vensterbanken', categoryFilter: 'Interieur Platen', category: 'Vensterbank', key: 'vensterbanken', category_ultra_filter: '' },
  { label: 'Vloerplinten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'plinten_vloer', category_ultra_filter: '' },
  { label: 'Plafondplinten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'plinten_plafond', category_ultra_filter: '' },

  // 6. INSTALLATIE

  // 7. AFWERKEN (GIPS / STUC)
  { label: 'Hoekprofielen', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'hoekafwerking', category_ultra_filter: '' },
  { label: 'Voegenmiddel', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'gips_vuller', category_ultra_filter: '' },
  { label: 'Finish Pasta', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'gips_finish', category_ultra_filter: '' },

  // 8. KOZIJNEN
  { label: 'Raamkozijnen', categoryFilter: 'Kozijnhout', category: 'Kozijnen', key: 'kozijn_element', category_ultra_filter: '' },
  { label: 'Deurkozijnen', categoryFilter: 'Kozijnhout', category: 'Kozijnen', key: 'deur_kozijn', category_ultra_filter: '' },
  { label: 'Glas', categoryFilter: 'Overig', category: 'Kozijnen', key: 'glas', category_ultra_filter: '' },
  { label: 'Ventilatieroosters', categoryFilter: 'Overig', category: 'Kozijnen', key: 'roosters', category_ultra_filter: '' },

  // 9. DEUREN & BESLAG
  { label: 'Binnendeuren', categoryFilter: 'Binnendeuren', category: 'Deuren', key: 'deur_blad', category_ultra_filter: '' },
  { label: 'Scharnieren', categoryFilter: 'Deurbeslag', category: 'Deuren', key: 'deur_scharnieren', category_ultra_filter: '' },
  { label: 'Sloten', categoryFilter: 'Deurbeslag', category: 'Deuren', key: 'deur_sloten', category_ultra_filter: '' },
  { label: 'Deurbeslag', categoryFilter: 'Deurbeslag', category: 'Deuren', key: 'deur_krukken', category_ultra_filter: '' },
  { label: 'Deurroosters', categoryFilter: 'Overig', category: 'Deuren', key: 'deur_rooster', category_ultra_filter: '' },
];

const HSB_BUITENWAND_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE
  { label: 'Staanders & Liggers', categoryFilter: 'Vuren hout', category: 'hout', key: 'regelwerk_hoofd', category_ultra_filter: '' },
  { label: 'Tengelwerk / Rachels', categoryFilter: 'Vuren hout', category: 'hout', key: 'regelwerk_inst', category_ultra_filter: '' },

  // 2. ISOLATIE & FOLIES
  { label: 'Folie Buiten', categoryFilter: 'Folieën, Dpc', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Folie Binnen', categoryFilter: 'Folieën', category: 'isolatie', key: 'folie_binnen', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal (Constructie)', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_hoofd', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal (Leidingspouw)', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_inst', category_ultra_filter: '' },

  // 3. BEPLATING (BINNEN & BUITEN)
  { label: 'Gevelbekleding', categoryFilter: 'Rockpanel, Trespa, Exterieur platen', category: 'beplating', key: 'gevelbekleding', category_ultra_filter: '' },
  { label: 'Constructieplaat (Buiten)', categoryFilter: 'Exterieur platen, Constructieplaten', category: 'beplating', key: 'plaat_buiten', category_ultra_filter: '' },
  { label: 'Constructieplaat (Binnen)', categoryFilter: 'Constructieplaten, Interieur Platen', category: 'beplating', key: 'osb_binnen', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten, Brandwerende platen', category: 'beplating', key: 'gips_binnen', category_ultra_filter: '' },

  // 4. AFWERKEN (TIMMERWERK - BINNEN)
  { label: 'Dagkanten', categoryFilter: 'Interieur Platen', category: 'Dagkant', key: 'dagkant_binnen', category_ultra_filter: '' },
  { label: 'Vensterbanken', categoryFilter: 'Interieur Platen', category: 'Vensterbank', key: 'vensterbank', category_ultra_filter: '' },
  { label: 'Vloerplinten', categoryFilter: 'Afwerking', category: 'afwerking_binnen', key: 'plinten', category_ultra_filter: '' },
  { label: 'Plafondplinten', categoryFilter: 'Afwerking', category: 'afwerking_binnen', key: 'plinten_plafond', category_ultra_filter: '' },

  // 5. AFWERKEN (BUITEN)
  { label: 'Waterslagen', categoryFilter: 'Lood, Loodvervanger, Overig', category: 'afwerking_buiten', key: 'waterslag', category_ultra_filter: '' },
  { label: 'Gevelhoeken', categoryFilter: 'Exterieur platen, Overig', category: 'afwerking_buiten', key: 'hoek_buiten', category_ultra_filter: '' },

  // 6. AFWERKEN (GIPS & WAND)
  { label: 'Hoekprofielen', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'hoekafwerking', category_ultra_filter: '' },
  { label: 'Voegenmiddel', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'gips_vuller', category_ultra_filter: '' },
  { label: 'Finish Pasta', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'gips_finish', category_ultra_filter: '' },

  // 7. KOZIJNEN
  { label: 'Stelkozijnen', categoryFilter: 'Kozijnhout, Vuren hout', category: 'Kozijnen', key: 'stelkozijn', category_ultra_filter: '' },
  { label: 'Raamkozijnen', categoryFilter: 'Kozijnhout', category: 'Kozijnen', key: 'kozijn_element', category_ultra_filter: '' },
  { label: 'Deurkozijnen', categoryFilter: 'Kozijnhout', category: 'Kozijnen', key: 'deur_kozijn', category_ultra_filter: '' },
  { label: 'Glas', categoryFilter: 'Overig', category: 'Kozijnen', key: 'glas', category_ultra_filter: '' },
  { label: 'Ventilatieroosters', categoryFilter: 'Overig', category: 'Kozijnen', key: 'roosters', category_ultra_filter: '' },

  // 8. DEUREN & BESLAG
  { label: 'Buitendeuren', categoryFilter: 'Buitendeuren', category: 'Deuren', key: 'deur_blad', category_ultra_filter: '' },
  { label: 'Scharnieren', categoryFilter: 'Deurbeslag', category: 'Deuren', key: 'deur_scharnieren', category_ultra_filter: '' },
  { label: 'Sloten', categoryFilter: 'Deurbeslag', category: 'Deuren', key: 'deur_sloten', category_ultra_filter: '' },
  { label: 'Deurbeslag', categoryFilter: 'Deurbeslag', category: 'Deuren', key: 'deur_krukken', category_ultra_filter: '' },
];

const CINEWALL_TV_WAND_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE (FRAMEWERK)
  { label: 'Staanders & Liggers', categoryFilter: 'Vuren hout', category: 'hout', key: 'staanders_en_liggers', category_ultra_filter: '' },
  { label: 'Regelwerk (Nissen & Details)', categoryFilter: 'Vuren hout', category: 'hout', key: 'regelwerk_nissen', category_ultra_filter: '' },
  { label: 'Achterhout (TV-ophanging)', categoryFilter: 'Constructieplaten, Interieur Platen', category: 'hout', key: 'achterhout', category_ultra_filter: '' },

  // 3. ISOLATIE & FOLIES
  { label: 'Folies', categoryFilter: 'Folieën', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_basis', category_ultra_filter: '' },

  // 4. KOOF (Omkasting voor buizen/afvoer)
  { label: 'Regelwerk', categoryFilter: 'Vuren hout', category: 'Koof', key: 'koof_regelwerk', category_ultra_filter: '' },
  { label: 'Beplating', categoryFilter: 'Interieur Platen, Constructieplaten', category: 'Koof', key: 'koof_beplating', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten, Interieur Platen', category: 'Koof', key: 'koof_afwerkplaat', category_ultra_filter: '' },
  { label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', key: 'koof_isolatie', category_ultra_filter: '' },

  // 5. BEPLATING
  { label: 'Constructieplaat', categoryFilter: 'Constructieplaten, Interieur Platen', category: 'beplating', key: 'constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten, Brandwerende platen', category: 'beplating', key: 'beplating', category_ultra_filter: '' },
  { label: 'Akoestische Panelen', categoryFilter: 'Interieur Platen, Overig', category: 'beplating', key: 'akoestische_panelen', category_ultra_filter: '' },

  // 6. AFWERKEN (TIMMERWERK)
  { label: 'Dagkanten', categoryFilter: 'Interieur Platen', category: 'afwerking', key: 'dagkanten', category_ultra_filter: '' },
  { label: 'Vloerplinten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'plinten_vloer', category_ultra_filter: '' },
  { label: 'Plafondplinten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'plinten_plafond', category_ultra_filter: '' },

  // 7. NADEN & STUCWERK
  { label: 'Hoekprofielen', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'hoekafwerking', category_ultra_filter: '' },
  { label: 'Voegenmiddel', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'gips_vuller', category_ultra_filter: '' },
  { label: 'Finish Pasta', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'gips_finish', category_ultra_filter: '' },

  // 8. CINEWALL ELEMENTEN
  { label: 'Inbouw Sfeerhaard', categoryFilter: 'Overig', category: 'Cinewall', key: 'sfeerhaard', category_ultra_filter: '' },
  { label: 'TV-Beugel', categoryFilter: 'Overig', category: 'Cinewall', key: 'tv_beugel', category_ultra_filter: '' },
  { label: 'LED-Verlichting', categoryFilter: 'Overig', category: 'Cinewall', key: 'led_strips', category_ultra_filter: '' },
];

const KNIESCHOTTEN_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE
  { label: 'Staanders & Liggers', categoryFilter: 'Vuren hout', category: 'hout', key: 'staanders_en_liggers', category_ultra_filter: '' },

  // 2. ISOLATIE & FOLIES
  { label: 'Folies', categoryFilter: 'Folieën', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_basis', category_ultra_filter: '' },

  // 3. BEPLATING
  { label: 'Constructieplaat', categoryFilter: 'Constructieplaten, Interieur Platen', category: 'beplating', key: 'constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten, Brandwerende platen', category: 'beplating', key: 'beplating', category_ultra_filter: '' },

  // 4. AFWERKEN (TIMMERWERK)
  { label: 'Vloerplinten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'plinten_vloer', category_ultra_filter: '' },
  { label: 'Plafondplinten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'afwerklatten', category_ultra_filter: '' },

  // 5. KOOF (Omkasting voor buizen/afvoer)
  { label: 'Regelwerk', categoryFilter: 'Vuren hout', category: 'Koof', key: 'koof_regelwerk', category_ultra_filter: '' },
  { label: 'Beplating', categoryFilter: 'Interieur Platen, Constructieplaten', category: 'Koof', key: 'koof_constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten, Interieur Platen', category: 'Koof', key: 'koof_afwerkplaat', category_ultra_filter: '' },
  { label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', key: 'koof_isolatie', category_ultra_filter: '' },

  // 6. INSTALLATIE

  // 7. AFWERKEN (GIPS & WAND)
  { label: 'Hoekprofielen', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'hoekafwerking', category_ultra_filter: '' },
  { label: 'Voegenmiddel', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'gips_vuller', category_ultra_filter: '' },
  { label: 'Finish Pasta', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'gips_finish', category_ultra_filter: '' },

  // 8. SCHUIFWANDEN (Replaces Standard Doors)
  { label: 'Schuifdeurrails', categoryFilter: 'Deurbeslag', category: 'Schuifdeuren', key: 'schuifdeur_rails', category_ultra_filter: '' },
  { label: 'Schuifdeurpanelen', categoryFilter: 'Interieur Platen, Constructieplaten', category: 'Schuifdeuren', key: 'schuifdeur_paneel', category_ultra_filter: '' },
  { label: 'Komgrepen', categoryFilter: 'Deurbeslag', category: 'Schuifdeuren', key: 'schuifdeur_greep', category_ultra_filter: '' },
];

const DEUR_SCHUIF_MATS: MaterialSection[] = [
  { label: 'Schuifdeurrails', categoryFilter: 'Deurbeslag', category: 'Schuifdeuren', key: 'schuifdeur_rails', category_ultra_filter: '' },
  { label: 'Schuifdeurpanelen', categoryFilter: 'Interieur Platen, Constructieplaten', category: 'Schuifdeuren', key: 'schuifdeur_paneel', category_ultra_filter: '' },
  { label: 'Komgrepen', categoryFilter: 'Deurbeslag', category: 'Schuifdeuren', key: 'schuifdeur_greep', category_ultra_filter: '' },
  { label: 'Geleiders', categoryFilter: 'Deurbeslag', category: 'Schuifdeuren', key: 'schuifdeur_geleiders', category_ultra_filter: '' },
  { label: 'Stoppers', categoryFilter: 'Deurbeslag', category: 'Schuifdeuren', key: 'schuifdeur_stoppers', category_ultra_filter: '' },
  { label: 'Soft-close', categoryFilter: 'Deurbeslag', category: 'Schuifdeuren', key: 'schuifdeur_softclose', category_ultra_filter: '' },
  { label: 'Afdichting', categoryFilter: 'Deurbeslag', category: 'Schuifdeuren', key: 'schuifdeur_afdichting', category_ultra_filter: '' },
];

//#region ========================================== MATERIAL SECTIONS - PLAFONDS XXX==========================================

const PLAFOND_HOUT_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE (FRAMEWERK)
  { label: 'Balklaag', categoryFilter: 'Vuren hout', category: 'hout', key: 'randhout', category_ultra_filter: '' },
  { label: 'Rachelwerk', categoryFilter: 'Vuren hout', category: 'hout', key: 'rachels', category_ultra_filter: '' },

  // 2. KOOF (Omkasting voor buizen/afvoer)
  { label: 'Regelwerk', categoryFilter: 'Vuren hout', category: 'Koof', key: 'koof_regelwerk', category_ultra_filter: '' },
  { label: 'Beplating', categoryFilter: 'Interieur Platen, Constructieplaten', category: 'Koof', key: 'koof_constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten, Interieur Platen', category: 'Koof', key: 'koof_afwerkplaat', category_ultra_filter: '' },
  { label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', key: 'koof_isolatie', category_ultra_filter: '' },


  // 4. ELEKTRA (RUWBOUW)

  // 6. ISOLATIE & FOLIES
  { label: 'Folies', categoryFilter: 'Folieën', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_basis', category_ultra_filter: '' },

  // 7. BEPLATING
  { label: 'Constructieplaat', categoryFilter: 'Constructieplaten, Interieur Platen', category: 'beplating', key: 'constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten, Brandwerende platen', category: 'beplating', key: 'beplating', category_ultra_filter: '' },

  // 8. AFWERKEN (TIMMERWERK)
  { label: 'Plafondplinten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'plinten_plafond', category_ultra_filter: '' },

  // 9. TOEGANG (VLIZOTRAP)
  { label: 'Luik / Vlizotrap', categoryFilter: 'Overig', category: 'Toegang', key: 'vlizotrap_unit', category_ultra_filter: '' },
  { label: 'Koplatten', categoryFilter: 'Afwerking', category: 'Toegang', key: 'luik_afwerking', category_ultra_filter: '' },

  // 10. NADEN & STUCWERK
  { label: 'Voegenmiddel', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'gips_vuller', category_ultra_filter: '' },
  { label: 'Finish Pasta', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'gips_finish', category_ultra_filter: '' },
];

const PLAFOND_METALSTUD_MATS: MaterialSection[] = [
  // 1. METAAL & CONSTRUCTIE (FRAMEWERK)
  { label: 'Randprofielen', categoryFilter: 'Metalstud profielen', category: 'metaal', key: 'randprofielen', category_ultra_filter: '' },
  { label: 'Draagprofielen', categoryFilter: 'Metalstud profielen', category: 'metaal', key: 'draagprofielen', category_ultra_filter: '' },

  // 2. KOOF (Omkasting voor buizen/afvoer)
  { label: 'Regelwerk', categoryFilter: 'Vuren hout, Metalstud profielen', category: 'Koof', key: 'koof_regelwerk', category_ultra_filter: '' },
  { label: 'Beplating', categoryFilter: 'Interieur Platen, Constructieplaten', category: 'Koof', key: 'koof_constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten, Interieur Platen', category: 'Koof', key: 'koof_afwerkplaat', category_ultra_filter: '' },
  { label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', key: 'koof_isolatie', category_ultra_filter: '' },


  // 4. ELEKTRA (RUWBOUW)

  // 6. ISOLATIE & FOLIES
  { label: 'Folies', categoryFilter: 'Folieën', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_basis', category_ultra_filter: '' },

  // 7. BEPLATING
  { label: 'Constructieplaat', categoryFilter: 'Constructieplaten, Interieur Platen', category: 'beplating', key: 'constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten, Brandwerende platen', category: 'beplating', key: 'beplating', category_ultra_filter: '' },

  // 8. AFWERKEN (TIMMERWERK)
  { label: 'Plafondplinten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'plinten_plafond', category_ultra_filter: '' },

  // 9. TOEGANG (VLIZOTRAP)
  { label: 'Luik / Vlizotrap', categoryFilter: 'Overig', category: 'Toegang', key: 'vlizotrap_unit', category_ultra_filter: '' },
  { label: 'Koplatten', categoryFilter: 'Afwerking', category: 'Toegang', key: 'luik_afwerking', category_ultra_filter: '' },

  // 10. NADEN & STUCWERK
  { label: 'Voegenmiddel', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'gips_vuller', category_ultra_filter: '' },
  { label: 'Finish Pasta', categoryFilter: '(knauf) gipsproducten', category: 'gips_afwerking', key: 'gips_finish', category_ultra_filter: '' },
];
//#endregion

//#region ========================================== MATERIAL SECTIONS - VLOEREN XXX==========================================

const MASSIEF_HOUTEN_VLOER_FINISH_MATS: MaterialSection[] = [
  // 1. VOORBEREIDING & ONDERVLOER
  { label: 'Primer', categoryFilter: 'Overig', category: 'Vloer_Voorbereiding', key: 'primer', category_ultra_filter: '' },
  { label: 'Ondervloer', categoryFilter: 'Constructieplaten, Interieur Platen', category: 'Vloer_Voorbereiding', key: 'ondervloer', category_ultra_filter: '' },
  { label: 'Egaline', categoryFilter: 'Overig', category: 'Vloer_Voorbereiding', key: 'egaline', category_ultra_filter: '' },

  // 2. VLOERDELEN & PLAATSING
  { label: 'Houten vloerplanken', categoryFilter: 'Vloer-rabat-vellingdelen', category: 'Vloer_Hout', key: 'vloerdelen', category_ultra_filter: '' },
  { label: 'Parketlijm', categoryFilter: 'Overig', category: 'Vloer_Hout', key: 'parketlijm', category_ultra_filter: '' },

  // 3. AFWERKING & BEHANDELING
  { label: 'Plinten', categoryFilter: 'Afwerking', category: 'Vloer_Afwerking', key: 'plinten', category_ultra_filter: '' },
  { label: 'Deklatten', categoryFilter: 'Afwerking', category: 'Vloer_Afwerking', key: 'deklatten', category_ultra_filter: '' },
  { label: 'Overgangsprofielen / Dorpels', categoryFilter: 'Hardhout geschaafd, Overig', category: 'Vloer_Afwerking', key: 'dorpels', category_ultra_filter: '' },
  { label: 'Vloerolie / Lak', categoryFilter: 'Overig', category: 'Vloer_Afwerking', key: 'vloerolie', category_ultra_filter: '' },
];

const VLOER_AFWERK_MATS: MaterialSection[] = [
  // 1. VOORBEREIDING
  { label: 'Egaline', categoryFilter: 'Overig', category: 'Vloer_Voorbereiding', key: 'egaliseren', category_ultra_filter: '' },
  { label: 'Reparatiemortel', categoryFilter: 'Overig', category: 'Vloer_Voorbereiding', key: 'egaliseren', category_ultra_filter: '' },
  { label: 'Dampremmende Folie', categoryFilter: 'Folieën', category: 'Vloer_Voorbereiding', key: 'folie', category_ultra_filter: '' },
  { label: 'Ondervloer', categoryFilter: 'Constructieplaten, Interieur Platen', category: 'Vloer_Voorbereiding', key: 'ondervloer', category_ultra_filter: '' },

  // 2. VLOERDELEN (LAMINAAT / PVC)
  { label: 'Laminaat / PVC Panelen', categoryFilter: 'Vloer-rabat-vellingdelen, Overig', category: 'Vloer_Laminaat', key: 'vloerdelen', category_ultra_filter: '' },

  // 3. AFWERKING & PROFIELEN
  { label: 'Vloerplinten', categoryFilter: 'Afwerking', category: 'Vloer_Afwerking', key: 'plinten_muur', category_ultra_filter: '' },

  { label: 'Overgangsprofielen / Drempels', categoryFilter: 'Hardhout geschaafd, Overig', category: 'Vloer_Afwerking', key: 'profielen_overgang', category_ultra_filter: '' },
  { label: 'Eindprofielen', categoryFilter: 'Overig', category: 'Vloer_Afwerking', key: 'profielen_eind', category_ultra_filter: '' },
  { label: 'Kruipluik Profiel / Matomranding', categoryFilter: 'Overig', category: 'Vloer_Afwerking', key: 'kruipluik', category_ultra_filter: '' },
];

const VLONDER_MATS: MaterialSection[] = [
  // 1. GRONDWERK & FUNDERING
  { label: 'Worteldoek', categoryFilter: 'Folieën, Overig', category: 'Vlonder_Fundering', key: 'worteldoek', category_ultra_filter: '' },
  { label: 'Ophoogzand / Stabilisatie', categoryFilter: 'Overig', category: 'Vlonder_Fundering', key: 'stabilisatie', category_ultra_filter: '' },
  { label: 'Piketten / Palen', categoryFilter: 'Hardhout geschaafd, Vuren hout', category: 'Vlonder_Fundering', key: 'piketten', category_ultra_filter: '' },
  { label: 'Tegels / Stelpoten', categoryFilter: 'Overig', category: 'Vlonder_Fundering', key: 'dragers', category_ultra_filter: '' },

  // 2. CONSTRUCTIE (ONDERBOUW)
  { label: 'Moerbalken', categoryFilter: 'Hardhout geschaafd, Vuren hout', category: 'Vlonder_Constructie', key: 'moerbalken', category_ultra_filter: '' },
  { label: 'Onderregels', categoryFilter: 'Hardhout geschaafd, Vuren hout', category: 'Vlonder_Constructie', key: 'onderregels', category_ultra_filter: '' },

  // 3. VLONDER & AFWERKING
  { label: 'Vlonderplanken', categoryFilter: 'Vloer-rabat-vellingdelen, Hardhout geschaafd', category: 'Vlonder_Dek', key: 'vlonderplanken', category_ultra_filter: '' },
  { label: 'Vlonderschroeven / Clips', categoryFilter: 'Overig', category: 'Vlonder_Dek', key: 'bevestiging', category_ultra_filter: '' },
  { label: 'Kantplanken', categoryFilter: 'Hardhout geschaafd, Vloer-rabat-vellingdelen', category: 'Vlonder_Dek', key: 'kantplanken', category_ultra_filter: '' },
  { label: 'Drainagegoot', categoryFilter: 'Overig, Ubbink', category: 'Vlonder_Dek', key: 'afwatering', category_ultra_filter: '' },
];

const BALKLAAG_CONSTRUCTIEVLOER_MATS: MaterialSection[] = [
  // 1. BALKLAAG (CONSTRUCTIE)
  { label: 'Muurplaat', categoryFilter: 'Vuren hout', category: 'Constructievloer', key: 'muurplaat', category_ultra_filter: '' },
  { label: 'Randbalken', categoryFilter: 'Vuren hout', category: 'Constructievloer', key: 'vloerbalken', category_ultra_filter: '' },
  { label: 'Vloerbalken', categoryFilter: 'Vuren hout', category: 'Constructievloer', key: 'vloerbalken', category_ultra_filter: '' },
  { label: 'Balkdragers', categoryFilter: 'Overig', category: 'Constructievloer', key: 'balkdragers', category_ultra_filter: '' },

  // 2. ISOLATIE & GELUID
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie', category_ultra_filter: '' },
  { label: 'Geluidsisolatie Stroken', categoryFilter: 'Isolatie, Folieën', category: 'isolatie', key: 'geluidsstroken', category_ultra_filter: '' },

  // 3. BEPLATING (DEK)
  { label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', key: 'beplating', category_ultra_filter: '' },
];

const VLIERING_MATS: MaterialSection[] = [
  // --- FLOOR CONSTRUCTION (VLIERING DEK) ---
  { label: 'Randbalken', categoryFilter: 'Vuren hout', category: 'Constructievloer', key: 'randbalken', category_ultra_filter: '' },
  { label: 'Vloerbalken', categoryFilter: 'Vuren hout', category: 'Constructievloer', key: 'vloerbalken', category_ultra_filter: '' },
  { label: 'Balkdragers', categoryFilter: 'Overig', category: 'Constructievloer', key: 'balkdragers', category_ultra_filter: '' },

  { label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', key: 'beplating', category_ultra_filter: '' },
  { label: 'Luik / Vlizotrap', categoryFilter: 'Overig', category: 'Toegang', key: 'vlizotrap_unit', category_ultra_filter: '' },
  { label: 'Koplatten', categoryFilter: 'Afwerking', category: 'Toegang', key: 'luik_afwerking', category_ultra_filter: '' },

  // --- A. FRAMEWERK (Hout of Metaal) ---


  // --- B. SPECIALS (Koven) ---
  { label: 'Regelwerk', categoryFilter: 'Vuren hout, Metalstud profielen', category: 'Koof', key: 'koof_regelwerk', category_ultra_filter: '' },
  { label: 'Beplating', categoryFilter: 'Interieur Platen, Constructieplaten', category: 'Koof', key: 'koof_constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten, Interieur Platen', category: 'Koof', key: 'koof_afwerkplaat', category_ultra_filter: '' },
  { label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', key: 'koof_isolatie', category_ultra_filter: '' },



  // --- C. INSTALLATIE ---

  // --- D. ISOLATIE ---
  { label: 'Folies', categoryFilter: 'Folieën', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_basis', category_ultra_filter: '' },

  // --- E. BEPLATING (Plafond) ---


  // --- F. AFWERKING ---
  { label: 'Plafondplinten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'plinten_plafond', category_ultra_filter: '' },
  { label: 'Voegenmiddel', categoryFilter: 'Gipsplaten', category: 'gips_afwerking', key: 'gips_vuller', category_ultra_filter: '' },
  { label: 'Finish Pasta', categoryFilter: 'Gipsplaten', category: 'gips_afwerking', key: 'gips_finish', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - KEUKENS ==========================================

//#region ========================================== MATERIAL SECTIONS - INTERIEUR & AFWERKINGEN ==========================================

//#region ========================================== MATERIAL SECTIONS - AFWERKINGEN ==========================================

const DAGKANT_MATS: MaterialSection[] = [
  { label: 'Regelwerk', categoryFilter: 'Vuren hout', category: 'hout', key: 'frame', category_ultra_filter: '' },
  { label: 'Afwerk Hout', categoryFilter: 'Interieur Platen, Hardhout geschaafd', category: 'afwerking', key: 'dagkant', category_ultra_filter: '', multiEntry: true },
  { label: 'Hoek- of Stopcontactprofielen', categoryFilter: 'Gipsplaten, Overig', category: 'afwerking', key: 'hoekprofiel', category_ultra_filter: '' },
];

const PLINTEN_MATS: MaterialSection[] = [
  { label: 'Plafondplinten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'plinten', category_ultra_filter: '' },
  { label: 'Koplatten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'koplatten', category_ultra_filter: '' },
  { label: 'Vloerplinten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'vloerplinten', category_ultra_filter: '' },
];

const KOOF_MATS: MaterialSection[] = [
  { label: 'Regelwerk', categoryFilter: 'Vuren hout, Metalstud profielen', category: 'hout', key: 'regelwerk', category_ultra_filter: '' },
  { label: 'Constructieplaat', categoryFilter: 'Interieur Platen, Constructieplaten', category: 'beplating', key: 'constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten, Brandwerende platen', category: 'beplating', key: 'afwerkplaat', category_ultra_filter: '' },
  { label: 'Isolatie', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie', category_ultra_filter: '' },
  { label: 'Hoekprofielen', categoryFilter: 'Gipsplaten', category: 'afwerking', key: 'hoekprofielen', category_ultra_filter: '' },
];

const OMKASTING_MATS: MaterialSection[] = [
  { label: 'Regelwerk', categoryFilter: 'Vuren hout', category: 'hout', key: 'frame', category_ultra_filter: '' },
  { label: 'Afwerk Hout', categoryFilter: 'Interieur Platen, Constructieplaten', category: 'afwerking', key: 'beplating', category_ultra_filter: '' },
];

const VENSTERBANK_MATS: MaterialSection[] = [
  { label: 'Regelwerk', categoryFilter: 'Vuren hout', category: 'hout', key: 'frame', category_ultra_filter: '' },
  { label: 'Vensterbank', categoryFilter: 'Interieur Platen, Hardhout geschaafd', category: 'afwerking', key: 'vensterbank', category_ultra_filter: '', multiEntry: true },
  { label: 'Ventilatieroosters', categoryFilter: 'Overig', category: 'afwerking', key: 'roosters', category_ultra_filter: '' },
  { label: 'Olie, Lak of Beits', categoryFilter: 'Overig', category: 'afwerking', key: 'behandeling', category_ultra_filter: '' },
];

//#region ========================================== MATERIAL SECTIONS - DEUREN XXX==========================================

const DEUR_BINNEN_MATS: MaterialSection[] = [
  { label: 'Binnendeur', categoryFilter: 'Binnendeuren', category: 'Deuren', key: 'deurblad', category_ultra_filter: '' },

  { label: 'Deurbeslag set', categoryFilter: 'Deurbeslag', category: 'deurbeslag', key: 'deurbeslag_set', category_ultra_filter: '' },
  { label: 'Scharnieren / Paumelles', categoryFilter: 'Deurbeslag', category: 'deurbeslag', key: 'scharnieren', category_ultra_filter: '' },
  { label: 'Sloten', categoryFilter: 'Deurbeslag', category: 'deurbeslag', key: 'slotmechanisme', category_ultra_filter: '' },
  { label: 'Deurbeslag (Schild & Kruk)', categoryFilter: 'Deurbeslag', category: 'deurbeslag', key: 'deurbeslag_kruk', category_ultra_filter: '' },
  { label: 'Cilinder', categoryFilter: 'Deurbeslag', category: 'deurbeslag', key: 'cilinder', category_ultra_filter: '' },

  { label: 'Glas', categoryFilter: 'Overig', category: 'glas', key: 'glas', category_ultra_filter: '' },
  { label: 'Glaslatten', categoryFilter: 'Afwerking', category: 'glas', key: 'glaslatten', category_ultra_filter: '' },

  { label: 'Tochtvaldorp', categoryFilter: 'Deurbeslag', category: 'tochtstrips', key: 'valdorp', category_ultra_filter: '' },
  { label: 'Tochtstrips', categoryFilter: 'Deurbeslag', category: 'tochtstrips', key: 'tochtstrips', category_ultra_filter: '' },

  { label: 'Deurroosters', categoryFilter: 'Overig', category: 'ventilatie', key: 'ventilatierooster', category_ultra_filter: '' },
];

const DEUR_BUITEN_MATS: MaterialSection[] = [
  { label: 'Buitendeur', categoryFilter: 'Buitendeuren', category: 'Deuren', key: 'deurblad', category_ultra_filter: '' },

  { label: 'Scharnieren', categoryFilter: 'Deurbeslag', category: 'deurbeslag', key: 'scharnieren', category_ultra_filter: '' },
  { label: 'Sloten', categoryFilter: 'Deurbeslag', category: 'deurbeslag', key: 'slotmechanisme', category_ultra_filter: '' },
  { label: 'Meerpuntsluiting', categoryFilter: 'Deurbeslag', category: 'deurbeslag', key: 'meerpuntsluiting', category_ultra_filter: '' },
  { label: 'Deurbeslag (Schild & Kruk)', categoryFilter: 'Deurbeslag', category: 'deurbeslag', key: 'deurbeslag_kruk', category_ultra_filter: '' },
  { label: 'Cilinder', categoryFilter: 'Deurbeslag', category: 'deurbeslag', key: 'cilinder', category_ultra_filter: '' },

  { label: 'Glas', categoryFilter: 'Overig', category: 'glas', key: 'glas', category_ultra_filter: '' },
  { label: 'Glaslatten', categoryFilter: 'Afwerking', category: 'glas', key: 'glaslatten', category_ultra_filter: '' },

  { label: 'Tochtvaldorp', categoryFilter: 'Deurbeslag', category: 'tochtstrips', key: 'valdorp', category_ultra_filter: '' },
  { label: 'Tochtstrips', categoryFilter: 'Deurbeslag', category: 'tochtstrips', key: 'tochtstrips', category_ultra_filter: '' },

  { label: 'Deurroosters', categoryFilter: 'Overig', category: 'ventilatie', key: 'ventilatierooster', category_ultra_filter: '' },

  // Optional additions for Exterior Doors
  { label: 'Drempel / Dorpel', categoryFilter: 'Hardhout geschaafd, Lood', category: 'afwerking', key: 'drempel', category_ultra_filter: '' },
];

//#region ========================================== MATERIAL SECTIONS - DAKRENOVATIE ==========================================

const DAK_HELLEND_MATS: MaterialSection[] = [
  // 1. ONDERGROND & ISOLATIE
  { label: 'Constructieplaat', categoryFilter: 'Constructieplaten, Exterieur platen', category: 'beplating', key: 'constructieplaat', category_ultra_filter: '' },
  { label: 'Dakisolatie', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_dak', category_ultra_filter: '' },
  { label: 'Folie', categoryFilter: 'Folieën', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },

  // 2. HOUTWERK (Tengels & Panlatten)
  { label: 'Tengels', categoryFilter: 'Vuren hout', category: 'hout', key: 'tengels', category_ultra_filter: '' },
  { label: 'Panlatten', categoryFilter: 'Vuren hout', category: 'hout', key: 'panlatten', category_ultra_filter: '' },
  { label: 'Ruiter (Nokbalk)', categoryFilter: 'Vuren hout', category: 'hout', key: 'ruiter', category_ultra_filter: '' },

  // 3. DAKVOET & PANNEN
  { label: 'Dakvoetprofiel / Vogelschroot', categoryFilter: 'Daktoebehoren, Ubbink', category: 'dak', key: 'dakvoetprofiel', category_ultra_filter: '' },
  { label: 'Dakpannen', categoryFilter: 'Dakpannen', category: 'dak', key: 'dakpannen', category_ultra_filter: '' },
  { label: 'Gevelpannen / Kantpannen', categoryFilter: 'Dakpannen', category: 'dak', key: 'gevelpannen', category_ultra_filter: '' },
  { label: 'Ondervorst', categoryFilter: 'Daktoebehoren, Ubbink', category: 'dak', key: 'ondervorst', category_ultra_filter: '' },
  { label: 'Nokvorsten', categoryFilter: 'Dakpannen', category: 'dak', key: 'nokvorsten', category_ultra_filter: '' },

  // 4. AFWERKING (Lood & HWA)
  { label: 'Lood', categoryFilter: 'Lood, Loodvervanger', category: 'afwerking_dak', key: 'lood', category_ultra_filter: '' },
  { label: 'Dakgoot', categoryFilter: 'Ubbink, Overig', category: 'afwerking_dak', key: 'dakgoot', category_ultra_filter: '' },
  { label: 'Nokvorst Bevestiging', categoryFilter: 'Flexim, Daktoebehoren', category: 'afwerking_dak', key: 'nok_kit', category_ultra_filter: '' },

  // 5. BOEIBOORDEN
  { label: 'Boeiboord (Optie)', categoryFilter: 'Rockpanel, Trespa, Exterieur platen', category: 'boeiboord', key: 'boeiboord_placeholder', category_ultra_filter: '' },
];

const DAK_EPDM_MATS: MaterialSection[] = [
  // 1. ONDERGROND & ISOLATIE (Opbouw Warm Dak)
  { label: 'Constructieplaat', categoryFilter: 'Constructieplaten, Exterieur platen', category: 'beplating', key: 'constructieplaat', category_ultra_filter: '' },
  { label: 'Dampremmende Folie', categoryFilter: 'Folieën', category: 'isolatie', key: 'folie_binnen', category_ultra_filter: '' },
  { label: 'Dakisolatie', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_dak', category_ultra_filter: '' },

  // 2. DAKBEDEKKING (EPDM)
  { label: 'EPDM', categoryFilter: 'Epdm', category: 'dak', key: 'epdm_folie', category_ultra_filter: '' },
  { label: 'Lijm & Contactlijm', categoryFilter: 'Epdm', category: 'dak', key: 'epdm_lijm', category_ultra_filter: '' },

  // 3. AFWERKING & DETAILS
  { label: 'Daktrim', categoryFilter: 'Daktoebehoren, Overig', category: 'afwerking_dak', key: 'daktrim', category_ultra_filter: '' },
  { label: 'Daktrim Hoeken', categoryFilter: 'Daktoebehoren, Overig', category: 'afwerking_dak', key: 'daktrim_hoeken', category_ultra_filter: '' },
  { label: 'HWA Stadsuitloop / Onderuitloop', categoryFilter: 'Epdm, Ubbink', category: 'afwerking_dak', key: 'hwa_uitloop', category_ultra_filter: '' },
  { label: 'Lood', categoryFilter: 'Lood, Loodvervanger', category: 'afwerking_dak', key: 'lood', category_ultra_filter: '' },

  // 4. BOEIBOORDEN
  { label: 'Boeiboord (Optie)', categoryFilter: 'Rockpanel, Trespa, Exterieur platen', category: 'boeiboord', key: 'boeiboord_placeholder', category_ultra_filter: '' },
];

const DAK_GOLFPLAAT_MATS: MaterialSection[] = [
  // 1. CONSTRUCTIE (Houten onderbouw)
  { label: 'Gordingen / Sporen', categoryFilter: 'Vuren hout', category: 'hout', key: 'gordingen', category_ultra_filter: '' },
  { label: 'Tengels / Regels', categoryFilter: 'Vuren hout', category: 'hout', key: 'tengels', category_ultra_filter: '' },

  // 2. ISOLATIE (Optioneel)
  { label: 'Dakisolatie', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_dak', category_ultra_filter: '' },
  { label: 'Folie', categoryFilter: 'Folieën', category: 'isolatie', key: 'folie', category_ultra_filter: '' },

  // 3. GOLFPLATEN
  { label: 'Golfplaten', categoryFilter: 'Golfplaten', category: 'dak', key: 'golfplaten', category_ultra_filter: '' },
  { label: 'Lichtplaten', categoryFilter: 'Golfplaten', category: 'dak', key: 'lichtplaten', category_ultra_filter: '' },
  { label: 'Nokstukken', categoryFilter: 'Daktoebehoren, Overig', category: 'dak', key: 'nokstukken', category_ultra_filter: '' },
  { label: 'Zijstukken / Hoekstukken', categoryFilter: 'Daktoebehoren, Overig', category: 'dak', key: 'hoekstukken', category_ultra_filter: '' },

  // 4. BEVESTIGING & AFWERKING
  { label: 'Golfplaatschroeven', categoryFilter: 'Golfplaten', category: 'afwerking_dak', key: 'golfplaatschroeven', category_ultra_filter: '' },
  { label: 'Dakgoot', categoryFilter: 'Ubbink, Overig', category: 'afwerking_dak', key: 'dakgoot', category_ultra_filter: '' },
  { label: 'HWA Afvoer', categoryFilter: 'Ubbink, Overig', category: 'afwerking_dak', key: 'hwa', category_ultra_filter: '' },
];

//#region ========================================== MATERIAL SECTIONS - BOEIBOORDEN ==========================================
const BOEIBOORD_ROCKPANEL_MATS: MaterialSection[] = [
  // 1. CONSTRUCTIE
  { label: 'Regelwerk / Achterhout', categoryFilter: 'Vuren hout', category: 'hout', key: 'regelwerk', category_ultra_filter: '' },

  // 2. ISOLATIE & FOLIES
  { label: 'Folies', categoryFilter: 'Folieën', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie', category_ultra_filter: '' },

  // 3. BEKLEDING
  { label: 'Rockpanel Plaat', categoryFilter: 'Rockpanel, Exterieur platen', category: 'beplating', key: 'boeiboord_plaat', category_ultra_filter: '' },

  // 4. AFWERKING
  { label: 'Ventilatieprofiel', categoryFilter: 'Daktoebehoren, Overig', category: 'afwerking', key: 'ventilatieprofiel', category_ultra_filter: '' },
  { label: 'Voegband', categoryFilter: 'Daktoebehoren, Overig', category: 'afwerking', key: 'voegband', category_ultra_filter: '' },
  { label: 'Eindprofiel', categoryFilter: 'Daktoebehoren, Overig', category: 'afwerking', key: 'eindprofiel', category_ultra_filter: '' },
  { label: 'Afwerkprofielen', categoryFilter: 'Daktoebehoren, Overig', category: 'afwerking', key: 'afwerk_profiel', category_ultra_filter: '' },
  { label: 'Rockpanel schroeven', categoryFilter: 'Golfplaten, Overig', category: 'afwerking', key: 'bevestiging', category_ultra_filter: '' },

  // 5. DAKTRIM
  { label: 'Daktrim', categoryFilter: 'Daktoebehoren, Overig', category: 'daktrim', key: 'daktrim', category_ultra_filter: '' },
];

const BOEIBOORD_TRESPA_MATS: MaterialSection[] = [
  // 1. CONSTRUCTIE
  { label: 'Regelwerk / Achterhout', categoryFilter: 'Vuren hout', category: 'hout', key: 'regelwerk', category_ultra_filter: '' },

  // 2. ISOLATIE & FOLIES
  { label: 'Folies', categoryFilter: 'Folieën', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie', category_ultra_filter: '' },

  // 3. BEKLEDING
  { label: 'Trespa / HPL Plaat', categoryFilter: 'Trespa, Exterieur platen', category: 'beplating', key: 'boeiboord_plaat', category_ultra_filter: '' },

  // 4. AFWERKING
  { label: 'Ventilatieprofiel', categoryFilter: 'Daktoebehoren, Overig', category: 'afwerking', key: 'ventilatieprofiel', category_ultra_filter: '' },
  { label: 'Voegband', categoryFilter: 'Daktoebehoren, Overig', category: 'afwerking', key: 'voegband', category_ultra_filter: '' },
  { label: 'Eindprofiel', categoryFilter: 'Daktoebehoren, Overig', category: 'afwerking', key: 'eindprofiel', category_ultra_filter: '' },
  { label: 'Afwerkprofielen', categoryFilter: 'Daktoebehoren, Overig', category: 'afwerking', key: 'afwerk_profiel', category_ultra_filter: '' },
  { label: 'Trespa schroeven', categoryFilter: 'Golfplaten, Overig', category: 'afwerking', key: 'bevestiging', category_ultra_filter: '' },

  // 5. DAKTRIM
  { label: 'Daktrim', categoryFilter: 'Daktoebehoren, Overig', category: 'daktrim', key: 'daktrim', category_ultra_filter: '' },
];

const BOEIBOORD_HOUT_MATS: MaterialSection[] = [
  // 1. CONSTRUCTIE
  { label: 'Regelwerk / Achterhout', categoryFilter: 'Vuren hout', category: 'hout', key: 'regelwerk', category_ultra_filter: '' },

  // 2. ISOLATIE & FOLIES
  { label: 'Folies', categoryFilter: 'Folieën', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie', category_ultra_filter: '' },

  // 3. BEKLEDING
  { label: 'Boeiboord Hout', categoryFilter: 'Merantie, Hardhout geschaafd, Vloer-rabat-vellingdelen', category: 'beplating', key: 'boeiboord_hout', category_ultra_filter: '' },

  // 4. AFWERKING
  { label: 'Ventilatieprofiel', categoryFilter: 'Daktoebehoren, Overig', category: 'afwerking', key: 'ventilatieprofiel', category_ultra_filter: '' },
  { label: 'Voegband', categoryFilter: 'Daktoebehoren, Overig', category: 'afwerking', key: 'voegband', category_ultra_filter: '' },
  { label: 'Eindprofiel', categoryFilter: 'Daktoebehoren, Overig', category: 'afwerking', key: 'eindprofiel', category_ultra_filter: '' },
  { label: 'Afwerklatten', categoryFilter: 'Hardhout geschaafd, Merantie', category: 'afwerking', key: 'afwerklatten', category_ultra_filter: '' },
  { label: 'Houtschroeven', categoryFilter: 'Golfplaten, Overig', category: 'afwerking', key: 'bevestiging', category_ultra_filter: '' },

  // 5. DAKTRIM
  { label: 'Daktrim', categoryFilter: 'Daktoebehoren, Overig', category: 'daktrim', key: 'daktrim', category_ultra_filter: '' },
];

const BOEIBOORD_KERALIT_MATS: MaterialSection[] = [
  // 1. CONSTRUCTIE
  { label: 'Regelwerk / Achterhout', categoryFilter: 'Vuren hout', category: 'hout', key: 'regelwerk', category_ultra_filter: '' },

  // 2. ISOLATIE & FOLIES
  { label: 'Folies', categoryFilter: 'Folieën', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie', category_ultra_filter: '' },

  // 3. BEKLEDING
  { label: 'Keralit Panelen', categoryFilter: 'Vloer-rabat-vellingdelen, Overig', category: 'beplating', key: 'keralit_panelen', category_ultra_filter: '' },

  // 4. AFWERKING
  { label: 'Ventilatieprofiel', categoryFilter: 'Daktoebehoren, Overig', category: 'afwerking', key: 'ventilatieprofiel', category_ultra_filter: '' },
  { label: 'Voegband', categoryFilter: 'Daktoebehoren, Overig', category: 'afwerking', key: 'voegband', category_ultra_filter: '' },
  { label: 'Eindprofiel', categoryFilter: 'Daktoebehoren, Overig', category: 'afwerking', key: 'eindprofiel', category_ultra_filter: '' },
  { label: 'Keralit Profielen', categoryFilter: 'Daktoebehoren, Overig', category: 'afwerking', key: 'keralit_profielen', category_ultra_filter: '' },
  { label: 'Bolkop schroeven', categoryFilter: 'Golfplaten, Overig', category: 'afwerking', key: 'bevestiging', category_ultra_filter: '' },

  // 5. DAKTRIM
  { label: 'Daktrim', categoryFilter: 'Daktoebehoren, Overig', category: 'daktrim', key: 'daktrim', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - GEVELBEKLEDING ==========================================

const GEVEL_BEKLEDING_BASE_MATS: MaterialSection[] = [
  // 1. BASIS (SKELETON)
  { label: 'Tengelwerk / Rachels', categoryFilter: 'Vuren hout', category: 'hout', key: 'regelwerk_basis', category_ultra_filter: '' },
  { label: 'Folie', categoryFilter: 'Folieën, Dpc', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_gevel', category_ultra_filter: '' },
];

const GEVEL_BEKLEDING_AFWERKING_MATS: MaterialSection[] = [
  // AFWERKING
  { label: 'Ventilatieprofiel', categoryFilter: 'Daktoebehoren, Overig', category: 'bevestiging', key: 'ventilatieprofiel', category_ultra_filter: '' },
  { label: 'Waterslagen', categoryFilter: 'Lood, Loodvervanger, Overig', category: 'bevestiging', key: 'waterslag', category_ultra_filter: '' },
];

const GEVEL_BEKLEDING_HOUT_MATS: MaterialSection[] = [
  ...GEVEL_BEKLEDING_BASE_MATS,
  { label: 'Houten Bekleding Rabat/Zweeds', categoryFilter: 'Vloer-rabat-vellingdelen, Hardhout geschaafd, Merantie', category: 'gevel_hout', key: 'gevelbekleding_hout', category_ultra_filter: '' },
  { label: 'Houten Hoeklatten', categoryFilter: 'Hardhout geschaafd, Merantie, Afwerking', category: 'gevel_hout', key: 'hoek_hout', category_ultra_filter: '' },
  ...GEVEL_BEKLEDING_AFWERKING_MATS,
];

const GEVEL_BEKLEDING_KERALIT_MATS: MaterialSection[] = [
  ...GEVEL_BEKLEDING_BASE_MATS,
  { label: 'Kunststof Panelen', categoryFilter: 'Vloer-rabat-vellingdelen, Overig', category: 'gevel_kunststof', key: 'gevelbekleding_kunststof', category_ultra_filter: '' },
  { label: 'Keralit Startprofiel', categoryFilter: 'Daktoebehoren, Overig', category: 'bevestiging', key: 'keralit_startprofiel', category_ultra_filter: '' },
  { label: 'Keralit Eindprofiel', categoryFilter: 'Daktoebehoren, Overig', category: 'bevestiging', key: 'keralit_eindprofiel', category_ultra_filter: '' },
  { label: 'Keralit Hoekprofiel', categoryFilter: 'Daktoebehoren, Overig', category: 'bevestiging', key: 'keralit_hoekprofiel', category_ultra_filter: '' },
  ...GEVEL_BEKLEDING_AFWERKING_MATS,
];

const GEVEL_BEKLEDING_TRESPA_MATS: MaterialSection[] = [
  ...GEVEL_BEKLEDING_BASE_MATS,
  { label: 'Volkern/HPL Plaat', categoryFilter: 'Trespa, Exterieur platen', category: 'gevel_plaat', key: 'gevelplaat', category_ultra_filter: '' },
  ...GEVEL_BEKLEDING_AFWERKING_MATS,
];

const GEVEL_BEKLEDING_ROCKPANEL_MATS: MaterialSection[] = [
  ...GEVEL_BEKLEDING_BASE_MATS,
  { label: 'Rockpanel Plaat', categoryFilter: 'Rockpanel, Exterieur platen', category: 'gevel_plaat', key: 'gevelplaat_rockpanel', category_ultra_filter: '' },
  ...GEVEL_BEKLEDING_AFWERKING_MATS,
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - KOZIJNEN XXX==========================================

// 1. BINNEN KOZIJNEN (HOUT)
const KOZIJN_BINNEN_HOUT_MATS: MaterialSection[] = [
  { label: 'Kozijn (Complete Set)', categoryFilter: 'Montage kozijnen', category: 'hout', key: 'kozijn_compleet', category_ultra_filter: '' },
  { label: 'Kozijnhout (Zelfbouw)', categoryFilter: 'Hardhout geschaafd', category: 'hout', key: 'kozijnhout', category_ultra_filter: '' },
  { label: 'Binnendorpel', categoryFilter: 'Hardhout geschaafd, Merantie', category: 'hout', key: 'binnendorpel', category_ultra_filter: '' },

  { label: 'Scharnieren', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'scharnieren', category_ultra_filter: '' },
  { label: 'Sluitplaat', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'sluitplaat', category_ultra_filter: '' },

  { label: 'Glas', categoryFilter: 'Overig', category: 'glas', key: 'glas_bovenlicht', category_ultra_filter: '' },
  { label: 'Glaslatten', categoryFilter: 'Afwerking', category: 'glas', key: 'glaslatten', category_ultra_filter: '' },

  { label: 'Koplatten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'koplatten', category_ultra_filter: '' },
  { label: 'Neuten', categoryFilter: 'Hardhout geschaafd, Afwerking', category: 'afwerking', key: 'neuten', category_ultra_filter: '' },
];

// 2. BINNEN KOZIJNEN (STAAL)
const KOZIJN_BINNEN_STAAL_MATS: MaterialSection[] = [
  { label: 'Stalen Kozijn', categoryFilter: 'Kozijnhout, Overig', category: 'Stalen kozijn', key: 'stalen_kozijn', category_ultra_filter: '' },

  { label: 'Paumelles', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'paumelles_staal', category_ultra_filter: '' },
  { label: 'Aanslagrubber', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'aanslagrubber', category_ultra_filter: '' },

  { label: 'Glas', categoryFilter: 'Overig', category: 'glas', key: 'glas_bovenlicht', category_ultra_filter: '' },
  { label: 'Glaslatten', categoryFilter: 'Deurbeslag, Kozijnhout', category: 'glas', key: 'glaslatten_klik', category_ultra_filter: '' },
];

// 3. BUITEN KOZIJNEN - HOUT (PREFAB / FABRIEK)
const KOZIJN_BUITEN_HOUT_MATS: MaterialSection[] = [
  { label: 'Kozijnelement', categoryFilter: 'Kozijnhout', category: 'element', key: 'prefab_kozijnelement', category_ultra_filter: '' },
  { label: 'Stelkozijnen', categoryFilter: 'Vuren hout', category: 'element', key: 'stelkozijnen', category_ultra_filter: '' },

  { label: 'Raamdorpelstenen', categoryFilter: 'Overig', category: 'afwerking_buiten', key: 'raamdorpel_steen', category_ultra_filter: '' },
  { label: 'Lood / DPC', categoryFilter: 'Lood, Loodvervanger, Dpc', category: 'afwerking_buiten', key: 'lood_dpc', category_ultra_filter: '' },

  { label: 'Dagkantbetimmering', categoryFilter: 'Interieur Platen, Constructieplaten', category: 'afwerking_binnen', key: 'dagkantafwerking', category_ultra_filter: '' },
  { label: 'Vensterbank', categoryFilter: 'Interieur Platen, Hardhout geschaafd', category: 'afwerking_binnen', key: 'vensterbank', category_ultra_filter: '' },
  { label: 'Koplatten', categoryFilter: 'Afwerking', category: 'afwerking_binnen', key: 'koplatten', category_ultra_filter: '' },
];

// 4. BUITEN KOZIJNEN - KUNSTSTOF (PREFAB)
const KOZIJN_BUITEN_KUNSTSTOF_MATS: MaterialSection[] = [
  { label: 'Kozijnelement', categoryFilter: 'Kozijnhout', category: 'element', key: 'profiel', category_ultra_filter: '' },
  { label: 'Onderdorpel', categoryFilter: 'Hardhout geschaafd, Overig', category: 'element', key: 'onderdorpel', category_ultra_filter: '' },

  { label: 'Stelkozijn', categoryFilter: 'Vuren hout', category: 'montage', key: 'stelkozijn', category_ultra_filter: '' },

  { label: 'Dagkantafwerking', categoryFilter: 'Interieur Platen, Gipsplaten', category: 'afwerking', key: 'dagkanten', category_ultra_filter: '' },
  { label: 'Waterslag', categoryFilter: 'Daktoebehoren, Lood, Overig', category: 'afwerking', key: 'waterslag', category_ultra_filter: '' },
  { label: 'Inzethorren', categoryFilter: 'Overig', category: 'afwerking', key: 'inzethorren', category_ultra_filter: '' },
];
// 5. AMBACHTELIJK TIMMERWERK (CUSTOM / RENOVATIE)
const KOZIJN_TIMMERWERK_RAAM_MATS: MaterialSection[] = [
  { label: 'Kozijnhout', categoryFilter: 'kozijnhout', category: 'hout', key: 'kozijnhout_buiten', category_ultra_filter: '' },
  { label: 'Tussen stijl', categoryFilter: 'kozijnhout', category: 'hout', key: 'tussenstijl', category_ultra_filter: '' },
  { label: 'Onderdorpel', categoryFilter: 'kozijnhout', category: 'hout', key: 'onderdorpel', category_ultra_filter: '' },

  { label: 'Raamhout', categoryFilter: 'kozijnhout', category: 'raam', key: 'raamhout', category_ultra_filter: '' },

  { label: 'Scharnieren', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'scharnieren', category_ultra_filter: '' },
  { label: 'Raamboom', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'raamboom', category_ultra_filter: '' },
  { label: 'Raamuitzetter', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'raamuitzetter', category_ultra_filter: '' },
  { label: 'Meerpuntsluiting', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'meerpuntsluiting', category_ultra_filter: '' },

  { label: 'Glas', categoryFilter: 'Overig', category: 'glas', key: 'glas_buiten', category_ultra_filter: '' },
  { label: 'Glaslatten', categoryFilter: 'Afwerking', category: 'glas', key: 'glaslatten', category_ultra_filter: '' },
  { label: 'Neuslatten', categoryFilter: 'Hardhout geschaafd, Merantie, Afwerking', category: 'glas', key: 'neuslatten', category_ultra_filter: '' },
  { label: 'Ventilatierooster', categoryFilter: 'Overig', category: 'glas', key: 'ventilatierooster', category_ultra_filter: '' },

  { label: 'Tochtkader', categoryFilter: 'Deurbeslag', category: 'afwerking', key: 'tochtkader', category_ultra_filter: '' },
  { label: 'Lood / DPC', categoryFilter: 'Lood, Loodvervanger, Dpc', category: 'afwerking', key: 'waterkering', category_ultra_filter: '' },
];

const KOZIJN_TIMMERWERK_DEUR_MATS: MaterialSection[] = [
  { label: 'Kozijnhout', categoryFilter: 'kozijnhout', category: 'hout', key: 'kozijnhout_buiten', category_ultra_filter: '' },
  { label: 'Tussen stijl', categoryFilter: 'kozijnhout', category: 'hout', key: 'tussenstijl', category_ultra_filter: '' },
  { label: 'Onderdorpel', categoryFilter: 'kozijnhout', category: 'hout', key: 'onderdorpel', category_ultra_filter: '' },

  { label: 'Scharnieren', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'scharnieren', category_ultra_filter: '' },
  { label: 'Meerpuntsluiting', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'meerpuntsluiting', category_ultra_filter: '' },

  { label: 'Glas', categoryFilter: 'Overig', category: 'glas', key: 'glas_buiten', category_ultra_filter: '' },
  { label: 'Neuslatten', categoryFilter: 'Hardhout geschaafd, Merantie, Afwerking', category: 'glas', key: 'neuslatten', category_ultra_filter: '' },
  { label: 'Ventilatierooster', categoryFilter: 'Overig', category: 'glas', key: 'ventilatierooster', category_ultra_filter: '' },

  { label: 'Tochtkader', categoryFilter: 'Deurbeslag', category: 'afwerking', key: 'tochtkader', category_ultra_filter: '' },
  { label: 'Lood / DPC', categoryFilter: 'Lood, Loodvervanger, Dpc', category: 'afwerking', key: 'waterkering', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - SCHUTTING ==========================================

const SCHUTTING_MATS: MaterialSection[] = [
  // 1. FUNDERING & PALEN (GENERAL)
  { label: 'Snelbeton', categoryFilter: 'Overig', category: 'fundering', key: 'snelbeton', category_ultra_filter: '' },
  { label: 'Opsluitbanden', categoryFilter: 'Overig', category: 'fundering', key: 'opsluitbanden', category_ultra_filter: '' },
  { label: 'Paalpunthouder', categoryFilter: 'Overig, Hardhout geschaafd', category: 'fundering', key: 'paalpunthouder', category_ultra_filter: '' },

  // 2. OPTIE: HOUT
  { label: 'Schuttingpalen hout', categoryFilter: 'Hardhout geschaafd, Vuren hout', category: 'schutting_hout', key: 'schuttingpalen_hout', category_ultra_filter: '' },
  { label: 'Paalkappen', categoryFilter: 'Overig', category: 'schutting_hout', key: 'paalkap', category_ultra_filter: '' },
  { label: 'Tuinscherm hout', categoryFilter: 'Vloer-rabat-vellingdelen, Hardhout geschaafd', category: 'schutting_hout', key: 'tuinscherm_hout', category_ultra_filter: '' },
  { label: 'Afdeklat hout', categoryFilter: 'Hardhout geschaafd, Vuren hout', category: 'schutting_hout', key: 'afdeklat_hout', category_ultra_filter: '' },
  { label: 'Losse tuinplanken', categoryFilter: 'Vloer-rabat-vellingdelen, Hardhout geschaafd, Vuren hout', category: 'schutting_hout', key: 'tuinplanken', category_ultra_filter: '' },

  // 3. OPTIE: BETON SYSTEEM
  { label: 'Betonpalen', categoryFilter: 'Overig', category: 'schutting_beton', key: 'betonpalen', category_ultra_filter: '' },
  { label: 'Onderplaten', categoryFilter: 'Overig', category: 'schutting_beton', key: 'onderplaten', category_ultra_filter: '' },
  { label: 'Afdekkappen beton', categoryFilter: 'Overig', category: 'schutting_beton', key: 'afdekkap_beton', category_ultra_filter: '' },
  { label: 'Unibeslag', categoryFilter: 'Overig', category: 'schutting_beton', key: 'unibeslag', category_ultra_filter: '' },

  // 4. OPTIE: COMPOSIET
  { label: 'Aluminium palen', categoryFilter: 'Overig', category: 'schutting_composiet', key: 'aluminium_palen', category_ultra_filter: '' },
  { label: 'Paalvoet', categoryFilter: 'Overig', category: 'schutting_composiet', key: 'paalvoet', category_ultra_filter: '' },
  { label: 'Tuinscherm composiet', categoryFilter: 'Overig, Rockpanel', category: 'schutting_composiet', key: 'tuinscherm_composiet', category_ultra_filter: '' },
  { label: 'U profielen', categoryFilter: 'Metalstud profielen, Overig', category: 'schutting_composiet', key: 'u_profiel', category_ultra_filter: '' },

  // 5. POORT & TOEGANG
  { label: 'Tuinpoort', categoryFilter: 'Buitendeuren, Hardhout geschaafd', category: 'poort', key: 'tuinpoort', category_ultra_filter: '' },
  { label: 'Stalen frame', categoryFilter: 'Overig', category: 'poort', key: 'stalen_frame', category_ultra_filter: '' },
  { label: 'Kozijnbalken', categoryFilter: 'Hardhout geschaafd, Merantie', category: 'poort', key: 'kozijnbalken', category_ultra_filter: '' },

  // 6. TUINDEUR BESLAG
  { label: 'Hengselset', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'hengselset', category_ultra_filter: '' },
  { label: 'Hengen', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'hengen', category_ultra_filter: '' },
  { label: 'Plaatduimen', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'plaatduimen', category_ultra_filter: '' },
  { label: 'Poortbeslag', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'poortbeslag', category_ultra_filter: '' },
  { label: 'Cilinderslot', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'cilinderslot', category_ultra_filter: '' },
  { label: 'Grondgrendel', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'grondgrendel', category_ultra_filter: '' },
  { label: 'Vloerstop', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'vloerstop', category_ultra_filter: '' },
];

//#endregion



//#region ========================================== MATERIAL SECTIONS - TRAPPEN ==========================================

const TRAPRENOVATIE_OVERZETTREDEN_MATS: MaterialSection[] = [
  { label: 'Overzettrede', categoryFilter: 'Vloer-rabat-vellingdelen, Hardhout geschaafd, Interieur Platen', category: 'basis', key: 'treden', category_ultra_filter: '' },
  { label: 'Stootbord', categoryFilter: 'Interieur Platen, Constructieplaten', category: 'basis', key: 'stootborden', category_ultra_filter: '' },
  { label: 'Trapneusprofiel', categoryFilter: 'Overig', category: 'afwerking', key: 'profiel', category_ultra_filter: '' },
  { label: 'Antislipstrip', categoryFilter: 'Overig', category: 'afwerking', key: 'antislip', category_ultra_filter: '' },
];

const VLIZOTRAP_MATS: MaterialSection[] = [
  { label: 'Raveling balkhout', categoryFilter: 'Vuren hout', category: 'hout', key: 'balken', category_ultra_filter: '' },
  { label: 'Vlizotrap (Complete set)', categoryFilter: 'Vlieringtrappen', category: 'basis', key: 'trap', category_ultra_filter: '' },
  { label: 'Zolderluik', categoryFilter: 'Overig, Binnendeuren', category: 'basis', key: 'luik', category_ultra_filter: '' },
  { label: 'Veiligheidshek', categoryFilter: 'Vuren hout, Hardhout geschaafd', category: 'veiligheid', key: 'traphek', category_ultra_filter: '' },
  { label: 'Veiligheidspoortje', categoryFilter: 'Overig', category: 'veiligheid', key: 'poortje', category_ultra_filter: '' },
  { label: 'Scharnier', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'scharnieren', category_ultra_filter: '' },
  { label: 'Grendel / Sluiting', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'sluiting', category_ultra_filter: '' },
  { label: 'Zelfsluitende veer', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'veer', category_ultra_filter: '' },
  { label: 'Handgreep', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'handgreep', category_ultra_filter: '' },
  { label: 'Koplatten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'architraaf', category_ultra_filter: '' },
];

const NIEUWE_TRAP_PLAATSEN_MATS: MaterialSection[] = [
  // CONSTRUCTIE & RAVELING
  { label: 'Raveling balkhout', categoryFilter: 'Vuren hout', category: 'hout', key: 'balken', category_ultra_filter: '' },
  { label: 'Balkdrager', categoryFilter: 'Overig', category: 'hout', key: 'balkdragers', category_ultra_filter: '' },

  { label: 'Bouwpakket trap', categoryFilter: 'Overig', category: 'trap', key: 'trap', category_ultra_filter: '' },
  { label: 'Trapboom', categoryFilter: 'Hardhout geschaafd, Merantie, Vuren hout', category: 'trap', key: 'trapboom', category_ultra_filter: '' },
  { label: 'Trede', categoryFilter: 'Vloer-rabat-vellingdelen, Hardhout geschaafd', category: 'trap', key: 'trede', category_ultra_filter: '' },
  { label: 'Stootbord', categoryFilter: 'Interieur Platen, Constructieplaten', category: 'trap', key: 'stootbord', category_ultra_filter: '' },

  // VEILIGHEID & BESLAG
  { label: 'Trapaal', categoryFilter: 'Hardhout geschaafd, Merantie', category: 'veiligheid', key: 'trapaal', category_ultra_filter: '' },
  { label: 'Spijl', categoryFilter: 'Hardhout geschaafd, Overig', category: 'beslag', key: 'spijlen', category_ultra_filter: '' },
  { label: 'Trapleuning', categoryFilter: 'Hardhout geschaafd, Merantie, Afwerking', category: 'veiligheid', key: 'leuning', category_ultra_filter: '' },
  { label: 'Leuninghouder', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'houders', category_ultra_filter: '' },
  { label: 'Balustrade', categoryFilter: 'Hardhout geschaafd, Vuren hout', category: 'veiligheid', key: 'balustrade', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - HOUTROTREPARATIE ==========================================

const HOUTROTREPARATIE_MATS: MaterialSection[] = [
  { label: 'Houtrotstop vloeistof', categoryFilter: 'Overig', category: 'reparatie', key: 'houtrotstop', category_ultra_filter: '' },
  { label: 'Houtstabilisator', categoryFilter: 'Overig', category: 'reparatie', key: 'stabilisator', category_ultra_filter: '' },

  { label: 'Twee-componenten epoxy vuller', categoryFilter: 'Overig', category: 'reparatie', key: 'epoxy_vuller', category_ultra_filter: '' },
  { label: 'Vervangend hout inzetstuk', categoryFilter: 'Merantie, Hardhout geschaafd, Vuren hout', category: 'reparatie', key: 'hout_inzetstuk', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - KEUKENS ==========================================

const KEUKEN_MONTAGE_MATS: MaterialSection[] = [
  // BASIS
  { label: 'Keukenkast', categoryFilter: 'Interieur Platen, Constructieplaten', category: 'basis', key: 'corpus', category_ultra_filter: '' },
  { label: 'Aanrechtblad', categoryFilter: 'Interieur Platen, Hardhout geschaafd, Merantie', category: 'werkblad', key: 'werkblad', category_ultra_filter: '' },

  // APPARATUUR & SPOELBAK
  { label: 'Inbouwapparaat', categoryFilter: 'Overig', category: 'werkblad', key: 'apparatuur', category_ultra_filter: '' },
  { label: 'Spoelbak', categoryFilter: 'Overig', category: 'beslag', key: 'spoelbak', category_ultra_filter: '' },
  { label: 'Keukenkraan', categoryFilter: 'Overig', category: 'beslag', key: 'kraan', category_ultra_filter: '' },

  // DETAILS
  { label: 'Handgreep', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'grepen', category_ultra_filter: '' },
  { label: 'Keukenplint', categoryFilter: 'Afwerking, Interieur Platen', category: 'beslag', key: 'plint', category_ultra_filter: '' },
  { label: 'Keukenverlichting', categoryFilter: 'Overig', category: 'beslag', key: 'verlichting', category_ultra_filter: '' },
];

const KEUKEN_RENOVATIE_MATS: MaterialSection[] = [
  // ZICHTWERK
  { label: 'Keukenfront', categoryFilter: 'Interieur Platen, Merantie, Binnendeuren', category: 'basis', key: 'fronten', category_ultra_filter: '' },
  { label: 'Aanrechtblad', categoryFilter: 'Interieur Platen, Hardhout geschaafd', category: 'werkblad', key: 'werkblad', category_ultra_filter: '' },

  { label: 'Scharnier', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'scharnieren', category_ultra_filter: '' },
  { label: 'Ladegeleider', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'geleiders', category_ultra_filter: '' },
  { label: 'Handgreep', categoryFilter: 'Deurbeslag', category: 'beslag', key: 'grepen', category_ultra_filter: '' },

  // UPGRADES
  { label: 'Inbouwapparaat', categoryFilter: 'Overig', category: 'werkblad', key: 'apparatuur', category_ultra_filter: '' },
  { label: 'Keukenkraan', categoryFilter: 'Overig', category: 'beslag', key: 'kraan', category_ultra_filter: '' },
];

//#endregion





//#region ========================================== MATERIAL SECTIONS - GLAS ZETTEN ==========================================

const ISOLATIEGLAS_MATS: MaterialSection[] = [
  { label: 'Glas', categoryFilter: 'Overig', category: 'glas', key: 'glas', category_ultra_filter: '' },
  { label: 'Ventilatie roosters', categoryFilter: 'Overig', category: 'glas', key: 'roosters', category_ultra_filter: '' },
  { label: 'Glaslatten', categoryFilter: 'Afwerking', category: 'glas', key: 'glaslatten', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - DAKRAMEN ==========================================

const VELUX_MATS: MaterialSection[] = [
  { label: 'Velux dakraam set', categoryFilter: 'Dakramen', category: 'vensterset', key: 'vensterset_compleet', category_ultra_filter: '', multiEntry: true },
  { label: 'Velux Venster', categoryFilter: 'Dakramen', category: 'venster', key: 'venster_los', category_ultra_filter: '', multiEntry: true },
  { label: 'Gootstukken', categoryFilter: 'Dakramen, Daktoebehoren', category: 'gootstuk', key: 'gootstuk', category_ultra_filter: '', multiEntry: true },
  { label: 'Afwerk plaat', categoryFilter: 'Interieur Platen, Afwerking', category: 'afwerking', key: 'betimmering', category_ultra_filter: '' },
  { label: 'Plinten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'plinten', category_ultra_filter: '' },
];

const LICHTKOEPEL_MATS: MaterialSection[] = [
  { label: 'Lichtkoepel', categoryFilter: 'Lichtkoepels', category: 'koepel', key: 'koepel', category_ultra_filter: '', multiEntry: true },
  { label: 'Opstand Houtbalk of Prefab Set', categoryFilter: 'Lichtkoepels, Vuren hout', category: 'opstand', key: 'opstand', category_ultra_filter: '', multiEntry: true },
  { label: 'Dakbedekking', categoryFilter: 'Epdm, Dakrollen', category: 'afwerking_dak', key: 'dakbedekking', category_ultra_filter: '' },
  { label: 'Afwerk plaat', categoryFilter: 'Interieur Platen, Afwerking', category: 'afwerking', key: 'betimmering', category_ultra_filter: '' },
  { label: 'Plinten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'plinten', category_ultra_filter: '' },
];

//WATCH OUT BECAUSE THIS MIGHT NOT BE CORRECT AT ALL VVVVVVVVVVVVV

//#region ========================================== MATERIAL SECTIONS - SLOOPWERK & LOGISTIEK ==========================================
const SLOOPWERK_MATS: MaterialSection[] = [
  { label: 'Sloopwerk (m2/uur)', categoryFilter: 'Overig', category: 'sloopwerk', key: 'sloopwerk', category_ultra_filter: '' },
  { label: 'Afplakken/Beschermen', categoryFilter: 'Overig', category: 'sloopwerk', key: 'afplakken', category_ultra_filter: '' },
  { label: 'Afvalafvoer (Container)', categoryFilter: 'Overig', category: 'project_overheads', key: 'afval', category_ultra_filter: '' },
];
//#endregion

//#region ========================================== MATERIAL SECTIONS - CONSTRUCTIEF ==========================================
const CONSTRUCTIEF_MATS: MaterialSection[] = [
  { label: 'Stalen balk plaatsen (HEB/IPE)', categoryFilter: 'Vuren hout', category: 'constructie', key: 'stalen_balk', category_ultra_filter: '' },
  { label: 'Stempelwerk', categoryFilter: 'Overig', category: 'constructie', key: 'stempelwerk', category_ultra_filter: '' },
];
//#endregion

//#region ========================================== MATERIAL SECTIONS - BEVEILIGING ==========================================
const BEVEILIGING_MATS: MaterialSection[] = [
  { label: 'Hang- en Sluitwerk (PKVW)', categoryFilter: 'Deurbeslag', category: 'beveiliging', key: 'hang_sluitwerk', category_ultra_filter: '', multiEntry: true },
];
//#endregion

//#region ========================================== MATERIAL SECTIONS - ISOLATIE ==========================================
const ISOLATIE_ZOLDER_MATS: MaterialSection[] = [
  { label: 'Zolderisolatie', categoryFilter: ['Isolatie'], category: 'isolatie', key: 'isolatie', category_ultra_filter: '' },
  { label: 'Afwerking', categoryFilter: 'Constructieplaten', category: 'afwerking', key: 'afwerking', category_ultra_filter: '' },
];

const ISOLATIE_VLOER_MATS: MaterialSection[] = [
  { label: 'Vloerisolatie', categoryFilter: ['Isolatie'], category: 'isolatie', key: 'isolatie', category_ultra_filter: '' },
  { label: 'Bodemfolie', categoryFilter: 'Overig', category: 'isolatie', key: 'folie', category_ultra_filter: '' },
];
//#endregion

//#region ========================================== MATERIAL SECTIONS - EXTERIEUR DETAILS ==========================================
const WINDVEREN_MATS: MaterialSection[] = [
  { label: 'Regelwerk / Achterhout', categoryFilter: 'Vuren hout', category: 'hout', key: 'regelwerk', category_ultra_filter: '' },
  { label: 'Windveren (Hout/Kunststof)', categoryFilter: 'Exterieur platen', category: 'exterieur_details', key: 'windveren', category_ultra_filter: '' },
  { label: 'Lijsten & Profielen', categoryFilter: 'Overig', category: 'afwerking', key: 'afwerking', category_ultra_filter: '' },
];

const WATERSLAGEN_DORPELS_MATS: MaterialSection[] = [
  { label: 'Waterslagen (Aluminium)', categoryFilter: 'Daktoebehoren', category: 'exterieur_details', key: 'waterslag', category_ultra_filter: '' },
  { label: 'Raamdorpelstenen', categoryFilter: 'Kozijnhout', category: 'exterieur_details', key: 'raamdorpel', category_ultra_filter: '' },
  { label: 'Lood / DPC', categoryFilter: 'Overig', category: 'exterieur_details', key: 'lood', category_ultra_filter: '' },
];
//#endregion

// 4. THE REGISTRY (Database)

//#endregion

export const JOB_REGISTRY: Record<string, CategoryConfig> = {

  //#region --- TRAPPEN ---
  overzettreden: {
    title: 'Overzettreden',
    searchPlaceholder: 'Zoek traprenovatie...',
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
    ]
  },
  vlizotrap: {
    title: 'Vlizotrappen',
    searchPlaceholder: 'Zoek vlizotrap...',
    items: [
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
    ]
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
        description: 'Enkelzijdig Bekleed',
        slug: 'hsb-voorzetwand',
        measurementLabel: 'Wand',
        measurements: HSB_VOORZETWAND_FIELDS,
        materialSections: HSB_VOORZETWAND_BINNEN_MATS,
        categoryConfig: {
          hout: { title: 'Framewerk', order: 1 },
          isolatie: { title: 'Isolatie & Folies', order: 2 },
          beplating: { title: 'Beplating', order: 3 },
          afwerking: { title: 'Afwerken', order: 5 },
          gips_afwerking: { title: 'Naden & Stucwerk', order: 7 },
          Kozijnen: { title: 'Kozijnen', order: 8 },
          Deuren: { title: 'Deuren', order: 9 },
          Koof: { title: 'Koof', order: 10 },
          Dagkant: { title: 'Dagkanten', order: 12 },
          Vensterbank: { title: 'Vensterbanken', order: 13 },
        }
      },
      {
        title: 'HSB Tussenwand',
        description: 'Dubbelzijdig Bekleed',
        slug: 'hsb-tussenwand',
        measurementLabel: 'Wand',
        measurements: WALL_FIELDS,
        materialSections: HSB_SCHEIDINGSWAND_MATS,
        categoryConfig: {
          hout: { title: 'Framewerk (Hout)', order: 1 },
          isolatie: { title: 'Isolatie', order: 2 },
          beplating: { title: 'Beplating', order: 3 },
          Koof: { title: 'Koof', order: 6 },
          afwerking: { title: 'Afwerken', order: 7 },
          gips_afwerking: { title: 'Naden & Stucwerk', order: 8 },
          Kozijnen: { title: 'Kozijnen', order: 9 },
          Deuren: { title: 'Deuren', order: 10 },
          Dagkant: { title: 'Dagkanten', order: 11 },
          Vensterbank: { title: 'Vensterbanken', order: 12 },
        }
      },
      {
        title: 'Metalstud Wand',
        description: 'Enkelzijdig Bekleed',
        slug: 'metalstud-voorzetwand',
        measurementLabel: 'Wand',
        measurements: WALL_FIELDS,
        materialSections: METALSTUD_VOORZETWAND_BINNEN_MATS,
        categoryConfig: {
          metaal: { title: 'Metal Stud Framewerk', order: 1 },
          isolatie: { title: 'Isolatie & Folies', order: 2 },
          beplating: { title: 'Beplating', order: 3 },
          Koof: { title: 'Koof', order: 6 },
          afwerking: { title: 'Afwerken', order: 7 },
          gips_afwerking: { title: 'Naden & Stucwerk', order: 8 },
          Kozijnen: { title: 'Kozijnen', order: 9 },
          Deuren: { title: 'Deuren', order: 10 },
          Dagkant: { title: 'Dagkanten', order: 11 },
          Vensterbank: { title: 'Vensterbanken', order: 12 },
        }
      },
      {
        title: 'Metalstud Tussenwand',
        description: 'Dubbelzijdig Bekleed',
        slug: 'metalstud-tussenwand',
        measurementLabel: 'Wand',
        measurements: WALL_FIELDS,
        materialSections: METALSTUD_SCHEIDINGSWAND_MATS,
        categoryConfig: {
          metaal: { title: 'Metal Stud Framewerk', order: 1 },
          isolatie: { title: 'Isolatie', order: 2 },
          beplating: { title: 'Beplating', order: 3 },
          Koof: { title: 'Koof', order: 6 },
          afwerking: { title: 'Afwerken', order: 7 },
          gips_afwerking: { title: 'Naden & Stucwerk', order: 8 },
          Kozijnen: { title: 'Kozijnen', order: 9 },
          Deuren: { title: 'Deuren', order: 10 },
          Dagkant: { title: 'Dagkanten', order: 11 },
          Vensterbank: { title: 'Vensterbanken', order: 12 },
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
          hout: { title: 'Framewerk', order: 1 },
          isolatie: { title: 'Isolatie & Folies', order: 2 },
          beplating: { title: 'Beplating', order: 3 },
          afwerking_buiten: { title: 'Buitenafwerking', order: 4 },
          afwerking_binnen: { title: 'Binnenafwerking', order: 5 },
          gips_afwerking: { title: 'Stucwerk', order: 6 },
          Kozijnen: { title: 'Kozijnen & Ramen', order: 7 },
          Deuren: { title: 'Buitendeuren & Hang- en Sluitwerk', order: 8 },
          Dagkant: { title: 'Dagkanten', order: 9 },
          Vensterbank: { title: 'Vensterbanken', order: 10 },
        }
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
          isolatie: { title: 'Isolatie & Folies', order: 2 },
          beplating: { title: 'Beplating', order: 3 },
          afwerking: { title: 'Afwerken', order: 4 },
          gips_afwerking: { title: 'Naden & Stucwerk', order: 5 },
          Koof: { title: 'Koof', order: 6 },
          Toegang: { title: 'Toegang & Vlizotrap', order: 10 },
        }
      },
      {
        title: 'Plafond – Metalstud C/U',
        description: 'Metalen plafondconstructie',
        slug: 'plafond-metalstud',
        measurementLabel: 'Plafond',
        measurements: METAL_STUD_CEILING_FIELDS,
        materialSections: PLAFOND_METALSTUD_MATS,
        categoryConfig: {
          metaal: { title: 'Metal Stud Framewerk', order: 1 },
          isolatie: { title: 'Isolatie & Folies', order: 2 },
          beplating: { title: 'Beplating', order: 3 },
          afwerking: { title: 'Afwerken', order: 4 },
          gips_afwerking: { title: 'Naden & Stucwerk', order: 5 },
          Koof: { title: 'Koof', order: 6 },
          Toegang: { title: 'Toegang & Vlizotrap', order: 10 },
        }
      },

    ],
  },

  // --- VLOEREN ---
  // --- VLOEREN ---
  'vloer-constructie': {
    title: 'Constructie Vloer',
    searchPlaceholder: 'Zoek vloertype...',
    items: [
      {
        title: 'Constructievloer hout',
        description: 'Tussenvloer / Begane grond',
        slug: 'vliering-maken',
        measurementLabel: 'Vloer',
        measurements: VLIERING_FIELDS,
        materialSections: VLIERING_MATS,
        categoryConfig: {
          Constructievloer: { title: 'Constructie', order: 1 },
          beplating: { title: 'Beplating', order: 2 },
          isolatie: { title: 'Isolatie & Folies', order: 3 },
          Toegang: { title: 'Toegang & Vlizotrap', order: 4 },
          Koof: { title: 'Koof', order: 7 },
          afwerking: { title: 'Afwerken', order: 12 },
        }
      },
      {
        title: 'Vlonder / Terrasconstructie',
        description: 'Buitenconstructie (hout/composiet)',
        slug: 'vlonder-terras',
        measurementLabel: 'Terras',
        measurements: VLONDER_FIELDS,
        materialSections: VLONDER_MATS,
        categoryConfig: {
          Vlonder_Fundering: { title: 'Grondwerk & Fundering', order: 1 },
          Vlonder_Constructie: { title: 'Constructie (Onderbouw)', order: 2 },
          Vlonder_Dek: { title: 'Vlonder & Afwerking', order: 3 }
        },
        hidden: true
      },

    ],
  },
  'vloer-afwerking': {
    title: 'Afwerk Vloer',
    searchPlaceholder: 'Zoek vloertype...',
    items: [
      {
        title: 'Massief Houten Vloer',
        description: 'Afwerkvloer',
        slug: 'massief-houten-vloer',
        measurementLabel: 'Vloer',
        measurements: FLOOR_FIELDS,
        materialSections: MASSIEF_HOUTEN_VLOER_FINISH_MATS,
        categoryConfig: {
          Vloer_Voorbereiding: { title: 'Voorbereiding', order: 1 },
          Vloer_Hout: { title: 'Parket', order: 2 },
          Vloer_Afwerking: { title: 'Afwerking', order: 3 }
        }
      },
      {
        title: 'Laminaat / PVC / Klik-Vinyl',
        description: 'Afwerkvloer',
        slug: 'laminaat-pvc',
        measurementLabel: 'Vloer',
        measurements: FLOOR_FIELDS,
        materialSections: VLOER_AFWERK_MATS,
        categoryConfig: {
          Vloer_Voorbereiding: { title: 'Voorbereiding', order: 1 },
          Vloer_Laminaat: { title: 'Vloerdelen', order: 2 },
          Vloer_Afwerking: { title: 'Afwerking', order: 3 }
        }
      },

    ],
  },



  //#endregion

  //#region --- BOEIBOORDEN ---
  boeiboorden: {
    title: 'Boeidelen',
    searchPlaceholder: 'Zoek boeiboordklus...',
    items: [
      {
        title: 'Boeidelen (Rockpanel)',
        description: 'Vervangen door Rockpanel',
        slug: 'boeiboorden-rockpanel',
        measurementLabel: 'Boeiboord',
        measurements: BOEIBOORD_FIELDS,
        materialSections: BOEIBOORD_ROCKPANEL_MATS,
        categoryConfig: {
          hout: { title: 'Regelwerk', order: 1 },
          isolatie: { title: 'Isolatie & Folies', order: 2 },
          beplating: { title: 'Bekleding (Rockpanel)', order: 3 },
          afwerking: { title: 'Afwerking & Profielen', order: 4 },
          daktrim: { title: 'Daktrim', order: 5 },
        }
      },
      {
        title: 'Boeidelen (Trespa/HPL)',
        description: 'Vervangen door Trespa/HPL',
        slug: 'boeiboorden-trespa',
        measurementLabel: 'Boeiboord',
        measurements: BOEIBOORD_FIELDS,
        materialSections: BOEIBOORD_TRESPA_MATS,
        categoryConfig: {
          hout: { title: 'Regelwerk', order: 1 },
          isolatie: { title: 'Isolatie & Folies', order: 2 },
          beplating: { title: 'Bekleding (Trespa/HPL)', order: 3 },
          afwerking: { title: 'Afwerking & Profielen', order: 4 },
          daktrim: { title: 'Daktrim', order: 5 },
        }
      },
      {
        title: 'Boeidelen (Hout)',
        description: 'Vervangen door Hardhout/Meranti',
        slug: 'boeiboorden-hout',
        measurementLabel: 'Boeiboord',
        measurements: BOEIBOORD_FIELDS,
        materialSections: BOEIBOORD_HOUT_MATS,
        categoryConfig: {
          hout: { title: 'Regelwerk', order: 1 },
          isolatie: { title: 'Isolatie & Folies', order: 2 },
          beplating: { title: 'Bekleding (Hout)', order: 3 },
          afwerking: { title: 'Afwerking & Profielen', order: 4 },
          daktrim: { title: 'Daktrim', order: 5 },
        }
      },
      {
        title: 'Boeidelen (Keralit)',
        description: 'Vervangen door Keralit',
        slug: 'boeiboorden-keralit',
        measurementLabel: 'Boeiboord',
        measurements: BOEIBOORD_FIELDS,
        materialSections: BOEIBOORD_KERALIT_MATS,
        categoryConfig: {
          hout: { title: 'Regelwerk', order: 1 },
          isolatie: { title: 'Isolatie & Folies', order: 2 },
          beplating: { title: 'Bekleding (Keralit)', order: 3 },
          afwerking: { title: 'Afwerking & Profielen', order: 4 },
          daktrim: { title: 'Daktrim', order: 5 },
        }
      }
    ]
  },

  //#endregion



  //#endregion

  //#region --- MEUBLS OP MAAT ---



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
        measurements: STANDARD_FIELDS,
        materialSections: PLINTEN_MATS,
        categoryConfig: {
          plinten: { title: 'Plinten', order: 1 },
          afwerking: { title: 'Afwerklatten', order: 2 },
        },
      },
      {
        title: 'Omkastingen',
        description: 'Balken of constructie wegwerken',
        slug: 'omkastingen',
        measurementLabel: 'Omkasting',
        measurements: COUNT_FIELDS,
        materialSections: OMKASTING_MATS,
        categoryConfig: {
          hout: { title: 'Constructie & Regelwerk', order: 1 },
          afwerking: { title: 'Afwerking', order: 2 },
        },
      },
      {
        title: 'Koof',
        description: 'Leidingen en afvoeren wegwerken',
        slug: 'koof',
        measurementLabel: 'Koof',
        measurements: KOOF_FIELDS,
        materialSections: KOOF_MATS,
        categoryConfig: {
          hout: { title: 'Constructie & Regelwerk', order: 1 },
          beplating: { title: 'Beplating', order: 2 },
          isolatie: { title: 'Isolatie', order: 3 },
          afwerking: { title: 'Afwerking', order: 4 },
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
        measurements: [],
        materialSections: DEUR_BINNEN_MATS,
        categoryConfig: {
          Deuren: { title: 'Binnendeur', order: 1 },
          deurbeslag: { title: 'Deurbeslag', order: 2 },
          glas: { title: 'Glas', order: 3 },
          tochtstrips: { title: 'Tochtwering', order: 4 },
          ventilatie: { title: 'Ventilatie', order: 5 },
        }
      },
      {
        title: 'Buitendeuren',
        description: 'Voordeur/Achterdeur',
        slug: 'buitendeur-afhangen',
        measurementLabel: 'Deur',
        measurements: [],
        materialSections: DEUR_BUITEN_MATS,
        categoryConfig: {
          Deuren: { title: 'Buitendeur', order: 1 },
          deurbeslag: { title: 'Deurbeslag', order: 2 },
          glas: { title: 'Glas', order: 3 },
          tochtstrips: { title: 'Tochtwering', order: 4 },
          ventilatie: { title: 'Ventilatie', order: 5 },
        }
      },
      {
        title: 'Schuifdeuren',
        description: 'Schuifdeuren systeem',
        slug: 'Schuifdeuren',
        measurementLabel: 'Deur',
        measurements: [],
        materialSections: DEUR_SCHUIF_MATS,
        categoryConfig: {
          Schuifdeur: { title: 'Schuifdeur', order: 1 },
          Schuifdeuren: { title: 'Schuifdeur Beslag', order: 1 },
        }
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
        measurements: [
          { key: 'aantal_pannen_breedte', label: 'Breedte (aantal pannen)', type: 'number', suffix: 'stuks', placeholder: 'Bijv. 25' },
          { key: 'aantal_pannen_hoogte', label: 'Hoogte (aantal pannen)', type: 'number', suffix: 'stuks', placeholder: 'Bijv. 40' },
          { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Maatvoering volgt uit pannenkeuze' },
          { key: 'hoogte', label: 'Breedte', type: 'number', suffix: 'mm', placeholder: 'Maatvoering volgt uit pannenkeuze' },
          { key: 'balkafstand', label: 'Tengelafstand (h.o.h.)', type: 'number', suffix: 'mm', defaultValue: 600, group: 'spacing' },
          { key: 'latafstand', label: 'Panlatafstand (h.o.h.)', type: 'number', suffix: 'mm', placeholder: 'Berekend op basis dakpannen', group: 'spacing' },
          { key: 'opmerkingen', label: 'Extra opmerkingen', type: 'textarea', placeholder: 'Bijzondere details...' }
        ],
        materialSections: DAK_HELLEND_MATS,
        categoryConfig: {
          beplating: { title: 'Dakbeschot', order: 1 },
          isolatie: { title: 'Isolatie & Folies', order: 2 },
          hout: { title: 'Tengels & Panlatten', order: 3 },
          dak: { title: 'Dakpannen', order: 4 },
          afwerking_dak: { title: '5. Afwerking', order: 5 },
        },
      },
      {
        title: 'EPDM Dakbedekking',
        description: 'Platte daken',
        slug: 'epdm-dakbedekking',
        measurementLabel: 'Dakvlak',
        measurements: EPDM_FIELDS,
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
        measurements: GEVELBEKLEDING_FIELDS,
        materialSections: DAK_GOLFPLAAT_MATS,
        categoryConfig: {
          hout: { title: 'Framewerk', order: 1 },
          isolatie: { title: 'Isolatie & Folies', order: 2 },
          dak: { title: 'Golfplaten', order: 3 },
          afwerking_dak: { title: 'Bevestiging & Afwerking', order: 4 },
        }
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
        title: 'Trespa/HPL',
        description: 'Volkern/HPL platen',
        slug: 'gevelbekleding-trespa-hpl',
        measurementLabel: 'Gevel',
        measurements: GEVELBEKLEDING_FIELDS,
        materialSections: GEVEL_BEKLEDING_TRESPA_MATS,
        categoryConfig: {
          hout: { title: 'Constructie', order: 1 },
          isolatie: { title: 'Isolatie & Folie', order: 2 },
          gevel_plaat: { title: 'Trespa/HPL Geschroefd', order: 3 },
          gevel_plaat_lijm: { title: 'Trespa/HPL Verlijmd', order: 4 },
          bevestiging: { title: 'Afwerking', order: 9 },
        }
      },
      {
        title: 'Keralit',
        description: 'Kunststof panelen',
        slug: 'gevelbekleding-keralit',
        measurementLabel: 'Gevel',
        measurements: GEVELBEKLEDING_FIELDS,
        materialSections: GEVEL_BEKLEDING_KERALIT_MATS,
        categoryConfig: {
          hout: { title: 'Constructie', order: 1 },
          isolatie: { title: 'Isolatie & Folie', order: 2 },
          gevel_kunststof: { title: 'Keralit', order: 3 },
          bevestiging: { title: 'Afwerking', order: 9 },
        }
      },
      {
        title: 'Hout',
        description: 'Rabat/Zweeds',
        slug: 'gevelbekleding-hout',
        measurementLabel: 'Gevel',
        measurements: GEVELBEKLEDING_FIELDS,
        materialSections: GEVEL_BEKLEDING_HOUT_MATS,
        categoryConfig: {
          hout: { title: 'Constructie', order: 1 },
          isolatie: { title: 'Isolatie & Folie', order: 2 },
          gevel_hout: { title: 'Hout', order: 3 },
          bevestiging: { title: 'Afwerking', order: 9 },
        }
      },
      {
        title: 'Rockpanel',
        description: 'Cementvezel platen',
        slug: 'gevelbekleding-rockpanel',
        measurementLabel: 'Gevel',
        measurements: GEVELBEKLEDING_FIELDS,
        materialSections: GEVEL_BEKLEDING_ROCKPANEL_MATS,
        categoryConfig: {
          hout: { title: 'Constructie', order: 1 },
          isolatie: { title: 'Isolatie & Folie', order: 2 },
          gevel_plaat: { title: 'Rockpanel', order: 3 },
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
        title: 'Binnen kozijn (Hout)',
        description: 'Kant-en-klaar element',
        slug: 'binnen-kozijn-hout',
        measurementLabel: 'Kozijn',
        measurements: [],
        materialSections: KOZIJN_BINNEN_HOUT_MATS,
        categoryConfig: {
          hout: { title: 'Kozijnhout', order: 1 },
          beslag: { title: 'Hang- & Sluitwerk', order: 2 },
          glas: { title: 'Glas & Beglazing', order: 3 },
          afwerking: { title: 'Afwerking', order: 4 },
        }
      },
      {
        title: 'Binnen kozijn (Staal)',
        description: 'Kant-en-klaar element',
        slug: 'binnen-kozijn-staal',
        measurementLabel: 'Kozijn',
        measurements: [],
        materialSections: KOZIJN_BINNEN_STAAL_MATS,
        categoryConfig: {
          'Stalen kozijn': { title: 'Stalen Kozijn', order: 1 },
          beslag: { title: 'Hang- & Sluitwerk', order: 2 },
          glas: { title: 'Glas & Beglazing', order: 3 },
        }
      },
      {
        title: 'Buiten kozijn (Hout)',
        description: 'Kant-en-klaar element',
        slug: 'buiten-kozijn-hout',
        measurementLabel: 'Kozijn',
        measurements: [],
        materialSections: KOZIJN_BUITEN_HOUT_MATS,
        categoryConfig: {
          element: { title: 'Kozijnelement', order: 1 },
          afwerking_buiten: { title: 'Afwerking Buiten', order: 2 },
          afwerking_binnen: { title: 'Afwerking Binnen', order: 3 },
        }
      },
      {
        title: 'Buiten kozijn (Kunststof)',
        description: 'Kant-en-klaar element',
        slug: 'buiten-kozijn-kunststof',
        measurementLabel: 'Kozijn',
        measurements: [],
        materialSections: KOZIJN_BUITEN_KUNSTSTOF_MATS,
        categoryConfig: {
          element: { title: 'Kozijnelement', order: 1 },
          montage: { title: 'Montage', order: 2 },
          afwerking: { title: 'Afwerking', order: 3 },
        }
      },
      {
        title: 'Maatwerk kozijnen',
        description: 'Productie in eigen werkplaats',
        slug: 'maatwerk-kozijnen',
        measurementLabel: 'Kozijn',
        measurements: COUNT_FIELDS,
        materialSections: KOZIJN_TIMMERWERK_RAAM_MATS,
        categoryConfig: {
          hout: { title: 'Kozijnhout', order: 1 },
          raam: { title: 'Ramen', order: 2 },
          beslag: { title: 'Hang- & Sluitwerk', order: 3 },
          glas: { title: 'Glas', order: 4 },
          afwerking: { title: 'Afwerking', order: 5 },
        }
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
        title: 'Schutting (Hout)',
        description: 'Houten schutting plaatsen',
        slug: 'schutting-hout',
        measurementLabel: 'Schutting',
        measurements: SCHUTTING_FIELDS,
        materialSections: SCHUTTING_MATS,
        categoryConfig: {
          fundering: { title: 'Basis & Fundering', order: 1 },
          schutting_hout: { title: 'Schutting Hout', order: 2 },
          poort: { title: 'Poort & Toegang', order: 5 },
          beslag: { title: 'Tuindeur Beslag', order: 6 },
        },
      },
      {
        title: 'Schutting (Beton)',
        description: 'Beton schutting plaatsen',
        slug: 'schutting-beton',
        measurementLabel: 'Schutting',
        measurements: SCHUTTING_FIELDS,
        materialSections: SCHUTTING_MATS,
        categoryConfig: {
          fundering: { title: 'Basis & Fundering', order: 1 },
          schutting_beton: { title: 'Schutting Beton', order: 2 },
          poort: { title: 'Poort & Toegang', order: 5 },
          beslag: { title: 'Tuindeur Beslag', order: 6 },
        },
      },
      {
        title: 'Schutting (Composiet)',
        description: 'Composiet schutting plaatsen',
        slug: 'schutting-composiet',
        measurementLabel: 'Schutting',
        measurements: SCHUTTING_FIELDS,
        materialSections: SCHUTTING_MATS,
        categoryConfig: {
          fundering: { title: 'Basis & Fundering', order: 1 },
          schutting_composiet: { title: 'Schutting Composiet', order: 2 },
          poort: { title: 'Poort & Toegang', order: 5 },
          beslag: { title: 'Tuindeur Beslag', order: 6 },
        },
      },
    ]
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
        measurements: GLAS_FIELDS,
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
    title: 'Dakramen',
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
    ]
  },
  lichtkoepel: {
    title: 'Lichtkoepel',
    searchPlaceholder: 'Zoek lichtkoepelklus...',
    items: [
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
          afwerking_dak: { title: 'Dakafwerking', order: 3 },
          afwerking: { title: 'Aftimmering', order: 4 },
        },
      }
    ]
  },

  //#endregion

  //#region --- SLOOPWERK & LOGISTIEK ---
  sloopwerk: {
    title: 'Sloopwerk & Logistiek',
    searchPlaceholder: 'Zoek sloopwerk...',
    items: [
      {
        title: 'Sloopwerk & Logistiek',
        description: 'Sloopwerk, afvoer en bescherming',
        slug: 'sloopwerk-logistiek',
        measurementLabel: 'Project',
        measurements: STANDARD_FIELDS,
        materialSections: SLOOPWERK_MATS,
        categoryConfig: {
          sloopwerk: { title: 'Sloopwerk & Materialen', order: 1 },
          project_overheads: { title: 'Project Overheads', order: 2 },
        }
      }
    ]
  },
  //#endregion

  //#region --- CONSTRUCTIEF ---
  constructief: {
    title: 'Constructief',
    searchPlaceholder: 'Zoek constructieklus...',
    items: [
      {
        title: 'Constructief Werk',
        description: 'Stalen balken & Stempelwerk',
        slug: 'constructief-werk',
        measurementLabel: 'Constructie',
        measurements: STANDARD_FIELDS,
        materialSections: CONSTRUCTIEF_MATS,
        categoryConfig: {
          constructie: { title: 'Constructie (AI Estimated)', order: 1 }
        }
      }
    ]
  },
  //#endregion

  //#region --- BEVEILIGING ---
  beveiliging: {
    title: 'Beveiliging',
    searchPlaceholder: 'Zoek beveiliging...',
    items: [
      {
        title: 'Hang- en Sluitwerk (PKVW)',
        description: 'Politiekeurmerk Veilig Wonen',
        slug: 'beveiliging-pkvw',
        measurementLabel: 'Beveiliging',
        measurements: COUNT_FIELDS,
        materialSections: BEVEILIGING_MATS,
        categoryConfig: {
          beveiliging: { title: 'Hang- & Sluitwerk', order: 1 }
        }
      }
    ]
  },
  //#endregion

  //#region --- ISOLATIE ---
  isolatie: {
    title: 'Isolatiewerken',
    searchPlaceholder: 'Zoek isolatieklus...',
    items: [
      {
        title: 'Zolderisolatie (binnenzijde)',
        description: 'Na-isolatie van zolder',
        slug: 'zolder-isolatie',
        measurementLabel: 'Dakvlak',
        measurements: AREA_FIELDS,
        materialSections: ISOLATIE_ZOLDER_MATS,
        categoryConfig: {
          isolatie: { title: 'Isolatie', order: 1 },
          afwerking: { title: 'Afwerking', order: 2 }
        }
      },
      {
        title: 'Vloerisolatie (kruipruimte)',
        description: 'Isolatie vanuit kruipruimte',
        slug: 'vloer-isolatie',
        measurementLabel: 'Vloer',
        measurements: AREA_FIELDS,
        materialSections: ISOLATIE_VLOER_MATS,
        categoryConfig: {
          isolatie: { title: 'Isolatie', order: 1 }
        }
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
