const DOCUMENT_TYPES = new Set([
  'invoice', 'receipt', 'credit_note', 'order_confirmation', 'delivery_note',
  'payment_order', 'payment_request', 'payment_confirmation', 'quote', 'proforma',
  'reminder', 'other', 'unknown',
]);

export const COST_DOCUMENT_IDENTITY_PROMPT = `Also return document_type: invoice|receipt|credit_note|order_confirmation|delivery_note|payment_order|payment_request|payment_confirmation|quote|proforma|reminder|other|unknown. Classify the actual original document, not the email subject or filename. A payment request, order confirmation, quotation, proforma or reminder is not an invoice. Use unknown when the document cannot be identified. Return supplier_invoice_number as the exact printed invoice/receipt/credit-note number or null. Never substitute a customer, quote, order, bank transaction or payment reference for the invoice number. Review these two fields against the original document as well.`;

function documentType(value: unknown): string {
  const type = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return DOCUMENT_TYPES.has(type) ? type : 'unknown';
}

function invoiceNumber(input: Record<string, unknown>): string | null {
  const value = input.supplier_invoice_number ?? input.invoice_number ?? input.factuur_nummer;
  if (typeof value === 'string') return value.trim() || null;
  return typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : null;
}

export interface CostExtractionIdentity {
  document_type: string;
  supplier_invoice_number: string | null;
  warning: string | null;
}

/** Een ontbrekende of tegenstrijdige documentclassificatie wordt nooit een factuur. */
export function costExtractionIdentity(
  reviewed: Record<string, unknown>,
  initial: Record<string, unknown> = {},
): CostExtractionIdentity {
  let type = documentType(reviewed.document_type);
  let number = invoiceNumber(reviewed);
  const firstType = documentType(initial.document_type);
  const firstNumber = invoiceNumber(initial);
  const warnings: string[] = [];
  if (firstType !== 'unknown' && type !== 'unknown' && firstType !== type) {
    type = 'unknown';
    warnings.push('De documentcontroles verschillen over het documenttype; controleer de bron.');
  } else if (type === 'unknown') {
    warnings.push('Het documenttype kon niet worden vastgesteld; controleer of dit een factuur of bon is.');
  }
  if (firstNumber && number && firstNumber !== number) {
    number = null;
    warnings.push('De documentcontroles verschillen over het factuurnummer; controleer de bron.');
  }
  return { document_type: type, supplier_invoice_number: number, warning: warnings.join(' ') || null };
}
