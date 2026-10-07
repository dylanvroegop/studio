import type { DataJson } from '@/lib/quote-calculations';
import type { UserSettings } from '@/lib/types-settings';
import type { InvoiceCombinedContext, InvoiceType } from '@/lib/types';
import { removeEmptyFields } from '@/lib/utils';

function safeNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function roundTo2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isTruncatedText(value: string): boolean {
  return value.includes('...') || value.includes('…');
}

function addCleanCandidate(target: string[], value: unknown) {
  if (typeof value !== 'string') return;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (cleaned && !target.includes(cleaned)) target.push(cleaned);
}

function collectTitleCandidates(source: unknown, target: string[]) {
  if (!source || typeof source !== 'object') return;
  const record = source as Record<string, any>;
  addCleanCandidate(target, record.korteTitel);
  addCleanCandidate(target, record.korte_titel);
  addCleanCandidate(target, record.title);
  addCleanCandidate(target, record.titel);
  addCleanCandidate(target, record.werkomschrijving);

  const structured = record.werkbeschrijving_structured || record.werkbeschrijvingStructured;
  if (structured && typeof structured === 'object') {
    addCleanCandidate(target, structured.title);
    if (Array.isArray(structured.jobs)) {
      structured.jobs.forEach((job: any) => addCleanCandidate(target, job?.title));
    }
  }

  const jobs = record.werkbeschrijving_jobs || record.werkbeschrijvingJobs;
  if (Array.isArray(jobs)) {
    jobs.forEach((job: any) => addCleanCandidate(target, job?.title || job?.korteTitel || job?.korte_titel));
  }
}

function resolveInvoiceTitle(quote: any, calculationSnapshot?: DataJson): string | null {
  const candidates: string[] = [];
  collectTitleCandidates(calculationSnapshot, candidates);
  collectTitleCandidates(quote?.calculationSnapshot || quote?.data_json, candidates);
  collectTitleCandidates(quote, candidates);
  const title = candidates.find((candidate) => !isTruncatedText(candidate)) || candidates[0] || '';
  return title || null;
}

function buildKlantSnapshot(quote: any) {
  const info = quote?.klantinformatie || {};
  const factuuradres = info?.factuuradres || info?.factuurAdres || {};

  const voornaam = info?.voornaam || '';
  const achternaam = info?.achternaam || '';
  const bedrijfsnaam = info?.bedrijfsnaam || '';

  const naam = (bedrijfsnaam || [voornaam, achternaam].filter(Boolean).join(' ') || 'Onbekende klant').trim();

  const straat = factuuradres?.straat ?? info?.straat ?? '';
  const huisnummer = factuuradres?.huisnummer ?? info?.huisnummer ?? '';
  const adres = `${straat} ${huisnummer}`.trim();

  const postcode = factuuradres?.postcode ?? info?.postcode ?? '';
  const plaats = factuuradres?.plaats ?? info?.plaats ?? '';

  const email =
    info?.['e-mailadres'] ||
    info?.emailadres ||
    info?.email ||
    '';

  const telefoon =
    info?.telefoonnummer ||
    info?.telefoon ||
    '';

  return {
    clientId: (info?.clientId || '').toString().trim(),
    klanttype: info?.klanttype ?? null,
    naam,
    adres,
    postcode,
    plaats,
    telefoon,
    email,
    kvkNummer: (info?.kvkNummer || '').toString().trim(),
    btwNummer: (info?.btwNummer || '').toString().trim().toUpperCase(),
  };
}

function buildProjectAdresSnapshot(quote: any) {
  const info = quote?.klantinformatie || {};
  const afwijkend = !!info?.afwijkendProjectadres;
  const project = info?.projectadres || info?.projectAdres;
  if (!afwijkend || !project) return null;

  const straat = project?.straat ?? '';
  const huisnummer = project?.huisnummer ?? '';
  const adres = `${straat} ${huisnummer}`.trim();
  const postcode = project?.postcode ?? '';
  const plaats = project?.plaats ?? '';

  if (!adres && !postcode && !plaats) return null;
  return { adres, postcode, plaats };
}

export interface CreateInvoiceParams {
    userId: string;
    quoteId: string;
    quote: any;
    settings: UserSettings;
    invoiceType: InvoiceType;
    calculationSnapshot?: DataJson;
    originalTotalInclBtw: number;
    totalsInclBtw: number;
    voorschotPercentage?: number;
    voorschotAftrekInclBtw?: number;
    voorschotFactuurSnapshot?: {
      id: string;
      invoiceNumberLabel: string;
      status: string;
      totaalInclBtw: number;
      paidAmount: number;
    } | null;
    handmatigEindbedrag?: boolean;
    opmerking?: string;
    notes?: string;
    combinedContext?: InvoiceCombinedContext | null;
    combinedQuoteIds?: string[] | null;
    linkedMeerwerkbonIds?: string[] | null;
  
    expectedQuoteSignature?: string;
    expectedBillingSignature?: string;
}

export function buildInvoiceDocument(params: CreateInvoiceParams, invoiceNumber: number, timestamp: unknown): Record<string, any> {
  const {
    userId,
    quoteId,
    quote,
    settings,
    invoiceType,
    calculationSnapshot,
    originalTotalInclBtw,
    totalsInclBtw,
    voorschotPercentage,
    voorschotAftrekInclBtw,
    voorschotFactuurSnapshot,
    handmatigEindbedrag,
    opmerking,
    notes,
    combinedContext,
    combinedQuoteIds,
    linkedMeerwerkbonIds,
  } = params;

  const invoicePrefix = (settings.factuurNummerPrefix || '').toString();
  const invoiceNumberLabel = `${invoicePrefix}${invoiceNumber}`;

  const totaalInclBtw = roundTo2(Math.max(0, safeNumber(totalsInclBtw) ?? 0));

  const issueDate = new Date();
  const betaaltermijn = safeNumber(settings.standaardBetaaltermijnDagen) ?? 14;
  const dueDate = invoiceType === 'voorschot'
    ? new Date(issueDate)
    : new Date(issueDate.getTime() + betaaltermijn * 24 * 60 * 60 * 1000);

  const payload = removeEmptyFields({
    userId,
    quoteId,
    status: 'concept',
    invoiceType,
    ...(invoiceType === 'voorschot' && typeof voorschotPercentage === 'number' ? { voorschotPercentage } : {}),

    invoiceNumber,
    invoicePrefix,
    invoiceNumberLabel,

    createdAt: timestamp,
    updatedAt: timestamp,
    issueDate,
    dueDate,

    sourceQuote: {
      offerteNummer: safeNumber(quote?.offerteNummer) ?? null,
      offerteVersie: safeNumber(quote?.offerteVersie) ?? null,
      titel: resolveInvoiceTitle(quote, calculationSnapshot),
      klantSnapshot: buildKlantSnapshot(quote),
      projectAdresSnapshot: buildProjectAdresSnapshot(quote),
    },

    calculationSnapshot: calculationSnapshot ?? null,

    totalsSnapshot: {
      totaalInclBtw,
    },

    financialAdjustments: invoiceType === 'eind' || invoiceType === 'voorschot'
      ? {
        originalTotalInclBtw: roundTo2(Math.max(0, safeNumber(originalTotalInclBtw) ?? 0)),
        voorschotAftrekInclBtw: roundTo2(Math.max(0, safeNumber(voorschotAftrekInclBtw) ?? 0)),
        voorschotFactuur: voorschotFactuurSnapshot ?? null,
        handmatigEindbedrag: handmatigEindbedrag === true,
        opmerking: (opmerking ?? '').toString(),
      }
      : undefined,

    paymentSummary: {
      paidAmount: 0,
      openAmount: totaalInclBtw,
    },

    notes: (notes ?? '').toString(),
    combinedContext: combinedContext ?? null,
    combinedQuoteIds: Array.isArray(combinedQuoteIds) ? combinedQuoteIds : undefined,
    linkedMeerwerkbonIds: Array.isArray(linkedMeerwerkbonIds) ? linkedMeerwerkbonIds : undefined,
  });

  return payload || {};
}
