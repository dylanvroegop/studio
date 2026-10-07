export interface WorkMeetingQuote {
  id: string;
  clientId: string;
  clientName: string;
  archived: boolean;
  status: string;
}

function normalizeName(value: string): string {
  return value.replace(/^\d{1,2}:\d{2}\s+/, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function findQuoteIdsForMeeting(
  meeting: { quoteId: string; clientName: string },
  quotes: WorkMeetingQuote[],
): string[] {
  const activeQuotes = quotes.filter((quote) => !quote.archived && quote.status === 'werkbespreking');
  const linkedQuote = meeting.quoteId ? quotes.find((quote) => quote.id === meeting.quoteId) : undefined;

  if (meeting.quoteId) {
    // Een expliciete koppeling bepaalt de klant, ook als de agendatitel afwijkt.
    if (!linkedQuote) return [];
    const name = normalizeName(linkedQuote.clientName);
    return activeQuotes.filter((quote) => {
      if (quote.id === linkedQuote.id) return true;
      if (linkedQuote.clientId && quote.clientId) return quote.clientId === linkedQuote.clientId;
      return Boolean(name) && normalizeName(quote.clientName) === name;
    }).map((quote) => quote.id);
  }

  const name = normalizeName(meeting.clientName);
  if (!name) return [];
  const exactMatches = activeQuotes.filter((quote) => normalizeName(quote.clientName) === name);
  if (exactMatches.length) return exactMatches.map((quote) => quote.id);

  const firstName = name.split(' ')[0];
  const firstNameMatches = activeQuotes.filter((quote) => normalizeName(quote.clientName).split(' ')[0] === firstName);
  // Meerdere offertes van dezelfde klant mogen mee; verschillende klanten
  // met alleen dezelfde voornaam blijven te onduidelijk om automatisch om te zetten.
  const names = new Set(firstNameMatches.map((quote) => normalizeName(quote.clientName)));
  const clientIds = new Set(firstNameMatches.map((quote) => quote.clientId).filter(Boolean));
  return names.size === 1 && clientIds.size <= 1 ? firstNameMatches.map((quote) => quote.id) : [];
}
