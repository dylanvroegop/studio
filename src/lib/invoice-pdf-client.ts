import type { PDFInvoiceData } from '@/lib/generate-invoice-pdf';

const pdfRequests = new Map<string, { expiresAt: number; request: Promise<Blob> }>();

/** De preview en download gebruiken exact dezelfde PDF zolang alle gegevens gelijk zijn. */
export function getInvoicePdfBlob(data: PDFInvoiceData): Promise<Blob> {
  const signature = JSON.stringify(data);
  const cached = pdfRequests.get(signature);
  if (cached && cached.expiresAt > Date.now()) return cached.request;

  const request = import('@/lib/generate-invoice-pdf').then(({ generateInvoicePDF }) => generateInvoicePDF(data));
  pdfRequests.delete(signature);
  pdfRequests.set(signature, { expiresAt: Date.now() + 5 * 60 * 1000, request });
  if (pdfRequests.size > 2) pdfRequests.delete(pdfRequests.keys().next().value as string);
  void request.catch(() => {
    if (pdfRequests.get(signature)?.request === request) pdfRequests.delete(signature);
  });
  return request;
}
