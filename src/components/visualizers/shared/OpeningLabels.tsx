import React from 'react';
import { DrawingStyles } from '../drawing-styles';

export interface OpeningLabelsProps {
    /** X coordinate of the opening center in SVG space */
    centerX: number;
    /** Y coordinate of the opening center in SVG space */
    centerY: number;
    /** The type name to display (e.g., "Sparing", "Dakraam", "Deur") */
    typeName: string;
    /** Opening width in mm (for dimension display) */
    width: number;
    /** Opening height in mm (for dimension display) */
    height: number;
}

/**
 * Universal Opening Labels Component
 * 
 * Renders consistent text labels inside openings:
 * - Type name (e.g., "Sparing", "Dakraam") - centered, bold
 * - Dimensions (e.g., "600 x 600") - below, monospace
 * 
 * Use this component inside any drawing to ensure consistent
 * label styling across all 20+ drawing components.
 */
export const OpeningLabels: React.FC<OpeningLabelsProps> = ({
    centerX,
    centerY,
    typeName,
    width,
    height
}) => {
    return (
        <g className="pointer-events-none select-none">
            {/* Type Label (e.g., "Sparing", "Dakraam") */}
            <text
                x={centerX}
                y={centerY - 5}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={DrawingStyles.colors.OPENING_LABEL}
                style={{
                    fontFamily: DrawingStyles.fonts.SANS,
                    fontSize: '10px',
                    fontWeight: 'bold'
                }}
            >
                {typeName}
            </text>

            {/* Dimension Label (e.g., "600 x 600") */}
            <text
                x={centerX}
                y={centerY + 10}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={DrawingStyles.colors.OPENING_LABEL}
                style={{
                    fontFamily: DrawingStyles.fonts.MONO,
                    fontSize: '9px',
                    opacity: 0.8
                }}
            >
                {Math.round(width)} x {Math.round(height)}
            </text>
        </g>
    );
};
