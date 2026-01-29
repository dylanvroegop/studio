export const openingConfig = {
    // Current UI maps 'window', 'door-frame', 'door', 'opening', 'other' to:
    // Raamkozijn, Deurkozijn, Deur, Sparing, Overig
    typeOptions: ['Raamkozijn', 'Binnen kozijn', 'Buiten kozijn', 'Deur', 'Sparing', 'Overig'],
    constructionOptions: {
        dblStijl: true,
        trimmer: true,
        dblBovendorpel: true,
        dblOnderdorpel: true,
        dagkanten: true // Will be implemented in Part 2
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
