export interface Point {
    x: number;
    y: number;
}

export interface DimensionProps {
    color?: string;
    strokeWidth?: number;
    fontSize?: number;
    fontFamily?: string;
}

export interface MeasurementStyle {
    lineColor: string;
    textColor: string;
    dotRadius: number;
    strokeWidth: number;
}

export const DEFAULT_MEASUREMENT_STYLE: MeasurementStyle = {
    lineColor: '#10b981', // emerald-500
    textColor: '#10b981',
    dotRadius: 1.5,
    strokeWidth: 0.5,
};
