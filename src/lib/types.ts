
import { Timestamp } from "firebase/firestore";

export type User = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export type Client = {
  id: string;
  userId: string;
  naam: string;
  adres: string;
  postcode: string;
  plaats: string;
  email?: string;
  telefoon?: string;
  createdAt: string;
};

export type Quote = {
  id: string;
  userId: string;

  status: "concept" | "in_behandeling" | "verzonden" | "geaccepteerd" | "afgewezen" | "verlopen";
  createdAt: Timestamp;
  updatedAt: Timestamp;

  // Offerte meta
  werkomschrijving: string;
  titel: string;

  // ✅ Alles klantgericht in 1 map
  klantinformatie: {
    klanttype: "Particulier" | "Zakelijk";

    bedrijfsnaam: string | null;
    contactpersoon: string | null;
    voornaam: string;
    achternaam: string;

    "e-mailadres": string;
    telefoonnummer: string;

    factuuradres: {
      straat: string;
      huisnummer: string;
      postcode: string;
      plaats: string | null;
    };

    afwijkendProjectadres: boolean;

    projectadres: {
      straat: string | null;
      huisnummer: string | null;
      postcode: string | null;
      plaats: string | null;
    };
  };

  // optioneel
  amount?: number;
  sentAt?: Timestamp | Date;

  // ✅ Financial Armor (Settings per quote)
  instellingen: QuoteSettings;

  // ✅ Extras (Mutable overrides for Transport, Winst, Bouwplaats)
  extras?: {
    transport?: {
      mode: 'perKm' | 'fixed' | 'none';
      prijsPerKm?: number;
      vasteTransportkosten?: number;
    };
    winstMarge?: {
      mode: 'percentage' | 'fixed' | 'none';
      percentage?: number;
      fixedAmount?: number;
    };
    materieel?: Record<string, unknown>[]; // Bouwplaatskosten
  };
};

export type QuoteSettings = {
  btwTarief: number;          // e.g. 21
  uurTariefExclBtw: number;   // e.g. 45.00
};



export type JobCategory =
  | "Wanden"
  | "Plafonds"
  | "Constructie Vloer"
  | "Afwerk Vloer"
  | "Deuren"
  | "Kozijnen"

  | "Dakrenovatie"
  | "Gevelbekleding"
  | "Schutting"

  | "Afwerkingen"
  | "Glas zetten"
  | "Overzettreden"
  | "Vlizotrappen"
  | "Houtrotreparatie"
  | "Keukens"

  | "Dakramen"
  | "Lichtkoepel"
  | "Boeidelen"
  | "Sloopwerk & Logistiek"
  | "Constructief"
  | "Beveiliging"
  | "Isolatiewerken";


export type Job = {
  id: string;
  quoteId: string;
  categorie: JobCategory;
  subcategorie?: string;
  omschrijvingKlant: string;
  lengteMm?: number;
  hoogteMm?: number;
  diepteMm?: number;
  aantal: number;
  notities?: string;
  createdAt: string;
  updatedAt?: Timestamp;

  // ✅ New Consolidated Structure
  maatwerk?: {
    basis?: Record<string, any>[]; // The segments/main items
    toevoegingen?: Array<{
      id: string;
      type: string;
      label: string;
      slug?: string;
      afmetingen: Record<string, any>;
    }>;
    notities?: string;
    meta?: {
      title?: string;
      description?: string;
      type?: string;
      slug?: string;
    };
    updatedAt?: Timestamp;
  };

  // Legacy fields (kept for compatibility during migration)
  maatwerk_notities?: string;
  /** @deprecated Data now lives in maatwerk.toevoegingen and materialen.materialen_lijst */
  components?: JobComponent[];
  measurements?: Record<string, number | string>;

  materialen?: any;
  kleinMateriaal?: KleinMateriaalConfig;

  // UI ONLY (Strip before calculation)
  uiState?: {
    collapsedSections?: Record<string, boolean>;
    hiddenCategories?: Record<string, boolean>;
  };
};

export type JobComponentType = 'kozijn' | 'deur' | 'boeiboord' | 'schoorsteen' | 'vensterbank' | 'vlizotrap' | 'koof' | 'installatie' | 'dagkant' | 'gips' | 'isolatie' | 'plafond';

export interface JobComponent {
  id: string; // Unique ID (child ID)
  type: JobComponentType;
  label: string; // e.g. "Kozijn 1"
  measurements: Record<string, number | string | Array<{ breedte: number; lengte: number; label: string }>>; // specific measurements, including dagkant stroken
  materials?: Record<string, unknown>[]; // optional internal materials if needed locally
  slug?: string; // Link to the JOB_REGISTRY item for loading default materials
  meta?: any; // Extra metadata for tracking source, dimensions, etc.
}

export type MaterialCategory = "hout" | "isolatie" | "plaat" | "gips" | "bevestiging" | "afwerking" | "extra";
export type MaterialUnit = "m1" | "m2" | "st" | "pak" | "uur";

export type JobMaterial = {
  id: string;
  jobId: string;
  materiaalCategorie: MaterialCategory;
  naam: string;
  eenheid: MaterialUnit;
  hoeveelheid: number;
  opmerking?: string;
  createdAt: string;
};

export type Material = {
  id: string;
  userId: string;
  categorie: string;
  materiaalnaam: string;
  prijs: number;
  prijs_per_stuk?: number;
  eenheid: string;
  leverancier: string;
  updatedAt: Timestamp;
};

export type MateriaalKeuze = Omit<Material, 'prijs'> & {
  id: string;
  prijs: number;
};


export type MultiEntryItem = {
  id: string;
  material: Record<string, any>;
  aantal: number;
};

export type MultiEntrySlotValue = {
  _multiEntry: true;
  entries: MultiEntryItem[];
};

export type ExtraMaterial = {
  id: string;
  naam: string;
  eenheid: 'm1' | 'm2' | 'm3' | 'stuk' | 'doos' | 'set' | 'uur' | 'anders';
  prijsPerEenheid: number;
  aantal?: number;
  usageDescription?: string;
};

export type KleinMateriaalConfig = {
  mode: 'percentage' | 'fixed';
  percentage: number | null;
  fixedAmount: number | null;
};

// @/lib/types.ts

export type Preset = {
  id: string;
  userId: string;
  jobType: string;
  name: string;
  isDefault: boolean;
  slots: Record<string, string>;
  collapsedSections?: Record<string, boolean>;
  kleinMateriaalConfig?: KleinMateriaalConfig;
  // ✅ ADD THIS LINE:
  custommateriaal?: Record<string, { id: string; title: string; order?: number }>;
  createdAt: string | Timestamp;
};
