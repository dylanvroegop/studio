'use client';

import React from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';
import { OverallDimensions, DimensionLine, OpeningMeasurements } from './shared/measurements';
import { OpeningLabels } from './shared/OpeningLabels';

interface SchuttingOpening {
    id: string;
    type?: string;
    width: number;
    height: number;
    fromLeft: number;
    fromBottom: number;
    [key: string]: any;
}

interface SchuttingDrawingProps {
    lengte: number;
    hoogte: number;
    paalafstand: number;
    startFromRight?: boolean;
    plank_richting?: 'horizontal' | 'vertical';
    type_schutting?: 'planken' | 'schermen';
    betonband_hoogte?: number;
    openings?: SchuttingOpening[];
    onOpeningsChange?: (openings: any[]) => void;
    showOnderplaten?: boolean;
    fitContainer?: boolean;
    className?: string;
    // ... allow generic props
    [key: string]: any;
}

export function SchuttingDrawing({
    lengte,
    hoogte,
    paalafstand = 1810,
    startFromRight = false,
    plank_richting = 'horizontal',
    type_schutting = 'schermen',
    betonband_hoogte = 0,
    openings = [],
    onOpeningsChange,
    showOnderplaten = true,
    fitContainer = false,
    className,
    ...props
}: SchuttingDrawingProps) {

    const drawingWidth = parseFloat(String(lengte)) || 0;
    const drawingHeight = parseFloat(String(hoogte)) || 0;
    const rawPostDistance = parseFloat(String(paalafstand)) || 1810;
    const postDistance = Math.max(200, rawPostDistance); // Minimum 200mm limit
    const rawBandHeight = parseFloat(String(betonband_hoogte)) || 0;
    const bandHeight = showOnderplaten ? rawBandHeight : 0;
    const [draggingId, setDraggingId] = React.useState<string | null>(null);
    const dragStartRef = React.useRef<{ x: number; y: number; opId: string; origLeft: number; origBottom: number } | null>(null);
    const metricsRef = React.useRef<{ pxPerMm: number } | null>(null);

    const normalizedOpenings = React.useMemo<SchuttingOpening[]>(() => {
        if (!Array.isArray(openings)) return [];
        return openings
            .map((op: any, idx: number) => ({
                ...op,
                id: String(op?.id ?? `opening-${idx}`),
                width: Math.max(0, parseFloat(String(op?.width ?? 0)) || 0),
                height: Math.max(0, parseFloat(String(op?.height ?? 0)) || 0),
                fromLeft: Math.max(0, parseFloat(String(op?.fromLeft ?? 0)) || 0),
                fromBottom: Math.max(0, parseFloat(String(op?.fromBottom ?? 0)) || 0),
            }));
    }, [openings]);

    const handlePointerDown = React.useCallback((e: React.PointerEvent, op: SchuttingOpening) => {
        if (!onOpeningsChange) return;
        e.preventDefault();
        e.stopPropagation();
        (e.target as Element).setPointerCapture(e.pointerId);
        setDraggingId(op.id);
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            opId: op.id,
            origLeft: op.fromLeft || 0,
            origBottom: op.fromBottom || 0,
        };
    }, [onOpeningsChange]);

    const handlePointerMove = React.useCallback((e: React.PointerEvent) => {
        if (!draggingId || !dragStartRef.current || !onOpeningsChange) return;

        const pxPerMm = metricsRef.current?.pxPerMm || 1;
        const start = dragStartRef.current;
        const dxMm = (e.clientX - start.x) / pxPerMm;
        const dyMm = (e.clientY - start.y) / pxPerMm;

        const draggedOp = normalizedOpenings.find((o) => o.id === draggingId);
        if (!draggedOp) return;

        let newLeft = Math.round(start.origLeft + dxMm);
        let newBottom = Math.round(start.origBottom - dyMm);
        const maxLeft = Math.max(0, drawingWidth - draggedOp.width);
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        // Allow gate height to exceed fence height; keep fromBottom independent from opening height.
        newBottom = Math.max(0, Math.min(newBottom, Math.max(0, drawingHeight)));

        onOpeningsChange(
            normalizedOpenings.map((o) => (
                o.id === draggingId ? { ...o, fromLeft: newLeft, fromBottom: newBottom } : o
            ))
        );
    }, [draggingId, drawingHeight, drawingWidth, normalizedOpenings, onOpeningsChange]);

    const handlePointerUp = React.useCallback((e: React.PointerEvent) => {
        if (!draggingId) return;
        setDraggingId(null);
        dragStartRef.current = null;
        try {
            (e.target as Element).releasePointerCapture(e.pointerId);
        } catch (_err) {
            // No-op: pointer may already be released.
        }
    }, [draggingId]);

    const areaStats = React.useMemo(() => ({
        gross: drawingWidth * drawingHeight,
        net: Math.max(0, (drawingWidth * drawingHeight) - normalizedOpenings.reduce((acc, op) => acc + (op.width * op.height), 0)),
        hasOpenings: normalizedOpenings.length > 0
    }), [drawingWidth, drawingHeight, normalizedOpenings]);

    return (
        <BaseDrawingFrame
            areaStats={areaStats}
            width={drawingWidth}
            height={drawingHeight}
            className={className}
            fitContainer={fitContainer}
            suppressTotalDimensions={true}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}

        >
            {({ startX, startY, rectW, rectH, pxPerMm }) => {
                metricsRef.current = { pxPerMm };

                const postWidthMm = 100; // Standard 10x10 post
                const postWidthPx = postWidthMm * pxPerMm;

                const bandHeightPx = bandHeight * pxPerMm;
                const effectiveFenceHeightPx = rectH - bandHeightPx;

                // Colors
                const postColor = "#5D4037"; // Dark Brown
                const plankColor = "#8D6E63"; // Brown
                const bandColor = "#9E9E9E"; // Grey

                // 2. Posts (Palen)
                // Post Data
                const innerDistance = postDistance; // User input is now "between" posts
                const periodMm = innerDistance + postWidthMm;

                // How many full segments fit?
                // length = Post + (Space + Post) * N + Remainder?
                // Simplified: Just loop steps of periodMm until we run out of width.
                // Or: Math.ceil((drawingWidth - postWidthMm) / periodMm) + 1?
                // Let's just loop.

                const posts: React.ReactNode[] = [];
                const panels: React.ReactNode[] = [];

                // Gate ranges (openings) split the fence into independent sections.
                const rawGateRanges = normalizedOpenings
                    .map((op) => {
                        const opW = Math.max(0, Math.min(op.width, drawingWidth));
                        const opLeft = Math.max(0, Math.min(op.fromLeft, Math.max(0, drawingWidth - opW)));
                        return { start: opLeft, end: opLeft + opW };
                    })
                    .filter((range) => (range.end - range.start) > 1)
                    .sort((a, b) => a.start - b.start);

                const gateRanges = rawGateRanges.reduce<Array<{ start: number; end: number }>>((acc, range) => {
                    if (acc.length === 0) {
                        acc.push(range);
                        return acc;
                    }
                    const last = acc[acc.length - 1];
                    if (range.start <= last.end + 1) {
                        last.end = Math.max(last.end, range.end);
                    } else {
                        acc.push(range);
                    }
                    return acc;
                }, []);

                // Build panel segments that remain after removing gate ranges.
                const panelSegments: Array<{ start: number; end: number }> = [];
                let segmentCursor = 0;
                gateRanges.forEach((range) => {
                    if (range.start - segmentCursor > 1) {
                        panelSegments.push({ start: segmentCursor, end: range.start });
                    }
                    segmentCursor = Math.max(segmentCursor, range.end);
                });
                if (drawingWidth - segmentCursor > 1) {
                    panelSegments.push({ start: segmentCursor, end: drawingWidth });
                }

                const allPostStartsSet = new Set<number>();
                const postStartBySegment: number[][] = [];

                panelSegments.forEach((segment) => {
                    const segStart = Math.max(0, Math.min(segment.start, drawingWidth));
                    const segEnd = Math.max(segStart, Math.min(segment.end, drawingWidth));
                    const segLength = segEnd - segStart;
                    if (segLength <= 1) return;

                    const segEndPostStart = Math.max(segStart, segEnd - postWidthMm);
                    const starts: number[] = [];

                    if (startFromRight) {
                        starts.push(segEndPostStart);
                        let x = segEndPostStart;
                        while ((x - periodMm) >= (segStart - 1)) {
                            x -= periodMm;
                            starts.push(x);
                        }
                        if (Math.abs(starts[starts.length - 1] - segStart) > 1) {
                            starts.push(segStart);
                        }
                    } else {
                        starts.push(segStart);
                        let x = segStart;
                        while ((x + periodMm) <= (segEndPostStart + 1)) {
                            x += periodMm;
                            starts.push(x);
                        }
                        if (Math.abs(starts[starts.length - 1] - segEndPostStart) > 1) {
                            starts.push(segEndPostStart);
                        }
                    }

                    const uniqueStarts = starts
                        .map((value) => Math.max(segStart, Math.min(value, segEndPostStart)))
                        .sort((a, b) => a - b)
                        .reduce<number[]>((acc, value) => {
                            if (acc.length === 0 || Math.abs(value - acc[acc.length - 1]) > 1) {
                                acc.push(value);
                            }
                            return acc;
                        }, []);

                    if (uniqueStarts.length > 0) {
                        postStartBySegment.push(uniqueStarts);
                        uniqueStarts.forEach((value) => allPostStartsSet.add(Math.round(value * 1000) / 1000));
                    }
                });

                const allPostStarts = [...allPostStartsSet].sort((a, b) => a - b);

                // Draw posts.
                allPostStarts.forEach((xMm, i) => {
                    const xPx = startX + (xMm * pxPerMm);
                    if (xMm >= drawingWidth) return;

                    if (effectiveFenceHeightPx > 0) {
                        posts.push(
                            <rect
                                key={`post-${i}`}
                                x={xPx}
                                y={startY}
                                width={postWidthPx}
                                height={effectiveFenceHeightPx + (bandHeightPx > 0 ? bandHeightPx : 0)}
                                fill={postColor}
                                stroke="#3E2723"
                                strokeWidth="1"
                            />
                        );
                    }
                });

                // Draw panels in each independent segment.
                postStartBySegment.forEach((segmentPosts, segIdx) => {
                    for (let i = 0; i < segmentPosts.length - 1; i++) {
                        const currentPostX = segmentPosts[i];
                        const nextPostX = segmentPosts[i + 1];

                        const panelStartX = currentPostX + postWidthMm;
                        const panelWidthMm = nextPostX - panelStartX;
                        if (panelWidthMm <= 1) continue;

                        const pxX = startX + (panelStartX * pxPerMm);
                        const pxW = panelWidthMm * pxPerMm;

                        if (effectiveFenceHeightPx > 0) {
                            if (type_schutting === 'schermen') {
                                const margin = 5 * pxPerMm;
                                panels.push(
                                    <rect
                                        key={`panel-${segIdx}-${i}`}
                                        x={pxX + margin}
                                        y={startY + margin}
                                        width={Math.max(0, pxW - 2 * margin)}
                                        height={Math.max(0, effectiveFenceHeightPx - 2 * margin)}
                                        fill={plankColor}
                                        opacity="0.8"
                                        stroke="#5D4037"
                                        strokeWidth="1"
                                    />
                                );
                                if (pxW > 20) {
                                    panels.push(<line key={`c1-${segIdx}-${i}`} x1={pxX + margin} y1={startY + margin} x2={pxX + pxW - margin} y2={startY + effectiveFenceHeightPx - margin} stroke="#6D4C41" strokeWidth="1" />);
                                    panels.push(<line key={`c2-${segIdx}-${i}`} x1={pxX + pxW - margin} y1={startY + margin} x2={pxX + margin} y2={startY + effectiveFenceHeightPx - margin} stroke="#6D4C41" strokeWidth="1" />);
                                }
                            } else {
                                const plankSizeMm = 140;
                                const gapMm = 10;
                                const numPlanks = Math.floor(drawingHeight / (plankSizeMm + gapMm));
                                for (let r = 0; r < numPlanks; r++) {
                                    const pY = startY + (r * (plankSizeMm + gapMm) * pxPerMm);
                                    if (pY + (plankSizeMm * pxPerMm) > startY + effectiveFenceHeightPx) break;
                                    panels.push(<rect key={`pl-${segIdx}-${i}-${r}`} x={pxX} y={pY} width={pxW} height={plankSizeMm * pxPerMm} fill={plankColor} stroke="#5D4037" strokeWidth="0.5" />);
                                }
                            }
                        }
                    }
                });

                const openingRows = normalizedOpenings.length;
                const yRef = startY + rectH;
                const openingLastRowY = yRef + 40 + (Math.max(0, openingRows - 1) * 25);
                const overallBottomOffset = 92 + (Math.max(0, openingRows - 1) * 25);
                const overallDimY = yRef + overallBottomOffset;
                const paalafstandDimY = openingRows > 0
                    ? Math.max(
                        openingLastRowY + 14,
                        Math.min(
                            overallDimY - 18,
                            Math.round((openingLastRowY + overallDimY) / 2)
                        )
                    )
                    : yRef + 64;

                return (
                    <g>
                        {bandHeight > 0 &&
                            <rect
                                key="concrete-band"
                                x={startX}
                                y={startY + effectiveFenceHeightPx}
                                width={rectW}
                                height={bandHeightPx}
                                fill={bandColor}
                                stroke="#616161"
                                strokeWidth="1"
                            />
                        }
                        {panels}
                        {posts}
                        {normalizedOpenings.map((op) => {
                            const opW = Math.max(0, Math.min(op.width, drawingWidth));
                            const opH = Math.max(0, op.height);
                            const opLeft = Math.max(0, Math.min(op.fromLeft, Math.max(0, drawingWidth - opW)));
                            const opBottom = Math.max(0, Math.min(op.fromBottom, Math.max(0, drawingHeight)));
                            const drawX = startX + (opLeft * pxPerMm);
                            const drawY = (startY + rectH) - (opBottom * pxPerMm) - (opH * pxPerMm);
                            const drawW = opW * pxPerMm;
                            const drawH = opH * pxPerMm;

                            return (
                                <g
                                    key={`opening-${op.id}`}
                                    onPointerDown={(e) => handlePointerDown(e, op)}
                                    style={{ cursor: onOpeningsChange ? 'move' : 'default' }}
                                >
                                    <rect
                                        x={drawX}
                                        y={drawY}
                                        width={drawW}
                                        height={drawH}
                                        fill="#09090b"
                                        stroke={draggingId === op.id ? "#10b981" : "rgb(70, 75, 85)"}
                                        strokeWidth={draggingId === op.id ? 2 : 1}
                                        opacity={draggingId === op.id ? 0.8 : 1}
                                    />
                                    <path
                                        d={`M ${drawX} ${drawY} L ${drawX + drawW} ${drawY + drawH} M ${drawX + drawW} ${drawY} L ${drawX} ${drawY + drawH}`}
                                        stroke="rgb(70, 75, 85)"
                                        strokeWidth="1"
                                        opacity="0.35"
                                    />
                                    <OpeningLabels
                                        centerX={drawX + drawW / 2}
                                        centerY={drawY + drawH / 2}
                                        typeName={op.type === 'door' || op.type === 'opening' ? 'Tuinpoort' : (op.type || 'Tuinpoort')}
                                        width={opW}
                                        height={opH}
                                    />
                                </g>
                            );
                        })}

                        {/* Paalafstand Measurement (Inner Distance) */}
                        {(() => {
                            const candidateSegments = postStartBySegment.filter((segmentPosts) => segmentPosts.length >= 2);
                            if (candidateSegments.length === 0) return null;

                            const measureSegment = startFromRight
                                ? candidateSegments[candidateSegments.length - 1]
                                : candidateSegments[0];
                            if (!measureSegment || measureSegment.length < 2) return null;

                            const leftPostStart = startFromRight
                                ? measureSegment[measureSegment.length - 2]
                                : measureSegment[0];
                            const rightPostStart = startFromRight
                                ? measureSegment[measureSegment.length - 1]
                                : measureSegment[1];
                            if (rightPostStart <= leftPostStart) return null;

                            const p1x = startX + ((leftPostStart + postWidthMm) * pxPerMm); // Right edge of left post
                            const p2x = startX + (rightPostStart * pxPerMm); // Left edge of right post

                            return (
                                <g>
                                    {/* Extension lines */}
                                    <line
                                        x1={p1x} y1={yRef}
                                        x2={p1x} y2={paalafstandDimY}
                                        stroke="#10b981"
                                        strokeWidth="0.5"
                                        opacity="0.5"
                                    />
                                    <line
                                        x1={p2x} y1={yRef}
                                        x2={p2x} y2={paalafstandDimY}
                                        stroke="#10b981"
                                        strokeWidth="0.5"
                                        opacity="0.5"
                                    />

                                    <DimensionLine
                                        p1={{ x: p1x, y: paalafstandDimY }}
                                        p2={{ x: p2x, y: paalafstandDimY }}
                                        label={Math.round(innerDistance).toString()}
                                        offset={0}
                                        color="#10b981"
                                        orientation="horizontal"
                                    />
                                </g>
                            );
                        })()}

                        <OpeningMeasurements
                            openings={normalizedOpenings.map((op) => ({
                                id: op.id,
                                width: op.width,
                                height: op.height,
                                fromLeft: op.fromLeft,
                                fromBottom: op.fromBottom,
                                type: op.type
                            }))}
                            wallLength={drawingWidth}
                            wallHeight={drawingHeight}
                            svgBaseX={startX}
                            svgBaseY={startY + rectH}
                            pxPerMm={pxPerMm}
                        />

                        <OverallDimensions
                            wallLength={drawingWidth}
                            wallHeight={drawingHeight}
                            svgBaseX={startX}
                            svgBaseY={startY + rectH}
                            pxPerMm={pxPerMm}
                            offsetBottom={overallBottomOffset}
                        />
                    </g>
                );
            }}
        </BaseDrawingFrame>
    );
}
