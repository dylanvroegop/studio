export const KOSTEN_REPORT_START = '2026-06-10';

/** Inclusieve datums: een deel van een kalendermaand telt naar verhouding mee. */
export function reportPeriodMonths(start: string, end: string): number {
  if (start > end) return 0;
  let result = 0;
  const cursor = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
  while (cursor.toISOString().slice(0, 10) <= end) {
    const first = cursor.toISOString().slice(0, 10);
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    const last = new Date(next.getTime() - 86400000).toISOString().slice(0, 10);
    const from = start > first ? start : first;
    const to = end < last ? end : last;
    result += (Date.parse(to) - Date.parse(from) + 86400000) / (next.getTime() - cursor.getTime());
    cursor.setTime(next.getTime());
  }
  return result;
}

export function reportOverlapFraction(start: string, end: string, periodStart: string, periodEnd: string): number {
  const from = start > periodStart ? start : periodStart;
  const to = end < periodEnd ? end : periodEnd;
  return from > to ? 0 : (Date.parse(to) - Date.parse(from) + 86400000) / (Date.parse(end) - Date.parse(start) + 86400000);
}

export function reportMonths(today: string, startDate = KOSTEN_REPORT_START): string[] {
  const end = today.slice(0, 7);
  const result: string[] = [];
  const date = new Date(`${startDate.slice(0, 7)}-01T12:00:00Z`);
  while (date.toISOString().slice(0, 7) <= end) {
    result.push(date.toISOString().slice(0, 7));
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return result;
}

export function isReportDate(date: string | null | undefined, month: string, today: string, startDate = KOSTEN_REPORT_START): boolean {
  return Boolean(date && date >= startDate && date <= today && (month === 'all' || date.startsWith(month)));
}

export function isReportTimeEntry(row: Record<string, unknown>, today: string, startDate = KOSTEN_REPORT_START): boolean {
  return isReportDate(String(row.work_date || ''), 'all', today, startDate)
    && String(row.source || '').startsWith('gps_tracking_')
    && ['onsite_minutes', 'supplier_stop_minutes', 'outbound_travel_minutes', 'return_travel_minutes', 'client_transfer_minutes', 'supplier_travel_minutes'].some((key) => Number(row[key]) > 0);
}

export function reportEarnings(balance: number | null, minutes: number | null, months: number, fixedCosts = 0, totalPotentialHours?: number | null): {
  hourly: number | null; monthly: number | null; potentialMonthly: number | null; potentialTotal: number | null; potentialHours: number; potentialHourly: number | null;
} {
  const hourly = balance !== null && minutes !== null && minutes > 0 ? balance / (minutes / 60) : null;
  const potentialHours = totalPotentialHours === undefined ? 240 * months : totalPotentialHours ?? NaN;
  // Tel de resterende vaste lasten terug vóór het schalen van de uren.
  // Trek daarna dezelfde lasten één keer af voor de gekozen kalenderperiode.
  const potentialTotal = hourly !== null && months > 0 && Number.isFinite(potentialHours) && potentialHours >= 0 && Number.isFinite(fixedCosts) && fixedCosts >= 0
    ? (balance! + fixedCosts) * potentialHours / (minutes! / 60) - fixedCosts : null;
  return { hourly, monthly: balance !== null && months > 0 ? balance / months : null,
    potentialMonthly: potentialTotal === null ? null : potentialTotal / months,
    potentialTotal, potentialHours,
    potentialHourly: potentialTotal === null || potentialHours <= 0 ? null : potentialTotal / potentialHours };
}

export function reportElapsed(today: string, startDate = KOSTEN_REPORT_START): { days: number; months: number; remainingDays: number } {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${today}T00:00:00Z`);
  if (end <= start) return { days: 0, months: 0, remainingDays: 0 };
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  if (end.getUTCDate() < start.getUTCDate()) months--;
  const anniversary = new Date(start);
  anniversary.setUTCDate(1);
  anniversary.setUTCMonth(anniversary.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(anniversary.getUTCFullYear(), anniversary.getUTCMonth() + 1, 0)).getUTCDate();
  anniversary.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return { days: Math.round((end.getTime() - start.getTime()) / 86400000), months,
    remainingDays: Math.round((end.getTime() - anniversary.getTime()) / 86400000) };
}

export function isValidReportStart(value: unknown, today: string): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > today) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
