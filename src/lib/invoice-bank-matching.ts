export interface BankMatchInvoice {
  id: string;
  userId: string;
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
  mode: 'add' | 'link';
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

function sameName(left: string, right: string): boolean {
  const normalize = (value: string) => value.toLocaleLowerCase('nl-NL').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const a = normalize(left);
  const b = normalize(right);
  // Een naam is alleen een voorstel; ook een volledige naam is geen betaalbewijs.
  return a.length >= 5 && b.length >= 5 && (a === b || a.includes(b) || b.includes(a));
}

export function invoiceBankLinkedCents(
  invoiceId: string,
  allocations: ReadonlyMap<string, InvoiceBankAllocation[]>,
): number {
  return Array.from(allocations.values()).flat().filter((item) => item.invoiceId === invoiceId)
    .reduce((sum, item) => sum + item.amountCents, 0);
}

export function findInvoiceBankCandidates(options: {
  invoice: BankMatchInvoice;
  invoices: BankMatchInvoice[];
  credits: InvoiceBankCredit[];
  allocations: ReadonlyMap<string, InvoiceBankAllocation[]>;
}): InvoiceBankCandidate[] {
  const { invoice, invoices, credits, allocations } = options;
  if (!['verzonden', 'gedeeltelijk_betaald', 'betaald'].includes(invoice.status)) return [];
  const openCents = Math.max(0, invoice.totalCents - invoice.paidCents);
  const linkedCents = invoiceBankLinkedCents(invoice.id, allocations);
  const unlinkedPaid = Math.max(0, invoice.paidCents - linkedCents);
  const matches: InvoiceBankCandidate[] = [];
  for (const credit of credits) {
    if (credit.currency !== 'EUR' || credit.amountCents <= 0 || !credit.bookingDate || !invoice.issueDate) continue;
    if (credit.bookingDate < invoice.issueDate) continue;
    const assigned = allocations.get(credit.key) || [];
    const invoiceAssigned = assigned.filter((item) => item.invoiceId === invoice.id);
    const availableCents = credit.amountCents - assigned.reduce((sum, item) => sum + item.amountCents, 0);
    if (availableCents <= 0) continue;
    const referenced = invoices.filter((item) => hasInvoiceBankReference(credit.description, item.reference));
    const exact = referenced.some((item) => item.id === invoice.id);
    const nameAndAmount = sameName(invoice.clientName, credit.name) && availableCents === openCents;
    if (!exact && !(referenced.length === 0 && nameAndAmount)) continue;
    const suggestedCents = invoiceAssigned.some((item) => item.mode === 'add') ? 0 : Math.min(openCents, availableCents);
    const linkExistingCents = invoiceAssigned.some((item) => item.mode === 'link') ? 0 : Math.min(unlinkedPaid, availableCents);
    if (suggestedCents === 0 && linkExistingCents === 0) continue;
    const automatic = exact && referenced.length === 1 && assigned.length === 0
      && availableCents === openCents && invoice.paidCents === linkedCents && openCents > 0;
    matches.push({
      transactionId: credit.id, date: credit.bookingDate, name: credit.name,
      description: credit.description, amountCents: credit.amountCents, availableCents,
      suggestedCents, linkExistingCents, automatic,
      reason: unlinkedPaid > 0 ? 'Er is al handmatig een betaling geregistreerd.'
        : !exact ? 'Naam en bedrag komen overeen; controleer de betaler.'
          : referenced.length > 1 ? 'Deze betaling noemt meerdere facturen.'
            : availableCents !== openCents ? 'Het bedrag wijkt af van het openstaande bedrag.'
              : 'Factuurnummer en openstaand bedrag komen exact overeen.',
    });
  }
  // Twee losse stortingen met hetzelfde nummer/bedrag mogen niet willekeurig winnen.
  const exactFull = matches.filter((item) => item.automatic);
  if (exactFull.length > 1) exactFull.forEach((item) => {
    item.automatic = false;
    item.reason = 'Meerdere betalingen passen bij deze factuur.';
  });
  return matches;
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
  if (!['verzonden', 'gedeeltelijk_betaald', 'betaald'].includes(invoice.status)) throw new Error('Alleen een verzonden factuur kan een bankbetaling krijgen.');
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || credit.currency !== 'EUR') throw new Error('Ongeldig betaalbedrag.');
  if (existing.some((item) => item.invoiceId === invoice.id && item.mode === mode)) throw new Error('Deze betaling is al gekoppeld aan deze factuur.');
  const available = credit.amountCents - existing.reduce((sum, item) => sum + item.amountCents, 0);
  if (amountCents > available) throw new Error('Deze bankbetaling is inmiddels elders gekoppeld.');
  const maximum = mode === 'add' ? Math.max(0, invoice.totalCents - invoice.paidCents)
    : Math.max(0, invoice.paidCents - linkedCents);
  if (amountCents > maximum) throw new Error('Het factuurbedrag is gewijzigd. Vernieuw de betaalgegevens.');
}
