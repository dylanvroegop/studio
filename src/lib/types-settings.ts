
export interface BouwplaatsItem {
    id: string;
    naam: string;
    prijs: number; // Stored as number
    per: 'dag' | 'week' | 'klus';
    isVast: boolean;
}

export interface StandaardTransport {
    mode: 'perKm' | 'fixed' | 'none';
    prijsPerKm?: number;
    vasteTransportkosten?: number;
}

export interface StandaardWinstMarge {
    mode: 'percentage' | 'fixed' | 'none';
    percentage?: number;
    fixedAmount?: number;
}

export interface PlanningSettings {
    defaultWorkdayHours: number;
    allowAutoSplit: boolean;
    defaultStartTime: string;
    defaultEndTime: string;
    workDays: number[];
    pauzeMinuten?: number;
}

export interface LeverancierContact {
    id: string;
    naam: string;
    contactNaam: string;
    email: string;
}

export interface UserSettings {
    // 1. Bedrijfsgegevens
    bedrijfsnaam: string;
    kvkNummer: string;
    btwNummer: string;

    contactNaam: string;
    adres: string;
    huisnummer: string;
    postcode: string;
    plaats: string;
    email: string;
    telefoon: string;
    website: string;
    logoUrl?: string;
    signatureUrl?: string;
    logoScale: number;

    iban: string;
    bankNaam: string;
    bic: string;

    // 2. Financiële Standaarden
    standaardWinstMarge: StandaardWinstMarge;
    standaardTransport: StandaardTransport;
    standaardKleinMateriaal: {
        mode: 'inschatting' | 'percentage' | 'fixed' | 'none';
        percentage: number | null;
    };
    standaardUurtarief: number;

    // 3. Offerte Configuraties
    offerteNummerPrefix: string;
    offerteNummerStart: number;
    standaardGeldigheidDagen: number;
    standaardIntroTekst: string;
    standaardSluitTekst: string;

    // 3b. Factuur Configuraties
    factuurNummerPrefix: string;
    factuurNummerStart: number;
    standaardBetaaltermijnDagen: number;
    standaardFactuurTekst: string;
    standaardVoorschotPercentage: number;

    // 4. Bouwplaatskosten Beheer
    bouwplaatsKostenPakketten: {
        id: string;
        naam: string;
        items: BouwplaatsItem[];
    }[];

    // 5. Planning Instellingen
    planningSettings: PlanningSettings;

    // 6. Leveranciers voor materiaallijst-export
    leveranciers: LeverancierContact[];
    defaultLeverancierId: string;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
    bedrijfsnaam: 'Calvora',
    kvkNummer: '',
    btwNummer: '',
    contactNaam: '',
    adres: '',
    huisnummer: '',
    postcode: '',
    plaats: '',
    email: '',
    telefoon: '',
    website: '',
    logoUrl: '',
    signatureUrl: '',
    logoScale: 1.0,
    iban: '',
    bankNaam: '',
    bic: '',
    standaardWinstMarge: { mode: 'percentage', percentage: 10 },
    standaardTransport: { mode: 'perKm', prijsPerKm: 0.23 },
    standaardKleinMateriaal: { mode: 'inschatting', percentage: null },
    standaardUurtarief: 45,
    offerteNummerPrefix: new Date().getFullYear() + '-',
    offerteNummerStart: 1001,
    standaardGeldigheidDagen: 30,
    standaardIntroTekst: 'Hierbij ontvangt u de offerte voor de besproken werkzaamheden.',
    standaardSluitTekst: 'Wij hopen u hiermee van dienst te zijn en horen graag van u.',
    factuurNummerPrefix: new Date().getFullYear() + '-',
    factuurNummerStart: 460001,
    standaardBetaaltermijnDagen: 14,
    standaardFactuurTekst: 'Gelieve het factuurbedrag binnen de betaaltermijn te voldoen o.v.v. het factuurnummer.',
    standaardVoorschotPercentage: 50,
    bouwplaatsKostenPakketten: [],
    planningSettings: {
        defaultWorkdayHours: 8,
        allowAutoSplit: true,
        defaultStartTime: '08:00',
        defaultEndTime: '17:00',
        workDays: [1, 2, 3, 4, 5]
    },
    leveranciers: [],
    defaultLeverancierId: ''
};

const safeString = (value: unknown): string => String(value ?? '').trim();

const createFallbackLeverancierId = (index: number): string =>
    `supplier-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;

export function normalizeLeverancierContactList(raw: unknown): LeverancierContact[] {
    if (!Array.isArray(raw)) return [];

    const usedIds = new Set<string>();
    const normalized: LeverancierContact[] = [];

    raw.forEach((entry, index) => {
        if (!entry || typeof entry !== 'object') return;
        const row = entry as Record<string, unknown>;

        const naam = safeString(row.naam);
        const contactNaam = safeString(row.contactNaam ?? row.contactnaam);
        const email = safeString(row.email);

        if (!naam && !contactNaam && !email) return;

        let id = safeString(row.id);
        if (!id || usedIds.has(id)) {
            id = createFallbackLeverancierId(index);
        }
        usedIds.add(id);

        normalized.push({
            id,
            naam,
            contactNaam,
            email,
        });
    });

    return normalized;
}

export function pickDefaultLeverancierId(rawDefaultId: unknown, leveranciers: LeverancierContact[]): string {
    const preferredId = safeString(rawDefaultId);
    if (preferredId && leveranciers.some((leverancier) => leverancier.id === preferredId)) {
        return preferredId;
    }
    return leveranciers[0]?.id || '';
}
