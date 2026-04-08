import type { ReceiptAttachment } from '@/lib/types';

function sanitizeFileNamePart(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 80);
}

function getFileExtension(originalName: string, mimeType: string): string {
  const fromName = originalName.includes('.') ? originalName.split('.').pop() : '';
  const cleanedFromName = String(fromName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (cleanedFromName) return cleanedFromName;

  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'bin';
}

export function buildReceiptDownloadFileName(
  receipt: Pick<ReceiptAttachment, 'originalName' | 'mimeType'>,
  options: { klantNaam?: unknown; offerteNummer?: unknown; index?: number },
): string {
  const safeOfferteNummer = sanitizeFileNamePart(options.offerteNummer || 'CONCEPT') || 'CONCEPT';
  const safeKlantNaam = sanitizeFileNamePart(options.klantNaam || 'Klant') || 'Klant';
  const extension = getFileExtension(receipt.originalName, receipt.mimeType);
  const indexPart = Number.isFinite(options.index) ? String((options.index as number) + 1).padStart(2, '0') : '01';

  return `BON-${safeOfferteNummer}-${safeKlantNaam}-${indexPart}.${extension}`;
}
