import type { ProjectCostReceiptFile } from './project-costs';

const SOURCE_LABELS: Record<string, string> = {
  order: 'Bestelbevestiging',
  order_confirmation: 'Bestelbevestiging',
  quote: 'Offerte',
  quotation: 'Offerte',
  proforma: 'Proforma',
  delivery_note: 'Pakbon',
  payment_order: 'Betaalopdracht',
  payment_request: 'Betaalverzoek',
  payment_confirmation: 'Betaalbewijs',
  payment_proof: 'Betaalbewijs',
  reminder: 'Herinnering',
};

/** Alleen expliciete bronmetadata gebruiken; een bestandsnaam is geen documentclassificatie. */
export function costDocumentSourceLabel(file: Pick<ProjectCostReceiptFile, 'document_type'>): string | null {
  const type = file.document_type?.trim().toLowerCase();
  if (!type || ['invoice', 'receipt', 'credit_note'].includes(type)) return null;
  if (SOURCE_LABELS[type]) return `${SOURCE_LABELS[type]} · geen factuur`;
  if (type === 'unreadable') return 'Onleesbaar document · geen bevestigde factuur';
  if (type === 'unknown') return 'Documenttype onbekend · geen bevestigde factuur';
  return 'Brondocument · geen bevestigde factuur';
}
