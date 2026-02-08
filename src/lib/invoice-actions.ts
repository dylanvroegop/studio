import type { Firestore } from 'firebase/firestore';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import type { DataJson } from '@/lib/quote-calculations';
import type { UserSettings } from '@/lib/types-settings';
import { reserveInvoiceNumber } from '@/lib/firestore-actions';

function safeNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
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
    calculationSnapshot?: DataJson;
    totalsInclBtw?: number;
  }
): Promise<string> {
  const { userId, quoteId, quote, settings, calculationSnapshot, totalsInclBtw } = params;

  const startNumber = safeNumber(settings.factuurNummerStart) ?? 460001;
  const invoiceNumber = await reserveInvoiceNumber(firestore, userId, startNumber);
  const invoicePrefix = (settings.factuurNummerPrefix || '').toString();
  const invoiceNumberLabel = `${invoicePrefix}${invoiceNumber}`;

  const totaalInclBtw =
    safeNumber(totalsInclBtw) ??
    safeNumber(quote?.amount) ??
    safeNumber(quote?.totaalbedrag) ??
    0;

  const issueDate = new Date();
  const betaaltermijn = safeNumber(settings.standaardBetaaltermijnDagen) ?? 14;
  const dueDate = new Date(Date.now() + betaaltermijn * 24 * 60 * 60 * 1000);

  const docRef = await addDoc(collection(firestore, 'invoices'), {
    userId,
    quoteId,
    status: 'concept',

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

    paymentSummary: {
      paidAmount: 0,
      openAmount: totaalInclBtw,
    },

    notes: '',
  });

  return docRef.id;
}
