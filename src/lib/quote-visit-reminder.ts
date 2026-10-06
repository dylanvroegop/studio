export interface VisitReminderQuote {
  id: string;
  clientId: string;
  clientName: string;
  status: string;
  archived: boolean;
  createdAt: Date | null;
}

export interface VisitReminderMeeting {
  id: string;
  quoteId: string;
  clientName: string;
  planningType: string;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  scheduledHours?: number;
}

export interface QuoteVisitReminder {
  quoteId: string;
  planningEntryId: string;
  visitedAt: string;
}

export const OPEN_VISIT_REMINDER_STATUSES = ['werkbespreking', 'concept', 'in_behandeling', 'in_afwachting'];
const CONFIRMED_MEETING_STATUSES = new Set(['scheduled', 'in_progress', 'completed']);

function normalizeName(value: string): string {
  return value.replace(/^\d{1,2}:\d{2}\s+/, '')
    .replace(/\s+\d{1,2}(?::\d{2})?$/, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

function validDate(value: Date | null): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function meetingEnd(meeting: VisitReminderMeeting): Date | null {
  if (!validDate(meeting.startDate)) return null;
  if (validDate(meeting.endDate) && meeting.endDate > meeting.startDate) return meeting.endDate;
  const hours = Number.isFinite(meeting.scheduledHours) && Number(meeting.scheduledHours) > 0
    ? Number(meeting.scheduledHours)
    : 1;
  return new Date(meeting.startDate.getTime() + hours * 3_600_000);
}

function hasOneClient(quotes: VisitReminderQuote[]): boolean {
  const ids = new Set(quotes.map((quote) => quote.clientId).filter(Boolean));
  const names = new Set(quotes.map((quote) => normalizeName(quote.clientName)).filter(Boolean));
  return ids.size <= 1 && names.size === 1;
}

function matchingQuotes(meeting: VisitReminderMeeting, quotes: VisitReminderQuote[]): VisitReminderQuote[] {
  if (meeting.quoteId) {
    const linkedQuote = quotes.find((quote) => quote.id === meeting.quoteId);
    if (!linkedQuote) return [];
    const name = normalizeName(linkedQuote.clientName);
    return quotes.filter((quote) => {
      if (quote.id === linkedQuote.id) return true;
      if (linkedQuote.clientId && quote.clientId) return linkedQuote.clientId === quote.clientId;
      return Boolean(name) && normalizeName(quote.clientName) === name;
    });
  }

  const name = normalizeName(meeting.clientName);
  if (!name) return [];
  // Gebruik ook verzonden en oude offertes bij de identiteitscontrole: een
  // gelijknamige klant mag niet verdwijnen doordat diens offerte al klaar is.
  const exact = quotes.filter((quote) => normalizeName(quote.clientName) === name);
  if (exact.length) return hasOneClient(exact) ? exact : [];
  if (name.includes(' ')) return [];
  const firstName = quotes.filter((quote) => normalizeName(quote.clientName).split(' ')[0] === name);
  return hasOneClient(firstName) ? firstName : [];
}

export function getQuoteVisitReminders(
  quotes: VisitReminderQuote[],
  meetings: VisitReminderMeeting[],
  acceptedQuoteIds: ReadonlySet<string> = new Set(),
  now = new Date(),
): QuoteVisitReminder[] {
  const nowMs = now.getTime();
  const reminders = new Map<string, QuoteVisitReminder>();
  const workMeetings = meetings.filter((meeting) => meeting.planningType === 'werkbespreking'
    && meeting.status !== 'cancelled' && validDate(meeting.startDate));

  for (const meeting of workMeetings) {
    const end = meetingEnd(meeting);
    if (!end || end.getTime() > nowMs || !CONFIRMED_MEETING_STATUSES.has(meeting.status)) continue;

    for (const quote of matchingQuotes(meeting, quotes)) {
      if (quote.archived || !OPEN_VISIT_REMINDER_STATUSES.includes(quote.status)
        || acceptedQuoteIds.has(quote.id)) continue;
      // Een oudere afspraak voor dezelfde klant is geen bewijs van bezoek voor
      // een later aangemaakte offerte. Een expliciete koppeling blijft leidend.
      if (meeting.quoteId !== quote.id && validDate(quote.createdAt) && quote.createdAt > end) continue;
      const hasNewerUnfinishedVisit = workMeetings.some((other) => other.quoteId === quote.id
        && other.startDate!.getTime() > meeting.startDate!.getTime()
        && (other.status === 'pending' || (meetingEnd(other)?.getTime() ?? Infinity) > nowMs));
      if (hasNewerUnfinishedVisit) continue;

      const previous = reminders.get(quote.id);
      if (!previous || previous.visitedAt < end.toISOString()) {
        reminders.set(quote.id, { quoteId: quote.id, planningEntryId: meeting.id, visitedAt: end.toISOString() });
      }
    }
  }

  return Array.from(reminders.values());
}
