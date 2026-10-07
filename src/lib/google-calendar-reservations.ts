interface ReservationEntry {
  source?: unknown;
  leadKey?: unknown;
  status?: unknown;
  googleCalendarEventId?: unknown;
  calendarSyncState?: unknown;
  calendarSyncLeaseUntil?: unknown;
  updatedAt?: unknown;
}

export function reservationDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return reservationDate(value.toDate());
  }
  return null;
}

export function isTelegramReservation(entry: ReservationEntry): boolean {
  return entry.source === 'telegram_werkspot'
    || (typeof entry.leadKey === 'string' && entry.leadKey.startsWith('telegram_session_'));
}

export function reservationRefreshIsProtected(entry: ReservationEntry, refreshStartedAt: Date): boolean {
  const leaseUntil = reservationDate(entry.calendarSyncLeaseUntil);
  const changedAt = reservationDate(entry.updatedAt);
  return entry.calendarSyncState === 'pending' || entry.calendarSyncState === 'failed'
    || Boolean(leaseUntil && leaseUntil > new Date())
    || Boolean(changedAt && changedAt > refreshStartedAt);
}

export function googleAppointmentStatus(event: {
  summary?: string | null;
  description?: string | null;
  extendedProperties?: { private?: Record<string, string> | null } | null;
}, existingStatus?: string): 'pending' | 'scheduled' {
  const marker = event.extendedProperties?.private?.appointmentStatus;
  if (marker === 'confirmed') return 'scheduled';
  if (marker === 'pending' || /^PENDING\b/i.test(event.summary || '')
    || /(?:^|\n)\s*Status\s*:\s*pending\b/i.test(event.description || '')) return 'pending';
  if (/(?:^|\n)\s*Status\s*:\s*(?:confirmed|scheduled)\b/i.test(event.description || '')) return 'scheduled';
  // Alleen een titel wijzigen in Google bevestigt een klantafspraak nog niet.
  return existingStatus === 'pending' ? 'pending' : 'scheduled';
}

export function googleEventIsMissing(error: unknown): boolean {
  const failure = error as { code?: unknown; response?: { status?: unknown } } | null;
  const status = Number(failure?.response?.status || failure?.code);
  return status === 404 || status === 410;
}
