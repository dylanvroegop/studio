import { normalizeDataJson } from './quote-calculations';
import { grossSurface } from './joint-finishing-cost';

export interface SplitSurfacePart { selectedKlusIds?: string[]; surfaceM2?: number | null }
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const number = (v: unknown): number => Number(String(v ?? '').replace(',', '.'));
export function splitJobArea(jobInput: unknown): number {
    const job = record(jobInput), maatwerk = record(job.maatwerk);
    const kind = String(record(maatwerk.meta).type || job.categorie || '').toLowerCase();
    const rows = Array.isArray(maatwerk.basis) ? maatwerk.basis : Object.entries(job).find(([k,v]) => k.endsWith('_maatwerk') && Array.isArray(v))?.[1];
    if (!Array.isArray(rows) || !rows.length) return 0;
    const ceiling = kind.includes('plafond');
    const sides = Object.keys(record(record(job.materialen).materialen_lijst)).some(k => /(?:beplating_2|afwerkplaat.*(?:_2|zijde_?2|achter))/i.test(k)) ? 2 : 1;
    let total = 0;
    for (const raw of rows) {
        const row = record(raw);
        let area = number(row.netto_oppervlakte_m2 ?? row.oppervlakte_m2);
        if (!(area > 0)) {
            area = grossSurface(row, ceiling);
            if (!(area > 0)) return 0;
            for (const value of Array.isArray(row.openings) ? row.openings : []) {
                const opening = record(value);
                const width = number(opening.breedte ?? opening.width ?? opening.openingWidth);
                const height = number(ceiling ? (opening.length ?? opening.lengte ?? opening.hoogte ?? opening.height ?? opening.openingHeight) : (opening.hoogte ?? opening.height ?? opening.openingHeight));
                if (!(width > 0 && height > 0)) return 0;
                area -= width * height / 1e6;
            }
        }
        const count = row.aantal == null ? 1 : number(row.aantal);
        if (!(area > 0 && count > 0)) return 0;
        total += area * count * sides;
    }
    return Number(total.toFixed(6));
}
export function splitPartArea(part: SplitSurfacePart, jobs: Record<string, unknown>): number {
    if (part.surfaceM2 != null) return Number.isFinite(part.surfaceM2) && part.surfaceM2 >= 0 ? part.surfaceM2 : 0;
    const areas = (part.selectedKlusIds || []).map(id => splitJobArea(jobs[id]));
    return areas.length && areas.every(n => n > 0) ? areas.reduce((a,b) => a+b,0) : 0;
}
export function automaticSplitCostKey(item: Record<string, unknown>, source: unknown): 'afval' | 'naden' | null {
    const description = normalizeDataJson(source).werkbeschrijving_structured;
    const name = String(item.product || item.materiaal || item.materiaalnaam || '').trim().toLowerCase();
    if (name === 'afvalkosten' && description?.afvalAfvoeren === true) return 'afval';
    if (name === 'naden schilderklaar' && description?.nadenVullenInbegrepen === true && description?.nadenVullenAfwerkingsniveau === 'schilderklaar') return 'naden';
    return null;
}
