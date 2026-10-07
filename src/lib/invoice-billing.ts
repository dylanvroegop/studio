/** Facturatie en ontvangst zijn afzonderlijke bedragen; concepten zijn nog niet gefactureerd. */
export interface InvoiceBillingRow {
  id: string;
  invoiceType?: string;
  status?: string;
  invoiceNumberLabel?: string;
  quoteId?: string;
  combinedQuoteIds?: string[];
  combinedContext?: { type?: string; meerwerkbonId?: string; quoteIds?: string[]; sourceQuotes?: Array<{ id?: string; quoteId?: string }> } | null;
  linkedMeerwerkbonIds?: string[];
  totalsSnapshot?: { totaalInclBtw?: number };
  paymentSummary?: { paidAmount?: number; openAmount?: number };
}

export interface InvoiceBillingSummary {
  issuedAdvances: InvoiceBillingRow[];
  draftAdvances: InvoiceBillingRow[];
  finalInvoices: InvoiceBillingRow[];
  billedAdvanceAmount: number;
  receivedAdvanceAmount: number;
  openAdvanceAmount: number;
  existingAdvanceId: string | null;
  existingFinalId: string | null;
  ambiguity: string | null;
}

const ISSUED_STATUSES = new Set(['verzonden', 'gedeeltelijk_betaald', 'betaald']);
const roundMoney = (amount: number): number => Math.round((amount + Number.EPSILON) * 100) / 100;

export function summarizeInvoiceBilling(rows: InvoiceBillingRow[]): InvoiceBillingSummary {
  const active = rows.filter((row) => row.status !== 'geannuleerd' && !isSupplementaryInvoice(row));
  const advances = active.filter((row) => row.invoiceType === 'voorschot');
  const issuedAdvances = advances.filter((row) => ISSUED_STATUSES.has(row.status || ''));
  const draftAdvances = advances.filter((row) => row.status === 'concept');
  const finalInvoices = active.filter((row) => row.invoiceType === 'eind');
  const invalid = active.some((row) => (
    (row.invoiceType !== 'voorschot' && row.invoiceType !== 'eind')
    || (row.status !== 'concept' && !ISSUED_STATUSES.has(row.status || ''))
    || typeof row.totalsSnapshot?.totaalInclBtw !== 'number'
    || !Number.isFinite(row.totalsSnapshot.totaalInclBtw)
    || row.totalsSnapshot.totaalInclBtw < 0
  ));
  const billedAdvanceAmount = roundMoney(issuedAdvances.reduce((sum, row) => sum + (row.totalsSnapshot?.totaalInclBtw || 0), 0));
  const receivedAdvanceAmount = roundMoney(issuedAdvances.reduce((sum, row) => {
    const paid = row.paymentSummary?.paidAmount;
    return sum + (typeof paid === 'number' && Number.isFinite(paid) ? Math.max(0, paid) : 0);
  }, 0));
  const combinedAdvance = advances.some((row) => getInvoiceQuoteIds(row).length > 1);
  const ambiguity = combinedAdvance
    ? 'Dit voorschot hoort bij meerdere offertes. Controleer eerst welk bedrag bij deze offerte hoort.'
    : invalid
    ? 'Een bestaande factuur heeft onvolledige gegevens. Controleer deze eerst bij Facturen.'
    : draftAdvances.length > 1 || (draftAdvances.length > 0 && issuedAdvances.length > 0)
      ? 'Er staan meerdere voorschotten of concepten klaar. Controleer deze eerst bij Facturen.'
      : finalInvoices.length > 1
        ? 'Er bestaan meerdere eindfacturen. Controleer deze eerst bij Facturen.'
        : null;
  return {
    issuedAdvances, draftAdvances, finalInvoices,
    billedAdvanceAmount, receivedAdvanceAmount,
    openAdvanceAmount: roundMoney(Math.max(0, billedAdvanceAmount - receivedAdvanceAmount)),
    existingAdvanceId: advances.length === 1 ? advances[0].id : null,
    existingFinalId: finalInvoices.length === 1 ? finalInvoices[0].id : null,
    ambiguity,
  };
}

export function getInvoiceQuoteIds(row: InvoiceBillingRow): string[] {
  return [...new Set([
    row.quoteId,
    ...(row.combinedQuoteIds || []),
    ...(row.combinedContext?.quoteIds || []),
    ...(row.combinedContext?.sourceQuotes || []).map((quote) => quote.quoteId || quote.id),
  ].filter((id): id is string => typeof id === 'string' && !!id))];
}

export function invoiceTouchesQuote(row: InvoiceBillingRow, quoteId: string): boolean {
  return getInvoiceQuoteIds(row).includes(quoteId);
}

/** Meerwerkbonfacturen bevatten de eigen meerwerkregels, niet het totaal van de gekoppelde offerte. */
export function isSupplementaryInvoice(row: InvoiceBillingRow): boolean {
  return row.combinedContext?.type === 'meerwerkbon_combined' && !!row.combinedContext.meerwerkbonId;
}

/** Vergelijk de bedragen waarop de gebruiker de controle heeft gebaseerd, niet alleen factuur-id's. */
export function invoiceBillingSignature(rows: InvoiceBillingRow[]): string {
  return JSON.stringify(rows.filter((row) => row.status !== 'geannuleerd' && !isSupplementaryInvoice(row)).map((row) => ({
    id: row.id, type: row.invoiceType, status: row.status,
    total: row.totalsSnapshot?.totaalInclBtw,
  })).sort((a, b) => a.id.localeCompare(b.id)));
}
