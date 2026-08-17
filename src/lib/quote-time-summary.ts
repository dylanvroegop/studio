export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatHoursCompact(hours: number): string {
  const safeHours = Math.max(0, Number.isFinite(hours) ? hours : 0);
  const wholeHours = Math.floor(safeHours);
  const minutes = Math.round((safeHours - wholeHours) * 60);
  if (minutes === 60) return `${wholeHours + 1}u`;
  if (wholeHours > 0 && minutes > 0) return `${wholeHours}u ${minutes}m`;
  return wholeHours > 0 ? `${wholeHours}u` : `${minutes}m`;
}

export function parseDurationToMinutes(value: unknown): number {
  if (typeof value !== 'string' || !value.trim()) return 0;
  const normalized = value.toLowerCase().replace(',', '.');
  const hours = Number(normalized.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours|uur|uren)/)?.[1] || 0);
  const minutes = Number(normalized.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)/)?.[1] || 0);
  if (hours > 0 || minutes > 0) return Math.round(hours * 60 + minutes);
  return Math.round(Number(normalized.match(/\d+(?:\.\d+)?/)?.[0] || 0));
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      return parseObject(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Returns the estimated round-trip driving time for the quote. The quote
 * calculation stores a one-way duration and the number of workdays is used
 * to turn that into the total project travel time.
 */
export function getQuoteDriveMinutes(
  dataJson: unknown,
  options?: { laborHoursPerDay?: number },
): number {
  const root = parseObject(dataJson);
  if (!root) return 0;

  const transport = parseObject(
    root.transport_berekening
      || root.transportBerekening
      || parseObject(root.extras)?.transport,
  );
  if (!transport) return 0;

  const explicitTotal = Number(
    transport.totalDurationMinutes
      ?? transport.durationTotalMinutes
      ?? transport.roundTripDurationTotalMinutes,
  );
  if (Number.isFinite(explicitTotal) && explicitTotal > 0) return Math.round(explicitTotal);

  const oneWayMinutes = Number(transport.durationMinOneWay) > 0
    ? Number(transport.durationMinOneWay)
    : parseDurationToMinutes(transport.durationText);
  if (!Number.isFinite(oneWayMinutes) || oneWayMinutes <= 0) return 0;

  const configuredHoursPerDay = Number(options?.laborHoursPerDay || 8);
  const hoursPerDay = Number.isFinite(configuredHoursPerDay) && configuredHoursPerDay > 0
    ? configuredHoursPerDay
    : 8;
  const quotedHours = Number(root.totaal_uren ?? root.totalHours ?? 0);
  const explicitDays = Number(
    transport.transportAantalDagen
      ?? transport.totalDays
      ?? root.transportAantalDagen,
  );
  const days = Number.isFinite(explicitDays) && explicitDays > 0
    ? explicitDays
    : Math.max(1, Math.ceil((Number.isFinite(quotedHours) ? quotedHours : 0) / hoursPerDay));

  return Math.round(oneWayMinutes * 2 * days);
}
