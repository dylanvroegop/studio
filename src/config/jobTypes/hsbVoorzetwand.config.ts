import { MeasurementSection } from './index';

export const sections: MeasurementSection[] = ['openingen', 'koof', 'vensterbanken', 'dagkanten'];

export const openingConfig = {
    // Current UI maps 'window', 'door-frame', 'door', 'opening', 'other' to:
    // Raamkozijn, Deurkozijn, Deur, Sparing, Overig
    typeOptions: ['Raamkozijn', 'Binnen kozijn', 'Buiten kozijn', 'Deur', 'Sparing', 'Overig'],
    constructionOptions: {
        dblStijl: true,
        trimmer: true,
        dblBovendorpel: true,
        dblOnderdorpel: true,
        dagkanten: true,
        vensterbank: true
    }
};

export const balkenConfig = {
    showBalkafstand: true,
    showStartpositie: true,
    options: {
        dblEindbalk: true,
        dblBovenbalk: true,
        dblOnderbalk: true
    }
};
