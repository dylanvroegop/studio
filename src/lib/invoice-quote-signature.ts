export function readPath(source: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
  ), source);
}

export function invoiceQuoteSignature(quote: Record<string, unknown>): string {
  const fields = [
    'amount', 'totaalbedrag', 'totaalInclBtw', 'totals.totaalInclBtw', 'totalsSnapshot.totaalInclBtw',
    'financieel.afgesprokenPrijsInclBtw', 'financialAdjustments.originalTotalInclBtw',
    'calculationSnapshot', 'instellingen', 'extras', 'offerteVersie', 'facturatie', 'klantinformatie',
  ];
  return JSON.stringify(fields.map((field) => readPath(quote, field)), (_key, value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]]));
  });
}
