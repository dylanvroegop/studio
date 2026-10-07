import { calculateQuoteTotals, normalizeDataJson, type DataJson, type QuoteSettings as CalculationQuoteSettings } from '@/lib/quote-calculations';

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function resolveTotalFromQuote(quote: any): number {
  if (!quote) return 0;

  const candidates = [
    quote?.financieel?.afgesprokenPrijsInclBtw,
    quote?.amount,
    quote?.totaalbedrag,
    quote?.totaalInclBtw,
    quote?.totals?.totaalInclBtw,
    quote?.totalsSnapshot?.totaalInclBtw,
    quote?.financialAdjustments?.originalTotalInclBtw,
    quote?.calculationSnapshot?.totals?.totaalInclBtw,
  ];

  for (const candidate of candidates) {
    const n = toNumber(candidate);
    if (n !== null && n > 0) return n;
  }

  return 0;
}

function mapSettingsForTotals(input: unknown, quote?: any): CalculationQuoteSettings {
  const normalized = normalizeDataJson(input as any);
  const rawInst = (normalized?.instellingen || {}) as any;
  const rawExtras = (normalized?.extras || {}) as any;
  const quoteInst = (quote?.instellingen || {}) as any;
  const quoteExtras = (quote?.extras || {}) as any;

  return {
    btwTarief: quoteInst?.btwTarief ?? rawInst?.btwTarief ?? 21,
    btwMode: quoteInst?.btwMode ?? rawInst?.btwMode ?? 'normaal',
    arbeidZonderBtw: quoteInst?.arbeidZonderBtw ?? rawInst?.arbeidZonderBtw ?? false,
    arbeidBtwLaagUren: quoteInst?.arbeidBtwLaagUren ?? rawInst?.arbeidBtwLaagUren ?? 0,
    arbeidBtwLaagTarief: quoteInst?.arbeidBtwLaagTarief ?? rawInst?.arbeidBtwLaagTarief ?? 9,
    uurTariefExclBtw: quoteInst?.uurTariefExclBtw ?? quoteInst?.uurTarief ?? rawInst?.uurTariefExclBtw ?? rawInst?.uurTarief ?? 50,
    schattingUren: quoteInst?.schattingUren ?? rawInst?.schattingUren ?? false,
    extras: {
      transport: {
        prijsPerKm: quoteExtras?.transport?.prijsPerKm ?? quoteInst?.extras?.transport?.prijsPerKm ?? rawExtras?.transport?.prijsPerKm ?? rawInst?.extras?.transport?.prijsPerKm ?? rawInst?.transportPrijsPerKm,
        vasteTransportkosten: quoteExtras?.transport?.vasteTransportkosten ?? quoteInst?.extras?.transport?.vasteTransportkosten ?? rawExtras?.transport?.vasteTransportkosten ?? rawInst?.extras?.transport?.vasteTransportkosten,
        tunnelkosten: quoteExtras?.transport?.tunnelkosten ?? quoteInst?.extras?.transport?.tunnelkosten ?? rawExtras?.transport?.tunnelkosten ?? rawInst?.extras?.transport?.tunnelkosten,
        mode: quoteExtras?.transport?.mode
          ?? (quoteInst?.reiskosten_type === 'vast'
            ? 'vast'
            : quoteInst?.reiskosten_type === 'perKm'
              ? 'perKm'
              : quoteInst?.extras?.transport?.mode)
          ?? rawExtras?.transport?.mode
          ?? rawInst?.extras?.transport?.mode,
      },
      winstMarge: {
        percentage: quoteExtras?.winstMarge?.percentage ?? quoteInst?.extras?.winstMarge?.percentage ?? rawExtras?.winstMarge?.percentage ?? rawInst?.extras?.winstMarge?.percentage ?? 10,
        fixedAmount: quoteExtras?.winstMarge?.fixedAmount ?? quoteInst?.extras?.winstMarge?.fixedAmount ?? rawExtras?.winstMarge?.fixedAmount ?? 0,
        mode: quoteExtras?.winstMarge?.mode ?? quoteInst?.extras?.winstMarge?.mode ?? rawExtras?.winstMarge?.mode ?? 'percentage',
        basis: quoteExtras?.winstMarge?.basis ?? quoteInst?.extras?.winstMarge?.basis ?? rawExtras?.winstMarge?.basis ?? 'totaal',
      },
    },
  };
}

export function resolveTotalFromCalculation(dataJson: unknown, quote?: any, laborHoursPerDay = 8): number | null {
  if (!dataJson) return null;

  try {
    const settings = mapSettingsForTotals(dataJson, quote);
    const totals = calculateQuoteTotals(dataJson as any, settings, laborHoursPerDay);
    const total = toNumber(totals?.totaalInclBtw);
    if (total !== null && total > 0) return total;
  } catch {
    // Fallback candidates below handle malformed shapes.
  }

  const normalized = normalizeDataJson(dataJson as any) as any;
  const candidates = [
    normalized?.totaalInclBtw,
    normalized?.totaal_incl_btw,
    normalized?.totals?.totaalInclBtw,
    normalized?.totals?.totaal_incl_btw,
    (dataJson as any)?.totaalInclBtw,
    (dataJson as any)?.totaal_incl_btw,
    (dataJson as any)?.totals?.totaalInclBtw,
    (dataJson as any)?.totals?.totaal_incl_btw,
  ];

  for (const candidate of candidates) {
    const n = toNumber(candidate);
    if (n !== null && n > 0) return n;
  }

  return null;
}

export function resolveInvoiceTotal(quote: any, calculation: unknown, laborHoursPerDay = 8): number {
  const agreed = toNumber(quote?.financieel?.afgesprokenPrijsInclBtw);
  if (agreed !== null && agreed >= 0) return agreed;
  return resolveTotalFromCalculation(calculation, quote, laborHoursPerDay) ?? resolveTotalFromQuote(quote);
}

/** Bewaar exact dezelfde rekeninstellingen als bij het controleren van de factuur. */
export function freezeInvoiceCalculation(calculation: unknown, quote: any, laborHoursPerDay = 8): DataJson | null {
  if (!calculation) return null;
  const normalized = normalizeDataJson(calculation as DataJson);
  if (!normalized) return null;
  const effective = mapSettingsForTotals(normalized, quote);
  return {
    ...normalized,
    instellingen: { ...normalized.instellingen, ...quote?.instellingen, ...effective },
    extras: { ...normalized.extras, ...quote?.extras, ...effective.extras },
    urenPerDag: laborHoursPerDay,
    klantinformatie: quote?.klantinformatie || (normalized as any).klantinformatie,
  } as DataJson;
}
