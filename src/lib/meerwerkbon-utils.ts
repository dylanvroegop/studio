import type {
  MeerwerkbonClientSnapshot,
  MeerwerkbonLineItem,
  MeerwerkbonTotals,
} from '@/lib/types';

function fallbackId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `mwb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function safeNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeMeerwerkbonLineItem(input: Partial<MeerwerkbonLineItem>): MeerwerkbonLineItem {
  const type: MeerwerkbonLineItem['type'] = input.type === 'materiaal' ? 'materiaal' : 'vrije_post';
  const aantal = Math.max(0, safeNumber(input.aantal, 0));
  const prijsPerEenheidExclBtw = Math.max(0, safeNumber(input.prijsPerEenheidExclBtw, 0));
  const btwTarief = clamp(safeNumber(input.btwTarief, 21), 0, 100);
  const totaalExclBtw = round2(aantal * prijsPerEenheidExclBtw);
  const totaalBtw = round2((totaalExclBtw * btwTarief) / 100);
  const totaalInclBtw = round2(totaalExclBtw + totaalBtw);

  return {
    id: (input.id || '').toString().trim() || fallbackId(),
    type,
    omschrijving: (input.omschrijving || '').toString().trim(),
    aantal,
    eenheid: (input.eenheid || '').toString().trim() || 'stuk',
    prijsPerEenheidExclBtw,
    btwTarief,
    totaalExclBtw,
    totaalBtw,
    totaalInclBtw,
    bronMateriaalId: (input.bronMateriaalId || '').toString().trim() || undefined,
    bronRowId: (input.bronRowId || '').toString().trim() || undefined,
  };
}

export function recalcMeerwerkbonLineItems(lineItems: Partial<MeerwerkbonLineItem>[]): MeerwerkbonLineItem[] {
  return lineItems.map((row) => normalizeMeerwerkbonLineItem(row));
}

export function calculateMeerwerkbonTotals(lineItems: MeerwerkbonLineItem[]): MeerwerkbonTotals {
  const subtotaalExclBtw = round2(lineItems.reduce((sum, row) => sum + safeNumber(row.totaalExclBtw, 0), 0));
  const btwTotaal = round2(lineItems.reduce((sum, row) => sum + safeNumber(row.totaalBtw, 0), 0));
  const totaalInclBtw = round2(lineItems.reduce((sum, row) => sum + safeNumber(row.totaalInclBtw, 0), 0));

  return { subtotaalExclBtw, btwTotaal, totaalInclBtw };
}

export function deriveClientSnapshotFromQuote(quote: any): MeerwerkbonClientSnapshot {
  const info = quote?.klantinformatie || {};
  const factuuradres = info?.factuuradres || info?.factuurAdres || {};

  const voornaam = (info?.voornaam || '').toString();
  const achternaam = (info?.achternaam || '').toString();
  const bedrijfsnaam = (info?.bedrijfsnaam || '').toString();
  const naam = (bedrijfsnaam || [voornaam, achternaam].filter(Boolean).join(' ') || 'Onbekende klant').trim();

  const straat = (factuuradres?.straat ?? info?.straat ?? '').toString();
  const huisnummer = (factuuradres?.huisnummer ?? info?.huisnummer ?? '').toString();
  const adres = `${straat} ${huisnummer}`.trim();

  const postcode = (factuuradres?.postcode ?? info?.postcode ?? '').toString();
  const plaats = (factuuradres?.plaats ?? info?.plaats ?? '').toString();

  const email = (
    info?.['e-mailadres'] ||
    info?.emailadres ||
    info?.email ||
    ''
  ).toString();

  const telefoon = (
    info?.telefoonnummer ||
    info?.telefoon ||
    ''
  ).toString();

  return {
    naam,
    email,
    telefoon,
    adres,
    postcode,
    plaats,
  };
}

export function clientSnapshotKey(client: Partial<MeerwerkbonClientSnapshot> | null | undefined): string {
  return [
    (client?.naam || '').toString().trim().toLowerCase(),
    (client?.email || '').toString().trim().toLowerCase(),
    (client?.postcode || '').toString().trim().toLowerCase(),
    (client?.adres || '').toString().trim().toLowerCase(),
  ].join('|');
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(safeNumber(amount, 0));
}
