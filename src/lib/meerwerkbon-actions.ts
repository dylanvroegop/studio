import {
  addDoc,
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';

import type {
  InvoiceCombinedContext,
  Meerwerkbon,
  MeerwerkbonClientSnapshot,
  MeerwerkbonLineItem,
  MeerwerkbonStatus,
  MeerwerkbonTemplatePreset,
  MeerwerkbonTemplateSettings,
} from '@/lib/types';
import { createInvoiceFromQuote } from '@/lib/invoice-actions';
import { DEFAULT_USER_SETTINGS, type UserSettings } from '@/lib/types-settings';
import {
  calculateMeerwerkbonTotals,
  clientSnapshotKey,
  deriveClientSnapshotFromQuote,
  recalcMeerwerkbonLineItems,
} from '@/lib/meerwerkbon-utils';
import { removeEmptyFields } from '@/lib/utils';

function buildTemplateSettings(preset: MeerwerkbonTemplatePreset): MeerwerkbonTemplateSettings {
  if (preset === 'compact') {
    return {
      preset,
      showIntroText: true,
      showVoorwaarden: false,
      showLinkedQuotes: true,
      showSignatureBlocks: true,
      showVatColumn: false,
    };
  }

  return {
    preset: 'uitgebreid',
    showIntroText: true,
    showVoorwaarden: true,
    showLinkedQuotes: true,
    showSignatureBlocks: true,
    showVatColumn: true,
  };
}

function sanitizeCounterKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function reserveMeerwerkbonSequenceForQuote(
  firestore: Firestore,
  params: { userId: string; primaryQuoteId: string }
): Promise<number> {
  const counterId = `meerwerkbon_${sanitizeCounterKey(params.userId)}_${sanitizeCounterKey(params.primaryQuoteId)}`;
  const counterRef = doc(firestore, 'counters', counterId);

  return runTransaction(firestore, async (tx) => {
    const snap = await tx.get(counterRef);
    const next = snap.exists() && typeof snap.data()?.next === 'number'
      ? snap.data()!.next
      : 1;

    tx.set(counterRef, {
      next: next + 1,
      userId: params.userId,
      primaryQuoteId: params.primaryQuoteId,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return next;
  });
}

function buildNumbering(primaryQuote: any, primaryQuoteId: string, sequence: number) {
  const offerteNummer = typeof primaryQuote?.offerteNummer === 'number'
    ? String(primaryQuote.offerteNummer)
    : '';
  const fallbackBase = (primaryQuoteId || '').slice(0, 8).toUpperCase() || 'UNKNOWN';
  const base = offerteNummer || fallbackBase;
  const label = `${base}-MW${String(sequence).padStart(2, '0')}`;

  return { base, sequence, label };
}

function assertSameClient(quotes: Array<{ id: string; data: any }>): void {
  if (quotes.length <= 1) return;
  const keys = quotes.map((row) => clientSnapshotKey(deriveClientSnapshotFromQuote(row.data)));
  const first = keys[0];
  const mismatch = keys.find((key) => key !== first);
  if (mismatch) {
    throw new Error('Gekoppelde offertes moeten aan dezelfde klant gekoppeld zijn.');
  }
}

async function getMergedUserSettings(
  firestore: Firestore,
  userId: string
): Promise<UserSettings> {
  const userRef = doc(firestore, 'users', userId);
  const userSnap = await getDoc(userRef);
  const settingsFromDb = userSnap.exists() ? (userSnap.data() as any)?.settings : null;
  return {
    ...DEFAULT_USER_SETTINGS,
    ...(settingsFromDb || {}),
  } as UserSettings;
}

export async function createMeerwerkbon(
  firestore: Firestore,
  params: {
    userId: string;
    primaryQuoteId: string;
    linkedQuoteIds: string[];
    quoteMap: Record<string, any>;
    lineItems?: Partial<MeerwerkbonLineItem>[];
    clientSnapshot?: MeerwerkbonClientSnapshot;
    templatePreset?: MeerwerkbonTemplatePreset;
    introText?: string;
    voorwaardenText?: string;
    userSettings?: UserSettings | null;
  }
): Promise<string> {
  const linkedQuoteIds = Array.from(new Set([params.primaryQuoteId, ...(params.linkedQuoteIds || [])]));
  const linkedQuotes = linkedQuoteIds.map((quoteId) => ({ id: quoteId, data: params.quoteMap[quoteId] })).filter((row) => !!row.data);

  if (!params.quoteMap[params.primaryQuoteId]) {
    throw new Error('Hoofd-offerte ontbreekt.');
  }

  if (linkedQuotes.length !== linkedQuoteIds.length) {
    throw new Error('Niet alle geselecteerde offertes konden geladen worden.');
  }

  assertSameClient(linkedQuotes);

  const sequence = await reserveMeerwerkbonSequenceForQuote(firestore, {
    userId: params.userId,
    primaryQuoteId: params.primaryQuoteId,
  });
  const numbering = buildNumbering(params.quoteMap[params.primaryQuoteId], params.primaryQuoteId, sequence);

  const normalizedLineItems = recalcMeerwerkbonLineItems(params.lineItems || []);
  const totals = calculateMeerwerkbonTotals(normalizedLineItems);

  const resolvedSettings = params.userSettings || await getMergedUserSettings(firestore, params.userId);
  const templatePreset = params.templatePreset || resolvedSettings.standaardMeerwerkbonTemplatePreset || 'uitgebreid';
  const template = buildTemplateSettings(templatePreset);
  const clientSnapshot = params.clientSnapshot || deriveClientSnapshotFromQuote(params.quoteMap[params.primaryQuoteId]);

  const payload = removeEmptyFields({
    userId: params.userId,
    primaryQuoteId: params.primaryQuoteId,
    linkedQuoteIds,
    status: 'concept',
    numbering,
    clientSnapshot,
    template,
    lineItems: normalizedLineItems,
    totals,
    introText: (params.introText ?? resolvedSettings.standaardMeerwerkbonIntroTekst ?? '').toString(),
    voorwaardenText: (params.voorwaardenText ?? resolvedSettings.standaardMeerwerkbonVoorwaarden ?? '').toString(),
    approval: null,
    invoiceLink: null,
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const created = await addDoc(collection(firestore, 'meerwerkbonnen'), payload || {});
  return created.id;
}

export async function updateMeerwerkbonLineItems(
  firestore: Firestore,
  params: {
    meerwerkbonId: string;
    lineItems: Partial<MeerwerkbonLineItem>[];
    introText?: string;
    voorwaardenText?: string;
  }
): Promise<void> {
  const normalizedLineItems = recalcMeerwerkbonLineItems(params.lineItems);
  const totals = calculateMeerwerkbonTotals(normalizedLineItems);
  const ref = doc(firestore, 'meerwerkbonnen', params.meerwerkbonId);

  await updateDoc(ref, removeEmptyFields({
    lineItems: normalizedLineItems,
    totals,
    introText: params.introText,
    voorwaardenText: params.voorwaardenText,
    updatedAt: serverTimestamp(),
  }) as any);
}

export async function updateMeerwerkbonTemplate(
  firestore: Firestore,
  params: {
    meerwerkbonId: string;
    template: MeerwerkbonTemplateSettings;
  }
): Promise<void> {
  const ref = doc(firestore, 'meerwerkbonnen', params.meerwerkbonId);
  await updateDoc(ref, {
    template: params.template,
    updatedAt: serverTimestamp(),
  } as any);
}

export async function updateMeerwerkbonClientSnapshot(
  firestore: Firestore,
  params: {
    meerwerkbonId: string;
    clientSnapshot: MeerwerkbonClientSnapshot;
  }
): Promise<void> {
  const ref = doc(firestore, 'meerwerkbonnen', params.meerwerkbonId);
  await updateDoc(ref, {
    clientSnapshot: {
      naam: (params.clientSnapshot?.naam || '').toString().trim(),
      email: (params.clientSnapshot?.email || '').toString().trim(),
      telefoon: (params.clientSnapshot?.telefoon || '').toString().trim(),
      adres: (params.clientSnapshot?.adres || '').toString().trim(),
      postcode: (params.clientSnapshot?.postcode || '').toString().trim(),
      plaats: (params.clientSnapshot?.plaats || '').toString().trim(),
    },
    updatedAt: serverTimestamp(),
  } as any);
}

export async function updateMeerwerkbonStatus(
  firestore: Firestore,
  params: {
    meerwerkbonId: string;
    status: MeerwerkbonStatus;
    approval?: Meerwerkbon['approval'] | null;
  }
): Promise<void> {
  const ref = doc(firestore, 'meerwerkbonnen', params.meerwerkbonId);
  const payload: Record<string, unknown> = {
    status: params.status,
    updatedAt: serverTimestamp(),
  };

  if (params.status === 'verzonden') {
    payload.sentAt = serverTimestamp();
  }

  if (params.status === 'akkoord') {
    payload.approval = {
      ...(params.approval || {}),
      akkoordAt: serverTimestamp(),
    };
  } else if (params.approval !== undefined) {
    payload.approval = params.approval;
  }

  await updateDoc(ref, payload as any);
}

export async function createCombinedInvoiceConceptFromMeerwerkbon(
  firestore: Firestore,
  params: {
    userId: string;
    meerwerkbonId: string;
  }
): Promise<string> {
  const mwRef = doc(firestore, 'meerwerkbonnen', params.meerwerkbonId);
  const mwSnap = await getDoc(mwRef);
  if (!mwSnap.exists()) throw new Error('Meerwerkbon niet gevonden.');

  const meerwerkbon = { id: mwSnap.id, ...(mwSnap.data() as any) } as Meerwerkbon & Record<string, any>;
  if (meerwerkbon.userId !== params.userId) {
    throw new Error('Geen toegang tot deze meerwerkbon.');
  }
  if (meerwerkbon.status !== 'akkoord') {
    throw new Error('Alleen geaccordeerde meerwerkbonnen kunnen gefactureerd worden.');
  }
  if (meerwerkbon.invoiceLink?.invoiceId) {
    return meerwerkbon.invoiceLink.invoiceId;
  }

  const primaryQuoteRef = doc(firestore, 'quotes', meerwerkbon.primaryQuoteId);
  const primaryQuoteSnap = await getDoc(primaryQuoteRef);
  if (!primaryQuoteSnap.exists()) {
    throw new Error('Hoofd-offerte van deze meerwerkbon bestaat niet meer.');
  }
  const primaryQuote = { id: primaryQuoteSnap.id, ...(primaryQuoteSnap.data() as any) };

  const settings = await getMergedUserSettings(firestore, params.userId);
  const totaalInclBtw = Number(meerwerkbon?.totals?.totaalInclBtw || 0);
  const quoteIds = Array.from(new Set([
    meerwerkbon.primaryQuoteId,
    ...(Array.isArray(meerwerkbon.linkedQuoteIds) ? meerwerkbon.linkedQuoteIds : []),
  ]));

  const combinedContext: InvoiceCombinedContext = {
    type: 'meerwerkbon_combined',
    primaryQuoteId: meerwerkbon.primaryQuoteId,
    quoteIds,
    meerwerkbonId: meerwerkbon.id,
    meerwerkbonNumber: meerwerkbon.numbering?.label || '',
  };

  const invoiceId = await createInvoiceFromQuote(firestore, {
    userId: params.userId,
    quoteId: meerwerkbon.primaryQuoteId,
    quote: primaryQuote,
    settings,
    invoiceType: 'eind',
    originalTotalInclBtw: totaalInclBtw,
    totalsInclBtw: totaalInclBtw,
    opmerking: `Gecombineerde factuur vanuit meerwerkbon ${meerwerkbon.numbering?.label || meerwerkbon.id}`,
    combinedContext,
    combinedQuoteIds: quoteIds,
    linkedMeerwerkbonIds: [meerwerkbon.id],
    notes: `Aangemaakt vanuit meerwerkbon ${meerwerkbon.numbering?.label || meerwerkbon.id}.`,
  });

  const invoiceSnap = await getDoc(doc(firestore, 'invoices', invoiceId));
  const invoiceNumberLabel = invoiceSnap.exists()
    ? ((invoiceSnap.data() as any)?.invoiceNumberLabel || '').toString()
    : '';

  await runTransaction(firestore, async (tx) => {
    const latest = await tx.get(mwRef);
    if (!latest.exists()) return;
    const latestData = latest.data() as any;
    if (latestData?.invoiceLink?.invoiceId) return;

    tx.update(mwRef, {
      status: 'gefactureerd',
      invoiceLink: {
        invoiceId,
        invoiceNumberLabel,
        createdAt: Timestamp.fromDate(new Date()),
      },
      updatedAt: serverTimestamp(),
    } as any);
  });

  return invoiceId;
}
