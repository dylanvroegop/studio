'use client';

import React, { useId } from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';

interface SystemCeilingDrawingProps {
    item: Record<string, any>;
    className?: string;
    fitContainer?: boolean;
}

function positive(value: unknown): number {
    const number = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(number) && number > 0 ? number : 0;
}

/** Bovenaanzicht van het plaatraster; geen constructief montage- of zaagplan. */
export function SystemCeilingDrawing({ item, className, fitContainer }: SystemCeilingDrawingProps): JSX.Element {
    const id = useId().replace(/:/g, '');
    const shape = item.shape || 'rectangle';
    const sections = shape === 'l-shape' ? 2 : shape === 'u-shape' ? 3 : 0;
    const lengths = Array.from({ length: sections }, (_, i) => positive(item[`lengte${i + 1}`]));
    const heights = Array.from({ length: sections }, (_, i) => positive(item[`hoogte${i + 1}`]));
    const width = sections ? lengths.reduce((sum, length) => sum + length, 0) : positive(item.lengte);
    const height = sections ? Math.max(...heights) : positive(item.breedte);
    const tileWidth = positive(item.plaat_lengte);
    const tileHeight = positive(item.plaat_breedte);
    if (!width || !height || !tileWidth || !tileHeight || (sections && [...lengths, ...heights].some(value => !value))) {
        return <div className="p-6 text-center text-sm text-muted-foreground">Vul de plafondafmetingen en rastermaat van de platen in voor de tekening.</div>;
    }

    return (
        <BaseDrawingFrame width={width} height={height} className={className} fitContainer={fitContainer}
            gridLabel={`Systeemplafond · raster ${tileWidth} × ${tileHeight} mm`}>
            {({ startX, startY, pxPerMm }) => {
                const points: Array<[number, number]> = [[0, height]];
                if (sections) {
                    let x = 0;
                    lengths.forEach((length, index) => {
                        points.push([x, height - heights[index]], [x + length, height - heights[index]]);
                        x += length;
                    });
                } else points.push([0, 0], [width, 0]);
                points.push([width, height]);
                const outline = points.map(([x, y]) => `${startX + x * pxPerMm},${startY + y * pxPerMm}`).join(' ');
                // Verdeel passtukken gelijk over beide randen van het bovenaanzicht.
                const offsetX = (width % tileWidth) / 2;
                const offsetY = (height % tileHeight) / 2;
                return <>
                    <defs>
                        <pattern id={`${id}-raster`} patternUnits="userSpaceOnUse"
                            x={startX + offsetX * pxPerMm} y={startY + offsetY * pxPerMm}
                            width={tileWidth * pxPerMm} height={tileHeight * pxPerMm}>
                            <rect width={tileWidth * pxPerMm} height={tileHeight * pxPerMm}
                                fill="#f1f5f9" stroke="#64748b" strokeWidth={1} />
                        </pattern>
                        <clipPath id={`${id}-omtrek`}><polygon points={outline} /></clipPath>
                    </defs>
                    <polygon points={outline} fill={`url(#${id}-raster)`} stroke="#334155" strokeWidth={2} />
                    <g clipPath={`url(#${id}-omtrek)`}>
                        {(Array.isArray(item.openings) ? item.openings : []).map((opening: Record<string, any>, index: number) => {
                            const w = positive(opening.width ?? opening.breedte);
                            const h = positive(opening.height ?? opening.length ?? opening.lengte);
                            const x = positive(opening.fromLeft ?? opening.vanafLinks);
                            const y = opening.fromBottom != null
                                ? height - positive(opening.fromBottom) - h
                                : positive(opening.fromTop ?? opening.vanafBoven);
                            return <rect key={opening.id || index} x={startX + x * pxPerMm} y={startY + y * pxPerMm}
                                width={w * pxPerMm} height={h * pxPerMm} fill="white" stroke="#d97706" strokeWidth={2} strokeDasharray="5 3" />;
                        })}
                    </g>
                </>;
            }}
        </BaseDrawingFrame>
    );
}
