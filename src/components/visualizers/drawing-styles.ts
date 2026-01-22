export const DrawingStyles = {
    // Colors
    colors: {
        DIM_TOTAL: '#10b981', // Emerald-500
        DIM_GRID: '#14b8a6',  // Teal-500
        DOT: 'rgb(255, 255, 255)',
        BG_LABEL: '#09090b',
        TEXT_WHITE: '#FFFFFF',
        TIMBER_STROKE: 'rgb(55, 60, 70)',
        OPENING_LABEL: '#10b981', // Emerald-500 - for opening type and dimension labels
    },
    // Metrics
    metrics: {
        DOT_RADIUS: 0.7,
        ANCHOR_RADIUS: 1.5,
        GAP_EXT_LINE: 2, // Gap between object and extension start
    },
    // Stroke Styles (Dash Arrays)
    strokes: {
        SOLID: undefined, // Solid
        DASHED_MAIN: '2,2', // Striped
        DASHED_EXT: '1,2', // Dotted extension
    },
    // Fonts
    fonts: {
        MONO: "'JetBrains Mono', monospace",
        SANS: "'Inter', sans-serif",
    }
} as const;
