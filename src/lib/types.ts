
import { Timestamp } from "firebase/firestore";

export type User = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export type Client = {
  id:string;
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
};



export type JobCategory =
  | "Wanden"
  | "Plafonds"
  | "Vloeren"
  | "Dakrenovatie"
  | "Boeiboorden"
  | "Kozijnen"
  | "Deuren"
  | "Gevelbekleding"
  | "Glas zetten"
  | "Afwerkingen"
  | "Dakramen / Lichtkoepel"
  | "Schutting / Tuinafscheiding"
  | "Overkapping / Pergola"
  | "Isolatiewerken"
  | "Overige werkzaamheden";


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
};

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
    eenheid: string;
    leverancier: string;
    updatedAt: Timestamp;
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

export type Preset = {
  id: string;
  userId: string;
  jobType: string;
  name: string;
  isDefault: boolean;
  slots: Record<string, string>;
  collapsedSections: Record<string, boolean>;
  gipsLagen?: number;
  kleinMateriaalConfig?: KleinMateriaalConfig;
  createdAt: Timestamp;
};
