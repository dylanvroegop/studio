// src/lib/quote-calculations.ts

import {
    DEFAULT_ELECTRICAL_SCOPE,
    DEFAULT_WORK_DELIVERY_SCOPE,
    completeWorkDeliveryScope,
    enforceWorkDeliverySafety,
    flattenWorkDeliveryScope,
    sanitizeWorkDeliveryScope,
    type ElectricalScope,
    type FinishLevel,
} from '@/lib/work-delivery';

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
    werkbeschrijving_structured?: WorkDescriptionStructured | any;
    werkbeschrijving_jobs?: WorkDescriptionJob[] | any;
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

export type WorkDescriptionSectionKey = 'voorbereiding' | 'uitvoering' | 'afwerking';

export type WorkDescriptionJob = {
    title: string;
    context: string;
    summary: string;
    work_scope: string[];
    materials: string[];
    dimensions: string[];
    included: string[];
    excluded: string[];
    internal_notes: string[];
    afvalAfvoeren?: boolean;
    schilderwerkInbegrepen?: boolean;
    stucwerkInbegrepen?: boolean;
    plamuurwerkInbegrepen?: boolean;
    kitwerkInbegrepen?: boolean;
    steigerInbegrepen?: boolean;
    sloopwerkInbegrepen?: boolean;
    nadenVullenInbegrepen?: boolean;
    electricalScope: ElectricalScope;
    finishLevel: FinishLevel;
    customFinishDescription?: string;
    /** Legacy fields are retained for migration only and never rendered to customers. */
    sections: {
        voorbereiding: string[];
        uitvoering: string[];
        afwerking: string[];
    };
    legacyNotes?: string[];
};

export type WorkDescriptionStructured = {
    title: string;
    context: string;
    summary: string;
    work_scope: string[];
    materials: string[];
    dimensions: string[];
    included: string[];
    excluded: string[];
    internal_notes: string[];
    afvalAfvoeren: boolean;
    schilderwerkInbegrepen: boolean;
    stucwerkInbegrepen: boolean;
    plamuurwerkInbegrepen: boolean;
    kitwerkInbegrepen: boolean;
    steigerInbegrepen: boolean;
    sloopwerkInbegrepen: boolean;
    nadenVullenInbegrepen: boolean;
    electricalScope: ElectricalScope;
    finishLevel: FinishLevel;
    customFinishDescription?: string;
    sections: {
        voorbereiding: string[];
        uitvoering: string[];
        afwerking: string[];
    };
    jobs: WorkDescriptionJob[];
    activeJobIndex?: number;
    legacyNotes?: string[];
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
    btwMode?: "normaal" | "materiaal_only";
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
    winstProjectie: {
        omzetExclBtw: number;
        kostenExclBtw: number;
        winstExclBtw: number;
        omzetInclBtw: number;
        kostenInclBtw: number;
        winstInclBtw: number;
        btwArbeidEnMarge: number;
        winstNaBtwArbeidEnMarge: number;
        btwBedrag: number;
        margePercentageOpOmzet: number;
    };
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

const EMPTY_WORK_DESCRIPTION_JOB: WorkDescriptionJob = {
    title: '',
    context: '',
    summary: '',
    work_scope: [],
    materials: [],
    dimensions: [],
    included: [...DEFAULT_WORK_DELIVERY_SCOPE.included],
    excluded: [...DEFAULT_WORK_DELIVERY_SCOPE.excluded],
    internal_notes: [],
    afvalAfvoeren: false,
    schilderwerkInbegrepen: false,
    stucwerkInbegrepen: false,
    plamuurwerkInbegrepen: false,
    kitwerkInbegrepen: false,
    steigerInbegrepen: false,
    sloopwerkInbegrepen: false,
    nadenVullenInbegrepen: false,
    electricalScope: { ...DEFAULT_ELECTRICAL_SCOPE },
    finishLevel: 'constructief_gereed',
    sections: {
        voorbereiding: [],
        uitvoering: [],
        afwerking: [],
    },
    legacyNotes: [],
};

const EMPTY_WORK_DESCRIPTION_STRUCTURED: WorkDescriptionStructured = {
    title: '',
    context: '',
    summary: '',
    work_scope: [],
    materials: [],
    dimensions: [],
    included: [...DEFAULT_WORK_DELIVERY_SCOPE.included],
    excluded: [...DEFAULT_WORK_DELIVERY_SCOPE.excluded],
    internal_notes: [],
    afvalAfvoeren: false,
    schilderwerkInbegrepen: false,
    stucwerkInbegrepen: false,
    plamuurwerkInbegrepen: false,
    kitwerkInbegrepen: false,
    steigerInbegrepen: false,
    sloopwerkInbegrepen: false,
    nadenVullenInbegrepen: false,
    electricalScope: { ...DEFAULT_ELECTRICAL_SCOPE },
    finishLevel: 'constructief_gereed',
    sections: {
        voorbereiding: [],
        uitvoering: [],
        afwerking: [],
    },
    jobs: [],
    activeJobIndex: 0,
    legacyNotes: [],
};

function isObject(v: any): v is AnyObject {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}

function normalizeWorkDescriptionText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function hasWasteRemovalText(rows: string[]): boolean {
    return rows.some((line) => {
        const normalized = String(line || '').toLowerCase();
        return (
            (normalized.includes('afval') && (normalized.includes('afvoer') || normalized.includes('meenem') || normalized.includes('take away')))
            || normalized.includes('puin afvoer')
            || normalized.includes('werkplek schoon')
        );
    });
}

function normalizeWorkDescriptionItems(value: unknown): string[] {
    const flattenValue = (input: unknown, depth = 0): string[] => {
        if (depth > 4 || input == null) return [];
        if (typeof input === 'string') {
            const trimmed = input.trim();
            if (!trimmed) return [];
            const parsed = safeJsonParse(trimmed);
            if (parsed !== trimmed) {
                return flattenValue(parsed, depth + 1);
            }
            return [trimmed];
        }
        if (Array.isArray(input)) {
            return input.flatMap((item) => flattenValue(item, depth + 1));
        }
        if (isObject(input)) {
            const row = input as Record<string, unknown>;
            const direct =
                normalizeWorkDescriptionText(row.stap)
                || normalizeWorkDescriptionText(row.text)
                || normalizeWorkDescriptionText(row.description);
            if (direct) return [direct];

            if (Array.isArray(row.jobs)) {
                return row.jobs.flatMap((job) => {
                    if (!isObject(job)) return [];
                    const jobRow = job as Record<string, unknown>;
                    return flattenValue(jobRow.werkbeschrijving ?? jobRow.sections ?? jobRow, depth + 1);
                });
            }

            return flattenValue(
                row.werkbeschrijving
                ?? row.output
                ?? row.result
                ?? row.sections
                ?? row.items
                ?? row.data,
                depth + 1
            );
        }
        return [];
    };

    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => flattenValue(item)).filter(Boolean);
}

function normalizeEditableWorkDescriptionItems(value: unknown): string[] {
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        return value.map((item) => String(item ?? ''));
    }
    return normalizeWorkDescriptionItems(value);
}

function normalizeLegacyRows(value: unknown): string[] {
    if (typeof value === 'string') {
        return value
            .replace(/\r/g, '\n')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
    }
    return normalizeWorkDescriptionItems(value);
}

function toWorkDescriptionSectionKey(input: string): WorkDescriptionSectionKey | null {
    const normalized = input.toLowerCase().replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('voorbereiding')) return 'voorbereiding';
    if (normalized.startsWith('uitvoering')) return 'uitvoering';
    if (normalized.startsWith('afwerking')) return 'afwerking';
    return null;
}

function parseSectionHeader(line: string): WorkDescriptionSectionKey | null {
    const cleaned = line
        .replace(/^[-*•\d)\].\s]+/, '')
        .replace(/[:\-–—]\s*$/, '')
        .trim();
    return toWorkDescriptionSectionKey(cleaned);
}

function cloneStructured(value: WorkDescriptionStructured): WorkDescriptionStructured {
    return {
        title: value.title,
        context: value.context,
        summary: value.summary,
        work_scope: [...value.work_scope],
        materials: [...value.materials],
        dimensions: [...value.dimensions],
        included: [...value.included],
        excluded: [...value.excluded],
        internal_notes: [...value.internal_notes],
        afvalAfvoeren: value.afvalAfvoeren,
        schilderwerkInbegrepen: value.schilderwerkInbegrepen,
        stucwerkInbegrepen: value.stucwerkInbegrepen,
        plamuurwerkInbegrepen: value.plamuurwerkInbegrepen,
        kitwerkInbegrepen: value.kitwerkInbegrepen,
        steigerInbegrepen: value.steigerInbegrepen,
        sloopwerkInbegrepen: value.sloopwerkInbegrepen,
        nadenVullenInbegrepen: value.nadenVullenInbegrepen,
        electricalScope: {
            ...value.electricalScope,
            includedItems: [...value.electricalScope.includedItems],
            excludedItems: [...value.electricalScope.excludedItems],
        },
        finishLevel: value.finishLevel,
        customFinishDescription: value.customFinishDescription,
        sections: {
            voorbereiding: [...value.sections.voorbereiding],
            uitvoering: [...value.sections.uitvoering],
            afwerking: [...value.sections.afwerking],
        },
        jobs: Array.isArray(value.jobs)
            ? value.jobs.map((job) => ({
                title: normalizeWorkDescriptionText(job?.title),
                context: normalizeWorkDescriptionText(job?.context),
                summary: normalizeWorkDescriptionText(job?.summary || job?.context),
                work_scope: normalizeEditableWorkDescriptionItems(job?.work_scope),
                materials: normalizeEditableWorkDescriptionItems(job?.materials),
                dimensions: normalizeEditableWorkDescriptionItems(job?.dimensions),
                included: normalizeEditableWorkDescriptionItems(job?.included),
                excluded: normalizeEditableWorkDescriptionItems(job?.excluded),
                internal_notes: normalizeEditableWorkDescriptionItems(job?.internal_notes),
                afvalAfvoeren: Boolean(job?.afvalAfvoeren),
                schilderwerkInbegrepen: Boolean(job?.schilderwerkInbegrepen),
                stucwerkInbegrepen: Boolean(job?.stucwerkInbegrepen),
                plamuurwerkInbegrepen: Boolean(job?.plamuurwerkInbegrepen),
                kitwerkInbegrepen: Boolean(job?.kitwerkInbegrepen),
                steigerInbegrepen: Boolean(job?.steigerInbegrepen),
                sloopwerkInbegrepen: Boolean(job?.sloopwerkInbegrepen),
                nadenVullenInbegrepen: Boolean(job?.nadenVullenInbegrepen),
                electricalScope: job?.electricalScope || { ...DEFAULT_ELECTRICAL_SCOPE },
                finishLevel: job?.finishLevel || 'constructief_gereed',
                customFinishDescription: job?.customFinishDescription,
                sections: {
                    voorbereiding: normalizeEditableWorkDescriptionItems(job?.sections?.voorbereiding),
                    uitvoering: normalizeEditableWorkDescriptionItems(job?.sections?.uitvoering),
                    afwerking: normalizeEditableWorkDescriptionItems(job?.sections?.afwerking),
                },
                legacyNotes: normalizeEditableWorkDescriptionItems(job?.legacyNotes),
            }))
            : [],
        activeJobIndex: Number.isFinite(Number(value.activeJobIndex))
            ? Math.max(0, Math.floor(Number(value.activeJobIndex)))
            : 0,
        legacyNotes: [...(value.legacyNotes || [])],
    };
}

function normalizeWorkDescriptionJob(input: unknown): WorkDescriptionJob {
    if (!isObject(input)) {
        return {
            ...EMPTY_WORK_DESCRIPTION_JOB,
            sections: {
                voorbereiding: [],
                uitvoering: [],
                afwerking: [],
            },
            legacyNotes: [],
        };
    }

    const row = input as Record<string, unknown>;
    const sectionsValue = isObject(row.sections) ? row.sections as Record<string, unknown> : {};
    const fallbackRows = normalizeLegacyRows(
        row.werkbeschrijving ?? row.stappen ?? row.steps ?? row.uitvoering ?? row.items ?? row.description ?? row.text
    );

    const voorbereiding = normalizeEditableWorkDescriptionItems(sectionsValue.voorbereiding ?? row.voorbereiding);
    const uitvoering = normalizeEditableWorkDescriptionItems(
        sectionsValue.uitvoering
        ?? row.uitvoering
        ?? row.werkbeschrijving
        ?? row.stappen
        ?? row.steps
        ?? row.items
    );
    const afwerking = normalizeEditableWorkDescriptionItems(sectionsValue.afwerking ?? row.afwerking);
    const delivery = sanitizeWorkDeliveryScope({
        ...row,
        title: row.korteTitel ?? row.korte_titel ?? row.title,
        summary: row.summary ?? row.korteBeschrijving ?? row.korte_beschrijving ?? row.context ?? row.samenvatting,
        internal_notes: [
            ...normalizeEditableWorkDescriptionItems(row.internal_notes ?? row.internalNotes),
            ...voorbereiding,
            ...(uitvoering.length > 0 ? uitvoering : fallbackRows),
            ...afwerking,
            ...normalizeEditableWorkDescriptionItems(row.legacyNotes),
        ],
        afvalAfvoeren: row.afvalAfvoeren === true,
        schilderwerkInbegrepen: row.schilderwerkInbegrepen === true,
        stucwerkInbegrepen: row.stucwerkInbegrepen === true,
        plamuurwerkInbegrepen: row.plamuurwerkInbegrepen === true || row.plamuurEnKitwerkInbegrepen === true,
        kitwerkInbegrepen: row.kitwerkInbegrepen === true || row.plamuurEnKitwerkInbegrepen === true,
        steigerInbegrepen: row.steigerInbegrepen === true,
        sloopwerkInbegrepen: row.sloopwerkInbegrepen === true,
        nadenVullenInbegrepen: row.nadenVullenInbegrepen === true,
    });

    return {
        ...delivery,
        context: delivery.summary,
        sections: {
            voorbereiding,
            uitvoering: uitvoering.length > 0 ? uitvoering : fallbackRows,
            afwerking,
        },
        legacyNotes: normalizeEditableWorkDescriptionItems(row.legacyNotes),
    };
}

export function sanitizeWorkDescriptionStructured(input: unknown): WorkDescriptionStructured {
    if (!isObject(input)) {
        return cloneStructured(EMPTY_WORK_DESCRIPTION_STRUCTURED);
    }

    const row = input as Record<string, unknown>;
    const sectionsValue = isObject(row.sections) ? row.sections as Record<string, unknown> : {};

    const jobCandidates: unknown[] = [];
    if (Array.isArray(row.jobs)) jobCandidates.push(...row.jobs);
    if (Array.isArray(row.werkbeschrijving_jobs)) jobCandidates.push(...row.werkbeschrijving_jobs);
    if (Array.isArray(row.werkbeschrijvingJobs)) jobCandidates.push(...row.werkbeschrijvingJobs);

    const normalizedJobs = jobCandidates
        .map((job) => normalizeWorkDescriptionJob(job))
        .filter((job) =>
            job.title
            || job.summary
            || job.work_scope.length > 0
            || job.materials.length > 0
            || job.dimensions.length > 0
            || job.included.length > 0
            || job.internal_notes.length > 0
            || job.sections.voorbereiding.length > 0
            || job.sections.uitvoering.length > 0
            || job.sections.afwerking.length > 0
            || (job.legacyNotes?.length || 0) > 0
        );

    const fallbackJob = normalizeWorkDescriptionJob({
        ...row,
        korteTitel: row.korteTitel ?? row.korte_titel ?? row.title,
        korteBeschrijving: row.korteBeschrijving ?? row.korte_beschrijving ?? row.context,
        sections: {
            voorbereiding: sectionsValue.voorbereiding ?? row.voorbereiding,
            uitvoering: sectionsValue.uitvoering ?? row.uitvoering,
            afwerking: sectionsValue.afwerking ?? row.afwerking,
        },
        werkbeschrijving: row.werkbeschrijving ?? row.description ?? row.text ?? row.output,
        legacyNotes: row.legacyNotes,
    });
    const hasFallbackContent =
        fallbackJob.title
        || fallbackJob.summary
        || fallbackJob.work_scope.length > 0
        || fallbackJob.materials.length > 0
        || fallbackJob.dimensions.length > 0
        || fallbackJob.included.length > 0
        || fallbackJob.internal_notes.length > 0
        || fallbackJob.sections.voorbereiding.length > 0
        || fallbackJob.sections.uitvoering.length > 0
        || fallbackJob.sections.afwerking.length > 0
        || (fallbackJob.legacyNotes?.length || 0) > 0;

    const jobs = normalizedJobs.length > 0
        ? normalizedJobs
        : (hasFallbackContent ? [fallbackJob] : []);
    const resolvedActiveJobIndex = Number.isFinite(Number(row.activeJobIndex))
        ? Math.max(0, Math.min(Math.floor(Number(row.activeJobIndex)), Math.max(0, jobs.length - 1)))
        : 0;
    const activeJob = jobs[resolvedActiveJobIndex] || jobs[0];

    const normalized: WorkDescriptionStructured = {
        title: normalizeWorkDescriptionText(row.title) || activeJob?.title || '',
        context: normalizeWorkDescriptionText(row.context) || activeJob?.context || '',
        summary: normalizeWorkDescriptionText(row.summary) || activeJob?.summary || activeJob?.context || '',
        work_scope: activeJob ? [...activeJob.work_scope] : normalizeEditableWorkDescriptionItems(row.work_scope),
        materials: activeJob ? [...activeJob.materials] : normalizeEditableWorkDescriptionItems(row.materials),
        dimensions: activeJob ? [...activeJob.dimensions] : normalizeEditableWorkDescriptionItems(row.dimensions),
        included: row.included !== undefined ? normalizeEditableWorkDescriptionItems(row.included) : (activeJob ? [...activeJob.included] : []),
        excluded: row.excluded !== undefined ? normalizeEditableWorkDescriptionItems(row.excluded) : (activeJob ? [...activeJob.excluded] : []),
        internal_notes: activeJob ? [...activeJob.internal_notes] : normalizeEditableWorkDescriptionItems(row.internal_notes),
        afvalAfvoeren: typeof row.afvalAfvoeren === 'boolean' ? row.afvalAfvoeren : activeJob?.afvalAfvoeren === true,
        schilderwerkInbegrepen: typeof row.schilderwerkInbegrepen === 'boolean' ? row.schilderwerkInbegrepen : activeJob?.schilderwerkInbegrepen === true,
        stucwerkInbegrepen: typeof row.stucwerkInbegrepen === 'boolean' ? row.stucwerkInbegrepen : activeJob?.stucwerkInbegrepen === true,
        plamuurwerkInbegrepen: typeof row.plamuurwerkInbegrepen === 'boolean' ? row.plamuurwerkInbegrepen : activeJob?.plamuurwerkInbegrepen === true,
        kitwerkInbegrepen: typeof row.kitwerkInbegrepen === 'boolean' ? row.kitwerkInbegrepen : activeJob?.kitwerkInbegrepen === true,
        steigerInbegrepen: typeof row.steigerInbegrepen === 'boolean' ? row.steigerInbegrepen : activeJob?.steigerInbegrepen === true,
        sloopwerkInbegrepen: typeof row.sloopwerkInbegrepen === 'boolean' ? row.sloopwerkInbegrepen : activeJob?.sloopwerkInbegrepen === true,
        nadenVullenInbegrepen: typeof row.nadenVullenInbegrepen === 'boolean' ? row.nadenVullenInbegrepen : activeJob?.nadenVullenInbegrepen === true,
        electricalScope: isObject(row.electricalScope) ? normalizeWorkDescriptionJob({ electricalScope: row.electricalScope }).electricalScope : (activeJob?.electricalScope || { ...DEFAULT_ELECTRICAL_SCOPE }),
        finishLevel: normalizeWorkDescriptionText(row.finishLevel) as FinishLevel || activeJob?.finishLevel || 'constructief_gereed',
        customFinishDescription: normalizeWorkDescriptionText(row.customFinishDescription) || activeJob?.customFinishDescription,
        sections: {
            voorbereiding: activeJob
                ? [...activeJob.sections.voorbereiding]
                : normalizeEditableWorkDescriptionItems(sectionsValue.voorbereiding ?? row.voorbereiding),
            uitvoering: activeJob
                ? [...activeJob.sections.uitvoering]
                : normalizeEditableWorkDescriptionItems(sectionsValue.uitvoering ?? row.uitvoering),
            afwerking: activeJob
                ? [...activeJob.sections.afwerking]
                : normalizeEditableWorkDescriptionItems(sectionsValue.afwerking ?? row.afwerking),
        },
        jobs,
        activeJobIndex: resolvedActiveJobIndex,
        legacyNotes: normalizeEditableWorkDescriptionItems(row.legacyNotes),
    };

    if ((!normalized.legacyNotes || normalized.legacyNotes.length === 0) && activeJob?.legacyNotes?.length) {
        normalized.legacyNotes = [...activeJob.legacyNotes];
    }

    return normalized;
}

export function completeStructuredWorkDescription(
    input: unknown,
    fallbackTitle?: string,
): WorkDescriptionStructured {
    const structured = sanitizeWorkDescriptionStructured(input);
    const jobs = structured.jobs.map((job) => {
        const completed = completeWorkDeliveryScope(job, fallbackTitle);
        return {
            ...job,
            ...completed,
            context: completed.summary,
        };
    });
    const activeIndex = Math.max(
        0,
        Math.min(structured.activeJobIndex || 0, Math.max(0, jobs.length - 1)),
    );
    const activeJob = jobs[activeIndex];
    const completedRoot = completeWorkDeliveryScope(structured, fallbackTitle);

    return {
        ...structured,
        ...completedRoot,
        context: completedRoot.summary,
        sections: activeJob?.sections || structured.sections,
        legacyNotes: activeJob?.legacyNotes || structured.legacyNotes,
        jobs,
        activeJobIndex: activeIndex,
    };
}

export function toStructuredWorkDescription(input: unknown): WorkDescriptionStructured {
    const base = cloneStructured(EMPTY_WORK_DESCRIPTION_STRUCTURED);

    if (!input) return base;

    if (isObject(input)) {
        const row = input as Record<string, unknown>;

        const directStructuredSource = row.werkbeschrijving_structured
            ?? row.werkbeschrijvingStructured
            ?? row.werkbeschrijving_jobs
            ?? row.werkbeschrijvingJobs
            ?? row.jobs;
        const directStructured = sanitizeWorkDescriptionStructured(directStructuredSource);
        const hasStructuredContent = directStructuredSource != null && (directStructured.title
            || directStructured.summary
            || directStructured.work_scope.length > 0
            || directStructured.materials.length > 0
            || directStructured.dimensions.length > 0
            || directStructured.included.length > 0
            || directStructured.internal_notes.length > 0
            || directStructured.sections.voorbereiding.length > 0
            || directStructured.sections.uitvoering.length > 0
            || directStructured.sections.afwerking.length > 0
            || directStructured.jobs.length > 0
            || (directStructured.legacyNotes?.length || 0) > 0);

        if (hasStructuredContent) {
            const merged = cloneStructured(directStructured);
            if (!merged.title) merged.title = normalizeWorkDescriptionText(row.korteTitel ?? row.korte_titel);
            if (!merged.summary) merged.summary = normalizeWorkDescriptionText(row.korteBeschrijving ?? row.korte_beschrijving);
            merged.context = merged.summary;
            return merged;
        }

        base.title = normalizeWorkDescriptionText(row.korteTitel ?? row.korte_titel ?? row.title);
        base.summary = normalizeWorkDescriptionText(row.korteBeschrijving ?? row.korte_beschrijving ?? row.context);
        base.context = base.summary;

        const legacyRaw = row.werkbeschrijving ?? row.description ?? row.text ?? row.output ?? input;
        const parsedLegacyRaw = (() => {
            let current: any = legacyRaw;
            for (let i = 0; i < 4; i += 1) {
                if (typeof current !== 'string') return current;
                const parsed = safeJsonParse(current);
                if (parsed === current) return parsed;
                current = parsed;
            }
            return current;
        })();

        if (isObject(parsedLegacyRaw) && Array.isArray((parsedLegacyRaw as any).jobs)) {
            const fromJobs = sanitizeWorkDescriptionStructured(parsedLegacyRaw);
            const hasJobs = fromJobs.jobs.length > 0;
            if (hasJobs) {
                if (!fromJobs.title) fromJobs.title = base.title;
                if (!fromJobs.context) fromJobs.context = base.context;
                return fromJobs;
            }
        }

        const lines = normalizeWerkbeschrijving(legacyRaw);
        let currentSection: WorkDescriptionSectionKey = 'uitvoering';

        lines.forEach((line) => {
            const cleaned = String(line || '').trim();
            if (!cleaned) return;

            const detectedSection = parseSectionHeader(cleaned);
            if (detectedSection) {
                currentSection = detectedSection;
                return;
            }

            base.sections[currentSection].push(cleaned);
        });

        base.jobs = [{
            title: base.title,
            context: base.context,
            summary: base.summary,
            work_scope: [],
            materials: [],
            dimensions: [],
            included: [...base.included],
            excluded: [...base.excluded],
            internal_notes: [
                ...base.sections.voorbereiding,
                ...base.sections.uitvoering,
                ...base.sections.afwerking,
            ],
            afvalAfvoeren: false,
            schilderwerkInbegrepen: false,
            stucwerkInbegrepen: false,
            plamuurwerkInbegrepen: false,
            kitwerkInbegrepen: false,
            steigerInbegrepen: false,
            sloopwerkInbegrepen: false,
            nadenVullenInbegrepen: false,
            electricalScope: { ...DEFAULT_ELECTRICAL_SCOPE },
            finishLevel: 'constructief_gereed',
            sections: {
                voorbereiding: [...base.sections.voorbereiding],
                uitvoering: [...base.sections.uitvoering],
                afwerking: [...base.sections.afwerking],
            },
            legacyNotes: [...(base.legacyNotes || [])],
        }];
        base.internal_notes = [
            ...base.sections.voorbereiding,
            ...base.sections.uitvoering,
            ...base.sections.afwerking,
        ];
        base.activeJobIndex = 0;

        return base;
    }

    const lines = normalizeWerkbeschrijving(input);
    base.sections.uitvoering = lines;
    base.internal_notes = [...lines];
    base.jobs = [{
        title: base.title,
        context: base.context,
        summary: base.summary,
        work_scope: [],
        materials: [],
        dimensions: [],
        included: [...base.included],
        excluded: [...base.excluded],
        internal_notes: [...lines],
        afvalAfvoeren: false,
        schilderwerkInbegrepen: false,
        stucwerkInbegrepen: false,
        plamuurwerkInbegrepen: false,
        kitwerkInbegrepen: false,
        steigerInbegrepen: false,
        sloopwerkInbegrepen: false,
        nadenVullenInbegrepen: false,
        electricalScope: { ...DEFAULT_ELECTRICAL_SCOPE },
        finishLevel: 'constructief_gereed',
        sections: {
            voorbereiding: [...base.sections.voorbereiding],
            uitvoering: [...base.sections.uitvoering],
            afwerking: [...base.sections.afwerking],
        },
        legacyNotes: [...(base.legacyNotes || [])],
    }];
    base.activeJobIndex = 0;
    return base;
}

export function flattenStructuredWorkDescription(input: unknown): string[] {
    const structured = sanitizeWorkDescriptionStructured(
        isObject(input) ? input : toStructuredWorkDescription(input)
    );

    if (structured.jobs.length > 0) {
        return structured.jobs
            .flatMap((job) => flattenWorkDeliveryScope(job))
            .map((line) => String(line || '').trim())
            .filter(Boolean);
    }

    return flattenWorkDeliveryScope(structured)
        .map((line) => String(line || '').trim())
        .filter(Boolean);
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
        const parseNestedJsonString = (value: string, maxDepth = 4): any => {
            let current: any = value;
            for (let i = 0; i < maxDepth; i += 1) {
                if (typeof current !== 'string') return current;
                const parsed = safeJsonParse(current);
                if (parsed === current) return parsed;
                current = parsed;
            }
            return current;
        };

        const normalized = input.flatMap((row) => {
            const trimmed = String(row || '').trim();
            if (!trimmed) return [];
            const parsed = parseNestedJsonString(trimmed);
            if (parsed && parsed !== trimmed) {
                return normalizeWerkbeschrijving(parsed);
            }
            return [trimmed];
        });
        return normalized;
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

    // Case 3b: Multi-job model
    if (isObject(input) && Array.isArray(input.jobs)) {
        return input.jobs.flatMap((job: any) => normalizeWerkbeschrijving(job?.werkbeschrijving ?? job?.sections ?? job));
    }

    // Case 4: Structured model
    if (isObject(input) && (input.sections || input.werkbeschrijving_structured)) {
        return flattenStructuredWorkDescription(
            input.werkbeschrijving_structured ? input.werkbeschrijving_structured : input
        );
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
    if (Array.isArray(input) && input.length > 0 && isObject(input[0]) && ("product" in input[0] || "materiaal" in input[0] || "materiaalnaam" in input[0])) {
        return input
            .map((item: any) => {
                if (!isObject(item)) return null;

                const product =
                    typeof item.product === "string"
                        ? item.product
                        : typeof item.materiaal === "string"
                            ? item.materiaal
                            : typeof item.materiaalnaam === "string"
                                ? item.materiaalnaam
                                : "";

                if (!product) return null;

                // Verbruiksartikelen prijzen zijn excl. btw vanuit n8n: gebruik prijs_excl_btw als primaire bron.
                const prijs_per_stuk = toNumber(
                    item.prijs_excl_btw,
                    toNumber(item.prijs_per_stuk, 0)
                );

                const aantal = toNumber(item.aantal, 1);

                const materialFields = { ...item };
                delete materialFields.body;
                delete materialFields.data;
                delete materialFields.quote_metadata;
                return {
                    ...materialFields,
                    product,
                    prijs_per_stuk,
                    aantal,
                } as MaterialItem;
            })
            .filter((x): x is MaterialItem => !!x);
    }

    // not-working: [ { verbruiksartikelen: [ ... ] } ]
    if (Array.isArray(input) && input.length > 0 && isObject(input[0]) && Array.isArray(input[0].verbruiksartikelen)) {
        return normalizeVerbruiksartikelen(input[0].verbruiksartikelen);
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
    const rawWerkJobs =
        findProp(base, 'werkbeschrijving_jobs') ||
        findProp(base, 'werkbeschrijvingJobs') ||
        findProp(base, 'jobs');
    const rawWerkStructured =
        findProp(base, 'werkbeschrijving_structured') ||
        findProp(base, 'werkbeschrijvingStructured');
    const structuredWerkbeschrijving = toStructuredWorkDescription({
        werkbeschrijving: rawWerk,
        werkbeschrijving_jobs: rawWerkJobs,
        werkbeschrijving_structured: rawWerkStructured,
        korteTitel: findProp(base, 'korteTitel') || findProp(base, 'korte_titel'),
        korteBeschrijving: findProp(base, 'korteBeschrijving') || findProp(base, 'korte_beschrijving'),
    });
    const flattenedWerkbeschrijving = flattenStructuredWorkDescription(structuredWerkbeschrijving);
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
    const resolvedKorteTitel = rawKorteTitel || structuredWerkbeschrijving.title;
    const resolvedKorteBeschrijving = rawKorteBeschrijving || structuredWerkbeschrijving.context;

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

    const totaalUrenCandidate = Number.isFinite(directRootTotaalCandidate)
        ? directRootTotaalCandidate
        : Number.isFinite(urenSpecTotaalCandidate)
            ? urenSpecTotaalCandidate
            : baseTotaalCandidate;
    const totaal_uren = Number.isFinite(totaalUrenCandidate)
        ? totaalUrenCandidate
        : urenSpecificatie.reduce((sum: number, it: any) => sum + toNumber(it.uren, 0), 0);

    const resolveSmallMaterialAmount = (value: any): number | null => {
        const parsePositive = (inputValue: any): number | null => {
            const parsed = toNumber(inputValue, Number.NaN);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        };

        if (value == null) return null;

        const direct = parsePositive(value);
        if (direct !== null) return direct;

        if (!isObject(value)) return null;

        const numericKeys = [
            'totaal',
            'total',
            'amount',
            'waarde',
            'value',
            'prijs',
            'prijs_per_stuk',
            'prijs_excl_btw',
            'prijsExclBtw',
            'kosten',
            'subtotaal',
            'subtotal',
        ];

        for (const key of numericKeys) {
            if (!(key in value)) continue;
            const parsed = parsePositive((value as AnyObject)[key]);
            if (parsed !== null) return parsed;
        }

        return null;
    };

    const normalizedGrootMaterialen = normalizeMaterialen(
        (base as any).grootmaterialen ?? (base as any).materialen
    );
    const normalizedVerbruiksartikelen = normalizeVerbruiksartikelen(
        (base as any).verbruiksartikelen ?? (base as any).data
    );
    let resolvedVerbruiksartikelen = normalizedVerbruiksartikelen;

    if (resolvedVerbruiksartikelen.length === 0) {
        const fallbackSmallMaterialCandidates = [
            findProp(base, 'kleinMateriaal'),
            findProp(base, 'klein_materiaal'),
            findProp(base, 'kleinMateriaalTotaal'),
            findProp(base, 'klein_materiaal_totaal'),
            findProp(base, 'verbruiksartikelen_totaal'),
            findProp(base, 'verbruiksmaterialen_totaal'),
        ];

        for (const candidate of fallbackSmallMaterialCandidates) {
            if (candidate == null) continue;

            const nestedVerbruik = normalizeVerbruiksartikelen(candidate);
            if (nestedVerbruik.length > 0) {
                resolvedVerbruiksartikelen = nestedVerbruik;
                break;
            }

            const amount = resolveSmallMaterialAmount(candidate);
            if (amount !== null) {
                resolvedVerbruiksartikelen = [{
                    product: 'Klein materiaal (samengevat)',
                    aantal: 1,
                    prijs_per_stuk: Number(amount.toFixed(2)),
                    toelichting: 'Samengevat totaal uit calculatie.',
                }];
                break;
            }
        }
    }

    return {
        ...base,
        grootmaterialen: normalizedGrootMaterialen,
        verbruiksartikelen: resolvedVerbruiksartikelen,
        klantinformatie: safeJsonParse(rawKlant),
        instellingen: safeJsonParse(rawInst),
        extras: safeJsonParse(rawExtras),
        transport_berekening: safeJsonParse(rawTransportBerekening),
        korteTitel: resolvedKorteTitel,
        korteBeschrijving: resolvedKorteBeschrijving,
        totaal_uren,
        uren_specificatie: urenSpecificatie,
        werkbeschrijving: flattenedWerkbeschrijving,
        werkbeschrijving_jobs: structuredWerkbeschrijving.jobs,
        werkbeschrijving_structured: structuredWerkbeschrijving,
    };
}

// ==============================
// Kern: calculateQuoteTotals(dataJson, quoteSettings)
// EXACT zoals jij hem aanroept in quotes/[id]/page.tsx
// ==============================

export function calculateQuoteTotals(dataJson: any, quoteSettings: QuoteSettings, urenPerDag = 8): QuoteTotals {
    const roundCurrency = (value: number): number => {
        const safe = Number.isFinite(value) ? value : 0;
        return Math.round((safe + Number.EPSILON) * 100) / 100;
    };

    const normalized = normalizeDataJson(dataJson);

    // 1) Materialen
    const groot = normalized.grootmaterialen || [];
    const verbruik = normalized.verbruiksartikelen || [];

    const grootSubtotalExclBtwRaw = groot.reduce((sum, it) => sum + toNumber(it.aantal, 0) * toNumber(it.prijs_per_stuk, 0), 0);
    const verbruikSubtotalExclBtwRaw = verbruik.reduce((sum, it) => sum + toNumber(it.aantal, 0) * toNumber(it.prijs_per_stuk, 0), 0);
    const materiaalSubtotalExclBtwRaw = grootSubtotalExclBtwRaw + verbruikSubtotalExclBtwRaw;

    // 2) Uren / arbeid
    const totaalUren = toNumber(normalized.totaal_uren, 0);
    const uurTariefExclBtw = toNumber(quoteSettings?.uurTariefExclBtw, 0);
    const arbeidSubtotalExclBtwRaw = totaalUren * uurTariefExclBtw;

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
    const computedOneWayCost = toNumber(transportDistanceKmOneWay, 0) * toNumber(prijsPerKm, 0);
    const storedOneWayCost = Number(transportBerekening?.oneWayTravelCost);
    const hasStoredOneWayCost = Number.isFinite(storedOneWayCost) && storedOneWayCost > 0;
    const transportOneWayCost = hasStoredOneWayCost ? storedOneWayCost : computedOneWayCost;
    const computedRoundTripCost = transportOneWayCost * 2;
    const storedRoundTripCost = Number(transportBerekening?.roundTripTravelCost);
    const hasStoredRoundTripCost = Number.isFinite(storedRoundTripCost) && storedRoundTripCost > 0;
    const transportRoundTripCost = hasStoredRoundTripCost ? storedRoundTripCost : computedRoundTripCost;
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
    const safeUrenPerDag = Number.isFinite(urenPerDag) && urenPerDag > 0 ? urenPerDag : 8;
    const transportAantalDagen = resolvedTransportMode === "none" ? 0 : Math.max(1, Math.ceil(totaalUren / safeUrenPerDag));
    const totaalReistijdMinutes = roundTripMinutes * transportAantalDagen;

    let transportPerDag = 0;
    if (resolvedTransportMode === "none") {
        transportPerDag = 0;
    } else if (resolvedTransportMode === "vast" || resolvedTransportMode === "fixed") {
        transportPerDag = vasteTransportkosten;
    } else {
        transportPerDag = toNumber(transportPerDagFromDistance, 0);
    }

    let transportExclBtwRaw = transportPerDag * transportAantalDagen;
    transportExclBtwRaw += tunnelkosten;

    // Winstmarge
    const margeMode = quoteSettings.extras.winstMarge.mode;
    const margeBasis = quoteSettings.extras.winstMarge.basis;
    const margePercentage = toNumber(quoteSettings.extras.winstMarge.percentage, 0);
    const margeFixed = toNumber(quoteSettings.extras.winstMarge.fixedAmount, 0);

    const basisBedrag =
        margeBasis === "arbeid"
            ? arbeidSubtotalExclBtwRaw
            : margeBasis === "materiaal"
                ? materiaalSubtotalExclBtwRaw
                : // "totaal"
                arbeidSubtotalExclBtwRaw + materiaalSubtotalExclBtwRaw + transportExclBtwRaw;

    let winstMargeExclBtwRaw = 0;
    if (margeMode === "fixed") {
        winstMargeExclBtwRaw = margeFixed;
    } else {
        winstMargeExclBtwRaw = (margePercentage / 100) * basisBedrag;
    }

    // 4) Totalen
    const grootSubtotalExclBtw = roundCurrency(grootSubtotalExclBtwRaw);
    const verbruikSubtotalExclBtw = roundCurrency(verbruikSubtotalExclBtwRaw);
    const materiaalSubtotalExclBtw = roundCurrency(materiaalSubtotalExclBtwRaw);
    const arbeidSubtotalExclBtw = roundCurrency(arbeidSubtotalExclBtwRaw);
    const transportPerDagRounded = roundCurrency(transportPerDag);
    const transportExclBtw = roundCurrency(transportExclBtwRaw);
    const winstMargeExclBtw = roundCurrency(winstMargeExclBtwRaw);
    const subtotaalExclBtw = roundCurrency(arbeidSubtotalExclBtw + materiaalSubtotalExclBtw + transportExclBtw);
    const totaalExclBtw = roundCurrency(subtotaalExclBtw + winstMargeExclBtw);

    const btwTarief = toNumber(quoteSettings?.btwTarief, 21);
    const btwMode = quoteSettings?.btwMode === "materiaal_only" ? "materiaal_only" : "normaal";
    const btwGrondslag = btwMode === "materiaal_only" ? materiaalSubtotalExclBtw : totaalExclBtw;
    const btwBedrag = roundCurrency((btwTarief / 100) * btwGrondslag);
    const totaalInclBtw = roundCurrency(totaalExclBtw + btwBedrag);
    const winstProjectieOmzetExclBtw = totaalExclBtw;
    const winstProjectieKostenExclBtw = roundCurrency(materiaalSubtotalExclBtw + transportExclBtw);
    const winstProjectieWinstExclBtw = roundCurrency(winstProjectieOmzetExclBtw - winstProjectieKostenExclBtw);
    const winstProjectieKostenInclBtw = roundCurrency(
        btwMode === "materiaal_only"
            ? materiaalSubtotalExclBtw + ((btwTarief / 100) * materiaalSubtotalExclBtw) + transportExclBtw
            : winstProjectieKostenExclBtw + ((btwTarief / 100) * winstProjectieKostenExclBtw)
    );
    const winstProjectieWinstInclBtw = roundCurrency(totaalInclBtw - winstProjectieKostenInclBtw);
    const btwArbeidEnMarge = roundCurrency(
        btwMode === "materiaal_only"
            ? 0
            : ((btwTarief / 100) * roundCurrency(arbeidSubtotalExclBtw + winstMargeExclBtw))
    );
    const winstNaBtwArbeidEnMarge = roundCurrency(winstProjectieWinstInclBtw - btwArbeidEnMarge);
    const winstProjectieMargePct = winstProjectieOmzetExclBtw > 0
        ? roundCurrency((winstProjectieWinstExclBtw / winstProjectieOmzetExclBtw) * 100)
        : 0;

    return {
        materialenGroot: grootSubtotalExclBtw,
        materialenVerbruik: verbruikSubtotalExclBtw,
        materialenTotaal: materiaalSubtotalExclBtw,
        arbeidTotaal: arbeidSubtotalExclBtw,
        transportTotaal: transportExclBtw,
        transportPerDag: transportPerDagRounded,
        transportAantalDagen,
        transportRatePerKm: toNumber(prijsPerKm, 0),
        transportDistanceKmOneWay,
        transportOneWayCost: roundCurrency(transportOneWayCost),
        transportRoundTripCost: roundCurrency(transportRoundTripCost),
        transportDurationPerDagMinutes: roundTripMinutes,
        transportDurationOneWayText: durationText || "0 min",
        transportDurationRoundTripText: formatMinutesShort(roundTripMinutes),
        transportDurationTotaalText: formatMinutesShort(totaalReistijdMinutes),
        subtotaalExclBtw: subtotaalExclBtw,
        winstMarge: winstMargeExclBtw,
        winstProjectie: {
            omzetExclBtw: winstProjectieOmzetExclBtw,
            kostenExclBtw: winstProjectieKostenExclBtw,
            winstExclBtw: winstProjectieWinstExclBtw,
            omzetInclBtw: totaalInclBtw,
            kostenInclBtw: winstProjectieKostenInclBtw,
            winstInclBtw: winstProjectieWinstInclBtw,
            btwArbeidEnMarge,
            winstNaBtwArbeidEnMarge,
            btwBedrag,
            margePercentageOpOmzet: winstProjectieMargePct,
        },
        totaalExclBtw: totaalExclBtw,
        btw: btwBedrag,
        totaalInclBtw: totaalInclBtw,
    };
}
