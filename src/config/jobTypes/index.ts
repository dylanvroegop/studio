import * as hsbVoorzetwand from './hsbVoorzetwand.config';

// Define the interface for the config to ensure type safety
export interface JobTypeConfig {
    openingConfig: {
        typeOptions: string[];
        constructionOptions: {
            dblStijl: boolean;
            trimmer: boolean;
            dblBovendorpel: boolean;
            dblOnderdorpel: boolean;
            dagkanten: boolean;
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

export const jobTypeConfigs: Record<string, JobTypeConfig> = {
    'hsb-voorzetwand': hsbVoorzetwand as JobTypeConfig,
    // Add others as needed, defaulting to HSB-like or specific defaults
};

export const defaultJobConfig: JobTypeConfig = {
    openingConfig: {
        typeOptions: ['Sparing', 'Overig'],
        constructionOptions: {
            dblStijl: false,
            trimmer: false,
            dblBovendorpel: false,
            dblOnderdorpel: false,
            dagkanten: false
        }
    },
    balkenConfig: {
        showBalkafstand: true, // Defaulting true for most walls/ceilings
        showStartpositie: true,
        options: {
            dblEindbalk: false,
            dblBovenbalk: false,
            dblOnderbalk: false,
            surroundingBeams: true // Default for generic frames often
        }
    }
};

export function getJobConfig(slug: string): JobTypeConfig {
    return jobTypeConfigs[slug] || defaultJobConfig;
}
