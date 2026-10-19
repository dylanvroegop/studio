function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

type QuoteTransportExtras = {
  mode?: unknown;
  prijsPerKm?: unknown;
  vasteTransportkosten?: unknown;
  tunnelkosten?: unknown;
};

type QuoteWinstMargeExtras = {
  mode?: unknown;
  percentage?: unknown;
  fixedAmount?: unknown;
  basis?: unknown;
};

type QuoteDataShape = {
  userId?: unknown;
  werkomschrijving?: unknown;
  klantinformatie?: unknown;
  instellingen?: {
    btwTarief?: unknown;
    uurTariefExclBtw?: unknown;
    uurTarief?: unknown;
    schattingUren?: unknown;
  };
  extras?: {
    transport?: QuoteTransportExtras;
    winstMarge?: QuoteWinstMargeExtras;
  };
};

export function buildManualDataJson(quoteData: QuoteDataShape): Record<string, unknown> {
  const instellingen = quoteData.instellingen ?? {};
  const transport = quoteData.extras?.transport ?? {};
  const winstMarge = quoteData.extras?.winstMarge ?? {};
  const werkomschrijving =
    typeof quoteData.werkomschrijving === 'string' ? quoteData.werkomschrijving.trim() : '';

  return {
    grootmaterialen: [],
    verbruiksartikelen: [],
    ...(werkomschrijving ? { werkomschrijving } : {}),
    klantinformatie: quoteData.klantinformatie ?? null,
    instellingen: {
      btwTarief: toFiniteNumber(instellingen?.btwTarief, 21),
      uurTariefExclBtw: toFiniteNumber(
        instellingen?.uurTariefExclBtw ?? instellingen?.uurTarief,
        50
      ),
      schattingUren: Boolean(instellingen?.schattingUren ?? false),
    },
    extras: {
      transport: {
        mode: typeof transport?.mode === 'string' ? transport.mode : 'fixed',
        prijsPerKm: toFiniteNumber(transport?.prijsPerKm, 0),
        vasteTransportkosten: toFiniteNumber(transport?.vasteTransportkosten, 0),
        tunnelkosten: toFiniteNumber(transport?.tunnelkosten, 0),
      },
      winstMarge: {
        mode: winstMarge?.mode === 'fixed' ? 'fixed' : 'percentage',
        percentage: toFiniteNumber(winstMarge?.percentage, 10),
        fixedAmount: toFiniteNumber(winstMarge?.fixedAmount, 0),
        basis: winstMarge?.basis === 'arbeid' || winstMarge?.basis === 'materiaal'
          ? winstMarge.basis
          : 'totaal',
      },
    },
  };
}
