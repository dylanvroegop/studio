/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface DraggableOpening {
    id: string;
    fromLeft: number;
    fromBottom: number;
    width: number;
    height: number;
    type?: string;
    [key: string]: any;
}

export interface OpeningRendererProps<T extends DraggableOpening> {
    // Required: The openings to render
    openings: T[];

    // Required: Coordinate context (from BaseDrawingFrame or similar)
    svgBaseX: number;      // startX from drawing context
    svgBaseY: number;      // startY + rectH (the "floor" or "bottom")
    pxPerMm: number;       // Scaling factor

    // Optional: Drag handlers (from useDraggableOpenings hook)
    draggingId?: string | null;
    handlePointerDown?: (e: React.PointerEvent, op: T) => void;
    handlePointerMove?: (e: React.PointerEvent) => void;
    handlePointerUp?: (e: React.PointerEvent) => void;

    // Optional: Customize appearance
    editable?: boolean;           // If false, no cursor change or drag handlers
    strokeColor?: string;         // Default: "rgb(55,60,70)"
    activeStrokeColor?: string;   // Default: "#10b981"
    fillColor?: string;           // Default: "#09090b"
}

/**
 * Universal Opening Renderer Component
 * 
 * Renders interactive openings (doors, windows, skylights) with:
 * - Visual representation (black rectangle + diagonal cross)
 * - Drag-and-drop interaction (when editable)
 * - Visual feedback when dragging (green border)
 * 
 * Extracted from WallDrawing.tsx to eliminate code duplication across 20+ drawing components.
 */
export function OpeningRenderer<T extends DraggableOpening>({
    openings,
    svgBaseX,
    svgBaseY,
    pxPerMm,
    draggingId,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    editable = true,
    strokeColor = 'rgb(55,60,70)',
    activeStrokeColor = '#10b981',
    fillColor = '#09090b'
}: OpeningRendererProps<T>) {

    if (!openings || openings.length === 0) return null;

    return (
        <>
            {openings.map((op) => {
                // 1. Convert logical coordinates (mm) to screen coordinates (px)
                const wPx = op.width * pxPerMm;
                const hPx = op.height * pxPerMm;
                const leftPx = op.fromLeft * pxPerMm;
                const bottomPx = op.fromBottom * pxPerMm;

                const x = svgBaseX + leftPx;
                const y = svgBaseY - bottomPx - hPx;

                // 2. Determine styling based on drag state
                const isDragging = draggingId === op.id;
                const stroke = isDragging ? activeStrokeColor : strokeColor;
                const strokeWidth = isDragging ? 2 : 1;

                return (
                    <g
                        key={op.id}
                        onPointerDown={editable && handlePointerDown ? (e) => handlePointerDown(e, op) : undefined}
                        onPointerMove={editable && handlePointerMove ? handlePointerMove : undefined}
                        onPointerUp={editable && handlePointerUp ? handlePointerUp : undefined}
                        className={cn(
                            editable ? "cursor-move" : "",
                            isDragging ? "opacity-90" : ""
                        )}
                        style={{ cursor: editable ? 'move' : 'default' }}
                    >
                        {/* The opening rectangle (hides beams behind it) */}
                        <rect
                            x={x}
                            y={y}
                            width={wPx}
                            height={hPx}
                            fill={fillColor}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                        />

                        {/* Diagonal cross lines */}
                        <line
                            x1={x}
                            y1={y}
                            x2={x + wPx}
                            y2={y + hPx}
                            stroke={stroke}
                            strokeWidth="0.5"
                            strokeDasharray="2,2"
                            opacity="0.5"
                        />
                        <line
                            x1={x}
                            y1={y + hPx}
                            x2={x + wPx}
                            y2={y}
                            stroke={stroke}
                            strokeWidth="0.5"
                            strokeDasharray="2,2"
                            opacity="0.5"
                        />

                        {/* Text labels inside opening (from WallDrawing lines 1012-1032) */}
                        {/* 1. Opening Type Label */}
                        <text
                            x={x + wPx / 2}
                            y={y + hPx / 2 - 10}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="fill-emerald-400 text-[9px] font-medium select-none pointer-events-none"
                            style={{ fontFamily: "'Inter', sans-serif" }}
                        >
                            {op.type === 'door' ? 'Deur' : op.type === 'window' ? 'Kozijn' : 'Sparing'}
                        </text>

                        {/* 2. Internal Dimensions (Width x Height) */}
                        <text
                            x={x + wPx / 2}
                            y={y + hPx / 2 + 6}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="fill-emerald-500/90 text-[8px] font-mono select-none font-bold pointer-events-none"
                        >
                            {op.width} x {op.height}
                        </text>
                    </g>
                );
            })}
        </>
    );
}
