import * as hsbVoorzetwand from './hsbVoorzetwand.config';
import * as metalstudTussenwand from './metalstudTussenwand.config';

// Measurement section types that can be toggled per job type
export type MeasurementSection = 'openingen' | 'koof' | 'vensterbanken' | 'dagkanten';

// Define the interface for the config to ensure type safety
export interface JobTypeConfig {
    // Which extra measurement sections to show on the measurement page
    sections: MeasurementSection[];
    openingConfig: {
        typeOptions: string[];
        constructionOptions: {
            dblStijl: boolean;
            trimmer: boolean;
            dblBovendorpel: boolean;
            dblOnderdorpel: boolean;
            dagkanten: boolean;
            vensterbank?: boolean;
        };
    };
    balkenConfig: {
        showBalkafstand: boolean;
        showStartpositie: boolean;
        options: {
            dblEindbalk?: boolean;
            dblBovenbalk?: boolean;
            dblOnderbalk?: boolean;
            // Add other potential options here
            surroundingBeams?: boolean;
        };
    };
}

// ─── Sections per job slug ───────────────────────────────────────────
// Add/remove slugs here to control which measurement cards appear.
// Only slugs listed here get extra sections; everything else gets none.
const WALL_SECTIONS: MeasurementSection[] = ['openingen', 'koof', 'vensterbanken', 'dagkanten'];
const CEILING_SECTIONS: MeasurementSection[] = ['openingen', 'koof'];
const ROOF_SECTIONS: MeasurementSection[] = ['openingen'];
const FACADE_SECTIONS: MeasurementSection[] = ['openingen', 'koof', 'vensterbanken', 'dagkanten'];

export const jobSections: Record<string, MeasurementSection[]> = {
    // Wanden
    'hsb-voorzetwand':        WALL_SECTIONS,
    'hsb-tussenwand':         WALL_SECTIONS,
    'metalstud-voorzetwand':  WALL_SECTIONS,
    'metalstud-tussenwand':   WALL_SECTIONS,
    'HBS-buiten-wand':        ['openingen', 'koof', 'vensterbanken', 'dagkanten'],
    'hbs-buiten-wand':        ['openingen', 'koof', 'vensterbanken', 'dagkanten'],
    'hsb-buiten-wand':        ['openingen', 'koof', 'vensterbanken', 'dagkanten'],
    'knieschotten':           WALL_SECTIONS,
    'cinewall-tv-wand':       WALL_SECTIONS,

    // Plafonds
    'plafond-houten-framework': CEILING_SECTIONS,
    'plafond-metalstud':        CEILING_SECTIONS,

    // Dakrenovatie
    'hellend-dak':       ROOF_SECTIONS,
    'epdm-dakbedekking': ROOF_SECTIONS,
    'golfplaat-dak':     ROOF_SECTIONS,

    // Gevelbekleding
    'gevelbekleding-trespa-hpl': FACADE_SECTIONS,
    'gevelbekleding-keralit': FACADE_SECTIONS,
    'gevelbekleding-hout': FACADE_SECTIONS,

    // Boeiboorden
    'boeiboorden-vervangen': ['koof'],

    // Vloeren
    'balklaag-constructievloer': ['koof'],
    'vliering-maken': ['openingen'],
    'massief-houten-vloer': ['openingen'],
    'laminaat-pvc': ['openingen'],

    // Schuttingen
    'schutting-hout': ['openingen'],
};

export const defaultJobConfig: JobTypeConfig = {
    sections: [],
    openingConfig: {
        typeOptions: ['Sparing', 'Overig'],
        constructionOptions: {
            dblStijl: false,
            trimmer: false,
            dblBovendorpel: false,
            dblOnderdorpel: false,
            dagkanten: false,
            vensterbank: false
        }
    },
    balkenConfig: {
        showBalkafstand: true,
        showStartpositie: true,
        options: {
            dblEindbalk: false,
            dblBovenbalk: false,
            dblOnderbalk: false,
            surroundingBeams: true
        }
    }
};

export const jobTypeConfigs: Record<string, JobTypeConfig> = {
    'hsb-voorzetwand': hsbVoorzetwand as JobTypeConfig,
    'hsb-tussenwand': hsbVoorzetwand as JobTypeConfig,
    'metalstud-voorzetwand': hsbVoorzetwand as JobTypeConfig,
    'metalstud-tussenwand': metalstudTussenwand as JobTypeConfig,
    'HBS-buiten-wand': hsbVoorzetwand as JobTypeConfig,
    'hbs-buiten-wand': hsbVoorzetwand as JobTypeConfig,
    'hsb-buiten-wand': hsbVoorzetwand as JobTypeConfig,
    'plafond-metalstud': {
        ...defaultJobConfig,
        balkenConfig: {
            ...defaultJobConfig.balkenConfig,
            options: {
                ...defaultJobConfig.balkenConfig.options,
                surroundingBeams: false
            }
        }
    },
};

export function getJobConfig(slug: string): JobTypeConfig {
    const base = jobTypeConfigs[slug] || defaultJobConfig;
    // Merge centralized sections into the config
    return {
        ...base,
        sections: jobSections[slug] || base.sections || [],
    };
}

// ─── Preset compatibility groups ─────────────────────────────────────
const PRESET_GROUPS: Record<string, string> = {
    'hsb-voorzetwand': 'hsb-binnenwand',
    'hsb-tussenwand': 'hsb-binnenwand',
    'metalstud-voorzetwand': 'metalstud-binnenwand',
    'metalstud-tussenwand': 'metalstud-binnenwand',
};

const PRESET_GROUP_MEMBERS: Record<string, string[]> = {
    'hsb-binnenwand': ['hsb-voorzetwand', 'hsb-tussenwand'],
    'metalstud-binnenwand': ['metalstud-voorzetwand', 'metalstud-tussenwand'],
};

// Old slugs that should remain readable after refactors/renames.
const LEGACY_PRESET_JOB_TYPE_ALIASES: Record<string, string[]> = {
    'maatwerk-kozijnen': ['raamkozijn-maatwerk'],
    'epdm-dakbedekking': ['epdm-dak'],
    'HBS-buiten-wand': ['hsb-buiten-wand', 'hsb-buitenwand'],
    'Schuifdeuren': ['schuifdeuren', 'schuif-deuren'],
};

function normalizePresetSlugKey(value: string): string {
    return String(value || '').trim().toLowerCase();
}

const KNOWN_PRESET_JOB_TYPES = new Set<string>([
    ...Object.keys(jobSections),
    ...Object.keys(jobTypeConfigs),
    ...Object.keys(PRESET_GROUPS),
    ...Object.values(PRESET_GROUP_MEMBERS).flat(),
    ...Object.keys(LEGACY_PRESET_JOB_TYPE_ALIASES),
]);

const PRESET_JOB_TYPE_BY_NORMALIZED_KEY = new Map<string, string>();
KNOWN_PRESET_JOB_TYPES.forEach((slug) => {
    const normalized = normalizePresetSlugKey(slug);
    if (!normalized || PRESET_JOB_TYPE_BY_NORMALIZED_KEY.has(normalized)) return;
    PRESET_JOB_TYPE_BY_NORMALIZED_KEY.set(normalized, slug);
});

const LEGACY_PRESET_JOB_TYPE_ALIAS_TO_CANONICAL = new Map<string, string>();
Object.entries(LEGACY_PRESET_JOB_TYPE_ALIASES).forEach(([canonical, aliases]) => {
    aliases.forEach((alias) => {
        const normalizedAlias = normalizePresetSlugKey(alias);
        if (!normalizedAlias || LEGACY_PRESET_JOB_TYPE_ALIAS_TO_CANONICAL.has(normalizedAlias)) return;
        LEGACY_PRESET_JOB_TYPE_ALIAS_TO_CANONICAL.set(normalizedAlias, canonical);
    });
});

function canonicalizePresetJobType(slug: string): string {
    const normalized = normalizePresetSlugKey(slug);
    if (!normalized) return slug;

    const canonicalAlias = LEGACY_PRESET_JOB_TYPE_ALIAS_TO_CANONICAL.get(normalized);
    if (canonicalAlias) return canonicalAlias;

    const known = PRESET_JOB_TYPE_BY_NORMALIZED_KEY.get(normalized);
    if (known) return known;

    return slug;
}

function expandPresetJobTypeCompatibility(slug: string): string[] {
    const canonical = canonicalizePresetJobType(slug);
    const unique = new Set<string>();
    const normalizedCanonical = normalizePresetSlugKey(canonical);

    if (canonical) unique.add(canonical);

    Object.entries(LEGACY_PRESET_JOB_TYPE_ALIASES).forEach(([candidateCanonical, aliases]) => {
        const normalizedCandidate = normalizePresetSlugKey(candidateCanonical);
        if (normalizedCandidate !== normalizedCanonical) return;
        aliases.forEach((alias) => {
            if (alias) unique.add(alias);
        });
    });

    // Also include legacy aliases that resolve to this canonical slug.
    LEGACY_PRESET_JOB_TYPE_ALIAS_TO_CANONICAL.forEach((candidateCanonical, normalizedAlias) => {
        if (normalizePresetSlugKey(candidateCanonical) !== normalizedCanonical) return;
        const alias = PRESET_JOB_TYPE_BY_NORMALIZED_KEY.get(normalizedAlias) || normalizedAlias;
        if (alias) unique.add(alias);
    });

    return Array.from(unique);
}

export function resolvePresetJobTypeAlias(slug: string): string {
    return canonicalizePresetJobType(slug);
}

export function getPresetGroup(slug: string): string | null {
    const canonical = canonicalizePresetJobType(slug);
    return PRESET_GROUPS[canonical] || null;
}

export function getPresetKey(slug: string): string {
    return getPresetGroup(slug) || slug;
}

export function getPresetCompatibleJobTypes(slug: string): string[] {
    const canonical = canonicalizePresetJobType(slug);
    const group = getPresetGroup(canonical);
    if (!group) return expandPresetJobTypeCompatibility(canonical);

    const members = PRESET_GROUP_MEMBERS[group] || [canonical];
    const unique = new Set<string>();
    members.forEach((memberSlug) => {
        expandPresetJobTypeCompatibility(memberSlug).forEach((candidate) => unique.add(candidate));
    });
    return Array.from(unique);
}
