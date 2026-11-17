import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';

import type {
  InvoiceCombinedContext,
  Meerwerkbon,
  MeerwerkbonClientSnapshot,
  MeerwerkbonLineItem,
  MeerwerkbonPricingMode,
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
    opmerking?: string;
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
    pricingMode: 'begroot' satisfies MeerwerkbonPricingMode,
    numbering,
    clientSnapshot,
    template,
    opmerking: (params.opmerking ?? '').toString(),
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

export async function saveMeerwerkbonDetails(
  firestore: Firestore,
  params: {
    meerwerkbonId: string;
    pricingMode: MeerwerkbonPricingMode;
    estimatedHours: number | null;
    template: MeerwerkbonTemplateSettings;
    lineItems: MeerwerkbonLineItem[];
    opmerking: string;
    introText: string;
    voorwaardenText: string;
  }
): Promise<void> {
  const { meerwerkbonId, estimatedHours, ...details } = params;
  await updateDoc(doc(firestore, 'meerwerkbonnen', meerwerkbonId), {
    ...details,
    lineItems: details.lineItems.map((row) => removeEmptyFields(row)),
    totals: calculateMeerwerkbonTotals(details.lineItems),
    geschatteArbeidsuren: estimatedHours,
    opmerking: details.opmerking.trim() || deleteField(),
    updatedAt: serverTimestamp(),
  });
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

export async function createMeerwerkbonInvoice(
  firestore: Firestore,
  userId: string,
  meerwerkbon: Meerwerkbon,
  type: InvoiceCombinedContext['type'],
  actualLineItems?: MeerwerkbonLineItem[],
): Promise<string> {
  const { id, primaryQuoteId, numbering } = meerwerkbon;
  const total = actualLineItems
    ? calculateMeerwerkbonTotals(actualLineItems).totaalInclBtw
    : meerwerkbon.totals.totaalInclBtw;
  return createInvoiceFromQuote(firestore, {
    userId,
    quoteId: primaryQuoteId,
    invoiceType: 'eind',
    originalTotalInclBtw: total,
    totalsInclBtw: total,
    combinedContext: {
      type, primaryQuoteId, quoteIds: meerwerkbon.linkedQuoteIds,
      meerwerkbonId: id, meerwerkbonNumber: numbering?.label || id,
    },
    meerwerkbonPricingMode: meerwerkbon.pricingMode || 'begroot',
    actualLineItems,
    ...(type === 'meerwerkbon_combined' && {
      opmerking: `Gecombineerde factuur vanuit meerwerkbon ${numbering?.label || id}`,
      notes: `Aangemaakt vanuit meerwerkbon ${numbering?.label || id}.`,
    }),
  });
}
