export interface QuoteSettings {
    btwTarief: number;
    uurTariefExclBtw: number;
    schattingUren?: boolean;
    extras: {
        transport: {
            prijsPerKm: number;
            vasteTransportkosten?: number;
            mode: 'perKm' | 'vast' | 'fixed' | 'none';
        };
        winstMarge: {
            percentage: number;
            fixedAmount?: number;
            mode: 'percentage' | 'vast' | 'fixed' | 'none';
            basis: 'totaal' | 'materialen' | 'materialen_arbeid';
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
    const materialenGroot = (dataJson.grootmaterialen || []).reduce(
        (sum, item) => {
            const itemTotal = item.totaal_prijs ?? (item.prijs_per_stuk ?? 0) * item.aantal;
            return sum + itemTotal;
        },
        0
    );

    // Sum verbruiksartikelen
    const materialenVerbruik = (dataJson.verbruiksartikelen || []).reduce(
        (sum, item) => {
            const itemTotal = item.totaal_prijs ?? (item.prijs_per_stuk ?? 0) * item.aantal;
            return sum + itemTotal;
        },
        0
    );

    const materialenTotaal = materialenGroot + materialenVerbruik;

    // Labor calculation
    const arbeidTotaal = (dataJson.totaal_uren || 0) * settings.uurTariefExclBtw;

    // Transport calculation
    let transportTotaal = 0;
    if (settings.extras.transport.mode === 'perKm') {
        transportTotaal = transportKm * settings.extras.transport.prijsPerKm;
    } else if (settings.extras.transport.mode === 'vast' || settings.extras.transport.mode === 'fixed') {
        transportTotaal = settings.extras.transport.vasteTransportkosten || 0;
    }

    // Subtotal before margin
    const subtotaalExclBtw = materialenTotaal + arbeidTotaal + transportTotaal;

    // Margin calculation
    let winstMarge = 0;
    const marginMode = settings.extras.winstMarge.mode;

    if (marginMode === 'percentage') {
        const basis = settings.extras.winstMarge.basis || 'totaal';
        let basisBedrag = 0;

        if (basis === 'materialen') {
            basisBedrag = materialenTotaal;
        } else if (basis === 'materialen_arbeid') {
            basisBedrag = materialenTotaal + arbeidTotaal;
        } else {
            // Default: 'totaal' includes everything
            basisBedrag = subtotaalExclBtw;
        }

        winstMarge = basisBedrag * (settings.extras.winstMarge.percentage / 100);
    } else if (marginMode === 'vast' || marginMode === 'fixed') {
        // Use fixedAmount if available, fallback to old percentage field if it was abused for fixed amount (unlikely given types but safe)
        winstMarge = settings.extras.winstMarge.fixedAmount || 0;
        // Legacy fallback not strictly needed if we enforce migration, but kept minimal. 
    }

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
