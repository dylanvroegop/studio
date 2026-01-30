export const openingConfig = {
    // Current UI maps 'window', 'door-frame', 'door', 'opening', 'other' to:
    // Raamkozijn, Deurkozijn, Deur, Sparing, Overig
    typeOptions: ['Raamkozijn', 'Binnen kozijn', 'Buiten kozijn', 'Deur', 'Sparing', 'Overig'],
    constructionOptions: {
        dblStijl: true, // Used for boxed studs in Metal Stud
        trimmer: true,  // Header reinforcement
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
        dblBovenbalk: true, // U-profile doubling?
        dblOnderbalk: true
    }
};
