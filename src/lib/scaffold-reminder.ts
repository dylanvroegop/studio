export interface ScaffoldPlanning {
  id: string;
  quoteId: string;
  planningType?: string;
  status: string;
  startDate: Date | null;
}

export interface ScaffoldQuote {
  id: string;
  enabled: boolean;
  archived: boolean;
  status: string;
  client: string;
  title: string;
  number: string;
}

export interface ScaffoldReminder {
  quoteId: string;
  startDay: string;
  dueDay: string;
  text: string;
}

export function amsterdamDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function scaffoldReminders(quotes: ScaffoldQuote[], planning: ScaffoldPlanning[], now = new Date()): ScaffoldReminder[] {
  const today = amsterdamDay(now);
  const clean = (value: string): string => value.replace(/\s+/g, ' ').trim().slice(0, 200);
  return quotes.flatMap(quote => {
    if (!quote.enabled || quote.archived || ['afgewezen', 'verlopen', 'cancelled', 'completed'].includes(quote.status)) return [];
    // Neem ook eerdere werkdagen mee: een vervolgdag is geen nieuwe klusstart.
    const entries = planning.filter(entry => entry.quoteId === quote.id
      && (entry.planningType === undefined || entry.planningType === 'job')
      && ['scheduled', 'in_progress', 'completed'].includes(entry.status));
    if (!entries.length || entries.some(entry => !entry.startDate || !Number.isFinite(entry.startDate.getTime()))) return [];
    const first = entries.reduce((a, b) => a.startDate!.getTime() <= b.startDate!.getTime() ? a : b);
    if (first.status !== 'scheduled') return [];
    const startDay = amsterdamDay(first.startDate!);
    // Kalenderdagen, onafhankelijk van de overgang naar zomer- of wintertijd.
    const due = new Date(startDay + 'T12:00:00Z');
    due.setUTCDate(due.getUTCDate() - 14);
    const dueDay = due.toISOString().slice(0, 10);
    if (today < dueDay || today >= startDay) return [];
    const date = startDay.split('-').reverse().join('-');
    return [{ quoteId: quote.id, startDay, dueDay,
      text: `🔔 Steiger reserveren\n\n${clean(quote.client) || 'Onbekende klant'} — offerte ${clean(quote.number)}\n${clean(quote.title) || 'Klus'}\nStart klus: ${date}\n\nReserveer de steiger voor deze klus.\nhttps://app.calvora.nl/offertes/${encodeURIComponent(quote.id)}`,
    }];
  });
}
