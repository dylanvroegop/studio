import React from 'react';
import { LeidingkoofItem } from '../../leidingkoof/LeidingkoofSection';

export interface LeidingkoofOverlayProps {
    leidingkofen: LeidingkoofItem[];
    startX: number;
    startY: number;
    rectW: number;
    rectH: number;
    pxPerMm: number;
    wallLength: number;
    wallHeight: number;
    onPointerDown?: (event: React.PointerEvent, koof: LeidingkoofItem) => void;
    onPointerMove?: (event: React.PointerEvent) => void;
    onPointerUp?: (event: React.PointerEvent) => void;
    draggingId?: string | null;
    isDraggable?: boolean;
}

/**
 * Shared SVG overlay that renders leidingkoof (pipe boxing) elements
 * as semi-transparent blue boxes on any drawing type.
 */
export function LeidingkoofOverlay({
    leidingkofen,
    startX,
    startY,
    rectW,
    rectH,
    pxPerMm,
    wallLength,
    wallHeight,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    draggingId,
    isDraggable
}: LeidingkoofOverlayProps) {
    if (!leidingkofen || leidingkofen.length === 0) return null;

    // Y-bottom of the drawing area (floor level)
    const yBottom = startY + rectH;

    return (
        <>
            {leidingkofen.map((koof) => {
                const koofLengte = Number(koof.lengte) || 0;
                const koofHoogte = Number(koof.hoogte) || 0;
                const koofVanLinks = Number(koof.vanLinks) || 0;
                const koofVanOnder = Number(koof.vanOnder) || 0;
                const orientation = koof.orientation || 'side';

                if (koofLengte <= 0 || koofHoogte <= 0) return null;

                // Side: lengte = vertical height on wall, hoogte = horizontal width
                // Top: lengte = horizontal width on wall, hoogte = vertical height
                const rectWMm = orientation === 'side' ? koofHoogte : koofLengte;
                const rectHMm = orientation === 'side' ? koofLengte : koofHoogte;

                const koofX = startX + koofVanLinks * pxPerMm;
                const koofY = yBottom - (koofVanOnder + rectHMm) * pxPerMm;
                const koofW = rectWMm * pxPerMm;
                const koofH = rectHMm * pxPerMm;

                const isDragging = draggingId === koof.id;

                return (
                    <g
                        key={koof.id}
                        onPointerDown={onPointerDown ? (e) => onPointerDown(e, koof) : undefined}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        style={{ cursor: isDraggable ? 'move' : 'default' }}
                    >
                        {/* Opaque background to hide structure behind */}
                        <rect
                            x={koofX}
                            y={koofY}
                            width={koofW}
                            height={koofH}
                            fill="#09090b"
                        />
                        {/* Semi-transparent blue overlay */}
                        <rect
                            x={koofX}
                            y={koofY}
                            width={koofW}
                            height={koofH}
                            fill="rgba(59, 130, 246, 0.15)"
                            stroke={isDragging ? "rgba(16, 185, 129, 0.7)" : "rgba(59, 130, 246, 0.5)"}
                            strokeWidth={isDragging ? "2" : "1"}
                            strokeDasharray="4,2"
                        />
                        <text
                            x={koofX + koofW / 2}
                            y={koofY + koofH / 2}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="rgba(96, 165, 250, 1)"
                            fontSize={Math.min(10, koofH * 0.4)}
                            fontWeight="bold"
                            style={{ pointerEvents: 'none', fontFamily: 'monospace' }}
                        >
                            Koof
                        </text>
                    </g>
                );
            })}
        </>
    );
}
