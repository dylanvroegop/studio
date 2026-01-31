'use client';

import React, { useMemo } from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';
import { OverallDimensions } from './shared/measurements';

interface GlasDrawingProps {
    breedte: number;
    hoogte: number;
    fitContainer?: boolean;
    className?: string;
}

export function GlasDrawing({
    breedte,
    hoogte,
    fitContainer,
    className,
}: GlasDrawingProps) {
    const areaStats = useMemo(() => ({
        gross: breedte * hoogte,
        net: breedte * hoogte,
        hasOpenings: false,
    }), [breedte, hoogte]);

    return (
        <BaseDrawingFrame
            width={breedte}
            height={hoogte}
            fitContainer={fitContainer}
            suppressTotalDimensions={true}
            areaStats={areaStats}
            className={className}
        >
            {(ctx) => {
                const { startX, startY, rectW, rectH, pxPerMm } = ctx;

                return (
                    <>
                        {/* Glass pane — dark desaturated blue at 80% to let grid peek through */}
                        <rect
                            x={startX} y={startY}
                            width={rectW} height={rectH}
                            fill="#1e293b"
                            opacity="0.8"
                            stroke="rgba(180, 210, 230, 0.4)"
                            strokeWidth="1"
                        />

                        {/* 10mm black border inside the glass */}
                        {(() => {
                            const bw = Math.min(10 * pxPerMm, rectH / 2, rectW / 2);
                            const innerH = Math.max(0, rectH - bw * 2);
                            return (
                                <>
                                    {/* Top */}
                                    <rect x={startX} y={startY} width={rectW} height={bw} fill="rgb(10, 10, 10)" />
                                    {/* Bottom */}
                                    <rect x={startX} y={startY + rectH - bw} width={rectW} height={bw} fill="rgb(10, 10, 10)" />
                                    {/* Left */}
                                    <rect x={startX} y={startY + bw} width={bw} height={innerH} fill="rgb(10, 10, 10)" />
                                    {/* Right */}
                                    <rect x={startX + rectW - bw} y={startY + bw} width={bw} height={innerH} fill="rgb(10, 10, 10)" />
                                </>
                            );
                        })()}

                        {/* Overall dimensions */}
                        <OverallDimensions
                            wallLength={breedte}
                            wallHeight={hoogte}
                            svgBaseX={startX}
                            svgBaseY={startY + rectH}
                            pxPerMm={pxPerMm}
                        />
                    </>
                );
            }}
        </BaseDrawingFrame>
    );
}
