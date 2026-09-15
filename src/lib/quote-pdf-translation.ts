export interface QuotePdfTranslationEntry {
    source: string;
    english: string;
}

export interface QuotePdfTranslation {
    version: 1;
    entries: QuotePdfTranslationEntry[];
}

// Cijfers blijven letterlijk behouden, inclusief decimalen, maten en percentages.
function numericTokens(text: string): string {
    return JSON.stringify((text.match(/\d+(?:[.,]\d+)*|[€£$%]/g) || []).sort());
}

export function validateQuotePdfTranslations(sources: string[], values: unknown): QuotePdfTranslation {
    if (!Array.isArray(values) || values.length !== sources.length) {
        throw new Error('De Engelse vertaling is onvolledig. Probeer opnieuw.');
    }
    const entries = sources.map((source, index) => {
        const english = values[index];
        if (typeof english !== 'string' || !english.trim() || english.length > Math.max(500, source.length * 4)) {
            throw new Error('De Engelse vertaling bevat een ongeldige tekst. Probeer opnieuw.');
        }
        if (numericTokens(source) !== numericTokens(english)) {
            throw new Error('De vertaling wijzigde een getal. Er is niets opgeslagen. Probeer opnieuw.');
        }
        if (JSON.stringify((source.match(/\{\{[^{}]+\}\}/g) || []).sort()) !== JSON.stringify((english.match(/\{\{[^{}]+\}\}/g) || []).sort())) {
            throw new Error('De vertaling wijzigde een invulveld. Probeer opnieuw.');
        }
        return { source, english: english.trim() };
    });
    return { version: 1, entries };
}

export function createQuotePdfTranslator(
    language?: 'nl' | 'en',
    translation?: QuotePdfTranslation,
): (source: string) => string {
    if (language !== 'en') return (source) => source;
    const entries = translation?.version === 1 && Array.isArray(translation.entries) ? translation.entries : [];
    const lookup = new Map(entries.map((entry) => [entry.source, entry.english]));
    return (source) => {
        if (!source.trim()) return source;
        const english = lookup.get(source);
        if (!english?.trim() || numericTokens(source) !== numericTokens(english)) {
            throw new Error('De Engelse vertaling ontbreekt of de offertetekst is gewijzigd. Klik op English in het PDF-tabblad om te vertalen.');
        }
        return english;
    };
}
