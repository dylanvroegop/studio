import type { MaterialItem, WorkDescriptionStructured } from './quote-calculations';

export type ScopeCostKey = 'afval' | 'steiger' | 'naden';
export const SCOPE_COST_LABELS: Record<ScopeCostKey, string> = {
    afval: 'Afvalkosten',
    steiger: 'Steigerkosten',
    naden: 'Naden schilderklaar',
};
interface Materials {
    groot: MaterialItem[];
    verbruik: MaterialItem[];
}
const round = (value: number): number => Number(value.toFixed(2));
const costKey = (item: MaterialItem): ScopeCostKey | undefined =>
    (Object.keys(SCOPE_COST_LABELS) as ScopeCostKey[]).find(
        (key) => SCOPE_COST_LABELS[key].toLowerCase() === String(item.product || '').trim().toLowerCase(),
    );
const amount = (item: MaterialItem): number => (Number(item.prijs_per_stuk) || 0) * (Number(item.aantal) || 0);

export function getScopeCosts(materials: Materials): Record<ScopeCostKey | 'groot' | 'verbruik', number> {
    const result = { afval: 0, steiger: 0, naden: 0, groot: 0, verbruik: 0 };
    for (const category of ['groot', 'verbruik'] as const) {
        for (const item of materials[category]) {
            const key = costKey(item);
            if (key) {
                result[key] += amount(item);
                result[category] += amount(item);
            }
        }
    }
    return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, round(value)])) as typeof result;
}

// Vervang alleen de gekozen kostenpost; behoud oude extra kosten en alle andere materialen.
export function setScopeCost(materials: Materials, key: ScopeCostKey, value: number): Materials {
    const next = {
        groot: materials.groot.filter((item) => costKey(item) !== key),
        verbruik: materials.verbruik.filter((item) => costKey(item) !== key),
    };
    const target = round(Math.max(0, Number.isFinite(value) ? value : 0));
    if (target > 0) next.verbruik.push({ product: SCOPE_COST_LABELS[key], aantal: 1, eenheid: 'stuk', prijs_per_stuk: target });
    return next;
}

export function getMissingScopeCosts(
    description: Pick<WorkDescriptionStructured, 'afvalAfvoeren' | 'steigerInbegrepen' | 'jobs'>,
    costs: Pick<Record<ScopeCostKey, number>, 'afval' | 'steiger'>,
): Pick<Record<ScopeCostKey, boolean>, 'afval' | 'steiger'> {
    // De zichtbare schakelaars gelden voor de hele offerte; oude kluswaarden zijn niet leidend.
    return {
        afval: description.afvalAfvoeren === true && !(costs.afval > 0),
        steiger: description.steigerInbegrepen === true && !(costs.steiger > 0),
    };
}

// Huur per begonnen werkweek van vijf dagen, minimaal één week bij inschakelen.
export function calculateScaffoldCost(totalHours: number, hoursPerDay = 8): number {
    const dayHours = Number.isFinite(hoursPerDay) && hoursPerDay > 0 ? hoursPerDay : 8;
    const hours = Number.isFinite(totalHours) ? Math.max(0, totalHours) : 0;
    return Math.max(1, Math.ceil(hours / (dayHours * 5))) * 150;
}
