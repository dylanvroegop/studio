import { sanitizeQuotePdfTextSettings } from './quote-pdf-text-settings';

const DEFAULT_STANDARD_HOURLY_RATE = 55;

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export interface EmptyQuoteDefaults {
    instellingen: { btwTarief: number; uurTariefExclBtw: number };
    extras: {
        transport: { mode: string; prijsPerKm?: number; vasteTransportkosten?: number };
        winstMarge: { mode: string; percentage?: number; fixedAmount?: number; basis?: string };
        materieel?: Array<Record<string, unknown>>;
        verzendkosten?: Array<Record<string, unknown>>;
    };
    pdfTeksten?: ReturnType<typeof sanitizeQuotePdfTextSettings>;
    algemeneVoorwaarden?: { titel?: string; tekst?: string; pdfUrl?: string; pdfBestandsnaam?: string };
}

/** Dezelfde standaardinstellingen voor handmatige offertes en klantgesprekken. */
export function buildEmptyQuoteDefaults(data: Record<string, unknown> = {}): EmptyQuoteDefaults {
    let settings: Record<string, unknown> = {
        standaardUurtarief: DEFAULT_STANDARD_HOURLY_RATE,
        standaardWinstMarge: { percentage: 10 },
        standaardTransport: { vasteTransportkosten: 45.00 }
    };
    let defaultPdfTeksten: ReturnType<typeof sanitizeQuotePdfTextSettings> | null = null;
    let defaultAlgemeneVoorwaarden: {
        titel?: string;
        tekst?: string;
        pdfUrl?: string;
        pdfBestandsnaam?: string;
    } | null = null;

    const legacySettings = record(data.settings);
    const nieuweInstellingen = record(data.instellingen);
    // Prefer explicit `instellingen`, fallback to legacy `settings`
    settings = { ...settings, ...legacySettings, ...nieuweInstellingen };

    // Keep the quote default in sync with both the current settings field
    // and legacy hourly-rate field names used by older user documents.
    const hourlyRateCandidates = [
        nieuweInstellingen?.standaardUurtarief,
        nieuweInstellingen?.standaardUurTarief,
        nieuweInstellingen?.uurTariefExclBtw,
        legacySettings?.standaardUurtarief,
        legacySettings?.standaardUurTarief,
        legacySettings?.uurTariefExclBtw,
        legacySettings?.uurTarief,
    ];
    const configuredHourlyRate = hourlyRateCandidates
        .map((value: unknown) => Number(value))
        .find((value: number) => Number.isFinite(value) && value > 0);
    if (configuredHourlyRate !== undefined) {
        settings.standaardUurtarief = configuredHourlyRate;
    }
    if (data?.defaultPdfTeksten) {
        defaultPdfTeksten = sanitizeQuotePdfTextSettings(data.defaultPdfTeksten);
    }
    if (data?.defaultAlgemeneVoorwaarden && typeof data.defaultAlgemeneVoorwaarden === 'object') {
        defaultAlgemeneVoorwaarden = {
            titel: String(record(data.defaultAlgemeneVoorwaarden).titel || 'ALGEMENE VOORWAARDEN'),
            tekst: String(record(data.defaultAlgemeneVoorwaarden).tekst || ''),
            pdfUrl: String(record(data.defaultAlgemeneVoorwaarden).pdfUrl || ''),
            pdfBestandsnaam: String(record(data.defaultAlgemeneVoorwaarden).pdfBestandsnaam || ''),
        };
    }
    const rawSettings = settings;
    const rawTransport = record(rawSettings.standaardTransport);
    const standardTransport = {
        mode: rawTransport.mode === 'none' || rawTransport.mode === 'perKm' || rawTransport.mode === 'fixed'
            ? rawTransport.mode
            : rawTransport.vasteTransportkosten != null
                ? 'fixed'
                : 'perKm',
        ...(rawTransport.prijsPerKm != null ? { prijsPerKm: Number(rawTransport.prijsPerKm) } : {}),
        ...(rawTransport.vasteTransportkosten != null ? { vasteTransportkosten: Number(rawTransport.vasteTransportkosten) } : {}),
    };
    const rawMargin = record(rawSettings.standaardWinstMarge);
    const standardMargin = {
        mode: rawMargin.mode === 'none' || rawMargin.mode === 'fixed' || rawMargin.mode === 'percentage'
            ? rawMargin.mode
            : rawMargin.fixedAmount != null
                ? 'fixed'
                : 'percentage',
        ...(rawMargin.percentage != null ? { percentage: Number(rawMargin.percentage) } : {}),
        ...(rawMargin.fixedAmount != null ? { fixedAmount: Number(rawMargin.fixedAmount) } : {}),
        ...(rawMargin.basis ? { basis: String(rawMargin.basis) } : {}),
    };

    const selectedPackageItems = (
        packages: unknown,
        selectedId: unknown,
    ): Array<Record<string, unknown>> => {
        if (!Array.isArray(packages)) return [];
        const selected = record(packages.find((pkg: unknown) => record(pkg).id === selectedId));
        if (!Array.isArray(selected?.items)) return [];
        return selected.items
            .map((value: unknown) => {
                const item = record(value);
                return ({
                id: String(item?.id ?? ''),
                naam: String(item?.naam ?? '').trim(),
                prijs: Number(item?.prijs),
                per: item?.per || 'klus',
                isVast: Boolean(item?.isVast),
            }); })
            .filter((item: Record<string, unknown>) => item.naam && Number.isFinite(item.prijs) && Number(item.prijs) > 0);
    };

    const standardBouwplaatsItems = selectedPackageItems(
        rawSettings.bouwplaatsKostenPakketten,
        rawSettings.bouwplaatsKostenStandaardId,
    );
    const standardVerzendItems = selectedPackageItems(
        rawSettings.verzendKostenPakketten,
        rawSettings.verzendKostenStandaardId,
    );

    return {
        instellingen: {
            btwTarief: 21,
            uurTariefExclBtw: Number(settings.standaardUurtarief ?? DEFAULT_STANDARD_HOURLY_RATE),
        },
        extras: {
            transport: standardTransport,
            winstMarge: standardMargin,
            ...(standardBouwplaatsItems.length > 0 ? { materieel: standardBouwplaatsItems } : {}),
            ...(standardVerzendItems.length > 0 ? { verzendkosten: standardVerzendItems } : {}),
        },
        ...(defaultPdfTeksten ? { pdfTeksten: defaultPdfTeksten } : {}),
        ...(defaultAlgemeneVoorwaarden ? { algemeneVoorwaarden: defaultAlgemeneVoorwaarden } : {}),
    };
}
