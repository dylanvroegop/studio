
import { MeasurementField, MaterialSection } from './job-registry';

export interface ComponentConfig {
    title: string;
    description: string;
    measurements: MeasurementField[];
    defaultMaterials?: MaterialSection[];
}

export const COMPONENT_REGISTRY: Record<string, ComponentConfig> = {
    // 1. Kozijnen
    kozijn: {
        title: 'Kozijn',
        description: 'Kozijn met maten, houtsoort, hang- en sluitwerk',
        measurements: [
            { key: 'breedte', label: 'Breedte', type: 'number', suffix: 'mm' },
            { key: 'hoogte', label: 'Hoogte', type: 'number', suffix: 'mm' },
        ],
    },
    // 2. Deuren
    deur: {
        title: 'Deur',
        description: 'Binnen- of buitendeur',
        measurements: [
            { key: 'breedte', label: 'Breedte', type: 'number', suffix: 'mm' },
            { key: 'hoogte', label: 'Hoogte', type: 'number', suffix: 'mm' },
            { key: 'aantal', label: 'Aantal', type: 'number', suffix: 'stuks' },
        ],
    },
    // 3. Boeiboorden
    boeiboord: {
        title: 'Boeiboord',
        description: 'Boeiboord incl. m1, hoogte, type materiaal',
        measurements: [
            { key: 'lengte', label: 'Lengte (m1)', type: 'number', suffix: 'mm' },
            { key: 'hoogte', label: 'Hoogte', type: 'number', suffix: 'mm' },
            { key: 'materiaal', label: 'Materiaal', type: 'text', placeholder: 'Trespa/Hout' },
        ]
    },
    // 3. Schoorsteen
    schoorsteen: {
        title: 'Schoorsteen',
        description: 'Incl. loodslabben, stenen, voegwerk',
        measurements: [
            { key: 'breedte', label: 'Breedte', type: 'number', suffix: 'mm' },
            { key: 'diepte', label: 'Diepte', type: 'number', suffix: 'mm' },
            { key: 'hoogte', label: 'Hoogte', type: 'number', suffix: 'mm' },
        ]
    },
    // 4. Vensterbanken
    vensterbank: {
        title: 'Vensterbank',
        description: 'Incl. lengte, diepte, materiaal',
        measurements: [
            { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm' },
            { key: 'diepte', label: 'Diepte', type: 'number', suffix: 'mm' },
            { key: 'materiaal', label: 'Materiaal', type: 'text', placeholder: 'Natuursteen/Hout' },
        ]
    }
};
