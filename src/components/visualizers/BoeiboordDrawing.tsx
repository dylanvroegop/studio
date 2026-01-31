'use client';

import React, { useMemo } from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';
import {
    OverallDimensions,
    GridMeasurements
} from './shared/measurements';
import { calculateGridGaps } from './shared/framing-utils';

interface BoeiboordDrawingProps {
    lengte: number;
    hoogte: number;
    balkafstand: number;
    latafstand: number;
    title?: string;
    startLattenFromBottom?: boolean;
    doubleEndBattens?: boolean;
    fitContainer?: boolean;
    className?: string;
}

export function BoeiboordDrawing({
    lengte,
    hoogte,
    balkafstand,
    latafstand,
    title,
    startLattenFromBottom,
    doubleEndBattens,
    fitContainer,
    className,
}: BoeiboordDrawingProps) {
    const structure = useMemo(() => {
        if (lengte <= 0 || hoogte <= 0) return {
            beamCenters: [] as number[],
            gridGaps: [] as { value: number; c1: number; c2: number }[],
            latCenters: [] as number[],
            latGaps: [] as { value: number; c1: number; c2: number }[],
        };

        const framing = calculateGridGaps({
            wallLength: lengte,
            spacing: balkafstand,
            studWidth: 70
        });

        const latFraming = calculateGridGaps({
            wallLength: hoogte,
            spacing: latafstand,
            studWidth: 22,
            startFromRight: startLattenFromBottom
        });

        return {
            beamCenters: framing.beamCenters,
            gridGaps: framing.gaps,
            latCenters: latFraming.beamCenters,
            latGaps: latFraming.gaps,
        };
    }, [lengte, hoogte, balkafstand, latafstand, startLattenFromBottom]);

    return (
        <div className={`bg-[#09090b] rounded-2xl border border-white/10 overflow-hidden shadow-2xl relative h-[340px] ${className ?? ''}`}>
            {/* Dot Pattern Background */}
            <div
                className="absolute inset-0 z-0 opacity-[0.15] pointer-events-none"
                style={{
                    backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
                    backgroundSize: '24px 24px'
                }}
            />
            <div className="relative z-10 w-full h-full">
        <BaseDrawingFrame
            width={lengte}
            height={hoogte}
            fitContainer={true}
            svgHeight={400}
            suppressTotalDimensions={true}
            areaStats={{
                gross: lengte * hoogte,
                net: lengte * hoogte,
                hasOpenings: false
            }}
        >
            {(ctx) => {
                const { startX, startY, rectW, rectH, pxPerMm, SVG_HEIGHT } = ctx;

                const structureColor = "rgb(70, 75, 85)";
                const LAT_WIDTH_MM = 22;
                const halfWidthPx = (LAT_WIDTH_MM * pxPerMm) / 2;

                const dashProps = {
                    stroke: structureColor,
                    strokeWidth: 1,
                    strokeDasharray: "4,4" as string,
                };

                const gridGaps = structure.gridGaps.map(g => ({
                    value: g.value,
                    c1: startX + g.c1 * pxPerMm,
                    c2: startX + g.c2 * pxPerMm,
                }));

                const latGaps = structure.latGaps.map(g => ({
                    value: g.value,
                    c1: startY + g.c1 * pxPerMm,
                    c2: startY + g.c2 * pxPerMm,
                }));

                return (
                    <>
                        {/* Main outline */}
                        <rect
                            x={startX} y={startY}
                            width={rectW} height={rectH}
                            fill="none" stroke={structureColor} strokeWidth="1"
                        />

                        {/* Vertical beams */}
                        {balkafstand > 0 && structure.beamCenters.map((cx, i) => {
                            const drawX = startX + cx * pxPerMm;
                            return (
                                <line
                                    key={`beam-${i}`}
                                    x1={drawX} y1={startY}
                                    x2={drawX} y2={startY + rectH}
                                    stroke={structureColor}
                                    strokeWidth={70 * pxPerMm}
                                    opacity="0.4"
                                />
                            );
                        })}

                        {/* Horizontal latten */}
                        {latafstand > 0 && structure.latCenters.map((cy, i) => {
                            const centerY = startY + cy * pxPerMm;
                            return (
                                <g key={`lat-${i}`}>
                                    <line x1={startX} y1={centerY - halfWidthPx} x2={startX + rectW} y2={centerY - halfWidthPx} {...dashProps} />
                                    <line x1={startX} y1={centerY + halfWidthPx} x2={startX + rectW} y2={centerY + halfWidthPx} {...dashProps} />
                                </g>
                            );
                        })}

                        {/* Double end battens */}
                        {doubleEndBattens && (() => {
                            const extraStart = (LAT_WIDTH_MM / 2) + LAT_WIDTH_MM;
                            const extraEnd = hoogte - ((LAT_WIDTH_MM / 2) + LAT_WIDTH_MM);
                            const els: React.ReactNode[] = [];

                            if (extraStart < hoogte) {
                                const y = startY + extraStart * pxPerMm;
                                els.push(
                                    <g key="dbl-start">
                                        <line x1={startX} y1={y - halfWidthPx} x2={startX + rectW} y2={y - halfWidthPx} {...dashProps} />
                                        <line x1={startX} y1={y + halfWidthPx} x2={startX + rectW} y2={y + halfWidthPx} {...dashProps} />
                                    </g>
                                );
                            }
                            if (extraEnd > 0) {
                                const y = startY + extraEnd * pxPerMm;
                                els.push(
                                    <g key="dbl-end">
                                        <line x1={startX} y1={y - halfWidthPx} x2={startX + rectW} y2={y - halfWidthPx} {...dashProps} />
                                        <line x1={startX} y1={y + halfWidthPx} x2={startX + rectW} y2={y + halfWidthPx} {...dashProps} />
                                    </g>
                                );
                            }
                            return els;
                        })()}

                        {/* Beam grid dims (top) */}
                        <GridMeasurements gaps={gridGaps} svgBaseYTop={startY} />

                        {/* Lat grid dims (right) */}
                        {latGaps.length > 0 && (
                            <GridMeasurements gaps={latGaps} svgBaseX={startX + rectW} orientation="vertical" />
                        )}

                        {/* Overall dimensions */}
                        <OverallDimensions
                            wallLength={lengte}
                            wallHeight={hoogte}
                            svgBaseX={startX}
                            svgBaseY={startY + rectH}
                            pxPerMm={pxPerMm}
                        />

                        {title && (
                            <text
                                x={25}
                                y={SVG_HEIGHT - 25}
                                textAnchor="start"
                                fill="rgb(100, 116, 139)"
                                fontSize="14"
                                style={{ fontFamily: 'monospace' }}
                            >
                                {title}
                            </text>
                        )}
                    </>
                );
            }}
        </BaseDrawingFrame>
            </div>
        </div>
    );
}
