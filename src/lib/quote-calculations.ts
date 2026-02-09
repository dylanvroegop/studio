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
    transport_berekening?: {
        ratePerKm?: number;
        distanceKm?: number;
        durationText?: string;
        roundTripDistanceKm?: number;
        oneWayTravelCost?: number;
        roundTripTravelCost?: number;
        [key: string]: any;
    };
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
            prijsPerKm?: number; // 0.31
            vasteTransportkosten?: number; // 0
            tunnelkosten?: number; // 0
            mode?: "perKm" | "vast" | "fixed" | "none";
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
    transportPerDag: number;
    transportAantalDagen: number;
    transportRatePerKm: number;
    transportDistanceKmOneWay: number;
    transportOneWayCost: number;
    transportRoundTripCost: number;
    transportDurationPerDagMinutes: number;
    transportDurationOneWayText: string;
    transportDurationRoundTripText: string;
    transportDurationTotaalText: string;
    subtotaalExclBtw: number;
    winstMarge: number;
    totaalExclBtw: number;
    btw: number;
    totaalInclBtw: number;
};

// Backwards compatibility alias
export type CalculationResult = QuoteTotals;

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

function parseDurationToMinutes(input: string): number {
    if (!input) return 0;
    const s = input.toLowerCase();
    const hourMatch = s.match(/(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|hour|hours|uur|uren)/);
    const minMatch = s.match(/(\d+(?:[.,]\d+)?)\s*(m|min|mins|minute|minutes)/);
    const hours = hourMatch ? Number(hourMatch[1].replace(",", ".")) : 0;
    const mins = minMatch ? Number(minMatch[1].replace(",", ".")) : 0;
    if (hours > 0 || mins > 0) return Math.round(hours * 60 + mins);
    const plainNumber = s.match(/(\d+(?:[.,]\d+)?)/);
    return plainNumber ? Math.round(Number(plainNumber[1].replace(",", "."))) : 0;
}

function formatMinutesShort(totalMinutes: number): string {
    const safe = Math.max(0, Math.round(totalMinutes));
    const h = Math.floor(safe / 60);
    const m = safe % 60;
    if (h > 0 && m > 0) return `${h}u ${m}m`;
    if (h > 0) return `${h}u`;
    return `${m} min`;
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
    // case 1: n8n returns an array: [ { ... } ]
    if (Array.isArray(payload) && payload.length > 0) return payload[0];

    // case 2: accidental spread of array into object: { "0": { ... } }
    // We check if "0" exists and if it's the only key or if other keys are just standard metadata
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        if ('0' in payload && Object.keys(payload).length === 1) {
            return payload['0'];
        }
    }

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
    const rootFromZero =
        isObject(root) && "0" in root
            ? safeJsonParse((root as any)["0"])
            : undefined;
    const rootForSearch = rootFromZero ?? root;
    const base = isObject(rootForSearch) ? rootForSearch : root;
    const firstDataNode = Array.isArray(root?.data) && root.data.length > 0 ? root.data[0] : null;
    const firstNestedDataNode = Array.isArray(firstDataNode?.data)
        ? (firstDataNode.data.length > 0 ? firstDataNode.data[0] : null)
        : isObject(firstDataNode?.data)
            ? firstDataNode.data
            : null;

    // Deep search for properties (handle root + nested n8n wrappers)
    const findProp = (obj: any, key: string): any => {
        if (!obj || typeof obj !== "object") return undefined;
        const candidates = [
            obj,
            obj.body,
            obj.body?.quote,
            rootFromZero,
            (rootFromZero as any)?.body,
            (rootFromZero as any)?.body?.quote,
            firstDataNode,
            firstDataNode?.body,
            firstDataNode?.body?.quote,
        ];
        for (const candidate of candidates) {
            if (candidate && typeof candidate === "object" && key in candidate) {
                return candidate[key];
            }
        }
        return undefined;
    };

    const rawKlant = findProp(base, 'klantinformatie');
    const rawInst = findProp(base, 'instellingen');
    const rawExtras = findProp(base, 'extras');
    const rawWerk = findProp(base, 'werkbeschrijving');
    const looksLikeTravelCalc = (value: any): boolean => {
        if (!isObject(value)) return false;
        return (
            "ratePerKm" in value ||
            "distanceKm" in value ||
            "roundTripDistanceKm" in value ||
            "oneWayTravelCost" in value ||
            "roundTripTravelCost" in value
        );
    };
    const findTravelCalcDeep = (value: any, depth = 0): any => {
        if (depth > 8 || value == null) return undefined;
        if (typeof value === "string") {
            const parsed = safeJsonParse(value);
            if (parsed !== value) {
                return findTravelCalcDeep(parsed, depth + 1);
            }
            return undefined;
        }
        if (looksLikeTravelCalc(value)) return value;
        if (Array.isArray(value)) {
            for (const item of value) {
                const found = findTravelCalcDeep(item, depth + 1);
                if (found) return found;
            }
            return undefined;
        }
        if (isObject(value)) {
            for (const nested of Object.values(value)) {
                const found = findTravelCalcDeep(nested, depth + 1);
                if (found) return found;
            }
        }
        return undefined;
    };
    const explicitTransportBerekening =
        findProp(base, "transport_berekening") ||
        findProp(base, "transportBerekening");
    const transportCandidate = findProp(base, "transport");
    const rawTransportBerekening =
        (looksLikeTravelCalc(explicitTransportBerekening) ? explicitTransportBerekening : undefined) ||
        (looksLikeTravelCalc(firstNestedDataNode) ? firstNestedDataNode : undefined) ||
        (looksLikeTravelCalc(transportCandidate) ? transportCandidate : undefined) ||
        findTravelCalcDeep(rootForSearch);

    // Zoek korteTitel/Beschrijving op root of binnen werkbeschrijving object
    const rawKorteTitel = findProp(base, 'korteTitel') ||
        findProp(base, 'korte_titel') ||
        (isObject(rawWerk) ? (rawWerk as any).korteTitel || (rawWerk as any).korte_titel : undefined);

    const rawKorteBeschrijving = findProp(base, 'korteBeschrijving') ||
        findProp(base, 'korte_beschrijving') ||
        (isObject(rawWerk) ? (rawWerk as any).korteBeschrijving || (rawWerk as any).korte_beschrijving : undefined);

    const urenSpecRoot = (base as any).uren_specificatie || {};
    const urenSpecificatie = Array.isArray(urenSpecRoot.uren_specificatie)
        ? urenSpecRoot.uren_specificatie
        : Array.isArray((base as any).uren_specificatie)
            ? (base as any).uren_specificatie
            : [];

    const directRootTotaalCandidate = toNumber(
        (root as any)?.totaal_uren ?? (root as any)?.totaaluren,
        Number.NaN
    );
    const baseTotaalCandidate = toNumber(
        (base as any)?.totaal_uren ?? (base as any)?.totaaluren,
        Number.NaN
    );
    const urenSpecTotaalCandidate = toNumber(
        urenSpecRoot.totaal_uren ?? urenSpecRoot.totaaluren,
        Number.NaN
    );

    console.log('🔍 [NORMALIZE] totaal_uren lookup:', {
        direct_root_totaal: directRootTotaalCandidate,
        base_root_totaal: baseTotaalCandidate,
        uren_spec_totaal: urenSpecTotaalCandidate,
        spec_sum: urenSpecificatie.reduce((sum: number, it: any) => sum + toNumber(it.uren, 0), 0)
    });

    const totaalUrenCandidate = Number.isFinite(directRootTotaalCandidate)
        ? directRootTotaalCandidate
        : Number.isFinite(urenSpecTotaalCandidate)
            ? urenSpecTotaalCandidate
            : baseTotaalCandidate;
    const totaal_uren = Number.isFinite(totaalUrenCandidate)
        ? totaalUrenCandidate
        : urenSpecificatie.reduce((sum: number, it: any) => sum + toNumber(it.uren, 0), 0);

    console.log('🔍 [NORMALIZE] Final totaal_uren:', totaal_uren);
    console.log('🔍 [NORMALIZE] transport_berekening lookup:', {
        has_zero_root: !!rootFromZero,
        has_transport: !!rawTransportBerekening,
        ratePerKm: rawTransportBerekening?.ratePerKm,
        distanceKm: rawTransportBerekening?.distanceKm,
        roundTripTravelCost: rawTransportBerekening?.roundTripTravelCost,
    });

    return {
        ...base,
        grootmaterialen: normalizeMaterialen((base as any).grootmaterialen),
        verbruiksartikelen: normalizeVerbruiksartikelen((base as any).verbruiksartikelen),
        klantinformatie: safeJsonParse(rawKlant),
        instellingen: safeJsonParse(rawInst),
        extras: safeJsonParse(rawExtras),
        transport_berekening: safeJsonParse(rawTransportBerekening),
        korteTitel: rawKorteTitel,
        korteBeschrijving: rawKorteBeschrijving,
        totaal_uren,
        uren_specificatie: urenSpecificatie,
        werkbeschrijving: normalizeWerkbeschrijving(rawWerk ?? (base as any).werkbeschrijving)
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
    const transportBerekening = normalized.transport_berekening as any;

    // Transport
    const transportMode = quoteSettings.extras.transport.mode;
    const prijsPerKm = toNumber(
        quoteSettings.extras.transport.prijsPerKm,
        toNumber(transportBerekening?.ratePerKm, toNumber(instellingen?.transportPrijsPerKm, 0))
    );
    const vasteTransportkosten = toNumber(quoteSettings.extras.transport.vasteTransportkosten, 0);
    const tunnelkosten = toNumber(quoteSettings.extras.transport.tunnelkosten, toNumber(extrasFromRoot?.transport?.tunnelkosten, 0));

    const afstandKm =
        toNumber(quoteSettings.extras.transport.afstandKm, undefined as any) ||
        toNumber(transportBerekening?.roundTripDistanceKm, undefined as any) ||
        toNumber(transportBerekening?.distanceKm, undefined as any) ||
        toNumber(extrasFromRoot?.transport?.afstandKm, 0);

    const transportDistanceKmOneWay = toNumber(transportBerekening?.distanceKm, 0);
    const durationText = typeof transportBerekening?.durationText === "string" ? transportBerekening.durationText : "";
    const oneWayMinutes = parseDurationToMinutes(durationText);
    const roundTripMinutes = oneWayMinutes * 2;
    const transportOneWayCost = toNumber(
        transportBerekening?.oneWayTravelCost,
        toNumber(transportDistanceKmOneWay, 0) * toNumber(prijsPerKm, 0)
    );
    const transportRoundTripCost = toNumber(
        transportBerekening?.roundTripTravelCost,
        transportOneWayCost * 2
    );
    const transportPerDagFromDistance = transportRoundTripCost > 0
        ? transportRoundTripCost
        : toNumber(afstandKm, 0) * toNumber(prijsPerKm, 0);
    const resolvedTransportMode: "perKm" | "vast" | "fixed" | "none" =
        transportMode === "vast" || transportMode === "fixed" || transportMode === "none" || transportMode === "perKm"
            ? transportMode
            : vasteTransportkosten > 0
                ? "fixed"
                : transportPerDagFromDistance > 0
                    ? "perKm"
                    : "none";
    const transportAantalDagen = resolvedTransportMode === "none" ? 0 : Math.max(1, Math.ceil(totaalUren / 8));
    const totaalReistijdMinutes = roundTripMinutes * transportAantalDagen;

    let transportPerDag = 0;
    if (resolvedTransportMode === "none") {
        transportPerDag = 0;
    } else if (resolvedTransportMode === "vast" || resolvedTransportMode === "fixed") {
        transportPerDag = vasteTransportkosten;
    } else {
        transportPerDag = toNumber(transportPerDagFromDistance, 0);
    }

    let transportExclBtw = transportPerDag * transportAantalDagen;
    transportExclBtw += tunnelkosten;

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
        transportPerDag,
        transportAantalDagen,
        transportRatePerKm: toNumber(prijsPerKm, 0),
        transportDistanceKmOneWay,
        transportOneWayCost,
        transportRoundTripCost,
        transportDurationPerDagMinutes: roundTripMinutes,
        transportDurationOneWayText: durationText || "0 min",
        transportDurationRoundTripText: formatMinutesShort(roundTripMinutes),
        transportDurationTotaalText: formatMinutesShort(totaalReistijdMinutes),
        subtotaalExclBtw: subtotaalExclBtw,
        winstMarge: winstMargeExclBtw,
        totaalExclBtw: totaalExclBtw,
        btw: btwBedrag,
        totaalInclBtw: totaalInclBtw,
    };
}
