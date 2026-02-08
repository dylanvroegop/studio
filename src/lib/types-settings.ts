
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

export interface UserSettings {
    // 1. Bedrijfsgegevens
    bedrijfsnaam: string;
    kvkNummer: string;
    btwNummer: string;

    contactNaam: string;
    adres: string;
    postcode: string;
    plaats: string;
    email: string;
    telefoon: string;
    website: string;
    logoUrl?: string;
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

    // 4. Bouwplaatskosten Beheer
    bouwplaatsKostenPakketten: {
        id: string;
        naam: string;
        items: BouwplaatsItem[];
    }[];

    // 5. Planning Instellingen
    planningSettings: PlanningSettings;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
    bedrijfsnaam: '',
    kvkNummer: '',
    btwNummer: '',
    contactNaam: '',
    adres: '',
    postcode: '',
    plaats: '',
    email: '',
    telefoon: '',
    website: '',
    logoUrl: '',
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
    bouwplaatsKostenPakketten: [],
    planningSettings: {
        defaultWorkdayHours: 8,
        allowAutoSplit: true,
        defaultStartTime: '08:00',
        defaultEndTime: '17:00',
        workDays: [1, 2, 3, 4, 5]
    }
};
