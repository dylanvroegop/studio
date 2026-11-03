/** Bedrag uit de PDF die aan de WhatsApp-deelroute is overgedragen. */
export interface SharedQuoteAmount {
  id: string;
  quoteId: string;
  amountCents: number;
  currency: 'EUR';
  fileName: string;
  sharedAt: string;
}

export interface QuoteAmountConfirmation {
  snapshotId: string;
  sharedAmountCents: number;
  invoiceTotalCents: number;
}

export interface QuoteAmountComparison extends QuoteAmountConfirmation {
  differenceCents: number;
}

export function moneyCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

export function readSharedQuoteAmount(value: unknown): SharedQuoteAmount | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as SharedQuoteAmount;
  return typeof record.id === 'string' && !!record.id
    && typeof record.quoteId === 'string' && !!record.quoteId
    && Number.isSafeInteger(record.amountCents) && record.amountCents >= 0
    && record.currency === 'EUR' && typeof record.fileName === 'string'
    && typeof record.sharedAt === 'string' && Number.isFinite(Date.parse(record.sharedAt))
    ? record : null;
}

export function compareSharedQuoteAmount(snapshot: unknown, finalAmount: number, advanceAmount: number): QuoteAmountComparison | null {
  const shared = readSharedQuoteAmount(snapshot);
  if (!shared || !Number.isFinite(finalAmount) || !Number.isFinite(advanceAmount)) return null;
  const invoiceTotalCents = moneyCents(finalAmount) + moneyCents(advanceAmount);
  return {
    snapshotId: shared.id,
    sharedAmountCents: shared.amountCents,
    invoiceTotalCents,
    differenceCents: invoiceTotalCents - shared.amountCents,
  };
}

export function isQuoteAmountConfirmed(check: QuoteAmountComparison, confirmation?: QuoteAmountConfirmation): boolean {
  return !!confirmation && confirmation.snapshotId === check.snapshotId
    && confirmation.sharedAmountCents === check.sharedAmountCents
    && confirmation.invoiceTotalCents === check.invoiceTotalCents;
}

// Koppel bedragen aan de echte bestanden, zodat latere offertewijzigingen of
// afgebroken PDF-voorbereidingen nooit het gedeelde bedrag kunnen vervangen.
const preparedAmounts = new WeakMap<File, Omit<SharedQuoteAmount, 'sharedAt'> & { sharedAt?: string }>();

export function bindSharedQuoteAmount(file: File, quoteId: string, totalInclBtw: number): File {
  if (!Number.isFinite(totalInclBtw) || totalInclBtw < 0) throw new Error('Het PDF-bedrag is ongeldig.');
  preparedAmounts.set(file, Object.freeze({
    id: crypto.randomUUID(), quoteId, amountCents: moneyCents(totalInclBtw), currency: 'EUR', fileName: file.name,
  }));
  return file;
}

export function sharedAmountsForFiles(files: File[], selectedIds: string[]): SharedQuoteAmount[] {
  const amounts = files.map((file) => {
    const prepared = preparedAmounts.get(file);
    if (!prepared) throw new Error('Bereid de offerte-PDF opnieuw voor om het gedeelde bedrag vast te leggen.');
    const shared = { ...prepared, sharedAt: prepared.sharedAt || new Date().toISOString() };
    preparedAmounts.set(file, Object.freeze(shared));
    return shared;
  });
  const ids = new Set(selectedIds);
  if (amounts.length !== ids.size || new Set(amounts.map((item) => item.quoteId)).size !== ids.size
    || amounts.some((item) => !ids.has(item.quoteId))) throw new Error('De PDF-selectie is gewijzigd. Open het verstuurscherm opnieuw.');
  return amounts;
}
