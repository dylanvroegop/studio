import { stripDocumentLinksFromMessage } from './whatsapp-message-preset';

export const INVOICE_MESSAGE_STORAGE_KEY = 'whatsapp_invoice_message_preset_v1';
export const DEFAULT_INVOICE_MESSAGE = 'Beste {{naam}},\n\nHierbij de {{factuurtype}} {{factuurnummer}} voor de werkzaamheden. Het factuurbedrag is {{bedrag}}. De betalingstermijn is {{vervaldatum}}.\n\nGroet,\n{{bedrijfsnaam}}';

export interface InvoiceMessageContext {
  clientName: string;
  invoiceType: 'voorschot' | 'eind';
  invoiceNumber: string;
  amount: number;
  dueDate: string;
  companyName: string;
}

export function invoiceShareFilename(invoiceNumber: string, clientName: string): string {
  const clean = (value: string): string => value.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 70).replace(/-$/g, '');
  return `Factuur-${clean(invoiceNumber) || 'zonder-nummer'}-${clean(clientName) || 'klant'}.pdf`;
}

export function initialInvoiceMessageTemplate(accountValue: unknown, browserValue: string | null): {
  template: string;
  source: 'account' | 'browser' | 'default';
} {
  // Een bewust lege tekst is ook een opgeslagen voorkeur en mag geen oude tekst terughalen.
  if (typeof accountValue === 'string') return { template: stripDocumentLinksFromMessage(accountValue), source: 'account' };
  // De oude dialoog schreef zelf een lege waarde wanneer er nog geen preset was.
  if (browserValue?.trim()) return { template: stripDocumentLinksFromMessage(browserValue), source: 'browser' };
  return { template: DEFAULT_INVOICE_MESSAGE, source: 'default' };
}

export function resolveInvoiceMessage(template: string, context: InvoiceMessageContext): string {
  const tokens: Record<string, string> = {
    naam: context.clientName.trim() || 'klant',
    // Oude presets blijven bruikbaar zonder een bedrijfsnaam als voornaam te raden.
    voornaam: context.clientName.trim() || 'klant',
    factuurtype: context.invoiceType === 'voorschot' ? 'voorschotfactuur' : 'eindfactuur',
    factuurnummer: context.invoiceNumber,
    bedrag: new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(context.amount),
    vervaldatum: context.dueDate,
    bedrijfsnaam: context.companyName,
  };
  return stripDocumentLinksFromMessage(template).replace(/\{\{(\w+)\}\}/g, (token, name: string) => tokens[name] ?? token);
}

export function invoiceWhatsAppUrl(phone: string, message: string): string | null {
  let normalized = phone.replace(/\D/g, '');
  if (normalized.startsWith('00')) normalized = normalized.slice(2);
  if (normalized.startsWith('0') && normalized.length === 10) normalized = `31${normalized.slice(1)}`;
  if (!/^[1-9]\d{7,14}$/.test(normalized)) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(stripDocumentLinksFromMessage(message))}`;
}

export interface InvoiceShareBrowser {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
}

export function canShareInvoiceFile(browser: InvoiceShareBrowser, file: File): boolean {
  try {
    return typeof browser.share === 'function' && browser.canShare?.({ files: [file] }) === true;
  } catch {
    return false;
  }
}

export function sharePreparedInvoice(
  browser: InvoiceShareBrowser,
  file: File,
  message: string,
): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (!canShareInvoiceFile(browser, file)) return Promise.resolve('unsupported');
  // Roep share direct aan binnen de tik; geen PDF-generatie, download of await vóór deze regel.
  try {
    const cleanMessage = stripDocumentLinksFromMessage(message);
    return browser.share!({ files: [file], ...(cleanMessage ? { text: cleanMessage } : {}) })
      .then(() => 'shared' as const)
      .catch((error: unknown) => {
        if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return 'cancelled' as const;
        throw error;
      });
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return Promise.resolve('cancelled');
    return Promise.reject(error);
  }
}

export function downloadInvoiceFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari kan de download pas starten nadat de click-handler klaar is.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
