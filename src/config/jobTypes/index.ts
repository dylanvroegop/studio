import * as hsbVoorzetwand from './hsbVoorzetwand.config';
import * as metalstudTussenwand from './metalstudTussenwand.config';

// Measurement section types that can be toggled per job type
export type MeasurementSection = 'openingen' | 'leidingkoof' | 'vensterbanken' | 'dagkanten';

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
const WALL_SECTIONS: MeasurementSection[] = ['openingen', 'leidingkoof', 'vensterbanken', 'dagkanten'];
const CEILING_SECTIONS: MeasurementSection[] = ['openingen', 'leidingkoof'];
const ROOF_SECTIONS: MeasurementSection[] = ['openingen'];
const FACADE_SECTIONS: MeasurementSection[] = ['openingen', 'leidingkoof', 'vensterbanken', 'dagkanten'];

export const jobSections: Record<string, MeasurementSection[]> = {
    // Wanden
    'hsb-voorzetwand':        WALL_SECTIONS,
    'hsb-tussenwand':         WALL_SECTIONS,
    'metalstud-voorzetwand':  WALL_SECTIONS,
    'metalstud-tussenwand':   WALL_SECTIONS,
    'HBS-buiten-wand':        ['openingen', 'leidingkoof', 'vensterbanken', 'dagkanten'],
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
    'gevelbekleding-compleet': FACADE_SECTIONS,

    // Boeiboorden
    'boeiboorden-vervangen': ['leidingkoof'],

    // Vloeren
    'balklaag-constructievloer': ['leidingkoof'],
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
    'metalstud-tussenwand': metalstudTussenwand as JobTypeConfig,
    'HBS-buiten-wand': {
        ...defaultJobConfig,
        balkenConfig: {
            showBalkafstand: true,
            showStartpositie: true,
            options: {
                dblEindbalk: true,
                dblBovenbalk: true,
                dblOnderbalk: true,
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
