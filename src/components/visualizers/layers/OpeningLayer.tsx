import React from 'react';
import { WallOpening } from '@/lib/drawing-types';
import { DrawingStyles } from '../drawing-styles';

interface OpeningLayerProps {
    openings: (WallOpening & { drawX?: number; drawY?: number; drawW?: number; drawH?: number })[];
    onPointerDown?: (e: React.PointerEvent, op: WallOpening) => void;
    draggingId?: string | null;
    isInteractive?: boolean;
}

export const OpeningLayer: React.FC<OpeningLayerProps> = ({ openings, onPointerDown, draggingId, isInteractive }) => {
    return (
        <g>
            {openings.map((op) => {
                // Determine coordinates: prefer pre-calculated draw* props (from parent layout logic)
                // but fallback to raw if needed (though raw usually needs scaling)
                const x = op.drawX ?? 0;
                const y = op.drawY ?? 0;
                const w = op.drawW ?? 0;
                const h = op.drawH ?? 0;

                if (w <= 0 || h <= 0) return null;

                const isDragging = draggingId === op.id;
                const strokeColor = isDragging ? DrawingStyles.colors.DIM_TOTAL : DrawingStyles.colors.TIMBER_STROKE;
                const strokeWidth = isDragging ? 2 : 1;

                // Label Logic
                const label = op.type === 'door' ? 'Deur' : op.type === 'window' ? 'Kozijn' : op.type === 'nis' ? 'Nis' : 'Sparing';

                return (
                    <g
                        key={op.id}
                        onPointerDown={(e) => isInteractive && onPointerDown?.(e, op)}
                        style={{ cursor: isInteractive ? 'move' : 'default' }}
                        className={isDragging ? 'opacity-90' : ''}
                    >
                        {/* 1. The Opening Rect */}
                        <rect
                            x={x} y={y} width={w} height={h}
                            fill={DrawingStyles.colors.BG_LABEL} // Standard "Hole" color
                            stroke={strokeColor}
                            strokeWidth={strokeWidth}
                        />

                        {/* 2. The Cross (X) - Dashed */}
                        <line
                            x1={x} y1={y} x2={x + w} y2={y + h}
                            stroke={strokeColor} strokeWidth="0.5"
                            strokeDasharray={DrawingStyles.strokes.DASHED_MAIN}
                            opacity="0.5"
                        />
                        <line
                            x1={x} y1={y + h} x2={x + w} y2={y}
                            stroke={strokeColor} strokeWidth="0.5"
                            strokeDasharray={DrawingStyles.strokes.DASHED_MAIN}
                            opacity="0.5"
                        />

                        {/* 3. Label (Roughly Centered) */}
                        <text
                            x={x + w / 2}
                            y={y + h / 2 - 10}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill={DrawingStyles.colors.DIM_TOTAL} // Emerald text
                            style={{
                                fontFamily: DrawingStyles.fonts.SANS,
                                fontSize: '9px',
                                pointerEvents: 'none',
                                userSelect: 'none'
                            }}
                        >
                            {label}
                        </text>

                        {/* 4. Internal Dimensions Label */}
                        <text
                            x={x + w / 2}
                            y={y + h / 2 + 6}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill={DrawingStyles.colors.DIM_TOTAL}
                            className="font-bold"
                            style={{
                                fontFamily: DrawingStyles.fonts.MONO,
                                fontSize: '8px',
                                pointerEvents: 'none',
                                userSelect: 'none'
                            }}
                        >
                            {op.width} x {op.height}
                        </text>

                    </g>
                );
            })}
        </g>
    );
};
