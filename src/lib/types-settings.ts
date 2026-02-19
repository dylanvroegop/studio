
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
    contacten?: LeverancierPersoon[];
    transportKostenRegels?: LeverancierTransportKostenRegel[];
    gratisVerzendingVanafBedrag?: number | null;
}

export interface LeverancierPersoon {
    id: string;
    naam: string;
    email: string;
}

export interface LeverancierTransportKostenRegel {
    id: string;
    label: string;
    bedrag: number | null;
    gratisVerzendingVanafBedrag?: number | null;
}

export type AppearanceMode = 'dark' | 'light';

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
    rol: string;
    offertesPerMaand: string;
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
    standaardMeerwerkbonIntroTekst: string;
    standaardMeerwerkbonVoorwaarden: string;
    standaardMeerwerkbonTemplatePreset: 'compact' | 'uitgebreid';

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
    materialListEmailTemplate?: string;
    leverancierTransportKostenRegels?: LeverancierTransportKostenRegel[];

    // 7. Uiterlijk
    appearanceMode?: AppearanceMode;
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
    rol: '',
    offertesPerMaand: '',
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
    standaardMeerwerkbonIntroTekst: 'Hierbij ontvangt u onze meerwerkbon voor aanvullende werkzaamheden buiten de oorspronkelijke offerte.',
    standaardMeerwerkbonVoorwaarden: 'Deze meerwerkbon vormt een aanvulling op de bestaande overeenkomst. Uitvoering vindt plaats na akkoord van opdrachtgever. Prijzen zijn exclusief onvoorziene omstandigheden tenzij schriftelijk anders overeengekomen.',
    standaardMeerwerkbonTemplatePreset: 'uitgebreid',
    bouwplaatsKostenPakketten: [],
    planningSettings: {
        defaultWorkdayHours: 8,
        allowAutoSplit: true,
        defaultStartTime: '08:00',
        defaultEndTime: '17:00',
        workDays: [1, 2, 3, 4, 5]
    },
    leveranciers: [],
    defaultLeverancierId: '',
    materialListEmailTemplate: '',
    leverancierTransportKostenRegels: [],
    appearanceMode: 'dark',
};

const safeString = (value: unknown): string => String(value ?? '').trim();

const createFallbackLeverancierId = (index: number): string =>
    `supplier-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;

const createFallbackTransportRegelId = (index: number): string =>
    `transport-regel-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;

const createFallbackContactId = (index: number): string =>
    `supplier-contact-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;

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
        const rawContacten = Array.isArray(row.contacten) ? row.contacten : [];
        const normalizedContacten: LeverancierPersoon[] = rawContacten
            .map((entry, contactIndex) => {
                if (!entry || typeof entry !== 'object') return null;
                const contact = entry as Record<string, unknown>;
                const contactLabel = safeString(contact.naam ?? contact.contactNaam ?? contact.contactnaam);
                const contactEmail = safeString(contact.email);
                if (!contactLabel && !contactEmail) return null;
                return {
                    id: safeString(contact.id) || createFallbackContactId(contactIndex),
                    naam: contactLabel,
                    email: contactEmail,
                };
            })
            .filter(Boolean) as LeverancierPersoon[];
        const rawTransportRegels = Array.isArray(row.transportKostenRegels)
            ? row.transportKostenRegels
            : Array.isArray(row.transportkostenRegels)
                ? row.transportkostenRegels
                : [];
        const transportKostenRegels: LeverancierTransportKostenRegel[] = rawTransportRegels
            .map((entry, regelIndex) => {
                if (!entry || typeof entry !== 'object') return null;
                const regel = entry as Record<string, unknown>;
                const label = safeString(regel.label ?? regel.naam);
                const rawBedrag = regel.bedrag;
                const bedrag = typeof rawBedrag === 'number' && Number.isFinite(rawBedrag)
                    ? rawBedrag
                    : typeof rawBedrag === 'string' && rawBedrag.trim().length > 0
                        ? Number(rawBedrag)
                        : null;

                if (!label && (bedrag === null || Number.isNaN(bedrag))) return null;

                return {
                    id: safeString(regel.id) || createFallbackTransportRegelId(regelIndex),
                    label,
                    bedrag: bedrag !== null && Number.isFinite(bedrag) ? bedrag : null,
                    gratisVerzendingVanafBedrag:
                        typeof regel.gratisVerzendingVanafBedrag === 'number' && Number.isFinite(regel.gratisVerzendingVanafBedrag)
                            ? regel.gratisVerzendingVanafBedrag
                            : null,
                };
            })
            .filter(Boolean) as LeverancierTransportKostenRegel[];

        const rawGratisVanaf = row.gratisVerzendingVanafBedrag ?? row.gratisVerzendingVanaf;
        const gratisVerzendingVanafBedrag = typeof rawGratisVanaf === 'number' && Number.isFinite(rawGratisVanaf)
            ? rawGratisVanaf
            : typeof rawGratisVanaf === 'string' && rawGratisVanaf.trim().length > 0
                ? Number(rawGratisVanaf)
                : null;

        if (!naam && !contactNaam && !email && normalizedContacten.length === 0 && transportKostenRegels.length === 0 && !gratisVerzendingVanafBedrag) return;

        let id = safeString(row.id);
        if (!id || usedIds.has(id)) {
            id = createFallbackLeverancierId(index);
        }
        usedIds.add(id);

        if (normalizedContacten.length === 0 && (contactNaam || email)) {
            normalizedContacten.push({
                id: createFallbackContactId(index),
                naam: contactNaam,
                email,
            });
        }
        const primaryContact = normalizedContacten[0] ?? null;

        normalized.push({
            id,
            naam,
            contactNaam: primaryContact?.naam || contactNaam,
            email: primaryContact?.email || email,
            contacten: normalizedContacten,
            transportKostenRegels,
            gratisVerzendingVanafBedrag:
                gratisVerzendingVanafBedrag !== null && Number.isFinite(gratisVerzendingVanafBedrag)
                    ? gratisVerzendingVanafBedrag
                    : null,
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
