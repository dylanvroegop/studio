'use client';

import React, { useMemo } from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';
import {
    OverallDimensions,
    GridMeasurements
} from './shared/measurements';
import { DEFAULT_MEASUREMENT_STYLE } from './shared/measurements/types';
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
    shape?: 'rectangle' | 'slope' | 'gable';
}

interface Point {
    x: number;
    y: number;
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
    shape,
}: BoeiboordDrawingProps) {
    const clipId = React.useId().replace(/:/g, '');
    const clipIdRight = React.useId().replace(/:/g, '');

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

    // Determine if we should use rotated board view
    const useRotatedView = shape === 'slope' || shape === 'gable' || boeiboordOrientation === 'slope';

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
                        const { startX, startY, rectW, rectH, pxPerMm, SVG_HEIGHT, drawH, drawW } = ctx;

                        const structureColor = "rgb(70, 75, 85)";
                        const LAT_WIDTH_MM = 22;
                        const halfWidthPx = (LAT_WIDTH_MM * pxPerMm) / 2;
                        const angleDegRaw = typeof boeiboordAngle === 'number'
                            ? boeiboordAngle
                            : parseFloat(String(boeiboordAngle ?? '')) || 45;
                        const angleDeg = Math.max(0, Math.min(89.9, angleDegRaw));
                        const mirrorLatten = !!boeiboordMirror;
                        const midX = startX + rectW / 2;
                        const yBottom = startY + rectH;

                        const dashProps = {
                            stroke: structureColor,
                            strokeWidth: 1,
                            strokeDasharray: "4,4" as string,
                        };

                        // === ROTATED BOARD VIEW ===
                        if (useRotatedView) {
                            const angleRad = (angleDeg * Math.PI) / 180;

                            // Simple approach: draw parallelograms directly
                            // Build a slope box inside the available draw area so the angle remains visible
                            const drawTop = startY - (drawH - rectH) / 2;
                            const maxRise = Math.max(60, drawH * 0.9);
                            const baseY = drawTop + (drawH - maxRise) / 2 + maxRise;

                            // Board thickness (perpendicular to slope) based on input height
                            const desiredThickness = Math.max(6, hoogte * pxPerMm);
                            const boardThickness = Math.min(desiredThickness, maxRise * 0.9);

                            const spanBase = mirrorLatten ? rectW / 2 : rectW;
                            const desiredRise = Math.tan(angleRad) * spanBase;
                            const riseCap = Math.max(0, maxRise - boardThickness);
                            const rise = desiredRise <= 0 ? 0 : Math.min(riseCap, desiredRise);
                            const effectiveSpan = desiredRise > 0
                                ? Math.min(spanBase, riseCap / Math.tan(angleRad))
                                : spanBase;
                            const spanLeftX = midX - (mirrorLatten ? effectiveSpan : effectiveSpan / 2);
                            const spanRightX = mirrorLatten ? midX + effectiveSpan : midX + effectiveSpan / 2;
                            const peakY = baseY - rise;
                            const lerpPoint = (a: Point, b: Point, t: number): Point => ({
                                x: a.x + (b.x - a.x) * t,
                                y: a.y + (b.y - a.y) * t,
                            });
                            const pointAtX = (p1: Point, p2: Point, x: number): Point => {
                                if (Math.abs(p2.x - p1.x) < 0.0001) return { x: p1.x, y: p1.y };
                                const t = (x - p1.x) / (p2.x - p1.x);
                                return { x, y: p1.y + t * (p2.y - p1.y) };
                            };
                            const normalize = (v: Point): Point => {
                                const len = Math.hypot(v.x, v.y) || 1;
                                return { x: v.x / len, y: v.y / len };
                            };

                            type BoardEdges = {
                                topStart: Point;
                                topEnd: Point;
                                bottomStart: Point;
                                bottomEnd: Point;
                            };

                            const buildLattenLines = (edges: BoardEdges) => {
                                if (latafstand <= 0) return [];
                                const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
                                const spacingPx = latafstand * pxPerMm;
                                const length = Math.hypot(edges.topEnd.x - edges.topStart.x, edges.topEnd.y - edges.topStart.y);
                                const numLatten = Math.floor(length / spacingPx);
                                for (let i = 0; i <= numLatten; i++) {
                                    const t = i / Math.max(numLatten, 1);
                                    const top = lerpPoint(edges.topStart, edges.topEnd, t);
                                    const bottom = lerpPoint(edges.bottomStart, edges.bottomEnd, t);
                                    lines.push({ x1: top.x, y1: top.y, x2: bottom.x, y2: bottom.y });
                                }
                                return lines;
                            };

                            const renderAlignedDimension = (
                                p1: Point,
                                p2: Point,
                                label: number | string,
                                offset = 0
                            ) => {
                                const dx = p2.x - p1.x;
                                const dy = p2.y - p1.y;
                                const len = Math.hypot(dx, dy) || 1;
                                const nx = -dy / len;
                                const ny = dx / len;
                                const x1 = p1.x + nx * offset;
                                const y1 = p1.y + ny * offset;
                                const x2 = p2.x + nx * offset;
                                const y2 = p2.y + ny * offset;
                                const cx = (x1 + x2) / 2;
                                const cy = (y1 + y2) / 2;
                                let angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
                                if (angle > 90 || angle < -90) angle += 180;

                                return (
                                    <g className="text-emerald-500" pointerEvents="none">
                                        <line
                                            x1={p1.x}
                                            y1={p1.y}
                                            x2={x1}
                                            y2={y1}
                                            stroke={DEFAULT_MEASUREMENT_STYLE.lineColor}
                                            strokeWidth={DEFAULT_MEASUREMENT_STYLE.strokeWidth}
                                            opacity="0.5"
                                        />
                                        <line
                                            x1={p2.x}
                                            y1={p2.y}
                                            x2={x2}
                                            y2={y2}
                                            stroke={DEFAULT_MEASUREMENT_STYLE.lineColor}
                                            strokeWidth={DEFAULT_MEASUREMENT_STYLE.strokeWidth}
                                            opacity="0.5"
                                        />
                                        <line
                                            x1={x1}
                                            y1={y1}
                                            x2={x2}
                                            y2={y2}
                                            stroke={DEFAULT_MEASUREMENT_STYLE.lineColor}
                                            strokeWidth={DEFAULT_MEASUREMENT_STYLE.strokeWidth}
                                        />
                                        <circle cx={x1} cy={y1} r={DEFAULT_MEASUREMENT_STYLE.dotRadius} fill={DEFAULT_MEASUREMENT_STYLE.lineColor} />
                                        <circle cx={x2} cy={y2} r={DEFAULT_MEASUREMENT_STYLE.dotRadius} fill={DEFAULT_MEASUREMENT_STYLE.lineColor} />
                                        <g transform={`translate(${cx}, ${cy}) rotate(${angle})`}>
                                            <rect x="-30" y="-10" width="60" height="20" fill="#09090b" opacity="1" />
                                            <text
                                                x="0"
                                                y="0.5"
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                fill={DEFAULT_MEASUREMENT_STYLE.textColor}
                                                className="text-[16px] font-mono select-none font-medium"
                                                style={{ fontFamily: "'JetBrains Mono', monospace" }}
                                            >
                                                {label}
                                            </text>
                                        </g>
                                    </g>
                                );
                            };

                            const renderMirrorLengthDimension = (
                                outer: Point,
                                inner: Point,
                                label: number | string,
                                offset: number,
                                seamX: number
                            ) => {
                                const dx = inner.x - outer.x;
                                const dy = inner.y - outer.y;
                                const len = Math.hypot(dx, dy) || 1;
                                const nx = -dy / len;
                                const ny = dx / len;
                                const outerOffset = { x: outer.x + nx * offset, y: outer.y + ny * offset };
                                const innerOffset = { x: inner.x + nx * offset, y: inner.y + ny * offset };
                                const seamOffset = pointAtX(outerOffset, innerOffset, seamX);

                                const x1 = outerOffset.x;
                                const y1 = outerOffset.y;
                                const x2 = seamOffset.x;
                                const y2 = seamOffset.y;
                                const cx = (x1 + x2) / 2;
                                const cy = (y1 + y2) / 2;
                                let angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
                                if (angle > 90 || angle < -90) angle += 180;

                                return (
                                    <g className="text-emerald-500" pointerEvents="none">
                                        <line
                                            x1={outer.x}
                                            y1={outer.y}
                                            x2={x1}
                                            y2={y1}
                                            stroke={DEFAULT_MEASUREMENT_STYLE.lineColor}
                                            strokeWidth={DEFAULT_MEASUREMENT_STYLE.strokeWidth}
                                            opacity="0.5"
                                        />
                                        <line
                                            x1={inner.x}
                                            y1={inner.y}
                                            x2={seamX}
                                            y2={y2}
                                            stroke={DEFAULT_MEASUREMENT_STYLE.lineColor}
                                            strokeWidth={DEFAULT_MEASUREMENT_STYLE.strokeWidth}
                                            opacity="0.5"
                                        />
                                        <line
                                            x1={x1}
                                            y1={y1}
                                            x2={x2}
                                            y2={y2}
                                            stroke={DEFAULT_MEASUREMENT_STYLE.lineColor}
                                            strokeWidth={DEFAULT_MEASUREMENT_STYLE.strokeWidth}
                                        />
                                        <circle cx={x1} cy={y1} r={DEFAULT_MEASUREMENT_STYLE.dotRadius} fill={DEFAULT_MEASUREMENT_STYLE.lineColor} />
                                        <circle cx={x2} cy={y2} r={DEFAULT_MEASUREMENT_STYLE.dotRadius} fill={DEFAULT_MEASUREMENT_STYLE.lineColor} />
                                        <g transform={`translate(${cx}, ${cy}) rotate(${angle})`}>
                                            <rect x="-30" y="-10" width="60" height="20" fill="#09090b" opacity="1" />
                                            <text
                                                x="0"
                                                y="0.5"
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                fill={DEFAULT_MEASUREMENT_STYLE.textColor}
                                                className="text-[16px] font-mono select-none font-medium"
                                                style={{ fontFamily: "'JetBrains Mono', monospace" }}
                                            >
                                                {label}
                                            </text>
                                        </g>
                                    </g>
                                );
                            };

                            const lengthOffsetDown = (p1: Point, p2: Point, offset = 40) => {
                                const dx = p2.x - p1.x;
                                const dy = p2.y - p1.y;
                                const len = Math.hypot(dx, dy) || 1;
                                const ny = dx / len;
                                return (ny < 0 ? -1 : 1) * offset;
                            };

                            const getBounds = (points: Point[]) => {
                                const xs = points.map(p => p.x);
                                const ys = points.map(p => p.y);
                                const minX = Math.min(...xs);
                                const maxX = Math.max(...xs);
                                const minY = Math.min(...ys);
                                const maxY = Math.max(...ys);
                                return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
                            };

                            const fitTransform = (points: Point[]) => {
                                const bounds = getBounds(points);
                                const pad = 24;
                                const availW = Math.max(1, drawW - pad * 2);
                                const availH = Math.max(1, drawH - pad * 2);
                                const scale = Math.min(
                                    availW / Math.max(1, bounds.width),
                                    availH / Math.max(1, bounds.height)
                                );
                                const cx = (bounds.minX + bounds.maxX) / 2;
                                const cy = (bounds.minY + bounds.maxY) / 2;
                                const targetX = startX + drawW / 2;
                                const targetY = startY + drawH / 2;
                                return `translate(${targetX}, ${targetY}) scale(${scale}) translate(${-cx}, ${-cy})`;
                            };

                            // For mirrored view: two boards meeting at center peak
                            // For single view: one board going from left to right

                            let leftPath = '';
                            let rightPath = '';

                            if (mirrorLatten) {
                                // Two boards meeting at peak (gable look)
                                const peakX = midX;
                                // Left board (outer end = perpendicular, inner end = vertical seam)
                                const leftBottomStart = { x: spanLeftX, y: baseY };
                                const leftBottomEnd = { x: peakX, y: peakY };
                                const leftDir = { x: leftBottomEnd.x - leftBottomStart.x, y: leftBottomEnd.y - leftBottomStart.y };
                                const leftNormal = normalize({ x: leftDir.y, y: -leftDir.x }); // upward & outward

                                const leftTopStart = {
                                    x: leftBottomStart.x + leftNormal.x * boardThickness,
                                    y: leftBottomStart.y + leftNormal.y * boardThickness
                                };
                                const leftTopEndRaw = {
                                    x: leftBottomEnd.x + leftNormal.x * boardThickness,
                                    y: leftBottomEnd.y + leftNormal.y * boardThickness
                                };
                                const leftTopSeam = pointAtX(leftTopStart, leftTopEndRaw, peakX);

                                const leftEdges: BoardEdges = {
                                    topStart: leftTopStart,
                                    topEnd: leftTopSeam,
                                    bottomStart: leftBottomStart,
                                    bottomEnd: leftBottomEnd
                                };

                                // Right board (outer end = perpendicular, inner end = vertical seam)
                                const rightBottomStart = { x: peakX, y: peakY };
                                const rightBottomEnd = { x: spanRightX, y: baseY };
                                const rightDir = { x: rightBottomEnd.x - rightBottomStart.x, y: rightBottomEnd.y - rightBottomStart.y };
                                const rightNormal = normalize({ x: rightDir.y, y: -rightDir.x }); // upward & outward

                                const rightTopStartRaw = {
                                    x: rightBottomStart.x + rightNormal.x * boardThickness,
                                    y: rightBottomStart.y + rightNormal.y * boardThickness
                                };
                                const rightTopEnd = {
                                    x: rightBottomEnd.x + rightNormal.x * boardThickness,
                                    y: rightBottomEnd.y + rightNormal.y * boardThickness
                                };
                                const rightTopSeam = pointAtX(rightTopStartRaw, rightTopEnd, peakX);

                                const rightEdges: BoardEdges = {
                                    topStart: rightTopSeam,
                                    topEnd: rightTopEnd,
                                    bottomStart: rightBottomStart,
                                    bottomEnd: rightBottomEnd
                                };

                                leftPath = `M ${leftEdges.bottomStart.x} ${leftEdges.bottomStart.y} L ${leftEdges.bottomEnd.x} ${leftEdges.bottomEnd.y} L ${leftEdges.topEnd.x} ${leftEdges.topEnd.y} L ${leftEdges.topStart.x} ${leftEdges.topStart.y} Z`;
                                rightPath = `M ${rightEdges.bottomStart.x} ${rightEdges.bottomStart.y} L ${rightEdges.bottomEnd.x} ${rightEdges.bottomEnd.y} L ${rightEdges.topEnd.x} ${rightEdges.topEnd.y} L ${rightEdges.topStart.x} ${rightEdges.topStart.y} Z`;

                                const leftLatten = buildLattenLines(leftEdges);
                                const rightLatten = buildLattenLines(rightEdges);

                                const heightOffset = -40;
                                const lengthOffsetLeft = lengthOffsetDown(leftEdges.bottomStart, leftEdges.bottomEnd, 40);
                                const lengthOffsetRight = lengthOffsetDown(rightEdges.bottomEnd, rightEdges.bottomStart, 40);

                                const fitPoints: Point[] = [
                                    leftEdges.bottomStart,
                                    leftEdges.bottomEnd,
                                    leftEdges.topStart,
                                    leftEdges.topEnd,
                                    rightEdges.bottomStart,
                                    rightEdges.bottomEnd,
                                    rightEdges.topStart,
                                    rightEdges.topEnd
                                ];
                                const transform = fitTransform(fitPoints);

                                return (
                                    <>
                                        <g transform={transform}>
                                        {/* Left board outline */}
                                        {leftPath && (
                                            <path
                                                d={leftPath}
                                                fill="rgba(70, 75, 85, 0.12)"
                                                stroke={structureColor}
                                                strokeWidth="1.5"
                                            />
                                        )}

                                        {/* Right board outline (mirrored) */}
                                        {rightPath && (
                                            <path
                                                d={rightPath}
                                                fill="rgba(70, 75, 85, 0.12)"
                                                stroke={structureColor}
                                                strokeWidth="1.5"
                                            />
                                        )}

                                        {/* Left board latten */}
                                        {leftLatten.map((line, idx) => (
                                            <line
                                                key={`lat-left-${idx}`}
                                                x1={line.x1}
                                                y1={line.y1}
                                                x2={line.x2}
                                                y2={line.y2}
                                                {...dashProps}
                                            />
                                        ))}

                                        {/* Right board latten (mirrored) */}
                                        {rightLatten.map((line, idx) => (
                                            <line
                                                key={`lat-right-${idx}`}
                                                x1={line.x1}
                                                y1={line.y1}
                                                x2={line.x2}
                                                y2={line.y2}
                                                {...dashProps}
                                            />
                                        ))}

                                        {/* Peak indicator for mirrored */}
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

                                        {/* Dimensions - height at kopkant, length per side */}
                                        {renderAlignedDimension(
                                            leftEdges.bottomStart,
                                            leftEdges.topStart,
                                            hoogte,
                                            heightOffset
                                        )}
                                        {renderMirrorLengthDimension(
                                            leftEdges.bottomStart,
                                            leftEdges.bottomEnd,
                                            lengte,
                                            lengthOffsetLeft,
                                            peakX
                                        )}
                                        {renderMirrorLengthDimension(
                                            rightEdges.bottomEnd,
                                            rightEdges.bottomStart,
                                            lengte,
                                            lengthOffsetRight,
                                            peakX
                                        )}
                                        </g>

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
                                                    x={10}
                                                    y={10}
                                                    width={90}
                                                    height={22}
                                                    rx={4}
                                                    fill="rgba(0,0,0,0.6)"
                                                    stroke="rgba(255,255,255,0.15)"
                                                    strokeWidth="0.5"
                                                />
                                                <text
                                                    x={55}
                                                    y={22}
                                                    fontSize="11"
                                                    fontWeight="bold"
                                                    fill="rgb(167, 243, 208)"
                                                    textAnchor="middle"
                                                    dominantBaseline="middle"
                                                    style={{ fontFamily: 'monospace' }}
                                                >
                                                    {mirrorBadgeText}
                                                </text>
                                            </g>
                                        )}
                                    </>
                                );
                            } else {
                                // Single board going from bottom-left to top-right across width, scaled to fit height
                                const bottomStart = { x: spanLeftX, y: baseY };
                                const bottomEnd = { x: spanRightX, y: peakY };
                                const dir = { x: bottomEnd.x - bottomStart.x, y: bottomEnd.y - bottomStart.y };
                                const normal = normalize({ x: dir.y, y: -dir.x });
                                const topStart = {
                                    x: bottomStart.x + normal.x * boardThickness,
                                    y: bottomStart.y + normal.y * boardThickness
                                };
                                const topEnd = {
                                    x: bottomEnd.x + normal.x * boardThickness,
                                    y: bottomEnd.y + normal.y * boardThickness
                                };

                                const edges: BoardEdges = {
                                    topStart,
                                    topEnd,
                                    bottomStart,
                                    bottomEnd
                                };

                                leftPath = `M ${edges.bottomStart.x} ${edges.bottomStart.y} L ${edges.bottomEnd.x} ${edges.bottomEnd.y} L ${edges.topEnd.x} ${edges.topEnd.y} L ${edges.topStart.x} ${edges.topStart.y} Z`;

                                const leftLatten = buildLattenLines(edges);

                                const heightOffset = -20;
                                const lengthOffset = lengthOffsetDown(edges.bottomStart, edges.bottomEnd, 40);

                                const fitPoints: Point[] = [
                                    edges.bottomStart,
                                    edges.bottomEnd,
                                    edges.topStart,
                                    edges.topEnd
                                ];
                                const transform = fitTransform(fitPoints);

                                return (
                                    <>
                                        <g transform={transform}>
                                        {leftPath && (
                                            <path
                                                d={leftPath}
                                                fill="rgba(70, 75, 85, 0.12)"
                                                stroke={structureColor}
                                                strokeWidth="1.5"
                                            />
                                        )}

                                        {leftLatten.map((line, idx) => (
                                            <line
                                                key={`lat-single-${idx}`}
                                                x1={line.x1}
                                                y1={line.y1}
                                                x2={line.x2}
                                                y2={line.y2}
                                                {...dashProps}
                                            />
                                        ))}

                                        {renderAlignedDimension(
                                            edges.bottomStart,
                                            edges.topStart,
                                            hoogte,
                                            heightOffset
                                        )}
                                        {renderAlignedDimension(
                                            edges.bottomStart,
                                            edges.bottomEnd,
                                            lengte,
                                            lengthOffset
                                        )}
                                        </g>

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
                            }
                        }

                        // === HORIZONTAL (RECTANGLE) VIEW - Original code ===
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
                                {/* Main outline - rectangle */}
                                <rect
                                    x={startX} y={startY}
                                    width={rectW} height={rectH}
                                    fill="none" stroke={structureColor} strokeWidth="1"
                                />

                                <g>
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
                                    })()}

                                    {/* Double end battens */}
                                    {doubleEndBattens && (() => {
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
                                            x={10}
                                            y={10}
                                            width={90}
                                            height={22}
                                            rx={4}
                                            fill="rgba(0,0,0,0.6)"
                                            stroke="rgba(255,255,255,0.15)"
                                            strokeWidth="0.5"
                                        />
                                        <text
                                            x={55}
                                            y={22}
                                            fontSize="11"
                                            fontWeight="bold"
                                            fill="rgb(167, 243, 208)"
                                            textAnchor="middle"
                                            dominantBaseline="middle"
                                            style={{ fontFamily: 'monospace' }}
                                        >
                                            {mirrorBadgeText}
                                        </text>
                                    </g>
                                )}
                            </>
                        );
                    }}
                </BaseDrawingFrame>
            </div >
        </div >
    );
}
