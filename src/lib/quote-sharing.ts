import { stripDocumentLinksFromMessage } from './whatsapp-message-preset';

export function defaultQuoteMessage(language: 'nl' | 'en'): string {
  return language === 'en'
    ? 'Dear {{naam}},\n\nPlease find attached quotation {{offertenummer}} for the work discussed. If you have any questions, please let me know.\n\nKind regards,\n{{bedrijfsnaam}}'
    : 'Beste {{naam}},\n\nHierbij de offerte {{offertenummer}} voor de besproken werkzaamheden. Heb je vragen? Laat het gerust weten.\n\nGroet,\n{{bedrijfsnaam}}';
}

export function resolveQuoteMessage(template: string, context: { name: string; firstName: string; numbers: string; companyName: string }): string {
  const tokens: Record<string, string> = { naam: context.name, voornaam: context.firstName, offertenummer: context.numbers, bedrijfsnaam: context.companyName };
  return stripDocumentLinksFromMessage(template).replace(/\{\{(\w+)\}\}/g, (token, name: string) => tokens[name] ?? token);
}
