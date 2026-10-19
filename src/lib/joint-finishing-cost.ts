// Prijzen uit de Bouwmaat-screenshots van 17-10-2026 (excl. btw).
// Verbruik is een expliciete calculatieraming voor 2 vulgangen + 1 finishgang,
// geen door Knauf gegarandeerd verbruik. Zie docs/joint-finishing-cost.md.
export const JOINT_FINISHING_RATES = { AK2: 0.77, AK4: 1.16 } as const;
export interface JointFinishingCost {
    amount: number;
    area: number;
    detail: string;
    errors: string[];
}
type Row = Record<string, any>;
const number = (v: unknown): number => Number(String(v ?? '').replace(',', '.')) || 0;
const object = (v: unknown): Row => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {};

// Gebruik de vormmaten uit de calculatie, net als de wandtekening.
// Een puntwand bewaart de zijhoogte in hoogte en de top in hoogteNok.
function grossSurface(row: Row, ceiling: boolean): number {
    const length = number(row.lengte);
    const height = number(ceiling ? row.breedte : row.hoogte);
    const shape = row.shape || 'rectangle';
    if (shape === 'rectangle' || shape === 'rect') return length * height / 1e6;
    if (ceiling) return 0;
    if (shape === 'gable') {
        if ((row.hoogte == null || row.hoogte === '')
            && (row.hoogteLinks == null || row.hoogteLinks === '' || row.hoogteRechts == null || row.hoogteRechts === '')) return 0;
        const left = number(row.hoogteLinks) || height;
        const right = number(row.hoogteRechts) || height;
        const peak = number(row.hoogteNok);
        if (length <= 0 || left < 0 || right < 0 || peak <= 0 || peak < Math.max(left, right)) return 0;
        // Twee trapezia, met de nok halverwege de wand.
        return length * (left + 2 * peak + right) / 4e6;
    }
    if (shape === 'slope') {
        const left = number(row.hoogteLinks);
        const right = number(row.hoogteRechts);
        if (row.hoogteLinks == null || row.hoogteLinks === '' || row.hoogteRechts == null || row.hoogteRechts === '') return 0;
        if (length <= 0 || left < 0 || right < 0) return 0;
        return length * (left + right) / 2e6;
    }
    return 0;
}

export function calculateJointFinishingCost(jobsInput: unknown): JointFinishingCost {
    const errors: string[] = [];
    let amount = 0;
    let area = 0;
    const parts: string[] = [];
    const jobs = Object.values(object(jobsInput)).map(object);
    let candidates = 0;
    for (const job of jobs) {
        const maatwerk = object(job.maatwerk);
        const meta = object(maatwerk.meta);
        const kind = String(meta.type || job.categorie || '').toLowerCase();
        const ceiling = kind.includes('plafond');
        if (!ceiling && !kind.includes('wand')) continue;
        candidates++;
        const title = String(meta.title || job.title || (ceiling ? 'Plafond' : 'Wand'));
        const selections = Object.entries(object(object(job.materialen).materialen_lijst));
        const boards = selections.filter(([key]) => /^(afwerkplaat|beplating)(_|$)/.test(key))
            .map(([, value]) => object(object(value).material));
        const text = boards.map(b => `${b.materiaalnaam || ''} ${b.subsectie || b.sub_categorie || ''}`).join(' ');
        if (/\bRK\b|stucplaat/i.test(text)) {
            errors.push(`${title}: RK/stucplaat geselecteerd; kies AK2/AK4 voor deze nadenraming.`);
            continue;
        }
        // Binnenwanden met twee afgewerkte zijden tellen beide zichtvlakken, nooit de plaatlagen.
        const sideCount = selections.some(([key]) => /(?:beplating_2|afwerkplaat.*(?:_2|zijde_?2|achter))/i.test(key)) ? 2 : 1;
        const edge = /\b(?:AK4|4AK)\b/i.test(text) ? 'AK4' : /\b(?:AK2|2AK|AK)\b/i.test(text) ? 'AK2' : ceiling ? 'AK4' : 'AK2';
        const basis = Array.isArray(maatwerk.basis) ? maatwerk.basis :
            Object.entries(job).find(([key, v]) => key.endsWith('_maatwerk') && Array.isArray(v))?.[1];
        if (!Array.isArray(basis) || !basis.length) {
            errors.push(`${title}: m² ontbreken; vul de maten van de klus in.`);
            continue;
        }
        let jobArea = 0;
        let invalid = false;
        for (const raw of basis) {
            const row = object(raw);
            let surface = number(row.netto_oppervlakte_m2 ?? row.oppervlakte_m2);
            if (!(surface > 0)) {
                surface = grossSurface(row, ceiling);
                if (!(surface > 0)) { invalid = true; break; }
                for (const opening of Array.isArray(row.openings) ? row.openings : []) {
                    const width = number(opening.breedte ?? opening.width ?? opening.openingWidth);
                    const h = number(opening.hoogte ?? opening.height ?? opening.openingHeight);
                    if (!width || !h) { invalid = true; break; }
                    surface -= width * h / 1e6;
                }
            }
            if (!(surface > 0)) invalid = true;
            jobArea += surface * (row.aantal == null ? 1 : number(row.aantal)) * sideCount;
        }
        if (invalid || !(jobArea > 0)) {
            errors.push(`${title}: m² ontbreken of de vorm is niet eenduidig; controleer de maten.`);
            continue;
        }
        area += jobArea;
        amount += jobArea * JOINT_FINISHING_RATES[edge];
        parts.push(`${jobArea.toLocaleString('nl-NL', { maximumFractionDigits: 2 })} m² ${edge} × € ${JOINT_FINISHING_RATES[edge].toFixed(2).replace('.', ',')}`);
    }
    if (!candidates) errors.push('M² van wanden/plafonds ontbreken; voeg een klus met maten toe.');
    // Geen onvolledige totaalprijs presenteren als slechts een deel van de klussen bekend is.
    return { amount: errors.length ? 0 : Number(amount.toFixed(2)), area, detail: parts.join(' + '), errors };
}
