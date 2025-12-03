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
  clientName: string;
  title: string;
  status: "concept" | "in_behandeling" | "verzonden" | "geaccepteerd" | "afgewezen" | "verlopen";
  amount?: number;
  createdAt: Timestamp | Date;
  sentAt?: Timestamp | Date;
  // Fields from Step 1
  clientType: "particulier" | "zakelijk";
  companyName?: string;
  contactPerson?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  billingStreet: string;
  billingHouseNumber: string;
  billingPostcode: string;
  billingCity?: string;
  hasDifferentProjectAddress?: boolean;
  projectStreet?: string;
  projectHouseNumber?: string;
  projectPostcode?: string;
  projectCity?: string;
  shortDescription: string;
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
  | "Dakramen"
  | "Schutting / Tuinafscheiding"
  | "Overkapping / Pergola"
  | "Overig / Maatwerk";


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
  leverancier?: string;
  productcode?: string;
  omschrijving: string;
  eenheid: MaterialUnit;
  prijs: number;
  updatedAt: Timestamp | Date;
};


export type Preset = {
  id: string;
  userId: string;
  categorie: JobCategory;
  subcategorie: string;
  naam: string;
  materialsTemplate: Omit<JobMaterial, 'id' | 'jobId' | 'createdAt' | 'hoeveelheid'> & { standaardHoeveelheidPerM2OfM1: number };
  createdAt: string;
};
