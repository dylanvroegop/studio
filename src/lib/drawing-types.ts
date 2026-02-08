export interface WallOpening {
    id: string;
    type: 'door' | 'window' | 'opening' | 'door-frame' | 'nis' | 'other';
    width: number;
    height: number;
    fromLeft: number;
    fromBottom: number;
    requires_raveelwerk?: boolean;
    onderdorpel?: boolean;
    onderdorpelDikte?: number;
    // HSB Additions
    dubbeleStijlLinks?: boolean;
    dubbeleStijlRechts?: boolean;
    trimmer?: boolean;
    headerDikte?: number;
    dubbeleBovendorpel?: boolean;
    dubbeleOnderdorpel?: boolean;

    // Explicit Dimensions for Reporting
    openingWidth?: number;
    openingHeight?: number;
}

export interface Beam {
    type: 'stud' | 'plate' | 'header' | 'sill' | 'king' | 'cripple-top' | 'cripple-bottom' | 'beam';
    x: number; // Logical MM relative to Wall Bottom-Left
    y: number; // Logical MM relative to Wall Bottom-Left (Y-Up preferably, or follow convention)
    // NOTE: WallDrawing uses Y-Down (SVG). We should try to normalize to Cartesian if possible, 
    // but for now, let's store what we have and label it.
    // Actually, "height" implies structure. Let's store Rect.

    // For storing data, let's use standard logical coordinates:
    // x: from left (mm)
    // y: from bottom (mm)
    // w: width (mm)
    // h: height (mm)
    xMm: number;
    yMm: number;
    wMm: number;
    hMm: number;
}

export interface DimensionLine {
    type: 'total' | 'gap' | 'opening_h' | 'opening_v' | 'segment' | 'height' | 'level' | 'extension';
    label: string;
    value: number;
    // Points in Logical MM (relative to wall bottom-left 0,0)
    p1: { x: number; y: number };
    p2: { x: number; y: number };
}

export interface DrawingData {
    walls: {
        label: string; // e.g. "Main", "L1", "L2"
        lengte: number;
        hoogte: number;
        shape: string;
    }[];
    beams: Beam[];
    openings?: WallOpening[];
    dimensions: DimensionLine[];

    // Raw inputs
    params: Record<string, unknown>;

    // Optional calculated data for specific visualizers
    calculatedData?: Record<string, unknown>;
}
