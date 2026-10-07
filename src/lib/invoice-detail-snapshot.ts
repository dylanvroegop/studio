import type { Invoice } from './types';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }

export function hasFrozenInvoiceSnapshot(invoice: Invoice): boolean {
  return record(invoice).invoiceSnapshotVersion === 1 && Object.keys(record(invoice.calculationSnapshot)).length > 0;
}

/** Oude factuursnapshots bevatten soms nog geen offertenummer of zakelijke klantnummers. */
export function hasCompleteInvoiceSourceSnapshot(invoice: Invoice): boolean {
  const snapshot = record(invoice.calculationSnapshot);
  if (!hasFrozenInvoiceSnapshot(invoice)) return false;
  const quoteNumber = Number(invoice.sourceQuote?.offerteNummer);
  if (!Number.isFinite(quoteNumber) || quoteNumber <= 0) return false;
  const client = record(invoice.sourceQuote?.klantSnapshot);
  const calculationClient = record(snapshot.klantinformatie);
  const clientType = text(client.klanttype || calculationClient.klanttype).toLowerCase();
  if (clientType === 'particulier') return true;
  if (clientType !== 'zakelijk') return false;
  return Boolean(text(client.kvkNummer || client.kvk || calculationClient.kvkNummer || calculationClient.kvk)
    && text(client.btwNummer || client.btw || calculationClient.btwNummer || calculationClient.btw));
}
