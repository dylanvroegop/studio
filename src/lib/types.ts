
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
    materieel?: any[]; // Bouwplaatskosten
  };
};

export type QuoteSettings = {
  btwTarief: number;          // e.g. 21
  uurTariefExclBtw: number;   // e.g. 45.00
};



export type JobCategory =
  | "Wanden"
  | "Plafonds"
  | "Vloeren & Vlieringen"
  | "Deuren"
  | "Kozijnen"
  | "Dakkapellen"
  | "Dakrenovatie"
  | "Gevelbekleding"
  | "Schutting"
  | "Overkapping & Houtbouw"
  | "Afwerkingen"
  | "Glas zetten"
  | "Trappen"
  | "Houtrotreparatie"
  | "Keukens"
  | "Inbouwkasten"
  | "Meubels Op Maat"
  | "Dakramen / Lichtkoepel"
  | "Boeiboorden"
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
  measurements?: Record<string, any>;

  createdAt: string;

  // ✅ Optimized Structure
  maatwerk?: any[]; // The array of measurements (segments)
  materialen?: {
    selections: Record<string, { id: string; naam: string; prijs: number; eenheid: string }>;
    custommateriaal: Record<string, any>;
  };
  kleinMateriaal?: KleinMateriaalConfig;

  components?: JobComponent[];

  // UI ONLY (Strip before calculation)
  uiState?: {
    collapsedSections?: Record<string, boolean>;
    hiddenCategories?: Record<string, boolean>;
  };
};

export type JobComponentType = 'kozijn' | 'deur' | 'boeiboord' | 'schoorsteen' | 'vensterbank' | 'vlizotrap' | 'leidingkoof' | 'installatie' | 'dagkant';

export interface JobComponent {
  id: string; // Unique ID (child ID)
  type: JobComponentType;
  label: string; // e.g. "Kozijn 1"
  measurements: Record<string, number | string>; // specific measurements
  materials?: any[]; // optional internal materials if needed locally
  slug?: string; // Link to the JOB_REGISTRY item for loading default materials
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
  createdAt: any;
};
