export const DrawingStyles = {
    // Colors
    colors: {
        DIM_TOTAL: '#000000',
        DIM_GRID: '#000000',
        DOT: 'rgb(156, 163, 175)',
        BG_LABEL: '#FFFFFF',
        TEXT_WHITE: '#000000',
        TIMBER_STROKE: '#000000',
        OPENING_LABEL: '#000000',
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
