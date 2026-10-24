export const KOSTEN_REPORT_START = '2026-06-10';

export function reportMonths(today: string): string[] {
  const end = today.slice(0, 7);
  const result: string[] = [];
  const date = new Date(`${KOSTEN_REPORT_START.slice(0, 7)}-01T12:00:00Z`);
  while (date.toISOString().slice(0, 7) <= end) {
    result.push(date.toISOString().slice(0, 7));
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return result;
}

export function isReportDate(date: string | null | undefined, month: string, today: string): boolean {
  return Boolean(date && date >= KOSTEN_REPORT_START && date <= today && (month === 'all' || date.startsWith(month)));
}

export function isReportTimeEntry(row: Record<string, unknown>, today: string): boolean {
  return isReportDate(String(row.work_date || ''), 'all', today)
    && String(row.source || '').startsWith('gps_tracking_')
    && ['onsite_minutes', 'supplier_stop_minutes', 'outbound_travel_minutes', 'return_travel_minutes', 'client_transfer_minutes', 'supplier_travel_minutes'].some((key) => Number(row[key]) > 0);
}

export function reportEarnings(balance: number | null, minutes: number | null, months: number): {
  hourly: number | null; monthly: number | null; potentialMonthly: number | null; potentialTotal: number | null; potentialHours: number;
} {
  const hourly = balance !== null && minutes !== null && minutes > 0 ? balance / (minutes / 60) : null;
  return { hourly, monthly: balance !== null && months > 0 ? balance / months : null,
    potentialMonthly: hourly === null ? null : hourly * 240,
    potentialTotal: hourly === null ? null : hourly * 240 * months,
    potentialHours: 240 * months };
}

export function reportElapsed(today: string): { days: number; months: number; remainingDays: number } {
  const start = new Date(`${KOSTEN_REPORT_START}T00:00:00Z`);
  const end = new Date(`${today}T00:00:00Z`);
  if (end <= start) return { days: 0, months: 0, remainingDays: 0 };
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  if (end.getUTCDate() < start.getUTCDate()) months--;
  const anniversary = new Date(start);
  anniversary.setUTCMonth(anniversary.getUTCMonth() + months);
  return { days: Math.round((end.getTime() - start.getTime()) / 86400000), months,
    remainingDays: Math.round((end.getTime() - anniversary.getTime()) / 86400000) };
}
