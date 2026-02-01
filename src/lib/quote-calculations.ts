// src/lib/quote-calculations.ts

// ==============================
// Types die jouw quotes/[id]/page.tsx verwacht
// ==============================

export type MaterialItem = {
    aantal: number;
    product: string;
    prijs_per_stuk?: number;
    // optioneel: extra velden uit n8n (sectionKey, hoe_berekend, etc.)
    [key: string]: any;
};

export type UrenItem = {
    taak: string;
    uren: number;
};

export type DataJson = {
    grootmaterialen?: MaterialItem[];
    verbruiksartikelen?: MaterialItem[];
    klantinformatie?: KlantInformatie;
    instellingen?: QuoteSettings;
    totaal_uren?: number;
    uren_specificatie?: UrenItem[];
    werkbeschrijving?: string[] | any;
    [key: string]: any;
};

export type KlantInformatie = {
    klanttype: "Particulier" | "Zakelijk" | string;
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
};

export type QuoteSettings = {
    btwTarief: number; // 21
    uurTariefExclBtw: number; // 50
    schattingUren?: boolean;
    extras: {
        transport: {
            prijsPerKm: number; // 0.31
            vasteTransportkosten: number; // 0
            mode: "perKm" | "vast";
            // optioneel: afstandKm kan in dataJson zitten, maar settings kan het ook dragen als je later wilt
            afstandKm?: number;
        };
        winstMarge: {
            percentage: number; // 15
            fixedAmount: number; // 0
            mode: "percentage" | "fixed";
            basis: "totaal" | "arbeid" | "materiaal";
        };
    };
};

export type QuoteTotals = {
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
};

// ==============================
// Helpers
// ==============================

type AnyObject = Record<string, any>;

function isObject(v: any): v is AnyObject {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}

function toNumber(value: any, fallback = 0): number {
    // ondersteunt "12,34" en strings
    const n = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function safeJsonParse(value: any): any {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    try {
        return JSON.parse(trimmed);
    } catch {
        return value;
    }
}

export function unwrapRoot(payload: any): any {
    // not-working n8n: [ { ... } ]
    if (Array.isArray(payload) && payload.length > 0) return payload[0];
    return payload;
}

// ==============================
// Public API: formatCurrency
// ==============================

export function formatCurrency(amount: number, locale: string = "nl-NL", currency: string = "EUR"): string {
    const safe = Number.isFinite(amount) ? amount : 0;
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(safe);
}

export function formatNumber(num: number, decimals: number = 1): string {
    const safe = Number.isFinite(num) ? num : 0;
    return new Intl.NumberFormat('nl-NL', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(safe);
}

// ==============================
// Public API: generateWorkSummary
// - jouw code geeft soms array<string>
// - not-working n8n geeft { werkbeschrijving: [{ stap: "..." }] }
// ==============================

export function normalizeWerkbeschrijving(input: any): string[] {
    if (!input) return [];

    // Case 1: Already a flat array of strings
    if (Array.isArray(input) && input.every((x) => typeof x === "string")) {
        return input;
    }

    // Case 2: Array of objects with 'stap' property: [ { stap: "..." }, ... ]
    if (Array.isArray(input)) {
        if (input.every(x => isObject(x) && typeof x.stap === 'string')) {
            return input.map(x => x.stap);
        }
        // If it's an array but contains another werkbeschrijving object (nested n8n)
        if (input.length > 0 && isObject(input[0]) && input[0].werkbeschrijving) {
            return normalizeWerkbeschrijving(input[0].werkbeschrijving);
        }
    }

    // Case 3: Object with a 'werkbeschrijving' property (the n8n wrap)
    if (isObject(input) && input.werkbeschrijving) {
        return normalizeWerkbeschrijving(input.werkbeschrijving);
    }

    return [];
}

export function generateWorkSummary(werkbeschrijvingInput: any, maxLength: number = 500): string {
    const werkbeschrijving = normalizeWerkbeschrijving(werkbeschrijvingInput);
    const summary = werkbeschrijving.slice(0, 5).join(" ");
    return summary.length > maxLength ? summary.substring(0, maxLength - 3) + "..." : summary;
}

// ==============================
// Normalisatie voor materialen (product vs materiaal, nested verbruiksartikelen)
// ==============================

export function normalizeMaterialen(input: any): MaterialItem[] {
    if (!Array.isArray(input)) return [];

    return input
        .map((item: any) => {
            if (!isObject(item)) return null;

            const aantal = toNumber(item.aantal, 0);
            const prijs_per_stuk = toNumber(item.prijs_per_stuk, 0);

            const product =
                typeof item.product === "string"
                    ? item.product
                    : typeof item.materiaal === "string"
                        ? item.materiaal
                        : "";

            if (!product) return null;

            return {
                ...item,
                aantal,
                prijs_per_stuk,
                product,
            } as MaterialItem;
        })
        .filter((x): x is MaterialItem => !!x);
}

export function normalizeVerbruiksartikelen(input: any): MaterialItem[] {
    // working: verbruiksartikelen: MaterialItem[]
    if (Array.isArray(input) && input.length > 0 && isObject(input[0]) && ("product" in input[0] || "materiaal" in input[0])) {
        return normalizeMaterialen(input);
    }

    // not-working: [ { verbruiksartikelen: [ ... ] } ]
    if (Array.isArray(input) && input.length > 0 && isObject(input[0]) && Array.isArray(input[0].verbruiksartikelen)) {
        return normalizeMaterialen(input[0].verbruiksartikelen);
    }

    return [];
}

// ==============================
// Normalisatie voor instellingen / extras (soms JSON-string uit n8n)
// ==============================

export function normalizeDataJson(input: any): DataJson {
    const root = unwrapRoot(input);

    // Deep search for properties (handle body.quote structure)
    const findProp = (obj: any, key: string): any => {
        if (!obj || typeof obj !== 'object') return undefined;
        if (key in obj) return obj[key];
        if (obj.body?.quote?.[key]) return obj.body.quote[key];
        return undefined;
    };

    const rawKlant = findProp(root, 'klantinformatie');
    const rawInst = findProp(root, 'instellingen');
    const rawExtras = findProp(root, 'extras');
    const rawWerk = findProp(root, 'werkbeschrijving');

    // Zoek korteTitel/Beschrijving op root of binnen werkbeschrijving object
    const rawKorteTitel = findProp(root, 'korteTitel') ||
        findProp(root, 'korte_titel') ||
        (isObject(rawWerk) ? (rawWerk as any).korteTitel || (rawWerk as any).korte_titel : undefined);

    const rawKorteBeschrijving = findProp(root, 'korteBeschrijving') ||
        findProp(root, 'korte_beschrijving') ||
        (isObject(rawWerk) ? (rawWerk as any).korteBeschrijving || (rawWerk as any).korte_beschrijving : undefined);

    const urenSpecRoot = root.uren_specificatie || {};
    const urenSpecificatie = Array.isArray(urenSpecRoot.uren_specificatie)
        ? urenSpecRoot.uren_specificatie
        : Array.isArray(root.uren_specificatie)
            ? root.uren_specificatie
            : [];

    const totaal_uren = toNumber(urenSpecRoot.totaal_uren ?? root.totaal_uren ?? urenSpecRoot.totaaluren ?? root.totaaluren, 0)
        || urenSpecificatie.reduce((sum: number, it: any) => sum + toNumber(it.uren, 0), 0);

    return {
        ...root,
        grootmaterialen: normalizeMaterialen(root.grootmaterialen),
        verbruiksartikelen: normalizeVerbruiksartikelen(root.verbruiksartikelen),
        klantinformatie: safeJsonParse(rawKlant),
        instellingen: safeJsonParse(rawInst),
        extras: safeJsonParse(rawExtras),
        korteTitel: rawKorteTitel,
        korteBeschrijving: rawKorteBeschrijving,
        totaal_uren,
        uren_specificatie: urenSpecificatie,
        werkbeschrijving: normalizeWerkbeschrijving(rawWerk ?? root.werkbeschrijving)
    };
}

// ==============================
// Kern: calculateQuoteTotals(dataJson, quoteSettings)
// EXACT zoals jij hem aanroept in quotes/[id]/page.tsx
// ==============================

export function calculateQuoteTotals(dataJson: any, quoteSettings: QuoteSettings): QuoteTotals {
    const normalized = normalizeDataJson(dataJson);

    // 1) Materialen
    const groot = normalized.grootmaterialen || [];
    const verbruik = normalized.verbruiksartikelen || [];

    const grootSubtotalExclBtw = groot.reduce((sum, it) => sum + toNumber(it.aantal, 0) * toNumber(it.prijs_per_stuk, 0), 0);
    const verbruikSubtotalExclBtw = verbruik.reduce((sum, it) => sum + toNumber(it.aantal, 0) * toNumber(it.prijs_per_stuk, 0), 0);
    const materiaalSubtotalExclBtw = grootSubtotalExclBtw + verbruikSubtotalExclBtw;

    // 2) Uren / arbeid
    const totaalUren = toNumber(normalized.totaal_uren, 0);
    const uurTariefExclBtw = toNumber(quoteSettings?.uurTariefExclBtw, 0);
    const arbeidSubtotalExclBtw = totaalUren * uurTariefExclBtw;

    // 3) Extras: transport & winst
    const instellingen = normalized.instellingen as any;
    const extrasFromRoot = normalized.extras as any;

    // Transport
    const transportMode = quoteSettings.extras.transport.mode;
    const prijsPerKm = toNumber(quoteSettings.extras.transport.prijsPerKm, toNumber(instellingen?.transportPrijsPerKm, 0));
    const vasteTransportkosten = toNumber(quoteSettings.extras.transport.vasteTransportkosten, 0);

    const afstandKm =
        toNumber(quoteSettings.extras.transport.afstandKm, undefined as any) ||
        toNumber(extrasFromRoot?.transport?.afstandKm, 0);

    let transportExclBtw = 0;
    if (transportMode === "vast") {
        transportExclBtw = vasteTransportkosten;
    } else {
        transportExclBtw = toNumber(afstandKm, 0) * toNumber(prijsPerKm, 0);
    }

    // Winstmarge
    const margeMode = quoteSettings.extras.winstMarge.mode;
    const margeBasis = quoteSettings.extras.winstMarge.basis;
    const margePercentage = toNumber(quoteSettings.extras.winstMarge.percentage, 0);
    const margeFixed = toNumber(quoteSettings.extras.winstMarge.fixedAmount, 0);

    const basisBedrag =
        margeBasis === "arbeid"
            ? arbeidSubtotalExclBtw
            : margeBasis === "materiaal"
                ? materiaalSubtotalExclBtw
                : // "totaal"
                arbeidSubtotalExclBtw + materiaalSubtotalExclBtw + transportExclBtw;

    let winstMargeExclBtw = 0;
    if (margeMode === "fixed") {
        winstMargeExclBtw = margeFixed;
    } else {
        winstMargeExclBtw = (margePercentage / 100) * basisBedrag;
    }

    // 4) Totalen
    const subtotaalExclBtw = arbeidSubtotalExclBtw + materiaalSubtotalExclBtw + transportExclBtw;
    const totaalExclBtw = subtotaalExclBtw + winstMargeExclBtw;

    const btwTarief = toNumber(quoteSettings?.btwTarief, 21);
    const btwBedrag = (btwTarief / 100) * totaalExclBtw;
    const totaalInclBtw = totaalExclBtw + btwBedrag;

    return {
        materialenGroot: grootSubtotalExclBtw,
        materialenVerbruik: verbruikSubtotalExclBtw,
        materialenTotaal: materiaalSubtotalExclBtw,
        arbeidTotaal: arbeidSubtotalExclBtw,
        transportTotaal: transportExclBtw,
        subtotaalExclBtw: subtotaalExclBtw,
        winstMarge: winstMargeExclBtw,
        totaalExclBtw: totaalExclBtw,
        btw: btwBedrag,
        totaalInclBtw: totaalInclBtw,
    };
}
