import { grossSurface } from './joint-finishing-cost';

export const NOTE_SHAPE_FIELDS = {
    hoogteLinks: 'Hoogte links', hoogteRechts: 'Hoogte rechts', hoogteNok: 'Hoogte top',
    lengte1: 'Lengte 1', lengte2: 'Lengte 2', hoogte1: 'Hoogte 1', hoogte2: 'Hoogte 2', hoogte3: 'Hoogte 3',
} as const;
export const NOTE_SHAPES = {
    rectangle: 'Rechthoek', slope: 'Schuin / driehoek', gable: 'Punt', 'l-shape': 'L-vorm', 'u-shape': 'U-vorm',
} as const;
export type NoteShapeMeasurements = { shape?: string } & Partial<Record<keyof typeof NOTE_SHAPE_FIELDS, string>>;

export function noteShapeFields(row: Record<string, unknown> | NoteShapeMeasurements): NoteShapeMeasurements {
    return Object.fromEntries(['shape', ...Object.keys(NOTE_SHAPE_FIELDS)]
        .filter(key => row[key as keyof NoteShapeMeasurements] != null)
        .map(key => [key, String(row[key as keyof NoteShapeMeasurements]).trim()]));
}

export function formatNoteShape(row: NoteShapeMeasurements): string {
    const fields = Object.entries(NOTE_SHAPE_FIELDS)
        .filter(([key]) => row[key as keyof typeof NOTE_SHAPE_FIELDS] !== undefined && row[key as keyof typeof NOTE_SHAPE_FIELDS] !== '')
        .map(([key, label]) => `${label}: ${row[key as keyof typeof NOTE_SHAPE_FIELDS]} mm`);
    return [row.shape ? `Vorm: ${row.shape}` : '', ...fields].filter(Boolean).join(' | ');
}

export function parseNoteShape(text: string): NoteShapeMeasurements {
    const shape = text.match(/(?:^|\|)\s*Vorm:\s*([^|]+)/i)?.[1]?.trim();
    return {
        ...(shape ? { shape } : {}),
        ...Object.fromEntries(Object.entries(NOTE_SHAPE_FIELDS).flatMap(([key, label]) => {
            const value = text.match(new RegExp(`(?:^|\\|)\\s*${label}:\\s*([^|]*)`, 'i'))?.[1]?.replace(/\bmm\b/gi, '').trim();
            return value !== undefined ? [[key, value]] : [];
        })),
    };
}

export interface NoteMeasurement extends NoteShapeMeasurements {
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

/** Oude calculatieregels bevatten twee vlakken; de onderlengte staat nog in de titel. */
export function legacyBoeiboordDimensions(row: NoteMeasurement): { title: string; bottomLength: string } | null {
    const match = row.title.match(/^(.*? — Boeiboord \d+)\s*\(Lengte Onderzijde\s+(\d+(?:[.,]\d+)?)\s*mm(?:;.*)?\)$/i);
    return match ? { title: match[1], bottomLength: match[2] } : null;
}

export function legacyBoeiboordAreas(row: NoteMeasurement): { front: number; bottom: number; bottomLength: string } | null {
    const dimensions = legacyBoeiboordDimensions(row);
    if (!dimensions) return null;
    const triangle = row.shape === 'slope' || row.shape === 'gable';
    return {
        front: millimeters(row.length) * millimeters(row.height) / (triangle ? 2e6 : 1e6),
        bottom: millimeters(dimensions.bottomLength) * millimeters(row.width) / 1e6,
        bottomLength: dimensions.bottomLength,
    };
}

// Dikte is nooit een oppervlaktemaat. Bij twee maten gebruiken we beide;
// bij drie maten is een wand lengte × hoogte en een plafond lengte × breedte.
export function noteSurfaceArea(row: NoteMeasurement, kind: 'wand' | 'plafond' = 'wand'): number {
    const boeiboord = legacyBoeiboordAreas(row);
    if (boeiboord) return boeiboord.front + boeiboord.bottom;
    if (row.shape && row.shape !== 'rectangle' && row.shape !== 'rect') {
        return grossSurface({ ...row, lengte: row.length, breedte: row.width, hoogte: row.height }, kind === 'plafond');
    }
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
            title: row.title, length: row.length, width: row.width, height: row.height, thickness: row.thickness,
            ...noteShapeFields(row) }];
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
