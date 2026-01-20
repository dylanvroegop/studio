import React from 'react';
import { DEFAULT_MEASUREMENT_STYLE } from './types';

interface GridMeasurementsProps {
    gaps: {
        value: number;
        c1: number; // Center X of first stud (Screen Coords)
        c2: number; // Center X of second stud (Screen Coords)
    }[];
    svgBaseYTop: number; // The "Ceiling" Y line or top of wall
    style?: 'dashed' | 'solid';
}

export const GridMeasurements: React.FC<GridMeasurementsProps> = ({
    gaps,
    svgBaseYTop
}) => {
    // Only show first 2 and last 2 like WallDrawing?
    // "const isFirst2 = i < 2; const isLast2 = i >= studData.gaps.length - 2;"
    // We should probably pass filtered gaps OR filter here.
    // Let's implement the filter here to match logic.

    return (
        <g>
            {gaps.map((gap, i) => {
                const isFirst2 = i < 2;
                const isLast2 = i >= gaps.length - 2;
                if (!isFirst2 && !isLast2 && gaps.length > 5) return null; // Only skip if we have many gaps

                const midX = (gap.c1 + gap.c2) / 2;
                const dimYTop = svgBaseYTop - 20; // 20px Above wall

                return (
                    <g key={`gap-${i}`}>
                        {/* Vertical Extension Lines (Upwards) */}
                        <line
                            x1={gap.c1}
                            y1={svgBaseYTop}
                            x2={gap.c1}
                            y2={dimYTop - 2}
                            stroke="#14b8a6" // Teal
                            strokeWidth="0.5"
                            strokeDasharray="1,2"
                            opacity="0.5"
                        />
                        <line
                            x1={gap.c2}
                            y1={svgBaseYTop}
                            x2={gap.c2}
                            y2={dimYTop - 2}
                            stroke="#14b8a6"
                            strokeWidth="0.5"
                            strokeDasharray="1,2"
                            opacity="0.5"
                        />

                        {/* Horizontal Dim Line */}
                        <line
                            x1={gap.c1}
                            y1={dimYTop}
                            x2={gap.c2}
                            y2={dimYTop}
                            stroke="#14b8a6"
                            strokeWidth="0.5"
                            strokeDasharray="2,2"
                        />

                        {/* Text Label */}
                        <text
                            x={midX}
                            y={dimYTop - 2}
                            textAnchor="middle"
                            className="fill-teal-500 text-[6px] font-mono select-none"
                        >
                            {Math.round(gap.value)}
                        </text>
                    </g>
                );
            })}
        </g>
    );
};
