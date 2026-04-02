import { calculateQuoteTotals, normalizeDataJson, QuoteSettings } from '@/lib/quote-calculations';

type QuoteMetrics = {
    totalHours: number;
    totalEarnings: number;
};

function toNumber(value: unknown, fallback = 0): number {
    const n = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function asTransportMode(value: unknown): QuoteSettings['extras']['transport']['mode'] {
    return value === 'perKm' || value === 'vast' || value === 'fixed' || value === 'none'
        ? value
        : 'none';
}

function asMargeMode(value: unknown): QuoteSettings['extras']['winstMarge']['mode'] {
    return value === 'fixed' || value === 'percentage' ? value : 'percentage';
}

function asMargeBasis(value: unknown): QuoteSettings['extras']['winstMarge']['basis'] {
    return value === 'arbeid' || value === 'materiaal' || value === 'totaal' ? value : 'totaal';
}

export function getPlanningQuoteMetrics(dataJson: unknown): QuoteMetrics {
    const normalized = normalizeDataJson(dataJson);
    const rawInst = (normalized?.instellingen || {}) as Record<string, unknown>;
    const rawExtras = (normalized?.extras || {}) as Record<string, any>;

    const settings: QuoteSettings = {
        btwTarief: toNumber(rawInst?.btwTarief, 21),
        uurTariefExclBtw: toNumber(rawInst?.uurTariefExclBtw ?? rawInst?.uurTarief, 50),
        schattingUren: Boolean(rawInst?.schattingUren ?? false),
        extras: {
            transport: {
                prijsPerKm: toNumber(rawExtras?.transport?.prijsPerKm ?? (rawInst as any)?.extras?.transport?.prijsPerKm ?? rawInst?.transportPrijsPerKm, 0),
                vasteTransportkosten: toNumber(rawExtras?.transport?.vasteTransportkosten ?? (rawInst as any)?.extras?.transport?.vasteTransportkosten, 0),
                tunnelkosten: toNumber(rawExtras?.transport?.tunnelkosten ?? (rawInst as any)?.extras?.transport?.tunnelkosten, 0),
                mode: asTransportMode(rawExtras?.transport?.mode ?? (rawInst as any)?.extras?.transport?.mode),
            },
            winstMarge: {
                percentage: toNumber(rawExtras?.winstMarge?.percentage ?? (rawInst as any)?.extras?.winstMarge?.percentage ?? (rawInst as any)?.winstmarge_percentage, 10),
                fixedAmount: toNumber(rawExtras?.winstMarge?.fixedAmount ?? (rawInst as any)?.extras?.winstMarge?.fixedAmount, 0),
                mode: asMargeMode(rawExtras?.winstMarge?.mode ?? (rawInst as any)?.extras?.winstMarge?.mode),
                basis: asMargeBasis(rawExtras?.winstMarge?.basis ?? (rawInst as any)?.extras?.winstMarge?.basis),
            },
        },
    };

    const totals = calculateQuoteTotals(normalized, settings);
    const totalHours = Math.max(0, toNumber(normalized?.totaal_uren, 0));
    const vatMultiplier = 1 + (toNumber(settings.btwTarief, 21) / 100);
    const earningsExcl = Math.max(0, toNumber(totals.arbeidTotaal, 0) + toNumber(totals.winstMarge, 0));
    const totalEarnings = Math.max(0, earningsExcl * vatMultiplier);

    return { totalHours, totalEarnings };
}
