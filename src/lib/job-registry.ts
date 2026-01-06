// src/lib/job-registry.ts

// ==========================================
// 1. INTERFACES (Types)
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
  key: string;             // Database ID (e.g. 'balkhout')
  label: string;           // UI Title (e.g. 'Houten regelwerk')
  categoryFilter?: string; // Search filter for the modal (e.g. 'Balkhout')
}

export interface JobSubItem {
  title: string;
  description: string;
  slug: string;
  measurementLabel?: string;
  measurements?: MeasurementField[];
  materialSections?: MaterialSection[];
}

export interface CategoryConfig {
  title: string;
  searchPlaceholder: string;
  items: JobSubItem[];
}

// ==========================================
// 2. MEASUREMENT CONFIGURATIONS
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
// 3. MATERIAL CONFIGURATIONS (Cards)
// ==========================================

// --- WANDEN (DETAILED) ---

const HSB_VOORZETWAND_MATS: MaterialSection[] = [
  { key: 'folie_buiten', label: 'Folie – buitenzijde (waterkerend)', categoryFilter: 'Folies' },
  { key: 'ventilatie_latten', label: 'Regelwerk – ventilatielatten (spouw)', categoryFilter: 'Balkhout' },
  { key: 'dichting_casco', label: 'Dichting – bouwvilt & randfoam', categoryFilter: 'Isolatie' }, // or Tape
  { key: 'regelwerk_basis', label: 'Regelwerk – basisconstructie', categoryFilter: 'Balkhout' },
  { key: 'achterhout', label: 'Regelwerk – klossen & achterhout', categoryFilter: 'Balkhout' },
  { key: 'isolatie_basis', label: 'Isolatie – basislaag (vakvulling)', categoryFilter: 'Isolatie' },
  { key: 'folie_binnen', label: 'Damprem – binnenzijde (folie)', categoryFilter: 'Folies' },
  { key: 'regelwerk_inst', label: 'Regelwerk – installatiezone', categoryFilter: 'Balkhout' },
  { key: 'isolatie_inst', label: 'Isolatie – installatiezone', categoryFilter: 'Isolatie' },
  { key: 'constructieplaat', label: 'Constructieplaat – schijfwerking', categoryFilter: 'Plaatmateriaal' }, // OSB
  { key: 'beplating', label: 'Beplating – wandafwerking', categoryFilter: 'Plaatmateriaal' }, // Gips
  { key: 'raveelwerk', label: 'Sparingen – raveelwerk (constructie)', categoryFilter: 'Balkhout' },
  { key: 'stelkozijn', label: 'Sparingen – stelkozijnen', categoryFilter: 'Plaatmateriaal' },
  { key: 'dagkanten', label: 'Dagkanten – afwerking (negge)', categoryFilter: 'Plaatmateriaal' },
  { key: 'vensterbanken', label: 'Vensterbanken – binnen', categoryFilter: 'Vensterbanken' },
  { key: 'hoekafwerking', label: 'Hoekafwerking – profielen', categoryFilter: 'Profielen' },
  { key: 'plinten', label: 'Afwerking – plinten (vloer)', categoryFilter: 'Plinten' },
  { key: 'plafondlijst', label: 'Afwerking – plafondlijst', categoryFilter: 'Lijstwerk' },
];

const METALSTUD_VOORZETWAND_MATS: MaterialSection[] = [
  { key: 'folie_buiten', label: 'Folie – buitenzijde (waterkerend)', categoryFilter: 'Folies' },
  { key: 'dichting_band', label: 'Dichting – akoestisch band', categoryFilter: 'Tape' },
  { key: 'frame', label: 'Frame – basisconstructie (MS)', categoryFilter: 'Metalstud' },
  { key: 'verankering', label: 'Verankering – muurbeugels', categoryFilter: 'Bevestiging' },
  { key: 'achterhout', label: 'Achterhout – versteviging', categoryFilter: 'Tuinhout' }, // Multiplex/Wood in profile
  { key: 'isolatie', label: 'Isolatie – vakvulling (zachte plaat)', categoryFilter: 'Isolatie' },
  { key: 'folie_binnen', label: 'Damprem – binnenzijde (folie)', categoryFilter: 'Folies' },
  { key: 'constructieplaat', label: 'Constructieplaat – schijfwerking', categoryFilter: 'Plaatmateriaal' },
  { key: 'beplating', label: 'Beplating – wandafwerking', categoryFilter: 'Plaatmateriaal' },
  { key: 'raveelwerk', label: 'Sparingen – raveelwerk (standaard)', categoryFilter: 'Metalstud' },
  { key: 'ua_profiel', label: 'Sparingen – deuren (UA-versteviging)', categoryFilter: 'Metalstud' },
  { key: 'stelkozijn', label: 'Sparingen – stelkozijnen', categoryFilter: 'Plaatmateriaal' },
  { key: 'dagkanten', label: 'Dagkanten – afwerking (negge)', categoryFilter: 'Plaatmateriaal' },
  { key: 'vensterbanken', label: 'Vensterbanken – binnen', categoryFilter: 'Vensterbanken' },
  { key: 'hoekafwerking', label: 'Hoekafwerking – profielen', categoryFilter: 'Profielen' },
  { key: 'plinten', label: 'Afwerking – plinten (vloer)', categoryFilter: 'Plinten' },
  { key: 'plafondlijst', label: 'Afwerking – plafondlijst', categoryFilter: 'Lijstwerk' },
];

const HSB_TUSSENWAND_MATS: MaterialSection[] = [
  { key: 'dichting', label: 'Dichting – bouwvilt & randfoam', categoryFilter: 'Isolatie' },
  { key: 'regelwerk', label: 'Regelwerk – basisconstructie', categoryFilter: 'Balkhout' },
  { key: 'klossen', label: 'Regelwerk – klossen (stabiliteit)', categoryFilter: 'Balkhout' },
  { key: 'achterhout', label: 'Regelwerk – achterhout (ophangpunten)', categoryFilter: 'Balkhout' },
  { key: 'isolatie', label: 'Isolatie – vakvulling (akoestisch)', categoryFilter: 'Isolatie' },
  { key: 'damprem', label: 'Damprem – zijde 1 (badkamer/garage)', categoryFilter: 'Folies' },
  { key: 'constructie_1', label: 'Constructieplaat – zijde 1 (schijf)', categoryFilter: 'Plaatmateriaal' },
  { key: 'constructie_2', label: 'Constructieplaat – zijde 2 (schijf)', categoryFilter: 'Plaatmateriaal' },
  { key: 'beplating_1', label: 'Beplating – zijde 1 (wandafwerking)', categoryFilter: 'Plaatmateriaal' },
  { key: 'beplating_2', label: 'Beplating – zijde 2 (wandafwerking)', categoryFilter: 'Plaatmateriaal' },
  { key: 'raveelwerk', label: 'Sparingen – raveelwerk (deur/raam)', categoryFilter: 'Balkhout' },
  { key: 'stelkozijn', label: 'Sparingen – stelkozijnen', categoryFilter: 'Plaatmateriaal' },
  { key: 'kozijnen', label: 'Kozijnen – binnendeurset (optioneel)', categoryFilter: 'Kozijnen' },
  { key: 'dagkanten', label: 'Dagkanten – afwerking (doorgangen)', categoryFilter: 'Plaatmateriaal' },
  { key: 'plinten', label: 'Afwerking – plinten (vloer)', categoryFilter: 'Plinten' },
  { key: 'plafondlijst', label: 'Afwerking – plafondlijst', categoryFilter: 'Lijstwerk' },
];

const METALSTUD_TUSSENWAND_MATS: MaterialSection[] = [
  { key: 'dichting', label: 'Dichting – vloer/plafond (band)', categoryFilter: 'Tape' },
  { key: 'frame', label: 'Frame – basisconstructie (MS)', categoryFilter: 'Metalstud' },
  { key: 'ua_profiel', label: 'Versteviging – deuropeningen (UA)', categoryFilter: 'Metalstud' },
  { key: 'achterhout', label: 'Achterhout – versteviging (in profiel)', categoryFilter: 'Tuinhout' },
  { key: 'isolatie', label: 'Isolatie – vakvulling (zachte plaat)', categoryFilter: 'Isolatie' },
  { key: 'damprem', label: 'Damprem – zijde 1 (badkamer/garage)', categoryFilter: 'Folies' },
  { key: 'constructie_1', label: 'Constructieplaat – zijde 1 (schijf)', categoryFilter: 'Plaatmateriaal' },
  { key: 'constructie_2', label: 'Constructieplaat – zijde 2 (schijf)', categoryFilter: 'Plaatmateriaal' },
  { key: 'beplating_1', label: 'Beplating – zijde 1 (wandafwerking)', categoryFilter: 'Plaatmateriaal' },
  { key: 'beplating_2', label: 'Beplating – zijde 2 (wandafwerking)', categoryFilter: 'Plaatmateriaal' },
  { key: 'raveelwerk', label: 'Sparingen – raveelwerk (raamopeningen)', categoryFilter: 'Metalstud' },
  { key: 'stelkozijn', label: 'Sparingen – stelkozijnen', categoryFilter: 'Plaatmateriaal' },
  { key: 'kozijnen', label: 'Kozijnen – binnendeurset (optioneel)', categoryFilter: 'Kozijnen' },
  { key: 'dagkanten', label: 'Dagkanten – afwerking (doorgangen)', categoryFilter: 'Plaatmateriaal' },
  { key: 'plinten', label: 'Afwerking – plinten (vloer)', categoryFilter: 'Plinten' },
  { key: 'plafondlijst', label: 'Afwerking – plafondlijst', categoryFilter: 'Lijstwerk' },
];

const HSB_BUITENWAND_MATS: MaterialSection[] = [
  { key: 'fundering', label: 'Aansluiting – fundering (DPC/kim)', categoryFilter: 'Folies' },
  { key: 'gevelbekleding', label: 'Gevelbekleding – afwerking', categoryFilter: 'Gevelbekleding' },
  { key: 'regelwerk_vent', label: 'Regelwerk – gevelventilatie (latten)', categoryFilter: 'Balkhout' },
  { key: 'muizenrooster', label: 'Ventilatie – ongedierte (rooster)', categoryFilter: 'Ventilatie' },
  { key: 'folie_buiten', label: 'Folie – buitenzijde (dampopen)', categoryFilter: 'Folies' },
  { key: 'plaat_buiten', label: 'Plaatwerk – buitenzijde (beschermend)', categoryFilter: 'Plaatmateriaal' },
  { key: 'regelwerk_hoofd', label: 'Regelwerk – basisconstructie (hoofd)', categoryFilter: 'Balkhout' },
  { key: 'isolatie_hoofd', label: 'Isolatie – basisconstructie', categoryFilter: 'Isolatie' },
  { key: 'damprem_binnen', label: 'Damprem – binnenzijde (klimaatfolie)', categoryFilter: 'Folies' },
  { key: 'regelwerk_inst', label: 'Regelwerk – installatiezone', categoryFilter: 'Balkhout' },
  { key: 'isolatie_inst', label: 'Isolatie – installatiezone', categoryFilter: 'Isolatie' },
  { key: 'osb_binnen', label: 'Constructieplaat – binnenzijde (schijf)', categoryFilter: 'Plaatmateriaal' },
  { key: 'gips_binnen', label: 'Beplating – binnenzijde (wand)', categoryFilter: 'Plaatmateriaal' },
  { key: 'raveelwerk', label: 'Sparingen – raveelwerk (constructief)', categoryFilter: 'Balkhout' },
  { key: 'stelkozijn', label: 'Sparingen – stelkozijnen', categoryFilter: 'Plaatmateriaal' },
  { key: 'dagkant_buiten', label: 'Dagkanten – buitenzijde (negge)', categoryFilter: 'Tuinhout' },
  { key: 'dagkant_binnen', label: 'Dagkanten – binnenzijde (negge)', categoryFilter: 'Plaatmateriaal' },
  { key: 'waterslag', label: 'Waterslagen – buitenzijde', categoryFilter: 'Daktrim' }, // Or Profielen
  { key: 'vensterbank', label: 'Vensterbanken – binnenzijde', categoryFilter: 'Vensterbanken' },
  { key: 'hoek_buiten', label: 'Hoekafwerking – gevel (buitenhoek)', categoryFilter: 'Tuinhout' },
  { key: 'plinten', label: 'Afwerking – plinten (binnenvloer)', categoryFilter: 'Plinten' },
  { key: 'luchtdichting', label: 'Luchtdichting – plafond/dak', categoryFilter: 'Tape' },
];

const CINEWALL_TV_WAND_MATS: MaterialSection[] = [
  { key: 'regelwerk', label: 'Regelwerk – staanders & liggers', categoryFilter: 'Balkhout' },
  { key: 'beplating', label: 'Beplating – wandvlak', categoryFilter: 'Plaatmateriaal' },
  { key: 'sparingen', label: 'Sparingen – nissen & TV-kader', categoryFilter: 'Balkhout' },
  { key: 'kabelmanagement', label: 'Kabelmanagement – goten & doorvoeren', categoryFilter: 'Installatie' },
  { key: 'isolatie', label: 'Isolatie – akoestisch', categoryFilter: 'Isolatie' },
  { key: 'afwerking', label: 'Afwerking – stuc/schilderklaar', categoryFilter: 'Afwerking' },
];

const RACHELWERK_UITVLAKKEN_MATS: MaterialSection[] = [
  { key: 'regelwerk_basis', label: 'Regelwerk – basislaag', categoryFilter: 'Balkhout' },
  { key: 'regelwerk_kruis', label: 'Regelwerk – kruislaag', categoryFilter: 'Balkhout' },
  { key: 'uitvlakken', label: 'Uitvlakken – vulplaatjes / keggen', categoryFilter: 'Uitvlakken' },
  { key: 'isolatie', label: 'Isolatie', categoryFilter: 'Isolatie' },
  { key: 'beplating', label: 'Beplating', categoryFilter: 'Plaatmateriaal' },
  { key: 'afwerking', label: 'Afwerking – naden & gipsplaatschroeven', categoryFilter: 'Afwerking' },
  { key: 'aansluiting', label: 'Aansluiting – randprofielen', categoryFilter: 'Profielen' },
];

const KNIESCHOTTEN_MATS: MaterialSection[] = [
  { key: 'regelwerk', label: 'Regelwerk – vloer & dakregel', categoryFilter: 'Balkhout' },
  { key: 'railsysteem', label: 'Railsysteem – geleiding schuifdeur', categoryFilter: 'Railsystemen' },
  { key: 'schuifdeuren', label: 'Panelen – schuifdeuren', categoryFilter: 'Panelen' },
  { key: 'vaste_schotten', label: 'Panelen – vaste schotten', categoryFilter: 'Panelen' },
  { key: 'afwerking', label: 'Afwerking – afdeklatten & plinten', categoryFilter: 'Afwerking' },
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
  { key: 'ophanging', label: 'Ophanging – ankers & hangers', categoryFilter: 'Bevestiging' },
  { key: 'randhout', label: 'Aansluiting – randhout (muren)', categoryFilter: 'Balkhout' },
  { key: 'regelwerk_basis', label: 'Regelwerk – basisconstructie (uitvlakken)', categoryFilter: 'Balkhout' },
  { key: 'rachels', label: 'Regelwerk – rachels (gipsbasis)', categoryFilter: 'Balkhout' },
  { key: 'achterhout', label: 'Achterhout – ophangpunten (lampen/gordijn)', categoryFilter: 'Balkhout' },
  { key: 'isolatie', label: 'Isolatie – vakvulling (akoestisch/thermisch)', categoryFilter: 'Isolatie' },
  { key: 'damprem', label: 'Damprem – folie (dak/badkamer)', categoryFilter: 'Folies' },
  { key: 'beplating', label: 'Beplating – plafondafwerking', categoryFilter: 'Plaatmateriaal' },
  { key: 'raveel_klein', label: 'Sparingen – raveelwerk (klein/spots)', categoryFilter: 'Balkhout' },
  { key: 'raveel_groot', label: 'Sparingen – raveelwerk (groot/trap)', categoryFilter: 'Balkhout' },
  { key: 'toegang', label: 'Toegang – inspectieluik/vlizotrap', categoryFilter: 'Luiken' },
  { key: 'plinten', label: 'Afwerking – plinten & lijsten', categoryFilter: 'Lijstwerk' },
  { key: 'gordijnkof', label: 'Afwerking – gordijnkof (timmerwerk)', categoryFilter: 'Plaatmateriaal' },
];

const PLAFOND_METALSTUD_MATS: MaterialSection[] = [
  { key: 'dichting', label: 'Dichting – wandaansluiting (akoestisch band)', categoryFilter: 'Tape' },
  { key: 'randprofielen', label: 'Randprofielen – basis (U-profielen)', categoryFilter: 'Metalstud' },
  { key: 'draagprofielen', label: 'Draagprofielen – overspanning (C-profielen)', categoryFilter: 'Metalstud' },
  { key: 'koppeling', label: 'Koppeling – profielverlenging', categoryFilter: 'Metalstud' },
  { key: 'ophanging', label: 'Ophanging – middenondersteuning', categoryFilter: 'Bevestiging' },
  { key: 'versteviging', label: 'Achterhout – versteviging (in C-profiel)', categoryFilter: 'Tuinhout' },
  { key: 'ophangpunten', label: 'Achterhout – ophangpunten (lampen/gordijn)', categoryFilter: 'Tuinhout' },
  { key: 'isolatie', label: 'Isolatie – vakvulling (akoestisch)', categoryFilter: 'Isolatie' },
  { key: 'damprem', label: 'Damprem – folie (badkamer/dak)', categoryFilter: 'Folies' },
  { key: 'beplating', label: 'Beplating – plafondafwerking', categoryFilter: 'Plaatmateriaal' },
  { key: 'spots', label: 'Sparingen – spots & techniek', categoryFilter: 'Installatie' },
  { key: 'toegang', label: 'Toegang – inspectieluik (kader)', categoryFilter: 'Luiken' },
  { key: 'gordijnkof', label: 'Afwerking – gordijnkof (timmerwerk)', categoryFilter: 'Plaatmateriaal' },
  { key: 'randafwerking', label: 'Afwerking – randen (schaduwvoeg/lijst)', categoryFilter: 'Lijstwerk' },
];

const PLAFOND_RACHELWERK_UITVLAKKEN_MATS : MaterialSection[] = [
  { key: 'meting', label: 'Meting – laser & referentiepunt', categoryFilter: 'Gereedschap' },
  { key: 'rachels', label: 'Basislaag – rachels (22x50mm)', categoryFilter: 'Balkhout' },
  { key: 'ventilatielatten', label: 'Basislaag – ventilatielatten (bij gevel)', categoryFilter: 'Balkhout' },
  { key: 'vulplaatjes', label: 'Uitvullen – vulplaatjes (kleurcodes)', categoryFilter: 'Uitvlakken' },
  { key: 'vulstroken', label: 'Uitvullen – stroken (triplex/hardboard)', categoryFilter: 'Plaatmateriaal' },
  { key: 'slagpluggen', label: 'Bevestiging – slagpluggen (steen/beton)', categoryFilter: 'Bevestiging' },
  { key: 'houtschroeven', label: 'Bevestiging – houtschroeven (balklaag)', categoryFilter: 'Bevestiging' },
  { key: 'correctie', label: 'Correctie – schaven/bijwerken', categoryFilter: 'Gereedschap' }, // or N.v.t.
  { key: 'stucgaas', label: 'Voorbereiding – stucgaas (naden)', categoryFilter: 'Afwerking' },
  { key: 'primer', label: 'Voorbereiding – primer (op hout/steen)', categoryFilter: 'Verf' },
];




// --- VLOEREN & VLIERINGEN (DETAILED) ---

const MASSIEF_HOUTEN_VLOER_FINISH_MATS: MaterialSection[] = [
  { key: 'voorbereiding', label: 'Voorbereiding – vochtscherm/primer', categoryFilter: 'Lijmen' }, // Primer/Coating
  { key: 'ondervloer', label: 'Ondervloer – spaanplaat/mozaïek', categoryFilter: 'Plaatmateriaal' },
  { key: 'vloerdelen', label: 'Vloerdelen – massief hout', categoryFilter: 'Vloerdelen' },
  { key: 'verlijming', label: 'Bevestiging – verlijming volvlak', categoryFilter: 'Lijmen' },
  { key: 'plinten', label: 'Afwerking – plinten', categoryFilter: 'Plinten' },
  { key: 'deklatten', label: 'Afwerking – deklatten/rozetten', categoryFilter: 'Afwerking' },
  { key: 'behandeling', label: 'Behandeling – olie/lak', categoryFilter: 'Verf' },
];

const VLOER_AFWERK_MATS: MaterialSection[] = [
  { key: 'egaliseren', label: 'Voorbereiding – egaliseren (reparatie)', categoryFilter: 'Vloer' }, // Egaline
  { key: 'folie', label: 'Folie – dampscherm (betonvloeren)', categoryFilter: 'Folies' },
  { key: 'ondervloer', label: 'Ondervloer – basislaag (rol/plaat)', categoryFilter: 'Ondervloer' },
  { key: 'vloerdelen', label: 'Vloerdelen – afwerking (panelen)', categoryFilter: 'Vloer' }, // Laminaat/PVC
  { key: 'plinten_muur', label: 'Plinten – muur (hoge plint/systeem)', categoryFilter: 'Plinten' },
  { key: 'plinten_vlak', label: 'Plinten – vlak (plakplint/deklat)', categoryFilter: 'Plinten' },
  { key: 'profielen_overgang', label: 'Profielen – overgang (deuren/drempels)', categoryFilter: 'Profielen' },
  { key: 'profielen_eind', label: 'Profielen – eind/aanpassing (pui/mat)', categoryFilter: 'Profielen' },
  { key: 'rozetten', label: 'Afwerking – rozetten (radiator)', categoryFilter: 'Accessoires' },
  { key: 'mat', label: 'Entree – schoonloopmat (inbouw/los)', categoryFilter: 'Accessoires' },
  { key: 'kruipluik', label: 'Kruipluik – randafwerking (profiel)', categoryFilter: 'Profielen' },
];

const VLONDER_MATS: MaterialSection[] = [
  { key: 'worteldoek', label: 'Grondwerk – bodemafsluiting (worteldoek)', categoryFilter: 'Folies' },
  { key: 'stabilisatie', label: 'Grondwerk – stabilisatie (zand/puin)', categoryFilter: 'Zand' },
  { key: 'piketten', label: 'Fundering – piketten (hardhouten palen)', categoryFilter: 'Tuinhout' },
  { key: 'dragers', label: 'Fundering – dragers (tegels/stelpoten)', categoryFilter: 'Tegels' },
  { key: 'moerbalken', label: 'Constructie – moerbalken (hoofddragers)', categoryFilter: 'Tuinhout' },
  { key: 'onderregels', label: 'Constructie – onderregels (regelwerk)', categoryFilter: 'Tuinhout' },
  { key: 'balkentape', label: 'Bescherming – balkentape (rubber/bitumen)', categoryFilter: 'Tape' },
  { key: 'vlonderplanken', label: 'Dek – vlonderplanken (oppervlak)', categoryFilter: 'Tuinhout' }, // or 'Vlonder'
  { key: 'bevestiging', label: 'Bevestiging – montagesysteem (schroef/clip)', categoryFilter: 'Bevestiging' },
  { key: 'kantplanken', label: 'Randafwerking – kantplanken (fascia)', categoryFilter: 'Tuinhout' },
  { key: 'trap', label: 'Toegang – traptrede / bloktrap', categoryFilter: 'Tuinhout' },
  { key: 'afwatering', label: 'Hulpstukken – afwatering (goot/put)', categoryFilter: 'Riolering' },
];

const BALKLAAG_CONSTRUCTIEVLOER_MATS: MaterialSection[] = [
  { key: 'balklaag', label: 'Balkhout – balklaag', categoryFilter: 'Balkhout' },
  { key: 'klossen', label: 'Balkhout – klossen & raveelwerk', categoryFilter: 'Balkhout' },
  { key: 'muurplaat', label: 'Muurplaat – oplegging', categoryFilter: 'Balkhout' },
  { key: 'isolatie', label: 'Isolatie – vakvulling', categoryFilter: 'Isolatie' },
  { key: 'geluid', label: 'Stroken – geluidsisolatie', categoryFilter: 'Isolatie' },
  { key: 'beplating', label: 'Beplating – constructievloer', categoryFilter: 'Plaatmateriaal' },
  { key: 'balkdragers', label: 'Bevestiging – balkdragers', categoryFilter: 'Bevestiging' },
  { key: 'sparingen', label: 'Sparingen – raveelconstructie', categoryFilter: 'Balkhout' },
];

// Preserving Vliering if you have it, or reusing Balklaag structure if not explicitly detailed in the last input.
// Assuming VLIERING_MATS exists or using Balklaag as base for now if undefined.
const VLIERING_MATS: MaterialSection[] = [
  { key: 'balklaag', label: 'Balklaag & Gordingen', categoryFilter: 'Balkhout' },
  { key: 'vloerplaat', label: 'Vloerplaten (OSB/Underlayment)', categoryFilter: 'Plaatmateriaal' },
  { key: 'trap', label: 'Vlizotrap / Vaste trap', categoryFilter: 'Trappen' },
  { key: 'afwerking', label: 'Afwerking onderzijde', categoryFilter: 'Plaatmateriaal' },
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
  { key: 'deurblad', label: 'Deurblad – paneel (Stomp/Opdek)', categoryFilter: 'Deuren' },
  { key: 'pasmaken', label: 'Bewerking – pasmaken (schaven/armen)', categoryFilter: 'Gereedschap' }, // Consumables/Labor
  { key: 'scharnieren', label: 'Scharnieren – ophanging (paumelle/kogellager)', categoryFilter: 'Deurbeslag' },
  { key: 'slotmechanisme', label: 'Sluitwerk – slotmechanisme (loop/kast/wc)', categoryFilter: 'Deurbeslag' },
  { key: 'deurbeslag_kruk', label: 'Deurbeslag – bediening (kruk/schild)', categoryFilter: 'Deurbeslag' },
  { key: 'deurbeslag_wc', label: 'Deurbeslag – toilet/badkamer', categoryFilter: 'Deurbeslag' },
  { key: 'sluitplaat', label: 'Kozijnaansluiting – sluitplaat/kom', categoryFilter: 'Deurbeslag' },
  { key: 'glas', label: 'Glas – lichtopening (glas + latten)', categoryFilter: 'Glas' },
  { key: 'valdorp', label: 'Comfort – tochtvaldorp (inkrozen)', categoryFilter: 'Tochtstrips' },
  { key: 'ventilatierooster', label: 'Comfort – ventilatierooster (inbouw)', categoryFilter: 'Ventilatie' },
  { key: 'dievenklauwen', label: 'Beveiliging – dievenklauwen', categoryFilter: 'Veiligheid' },
  { key: 'tochtstrips', label: 'Afwerking – tochtstrips (kaderprofiel)', categoryFilter: 'Tochtstrips' },
];

const DEUR_BUITEN_MATS: MaterialSection[] = [
  { key: 'deurblad', label: 'Deurblad – buitendeur (Hardhout)', categoryFilter: 'Deuren' },
  { key: 'pasmaken', label: 'Bewerking – pasmaken (Schaven & Armen)', categoryFilter: 'Gereedschap' },
  { key: 'scharnieren', label: 'Scharnieren – veiligheid (SKG)', categoryFilter: 'Deurbeslag' },
  { key: 'dievenklauwen', label: 'Beveiliging – dievenklauwen', categoryFilter: 'Veiligheid' },
  { key: 'meerpuntsluiting', label: 'Sluitwerk – meerpuntsluiting (infrezen)', categoryFilter: 'Deurbeslag' },
  { key: 'cilinder', label: 'Sluitwerk – cilinder (profielcilinder)', categoryFilter: 'Deurbeslag' },
  { key: 'veiligheidsschild', label: 'Deurbeslag – veiligheidsschild (kerntrek)', categoryFilter: 'Deurbeslag' },
  { key: 'sluitkommen', label: 'Kozijnaansluiting – sluitkommen', categoryFilter: 'Deurbeslag' },
  { key: 'weldorpel', label: 'Waterkering – weldorpel', categoryFilter: 'Dorpels' },
  { key: 'valdorp', label: 'Bodemafsluiting – valdorp (inbouw)', categoryFilter: 'Tochtstrips' },
  { key: 'slijtstrip', label: 'Bodemafsluiting – slijtstrip (dorpel)', categoryFilter: 'Profielen' },
  { key: 'kaderprofiel', label: 'Tochtwering – kaderprofiel', categoryFilter: 'Tochtstrips' },
  { key: 'isolatieglas', label: 'Glas – isolatieglas (HR++ & latten)', categoryFilter: 'Glas' },
  { key: 'brievenbus', label: 'Post – brievenbus (spleet & borstel)', categoryFilter: 'Deurbeslag' }, // or Accessoires
  { key: 'schilderwerk', label: 'Afwerking – schilderwerk (grond/lak)', categoryFilter: 'Verf' },
];

const VEILIGHEIDSBESLAG_MATS: MaterialSection[] = [
  { key: 'beslag', label: 'Veiligheidsbeslag – schilden/rozetten (SKG***)', categoryFilter: 'Deurbeslag' },
  { key: 'sloten', label: 'Sloten – insteek/meerpuntsluiting', categoryFilter: 'Deurbeslag' },
  { key: 'cilinders', label: 'Cilinders – profielcilinders (gelijksluitend)', categoryFilter: 'Deurbeslag' },
  { key: 'montage', label: 'Bevestiging – patentbouten/schroeven', categoryFilter: 'Bevestiging' },
  { key: 'afwerking', label: 'Afwerking – herstel schilderwerk', categoryFilter: 'Verf' },
];

const INBRAAKPREVENTIE_MATS: MaterialSection[] = [
  { key: 'secustrip', label: 'Anti-inbraak strips – voordeur/achterdeur', categoryFilter: 'Veiligheid' },
  { key: 'raambeveiliging', label: 'Raambeveiliging – raambomen/grendels', categoryFilter: 'Deurbeslag' }, // Window locks
  { key: 'dievenklauwen', label: 'Scharnierbeveiliging – dievenklauwen', categoryFilter: 'Veiligheid' },
  { key: 'kierstand', label: 'Toegang – kierstandhouders', categoryFilter: 'Deurbeslag' },
  { key: 'barriere', label: 'Barrière – stangen/tralies', categoryFilter: 'Veiligheid' },
  { key: 'montage', label: 'Bevestiging – eentoerschroeven (onlosmaakbaar)', categoryFilter: 'Bevestiging' },
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




//kozijnen
// --- KOZIJNEN (DETAILED) ---

const KOZIJN_BINNEN_HOUT_MATS: MaterialSection[] = [
  { key: 'kozijnhout', label: 'Kozijnhout – stijlen & bovendorpel', categoryFilter: 'Kozijnhout' },
  { key: 'tussendorpel', label: 'Kozijn – tussendorpel (Kalf)', categoryFilter: 'Kozijnhout' },
  { key: 'bovenlicht_glas', label: 'Bovenlicht – glas/paneel', categoryFilter: 'Glas' },
  { key: 'bovenlicht_latten', label: 'Bovenlicht – glaslatten', categoryFilter: 'Latten' },
  { key: 'stelstroken', label: 'Montage – stelstroken', categoryFilter: 'Balkhout' },
  { key: 'verbindingen', label: 'Assemblage – verbindingen', categoryFilter: 'Bevestiging' },
  { key: 'muurankers', label: 'Bevestiging – muurankers', categoryFilter: 'Bevestiging' },
  { key: 'montageschuim', label: 'Dichting – montageschuim', categoryFilter: 'Lijmen' }, // PUR
  { key: 'tochtwering', label: 'Tochtwering – kaderprofiel', categoryFilter: 'Tochtstrips' },
  { key: 'hang_sluitwerk', label: 'Hang- & Sluitwerk (Sponning)', categoryFilter: 'Deurbeslag' }, // Combined freeswerk/sluitkom
  { key: 'architraaf', label: 'Afwerking – koplatten (Architraaf)', categoryFilter: 'Lijstwerk' },
  { key: 'neuten', label: 'Afwerking – neuten', categoryFilter: 'Lijstwerk' },
  { key: 'kitnaden', label: 'Afwerking – kitnaden', categoryFilter: 'Kit' },
  { key: 'schilderwerk', label: 'Afwerking – schilderwerk', categoryFilter: 'Verf' },
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

const KOZIJN_BUITEN_HOUT_MATS: MaterialSection[] = [
  { key: 'kozijnhout', label: 'Kozijnhout – stijlen & bovendorpel', categoryFilter: 'Kozijnhout' }, // Meranti/Mahonie
  { key: 'onderdorpel', label: 'Onderdorpel – materiaal', categoryFilter: 'Dorpels' }, // Hout/Hardsteen
  { key: 'draaidelen', label: 'Draaidelen – ramen/deuren', categoryFilter: 'Kozijnhout' },
  { key: 'glas', label: 'Glas – isolatieglas (HR++/Triple)', categoryFilter: 'Glas' },
  { key: 'ventilatieroosters', label: 'Glas – ventilatieroosters', categoryFilter: 'Ventilatie' },
  { key: 'glaslatten', label: 'Glaslatten – neuslatten/standaard', categoryFilter: 'Latten' }, // Combined standard & neuslat
  { key: 'sluitplaat', label: 'Glaslatten – standaard (Zijkant/Boven)', categoryFilter: 'Latten' },
  { key: 'beslag', label: 'Hang- & Sluitwerk (SKG**/***)', categoryFilter: 'Deurbeslag' },
  { key: 'stelkozijn', label: 'Montage – stelkozijn/spouwlat', categoryFilter: 'Balkhout' },
  { key: 'waterkering', label: 'Waterkering – DPC & Lood', categoryFilter: 'Folies' },
  { key: 'kozijnankers', label: 'Bevestiging – kozijnankers', categoryFilter: 'Bevestiging' },
  { key: 'dichting_iso', label: 'Dichting – isolatie & luchtdichting', categoryFilter: 'Isolatie' }, // PUR/Tape
  { key: 'waterslag', label: 'Afwerking – waterslag', categoryFilter: 'Daktrim' }, // Alu/Steen
  { key: 'schilderwerk', label: 'Afwerking – schilderwerk', categoryFilter: 'Verf' },
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



  
  wanden: {
    title: 'Wanden',
    searchPlaceholder: 'Zoek wandtype...',
    items: [
      { 
        title: 'HSB Voorzetwand', 
        description: 'Enkelzijdig bekleed (incl. isolatie)', 
        slug: 'hsb-voorzetwand',
        measurementLabel: 'Wand',
        measurements: WALL_FIELDS,
        materialSections: HSB_VOORZETWAND_MATS 
      },
      {
        title: 'Rachelwerk / Uitvlakken',
        description: 'Uitvlakken van wanden',
        slug: 'rachelwerk-uitvlakken',
        measurementLabel: 'Wand',
        measurements: WALL_FIELDS,
        materialSections: RACHELWERK_UITVLAKKEN_MATS
      },      
      { 
        title: 'Metalstud Voorzetwand', 
        description: 'Enkelzijdig bekleed', 
        slug: 'metalstud-voorzetwand',
        measurementLabel: 'Wand',
        measurements: STANDARD_FIELDS,
        materialSections: METALSTUD_VOORZETWAND_MATS
      },
      { 
        title: 'HSB Tussenwand', 
        description: 'Dubbelzijdig bekleed', 
        slug: 'hsb-tussenwand',
        measurementLabel: 'Wand',
        measurements: WALL_FIELDS,
        materialSections: HSB_TUSSENWAND_MATS
      },
      { 
        title: 'Metalstud Tussenwand', 
        description: 'Dubbelzijdig bekleed', 
        slug: 'metalstud-tussenwand',
        measurementLabel: 'Wand',
        measurements: STANDARD_FIELDS,
        materialSections: METALSTUD_TUSSENWAND_MATS
      },
      { 
        title: 'Cinewall / TV-wand', 
        description: 'Met nissen en kabelmanagement', 
        slug: 'cinewall-tv-wand',
        measurementLabel: 'Wand',
        measurements: WALL_FIELDS,
        materialSections: CINEWALL_TV_WAND_MATS
      },
      {
        title: 'Knieschotten',
        description: 'Aftimmeren schuine zijde (schuif/vast)',
        slug: 'knieschotten',
        measurementLabel: 'Wand',
        measurements: WALL_FIELDS,
        materialSections: KNIESCHOTTEN_MATS
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



  plafonds: {
    title: 'Plafonds',
    searchPlaceholder: 'Zoek plafondtype...',
    items: [
      { 
        title: 'Plafond – Houten Framework', 
        description: 'Houten draagconstructie', 
        slug: 'plafond-houten-framework', 
        measurementLabel: 'Plafond',
        measurements: AREA_FIELDS,
        materialSections: PLAFOND_HOUT_MATS 
      },
      { 
        title: 'Plafond – Metalstud C/U', 
        description: 'Metalen plafondconstructie', 
        slug: 'plafond-metalstud', 
        measurementLabel: 'Plafond', 
        measurements: AREA_FIELDS,
        materialSections: PLAFOND_METALSTUD_MATS 
      },
      { 
        title: 'Rachelwerk / Uitvlakken', 
        description: 'Uitvlakken van plafond', 
        slug: 'plafond-rachelwerk', 
        measurementLabel: 'Plafond', 
        measurements: AREA_FIELDS,
        materialSections: PLAFOND_RACHELWERK_UITVLAKKEN_MATS 
      },
      { 
        title: 'Overig Plafonds', 
        description: 'Niet-standaard plafondoplossingen', 
        slug: 'overig-plafonds', 
        measurementLabel: 'Plafond', 
        measurements: AREA_FIELDS, 
        materialSections: [] 
      },
    ],
  },



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
        materialSections: MASSIEF_HOUTEN_VLOER_FINISH_MATS
      },
      { 
        title: 'Laminaat / PVC / Klik-Vinyl', 
        description: 'Afwerkvloer (zwevend)', 
        slug: 'laminaat-pvc', 
        measurementLabel: 'Vloer', 
        measurements: AREA_FIELDS,
        materialSections: VLOER_AFWERK_MATS 
      },
      { 
        title: 'Vlonder / Terrasconstructie', 
        description: 'Buitenconstructie (hout/composiet)', 
        slug: 'vlonder-terras', 
        measurementLabel: 'Terras', 
        measurements: AREA_FIELDS,
        materialSections: VLONDER_MATS 
      },
      { 
        title: 'Balklaag & Constructievloer', 
        description: 'Constructieve opbouw', 
        slug: 'balklaag-constructievloer', 
        measurementLabel: 'Vloer',
        measurements: AREA_FIELDS,
        materialSections: BALKLAAG_CONSTRUCTIEVLOER_MATS
      },
      {
        title: 'Vliering / Bergzolder maken',
        description: 'Extra opslagruimte in nok',
        slug: 'vliering-maken',
        measurementLabel: 'Vloer',
        measurements: AREA_FIELDS,
        materialSections: VLIERING_MATS
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



  dakkapellen: {
    title: 'Dakkapellen',
    searchPlaceholder: 'Zoek dakkapelklus...',
    items: [
      { 
        title: 'Dakkapel – Nieuw plaatsen', 
        description: 'Prefab of maatwerk opbouw', 
        slug: 'dakkapel-nieuw', 
        measurementLabel: 'Dakkapel', 
        measurements: COUNT_FIELDS, // 'Breedte' & 'Aantal' is hier logischer dan 'Lengte'
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


  // --- CONFIGURATIE OBJECT ---

interieur: {
  title: 'Interieur & Kasten',
  searchPlaceholder: 'Zoek interieurklus...',
  items: [
    { 
      title: 'Inbouwkasten / Kastenwand', 
      description: 'Maatwerk (wandvullend)', 
      slug: 'inbouwkasten', 
      measurementLabel: 'Kast', 
      measurements: STANDARD_FIELDS, // Selected
      materialSections: INBOUWKAST_MATS 
    },
    { 
      title: 'Ensuite & Scheidingswanden', 
      description: 'Kamer-en-suite constructies', 
      slug: 'ensuite-scheidingswanden', 
      measurementLabel: 'Wand', 
      measurements: STANDARD_FIELDS, // Selected
      materialSections: ENSUITE_MATS 
    },
    { 
      title: 'Radiatorombouw', 
      description: 'Radiatorbekleding op maat', 
      slug: 'radiatorombouw', 
      measurementLabel: 'Ombouw', 
      measurements: STANDARD_FIELDS, // Selected
      materialSections: RADIATOR_MATS 
    },
    { 
      title: 'Meubel op maat', 
      description: 'Tafels, banken, losse kasten', 
      slug: 'meubel-op-maat', 
      measurementLabel: 'Meubel', 
      measurements: STANDARD_FIELDS, // Selected
      materialSections: MEUBEL_MATS 
    }
  ]
},



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
        materialSections: OMKASTING_KOVEN_MATS // Re-using general boxing logic for custom work
      },
    ],
  },



  deuren: {
    title: 'Deuren & Beveiliging',
    searchPlaceholder: 'Zoek deurtype...',
    items: [
      { 
        title: 'Nieuwe Deur Afhangen – Binnendeuren', 
        description: 'Stomp of opdek', 
        slug: 'binnendeur-afhangen', 
        measurementLabel: 'Deur', 
        measurements: COUNT_FIELDS, 
        materialSections: DEUR_BINNEN_MATS 
      },
      { 
        title: 'Nieuwe Deur Afhangen – Buitendeur', 
        description: 'Voordeur/Achterdeur', 
        slug: 'buitendeur-afhangen', 
        measurementLabel: 'Deur', 
        measurements: COUNT_FIELDS, 
        materialSections: DEUR_BUITEN_MATS 
      },
      { 
        title: 'Veiligheidsbeslag / Sloten', 
        description: 'SKG-beslag monteren', 
        slug: 'veiligheidsbeslag', 
        measurementLabel: 'Slot/Deur', 
        measurements: COUNT_FIELDS, 
        materialSections: VEILIGHEIDSBESLAG_MATS // <--- Uses its own specific card
      },
      { 
        title: 'Inbraakpreventie', 
        description: 'Beveiliging ramen en deuren', 
        slug: 'inbraakpreventie', 
        measurementLabel: 'Raam/Deur', 
        measurements: COUNT_FIELDS, 
        materialSections: INBRAAKPREVENTIE_MATS // <--- Uses its own specific card
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



  kozijnen: {
    title: 'Kozijnen & Luiken',
    searchPlaceholder: 'Zoek kozijntype...',
    items: [
      { 
        title: 'Compleet nieuw binnenkozijn – Hout', 
        description: 'Stomp of opdek, inclusief aftimmering', 
        slug: 'binnen-kozijn-hout', 
        measurementLabel: 'Kozijn', 
        measurements: COUNT_FIELDS, 
        materialSections: KOZIJN_BINNEN_HOUT_MATS 
      },
      { 
        title: 'Compleet nieuw binnenkozijn – Staal', 
        description: 'Taats of scharnier (industriële look)', 
        slug: 'binnen-kozijn-staal', 
        measurementLabel: 'Kozijn', 
        measurements: COUNT_FIELDS, 
        materialSections: KOZIJN_BINNEN_STAAL_MATS 
      },
      { 
        title: 'Compleet nieuw buiten kozijn – Hout', 
        description: 'Hardhout met glas en aflak', 
        slug: 'buiten-kozijn-hout', 
        measurementLabel: 'Kozijn', 
        measurements: COUNT_FIELDS, 
        materialSections: KOZIJN_BUITEN_HOUT_MATS 
      },
      { 
        title: 'Compleet nieuw buiten kozijn – Kunststof', 
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
      // Note: "Luiken & Blinden" and "Overig" were in your previous list.
      // If you still want them, keep them here, otherwise remove.
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



  schutting: {
    title: 'Schutting & Tuin',
    searchPlaceholder: 'Zoek schuttingklus...',
    items: [
      { 
        title: 'Houten Schutting', 
        description: 'Planken of schermen', 
        slug: 'houten-schutting', 
        measurementLabel: 'Schutting', 
        measurements: STANDARD_FIELDS, // Lengte (totaal) & Hoogte
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



  glas_zetten: {
    title: 'Glas zetten',
    searchPlaceholder: 'Zoek glasklus...',
    items: [
      { 
        title: 'Dubbel Glas (HR++) / Triple', 
        description: 'Isolatieglas zetten', 
        slug: 'isolatieglas', 
        measurementLabel: 'Ruit', 
        measurements: COUNT_FIELDS, // Essentieel voor bestellijst per ruit
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



  dakramen: {
    title: 'Dakramen / Lichtkoepel',
    searchPlaceholder: 'Zoek dakraamklus...',
    items: [
      { 
        title: 'Velux Dakraam', 
        description: 'Plaatsen of vervangen', 
        slug: 'velux-dakraam', 
        measurementLabel: 'Dakraam', 
        measurements: COUNT_FIELDS, // Aantal stuks & afmetingen bepalen de Velux-code (bijv. SK06)
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


  
  overige: {
    title: 'Overige werkzaamheden',
    searchPlaceholder: 'Zoek werkzaamheden...',
    items: [
      { title: 'Timmerwerk Algemeen', description: 'Diverse klussen', slug: 'timmerwerk-algemeen', measurementLabel: 'Klus', measurements: AREA_FIELDS, materialSections: [] },
    ],
  },
};