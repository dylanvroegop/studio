export interface TimeTotals {
  workMinutes: number;
  supplierMinutes: number | null;
  driveMinutes: number | null;
  unsplitMinutes: number;
  entries: number;
}

/** Splits geregistreerde tijd zonder reistijd nogmaals als werktijd te tellen. */
export function summarizeTimeEntries(rows: Record<string, unknown>[]): TimeTotals {
  const result: TimeTotals = { workMinutes: 0, supplierMinutes: null, driveMinutes: null, unsplitMinutes: 0, entries: rows.length };
  const number = (value: unknown): number => Math.max(0, Number(value) || 0);
  for (const row of rows) {
    const keys = ['onsite_minutes', 'supplier_stop_minutes', 'outbound_travel_minutes', 'return_travel_minutes', 'client_transfer_minutes', 'supplier_travel_minutes'];
    const hasBreakdown = keys.some((key) => number(row[key]) > 0);
    const recorded = row.exact_minutes == null ? number(row.worked_hours) * 60 : number(row.exact_minutes);
    if (!hasBreakdown) {
      result.unsplitMinutes += recorded;
      continue;
    }
    const work = number(row.onsite_minutes);
    const supplier = number(row.supplier_stop_minutes);
    const drive = keys.slice(2).reduce((sum, key) => sum + number(row[key]), 0);
    result.workMinutes += work;
    result.supplierMinutes = (result.supplierMinutes ?? 0) + supplier;
    result.driveMinutes = (result.driveMinutes ?? 0) + drive;
    result.unsplitMinutes += Math.max(0, recorded - work - supplier - drive);
  }
  return result;
}
