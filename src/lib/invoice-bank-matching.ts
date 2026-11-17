export interface BankMatchInvoice {
  id: string;
  userId: string;
  invoiceType?: string;
  quoteNumber?: string;
  quoteDate?: string | null;
  reference: string;
  status: string;
  totalCents: number;
  paidCents: number;
  issueDate: string | null;
  clientName: string;
}

export interface InvoiceBankCredit {
  id: string;
  key: string;
  amountCents: number;
  currency: string;
  bookingDate: string | null;
  name: string;
  description: string;
}

export interface InvoiceBankAllocation {
  invoiceId: string;
  amountCents: number;
  mode: 'add' | 'link' | 'advance';
}

export interface InvoiceBankCandidate {
  transactionId: string;
  date: string;
  name: string;
  description: string;
  amountCents: number;
  availableCents: number;
  suggestedCents: number;
  linkExistingCents: number;
  automatic: boolean;
  reason: string;
}

export interface InvoiceBankView {
  status: string;
  paidCents: number;
  receipts: { id: string; date: string | null; name: string; amountCents: number; description: string }[];
  connected: boolean;
  lastSyncedAt: string | null;
  linkedCents: number;
  openCents: number;
  unlinkedPaidCents: number;
  candidates: InvoiceBankCandidate[];
}

export function invoiceBankCents(value: unknown): number {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

/** Het volledige factuurnummer moet herkenbaar blijven, ook bij een prefix. */
export function hasInvoiceBankReference(description: string, reference: string): boolean {
  const clean = reference.trim();
  if (clean.length < 4) return false;
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(description);
}

function mentionsInvoice(description: string, invoice: BankMatchInvoice): boolean {
  if (hasInvoiceBankReference(description, invoice.reference)) return true;
  const digits = invoice.invoiceType === 'voorschot' && invoice.reference.match(/\d{4,}$/)?.[0];
  return !!digits && new RegExp(`(^|[^a-z0-9-])${digits}($|[^a-z0-9-])`, 'i').test(description);
}

function normalizedWords(value: string): string[] {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9]+/g) || [];
}

function sameName(left: string, right: string): boolean {
  const a = normalizedWords(left).join(' ');
  const b = normalizedWords(right).join(' ');
  return a.length >= 5 && b.length >= 5 && (a === b || a.includes(b) || b.includes(a));
}

const commonWords = new Set(['van', 'der', 'den', 'het', 'een', 'mevrouw', 'meneer', 'familie',
  'onbekende', 'klant', 'knab', 'beheer', 'holding', 'groep', 'company', 'services', 'betaling', 'voorschot']);

/** Ook de betaler in de omschrijving van een Knab-betaalverzoek meenemen. */
function advanceNameMatches(names: string[], credit: InvoiceBankCredit): boolean {
  const words = new Set(normalizedWords(credit.name + ' ' + credit.description));
  return names.some((name) => {
    const tokens = normalizedWords(name).filter((word) => word.length >= 2 && !commonWords.has(word) && !['bv', 'nv', 'vof'].includes(word));
    const last = tokens.at(-1);
    return !!last && (words.has(last) && last.length >= 3 || tokens.length > 1 && tokens.every((token) => words.has(token)));
  });
}

export interface QuoteAdvanceCandidate {
  transactionId: string;
  date: string;
  name: string;
  description: string;
  amountCents: number;
  reason: string;
  numberMatch: boolean;
}

export function findQuoteAdvanceCandidates(options: {
  quoteNumber: string; names: string[]; quoteDate: string | null;
  credits: InvoiceBankCredit[]; invoices: BankMatchInvoice[]; allocations: ReadonlyMap<string, InvoiceBankAllocation[]>;
}): QuoteAdvanceCandidate[] {
  const { quoteNumber, names, quoteDate, invoices, allocations, credits } = options;
  const result: QuoteAdvanceCandidate[] = [];
  const seen = new Set<string>();
  for (const credit of credits) {
    if (seen.has(credit.key) || !credit.bookingDate || credit.currency !== 'EUR' || credit.amountCents <= 0
      || (allocations.get(credit.key) || []).length) continue;
    const numberMatch = hasInvoiceBankReference(credit.description, quoteNumber);
    const nameMatch = advanceNameMatches(names, credit);
    if (!numberMatch && (!nameMatch || (quoteDate && credit.bookingDate < quoteDate))) continue;
    if (invoices.some((row) => row.status !== 'geannuleerd' && (mentionsInvoice(credit.description, row)
      || (row.quoteNumber && row.quoteNumber !== quoteNumber && hasInvoiceBankReference(credit.description, row.quoteNumber))))) continue;
    seen.add(credit.key);
    result.push({ transactionId: credit.id, date: credit.bookingDate, name: credit.name, description: credit.description,
      amountCents: credit.amountCents, numberMatch,
      reason: numberMatch ? (nameMatch ? 'Offertenummer en klantnaam' : 'Offertenummer') : 'Klantnaam' });
  }
  return result.sort((a, b) => Number(b.numberMatch) - Number(a.numberMatch) || b.date.localeCompare(a.date));
}

export function invoiceBankLinkedCents(
  invoiceId: string,
  allocations: ReadonlyMap<string, InvoiceBankAllocation[]>,
): number {
  return Array.from(allocations.values()).flat().filter((item) => item.invoiceId === invoiceId && item.mode !== 'advance')
    .reduce((sum, item) => sum + item.amountCents, 0);
}

export function findInvoiceBankCandidates(options: {
  invoice: BankMatchInvoice;
  invoices: BankMatchInvoice[];
  credits: InvoiceBankCredit[];
  allocations: ReadonlyMap<string, InvoiceBankAllocation[]>;
}): InvoiceBankCandidate[] {
  const { invoice, invoices, credits, allocations } = options;
  if (!['concept', 'verzonden', 'gedeeltelijk_betaald', 'betaald'].includes(invoice.status)) return [];
  const openCents = Math.max(0, invoice.totalCents - invoice.paidCents);
  const linkedCents = invoiceBankLinkedCents(invoice.id, allocations);
  const unlinkedPaid = Math.max(0, invoice.paidCents - linkedCents);
  if (!openCents && !unlinkedPaid) return [];
  const matches: InvoiceBankCandidate[] = [];
  for (const credit of credits) {
    if (credit.currency !== 'EUR' || credit.amountCents <= 0 || !credit.bookingDate || !invoice.issueDate) continue;
    const advance = invoice.invoiceType === 'voorschot';
    const quoteMatch = advance && hasInvoiceBankReference(credit.description, invoice.quoteNumber || '');
    const beforeIssue = credit.bookingDate < invoice.issueDate;
    if (beforeIssue && (!advance || (invoice.quoteDate && credit.bookingDate < invoice.quoteDate))) continue;
    const assigned = allocations.get(credit.key) || [];
    const invoiceAssigned = assigned.filter((item) => item.invoiceId === invoice.id);
    const availableCents = credit.amountCents - assigned.reduce((sum, item) => sum + item.amountCents, 0);
    if (availableCents <= 0) continue;
    const exact = mentionsInvoice(credit.description, invoice);
    const nameAndAmount = invoice.clientName !== 'Onbekende klant' && sameName(invoice.clientName, credit.name) && availableCents === openCents;
    const nameMatch = advance && advanceNameMatches([invoice.clientName], credit);
    if (!exact && !quoteMatch && !nameMatch && !nameAndAmount) continue;
    const referenced = invoices.filter((item) => mentionsInvoice(credit.description, item));
    const otherQuote = invoices.some((other) => other.quoteNumber && other.quoteNumber !== invoice.quoteNumber
      && hasInvoiceBankReference(credit.description, other.quoteNumber));
    if (!exact && (referenced.length > 0 || otherQuote)) continue;
    const uniqueReference = exact ? referenced.length === 1
      : quoteMatch && !invoices.some((other) => other.id !== invoice.id && other.status !== 'geannuleerd'
        && other.quoteNumber === invoice.quoteNumber);
    const suggestedCents = invoiceAssigned.some((item) => item.mode === 'add') ? 0 : Math.min(openCents, availableCents);
    const linkExistingCents = invoiceAssigned.some((item) => item.mode === 'link') ? 0 : Math.min(unlinkedPaid, availableCents);
    if (suggestedCents === 0 && linkExistingCents === 0) continue;
    const automatic = uniqueReference && (!beforeIssue || quoteMatch) && !otherQuote && assigned.length === 0 && invoice.paidCents === linkedCents
      && availableCents <= openCents && (advance || availableCents === openCents);
    matches.push({
      transactionId: credit.id, date: credit.bookingDate, name: credit.name,
      description: credit.description, amountCents: credit.amountCents, availableCents,
      suggestedCents, linkExistingCents, automatic,
      reason: unlinkedPaid > 0 ? 'Er is al handmatig een betaling geregistreerd.'
        : !exact && !quoteMatch ? 'Klantnaam komt overeen. Controleer de betaler.'
          : !uniqueReference || otherQuote ? 'De omschrijving kan bij meerdere facturen horen.'
            : quoteMatch && !exact ? 'Offertenummer van het voorschot komt overeen.'
              : availableCents !== openCents ? 'Factuurnummer komt overeen. Het bedrag wijkt af van het openstaande bedrag.'
                : 'Factuurnummer en openstaand bedrag komen exact overeen.',
    });
  }
  // Twee losse stortingen met hetzelfde nummer/bedrag mogen niet willekeurig winnen.
  const numbered = matches.filter((item) => mentionsInvoice(item.description, invoice)
    || (invoice.invoiceType === 'voorschot' && hasInvoiceBankReference(item.description, invoice.quoteNumber || '')));
  if (numbered.length > 1 && numbered.reduce((sum, item) => sum + item.availableCents, 0) > openCents) numbered.forEach((item) => {
    item.automatic = false;
    item.reason = 'Meerdere betalingen passen bij deze factuur.';
  });
  return matches.sort((a, b) => Number(b.automatic) - Number(a.automatic) || b.date.localeCompare(a.date));
}

/** Alle grenzen opnieuw toetsen binnen dezelfde transactie als de boeking. */
export function validateInvoiceBankAllocation(options: {
  invoice: BankMatchInvoice;
  credit: InvoiceBankCredit;
  existing: InvoiceBankAllocation[];
  linkedCents: number;
  amountCents: number;
  mode: 'add' | 'link';
}): void {
  const { invoice, credit, existing, linkedCents, amountCents, mode } = options;
  if (!['concept', 'verzonden', 'gedeeltelijk_betaald', 'betaald'].includes(invoice.status)) throw new Error('Deze factuurstatus kan geen bankbetaling krijgen.');
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || credit.currency !== 'EUR') throw new Error('Ongeldig betaalbedrag.');
  if (existing.some((item) => item.invoiceId === invoice.id && item.mode === mode)) throw new Error('Deze betaling is al gekoppeld aan deze factuur.');
  const available = credit.amountCents - existing.reduce((sum, item) => sum + item.amountCents, 0);
  if (amountCents > available) throw new Error('Deze bankbetaling is inmiddels elders gekoppeld.');
  const maximum = mode === 'add' ? Math.max(0, invoice.totalCents - invoice.paidCents)
    : Math.max(0, invoice.paidCents - linkedCents);
  if (amountCents > maximum) throw new Error('Het factuurbedrag is gewijzigd. Vernieuw de betaalgegevens.');
}

/** Leescontrole voor het overzicht; boekt of wijzigt geen betalingen. */
export function isInvoiceBankVerified(options: {
  invoice: BankMatchInvoice;
  invoices: BankMatchInvoice[];
  credits: InvoiceBankCredit[];
  allocations: ReadonlyMap<string, InvoiceBankAllocation[]>;
}): boolean {
  const { invoice, invoices, credits, allocations } = options;
  if (!['concept', 'verzonden', 'gedeeltelijk_betaald', 'betaald'].includes(invoice.status)
    || invoice.totalCents <= 0) return false;

  // Alleen toewijzingen die nog door de echte banktransactie gedekt zijn.
  let confirmedCents = 0;
  const seen = new Set<string>();
  for (const credit of credits) {
    if (seen.has(credit.key)) continue;
    seen.add(credit.key);
    const assigned = allocations.get(credit.key) || [];
    if (credit.currency !== 'EUR' || credit.amountCents <= 0
      || assigned.some((item) => !Number.isSafeInteger(item.amountCents) || item.amountCents <= 0)
      || assigned.reduce((sum, item) => sum + item.amountCents, 0) > credit.amountCents) continue;
    confirmedCents += assigned.filter((item) => item.invoiceId === invoice.id && item.mode !== 'advance')
      .reduce((sum, item) => sum + item.amountCents, 0);
  }
  if (confirmedCents === invoice.totalCents) return true;
  if (invoiceBankLinkedCents(invoice.id, allocations) > 0 || !invoice.issueDate) return false;

  // Ook handmatig betaalde facturen kunnen zo bewijs krijgen, zonder dubbel te boeken.
  const matchingKeys = new Set(credits.filter((credit) => {
    if (credit.currency !== 'EUR' || credit.amountCents !== invoice.totalCents
      || !credit.bookingDate || credit.bookingDate < invoice.issueDate!
      || (allocations.get(credit.key) || []).length > 0) return false;
    const referenced = invoices.filter((item) => mentionsInvoice(credit.description, item));
    return referenced.length === 1 && referenced[0].id === invoice.id;
  }).map((credit) => credit.key));
  return matchingKeys.size === 1;
}
