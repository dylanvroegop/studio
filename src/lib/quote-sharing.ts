import { stripDocumentLinksFromMessage } from './whatsapp-message-preset';

export function quoteGreeting(now: Date = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam', hour: '2-digit', hourCycle: 'h23',
  }).format(now));
  return hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond';
}

export function refreshQuoteGreeting(message: string, now: Date = new Date()): string {
  return message.replace(/^(\s*)(?:goedemorgen|goedemiddag|goedenavond)\b/i, (_, whitespace: string) => `${whitespace}${quoteGreeting(now)}`);
}

export function defaultQuoteMessage(language: 'nl' | 'en'): string {
  if (language === 'en') {
    return 'Dear {{naam}},\n\nPlease find attached quotation {{offertenummer}} for the work discussed. If you have any questions, please let me know.\n\nKind regards,\n{{bedrijfsnaam}}';
  }

  return `{{begroeting}} {{voornaam}},

Zoals besproken heb ik de offerte voor je uitgewerkt. In de bijlage vind je een overzicht van de werkzaamheden en de bijbehorende kosten.

Mocht je vragen hebben of iets willen aanpassen, laat het gerust weten. Bij akkoord kunnen we samen een geschikte uitvoeringsdatum inplannen.

Ik hoor graag van je!

Met vriendelijke groet,
Dylan
Vroegop Timmerwerken`;
}

export function resolveQuoteMessage(template: string, context: { name: string; firstName: string; numbers: string; companyName: string }, now: Date = new Date()): string {
  const tokens: Record<string, string> = { begroeting: quoteGreeting(now), naam: context.name, voornaam: context.firstName, offertenummer: context.numbers, bedrijfsnaam: context.companyName };
  return refreshQuoteGreeting(stripDocumentLinksFromMessage(template).replace(/\{\{(\w+)\}\}/g, (token, name: string) => tokens[name] ?? token), now);
}
