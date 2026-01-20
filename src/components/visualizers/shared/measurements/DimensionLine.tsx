import React from 'react';
import { Point, DEFAULT_MEASUREMENT_STYLE } from './types';

interface DimensionLineProps {
    p1: Point;
    p2: Point;
    label?: string | number;
    offset?: number; // How far away from the points to draw the line
    extensionStart?: number; // How close to the points the extension lines start (0 = touching)
    orientation?: 'horizontal' | 'vertical' | 'aligned';
    color?: string;
    className?: string;
}

export const DimensionLine: React.FC<DimensionLineProps> = ({
    p1,
    p2,
    label,
    offset = 0,
    extensionStart = 0,
    orientation = 'aligned',
    color = DEFAULT_MEASUREMENT_STYLE.lineColor,
    className
}) => {
    // Calculate normal vector for offset
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    // Normalized perpendicular vector
    let nx = -dy / len;
    let ny = dx / len;

    // Apply offset
    const x1 = p1.x + nx * offset;
    const y1 = p1.y + ny * offset;
    const x2 = p2.x + nx * offset;
    const y2 = p2.y + ny * offset;

    // Center point for label
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;

    // Extension lines
    // From p1 to x1,y1 (modified by extensionStart)
    const ext1_start_x = p1.x + nx * extensionStart;
    const ext1_start_y = p1.y + ny * extensionStart;

    const ext2_start_x = p2.x + nx * extensionStart;
    const ext2_start_y = p2.y + ny * extensionStart;

    // Determine opacity for extension lines (fade them near the object?)
    // Usually standard CAD is solid extension lines.

    return (
        <g className={className} pointerEvents="none">
            {/* Extension Lines */}
            <line
                x1={ext1_start_x} y1={ext1_start_y}
                x2={x1} y2={y1}
                stroke={color}
                strokeWidth={DEFAULT_MEASUREMENT_STYLE.strokeWidth}
                opacity="0.5" // Extensions often lighter
            />
            <line
                x1={ext2_start_x} y1={ext2_start_y}
                x2={x2} y2={y2}
                stroke={color}
                strokeWidth={DEFAULT_MEASUREMENT_STYLE.strokeWidth}
                opacity="0.5"
            />

            {/* Main Dimension Line */}
            <line
                x1={x1} y1={y1}
                x2={x2} y2={y2}
                stroke={color}
                strokeWidth={DEFAULT_MEASUREMENT_STYLE.strokeWidth}
            />

            {/* End Dots */}
            <circle cx={x1} cy={y1} r={DEFAULT_MEASUREMENT_STYLE.dotRadius} fill={color} />
            <circle cx={x2} cy={y2} r={DEFAULT_MEASUREMENT_STYLE.dotRadius} fill={color} />

            {/* Label */}
            {label !== undefined && (
                <g transform={`translate(${cx}, ${cy})`}>
                    {/* Background rect for readability */}
                    <rect
                        x="-10" y="-4"
                        width="20" height="8"
                        fill="#09090b"
                        opacity="1"
                    />
                    <text
                        x="0" y="0.5"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={color}
                        className="text-[7px] font-mono select-none font-medium"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                        transform={orientation === 'vertical' ? 'rotate(-90)' : ''}
                    >
                        {label}
                    </text>
                </g>
            )}
        </g>
    );
};
