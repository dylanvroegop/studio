import React from 'react';
import { DEFAULT_MEASUREMENT_STYLE } from './types';

export interface GridMeasurementsProps {
    gaps: {
        value: number;
        c1: number; // Center pos (X for horizontal, Y for vertical)
        c2: number; // Center pos (X for horizontal, Y for vertical)
    }[];
    svgBaseYTop?: number; // For Horizontal: The "Ceiling" Y line or top of wall
    svgBaseX?: number;    // For Vertical: The base X line (e.g. right side of wall)
    orientation?: 'horizontal' | 'vertical';
    style?: 'dashed' | 'solid';
}

export const GridMeasurements: React.FC<GridMeasurementsProps> = ({
    gaps,
    svgBaseYTop = 0,
    svgBaseX = 0,
    orientation = 'horizontal'
}) => {
    return (
        <g>
            {gaps.map((gap, i) => {
                const isFirst2 = i < 2;
                const isLast2 = i >= gaps.length - 2;
                if (!isFirst2 && !isLast2 && gaps.length > 5) return null;

                const midVal = (gap.c1 + gap.c2) / 2;

                if (orientation === 'horizontal') {
                    // Horizontal Logic (Existing)
                    const dimYTop = svgBaseYTop - 20;

                    return (
                        <g key={`gap-h-${i}`}>
                            <line x1={gap.c1} y1={svgBaseYTop} x2={gap.c1} y2={dimYTop - 2} stroke="#14b8a6" strokeWidth="0.5" strokeDasharray="1,2" opacity="0.5" />
                            <line x1={gap.c2} y1={svgBaseYTop} x2={gap.c2} y2={dimYTop - 2} stroke="#14b8a6" strokeWidth="0.5" strokeDasharray="1,2" opacity="0.5" />
                            <line x1={gap.c1} y1={dimYTop} x2={gap.c2} y2={dimYTop} stroke="#14b8a6" strokeWidth="0.5" strokeDasharray="2,2" />
                            <text x={midVal} y={dimYTop - 2} textAnchor="middle" className="fill-teal-500 text-[10px] font-mono select-none">
                                {Math.round(gap.value)}
                            </text>
                        </g>
                    );
                } else {
                    // Vertical Logic (New)
                    // Measurements on the RIGHT side usually
                    const dimX = svgBaseX + 20;

                    return (
                        <g key={`gap-v-${i}`}>
                            {/* Horizontal Extensions to the Right */}
                            <line x1={svgBaseX} y1={gap.c1} x2={dimX + 2} y2={gap.c1} stroke="#14b8a6" strokeWidth="0.5" strokeDasharray="1,2" opacity="0.5" />
                            <line x1={svgBaseX} y1={gap.c2} x2={dimX + 2} y2={gap.c2} stroke="#14b8a6" strokeWidth="0.5" strokeDasharray="1,2" opacity="0.5" />

                            {/* Vertical Dim Line */}
                            <line x1={dimX} y1={gap.c1} x2={dimX} y2={gap.c2} stroke="#14b8a6" strokeWidth="0.5" strokeDasharray="2,2" />

                            {/* Text (Rotated 90 deg or upright? Typically 90 deg for vertical dims) */}
                            {/* Center at midVal Y, and dimX X */}
                            <g transform={`translate(${dimX + 4}, ${midVal}) rotate(90)`}>
                                <text textAnchor="middle" dy="-2" className="fill-teal-500 text-[10px] font-mono select-none">
                                    {Math.round(gap.value)}
                                </text>
                            </g>
                        </g>
                    );
                }
            })}
        </g>
    );
};
