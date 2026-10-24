import { createHash } from 'node:crypto';

const text = (value: unknown): string => typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';

export function isFinalCostDocumentType(value: unknown): boolean {
  return ['invoice', 'receipt', 'credit_note'].includes(text(value));
}

/** Alleen definitieve aankoopdocumenten mogen automatisch kosten worden. */
export function costDocumentError(payload: Record<string, unknown>): string | null {
  if (!isFinalCostDocumentType(payload.document_type)) {
    return 'Dit document is geen bevestigde factuur, kassabon of creditnota. Bewaar het als brondocument; maak geen kostenboeking.';
  }
  if (payload.amount_excl_btw == null || payload.amount_incl_btw == null || payload.btw_amount == null) {
    return 'BTW of nettobedrag ontbreekt. Onbekend is niet hetzelfde als nul.';
  }
  const net = Number(payload.amount_excl_btw), gross = Number(payload.amount_incl_btw), vat = Number(payload.btw_amount);
  if (![net, gross, vat].every(Number.isFinite) || Math.abs(net + vat - gross) > 0.02) {
    return 'Factuurtotalen sluiten niet aan: exclusief plus BTW moet inclusief zijn.';
  }
  return null;
}

/** Mailbox en bestandsnaam zijn geen factuuridentiteit. */
export function costDocumentKeys(uid: string, payload: Record<string, unknown>): string[] {
  const keys: string[] = [];
  const supplier = text(payload.supplier_name);
  const invoice = text(payload.supplier_invoice_number);
  if (supplier && invoice) keys.push(`invoice:${supplier}:${invoice}`);
  const files = Array.isArray(payload.receipt_files) ? payload.receipt_files : [];
  for (const file of files) {
    if (file && typeof file === 'object') {
      const row = file as Record<string, unknown>;
      const hash = text(row.sha256 || row.content_hash);
      if (hash) keys.push(`sha256:${hash}`);
      const archive = text(row.archive_id);
      if (archive) keys.push(`archive:${archive}`);
    }
  }
  return [...new Set(keys)].map(key => createHash('sha256').update(`${uid}:${key}`).digest('hex'));
}
