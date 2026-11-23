import { getLocalDateKey } from './appointment-suggestions';
import { GOOGLE_CALENDAR_RED_COLOR_ID, GOOGLE_CALENDAR_YELLOW_COLOR_ID } from './planning-colors';

const clock = new Intl.DateTimeFormat('nl-NL', {
  timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

const minute = 60_000;
export const reminderInterval = 5 * minute;

interface DepartureEntry {
  id: string;
  quoteId?: string;
  start: Date;
  status?: string;
  planningType?: string;
  googleCalendarColorId?: string | null;
  isAllDay?: boolean;
  isGoogleCalendarHistory?: boolean;
  cache?: { projectAddress?: string; clientName?: string };
}

function isWorkMeeting(entry: DepartureEntry): boolean {
  return entry.planningType === 'werkbespreking'
    || entry.googleCalendarColorId === GOOGLE_CALENDAR_RED_COLOR_ID;
}

export function getDepartureTrips(entries: DepartureEntry[], now: Date) {
  const today = getLocalDateKey(now);
  const dayEntries = entries.filter(entry => !entry.isAllDay && !entry.isGoogleCalendarHistory
    && entry.status !== 'pending' && entry.status !== 'cancelled'
    && entry.googleCalendarColorId !== GOOGLE_CALENDAR_YELLOW_COLOR_ID
    && getLocalDateKey(entry.start) === today
  ).sort((a, b) => b.start.getTime() - a.start.getTime());

  return dayEntries.filter(meeting => isWorkMeeting(meeting) && meeting.status !== 'completed'
    && meeting.start > now && clock.format(meeting.start) >= '17:00').map(meeting => {
    const previous = dayEntries.find(entry => entry.start < meeting.start);
    return {
      meeting,
      origin: previous?.cache?.projectAddress?.trim() || '',
      destination: meeting.cache?.projectAddress?.trim() || '',
    };
  });
}

export function getDepartureReminder(start: Date, now: Date, driveMinutes: number | null) {
  const leaveAt = start.getTime() - (driveMinutes ?? 0) * minute;
  const remindAt = leaveAt - 60 * minute;
  // Laat de vijfminutencontrole vóór het gewenste meldingstijdstip afleveren.
  if (now.getTime() + reminderInterval <= remindAt || now.getTime() >= leaveAt) return null;
  if (driveMinutes === null) return { appointmentTime: clock.format(start), leaveTime: null };
  return { appointmentTime: clock.format(start), leaveTime: clock.format(leaveAt) };
}
