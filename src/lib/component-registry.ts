
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
        measurements: [],
    },
    // 2. Deuren
    deur: {
        title: 'Deur',
        description: 'Binnen- of buitendeur',
        measurements: [],
    },
    // 3. Boeiboorden
    boeiboord: {
        title: 'Boeiboord',
        description: 'Boeiboord incl. m1, hoogte, type materiaal',
        measurements: [
            { key: 'lengte', label: 'Lengte (m1)', type: 'number', suffix: 'mm', placeholder: 'Bijv. 5000' },
            { key: 'hoogte', label: 'Hoogte Voorzijde', type: 'number', suffix: 'mm', placeholder: 'Bijv. 250' },
            { key: 'breedte', label: 'Breedte Onderzijde', type: 'number', suffix: 'mm', placeholder: 'Bijv. 300' },

            { key: 'balkafstand', label: 'Balkafstand (h.o.h.)', type: 'number', suffix: 'mm', defaultValue: 600, group: 'spacing' },
            { key: 'latafstand', label: 'Latafstand Voorzijde (h.o.h.)', type: 'number', suffix: 'mm', defaultValue: 300, group: 'spacing' },
            { key: 'onderzijde_latafstand', label: 'Latafstand Onderzijde (h.o.h.)', type: 'number', suffix: 'mm', defaultValue: 300, group: 'spacing' },

            { key: 'kopkanten', label: 'Kopkanten Toevoegen', type: 'boolean', defaultValue: 'false' },
            { key: 'kopkant_breedte', label: 'Breedte Kopkant', type: 'number', suffix: 'mm', optional: true },
            { key: 'kopkant_hoogte', label: 'Hoogte Kopkant', type: 'number', suffix: 'mm', optional: true },
        ],
        defaultMaterials: [
            { label: 'Beplating', categoryFilter: 'Gevelbekleding', category: 'beplating', key: 'boeiboord_plaat', category_ultra_filter: '' },
            { label: 'Afwerking', categoryFilter: 'Verf & Afwerking', category: 'afwerking', key: 'boeiboord_afwerking', category_ultra_filter: '' }
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
        description: 'Incl. lengte',
        measurements: [
            { key: 'lengte', label: 'Totale Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 1100' },
            { key: 'uitstekLinks', label: 'Oversteek Links', type: 'number', suffix: 'mm', defaultValue: 50 },
            { key: 'uitstekRechts', label: 'Oversteek Rechts', type: 'number', suffix: 'mm', defaultValue: 50 },
        ],
        defaultMaterials: [
            { label: 'Vensterbank', categoryFilter: 'Vensterbanken', category: 'afwerking', key: 'vensterbanken', category_ultra_filter: '' },
        ]
    },
    // 8. Dagkant
    dagkant: {
        title: 'Dagkant',
        description: 'Afwerking rondom kozijn',
        measurements: [
            { key: 'lengte', label: 'Totale Lengte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 3200' },
            { key: 'diepte', label: 'Diepte', type: 'number', suffix: 'mm', placeholder: 'Bijv. 150' },
        ],
        defaultMaterials: [
            { label: 'Dagkanten', categoryFilter: 'Plaatmateriaal Interieur', category: 'afwerking', key: 'dagkanten', category_ultra_filter: '' },
        ]
    },
    // 5. Vlizotrap
    vlizotrap: {
        title: 'Vlizotrap',
        description: 'Vlizotrap of zolderluik met raveling',
        measurements: [], // No measurements needed - added directly
        defaultMaterials: [
            { label: 'Raveling balkhout', categoryFilter: 'Constructiehout', category: 'hout', key: 'balken', category_ultra_filter: '' },
            { label: 'Vlizotrap (Complete set)', categoryFilter: 'Trappen & Zolderluiken', category: 'basis', key: 'trap', category_ultra_filter: '' },
            { label: 'Zolderluik', categoryFilter: 'Trappen & Zolderluiken', category: 'basis', key: 'luik', category_ultra_filter: '' },
            { label: 'Koplatten', categoryFilter: 'Constructiehout', category: 'afwerking', key: 'architraaf', category_ultra_filter: '' },
        ]
    }
    ,
    // 6. Koof
    koof: {
        title: 'Koof',
        description: 'Leidingen en afvoeren wegwerken',
        measurements: [
            { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm' },
            { key: 'hoogte', label: 'Breedte', type: 'number', suffix: 'mm' },
            { key: 'diepte', label: 'Breedte', type: 'number', suffix: 'mm' },
        ],
        defaultMaterials: [
            { label: 'Regelwerk', categoryFilter: 'Constructiehout', category: 'hout', key: 'regelwerk', category_ultra_filter: '' },
            { label: 'Constructieplaat', categoryFilter: 'Constructieplaten', category: 'beplating', key: 'constructieplaat', category_ultra_filter: '' },
            { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten', category: 'beplating', key: 'afwerkplaat', category_ultra_filter: '' },
            { label: 'Isolatie', categoryFilter: ['Glaswol', 'Steenwol', 'Pir', 'Eps', 'Xps'], category: 'isolatie', key: 'isolatie', category_ultra_filter: '' },
            { label: 'Hoekprofielen', categoryFilter: 'Stuc, vul of finisher & Pleisterwerk', category: 'afwerking', key: 'hoekprofielen', category_ultra_filter: '' },
        ]
    },
    // 7. Installatie
    installatie: {
        title: 'Installatie & Elektra',
        description: 'Elektra, dozen en leidingen',
        measurements: [],
        defaultMaterials: [
            { label: 'Elektra Buizen / Flex', categoryFilter: 'Overig', category: 'Installatie', key: 'kabelkanaal', category_ultra_filter: '' },
            { label: 'Hollewanddozen', categoryFilter: 'Overig', category: 'Installatie', key: 'hollewanddozen', category_ultra_filter: '' },
            { label: 'Installatiekabel', categoryFilter: 'Overig', category: 'Installatie', key: 'elektrakabel', category_ultra_filter: '' },
            { label: 'Stopcontacten & Schakelaars', categoryFilter: 'Overig', category: 'Schakelmateriaal', key: 'schakelmateriaal_basis', category_ultra_filter: '' },
        ]
    },
    // 8. Naden & Stucwerk (Gips Afwerking)
    gips: {
        title: 'Naden & Stucwerk',
        description: 'Afwerking van naden en stucwerk',
        measurements: [], // No measurements needed for now
        defaultMaterials: [
            { label: 'Hoekprofielen', categoryFilter: '(knauf) gipsproducten', category: 'afwerking', key: 'hoekafwerking', category_ultra_filter: '' },
            { label: 'Voegenmiddel', categoryFilter: '(knauf) gipsproducten', category: 'afwerking', key: 'gips_vuller', category_ultra_filter: '' },
            { label: 'Finish Pasta', categoryFilter: '(knauf) gipsproducten', category: 'afwerking', key: 'gips_finish', category_ultra_filter: '' },
        ]
    },
    // 9. Isolatie
    isolatie: {
        title: 'Isolatie & Folies',
        description: 'Isolatie en folies toevoegen',
        measurements: [],
        defaultMaterials: [
            { label: 'Folies', categoryFilter: 'Folieën', category: 'isolatie', key: 'folie_buiten', category_ultra_filter: '' },
            { label: 'Isolatiemateriaal', categoryFilter: 'Isolatie', category: 'isolatie', key: 'isolatie_basis', category_ultra_filter: '' },
        ]
    },
    // 10. Plafond
    plafond: {
        title: 'Plafond',
        description: 'Plafond afwerking & constructie',
        measurements: [
            { key: 'lengte', label: 'Lengte', type: 'number', suffix: 'mm' },
            { key: 'breedte', label: 'Breedte', type: 'number', suffix: 'mm' },
        ],
        defaultMaterials: [
            { label: 'Randhout', categoryFilter: 'Vuren hout', category: 'hout', key: 'randhout', category_ultra_filter: '' },
            { label: 'Stelhout', categoryFilter: 'Vuren hout', category: 'hout', key: 'stroken', category_ultra_filter: '' },
            { label: 'Rachelwerk', categoryFilter: 'Vuren hout', category: 'hout', key: 'rachels', category_ultra_filter: '' },
            { label: 'Randprofielen', categoryFilter: 'Metalstud profielen', category: 'metaal', key: 'randprofielen', category_ultra_filter: '' },
            { label: 'Draagprofielen', categoryFilter: 'Metalstud profielen', category: 'metaal', key: 'draagprofielen', category_ultra_filter: '' },
            { label: 'Afwerkplaat', categoryFilter: 'Gipsplaten, Brandwerende platen', category: 'beplating', key: 'beplating', category_ultra_filter: '' },
        ]
    }
};
