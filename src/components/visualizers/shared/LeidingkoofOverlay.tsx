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

                return (
                    <g key={koof.id}>
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
                            stroke="rgba(59, 130, 246, 0.5)"
                            strokeWidth="1"
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
