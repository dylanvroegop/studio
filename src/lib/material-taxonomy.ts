export function normalizeTaxonomyLabel(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  return normalized.charAt(0).toLocaleUpperCase('nl-NL') + normalized.slice(1);
}

export function findExistingTaxonomyLabel(value: unknown, options: string[]): string {
  const normalized = normalizeTaxonomyLabel(value);
  if (!normalized) return '';

  const key = normalized.toLocaleLowerCase('nl-NL');
  const existing = options.find(
    (option) => normalizeTaxonomyLabel(option).toLocaleLowerCase('nl-NL') === key
  );

  return normalizeTaxonomyLabel(existing || normalized);
}

export function uniqueTaxonomyLabels(values: Array<unknown>): string[] {
  const labels = new Map<string, string>();

  values.forEach((value) => {
    const normalized = normalizeTaxonomyLabel(value);
    if (!normalized) return;
    const key = normalized.toLocaleLowerCase('nl-NL');
    if (!labels.has(key)) labels.set(key, normalized);
  });

  return Array.from(labels.values());
}
