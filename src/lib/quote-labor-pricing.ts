import { normalizeDataJson } from './quote-calculations';
import { parsePriceToNumber } from './utils';

export function getQuoteSnapshotRoots(data: any): any[] {
  const candidates = [
    data,
    data?.calculationSnapshot,
    data?.data_json,
    data?.calculation?.data_json,
  ];

  return candidates
    .filter((candidate) => candidate && typeof candidate === 'object')
    .map((candidate) => {
      try {
        return normalizeDataJson(candidate);
      } catch {
        return candidate;
      }
    })
    .filter(Boolean);
}

export interface QuoteLaborPricing {
  hourlyRate: number | null;
  vatRate: number;
}

export function getQuoteLaborPricing(quote: Record<string, any>, calculation?: unknown): QuoteLaborPricing {
  const roots = getQuoteSnapshotRoots(quote);
  if (calculation) roots.push(normalizeDataJson(calculation));
  let hourlyRate: number | null = null;
  for (const root of roots) {
    const rates = [root.instellingen?.uurTariefExclBtw, root.instellingen?.uurTarief, root.uurTariefExclBtw, root.uurTarief];
    hourlyRate = rates.map(parsePriceToNumber).find((n): n is number => n !== null && Number.isFinite(n) && n > 0) ?? null;
    if (hourlyRate !== null) break;
  }

  const settings = Object.assign({}, ...roots.map(root => root.instellingen).reverse());
  const exempt = settings.arbeidZonderBtw === true || settings.btwMode === 'materiaal_only';
  // Laag-btw-uren op de hoofdopdracht zijn al toegewezen. Nieuwe uren krijgen het algemene tarief.
  const vat = parsePriceToNumber(settings.btwTarief);
  return { hourlyRate, vatRate: exempt ? 0 : vat !== null && vat >= 0 && vat <= 100 ? vat : 21 };
}
