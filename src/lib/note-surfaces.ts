export interface NoteMeasurement {
    title: string;
    length: string;
    width: string;
    height: string;
    thickness: string;
}
export interface NoteSurfaceCandidate extends NoteMeasurement {
    key: string;
    section: string;
    notes: string;
}
export interface NoteSurfaceSelection {
    fingerprint: string;
    surfaces: Array<{ key: string; kind: 'wand' | 'plafond' }>;
}

function millimeters(value: string): number {
    const clean = value.trim().replace(/\s*mm$/i, '').replace(',', '.');
    return /^\d+(?:\.\d+)?$/.test(clean) ? Number(clean) : 0;
}

// Dikte is nooit een oppervlaktemaat. Bij twee maten gebruiken we beide;
// bij drie maten is een wand lengte × hoogte en een plafond lengte × breedte.
export function noteSurfaceArea(row: NoteMeasurement, kind: 'wand' | 'plafond' = 'wand'): number {
    const length = millimeters(row.length);
    const width = millimeters(row.width);
    const height = millimeters(row.height);
    if (length && width && height) return length * (kind === 'plafond' ? width : height) / 1e6;
    const dimensions = [length, width, height].filter(value => value > 0);
    return dimensions.length === 2 ? dimensions[0] * dimensions[1] / 1e6 : 0;
}

export function collectNoteSurfaces(sections: Array<{ title: string; notes: string; maatwerkLines: NoteMeasurement[] }>): NoteSurfaceCandidate[] {
    return sections.flatMap((section, sectionIndex) => section.maatwerkLines.flatMap((row, index) => {
        if (![row.title, row.length, row.width, row.height, row.thickness].some(value => value.trim())) return [];
        return [{ key: `${sectionIndex}:${index}`, section: section.title, notes: section.notes,
            title: row.title, length: row.length, width: row.width, height: row.height, thickness: row.thickness }];
    }));
}

export function validNoteSurfaceSelection(value: unknown, candidates: NoteSurfaceCandidate[], fingerprint: string): NoteSurfaceSelection | null {
    if (!value || typeof value !== 'object') return null;
    const row = value as Partial<NoteSurfaceSelection>;
    if (row.fingerprint !== fingerprint || !Array.isArray(row.surfaces) || !row.surfaces.length) return null;
    const keys = new Set<string>();
    for (const surface of row.surfaces) {
        if (!surface || (surface.kind !== 'wand' && surface.kind !== 'plafond') || keys.has(surface.key)) return null;
        const candidate = candidates.find(item => item.key === surface.key);
        if (!candidate || !(noteSurfaceArea(candidate, surface.kind) > 0)) return null;
        keys.add(surface.key);
    }
    return { fingerprint, surfaces: row.surfaces };
}

export function noteSurfaceJobs(candidates: NoteSurfaceCandidate[], selection: NoteSurfaceSelection | null): Record<string, unknown> {
    if (!selection) return {};
    return Object.fromEntries(selection.surfaces.flatMap(surface => {
        const row = candidates.find(candidate => candidate.key === surface.key);
        if (!row) return [];
        return [[surface.key, { maatwerk: { meta: { type: surface.kind, title: row.title || surface.kind },
            basis: [{ oppervlakte_m2: noteSurfaceArea(row, surface.kind) }] } }]];
    }));
}
