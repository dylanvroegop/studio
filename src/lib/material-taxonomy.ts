export function normalizeTaxonomyLabel(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  if (/^(ak[24]|rk|osb|mdf|hpl|pir|sls|epdm|pvc)$/i.test(normalized)) return normalized.toUpperCase();
  return normalized.charAt(0).toLocaleUpperCase('nl-NL') + normalized.slice(1);
}

// Compacte indeling; oude categorieën uit werkpakketten blijven bruikbaar.
export function simplifyMaterialCategory(value: unknown): string {
  const label = normalizeTaxonomyLabel(value);
  const key = label.toLocaleLowerCase('nl-NL');
  if (key === 'hang- en sluitwerk') return 'Deuren en kozijnen';
  if (['gipsplaten', 'gipsafwerking'].includes(key)) return 'Gips';
  if ([
    'leidingwerk', 'tuin', 'schildermateriaal', 'lijm, kit en pur', 'glas',
    'bescherming en afdekken', 'betonpoer', 'bevestiging', 'gereedschap',
  ].includes(key)) return 'Overig';
  return label;
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

interface MaterialCategoryEntry {
  categorie?: string | null;
  subsectie?: string | null;
  sub_categorie?: string | null;
}

/** Alleen een eenduidige, bestaande hoofdgroep openen; nooit een fictieve categorie. */
export function resolveMaterialOpeningCategory(
  hint: string | string[] | undefined,
  materials: MaterialCategoryEntry[],
): string {
  const categories = uniqueTaxonomyLabels(materials.map((material) => material.categorie));
  const aliases: Record<string, string> = {
    binnendeur: 'Deuren en kozijnen', binnendeuren: 'Deuren en kozijnen',
    buitendeuren: 'Deuren en kozijnen', 'montage kozijnen': 'Deuren en kozijnen',
    kozijnhout: 'Deuren en kozijnen', deurbeslag: 'Deuren en kozijnen',
    'vuren hout': 'Hout', 'vuren ruw': 'Hout', 'vuren geschaafd': 'Hout',
    'hardhout geschaafd': 'Hout', merantie: 'Hout', 'ribben, sls, rachels': 'Hout',
    constructieplaten: 'Plaatmateriaal', 'interieur platen': 'Plaatmateriaal',
    'exterieur platen': 'Plaatmateriaal', underlayment: 'Plaatmateriaal',
    folieën: 'Folie en tape', dpc: 'Folie en tape',
    'plinten & koplatten': 'Aftimmering', vensterbanken: 'Aftimmering',
    epdm: 'Dakbedekking', dakpannen: 'Dakbedekking', golfplaten: 'Dakbedekking',
    keralit: 'Gevelbekleding', rockpanel: 'Gevelbekleding', trespa: 'Gevelbekleding',
    stucwerk: 'Overig', gipsafwerking: 'Overig',
  };
  const resolveOne = (raw: string): string => {
    const key = normalizeTaxonomyLabel(raw).toLocaleLowerCase('nl-NL');
    if (!key || key === 'all') return '';
    const exact = categories.find((category) => category.toLocaleLowerCase('nl-NL') === key);
    if (exact) return exact;
    const mapped = aliases[key] || simplifyMaterialCategory(raw);
    const category = categories.find((candidate) => candidate.toLocaleLowerCase('nl-NL') === mapped.toLocaleLowerCase('nl-NL'));
    if (category) return category;
    const parents = uniqueTaxonomyLabels(materials
      .filter((material) => normalizeTaxonomyLabel(material.sub_categorie ?? material.subsectie).toLocaleLowerCase('nl-NL') === key)
      .map((material) => material.categorie));
    return parents.length === 1 ? parents[0] : '';
  };
  // Sommige oude configuraties gebruiken een kommagescheiden lijst.
  const hints = Array.isArray(hint) ? hint : hint ? [hint] : [];
  const resolved = hints.flatMap((value) => {
    const direct = resolveOne(value);
    return direct ? [direct] : value.split(',').map(resolveOne);
  });
  if (!resolved.length || resolved.some((value) => !value)) return '';
  const unique = [...new Set(resolved)];
  return unique.length === 1 ? unique[0] : '';
}
