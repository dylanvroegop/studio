export interface QuoteSettings {
    btwTarief: number;
    uurTariefExclBtw: number;
    schattingUren?: boolean;
    extras: {
        transport: {
            prijsPerKm: number;
            mode: 'perKm' | 'vast';
        };
        winstMarge: {
            percentage: number;
            mode: 'percentage' | 'vast';
        };
    };
}

export interface KlantInformatie {
    klanttype: 'Particulier' | 'Zakelijk';
    voornaam: string;
    achternaam: string;
    bedrijfsnaam?: string;
    emailadres: string;
    telefoonnummer: string;
    straat: string;
    huisnummer: string;
    postcode: string;
    plaats: string;
    afwijkendProjectadres: boolean;
    projectAdres?: {
        straat: string;
        huisnummer: string;
        postcode: string;
        plaats: string;
    };
}

export interface CalculationResult {
    materialenGroot: number;
    materialenVerbruik: number;
    materialenTotaal: number;
    arbeidTotaal: number;
    transportTotaal: number;
    subtotaalExclBtw: number;
    winstMarge: number;
    totaalExclBtw: number;
    btw: number;
    totaalInclBtw: number;
}

export interface MaterialItem {
    aantal: number;
    product: string;
    prijs_per_stuk?: number;
    totaal_prijs?: number;
}

export interface UrenItem {
    taak: string;
    uren: number;
}

export interface DataJson {
    totaal_uren: number;
    grootmaterialen: MaterialItem[];
    verbruiksartikelen: MaterialItem[];
    werkbeschrijving: string[];
    uren_specificatie: UrenItem[];
    // Optional fields that might be present in the JSON blob
    klantinformatie?: KlantInformatie;
    instellingen?: any; // Using any for now to avoid circular dependency or complex type mapping if not strictly needed here
}

export function calculateQuoteTotals(
    dataJson: DataJson,
    settings: QuoteSettings,
    transportKm: number = 0
): CalculationResult {
    // Sum groot materialen
    const materialenGroot = dataJson.grootmaterialen.reduce(
        (sum, item) => {
            const itemTotal = item.totaal_prijs ?? (item.prijs_per_stuk ?? 0) * item.aantal;
            return sum + itemTotal;
        },
        0
    );

    // Sum verbruiksartikelen
    const materialenVerbruik = dataJson.verbruiksartikelen.reduce(
        (sum, item) => {
            const itemTotal = item.totaal_prijs ?? (item.prijs_per_stuk ?? 0) * item.aantal;
            return sum + itemTotal;
        },
        0
    );

    const materialenTotaal = materialenGroot + materialenVerbruik;

    // Labor calculation
    const arbeidTotaal = dataJson.totaal_uren * settings.uurTariefExclBtw;

    // Transport calculation
    const transportTotaal = settings.extras.transport.mode === 'perKm'
        ? transportKm * settings.extras.transport.prijsPerKm
        : 0;

    // Subtotal before margin
    const subtotaalExclBtw = materialenTotaal + arbeidTotaal + transportTotaal;

    // Margin calculation
    const winstMarge = settings.extras.winstMarge.mode === 'percentage'
        ? subtotaalExclBtw * (settings.extras.winstMarge.percentage / 100)
        : settings.extras.winstMarge.percentage;

    // Final totals
    const totaalExclBtw = subtotaalExclBtw + winstMarge;
    const btw = totaalExclBtw * (settings.btwTarief / 100);
    const totaalInclBtw = totaalExclBtw + btw;

    return {
        materialenGroot,
        materialenVerbruik,
        materialenTotaal,
        arbeidTotaal,
        transportTotaal,
        subtotaalExclBtw,
        winstMarge,
        totaalExclBtw,
        btw,
        totaalInclBtw,
    };
}

export function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('nl-NL', {
        style: 'currency',
        currency: 'EUR',
    }).format(amount);
}

export function formatNumber(num: number, decimals: number = 1): string {
    return new Intl.NumberFormat('nl-NL', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(num);
}

// Generate a summary description from werkbeschrijving array
export function generateWorkSummary(werkbeschrijving: string[], maxLength: number = 500): string {
    const summary = werkbeschrijving.slice(0, 5).join(' ');
    return summary.length > maxLength
        ? summary.substring(0, maxLength - 3) + '...'
        : summary;
}
