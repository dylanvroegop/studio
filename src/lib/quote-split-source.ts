/** Vergelijk JSON-inhoud; de volgorde van objectvelden is geen offertewijziging. */
export function stableSplitSourceKey(value: unknown): string {
    return JSON.stringify(value, (_key, item: unknown) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
        const record = item as Record<string, unknown>;
        return Object.fromEntries(Object.keys(record).sort().map(key => [key, record[key]]));
    });
}

/** Ook eerder geopende vensters kunnen nog een gewone JSON.stringify-sleutel hebben. */
export function splitSourceChanges(previousKey: string, currentKey: string): string[] {
    if (previousKey === currentKey) return [];
    try {
        const previous = JSON.parse(previousKey) as unknown[];
        const current = JSON.parse(currentKey) as unknown[];
        const labels = ['de calculatieversie', 'de calculatiegegevens', 'de prijsinstellingen', 'de calculatieklussen'];
        return labels.filter((_label, index) => stableSplitSourceKey(previous[index]) !== stableSplitSourceKey(current[index]));
    } catch {
        return ['de brongegevens'];
    }
}

/** Een nieuw gecontroleerd AI-voorstel hoort bij de bron waarmee het is gemaakt. */
export function acceptSplitAnalysisSource(analysisKey: string, currentKey: string): string {
    if (splitSourceChanges(analysisKey, currentKey).length) {
        throw new Error('De offerte is tijdens de analyse gewijzigd. Voer de AI-analyse opnieuw uit; je invoer is behouden.');
    }
    return currentKey;
}
