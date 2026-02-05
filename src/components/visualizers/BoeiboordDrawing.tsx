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
    startFromRight?: boolean;
    doubleEndBattens?: boolean;
    boeiboordOrientation?: 'horizontal' | 'slope';
    boeiboordAngle?: number;
    boeiboordMirror?: boolean;
    mirrorBadgeText?: string;
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
    startFromRight,
    doubleEndBattens,
    boeiboordOrientation,
    boeiboordAngle,
    boeiboordMirror,
    mirrorBadgeText,
    fitContainer,
    className,
}: BoeiboordDrawingProps) {
    const clipId = React.useId().replace(/:/g, '');
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
            studWidth: 70,
            startFromRight: startFromRight
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
    }, [lengte, hoogte, balkafstand, latafstand, startLattenFromBottom, startFromRight]);

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
                        const orientation = boeiboordOrientation ?? 'horizontal';
                        const angleDegRaw = typeof boeiboordAngle === 'number'
                            ? boeiboordAngle
                            : parseFloat(String(boeiboordAngle ?? '')) || 45;
                        const angleDeg = Math.max(0, Math.min(89.9, angleDegRaw));
                        const mirrorLatten = !!boeiboordMirror;
                        const midX = startX + rectW / 2;
                        const yBottom = startY + rectH;

                        const outlinePath = (() => {
                            if (orientation !== 'slope') return null;
                            const angleRad = (angleDeg * Math.PI) / 180;
                            const slope = Math.tan(angleRad);

                            if (!mirrorLatten) {
                                const maxSlope = rectW > 0 ? rectH / rectW : 0;
                                const slopeEff = Math.min(slope, maxSlope);
                                const leftHeight = rectH - (slopeEff * rectW);
                                const yLeftTop = yBottom - Math.max(0, leftHeight);
                                const yRightTop = startY;

                                return [
                                    `M ${startX} ${yBottom}`,
                                    `L ${startX + rectW} ${yBottom}`,
                                    `L ${startX + rectW} ${yRightTop}`,
                                    `L ${startX} ${yLeftTop}`,
                                    'Z'
                                ].join(' ');
                            }

                            const halfW = rectW / 2;
                            const maxSlope = halfW > 0 ? rectH / halfW : 0;
                            const slopeEff = Math.min(slope, maxSlope);
                            const sideHeight = rectH - (slopeEff * halfW);
                            const ySideTop = yBottom - Math.max(0, sideHeight);
                            const xMid = startX + halfW;

                            return [
                                `M ${startX} ${yBottom}`,
                                `L ${startX + rectW} ${yBottom}`,
                                `L ${startX + rectW} ${ySideTop}`,
                                `L ${xMid} ${startY}`,
                                `L ${startX} ${ySideTop}`,
                                'Z'
                            ].join(' ');
                        })();

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
                                {/* Clip path for slope */}
                                {outlinePath && (
                                    <defs>
                                        <clipPath id={clipId}>
                                            <path d={outlinePath} />
                                        </clipPath>
                                    </defs>
                                )}

                                {/* Main outline */}
                                {outlinePath ? (
                                    <path d={outlinePath} fill="none" stroke={structureColor} strokeWidth="1" />
                                ) : (
                                    <rect
                                        x={startX} y={startY}
                                        width={rectW} height={rectH}
                                        fill="none" stroke={structureColor} strokeWidth="1"
                                    />
                                )}

                                <g clipPath={outlinePath ? `url(#${clipId})` : undefined}>
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

                                {/* Latten / patroon */}
                                {(() => {
                                    if (latafstand <= 0) return null;

                                    const renderHorizontalSegment = (centerY: number, x1: number, x2: number, key: string) => (
                                        <g key={key}>
                                            <line x1={x1} y1={centerY - halfWidthPx} x2={x2} y2={centerY - halfWidthPx} {...dashProps} />
                                            <line x1={x1} y1={centerY + halfWidthPx} x2={x2} y2={centerY + halfWidthPx} {...dashProps} />
                                        </g>
                                    );

                                    if (orientation === 'horizontal') {
                                        return (
                                            <>
                                                {structure.latCenters.map((cy, i) => {
                                                    const centerY = startY + cy * pxPerMm;
                                                    if (!mirrorLatten) {
                                                        return renderHorizontalSegment(centerY, startX, startX + rectW, `lat-${i}`);
                                                    }
                                                    return (
                                                        <g key={`lat-mirror-${i}`}>
                                                            {renderHorizontalSegment(centerY, startX, midX, `lat-left-${i}`)}
                                                            {renderHorizontalSegment(centerY, midX, startX + rectW, `lat-right-${i}`)}
                                                        </g>
                                                    );
                                                })}
                                            </>
                                        );
                                    }

                                    const buildAngledLatten = (rect: { x0: number; y0: number; x1: number; y1: number }, angle: number) => {
                                        const theta = (angle * Math.PI) / 180;
                                        const dir = { x: Math.cos(theta), y: -Math.sin(theta) };
                                        const n = { x: -dir.y, y: dir.x };

                                        const corners = [
                                            { x: rect.x0, y: rect.y0 },
                                            { x: rect.x1, y: rect.y0 },
                                            { x: rect.x1, y: rect.y1 },
                                            { x: rect.x0, y: rect.y1 },
                                        ];

                                        const projections = corners.map(p => (p.x * n.x) + (p.y * n.y));
                                        const minProj = Math.min(...projections);
                                        const maxProj = Math.max(...projections);

                                        const spacingPx = latafstand * pxPerMm;
                                        if (spacingPx <= 0) return [];

                                        const minCenter = minProj + halfWidthPx;
                                        const maxCenter = maxProj - halfWidthPx;

                                        const startFromMax = !!startLattenFromBottom;
                                        const startCenter = startFromMax ? maxCenter : minCenter;
                                        const endCenter = startFromMax ? minCenter : maxCenter;
                                        const step = startFromMax ? -spacingPx : spacingPx;

                                        const centers: number[] = [];
                                        for (let d = startCenter; startFromMax ? d >= endCenter - 0.5 : d <= endCenter + 0.5; d += step) {
                                            centers.push(d);
                                        }
                                        if (centers.length === 0 || Math.abs(centers[centers.length - 1] - endCenter) > 0.5) {
                                            centers.push(endCenter);
                                        }

                                        if (doubleEndBattens) {
                                            const extraStart = startCenter + (startFromMax ? -LAT_WIDTH_MM * pxPerMm : LAT_WIDTH_MM * pxPerMm);
                                            const extraEnd = endCenter + (startFromMax ? LAT_WIDTH_MM * pxPerMm : -LAT_WIDTH_MM * pxPerMm);
                                            if (extraStart >= minCenter - 0.5 && extraStart <= maxCenter + 0.5) centers.push(extraStart);
                                            if (extraEnd >= minCenter - 0.5 && extraEnd <= maxCenter + 0.5) centers.push(extraEnd);
                                        }

                                        const uniqCenters = Array.from(new Set(centers.map(c => Math.round(c * 10) / 10))).sort((a, b) => a - b);

                                        const getSegment = (d: number) => {
                                            const pts: Array<{ x: number; y: number }> = [];
                                            const pushPoint = (x: number, y: number) => {
                                                const key = `${x.toFixed(2)},${y.toFixed(2)}`;
                                                if (!pts.some(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}` === key)) {
                                                    pts.push({ x, y });
                                                }
                                            };

                                            if (Math.abs(n.y) > 1e-6) {
                                                const yL = (d - n.x * rect.x0) / n.y;
                                                if (yL >= rect.y0 - 0.5 && yL <= rect.y1 + 0.5) pushPoint(rect.x0, yL);
                                                const yR = (d - n.x * rect.x1) / n.y;
                                                if (yR >= rect.y0 - 0.5 && yR <= rect.y1 + 0.5) pushPoint(rect.x1, yR);
                                            }
                                            if (Math.abs(n.x) > 1e-6) {
                                                const xT = (d - n.y * rect.y0) / n.x;
                                                if (xT >= rect.x0 - 0.5 && xT <= rect.x1 + 0.5) pushPoint(xT, rect.y0);
                                                const xB = (d - n.y * rect.y1) / n.x;
                                                if (xB >= rect.x0 - 0.5 && xB <= rect.x1 + 0.5) pushPoint(xB, rect.y1);
                                            }

                                            if (pts.length < 2) return null;
                                            const sorted = pts.sort((a, b) => (a.x - b.x) || (a.y - b.y));
                                            return { p1: sorted[0], p2: sorted[sorted.length - 1] };
                                        };

                                        const segments: Array<{ p1: { x: number; y: number }; p2: { x: number; y: number } }> = [];
                                        uniqCenters.forEach(center => {
                                            const offsets = [center - halfWidthPx, center + halfWidthPx];
                                            offsets.forEach((d) => {
                                                const seg = getSegment(d);
                                                if (seg) segments.push(seg);
                                            });
                                        });

                                        return segments;
                                    };

                                    const baseRect = mirrorLatten
                                        ? { x0: startX, y0: startY, x1: midX, y1: startY + rectH }
                                        : { x0: startX, y0: startY, x1: startX + rectW, y1: startY + rectH };

                                    const leftSegments = buildAngledLatten(baseRect, angleDeg);
                                    const rightSegments = mirrorLatten
                                        ? leftSegments.map(seg => ({
                                            p1: { x: (2 * midX) - seg.p1.x, y: seg.p1.y },
                                            p2: { x: (2 * midX) - seg.p2.x, y: seg.p2.y },
                                        }))
                                        : [];

                                    return (
                                        <>
                                            {leftSegments.map((seg, idx) => (
                                                <line
                                                    key={`lat-angled-${idx}`}
                                                    x1={seg.p1.x}
                                                    y1={seg.p1.y}
                                                    x2={seg.p2.x}
                                                    y2={seg.p2.y}
                                                    {...dashProps}
                                                />
                                            ))}
                                            {mirrorLatten && rightSegments.map((seg, idx) => (
                                                <line
                                                    key={`lat-angled-mirror-${idx}`}
                                                    x1={seg.p1.x}
                                                    y1={seg.p1.y}
                                                    x2={seg.p2.x}
                                                    y2={seg.p2.y}
                                                    {...dashProps}
                                                />
                                            ))}
                                        </>
                                    );
                                })()}

                                    {/* Double end battens (horizontal only) */}
                                    {doubleEndBattens && orientation === 'horizontal' && (() => {
                                    const extraStart = (LAT_WIDTH_MM / 2) + LAT_WIDTH_MM;
                                    const extraEnd = hoogte - ((LAT_WIDTH_MM / 2) + LAT_WIDTH_MM);
                                    const els: React.ReactNode[] = [];

                                    if (extraStart < hoogte) {
                                        const y = startY + extraStart * pxPerMm;
                                        els.push(
                                            <g key="dbl-start">
                                                {mirrorLatten ? (
                                                    <>
                                                        <line x1={startX} y1={y - halfWidthPx} x2={midX} y2={y - halfWidthPx} {...dashProps} />
                                                        <line x1={midX} y1={y - halfWidthPx} x2={startX + rectW} y2={y - halfWidthPx} {...dashProps} />
                                                        <line x1={startX} y1={y + halfWidthPx} x2={midX} y2={y + halfWidthPx} {...dashProps} />
                                                        <line x1={midX} y1={y + halfWidthPx} x2={startX + rectW} y2={y + halfWidthPx} {...dashProps} />
                                                    </>
                                                ) : (
                                                    <>
                                                        <line x1={startX} y1={y - halfWidthPx} x2={startX + rectW} y2={y - halfWidthPx} {...dashProps} />
                                                        <line x1={startX} y1={y + halfWidthPx} x2={startX + rectW} y2={y + halfWidthPx} {...dashProps} />
                                                    </>
                                                )}
                                            </g>
                                        );
                                    }
                                    if (extraEnd > 0) {
                                        const y = startY + extraEnd * pxPerMm;
                                        els.push(
                                            <g key="dbl-end">
                                                {mirrorLatten ? (
                                                    <>
                                                        <line x1={startX} y1={y - halfWidthPx} x2={midX} y2={y - halfWidthPx} {...dashProps} />
                                                        <line x1={midX} y1={y - halfWidthPx} x2={startX + rectW} y2={y - halfWidthPx} {...dashProps} />
                                                        <line x1={startX} y1={y + halfWidthPx} x2={midX} y2={y + halfWidthPx} {...dashProps} />
                                                        <line x1={midX} y1={y + halfWidthPx} x2={startX + rectW} y2={y + halfWidthPx} {...dashProps} />
                                                    </>
                                                ) : (
                                                    <>
                                                        <line x1={startX} y1={y - halfWidthPx} x2={startX + rectW} y2={y - halfWidthPx} {...dashProps} />
                                                        <line x1={startX} y1={y + halfWidthPx} x2={startX + rectW} y2={y + halfWidthPx} {...dashProps} />
                                                    </>
                                                )}
                                            </g>
                                        );
                                    }
                                    return els;
                                    })()}
                                </g>

                                {/* Mirror seam indicator */}
                                {mirrorLatten && (
                                    <line
                                        x1={midX}
                                        y1={startY}
                                        x2={midX}
                                        y2={yBottom}
                                        stroke={structureColor}
                                        strokeWidth="0.5"
                                        strokeDasharray="2,6"
                                        opacity="0.35"
                                    />
                                )}

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

                                {mirrorBadgeText && (
                                    <g>
                                        <rect
                                            x={startX + rectW - 42}
                                            y={startY + 10}
                                            width={30}
                                            height={18}
                                            rx={4}
                                            fill="rgba(0,0,0,0.6)"
                                            stroke="rgba(255,255,255,0.15)"
                                            strokeWidth="0.5"
                                        />
                                        <text
                                            x={startX + rectW - 27}
                                            y={startY + 23}
                                            textAnchor="middle"
                                            fill="rgb(167, 243, 208)"
                                            fontSize="11"
                                            style={{ fontFamily: 'monospace', fontWeight: 700 }}
                                        >
                                            {mirrorBadgeText}
                                        </text>
                                    </g>
                                )}
                            </>
                        );
                    }}
                </BaseDrawingFrame>
            </div>
        </div>
    );
}
