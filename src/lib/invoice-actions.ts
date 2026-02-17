import type { Firestore } from 'firebase/firestore';
import { addDoc, collection, serverTimestamp, query, where, getDocs, limit, getDoc, doc } from 'firebase/firestore';
import type { DataJson } from '@/lib/quote-calculations';
import type { UserSettings } from '@/lib/types-settings';
import { reserveInvoiceNumber } from '@/lib/firestore-actions';
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
    klanttype: info?.klanttype ?? null,
    naam,
    adres,
    postcode,
    plaats,
    telefoon,
    email,
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

export async function createInvoiceFromQuote(
  firestore: Firestore,
  params: {
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
    opmerking?: string;
    notes?: string;
    combinedContext?: InvoiceCombinedContext | null;
    combinedQuoteIds?: string[] | null;
    linkedMeerwerkbonIds?: string[] | null;
  }
): Promise<string> {
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
    opmerking,
    notes,
    combinedContext,
    combinedQuoteIds,
    linkedMeerwerkbonIds,
  } = params;

  const startNumber = safeNumber(settings.factuurNummerStart) ?? 460001;
  const invoiceNumber = await reserveInvoiceNumber(firestore, userId, startNumber);
  const invoicePrefix = (settings.factuurNummerPrefix || '').toString();
  const invoiceNumberLabel = `${invoicePrefix}${invoiceNumber}`;

  const totaalInclBtw = roundTo2(Math.max(0, safeNumber(totalsInclBtw) ?? 0));

  const issueDate = new Date();
  const betaaltermijn = safeNumber(settings.standaardBetaaltermijnDagen) ?? 14;
  const dueDate = new Date(Date.now() + betaaltermijn * 24 * 60 * 60 * 1000);

  const payload = removeEmptyFields({
    userId,
    quoteId,
    status: 'concept',
    invoiceType,

    invoiceNumber,
    invoicePrefix,
    invoiceNumberLabel,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    issueDate,
    dueDate,

    sourceQuote: {
      offerteNummer: safeNumber(quote?.offerteNummer) ?? null,
      titel: (quote?.titel || quote?.title || quote?.werkomschrijving || '').toString() || null,
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

  const docRef = await addDoc(collection(firestore, 'invoices'), payload || {});

  return docRef.id;
}

export async function findExistingVoorschotInvoiceId(
  firestore: Firestore,
  params: { userId: string; quoteId: string }
): Promise<string | null> {
  const ref = collection(firestore, 'invoices');
  const q = query(
    ref,
    where('userId', '==', params.userId),
    limit(50)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  const candidates = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((d) => d?.quoteId === params.quoteId)
    .filter((d) => (d?.invoiceType ?? 'eind') === 'voorschot')
    .filter((d) => d?.status !== 'geannuleerd');

  return candidates[0]?.id ?? null;
}

export async function getInvoiceSnapshotForAdjustments(
  firestore: Firestore,
  invoiceId: string
): Promise<{
  id: string;
  invoiceNumberLabel: string;
  status: string;
  totaalInclBtw: number;
  paidAmount: number;
} | null> {
  const ref = doc(firestore, 'invoices', invoiceId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as any;

  const status = (data?.status ?? 'concept').toString();
  const paidAmount = status !== 'concept' ? (safeNumber(data?.paymentSummary?.paidAmount) ?? 0) : 0;

  return {
    id: snap.id,
    invoiceNumberLabel: (data?.invoiceNumberLabel ?? '').toString(),
    status,
    totaalInclBtw: safeNumber(data?.totalsSnapshot?.totaalInclBtw) ?? 0,
    paidAmount,
  };
}
