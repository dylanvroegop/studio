export type QuotePricingUnit = 'm2' | 'm1' | 'st' | 'uur' | 'vast';
export type QuotePricingSource = 'ai' | 'regel' | 'handmatig';
export type QuotePricingCategory = 'materiaal' | 'arbeid';

export interface QuotePriceLine {
    id: string;
    title: string;
    unit: QuotePricingUnit;
    quantity: number;
    unitPriceExclBtw: number;
    category: QuotePricingCategory;
    source: QuotePricingSource;
    ruleId?: string;
    noteSectionId?: string;
    confidence?: number;
    explanation?: string;
}

export interface QuotePriceRule {
    id: string;
    title: string;
    unit: QuotePricingUnit;
    unitPriceExclBtw: number;
    aliases: string[];
    scope?: string;
    sourceQuoteIds?: string[];
    updatedAt?: string;
}

export interface QuotePricing {
    mode: 'unit_price' | 'detailed' | 'mixed';
    lines: QuotePriceLine[];
    updatedAt?: string;
}

const UNIT_ALIASES: Record<string, QuotePricingUnit> = {
    m2: 'm2',
    'm²': 'm2',
    'm2.': 'm2',
    'm².': 'm2',
    m1: 'm1',
    'm¹': 'm1',
    stuk: 'st',
    st: 'st',
    stuks: 'st',
    uur: 'uur',
    uren: 'uur',
    vast: 'vast',
    'vast bedrag': 'vast',
};

export function createQuotePricingId(prefix = 'prijs'): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}_${crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizePricingUnit(value: unknown): QuotePricingUnit {
    const normalized = String(value ?? '').trim().toLowerCase();
    return UNIT_ALIASES[normalized] || 'm2';
}

export function formatPricingUnit(unit: QuotePricingUnit): string {
    switch (unit) {
        case 'm2': return 'm²';
        case 'm1': return 'm¹';
        case 'st': return 'st';
        case 'uur': return 'uur';
        case 'vast': return 'vast';
        default: return unit;
    }
}

export function parsePricingNumber(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const normalized = String(value ?? '')
        .trim()
        .replace(/\s/g, '')
        .replace(/€/g, '')
        .replace(/\.(?=\d{3}(?:,|$))/g, '')
        .replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function roundPricingMoney(value: number): number {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function calculateQuotePriceLineTotal(line: Pick<QuotePriceLine, 'quantity' | 'unitPriceExclBtw'>): number {
    return roundPricingMoney(Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.unitPriceExclBtw) || 0));
}

export function normalizePricingTitle(value: unknown): string {
    return String(value ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const LIKELY_LABOR_TITLE_PATTERN = /\b(arbeid|arbeidsuren|uren|uur|plaatsen|wand plaatsen|wand zetten|wand monteren|plafond plaatsen|plafond monteren|monteren|installeren|stucwerk|elektra|elektrisch|schilderen|slopen|afwerken|kozijn omzetten|deur plaatsen|stopcontact|lichtpunt)\b/i;

export function normalizePricingCategory(
    value: unknown,
    title = '',
    unit?: QuotePricingUnit,
): QuotePricingCategory {
    if (value === 'arbeid') return 'arbeid';
    if (value === 'materiaal') return 'materiaal';
    if (unit === 'uur' || LIKELY_LABOR_TITLE_PATTERN.test(title)) return 'arbeid';
    return 'materiaal';
}

export function sanitizeQuotePriceRules(value: unknown): QuotePriceRule[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((raw, index) => {
        if (!raw || typeof raw !== 'object') return [];
        const row = raw as Record<string, unknown>;
        const title = String(row.title ?? row.naam ?? '').trim();
        if (!title) return [];

        const aliases = Array.isArray(row.aliases)
            ? row.aliases.map((alias) => String(alias).trim()).filter(Boolean)
            : [];
        const id = String(row.id ?? '').trim() || `prijsregel_${index + 1}`;
        const price = Math.max(0, parsePricingNumber(row.unitPriceExclBtw ?? row.prijsPerEenheidExclBtw ?? row.prijs));

        return [{
            id,
            title,
            unit: normalizePricingUnit(row.unit),
            unitPriceExclBtw: price,
            aliases,
            scope: String(row.scope ?? '').trim() || undefined,
            sourceQuoteIds: Array.isArray(row.sourceQuoteIds)
                ? row.sourceQuoteIds.map((quoteId) => String(quoteId).trim()).filter(Boolean)
                : undefined,
            updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : undefined,
        }];
    });
}

export function sanitizeQuotePriceLines(value: unknown): QuotePriceLine[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((raw, index) => {
        if (!raw || typeof raw !== 'object') return [];
        const row = raw as Record<string, unknown>;
        const title = String(row.title ?? row.naam ?? '').trim();
        if (!title) return [];

        const quantity = Math.max(0, parsePricingNumber(row.quantity ?? row.hoeveelheid ?? row.aantal));
        const unitPriceExclBtw = Math.max(0, parsePricingNumber(
            row.unitPriceExclBtw ?? row.prijsPerEenheidExclBtw ?? row.prijs,
        ));
        const source = row.source === 'ai' || row.source === 'regel' || row.source === 'handmatig'
            ? row.source
            : 'handmatig';
        const unit = normalizePricingUnit(row.unit);

        return [{
            id: String(row.id ?? '').trim() || createQuotePricingId(`regel${index + 1}`),
            title,
            unit,
            quantity,
            unitPriceExclBtw,
            category: normalizePricingCategory(row.category, title, unit),
            source,
            ruleId: String(row.ruleId ?? '').trim() || undefined,
            noteSectionId: String(row.noteSectionId ?? '').trim() || undefined,
            confidence: typeof row.confidence === 'number' ? Math.max(0, Math.min(1, row.confidence)) : undefined,
            explanation: String(row.explanation ?? '').trim() || undefined,
        }];
    });
}

export function sanitizeQuotePricing(value: unknown): QuotePricing {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { mode: 'unit_price', lines: [] };
    }

    const row = value as Record<string, unknown>;
    const mode = row.mode === 'detailed' || row.mode === 'mixed' ? row.mode : 'unit_price';
    return {
        mode,
        lines: sanitizeQuotePriceLines(row.lines ?? row.regels),
        updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : undefined,
    };
}

export function findMatchingQuotePriceRule(title: string, unit: QuotePricingUnit, rules: QuotePriceRule[]): QuotePriceRule | null {
    const normalizedTitle = normalizePricingTitle(title);
    if (!normalizedTitle) return null;

    return rules.find((rule) => {
        if (rule.unit !== unit) return false;
        const candidates = [rule.title, ...rule.aliases].map(normalizePricingTitle).filter(Boolean);
        return candidates.some((candidate) => candidate === normalizedTitle || candidate.includes(normalizedTitle) || normalizedTitle.includes(candidate));
    }) || null;
}
