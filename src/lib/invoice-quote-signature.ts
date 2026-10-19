export function readPath(source: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
  ), source);
}

function normalizeSignatureValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(normalizeSignatureValue);
  const record = value as Record<string, unknown>;
  // Normaliseer vóór JSON.stringify: de browser- en Admin-SDK hebben een andere toJSON.
  if (typeof record.toMillis === 'function'
    && typeof record.seconds === 'number' && typeof record.nanoseconds === 'number') {
    return { seconds: record.seconds, nanoseconds: record.nanoseconds };
  }
  if (value instanceof Date) return value.toJSON();
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, normalizeSignatureValue(record[key])]));
}

export function invoiceQuoteSignature(quote: Record<string, unknown>): string {
  const fields = [
    'amount', 'totaalbedrag', 'totaalInclBtw', 'totals.totaalInclBtw', 'totalsSnapshot.totaalInclBtw',
    'financieel.afgesprokenPrijsInclBtw', 'financialAdjustments.originalTotalInclBtw',
    'calculationSnapshot', 'instellingen', 'extras', 'offerteVersie', 'facturatie', 'klantinformatie',
  ];
  return JSON.stringify(fields.map((field) => normalizeSignatureValue(readPath(quote, field))));
}
