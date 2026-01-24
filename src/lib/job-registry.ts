



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

  // --- AFWERKING ---
  beplating: { title: 'Beplating', order: 3 },
  beplating_afwerking: { title: 'Beplating (Plafond)', order: 11 },
  afwerking_binnen: { title: 'Afwerken (Binnen)', order: 4 },
  afwerking_buiten: { title: 'Afwerken (Buiten)', order: 5 },
  lijstwerk: { title: 'Lijstwerk', order: 4 },
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
  // --- NEW CATEGORIES ---
  sloopwerk: { title: 'Sloopwerk & Materialen', order: 1 },
  project_overheads: { title: 'Project Overheads', order: 99 },
  constructie: { title: 'Constructie', order: 1 },
  beveiliging: { title: 'Beveiliging', order: 1 },
  exterieur_details: { title: 'Exterieur Details', order: 1 },
  boeiboord: { title: 'Boeiboorden', order: 15 },
} as const;


//#region total category extra info
export type MaterialCategoryKey = keyof typeof MATERIAL_CATEGORY_INFO;

// 2. THE PRESETS (So you don't have to copy-paste orders 100 times)

export const WALL_CONFIG = MATERIAL_CATEGORY_INFO;

export const CEILING_CONFIG = {
  ...MATERIAL_CATEGORY_INFO,
  Koof: { ...MATERIAL_CATEGORY_INFO.Koof, order: 2 },
  Gordijnkoof: { ...MATERIAL_CATEGORY_INFO.Gordijnkoof, order: 3 },
  Installatie: { ...MATERIAL_CATEGORY_INFO.Installatie, order: 4 },
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
  type: 'number' | 'text' | 'textarea' | 'select';
  suffix?: string;
  placeholder?: string;
  defaultValue?: string | number;
  group?: string; // For grouping fields in the UI (e.g. side-by-side)
  options?: { label: string; value: string }[];
}

export interface MaterialSection {
  key: string;
  label: string;
  categoryFilter?: string;
  category?: MaterialCategoryKey;
  category_ultra_filter?: string;
}

export interface JobSubItem {
  title: string;
  description: string;
  slug: string;
  measurementLabel?: string;
  measurements?: MeasurementField[];
  materialSections?: MaterialSection[];
  categoryConfig?: Record<string, { title: string; order: number }>;
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
  { key: 'balkafstand', label: 'Balkafstand (h.o.h.)', type: 'number', suffix: 'mm', defaultValue: 600 },

];

const CEILLING_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
  { key: 'breedte', label: 'Breedte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 2600' },
  { key: 'balkafstand', label: 'Balkafstand (h.o.h.)', type: 'number', suffix: 'mm', defaultValue: 700, group: 'spacing' },
  { key: 'latafstand', label: 'Latafstand (h.o.h.)', type: 'number', suffix: 'mm', defaultValue: 300, group: 'spacing' },

]

const ROOF_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
  { key: 'hoogte', label: 'Breedte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 4000' }, // Using 'hoogte' key but 'Breedte' label for roof width
  { key: 'balkafstand', label: 'Tengelafstand (h.o.h.)', type: 'number', suffix: 'mm', defaultValue: 600, group: 'spacing' }, // Primary (horizontal battens)
  { key: 'latafstand', label: 'Rachelafstand (h.o.h.)', type: 'number', suffix: 'mm', defaultValue: 300, group: 'spacing' }, // Secondary (vertical battens)

];

// EPDM flat roof fields - same as ROOF_FIELDS but without beam spacing (no tengel/rachel)
const EPDM_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
  { key: 'hoogte', label: 'Breedte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 4000' }, // Using 'hoogte' key but 'Breedte' label for roof width (matches RoofDrawing)
  { key: 'dakrand_breedte', label: 'Dakrand Breedte', type: 'number', suffix: 'mm', defaultValue: 70 },
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

const VLONDER_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
  { key: 'breedte', label: 'Breedte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 4000' },
  { key: 'balkafstand', label: 'Balkafstand (h.o.h.)', type: 'number', suffix: 'mm', defaultValue: 400 },

];

const COUNT_FIELDS: MeasurementField[] = [
  { key: 'breedte', label: 'Breedte per stuk', type: 'number', suffix: 'mm', placeholder: 'Bijv. 930' },
  { key: 'hoogte', label: 'Hoogte per stuk', type: 'number', suffix: 'mm', placeholder: 'Bijv. 2315' },
  { key: 'aantal', label: 'Aantal', type: 'number', suffix: 'stuks', placeholder: 'Bijv. 1' },

];

const KOOF_FIELDS: MeasurementField[] = [
  { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 2500' },
  { key: 'hoogte', label: 'Hoogte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 300' },
  { key: 'diepte', label: 'Diepte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 300' },
  { key: 'aantal', label: 'Aantal', type: 'number', suffix: 'stuks', defaultValue: 1 },

];

// 4. MATERIAL CONFIGURATIONS (Cards)



//#region ========================================== MATERIAL SECTIONS - WANDEN XXX==========================================

const HSB_VOORZETWAND_BINNEN_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE
  { label: 'Staanders & Liggers', categoryFilter: 'Constructiehout', category: 'hout', key: 'staanders_en_liggers', category_ultra_filter: '' },
  { label: 'Tengelwerk / Rachels', categoryFilter: 'Constructiehout', category: 'hout', key: 'ventilatie_latten', category_ultra_filter: '' },

  // 2. ISOLATIE & FOLIES
  { label: 'Folies', categoryFilter: 'Overig', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_basis', category_ultra_filter: '' },

  // 3. BEPLATING
  { label: 'Constructieplaat (Zijde 1)', categoryFilter: 'Constructieplaten', category: 'beplating', key: 'constructieplaat_1', category_ultra_filter: '' },
  { label: 'Constructieplaat (Zijde 2)', categoryFilter: 'Constructieplaten', category: 'beplating', key: 'constructieplaat_2', category_ultra_filter: '' },
  { label: 'Afwerkplaat (Zijde 1)', categoryFilter: 'Gipsplaten', category: 'beplating', key: 'beplating_1', category_ultra_filter: '' },
  { label: 'Afwerkplaat (Zijde 2)', categoryFilter: 'Gipsplaten', category: 'beplating', key: 'beplating_2', category_ultra_filter: '' },

  // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
  { label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Koof', key: 'koof_regelwerk', category_ultra_filter: '' },
  { label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'Koof', key: 'koof_constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten', category: 'Koof', key: 'koof_afwerkplaat', category_ultra_filter: '' },
  { label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', key: 'koof_isolatie', category_ultra_filter: '' },

  // 4. AFWERKEN (TIMMERWERK)
  { label: 'Dagkanten', categoryFilter: 'Plaatmateriaal Interieur', category: 'Dagkant', key: 'dagkanten', category_ultra_filter: '' },
  { label: 'Vensterbanken', categoryFilter: 'Vensterbanken', category: 'Vensterbank', key: 'vensterbanken', category_ultra_filter: '' },
  { label: 'Vloerplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', key: 'plinten_vloer', category_ultra_filter: '' },
  { label: 'Plafondplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', key: 'plinten_plafond', category_ultra_filter: '' },


  { label: 'Elektra Buizen / Flex', categoryFilter: 'Overig', category: 'Installatie', key: 'kabelkanaal', category_ultra_filter: '' },

  { label: 'Hollewanddozen', categoryFilter: 'Overig', category: 'Installatie', key: 'hollewanddozen', category_ultra_filter: '' },
  { label: 'Installatiekabel', categoryFilter: 'Overig', category: 'Installatie', key: 'elektrakabel', category_ultra_filter: '' },
  { label: 'Stopcontacten & Schakelaars', categoryFilter: 'Overig', category: 'Installatie', key: 'schakelmateriaal_basis', category_ultra_filter: '' },

  // 5. AFWERKEN (GIPS & WAND)
  { label: 'Hoekprofielen', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', key: 'hoekafwerking', category_ultra_filter: '' },
  { label: 'Voegenmiddel', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', key: 'gips_vuller', category_ultra_filter: '' },
  { label: 'Finish Pasta', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', key: 'gips_finish', category_ultra_filter: '' },

  // 6. KOZIJNEN
  { label: 'Kozijnen', categoryFilter: 'Binnenkozijnen', category: 'Kozijnen', key: 'kozijn_element', category_ultra_filter: '' },
  { label: 'Glas & Roosters', categoryFilter: 'Overig', category: 'Kozijnen', key: 'glas_roosters', category_ultra_filter: '' },

  // 7. DEUREN & BESLAG
  { label: 'Binnendeuren', categoryFilter: 'Binnendeuren', category: 'Deuren', key: 'deur_blad', category_ultra_filter: '' },
  { label: 'Scharnieren', categoryFilter: 'Deurtoebehoren', category: 'Deuren', key: 'deur_scharnieren', category_ultra_filter: '' },
  { label: 'Sloten', categoryFilter: 'Deurtoebehoren', category: 'Deuren', key: 'deur_sloten', category_ultra_filter: '' },
  { label: 'Deurbeslag', categoryFilter: 'Deurtoebehoren', category: 'Deuren', key: 'deur_krukken', category_ultra_filter: '' },
  { label: 'Deurroosters', categoryFilter: 'Deurtoebehoren', category: 'Deuren', key: 'deur_rooster', category_ultra_filter: '' },
];

const METALSTUD_VOORZETWAND_BINNEN_MATS: MaterialSection[] = [
  // 1. METAAL & CONSTRUCTIE
  { label: 'Liggers (U-profielen)', categoryFilter: 'Metalstud Profielen & Systeemplafonds', category: 'metaal', key: 'ms_liggers', category_ultra_filter: '' },
  { label: 'Staanders (C-profielen)', categoryFilter: 'Metalstud Profielen & Systeemplafonds', category: 'metaal', key: 'ms_staanders', category_ultra_filter: '' },

  { label: 'Verstevigingsprofielen (UA)', categoryFilter: 'Metalstud Profielen & Systeemplafonds', category: 'metaal', key: 'ms_ua_profiel', category_ultra_filter: '' },

  // 2. ISOLATIE & FOLIES
  { label: 'Folies', categoryFilter: 'Overig', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_basis', category_ultra_filter: '' },

  // 3. BEPLATING
  { label: 'Constructieplaat (Zijde 1)', categoryFilter: 'Constructieplaten', category: 'beplating', key: 'constructieplaat_1', category_ultra_filter: '' },
  { label: 'Constructieplaat (Zijde 2)', categoryFilter: 'Constructieplaten', category: 'beplating', key: 'constructieplaat_2', category_ultra_filter: '' },
  { label: 'Afwerkplaat (Zijde 1)', categoryFilter: 'Gipsplaten', category: 'beplating', key: 'beplating_1', category_ultra_filter: '' },
  { label: 'Afwerkplaat (Zijde 2)', categoryFilter: 'Gipsplaten', category: 'beplating', key: 'beplating_2', category_ultra_filter: '' },



  // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
  { label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Koof', key: 'koof_regelwerk', category_ultra_filter: '' },
  { label: 'Beplating', categoryFilter: 'Constructieplaten', category: 'Koof', key: 'koof_constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten', category: 'Koof', key: 'koof_afwerkplaat', category_ultra_filter: '' },
  { label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', key: 'koof_isolatie', category_ultra_filter: '' },

  // 4. AFWERKEN (TIMMERWERK)
  { label: 'Dagkanten', categoryFilter: 'Plaatmateriaal Interieur', category: 'Dagkant', key: 'dagkanten', category_ultra_filter: '' },
  { label: 'Vensterbanken', categoryFilter: 'Vensterbanken', category: 'Vensterbank', key: 'vensterbanken', category_ultra_filter: '' },
  { label: 'Vloerplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', key: 'plinten_vloer', category_ultra_filter: '' },
  { label: 'Plafondplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', key: 'plinten_plafond', category_ultra_filter: '' },


  { label: 'Elektra Buizen / Flex', categoryFilter: 'Overig', category: 'Installatie', key: 'kabelkanaal', category_ultra_filter: '' },
  { label: 'Hollewanddozen', categoryFilter: 'Overig', category: 'Installatie', key: 'hollewanddozen', category_ultra_filter: '' },
  { label: 'Installatiekabel', categoryFilter: 'Overig', category: 'Installatie', key: 'elektrakabel', category_ultra_filter: '' },
  { label: 'Stopcontacten & Schakelaars', categoryFilter: 'Overig', category: 'Schakelmateriaal', key: 'schakelmateriaal_basis', category_ultra_filter: '' },

  // 5. AFWERKEN (GIPS / STUC)
  { label: 'Hoekprofielen', categoryFilter: 'Overig', category: 'gips_afwerking', key: 'hoekafwerking', category_ultra_filter: '' },
  { label: 'Wapeningsband', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', key: 'gips_wapening', category_ultra_filter: '' },
  { label: 'Voegenmiddel', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', key: 'gips_vuller', category_ultra_filter: '' },
  { label: 'Finish Pasta', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', key: 'gips_finish', category_ultra_filter: '' },

  // 6. KOZIJNEN
  { label: 'Raamkozijnen', categoryFilter: 'Binnenkozijnen', category: 'Kozijnen', key: 'kozijn_element', category_ultra_filter: '' },
  { label: 'Deurkozijnen', categoryFilter: 'Binnenkozijnen', category: 'Kozijnen', key: 'deur_kozijn', category_ultra_filter: '' },
  { label: 'Glas & Roosters', categoryFilter: 'Overig', category: 'Kozijnen', key: 'glas_roosters', category_ultra_filter: '' },

  // 7. DEUREN & BESLAG
  { label: 'Binnendeuren', categoryFilter: 'Binnendeuren', category: 'Deuren', key: 'deur_blad', category_ultra_filter: '' },
  { label: 'Scharnieren', categoryFilter: 'Deurtoebehoren', category: 'Deuren', key: 'deur_scharnieren', category_ultra_filter: '' },
  { label: 'Sloten', categoryFilter: 'Deurtoebehoren', category: 'Deuren', key: 'deur_sloten', category_ultra_filter: '' },
  { label: 'Deurbeslag', categoryFilter: 'Deurtoebehoren', category: 'Deuren', key: 'deur_krukken', category_ultra_filter: '' },
  { label: 'Deurroosters', categoryFilter: 'Overig', category: 'Deuren', key: 'deur_rooster', category_ultra_filter: '' },
];









const HSB_BUITENWAND_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE
  { label: 'Staanders & Liggers', categoryFilter: 'Constructiehout', category: 'hout', key: 'regelwerk_hoofd', category_ultra_filter: '' },
  { label: 'Regelwerk (Leidingspouw)', categoryFilter: 'Constructiehout', category: 'hout', key: 'regelwerk_inst', category_ultra_filter: '' },
  { label: 'Ventilatielatten', categoryFilter: 'Constructiehout', category: 'hout', key: 'regelwerk_vent', category_ultra_filter: '' },

  // 2. ISOLATIE & FOLIES
  { label: 'Folie Buiten', categoryFilter: 'Overig', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Folie Binnen', categoryFilter: 'Overig', category: 'isolatie', key: 'folie_binnen', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal (Constructie)', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_hoofd', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal (Leidingspouw)', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_inst', category_ultra_filter: '' },

  // 3. BEPLATING (BINNEN & BUITEN)
  { label: 'Gevelbekleding', categoryFilter: 'Houten Gevelbekleding', category: 'beplating', key: 'gevelbekleding', category_ultra_filter: '' },
  { label: 'Constructieplaat (Buiten)', categoryFilter: 'Constructieplaten', category: 'beplating', key: 'plaat_buiten', category_ultra_filter: '' },
  { label: 'Constructieplaat (Binnen)', categoryFilter: 'Constructieplaten', category: 'beplating', key: 'osb_binnen', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten', category: 'beplating', key: 'gips_binnen', category_ultra_filter: '' },

  // 4. AFWERKEN (TIMMERWERK - BINNEN)
  { label: 'Dagkanten', categoryFilter: 'Plaatmateriaal Interieur', category: 'afwerking_binnen', key: 'dagkant_binnen', category_ultra_filter: '' },
  { label: 'Vensterbanken', categoryFilter: 'Vensterbanken', category: 'afwerking_binnen', key: 'vensterbank', category_ultra_filter: '' },
  { label: 'Vloerplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking_binnen', key: 'plinten', category_ultra_filter: '' },

  // 5. AFWERKEN (BUITEN)
  { label: 'Waterslagen', categoryFilter: 'Kozijnhout, Raamhout & Glaslatten', category: 'afwerking_buiten', key: 'waterslag', category_ultra_filter: '' },
  { label: 'Dagkanten (Buiten)', categoryFilter: 'Houten Gevelbekleding', category: 'afwerking_buiten', key: 'dagkant_buiten', category_ultra_filter: '' },
  { label: 'Gevelhoeken', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'afwerking_buiten', key: 'hoek_buiten', category_ultra_filter: '' },

  // 6. AFWERKEN (GIPS & WAND)
  { label: 'Hoekprofielen', categoryFilter: 'Overig', category: 'gips_afwerking', key: 'hoekafwerking', category_ultra_filter: '' },
  { label: 'Voegenmiddel', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', key: 'gips_vuller', category_ultra_filter: '' },
  { label: 'Finish Pasta', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', key: 'gips_finish', category_ultra_filter: '' },

  // 7. KOZIJNEN
  { label: 'Stelkozijnen', categoryFilter: 'Overig', category: 'Kozijnen', key: 'stelkozijn', category_ultra_filter: '' },
  { label: 'Raamkozijnen', categoryFilter: 'Kozijnhout, Raamhout & Glaslatten', category: 'Kozijnen', key: 'kozijn_element', category_ultra_filter: '' },
  { label: 'Deurkozijnen', categoryFilter: 'Kozijnhout, Raamhout & Glaslatten', category: 'Kozijnen', key: 'deur_kozijn', category_ultra_filter: '' },
  { label: 'Glas & Roosters', categoryFilter: 'Overig', category: 'Kozijnen', key: 'glas_roosters', category_ultra_filter: '' },

  // 8. DEUREN & BESLAG
  { label: 'Buitendeuren', categoryFilter: 'Buitendeuren', category: 'Deuren', key: 'deur_blad', category_ultra_filter: '' },
  { label: 'Scharnieren', categoryFilter: 'Deurtoebehoren', category: 'Deuren', key: 'deur_scharnieren', category_ultra_filter: '' },
  { label: 'Sloten', categoryFilter: 'Deurtoebehoren', category: 'Deuren', key: 'deur_sloten', category_ultra_filter: '' },
  { label: 'Deurbeslag', categoryFilter: 'Deurtoebehoren', category: 'Deuren', key: 'deur_krukken', category_ultra_filter: '' },
];



const CINEWALL_TV_WAND_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE (FRAMEWERK)
  { label: 'Staanders & Liggers', categoryFilter: 'Constructiehout', category: 'hout', key: 'staanders_en_liggers', category_ultra_filter: '' },
  { label: 'Regelwerk (Nissen & Details)', categoryFilter: 'Constructiehout', category: 'hout', key: 'regelwerk_nissen', category_ultra_filter: '' },
  { label: 'Achterhout (TV-ophanging)', categoryFilter: 'Constructieplaten', category: 'hout', key: 'achterhout', category_ultra_filter: '' },

  // 2. INSTALLATIE & ELEKTRA (Expanded)
  { label: 'Elektra Buizen / Flex', categoryFilter: 'Overig', category: 'Installatie', key: 'kabelkanaal', category_ultra_filter: '' },
  { label: 'Hollewanddozen', categoryFilter: 'Overig', category: 'Installatie', key: 'hollewanddozen', category_ultra_filter: '' },
  { label: 'Installatiekabel', categoryFilter: 'Overig', category: 'Installatie', key: 'elektrakabel', category_ultra_filter: '' },
  { label: 'Stopcontacten & Schakelaars', categoryFilter: 'Overig', category: 'Schakelmateriaal', key: 'schakelmateriaal_basis', category_ultra_filter: '' },


  // 3. ISOLATIE & FOLIES
  { label: 'Folies', categoryFilter: 'Overig', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_basis', category_ultra_filter: '' },

  // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
  { label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Koof', key: 'koof_regelwerk', category_ultra_filter: '' },
  { label: 'Beplating', categoryFilter: 'Constructieplaten', category: 'Koof', key: 'koof_beplating', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten', category: 'Koof', key: 'koof_afwerkplaat', category_ultra_filter: '' },
  { label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', key: 'koof_isolatie', category_ultra_filter: '' },


  // 4. BEPLATING
  { label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', key: 'constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten', category: 'beplating', key: 'beplating', category_ultra_filter: '' },
  { label: 'Akoestische Panelen', categoryFilter: 'Wanddecoratie', category: 'beplating', key: 'akoestische_panelen', category_ultra_filter: '' },

  // 5. AFWERKEN (TIMMERWERK)
  { label: 'Dagkanten', categoryFilter: 'Plaatmateriaal Interieur', category: 'afwerking', key: 'dagkanten', category_ultra_filter: '' },
  { label: 'Vloerplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', key: 'plinten_vloer', category_ultra_filter: '' },
  { label: 'Plafondplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', key: 'plinten_plafond', category_ultra_filter: '' },

  // 6. NADEN & STUCWERK
  { label: 'Hoekprofielen', categoryFilter: 'Overig', category: 'gips_afwerking', key: 'hoekafwerking', category_ultra_filter: '' },
  { label: 'Voegenmiddel', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', key: 'gips_vuller', category_ultra_filter: '' },
  { label: 'Finish Pasta', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', key: 'gips_finish', category_ultra_filter: '' },

  // 7. CINEWALL ELEMENTEN (The "Fancy Stuff")
  { label: 'Inbouw Sfeerhaard', categoryFilter: 'Overig', category: 'Cinewall', key: 'sfeerhaard', category_ultra_filter: '' },
  { label: 'TV-Beugel', categoryFilter: 'Overig', category: 'Cinewall', key: 'tv_beugel', category_ultra_filter: '' },
  { label: 'LED-Verlichting', categoryFilter: 'Overig', category: 'Cinewall', key: 'led_strips', category_ultra_filter: '' },
];



const KNIESCHOTTEN_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE
  { label: 'Staanders & Liggers', categoryFilter: 'Constructiehout', category: 'hout', key: 'staanders_en_liggers', category_ultra_filter: '' },

  // 2. ISOLATIE & FOLIES
  { label: 'Folies', categoryFilter: 'Overig', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_basis', category_ultra_filter: '' },

  // 3. BEPLATING
  { label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', key: 'constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten', category: 'beplating', key: 'beplating', category_ultra_filter: '' },

  // 4. AFWERKEN (TIMMERWERK)
  { label: 'Vloerplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', key: 'plinten_vloer', category_ultra_filter: '' },
  { label: 'Plafondplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', key: 'afwerklatten', category_ultra_filter: '' },

  // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
  { label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Koof', key: 'koof_regelwerk', category_ultra_filter: '' },
  { label: 'Beplating', categoryFilter: 'Constructieplaten', category: 'Koof', key: 'koof_constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten', category: 'Koof', key: 'koof_afwerkplaat', category_ultra_filter: '' },
  { label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', key: 'koof_isolatie', category_ultra_filter: '' },




  { label: 'Elektra Buizen / Flex', categoryFilter: 'Overig', category: 'Installatie', key: 'kabelkanaal', category_ultra_filter: '' },
  { label: 'Hollewanddozen', categoryFilter: 'Overig', category: 'Installatie', key: 'hollewanddozen', category_ultra_filter: '' },
  { label: 'Installatiekabel', categoryFilter: 'Overig', category: 'Installatie', key: 'elektrakabel', category_ultra_filter: '' },
  { label: 'Stopcontacten & Schakelaars', categoryFilter: 'Overig', category: 'Schakelmateriaal', key: 'schakelmateriaal_basis', category_ultra_filter: '' },

  // 5. AFWERKEN (GIPS & WAND)
  { label: 'Hoekprofielen', categoryFilter: 'Overig', category: 'gips_afwerking', key: 'hoekafwerking', category_ultra_filter: '' },
  { label: 'Voegenmiddel', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', key: 'gips_vuller', category_ultra_filter: '' },
  { label: 'Finish Pasta', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', key: 'gips_finish', category_ultra_filter: '' },

  // 6. SCHUIFWANDEN (Replaces Standard Doors)
  { label: 'Schuifdeurrails', categoryFilter: 'Deurtoebehoren', category: 'Schuifdeuren', key: 'schuifdeur_rails', category_ultra_filter: '' },
  { label: 'Schuifdeurpanelen', categoryFilter: 'Constructieplaten', category: 'Schuifdeuren', key: 'schuifdeur_paneel', category_ultra_filter: '' },
  { label: 'Komgrepen', categoryFilter: 'Deurtoebehoren', category: 'Schuifdeuren', key: 'schuifdeur_greep', category_ultra_filter: '' },
];






//#region ========================================== MATERIAL SECTIONS - PLAFONDS XXX==========================================

const PLAFOND_HOUT_MATS: MaterialSection[] = [
  // 1. HOUT & CONSTRUCTIE (FRAMEWERK)
  { label: 'Balklaag', categoryFilter: 'Constructiehout', category: 'hout', key: 'randhout', category_ultra_filter: '' },

  { label: 'Rachelwerk', categoryFilter: 'Constructiehout', category: 'hout', key: 'rachels', category_ultra_filter: '' },

  // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
  { label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Koof', key: 'koof_regelwerk', category_ultra_filter: '' },
  { label: 'Beplating', categoryFilter: 'Constructieplaten', category: 'Koof', key: 'koof_constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten', category: 'Koof', key: 'koof_afwerkplaat', category_ultra_filter: '' },
  { label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', key: 'koof_isolatie', category_ultra_filter: '' },

  // 3. GORDIJNKOF (Specifiek voor gordijnen)
  { label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Gordijnkoof', key: 'gordijn_regelwerk', category_ultra_filter: '' },
  { label: 'Beplating', categoryFilter: 'Constructieplaten', category: 'Gordijnkoof', key: 'gordijn_beplating', category_ultra_filter: '' },
  { label: 'Achterhout', categoryFilter: 'Constructiehout', category: 'Gordijnkoof', key: 'gordijn_achterhout', category_ultra_filter: '' },

  // 4. ELEKTRA (RUWBOUW)
  { label: 'Elektra Buizen / Flex', categoryFilter: 'Overig', category: 'Installatie', key: 'kabelkanaal', category_ultra_filter: '' },
  { label: 'Centraaldozen', categoryFilter: 'Overig', category: 'Installatie', key: 'centraaldoos', category_ultra_filter: '' },
  { label: 'Installatiekabel', categoryFilter: 'Overig', category: 'Installatie', key: 'elektrakabel', category_ultra_filter: '' },

  // 5. VERLICHTING & SCHAKELMATERIAAL (COUNTERS)
  { label: 'Inbouwspots', categoryFilter: 'Overig', category: 'Schakelmateriaal', key: 'inbouwspots', category_ultra_filter: '' },
  { label: 'Schakelaar / Dimmer', categoryFilter: 'Overig', category: 'Schakelmateriaal', key: 'schakelaar_element', category_ultra_filter: '' },

  // 6. ISOLATIE & FOLIES
  { label: 'Folies', categoryFilter: 'Overig', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_basis', category_ultra_filter: '' },

  // 7. BEPLATING
  { label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', key: 'constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten', category: 'beplating', key: 'beplating', category_ultra_filter: '' },

  // 8. AFWERKEN (TIMMERWERK)
  { label: 'Plafondplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', key: 'plinten_plafond', category_ultra_filter: '' },

  // 14. VLIZOTRAP
  { label: 'Luik / Vlizotrap', categoryFilter: 'Trappen & Zolderluiken', category: 'Toegang', key: 'vlizotrap_unit', category_ultra_filter: '' },
  { label: 'Koplatten', categoryFilter: 'Aftimmerhout & Plinten', category: 'Toegang', key: 'luik_afwerking', category_ultra_filter: '' },

  // 9. NADEN & STUCWERK
  { label: 'Voegenmiddel', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', key: 'gips_vuller', category_ultra_filter: '' },
  { label: 'Finish Pasta', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', key: 'gips_finish', category_ultra_filter: '' },

];



const PLAFOND_METALSTUD_MATS: MaterialSection[] = [
  // 1. METAAL & CONSTRUCTIE (FRAMEWERK)
  { label: 'Randprofielen', categoryFilter: 'Metalstud Profielen & Systeemplafonds', category: 'metaal', key: 'randprofielen', category_ultra_filter: '' },
  { label: 'Draagprofielen', categoryFilter: 'Metalstud Profielen & Systeemplafonds', category: 'metaal', key: 'draagprofielen', category_ultra_filter: '' },

  // 2. LEIDINGKOOF (Omkasting voor buizen/afvoer)
  { label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Koof', key: 'koof_regelwerk', category_ultra_filter: '' },
  { label: 'Beplating', categoryFilter: 'Constructieplaten', category: 'Koof', key: 'koof_constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten', category: 'Koof', key: 'koof_afwerkplaat', category_ultra_filter: '' },
  { label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', key: 'koof_isolatie', category_ultra_filter: '' },

  // 3. GORDIJNKOOF (Specifiek voor gordijnen)
  { label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Gordijnkoof', key: 'gordijn_regelwerk', category_ultra_filter: '' },
  { label: 'Beplating', categoryFilter: 'Constructieplaten', category: 'Gordijnkoof', key: 'gordijn_beplating', category_ultra_filter: '' },
  { label: 'Achterhout', categoryFilter: 'Constructiehout', category: 'Gordijnkoof', key: 'gordijn_achterhout', category_ultra_filter: '' },

  // 4. ELEKTRA (RUWBOUW)
  { label: 'Elektra Buizen / Flex', categoryFilter: 'Overig', category: 'Installatie', key: 'kabelkanaal', category_ultra_filter: '' },
  { label: 'Centraaldozen', categoryFilter: 'Overig', category: 'Installatie', key: 'centraaldoos', category_ultra_filter: '' },
  { label: 'Installatiekabel', categoryFilter: 'Overig', category: 'Installatie', key: 'elektrakabel', category_ultra_filter: '' },

  // 5. VERLICHTING & SCHAKELMATERIAAL (COUNTERS)
  { label: 'Inbouwspots', categoryFilter: 'Overig', category: 'Schakelmateriaal', key: 'inbouwspots', category_ultra_filter: '' },
  { label: 'Schakelaar / Dimmer', categoryFilter: 'Overig', category: 'Schakelmateriaal', key: 'schakelaar_element', category_ultra_filter: '' },

  // 6. ISOLATIE & FOLIES
  { label: 'Folies', categoryFilter: 'Overig', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_basis', category_ultra_filter: '' },

  // 7. BEPLATING
  { label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', key: 'constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten', category: 'beplating', key: 'beplating', category_ultra_filter: '' },

  // 8. AFWERKEN (TIMMERWERK)
  { label: 'Plafondplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', key: 'plinten_plafond', category_ultra_filter: '' },

  // 14. VLIZOTRAP
  { label: 'Luik / Vlizotrap', categoryFilter: 'Trappen & Zolderluiken', category: 'Toegang', key: 'vlizotrap_unit', category_ultra_filter: '' },
  { label: 'Koplatten', categoryFilter: 'Aftimmerhout & Plinten', category: 'Toegang', key: 'luik_afwerking', category_ultra_filter: '' },

  // 9. NADEN & STUCWERK
  { label: 'Voegenmiddel', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', key: 'gips_vuller', category_ultra_filter: '' },
  { label: 'Finish Pasta', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', key: 'gips_finish', category_ultra_filter: '' },
  { label: 'Wapeningsband', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', key: 'gips_wapening', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - VLOEREN XXX==========================================

const MASSIEF_HOUTEN_VLOER_FINISH_MATS: MaterialSection[] = [
  // 1. VOORBEREIDING & ONDERVLOER
  { label: 'Primer', categoryFilter: 'Egaline & Vloerafwerking', category: 'Vloer_Voorbereiding', key: 'primer', category_ultra_filter: '' },
  { label: 'Ondervloer', categoryFilter: 'Constructieplaten', category: 'Vloer_Voorbereiding', key: 'ondervloer', category_ultra_filter: '' },
  { label: 'Egaline', categoryFilter: 'Stenen, Lateien & Mortels', category: 'Vloer_Voorbereiding', key: 'egaline', category_ultra_filter: '' },

  // 2. VLOERDELEN & PLAATSING
  { label: 'Houten vloerplanken', categoryFilter: 'Plaatmateriaal Interieur', category: 'Vloer_Hout', key: 'vloerdelen', category_ultra_filter: '' },
  { label: 'Parketlijm', categoryFilter: 'Egaline & Vloerafwerking', category: 'Vloer_Hout', key: 'parketlijm', category_ultra_filter: '' },

  // 3. AFWERKING & BEHANDELING
  { label: 'Plinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'Vloer_Afwerking', key: 'plinten', category_ultra_filter: '' },
  { label: 'Deklatten', categoryFilter: 'Aftimmerhout & Plinten', category: 'Vloer_Afwerking', key: 'deklatten', category_ultra_filter: '' },
  { label: 'Overgangsprofielen / Dorpels', categoryFilter: 'Metalstud Profielen & Systeemplafonds', category: 'Vloer_Afwerking', key: 'dorpels', category_ultra_filter: '' },
  { label: 'Vloerolie / Lak', categoryFilter: 'Overig', category: 'Vloer_Afwerking', key: 'vloerolie', category_ultra_filter: '' },
];


const VLOER_AFWERK_MATS: MaterialSection[] = [
  // 1. VOORBEREIDING
  { label: 'Egaline', categoryFilter: 'Egaline & Vloerafwerking', category: 'Vloer_Voorbereiding', key: 'egaliseren', category_ultra_filter: '' },
  { label: 'Reparatiemortel', categoryFilter: 'Egaline & Vloerafwerking', category: 'Vloer_Voorbereiding', key: 'egaliseren', category_ultra_filter: '' },
  { label: 'Dampremmende Folie', categoryFilter: 'Overig', category: 'Vloer_Voorbereiding', key: 'folie', category_ultra_filter: '' },
  { label: 'Ondervloer', categoryFilter: 'Egaline & Vloerafwerking', category: 'Vloer_Voorbereiding', key: 'ondervloer', category_ultra_filter: '' },

  // 2. VLOERDELEN (LAMINAAT / PVC)
  { label: 'Laminaat / PVC Panelen', categoryFilter: 'Egaline & Vloerafwerking', category: 'Vloer_Laminaat', key: 'vloerdelen', category_ultra_filter: '' },

  // 3. AFWERKING & PROFIELEN
  { label: 'Vloerplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'Vloer_Afwerking', key: 'plinten_muur', category_ultra_filter: '' },

  { label: 'Overgangsprofielen / Drempels', categoryFilter: 'Metalstud Profielen & Systeemplafonds', category: 'Vloer_Afwerking', key: 'profielen_overgang', category_ultra_filter: '' },
  { label: 'Eindprofielen', categoryFilter: 'Metalstud Profielen & Systeemplafonds', category: 'Vloer_Afwerking', key: 'profielen_eind', category_ultra_filter: '' },
  { label: 'Kruipluik Profiel / Matomranding', categoryFilter: 'Metalstud Profielen & Systeemplafonds', category: 'Vloer_Afwerking', key: 'kruipluik', category_ultra_filter: '' },
];


const VLONDER_MATS: MaterialSection[] = [
  // 1. GRONDWERK & FUNDERING
  { label: 'Worteldoek', categoryFilter: 'Isolatie', category: 'Vlonder_Fundering', key: 'worteldoek', category_ultra_filter: '' },
  { label: 'Ophoogzand / Stabilisatie', categoryFilter: 'Fundering & Bekisting', category: 'Vlonder_Fundering', key: 'stabilisatie', category_ultra_filter: '' },
  { label: 'Piketten / Palen', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'Vlonder_Fundering', key: 'piketten', category_ultra_filter: '' },
  { label: 'Tegels / Stelpoten', categoryFilter: 'Fundering & Bekisting', category: 'Vlonder_Fundering', key: 'dragers', category_ultra_filter: '' },

  // 2. CONSTRUCTIE (ONDERBOUW)
  { label: 'Moerbalken', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'Vlonder_Constructie', key: 'moerbalken', category_ultra_filter: '' },
  { label: 'Onderregels', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'Vlonder_Constructie', key: 'onderregels', category_ultra_filter: '' },

  // 3. VLONDER & AFWERKING
  { label: 'Vlonderplanken', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'Vlonder_Dek', key: 'vlonderplanken', category_ultra_filter: '' },
  { label: 'Vlonderschroeven / Clips', categoryFilter: 'Overig', category: 'Vlonder_Dek', key: 'bevestiging', category_ultra_filter: '' },
  { label: 'Kantplanken', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'Vlonder_Dek', key: 'kantplanken', category_ultra_filter: '' },
  { label: 'Drainagegoot', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'Vlonder_Dek', key: 'afwatering', category_ultra_filter: '' },
];

const BALKLAAG_CONSTRUCTIEVLOER_MATS: MaterialSection[] = [
  // 1. BALKLAAG (CONSTRUCTIE)
  { label: 'Muurplaat', categoryFilter: 'Constructiehout', category: 'Constructievloer', key: 'muurplaat', category_ultra_filter: '' },
  { label: 'Randbalken', categoryFilter: 'Constructiehout', category: 'Constructievloer', key: 'vloerbalken', category_ultra_filter: '' },
  { label: 'Vloerbalken', categoryFilter: 'Constructiehout', category: 'Constructievloer', key: 'vloerbalken', category_ultra_filter: '' },
  { label: 'Balkdragers', categoryFilter: 'Overig', category: 'Constructievloer', key: 'balkdragers', category_ultra_filter: '' },

  // 2. ISOLATIE & GELUID
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie', category_ultra_filter: '' },
  { label: 'Geluidsisolatie Stroken', categoryFilter: 'Isolatie', category: 'isolatie', key: 'geluidsstroken', category_ultra_filter: '' },

  // 3. BEPLATING (DEK)
  { label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', key: 'beplating', category_ultra_filter: '' },
];



const VLIERING_MATS: MaterialSection[] = [
  { label: 'Randbalken', categoryFilter: 'Constructiehout', category: 'Constructievloer', key: 'randbalken', category_ultra_filter: '' },
  { label: 'Vloerbalken', categoryFilter: 'Constructiehout', category: 'Constructievloer', key: 'vloerbalken', category_ultra_filter: '' },
  { label: 'Balkdragers', categoryFilter: 'Overig', category: 'Constructievloer', key: 'balkdragers', category_ultra_filter: '' },

  { label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', key: 'beplating', category_ultra_filter: '' },
  { label: 'Luik / Vlizotrap', categoryFilter: 'Trappen & Zolderluiken', category: 'Toegang', key: 'vlizotrap_unit', category_ultra_filter: '' },
  { label: 'Koplatten', categoryFilter: 'Aftimmerhout & Plinten', category: 'Toegang', key: 'luik_afwerking', category_ultra_filter: '' },


  // --- A. FRAMEWERK (Hout of Metaal) ---
  { label: 'Randhout', categoryFilter: 'Constructiehout', category: 'hout', key: 'randhout', category_ultra_filter: '' },
  { label: 'Stelhout', categoryFilter: 'Constructiehout', category: 'hout', key: 'stroken', category_ultra_filter: '' },
  { label: 'Rachelwerk', categoryFilter: 'Constructiehout', category: 'hout', key: 'rachels', category_ultra_filter: '' },

  { label: 'Randprofielen', categoryFilter: 'Metalstud Profielen & Systeemplafonds', category: 'metaal', key: 'randprofielen', category_ultra_filter: '' },
  { label: 'Draagprofielen', categoryFilter: 'Metalstud Profielen & Systeemplafonds', category: 'metaal', key: 'draagprofielen', category_ultra_filter: '' },

  // --- B. SPECIALS (Koven) ---
  { label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Koof', key: 'koof_regelwerk', category_ultra_filter: '' },
  { label: 'Beplating', categoryFilter: 'Constructieplaten', category: 'Koof', key: 'koof_constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten', category: 'Koof', key: 'koof_afwerkplaat', category_ultra_filter: '' },
  { label: 'Isolatie', categoryFilter: 'Isolatie', category: 'Koof', key: 'koof_isolatie', category_ultra_filter: '' },

  { label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'Gordijnkoof', key: 'gordijn_regelwerk', category_ultra_filter: '' },
  { label: 'Beplating', categoryFilter: 'Constructieplaten', category: 'Gordijnkoof', key: 'gordijn_beplating', category_ultra_filter: '' },
  { label: 'Achterhout', categoryFilter: 'Constructiehout', category: 'Gordijnkoof', key: 'gordijn_achterhout', category_ultra_filter: '' },

  // --- C. INSTALLATIE ---
  { label: 'Elektra Buizen / Flex', categoryFilter: 'Overig', category: 'Installatie', key: 'kabelkanaal', category_ultra_filter: '' },
  { label: 'Centraaldozen', categoryFilter: 'Overig', category: 'Installatie', key: 'centraaldoos', category_ultra_filter: '' },
  { label: 'Installatiekabel', categoryFilter: 'Overig', category: 'Installatie', key: 'elektrakabel', category_ultra_filter: '' },
  { label: 'Inbouwspots', categoryFilter: 'Overig', category: 'Schakelmateriaal', key: 'inbouwspots', category_ultra_filter: '' },
  { label: 'Schakelaar / Dimmer', categoryFilter: 'Overig', category: 'Schakelmateriaal', key: 'schakelaar_element', category_ultra_filter: '' },

  // --- D. ISOLATIE ---
  { label: 'Folies', categoryFilter: 'Overig', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_basis', category_ultra_filter: '' },

  // --- E. BEPLATING (Plafond) ---
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten', category: 'beplating_afwerking', key: 'beplating', category_ultra_filter: '' },

  // --- F. AFWERKING ---
  { label: 'Plafondplinten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', key: 'plinten_plafond', category_ultra_filter: '' },
  { label: 'Voegenmiddel', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', key: 'gips_vuller', category_ultra_filter: '' },
  { label: 'Finish Pasta', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'gips_afwerking', key: 'gips_finish', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - KEUKENS ==========================================

const KEUKEN_MATS: MaterialSection[] = [

];


//#region ========================================== MATERIAL SECTIONS - INTERIEUR & AFWERKINGEN ==========================================

const INTERIEUR_MATS: MaterialSection[] = [
  { label: 'Basismateriaal / Corpus', categoryFilter: 'Constructieplaten', key: 'constructie', category_ultra_filter: '' },
  { label: 'Fronten & Zichtwerk', categoryFilter: 'Constructieplaten', key: 'fronten', category_ultra_filter: '' },
  { label: 'Scharnieren & Ladegeleiders', categoryFilter: 'Deurtoebehoren', key: 'beslag', category_ultra_filter: '' },
  { label: 'Interieurinrichting (roedes/planken)', categoryFilter: 'Overig', key: 'inrichting', category_ultra_filter: '' },
  { label: 'Afwerking & Lakwerk', categoryFilter: 'Overig', key: 'afwerking', category_ultra_filter: '' },
];

//#region ========================================== MATERIAL SECTIONS - AFWERKINGEN ==========================================


const DAGKANT_MATS: MaterialSection[] = [
  { label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'hout', key: 'frame', category_ultra_filter: '' },
  { label: 'Afwerk Hout', categoryFilter: 'Constructieplaten', category: 'afwerking', key: 'dagkant', category_ultra_filter: '' },
  { label: 'Hoek- of Stopcontactprofielen', categoryFilter: 'Overig', category: 'afwerking', key: 'hoekprofiel', category_ultra_filter: '' },
];

const PLINTEN_MATS: MaterialSection[] = [
  { label: 'Plafondplinten', categoryFilter: 'Constructiehout', category: 'afwerking', key: 'plinten', category_ultra_filter: '' },
  { label: 'Koplatten', categoryFilter: 'Constructiehout', category: 'afwerking', key: 'latten', category_ultra_filter: '' },
  { label: 'Vloerplinten', categoryFilter: 'Constructiehout', category: 'afwerking', key: 'latten', category_ultra_filter: '' },
];

const LEIDINGKOOF_MATS: MaterialSection[] = [
  { label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'hout', key: 'regelwerk', category_ultra_filter: '' },
  { label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', key: 'constructieplaat', category_ultra_filter: '' },
  { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten', category: 'beplating', key: 'afwerkplaat', category_ultra_filter: '' },
  { label: 'Isolatie', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie', category_ultra_filter: '' },
  { label: 'Hoekprofielen', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'afwerking', key: 'hoekprofielen', category_ultra_filter: '' },
];

const OMKASTING_MATS: MaterialSection[] = [
  { label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'hout', key: 'frame', category_ultra_filter: '' },
  { label: 'Afwerk Hout', categoryFilter: 'Constructieplaten', category: 'afwerking', key: 'beplating', category_ultra_filter: '' },
];

const VENSTERBANK_MATS: MaterialSection[] = [
  { label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'hout', key: 'frame', category_ultra_filter: '' },
  { label: 'Vensterbank', categoryFilter: 'Vensterbanken', category: 'afwerking', key: 'vensterbank', category_ultra_filter: '' },
  { label: 'Ventilatieroosters', categoryFilter: 'Overig', category: 'afwerking', key: 'roosters', category_ultra_filter: '' },
  { label: 'Olie, Lak of Beits', categoryFilter: 'Overig', category: 'afwerking', key: 'behandeling', category_ultra_filter: '' },
];


//#region ========================================== MATERIAL SECTIONS - DEUREN XXX==========================================

const DEUR_BINNEN_MATS: MaterialSection[] = [
  { label: 'Binnendeuren', categoryFilter: 'Binnendeuren', category: 'Deuren', key: 'deurblad', category_ultra_filter: '' },

  { label: 'Scharnieren / Paumelles', categoryFilter: 'Deurtoebehoren', category: 'deurbeslag', key: 'scharnieren', category_ultra_filter: '' },
  { label: 'Sloten', categoryFilter: 'Deurtoebehoren', category: 'deurbeslag', key: 'slotmechanisme', category_ultra_filter: '' },
  { label: 'Deurbeslag (Schild & Kruk)', categoryFilter: 'Deurtoebehoren', category: 'deurbeslag', key: 'deurbeslag_kruk', category_ultra_filter: '' },
  { label: 'Cilinder', categoryFilter: 'Deurtoebehoren', category: 'deurbeslag', key: 'cilinder', category_ultra_filter: '' },


  { label: 'Glas', categoryFilter: 'Binnenkozijnen', category: 'glas', key: 'glas', category_ultra_filter: '' },
  { label: 'Glaslatten', categoryFilter: 'Binnenkozijnen', category: 'glas', key: 'glaslatten', category_ultra_filter: '' },

  { label: 'Tochtvaldorp', categoryFilter: 'Deurtoebehoren', category: 'tochtstrips', key: 'valdorp', category_ultra_filter: '' },
  { label: 'Tochtstrips', categoryFilter: 'Deurtoebehoren', category: 'tochtstrips', key: 'tochtstrips', category_ultra_filter: '' },

  { label: 'Deurroosters', categoryFilter: 'Overig', category: 'ventilatie', key: 'ventilatierooster', category_ultra_filter: '' },
];



const DEUR_BUITEN_MATS: MaterialSection[] = [
  { label: 'Buitendeur', categoryFilter: 'Buitendeuren', category: 'Deuren', key: 'deurblad', category_ultra_filter: '' },

  { label: 'Scharnieren', categoryFilter: 'Deurtoebehoren', category: 'deurbeslag', key: 'scharnieren', category_ultra_filter: '' },
  { label: 'Sloten', categoryFilter: 'Deurtoebehoren', category: 'deurbeslag', key: 'slotmechanisme', category_ultra_filter: '' },
  { label: 'Meerpuntsluiting', categoryFilter: 'Deurtoebehoren', category: 'deurbeslag', key: 'meerpuntsluiting', category_ultra_filter: '' },
  { label: 'Deurbeslag (Schild & Kruk)', categoryFilter: 'Deurtoebehoren', category: 'deurbeslag', key: 'deurbeslag_kruk', category_ultra_filter: '' },
  { label: 'Cilinder', categoryFilter: 'Deurtoebehoren', category: 'deurbeslag', key: 'cilinder', category_ultra_filter: '' },


  { label: 'Glas', categoryFilter: 'Binnenkozijnen', category: 'glas', key: 'glas', category_ultra_filter: '' },
  { label: 'Glaslatten', categoryFilter: 'Binnenkozijnen', category: 'glas', key: 'glaslatten', category_ultra_filter: '' },

  { label: 'Tochtvaldorp', categoryFilter: 'Deurtoebehoren', category: 'tochtstrips', key: 'valdorp', category_ultra_filter: '' },
  { label: 'Tochtstrips', categoryFilter: 'Deurtoebehoren', category: 'tochtstrips', key: 'tochtstrips', category_ultra_filter: '' },

  { label: 'Deurroosters', categoryFilter: 'Overig', category: 'ventilatie', key: 'ventilatierooster', category_ultra_filter: '' },
];


//#region ========================================== MATERIAL SECTIONS - DAKRENOVATIE ==========================================

const DAK_HELLEND_MATS: MaterialSection[] = [
  // 1. ONDERGROND & ISOLATIE
  { label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', key: 'constructieplaat', category_ultra_filter: '' },
  { label: 'Dakisolatie', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_dak', category_ultra_filter: '' },
  { label: 'Folie', categoryFilter: 'Overig', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },

  // 2. HOUTWERK (Tengels & Panlatten)
  { label: 'Tengels', categoryFilter: 'Constructiehout', category: 'hout', key: 'tengels', category_ultra_filter: '' },
  { label: 'Panlatten', categoryFilter: 'Constructiehout', category: 'hout', key: 'panlatten', category_ultra_filter: '' },
  { label: 'Ruiter (Nokbalk)', categoryFilter: 'Constructiehout', category: 'hout', key: 'ruiter', category_ultra_filter: '' },

  // 3. DAKVOET & PANNEN (Category: 'dak')
  { label: 'Dakvoetprofiel / Vogelschroot', categoryFilter: 'Dakwerk & HWA', category: 'dak', key: 'dakvoetprofiel', category_ultra_filter: '' },
  { label: 'Dakpannen', categoryFilter: 'Dakwerk & HWA', category: 'dak', key: 'dakpannen', category_ultra_filter: '' },
  { label: 'Gevelpannen / Kantpannen', categoryFilter: 'Dakwerk & HWA', category: 'dak', key: 'gevelpannen', category_ultra_filter: '' },
  { label: 'Ondervorst', categoryFilter: 'Dakwerk & HWA', category: 'dak', key: 'ondervorst', category_ultra_filter: '' },
  { label: 'Nokvorsten', categoryFilter: 'Dakwerk & HWA', category: 'dak', key: 'nokvorsten', category_ultra_filter: '' },

  // 4. AFWERKING (Category: 'afwerking_dak') <--- CHANGED THIS
  { label: 'Lood', categoryFilter: 'Dakwerk & HWA', category: 'afwerking_dak', key: 'lood', category_ultra_filter: '' },
  { label: 'Dakgoot', categoryFilter: 'Dakwerk & HWA', category: 'afwerking_dak', key: 'dakgoot', category_ultra_filter: '' },

  // 5. BOEIBOORDEN (INJECTED)
  { label: 'Boeiboord (Optie)', categoryFilter: 'Boeidelen & Windveren', category: 'boeiboord', key: 'boeiboord_placeholder', category_ultra_filter: '' },
];

const DAK_EPDM_MATS: MaterialSection[] = [
  // 1. ONDERGROND & ISOLATIE (Opbouw Warm Dak)
  { label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', key: 'constructieplaat', category_ultra_filter: '' },
  { label: 'Dampremmende Folie', categoryFilter: 'Overig', category: 'isolatie', key: 'folie_binnen', category_ultra_filter: '' },
  { label: 'Dakisolatie', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_dak', category_ultra_filter: '' },

  // 2. DAKBEDEKKING (EPDM)
  { label: 'EPDM', categoryFilter: 'Dakwerk & HWA', category: 'dak', key: 'epdm_folie', category_ultra_filter: '' },

  // 3. AFWERKING & DETAILS
  { label: 'Daktrim', categoryFilter: 'Dakwerk & HWA', category: 'afwerking_dak', key: 'daktrim', category_ultra_filter: '' },
  { label: 'Daktrim Hoeken', categoryFilter: 'Dakwerk & HWA', category: 'afwerking_dak', key: 'daktrim_hoeken', category_ultra_filter: '' },
  { label: 'HWA Stadsuitloop / Onderuitloop', categoryFilter: 'Dakwerk & HWA', category: 'afwerking_dak', key: 'hwa_uitloop', category_ultra_filter: '' },
  { label: 'Lood', categoryFilter: 'Dakwerk & HWA', category: 'afwerking_dak', key: 'lood', category_ultra_filter: '' },

  // 4. BOEIBOORDEN (INJECTED)
  { label: 'Boeiboord (Optie)', categoryFilter: 'Boeidelen & Windveren', category: 'boeiboord', key: 'boeiboord_placeholder', category_ultra_filter: '' },
];

const DAK_GOLFPLAAT_MATS: MaterialSection[] = [
  // 1. CONSTRUCTIE (Houten onderbouw)
  { label: 'Gordingen / Sporen', categoryFilter: 'Constructiehout', category: 'hout', key: 'gordingen', category_ultra_filter: '' },
  { label: 'Tengels / Regels', categoryFilter: 'Constructiehout', category: 'hout', key: 'tengels', category_ultra_filter: '' },

  // 2. ISOLATIE (Optioneel)
  { label: 'Dakisolatie', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_dak', category_ultra_filter: '' },
  { label: 'Folie', categoryFilter: 'Overig', category: 'isolatie', key: 'folie', category_ultra_filter: '' },

  // 3. GOLFPLATEN
  { label: 'Golfplaten', categoryFilter: 'Dakwerk & HWA', category: 'dak', key: 'golfplaten', category_ultra_filter: '' },
  { label: 'Lichtplaten', categoryFilter: 'Dakwerk & HWA', category: 'dak', key: 'lichtplaten', category_ultra_filter: '' },
  { label: 'Nokstukken', categoryFilter: 'Dakwerk & HWA', category: 'dak', key: 'nokstukken', category_ultra_filter: '' },
  { label: 'Zijstukken / Hoekstukken', categoryFilter: 'Dakwerk & HWA', category: 'dak', key: 'hoekstukken', category_ultra_filter: '' },

  // 4. BEVESTIGING & AFWERKING
  { label: 'Golfplaatschroeven', categoryFilter: 'Overig', category: 'afwerking_dak', key: 'golfplaatschroeven', category_ultra_filter: '' },
  { label: 'Dakgoot', categoryFilter: 'Dakwerk & HWA', category: 'afwerking_dak', key: 'dakgoot', category_ultra_filter: '' },
  { label: 'HWA Afvoer', categoryFilter: 'Dakwerk & HWA', category: 'afwerking_dak', key: 'hwa', category_ultra_filter: '' },
];



//#region ========================================== MATERIAL SECTIONS - BOEIBOORDEN ==========================================
const BOEIBOORD_MATS: MaterialSection[] = [
  // 1. CONSTRUCTIE
  { label: 'Regelwerk / Achterhout', categoryFilter: 'Constructiehout', category: 'hout', key: 'regelwerk', category_ultra_filter: '' },

  // 2. BEKLEDING
  { label: 'Boeiboord Plaat (Trespa/HPL)', categoryFilter: 'Gevelplaten & Buitenpanelen', category: 'beplating', key: 'boeiboord_plaat', category_ultra_filter: '' },
  { label: 'Boeiboord Hout (Cedar/Meranti)', categoryFilter: 'Boeidelen & Windveren', category: 'beplating', key: 'boeiboord_hout', category_ultra_filter: '' },

  // 3. AFWERKING
  { label: 'Afwerkprofielen / Randen', categoryFilter: 'Overig', category: 'afwerking', key: 'afwerk_profiel', category_ultra_filter: '' },
  { label: 'Schroeven & Bevestiging', categoryFilter: 'Overig', category: 'afwerking', key: 'bevestiging', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - GEVELBEKLEDING ==========================================

const GEVEL_BEKLEDING_MATS: MaterialSection[] = [
  // 1. BASIS (SKELETON) - The same for everyone
  { label: 'Tengelwerk / Rachels', categoryFilter: 'Constructiehout', category: 'hout', key: 'regelwerk_basis', category_ultra_filter: '' },
  { label: 'Folie', categoryFilter: 'Overig', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
  { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_gevel', category_ultra_filter: '' },
  { label: 'Ventilatieprofiel (Ongedierte)', categoryFilter: 'Metalstud Profielen & Systeemplafonds', category: 'hout', key: 'ventilatieprofiel', category_ultra_filter: '' },

  // 2. THE CHOICE (AFWERKPLAAT)
  { label: 'Houten Bekleding (Rabat/Zweeds)', categoryFilter: 'Houten Gevelbekleding', category: 'gevel_hout', key: 'gevelbekleding_hout', category_ultra_filter: '' },
  { label: 'Houten Hoeklatten', categoryFilter: 'Houten Gevelbekleding', category: 'gevel_hout', key: 'hoek_hout', category_ultra_filter: '' },

  { label: 'Kunststof Panelen (Keralit)', categoryFilter: 'Houten Gevelbekleding', category: 'gevel_kunststof', key: 'gevelbekleding_kunststof', category_ultra_filter: '' },
  { label: 'Keralit Profielen (Start/Eind/Hoek)', categoryFilter: 'Metalstud Profielen & Systeemplafonds', category: 'gevel_kunststof', key: 'profiel_keralit', category_ultra_filter: '' },

  { label: 'Volkern/HPL Plaat (Trespa)', categoryFilter: 'Gevelplaten & Buitenpanelen', category: 'gevel_plaat', key: 'gevelplaat', category_ultra_filter: '' },

  { label: 'Volkern/HPL Plaat (Trespa)', categoryFilter: 'Gevelplaten & Buitenpanelen', category: 'gevel_plaat_lijm', key: 'gevelplaat', category_ultra_filter: '' },

  { label: 'Waterslagen (Aluminium)', categoryFilter: 'Dakwerk & HWA', category: 'bevestiging', key: 'waterslag', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - KOZIJNEN XXX==========================================

const KOZIJN_BINNEN_HOUT_MATS: MaterialSection[] = [
  { label: 'Kozijnhout', categoryFilter: 'Constructiehout', category: 'hout', key: 'kozijnhout', category_ultra_filter: '' },
  { label: 'Binnendorpel', categoryFilter: 'Kozijnhout, Raamhout & Glaslatten', category: 'hout', key: 'binnendorpel', category_ultra_filter: '' },

  { label: 'Scharnieren', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'scharnieren', category_ultra_filter: '' },
  { label: 'Sluitplaat', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'sluitplaat', category_ultra_filter: '' },

  { label: 'Glas', categoryFilter: 'Binnenkozijnen', category: 'glas', key: 'glas_bovenlicht', category_ultra_filter: '' },
  { label: 'Glaslatten', categoryFilter: 'Binnenkozijnen', category: 'glas', key: 'glaslatten', category_ultra_filter: '' },

  { label: 'Koplatten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', key: 'koplatten', category_ultra_filter: '' },
  { label: 'Neuten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking', key: 'neuten', category_ultra_filter: '' },
];

// 2. BINNEN KOZIJNEN (STAAL)
const KOZIJN_BINNEN_STAAL_MATS: MaterialSection[] = [
  { label: 'Stalen Kozijn', categoryFilter: 'Binnenkozijnen', category: 'Stalen kozijn', key: 'stalen_kozijn', category_ultra_filter: '' },

  { label: 'Paumelles', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'paumelles_staal', category_ultra_filter: '' },
  { label: 'Aanslagrubber', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'aanslagrubber', category_ultra_filter: '' },

  { label: 'Glas', categoryFilter: 'Binnenkozijnen', category: 'glas', key: 'glas_bovenlicht', category_ultra_filter: '' },
  { label: 'Glaslatten', categoryFilter: 'Binnenkozijnen', category: 'glas', key: 'glaslatten_klik', category_ultra_filter: '' },
];

// 3. BUITEN KOZIJNEN - HOUT (PREFAB / FABRIEK)
const KOZIJN_BUITEN_HOUT_MATS: MaterialSection[] = [
  { label: 'Kozijnelement', categoryFilter: 'Binnenkozijnen', category: 'element', key: 'prefab_kozijnelement', category_ultra_filter: '' },
  { label: 'Stelkozijnen', categoryFilter: 'Constructiehout', category: 'element', key: 'stelkozijnen', category_ultra_filter: '' },

  { label: 'Raamdorpelstenen', categoryFilter: 'Kozijnhout, Raamhout & Glaslatten', category: 'afwerking_buiten', key: 'raamdorpel_steen', category_ultra_filter: '' },
  { label: 'Lood / DPC', categoryFilter: 'Overig', category: 'afwerking_buiten', key: 'lood_dpc', category_ultra_filter: '' },

  { label: 'Dagkantbetimmering', categoryFilter: 'Constructieplaten', category: 'afwerking_binnen', key: 'dagkantafwerking', category_ultra_filter: '' },
  { label: 'Vensterbank', categoryFilter: 'Vensterbanken', category: 'afwerking_binnen', key: 'vensterbank', category_ultra_filter: '' },
  { label: 'Koplatten', categoryFilter: 'Aftimmerhout & Plinten', category: 'afwerking_binnen', key: 'koplatten', category_ultra_filter: '' },
];

// 4. BUITEN KOZIJNEN - KUNSTSTOF (PREFAB)
const KOZIJN_BUITEN_KUNSTSTOF_MATS: MaterialSection[] = [
  { label: 'Kozijnelement', categoryFilter: 'Binnenkozijnen', category: 'element', key: 'profiel', category_ultra_filter: '' },
  { label: 'Onderdorpel', categoryFilter: 'Kozijnhout, Raamhout & Glaslatten', category: 'element', key: 'onderdorpel', category_ultra_filter: '' },

  { label: 'Stelkozijn', categoryFilter: 'Constructiehout', category: 'montage', key: 'stelkozijn', category_ultra_filter: '' },

  { label: 'Dagkantafwerking', categoryFilter: 'Metalstud Profielen & Systeemplafonds', category: 'afwerking', key: 'dagkanten', category_ultra_filter: '' },
  { label: 'Waterslag', categoryFilter: 'Dakwerk & HWA', category: 'afwerking', key: 'waterslag', category_ultra_filter: '' },
  { label: 'Inzethorren', categoryFilter: 'Overig', category: 'afwerking', key: 'inzethorren', category_ultra_filter: '' },
];

// 5. AMBACHTELIJK TIMMERWERK (CUSTOM / RENOVATIE)
const KOZIJN_TIMMERWERK_MATS: MaterialSection[] = [
  { label: 'Kozijnhout', categoryFilter: 'Constructiehout', category: 'hout', key: 'kozijnhout_buiten', category_ultra_filter: '' },
  { label: 'Onderdorpel', categoryFilter: 'Kozijnhout, Raamhout & Glaslatten', category: 'hout', key: 'onderdorpel', category_ultra_filter: '' },

  { label: 'Raamhout', categoryFilter: 'Constructiehout', category: 'raam', key: 'raamhout', category_ultra_filter: '' },

  { label: 'Scharnieren', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'scharnieren', category_ultra_filter: '' },
  { label: 'Raamboom', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'raamboom', category_ultra_filter: '' },
  { label: 'Raamuitzetter', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'raamuitzetter', category_ultra_filter: '' },
  { label: 'Meerpuntsluiting', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'meerpuntsluiting', category_ultra_filter: '' },

  { label: 'Glas', categoryFilter: 'Binnenkozijnen', category: 'glas', key: 'glas_buiten', category_ultra_filter: '' },
  { label: 'Neuslatten', categoryFilter: 'Binnenkozijnen', category: 'glas', key: 'neuslatten', category_ultra_filter: '' },
  { label: 'Ventilatierooster', categoryFilter: 'Overig', category: 'glas', key: 'ventilatierooster', category_ultra_filter: '' },

  { label: 'Tochtkader', categoryFilter: 'Deurtoebehoren', category: 'afwerking', key: 'tochtkader', category_ultra_filter: '' },
  { label: 'Lood / DPC', categoryFilter: 'Overig', category: 'afwerking', key: 'waterkering', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - SCHUTTING ==========================================

const SCHUTTING_MATS: MaterialSection[] = [
  // 1. FUNDERING & PALEN (GENERAL)
  { label: 'Snelbeton', categoryFilter: 'Fundering & Bekisting', category: 'fundering', key: 'snelbeton', category_ultra_filter: '' },
  { label: 'Opsluitbanden', categoryFilter: 'Fundering & Bekisting', category: 'fundering', key: 'opsluitbanden', category_ultra_filter: '' },
  { label: 'Paalpunthouder', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'fundering', key: 'paalpunthouder', category_ultra_filter: '' },

  // 2. OPTIE: HOUT
  { label: 'Schuttingpalen hout', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'schutting_hout', key: 'schuttingpalen_hout', category_ultra_filter: '' },
  { label: 'Paalkappen', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'schutting_hout', key: 'paalkap', category_ultra_filter: '' },
  { label: 'Tuinscherm hout', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'schutting_hout', key: 'tuinscherm_hout', category_ultra_filter: '' },
  { label: 'Afdeklat hout', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'schutting_hout', key: 'afdeklat_hout', category_ultra_filter: '' },
  { label: 'Losse tuinplanken', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'schutting_hout', key: 'tuinplanken', category_ultra_filter: '' },

  // 3. OPTIE: BETON SYSTEEM
  { label: 'Betonpalen', categoryFilter: 'Fundering & Bekisting', category: 'schutting_beton', key: 'betonpalen', category_ultra_filter: '' },
  { label: 'Onderplaten', categoryFilter: 'Fundering & Bekisting', category: 'schutting_beton', key: 'onderplaten', category_ultra_filter: '' },
  { label: 'Afdekkappen beton', categoryFilter: 'Fundering & Bekisting', category: 'schutting_beton', key: 'afdekkap_beton', category_ultra_filter: '' },
  { label: 'Unibeslag', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'schutting_beton', key: 'unibeslag', category_ultra_filter: '' },

  // 4. OPTIE: COMPOSIET
  { label: 'Aluminium palen', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'schutting_composiet', key: 'aluminium_palen', category_ultra_filter: '' },
  { label: 'Paalvoeten', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'schutting_composiet', key: 'paalvoet', category_ultra_filter: '' },
  { label: 'Tuinscherm composiet', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'schutting_composiet', key: 'tuinscherm_composiet', category_ultra_filter: '' },
  { label: 'U profielen', categoryFilter: 'Metalstud Profielen & Systeemplafonds', category: 'schutting_composiet', key: 'u_profiel', category_ultra_filter: '' },

  // 5. POORT & TOEGANG
  { label: 'Tuinpoort', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'poort', key: 'tuinpoort', category_ultra_filter: '' },
  { label: 'Stalen frame', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'poort', key: 'stalen_frame', category_ultra_filter: '' },
  { label: 'Kozijnbalken', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'poort', key: 'kozijnbalken', category_ultra_filter: '' },

  // 6. TUINDEUR BESLAG
  { label: 'Hengselset', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'hengselset', category_ultra_filter: '' },
  { label: 'Hengen', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'hengen', category_ultra_filter: '' },
  { label: 'Plaatduimen', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'plaatduimen', category_ultra_filter: '' },
  { label: 'Poortbeslag', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'poortbeslag', category_ultra_filter: '' },
  { label: 'Cilinderslot', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'cilinderslot', category_ultra_filter: '' },
  { label: 'Grondgrendel', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'grondgrendel', category_ultra_filter: '' },
  { label: 'Vloerstop', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'vloerstop', category_ultra_filter: '' },
];


//#endregion

//#region ========================================== MATERIAL SECTIONS - HOUTBOUW & OVERKAPPING ==========================================

const HOUTBOUW_MATS: MaterialSection[] = [

];


//#endregion

//#region ========================================== MATERIAL SECTIONS - TRAPPEN ==========================================

const TRAPRENOVATIE_OVERZETTREDEN_MATS: MaterialSection[] = [
  { label: 'Overzettrede', categoryFilter: 'Constructiehout', category: 'basis', key: 'treden', category_ultra_filter: '' },
  { label: 'Stootbord', categoryFilter: 'Constructiehout', category: 'basis', key: 'stootborden', category_ultra_filter: '' },
  { label: 'Trapneusprofiel', categoryFilter: 'Overig', category: 'afwerking', key: 'profiel', category_ultra_filter: '' },
  { label: 'Antislipstrip', categoryFilter: 'Deurtoebehoren', category: 'afwerking', key: 'antislip', category_ultra_filter: '' },
];

const VLIZOTRAP_MATS: MaterialSection[] = [
  { label: 'Raveling balkhout', categoryFilter: 'Constructiehout', category: 'hout', key: 'balken', category_ultra_filter: '' },
  { label: 'Vlizotrap (Complete set)', categoryFilter: 'Trappen & Zolderluiken', category: 'basis', key: 'trap', category_ultra_filter: '' },
  { label: 'Zolderluik', categoryFilter: 'Trappen & Zolderluiken', category: 'basis', key: 'luik', category_ultra_filter: '' },
  { label: 'Veiligheidshek', categoryFilter: 'Constructiehout', category: 'veiligheid', key: 'traphek', category_ultra_filter: '' },
  { label: 'Veiligheidspoortje', categoryFilter: 'Deurtoebehoren', category: 'veiligheid', key: 'poortje', category_ultra_filter: '' },
  { label: 'Scharnier', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'scharnieren', category_ultra_filter: '' },
  { label: 'Grendel / Sluiting', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'sluiting', category_ultra_filter: '' },
  { label: 'Zelfsluitende veer', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'veer', category_ultra_filter: '' },
  { label: 'Handgreep', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'handgreep', category_ultra_filter: '' },
  { label: 'Koplatten', categoryFilter: 'Constructiehout', category: 'afwerking', key: 'architraaf', category_ultra_filter: '' },
];

const NIEUWE_TRAP_PLAATSEN_MATS: MaterialSection[] = [
  // CONSTRUCTIE & RAVELING
  { label: 'Raveling balkhout', categoryFilter: 'Constructiehout', category: 'hout', key: 'balken', category_ultra_filter: '' },
  { label: 'Balkdrager', categoryFilter: 'Deurtoebehoren', category: 'hout', key: 'balkdragers', category_ultra_filter: '' },

  { label: 'Bouwpakket trap', categoryFilter: 'Trappen & Zolderluiken', category: 'trap', key: 'trap', category_ultra_filter: '' },
  { label: 'Trapboom', categoryFilter: 'Trappen & Zolderluiken', category: 'trap', key: 'trapboom', category_ultra_filter: '' },
  { label: 'Trede', categoryFilter: 'Trappen & Zolderluiken', category: 'trap', key: 'trede', category_ultra_filter: '' },
  { label: 'Stootbord', categoryFilter: 'Plaatmateriaal Interieur', category: 'trap', key: 'stootbord', category_ultra_filter: '' },

  // VEILIGHEID & BESLAG
  { label: 'Trapaal', categoryFilter: 'Trappen & Zolderluiken', category: 'veiligheid', key: 'trapaal', category_ultra_filter: '' },
  { label: 'Spijl', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'spijlen', category_ultra_filter: '' },
  { label: 'Trapleuning', categoryFilter: 'Trappen & Zolderluiken', category: 'veiligheid', key: 'leuning', category_ultra_filter: '' },
  { label: 'Leuninghouder', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'houders', category_ultra_filter: '' },
  { label: 'Balustrade', categoryFilter: 'Constructiehout', category: 'veiligheid', key: 'balustrade', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - HOUTROTREPARATIE ==========================================

const HOUTROTREPARATIE_MATS: MaterialSection[] = [
  { label: 'Houtrotstop vloeistof', categoryFilter: 'Overig', category: 'reparatie', key: 'houtrotstop', category_ultra_filter: '' },
  { label: 'Houtstabilisator', categoryFilter: 'Overig', category: 'reparatie', key: 'stabilisator', category_ultra_filter: '' },

  { label: 'Twee-componenten epoxy vuller', categoryFilter: 'Fundering & Bekisting', category: 'reparatie', key: 'epoxy_vuller', category_ultra_filter: '' },
  { label: 'Vervangend hout inzetstuk', categoryFilter: 'Tuinhout, Schuttingen & Tuinpoorten', category: 'reparatie', key: 'hout_inzetstuk', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - KEUKENS ==========================================

const KEUKEN_MONTAGE_MATS: MaterialSection[] = [
  // BASIS
  { label: 'Keukenkast', categoryFilter: 'Constructiehout', category: 'basis', key: 'corpus', category_ultra_filter: '' },
  { label: 'Aanrechtblad', categoryFilter: 'Constructieplaten', category: 'werkblad', key: 'werkblad', category_ultra_filter: '' },

  // APPARATUUR & SPOELBAK
  { label: 'Inbouwapparaat', categoryFilter: 'Overig', category: 'werkblad', key: 'apparatuur', category_ultra_filter: '' },
  { label: 'Spoelbak', categoryFilter: 'Overig', category: 'beslag', key: 'spoelbak', category_ultra_filter: '' },
  { label: 'Keukenkraan', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'kraan', category_ultra_filter: '' },

  // DETAILS
  { label: 'Handgreep', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'grepen', category_ultra_filter: '' },
  { label: 'Keukenplint', categoryFilter: 'Plaatmateriaal Interieur', category: 'beslag', key: 'plint', category_ultra_filter: '' },
  { label: 'Keukenverlichting', categoryFilter: 'Overig', category: 'beslag', key: 'verlichting', category_ultra_filter: '' },
];

const KEUKEN_RENOVATIE_MATS: MaterialSection[] = [
  // ZICHTWERK
  { label: 'Keukenfront', categoryFilter: 'Overig', category: 'basis', key: 'fronten', category_ultra_filter: '' },
  { label: 'Aanrechtblad', categoryFilter: 'Overig', category: 'werkblad', key: 'werkblad', category_ultra_filter: '' },

  { label: 'Scharnier', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'scharnieren', category_ultra_filter: '' },
  { label: 'Ladegeleider', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'geleiders', category_ultra_filter: '' },
  { label: 'Handgreep', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'grepen', category_ultra_filter: '' },

  // UPGRADES
  { label: 'Inbouwapparaat', categoryFilter: 'Overig', category: 'werkblad', key: 'apparatuur', category_ultra_filter: '' },
  { label: 'Keukenkraan', categoryFilter: 'Overig', category: 'beslag', key: 'kraan', category_ultra_filter: '' },
];


//#endregion

//#region ========================================== MATERIAL SECTIONS - INBOUWKASTEN ==========================================


const INBOUWKAST_MATS: MaterialSection[] = [
  { label: 'Interieur / Corpus (MDF, Melamine, Multiplex)', categoryFilter: 'Constructieplaten', category: 'basis', key: 'corpus', category_ultra_filter: '' },
  { label: 'Deuren', categoryFilter: 'Constructieplaten', category: 'afwerking', key: 'fronten', category_ultra_filter: '' },
  { label: 'Fronten', categoryFilter: 'Constructieplaten', category: 'afwerking', key: 'fronten', category_ultra_filter: '' },
  { label: 'Ladesystemen', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'lades', category_ultra_filter: '' },
  { label: 'Scharnier', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'scharnieren', category_ultra_filter: '' },
  { label: 'Meubelgreep', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'grepen', category_ultra_filter: '' },
  { label: 'Push-to-open systeem', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'snappers', category_ultra_filter: '' },
  { label: 'Kledingroede', categoryFilter: 'Deurtoebehoren', category: 'beslag', key: 'garderobe', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - MEUBEL OP MAAT ==========================================

const MEUBEL_MATS: MaterialSection[] = [
  { label: 'Hoofdmateriaal', categoryFilter: 'Constructiehout', category: 'basis', key: 'materiaal', category_ultra_filter: '' },
  { label: 'Meubelbeslag', categoryFilter: 'Deurtoebehoren', category: 'afwerking', key: 'beslag', category_ultra_filter: '' },
  { label: 'Olie, Lak, Beits', categoryFilter: 'Overig', category: 'afwerking', key: 'afwerking', category_ultra_filter: '' },
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
  { label: 'Glas', categoryFilter: 'Binnenkozijnen', category: 'glas', key: 'glas', category_ultra_filter: '' },
  { label: 'Ventilatie roosters', categoryFilter: 'Overig', category: 'glas', key: 'roosters', category_ultra_filter: '' },
  { label: 'Glaslatten', categoryFilter: 'Constructiehout', category: 'glas', key: 'glaslatten', category_ultra_filter: '' },
];

//#endregion

//#region ========================================== MATERIAL SECTIONS - DAKRAMEN ==========================================


const VELUX_MATS: MaterialSection[] = [
  { label: 'Velux dakraam set', categoryFilter: 'Dakramen & Koepels', category: 'vensterset', key: 'venster', category_ultra_filter: '' },
  { label: 'Velux Venster', categoryFilter: 'Dakramen & Koepels', category: 'venster', key: 'venster', category_ultra_filter: '' },
  { label: 'Gootstukken', categoryFilter: 'Dakramen & Koepels', category: 'gootstuk', key: 'gootstuk', category_ultra_filter: '' },
  { label: 'Interieur afwerking', categoryFilter: 'Constructiehout', category: 'afwerking', key: 'betimmering', category_ultra_filter: '' },
];

const LICHTKOEPEL_MATS: MaterialSection[] = [
  { label: 'Lichtkoepel', categoryFilter: 'Dakramen & Koepels', category: 'koepel', key: 'koepel', category_ultra_filter: '' },
  { label: 'Opstand Houtbalk of Prefab Set', categoryFilter: 'Dakramen & Koepels', category: 'opstand', key: 'opstand', category_ultra_filter: '' },
  { label: 'Dakbedekking', categoryFilter: 'Dakwerk & HWA', category: 'afwerking', key: 'dakbedekking', category_ultra_filter: '' },
];






//#region ========================================== MATERIAL SECTIONS - SLOOPWERK & LOGISTIEK ==========================================
const SLOOPWERK_MATS: MaterialSection[] = [
  { label: 'Sloopwerk (m2/uur)', categoryFilter: 'Overig', category: 'sloopwerk', key: 'sloopwerk', category_ultra_filter: '' },
  { label: 'Afplakken/Beschermen', categoryFilter: 'Overig', category: 'sloopwerk', key: 'afplakken', category_ultra_filter: '' },
  { label: 'Afvalafvoer (Container)', categoryFilter: 'Overig', category: 'project_overheads', key: 'afval', category_ultra_filter: '' },
];
//#endregion

//#region ========================================== MATERIAL SECTIONS - CONSTRUCTIEF ==========================================
const CONSTRUCTIEF_MATS: MaterialSection[] = [
  { label: 'Stalen balk plaatsen (HEB/IPE)', categoryFilter: 'Constructiehout', category: 'constructie', key: 'stalen_balk', category_ultra_filter: '' },
  { label: 'Stempelwerk', categoryFilter: 'Overig', category: 'constructie', key: 'stempelwerk', category_ultra_filter: '' },
];
//#endregion

//#region ========================================== MATERIAL SECTIONS - BEVEILIGING ==========================================
const BEVEILIGING_MATS: MaterialSection[] = [
  { label: 'Hang- en Sluitwerk (PKVW)', categoryFilter: 'Deurtoebehoren', category: 'beveiliging', key: 'hang_sluitwerk', category_ultra_filter: '' },
];
//#endregion

//#region ========================================== MATERIAL SECTIONS - ISOLATIE ==========================================
const ISOLATIE_ZOLDER_MATS: MaterialSection[] = [
  { label: 'Zolderisolatie', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie', category_ultra_filter: '' },
  { label: 'Afwerking', categoryFilter: 'Constructieplaten', category: 'afwerking', key: 'afwerking', category_ultra_filter: '' },
];

const ISOLATIE_VLOER_MATS: MaterialSection[] = [
  { label: 'Vloerisolatie', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie', category_ultra_filter: '' },
  { label: 'Bodemfolie', categoryFilter: 'Overig', category: 'isolatie', key: 'folie', category_ultra_filter: '' },
];
//#endregion

//#region ========================================== MATERIAL SECTIONS - EXTERIEUR DETAILS ==========================================
const WINDVEREN_MATS: MaterialSection[] = [
  { label: 'Regelwerk / Achterhout', categoryFilter: 'Constructiehout', category: 'hout', key: 'regelwerk', category_ultra_filter: '' },
  { label: 'Windveren (Hout/Kunststof)', categoryFilter: 'Boeidelen & Windveren', category: 'exterieur_details', key: 'windveren', category_ultra_filter: '' },
  { label: 'Lijsten & Profielen', categoryFilter: 'Overig', category: 'afwerking', key: 'afwerking', category_ultra_filter: '' },
];

const WATERSLAGEN_DORPELS_MATS: MaterialSection[] = [
  { label: 'Waterslagen (Aluminium)', categoryFilter: 'Dakwerk & HWA', category: 'exterieur_details', key: 'waterslag', category_ultra_filter: '' },
  { label: 'Raamdorpelstenen', categoryFilter: 'Kozijnhout, Raamhout & Glaslatten', category: 'exterieur_details', key: 'raamdorpel', category_ultra_filter: '' },
  { label: 'Lood / DPC', categoryFilter: 'Overig', category: 'exterieur_details', key: 'lood', category_ultra_filter: '' },
];
//#endregion

// 4. THE REGISTRY (Database)


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
        title: 'HSB Wand',
        description: 'Voorzet- of Tussenwand',
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
          Dagkant: { title: 'Dagkanten', order: 12 },
          Vensterbank: { title: 'Vensterbanken', order: 13 },
        }
      },
      {
        title: 'Metalstud Wand',
        description: 'Voorzet- of Tussenwand',
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
          Installatie: { title: 'Installatie & Elektra', order: 2 },
          Schakelmateriaal: { title: 'Schakelmateriaal', order: 3 },
          isolatie: { title: 'Isolatie & Folies', order: 4 },
          Koof: { title: 'Leidingkoof / Omkasting', order: 5 },
          beplating: { title: 'Beplating', order: 6 },
          afwerking: { title: 'Afwerken', order: 7 },
          gips_afwerking: { title: 'Naden & Stucwerk', order: 8 },
          Cinewall: { title: 'Cinewall Elementen', order: 9 },
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
          Koof: { title: 'Leidingkoof / Omkasting', order: 6 },
          Gordijnkoof: { title: 'Gordijnkoof', order: 7 },
          Installatie: { title: 'Installatie & Elektra', order: 8 },
          Schakelmateriaal: { title: 'Schakelmateriaal', order: 9 },
          Toegang: { title: 'Toegang & Vlizotrap', order: 10 },
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
        measurements: VLONDER_FIELDS,
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
          beplating: { title: 'Beplating (Constructie)', order: 2 },
          isolatie: { title: 'Isolatie & Folies', order: 3 },
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
          dak: { title: 'Dakwerk & Bedekking', order: 2 },
          gevel: { title: 'Gevelbekleding', order: 3 },
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

  //#region --- BOEIBOORDEN ---
  boeiboorden: {
    title: 'Boeiboorden',
    searchPlaceholder: 'Zoek boeiboordklus...',
    items: [
      {
        title: 'Boeiboorden Vervangen',
        description: 'Hout of Kunststof (Trespa/Keralit)',
        slug: 'boeiboorden-vervangen',
        measurementLabel: 'Boeiboord',
        measurements: WALL_FIELDS,
        materialSections: BOEIBOORD_MATS,
        categoryConfig: {
          hout: { title: 'Regelwerk', order: 1 },
          beplating: { title: 'Bekleding (Hout/Kunststof)', order: 2 },
          afwerking: { title: 'Afwerking & Profielen', order: 3 },
        }
      },
      {
        title: 'Windveren vervangen',
        description: 'Vervangen van windveren (dakrand)',
        slug: 'windveren-vervangen',
        measurementLabel: 'Lengte',
        measurements: STANDARD_FIELDS,
        materialSections: WINDVEREN_MATS,
        categoryConfig: {
          hout: { title: 'Constructie', order: 1 },
          exterieur_details: { title: 'Windveren', order: 2 },
          afwerking: { title: 'Afwerking', order: 3 },
        }
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
        title: 'Leidingkoof',
        description: 'Leidingen en afvoeren wegwerken',
        slug: 'leidingkoof',
        measurementLabel: 'Koof',
        measurements: KOOF_FIELDS,
        materialSections: LEIDINGKOOF_MATS,
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
        measurements: [],
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
        measurements: [],
        materialSections: DEUR_BUITEN_MATS,
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
          { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm', placeholder: 'Maatvoering volgt uit pannenkeuze' },
          { key: 'hoogte', label: 'Breedte', type: 'number', suffix: 'mm', placeholder: 'Maatvoering volgt uit pannenkeuze' }, // Using 'hoogte' key but 'Breedte' label
          { key: 'balkafstand', label: 'Tengelafstand (h.o.h.)', type: 'number', suffix: 'mm', defaultValue: 600, group: 'spacing' },
          { key: 'latafstand', label: 'Rachelafstand (h.o.h.)', type: 'number', suffix: 'mm', defaultValue: 300, group: 'spacing' },
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
        measurements: AREA_FIELDS,
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
        title: 'Gevelbekleding Vervangen',
        description: 'Hout, Keralit of Trespa',
        slug: 'gevelbekleding-compleet',
        measurementLabel: 'Gevel',
        measurements: AREA_FIELDS,
        materialSections: GEVEL_BEKLEDING_MATS,
        categoryConfig: {
          hout: { title: 'Basis (Regelwerk)', order: 1 },
          isolatie: { title: 'Isolatie & Folie', order: 2 },

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
        title: 'Binnen Kozijnen – Staal',
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
        title: 'Buiten kozijnen – Hout',
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
        title: 'Buiten Kozijnen – Kunststof',
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
        measurements: [],
        materialSections: []
      },
      {
        title: 'Waterslagen / Dorpels',
        description: 'Vervangen van waterslagen of raamdorpels',
        slug: 'waterslagen-dorpels',
        measurementLabel: 'Lengte',
        measurements: STANDARD_FIELDS,
        materialSections: WATERSLAGEN_DORPELS_MATS,
        categoryConfig: {
          exterieur_details: { title: 'Materialen', order: 1 }
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