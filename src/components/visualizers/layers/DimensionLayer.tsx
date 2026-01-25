import React from 'react';
import { DimensionLine } from '@/lib/drawing-types';
import { DrawingStyles } from '../drawing-styles';

interface DimensionLayerProps {
    dimensions: DimensionLine[];
    className?: string;
}

export const DimensionLayer: React.FC<DimensionLayerProps> = ({ dimensions, className }) => {
    return (
        <g className={className}>
            {dimensions.map((dim, i) => {
                const isTotal = dim.type === 'total';
                const isGap = dim.type === 'gap';
                const isSegment = dim.type === 'segment' || dim.type === 'height';
                const isLevel = dim.type === 'level'; // Opening levels
                const isOpeningDim = dim.type === 'opening_h' || dim.type === 'opening_v';
                const isExtension = dim.type === 'extension';

                // Determine Styles based on Type
                let color: string = DrawingStyles.colors.DIM_TOTAL;
                let strokeDash: string | undefined = DrawingStyles.strokes.SOLID;
                let showDots = true;
                let showLabelBg = true;
                let labelFontSize = 12;

                // H.O.H (Gap) Styles
                if (isGap) {
                    color = DrawingStyles.colors.DIM_GRID;
                    strokeDash = DrawingStyles.strokes.DASHED_MAIN;
                    showDots = false; // usually no dots for grid lines themselves
                    showLabelBg = false;
                    labelFontSize = 6;
                }

                // Extension Lines (Purely visual help)
                if (isExtension) {
                    color = DrawingStyles.colors.DIM_GRID;
                    strokeDash = DrawingStyles.strokes.DASHED_EXT; // Dotted
                    showDots = false;
                    showLabelBg = false;
                }

                // Internal Opening Dims
                if (isOpeningDim) {
                    color = DrawingStyles.colors.DIM_TOTAL;
                    strokeDash = DrawingStyles.strokes.SOLID;
                    showLabelBg = true;
                    labelFontSize = 7;
                }

                // Level Dims (3-part opening)
                if (isLevel) {
                    labelFontSize = 7;
                }

                if (isSegment) {
                    labelFontSize = 10;
                }

                const midX = (dim.p1.x + dim.p2.x) / 2;
                const midY = (dim.p1.y + dim.p2.y) / 2;

                // Rotation logic (Standard: Horizontal = 0, Vertical = -90)
                const isVertical = Math.abs(dim.p1.x - dim.p2.x) < 0.1;
                const rotation = isVertical ? -90 : 0;

                return (
                    <g key={`${dim.type}-${i}`}>
                        {/* Main Line */}
                        <line
                            x1={dim.p1.x} y1={dim.p1.y}
                            x2={dim.p2.x} y2={dim.p2.y}
                            stroke={color}
                            strokeWidth="0.5"
                            strokeDasharray={strokeDash}
                        />

                        {/* Anchors (Dots) */}
                        {showDots && !isExtension && (
                            <>
                                <circle cx={dim.p1.x} cy={dim.p1.y} r={DrawingStyles.metrics.ANCHOR_RADIUS} fill={color} />
                                <circle cx={dim.p2.x} cy={dim.p2.y} r={DrawingStyles.metrics.ANCHOR_RADIUS} fill={color} />
                            </>
                        )}

                        {/* Label Group */}
                        {!isExtension && (
                            <g transform={`translate(${midX}, ${midY}) rotate(${rotation})`}>
                                {showLabelBg && (
                                    <rect
                                        x="-12" y="-5"
                                        width="24" height="10"
                                        fill={DrawingStyles.colors.BG_LABEL}
                                        opacity={isGap ? 0 : 1} // Transparent for Gaps usually
                                    />
                                )}
                                <text
                                    x="0" y={isTotal ? 3 : 2} // Slight adjustment
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    fill={isGap ? color : DrawingStyles.colors.TEXT_WHITE} // Teal text for gaps, White for Total
                                    className={isGap ? "" : "font-bold"}
                                    style={{
                                        fontFamily: DrawingStyles.fonts.MONO,
                                        fontSize: `${labelFontSize}px`,
                                        pointerEvents: 'none',
                                        userSelect: 'none'
                                    }}
                                >
                                    {Math.round(dim.value)}
                                </text>
                            </g>
                        )}
                    </g>
                );
            })}
        </g>
    );
};
