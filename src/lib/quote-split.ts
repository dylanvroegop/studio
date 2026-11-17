import { automaticSplitCostKey, splitPartArea } from './quote-split-scope';
import { calculateQuoteTotals, normalizeDataJson, type QuoteSettings } from './quote-calculations';

export interface SplitMaterialRow {
    sourceCategory: 'groot' | 'verbruik';
    sourceIndex: number;
    item: Record<string, unknown>;
    /** Aantal, of euro excl. btw voor kostenposten. Ontbrekend = volledige bronregel. */
    allocation?: number;
}
export interface SplitDraft {
    id: string;
    title: string;
    materialRows: SplitMaterialRow[];
    totalHours?: number;
    marginAmount?: number;
    workJobIndex?: number | null;
    workDescription?: string;
    selectedKlusIds?: string[];
    surfaceM2?: number | null;
}
/** Kostenramingen zijn bedragen; fysieke materialen behouden hun eenheid en stukprijs. */
export function splitMaterialIsAmount(item: Record<string, unknown>): boolean {
    return /klein\s*materiaal.*schatting|handmatige.*correctie/i.test(String(item.product || ''));
}
export function splitMaterialTotal(item: Record<string, unknown>): number {
    return splitMaterialIsAmount(item)
        ? Math.round(Number(item.aantal) * Number(item.prijs_per_stuk) * 100) / 100
        : Number(item.aantal);
}

export function splitCents(amount: number, weights: number[]): number[] {
    const total = Math.round(amount * 100);
    const sum = weights.reduce((a, b) => a + Math.max(0, b), 0);
    let assigned = 0;
    return weights.map((weight, index) => {
        const next = index === weights.length - 1 ? total - assigned
            : Math.floor(total * (sum ? Math.max(0, weight) / sum : 1 / weights.length));
        assigned += next;
        return next / 100;
    });
}

/** Een splitsing verdeelt bestaande invoer; ze is geen herberekening of prijswijziging. */
export function planQuoteSplit(source: unknown, settings: QuoteSettings, drafts: SplitDraft[], jobIds: string[], hoursPerDay = 8, jobs: Record<string, unknown> = {}) {
    const data = normalizeDataJson(source);
    if (drafts.length < 2 || drafts.length > 20) throw new Error('Kies twee tot twintig deeloffertes.');
    if (new Set(drafts.map(d => d.id)).size !== drafts.length || drafts.some(d => !d.id || !d.title?.trim())) {
        throw new Error('Elke deelofferte heeft een eigen verwijzing en titel nodig.');
    }
    const usedRows = new Map<string, number>();
    const usedJobs = new Set<string>();
    const materials = { groot: data.grootmaterialen || [], verbruik: data.verbruiksartikelen || [] };
    const areas = drafts.map(d => splitPartArea(d, jobs));
    const autoRows = (['groot', 'verbruik'] as const).flatMap(category => materials[category].flatMap((item, index) => {
        const key = automaticSplitCostKey(item, data);
        return key ? [{ category, index, item, key }] : [];
    }));
    if (autoRows.length && areas.some(area => !(area > 0))) throw new Error('Vul voor elk deel de m² in om afvalkosten en naden automatisch te verdelen.');
    const autoAmounts = autoRows.map(row => splitCents(Number(row.item.aantal) * Number(row.item.prijs_per_stuk), areas));
    const hours = drafts.map(d => Number(d.totalHours));
    if (hours.some(n => !Number.isFinite(n) || n < 0) || Math.abs(hours.reduce((a, b) => a + b, 0) - Number(data.totaal_uren || 0)) > 0.000001) {
        throw new Error(`Verdeel precies ${data.totaal_uren || 0} uur; het totaal mag door splitsen niet veranderen.`);
    }
    const original = calculateQuoteTotals(data, settings, hoursPerDay);
    const margins = drafts.map(d => Number(d.marginAmount));
    if (margins.some(n => !Number.isFinite(n) || n < 0) || Math.round(margins.reduce((a,b) => a+b,0)*100) !== Math.round(original.winstMarge*100)) {
        throw new Error(`Verdeel de oorspronkelijke marge van € ${original.winstMarge.toFixed(2)} volledig.`);
    }
    const transports = splitCents(original.transportTotaal, hours);
    // Gemengd btw-tarief vereist een expliciete verdeling, die dit scherm nog niet biedt.
    if (Number(settings.arbeidBtwLaagUren) > 0) throw new Error('Splitsen met uren tegen laag btw-tarief is nog niet mogelijk. De offerte blijft ongewijzigd.');
    const parts = drafts.map((draft, index) => {
        const workJobs = data.werkbeschrijving_structured?.jobs || data.werkbeschrijving_jobs || [];
        if (draft.workJobIndex != null) {
            if (!Number.isInteger(draft.workJobIndex) || draft.workJobIndex < 0 || !workJobs[draft.workJobIndex]) throw new Error('De gekozen werkbeschrijving bestaat niet meer. Open splitsen opnieuw.');
        } else if (!draft.workDescription?.trim()) {
            throw new Error(`Schrijf een werkbeschrijving voor ${draft.title} of kies een bestaande beschrijving.`);
        }
        const rows = Array.isArray(draft.materialRows) ? draft.materialRows : [];
        if (!rows.length && !hours[index] && !autoRows.length) throw new Error(`${draft.title} heeft geen materialen of uren.`);
        const selected = { groot: [] as Record<string, unknown>[], verbruik: [] as Record<string, unknown>[] };
        const partRows = new Set<string>();
        rows.forEach(row => {
            if (row.sourceCategory !== 'groot' && row.sourceCategory !== 'verbruik') throw new Error('Onbekende productcategorie. Open splitsen opnieuw.');
            if (autoRows.some(auto => auto.category === row.sourceCategory && auto.index === row.sourceIndex)) return;
            const key = `${row.sourceCategory}:${row.sourceIndex}`;
            const item = materials[row.sourceCategory]?.[row.sourceIndex];
            if (!Number.isInteger(row.sourceIndex) || !item || partRows.has(key)) throw new Error('Een product ontbreekt of is dubbel binnen dezelfde deelofferte verdeeld.');
            partRows.add(key);
            const amountMode = splitMaterialIsAmount(item);
            const total = splitMaterialTotal(item);
            const allocation = row.allocation === undefined ? total : row.allocation;
            if (typeof allocation !== 'number' || !Number.isFinite(allocation) || allocation * (total < 0 ? -1 : 1) < 0
                || (amountMode && Math.abs(allocation * 100 - Math.round(allocation * 100)) > 0.000001)) {
                throw new Error(`Ongeldige verdeling voor ${item.product}: vul ${amountMode ? 'een bedrag met maximaal twee decimalen' : 'een geldig aantal'} in.`);
            }
            usedRows.set(key, (usedRows.get(key) || 0) + allocation);
            // Alleen de verdeling is bewerkbaar. Prijs en productgegevens komen uit de database.
            if (allocation !== 0) selected[row.sourceCategory].push(amountMode
                ? { ...item, aantal: 1, prijs_per_stuk: allocation, prijs_excl_btw: allocation }
                : { ...item, aantal: allocation });
        });
        if (!Array.isArray(draft.selectedKlusIds)) throw new Error('Verdeel ook de calculatieklussen.');
        draft.selectedKlusIds.forEach(id => {
            if (!jobIds.includes(id) || usedJobs.has(id)) throw new Error('Een calculatieklus ontbreekt of is dubbel verdeeld.');
            usedJobs.add(id);
        });
        const scopeCosts = { afval: 0, naden: 0 };
        autoRows.forEach((row, rowIndex) => {
            const amount = autoAmounts[rowIndex][index];
            scopeCosts[row.key] += amount;
            selected[row.category].push({ ...row.item, aantal: 1, prijs_per_stuk: amount, prijs_excl_btw: amount });
        });
        const days = Math.max(1, Math.ceil(hours[index] / hoursPerDay));
        const extras = {
            ...settings.extras,
            transport: { ...settings.extras.transport, mode: 'fixed' as const, vasteTransportkosten: transports[index] / days, tunnelkosten: 0 },
            winstMarge: { mode: 'fixed' as const, fixedAmount: margins[index], percentage: 0, basis: 'totaal' as const },
        };
        const partSettings = { ...settings, extras };
        const partData = { ...data, grootmaterialen: selected.groot, verbruiksartikelen: selected.verbruik, totaal_uren: hours[index], uren_specificatie: [], instellingen: partSettings, extras };
        return { data: partData, settings: partSettings, totals: calculateQuoteTotals(partData, partSettings, hoursPerDay), transportAmount: transports[index], areaM2: areas[index], scopeCosts };
    });
    for (const category of ['groot', 'verbruik'] as const) materials[category].forEach((item, index) => {
        if (automaticSplitCostKey(item, data)) return;
        const expected = splitMaterialTotal(item);
        const allocated = usedRows.get(`${category}:${index}`) || 0;
        if (Math.abs(allocated - expected) > 0.000001) {
            throw new Error(`Verdeel alle productregels volledig: ${item.product} heeft ${allocated.toLocaleString('nl-NL')} van ${expected.toLocaleString('nl-NL')} ${splitMaterialIsAmount(item) ? 'euro excl. btw' : String(item.eenheid || 'stuk')} toegewezen${Math.abs(allocated) > Math.abs(expected) ? ' (te veel / dubbel verdeeld)' : ''}.`);
        }
    });
    if (usedJobs.size !== jobIds.length) throw new Error('Wijs alle calculatieklussen aan precies één deelofferte toe.');
    const sum = parts.reduce((total, p) => total + Math.round(p.totals.totaalInclBtw * 100), 0);
    const differenceCents = sum - Math.round(original.totaalInclBtw * 100);
    // Afronding van btw kan per deel één cent verschillen.
    if (Math.abs(differenceCents) > drafts.length) throw new Error('De deelbedragen sluiten niet aan op de oorspronkelijke offerte. Er is niets gewijzigd.');
    return { original, parts, totalInclBtw: sum / 100, differenceCents };
}
