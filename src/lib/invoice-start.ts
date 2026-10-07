import { getInvoiceQuoteIds, summarizeInvoiceBilling, type InvoiceBillingRow } from '@/lib/invoice-billing';

export interface InvoiceStartQuote {
  id: string;
  titel?: string;
  title?: string;
  status?: string;
  amount?: number;
  totaalbedrag?: number;
  offerteNummer?: number;
  offerteVersie?: number;
  archived?: boolean;
  isCalculationTest?: boolean;
  updatedAt?: unknown;
  createdAt?: unknown;
  financieel?: { afgesprokenPrijsInclBtw?: number };
  facturatie?: { voorschotIngeschakeld?: boolean; voorschotPercentage?: number };
  klantinformatie?: { voornaam?: string; achternaam?: string; bedrijfsnaam?: string };
}

export interface InvoiceStartInvoice extends InvoiceBillingRow {
  quoteId?: string;
  combinedQuoteIds?: string[];
}

export interface InvoiceStartRow {
  id: string;
  client: string;
  title: string;
  quoteNumber: number | null;
  quoteVersion: number | null;
  total: number | null;
  updatedAt: number;
  ready: boolean;
  action: string;
  href: string;
  amount: number | null;
  issuedAdvance: number;
  receivedAdvance: number;
  note: string | null;
}

function finiteAmount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function timeValue(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') return Date.parse(value) || 0;
  if (value && typeof value === 'object') {
    const timestamp = value as { seconds?: number; _seconds?: number };
    return (timestamp.seconds ?? timestamp._seconds ?? 0) * 1000;
  }
  return 0;
}

/** Kleine facturatiesamenvatting; volledige calculaties blijven buiten deze lijst. */
export function buildInvoiceStartRows(quotes: InvoiceStartQuote[], invoices: InvoiceStartInvoice[], defaultPercentage = 50): InvoiceStartRow[] {
  const byQuote = new Map<string, InvoiceStartInvoice[]>();
  for (const invoice of invoices) {
    for (const id of getInvoiceQuoteIds(invoice)) {
      byQuote.set(id, [...(byQuote.get(id) || []), invoice]);
    }
  }
  return quotes.filter((quote) => !quote.archived && !quote.isCalculationTest).map((quote): InvoiceStartRow => {
    const related = byQuote.get(quote.id) || [];
    const billing = summarizeInvoiceBilling(related);
    const total = finiteAmount(quote.financieel?.afgesprokenPrijsInclBtw) ?? finiteAmount(quote.amount) ?? finiteAmount(quote.totaalbedrag);
    const rawPercentage = quote.facturatie?.voorschotPercentage ?? defaultPercentage;
    const percentage = typeof rawPercentage === 'number' && Number.isFinite(rawPercentage) ? Math.min(100, Math.max(0, rawPercentage)) : 50;
    const hasIssued = billing.issuedAdvances.length > 0;
    const stage = hasIssued || quote.facturatie?.voorschotIngeschakeld === false || percentage === 0 ? 'eind' : 'voorschot';
    let action = stage === 'eind' ? 'Eindfactuur' : `Voorschot ${percentage}%`;
    let href = `/facturen/nieuw?quoteId=${encodeURIComponent(quote.id)}&type=${stage}`;
    let amount = total === null ? null : Math.round((stage === 'eind' ? Math.max(0, total - billing.billedAdvanceAmount) : total * percentage / 100) * 100) / 100;
    let note = billing.ambiguity;
    let ready = quote.status === 'geaccepteerd' || hasIssued || billing.draftAdvances.length > 0;
    const final = billing.finalInvoices[0];
    const draft = billing.draftAdvances[0];
    if (billing.existingFinalId && final) {
      href = `/facturen/${encodeURIComponent(final.id)}${final.status === 'concept' ? '?share=1' : ''}`;
      action = final.status === 'concept' ? 'Concept eindfactuur' : 'Bekijk eindfactuur';
      amount = finiteAmount(final.totalsSnapshot?.totaalInclBtw);
      ready = final.status === 'concept';
      if (!ready) note = final.status === 'betaald' ? 'Eindfactuur betaald' : 'Eindfactuur al aangemaakt';
    } else if (draft && billing.existingAdvanceId) {
      href = `/facturen/${encodeURIComponent(draft.id)}?share=1`;
      action = 'Concept voorschot';
      amount = finiteAmount(draft.totalsSnapshot?.totaalInclBtw);
      ready = true;
    }
    const combinedAdvance = related.some((invoice) => invoice.invoiceType === 'voorschot' && invoice.status !== 'geannuleerd' && (invoice.combinedQuoteIds?.length || 0) > 1);
    if (billing.ambiguity || combinedAdvance || (total !== null && billing.billedAdvanceAmount > total)) {
      note = billing.ambiguity || (combinedAdvance ? 'Gecombineerd voorschot: controleer de verdeling bij Facturen.' : 'Het voorschot is hoger dan het huidige offertebedrag.');
      action = 'Facturen controleren'; href = `/facturen?quoteId=${encodeURIComponent(quote.id)}`; amount = null;
      ready = billing.finalInvoices.length === 0 || billing.finalInvoices.some((invoice) => invoice.status === 'concept');
    }
    return {
      id: quote.id,
      client: quote.klantinformatie?.bedrijfsnaam?.trim() || [quote.klantinformatie?.voornaam, quote.klantinformatie?.achternaam].filter(Boolean).join(' ').trim() || 'Onbekende klant',
      title: quote.titel || quote.title || 'Offerte',
      quoteNumber: quote.offerteNummer ?? null, quoteVersion: quote.offerteVersie ?? null,
      total, updatedAt: timeValue(quote.updatedAt) || timeValue(quote.createdAt), ready, action, href, amount,
      issuedAdvance: billing.billedAdvanceAmount, receivedAdvance: billing.receivedAdvanceAmount, note,
    };
  }).sort((a, b) => Number(b.ready) - Number(a.ready) || b.updatedAt - a.updatedAt);
}
