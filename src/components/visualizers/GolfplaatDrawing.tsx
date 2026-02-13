/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';
import { GridMeasurements, OverallDimensions, OpeningMeasurements } from './shared/measurements';
import { OpeningLabels } from './shared/OpeningLabels';

interface GolfplaatDrawingProps {
    lengte?: number | string; // Horizontal axis in drawing (UI: Breedte)
    hoogte?: number | string; // Vertical axis in drawing (UI: Lengte)
    balkafstand?: number | string;
    startFromRight?: boolean;
    includeTopBottomGording?: boolean;
    aantalDaken?: number | string;
    tussenmuur?: number | string;
    title?: string;
    className?: string;
    fitContainer?: boolean;
    openings?: any[];
    onOpeningsChange?: (newOpenings: any[]) => void;
}

const BEAM_FILL = 'rgb(70, 75, 85)';
const BEAM_STROKE = 'rgb(55, 60, 70)';
const GORDING_HEIGHT_MM = 44;
const HALF_GORDING_HEIGHT_MM = GORDING_HEIGHT_MM / 2;
const TUSSENMUUR_WIDTH_MM = 100;

const labelMap: Record<string, string> = {
    'dakraam': 'Lichtkoepel',
    'schoorsteen': 'Schoorsteen',
    'pijp': 'Pijp',
    'afvoer': 'HWA',
    'opening': 'Sparing',
    'nis': 'Nis'
};

export function GolfplaatDrawing({
    lengte,
    hoogte,
    balkafstand,
    startFromRight = false,
    includeTopBottomGording = false,
    aantalDaken,
    tussenmuur,
    title = 'Dakvlak',
    className,
    fitContainer,
    openings = [],
    onOpeningsChange,
}: GolfplaatDrawingProps) {
    // State for drag
    const [draggingId, setDraggingId] = React.useState<string | null>(null);
    const dragStartRef = React.useRef<{ x: number; y: number; opId: string; origLeft: number; origBottom: number } | null>(null);
    const metricsRef = React.useRef<any>(null);

    const handlePointerDown = (e: React.PointerEvent, op: any) => {
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
            origBottom: op.fromBottom || 0
        };
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!draggingId || !dragStartRef.current || !onOpeningsChange) return;

        const pxPerMm = metricsRef.current?.pxPerMm || 1;
        const start = dragStartRef.current;

        const dxPx = e.clientX - start.x;
        const dyPx = e.clientY - start.y;

        const dxMm = dxPx / pxPerMm;
        const dyMm = dyPx / pxPerMm;

        const draggedOp = openings.find((o: any) => o.id === draggingId);
        if (!draggedOp) return;

        let newLeft = Math.round(start.origLeft + dxMm);
        let newBottom = Math.round(start.origBottom - dyMm);

        const opW = draggedOp.width || 0;
        const opH = draggedOp.height || 0;

        const L = typeof lengte === 'number' ? lengte : parseFloat(String(lengte)) || 0;
        const H = typeof hoogte === 'number' ? hoogte : parseFloat(String(hoogte)) || 0;

        newLeft = Math.max(0, Math.min(newLeft, L - opW));
        newBottom = Math.max(0, Math.min(newBottom, H - opH));

        onOpeningsChange(openings.map((o: any) =>
            o.id === draggingId ? { ...o, fromLeft: newLeft, fromBottom: newBottom } : o
        ));
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (draggingId) {
            setDraggingId(null);
            dragStartRef.current = null;
            (e.target as Element).releasePointerCapture(e.pointerId);
        }
    };

    const lengteNum = typeof lengte === 'number' ? lengte : parseFloat(String(lengte)) || 0;
    const heightNum = typeof hoogte === 'number' ? hoogte : parseFloat(String(hoogte)) || 0;
    const balkafstandNum = typeof balkafstand === 'number' ? balkafstand : parseFloat(String(balkafstand)) || 0;
    const aantalDakenNum = Math.max(1, Math.floor(typeof aantalDaken === 'number' ? aantalDaken : parseFloat(String(aantalDaken)) || 1));
    const tussenmuurNum = typeof tussenmuur === 'number' ? tussenmuur : parseFloat(String(tussenmuur)) || 0;

    const splitPositionsMm = React.useMemo(() => {
        if (lengteNum <= 0) return [];

        if (tussenmuurNum > 0 && tussenmuurNum < lengteNum) {
            return [tussenmuurNum];
        }

        if (aantalDakenNum > 1) {
            const step = lengteNum / aantalDakenNum;
            return Array.from({ length: aantalDakenNum - 1 }, (_, idx) => Math.round((idx + 1) * step));
        }

        return [];
    }, [lengteNum, tussenmuurNum, aantalDakenNum]);

    const areaStats = React.useMemo(() => {
        const gross = lengteNum * heightNum;
        const opArea = openings.reduce((acc: any, op: any) => acc + (op.width * op.height), 0);
        return {
            gross,
            net: Math.max(0, gross - opArea),
            hasOpenings: opArea > 0
        };
    }, [lengteNum, heightNum, openings]);

    return (
        <BaseDrawingFrame
            areaStats={areaStats}
            width={lengteNum}
            height={heightNum}
            widthLabel={`${lengteNum}`}
            heightLabel={`${heightNum}`}
            suppressTotalDimensions={true}
            className={className}
            fitContainer={fitContainer}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            {(metrics) => {
                metricsRef.current = metrics;
                const { startX, startY, rectW, rectH, pxPerMm, SVG_HEIGHT } = metrics;

                // --- 1. Roof Surface (Inner Fill) ---
                const surfaceElement = (
                    <rect
                        key="roof-surface"
                        x={startX}
                        y={startY}
                        width={rectW}
                        height={rectH}
                        fill="rgba(70, 75, 85, 0.08)"
                    />
                );

                // --- 2. Gordingen (horizontal framing) ---
                const showGordingen = balkafstandNum > 0 && lengteNum > 0 && heightNum > 0;
                const yFromBottomMm = (mmFromBottom: number): number => (startY + rectH) - (mmFromBottom * pxPerMm);

                const interiorGordingCentersMm: number[] = [];
                if (showGordingen) {
                    const numIntervals = Math.floor(heightNum / balkafstandNum);
                    for (let i = 1; i <= numIntervals; i++) {
                        const centerMm = startFromRight
                            ? (heightNum - (i * balkafstandNum))
                            : (i * balkafstandNum);
                        if (centerMm <= 0 || centerMm >= heightNum) continue;
                        interiorGordingCentersMm.push(centerMm);
                    }
                }

                const edgeGordingCentersMm: number[] = [];
                if (showGordingen && includeTopBottomGording && heightNum > 0) {
                    edgeGordingCentersMm.push(HALF_GORDING_HEIGHT_MM, Math.max(HALF_GORDING_HEIGHT_MM, heightNum - HALF_GORDING_HEIGHT_MM));
                }

                const sortedCenters = [...new Set([...interiorGordingCentersMm, ...edgeGordingCentersMm])]
                    .filter((centerMm) => centerMm >= 0 && centerMm <= heightNum)
                    .sort((a, b) => a - b);
                const gordingHeightPx = Math.max(1.5, GORDING_HEIGHT_MM * pxPerMm);

                const gordingElements = sortedCenters.map((centerMm, i) => {
                    const centerYPx = yFromBottomMm(centerMm);
                    return (
                        <rect
                            key={`gording-${i}`}
                            x={startX}
                            y={centerYPx - (gordingHeightPx / 2)}
                            width={rectW}
                            height={gordingHeightPx}
                            fill={BEAM_FILL}
                            stroke={BEAM_STROKE}
                            strokeWidth="0.5"
                        />
                    );
                });

                const gordingGapMeasurements = (() => {
                    if (!showGordingen) return [];

                    const gaps: { value: number; c1: number; c2: number }[] = [];

                    if (includeTopBottomGording) {
                        if (sortedCenters.length < 2) return gaps;
                        for (let i = 0; i < sortedCenters.length - 1; i++) {
                            const startMm = i === 0 ? 0 : sortedCenters[i];
                            const endMm = i === sortedCenters.length - 2 ? heightNum : sortedCenters[i + 1];
                            gaps.push({
                                value: Math.max(0, endMm - startMm),
                                c1: yFromBottomMm(startMm),
                                c2: yFromBottomMm(endMm),
                            });
                        }
                        return gaps;
                    }

                    if (interiorGordingCentersMm.length === 0) return gaps;

                    const interiorSorted = [...new Set(interiorGordingCentersMm)].sort((a, b) => a - b);
                    const anchors = [0, ...interiorSorted, heightNum];
                    for (let i = 0; i < anchors.length - 1; i++) {
                        const startMm = anchors[i];
                        const endMm = anchors[i + 1];
                        gaps.push({
                            value: Math.max(0, endMm - startMm),
                            c1: yFromBottomMm(startMm),
                            c2: yFromBottomMm(endMm),
                        });
                    }
                    return gaps;
                })();

                const splitPositionsPx = splitPositionsMm.map((mm) => startX + (mm * pxPerMm));
                const splitBoundaryMm = [0, ...splitPositionsMm, lengteNum];
                const splitBoundaryPx = splitBoundaryMm.map((mm) => startX + (mm * pxPerMm));
                const splitGapMeasurements = splitBoundaryPx.slice(1).map((x2, idx) => ({
                    value: splitBoundaryMm[idx + 1] - splitBoundaryMm[idx],
                    c1: splitBoundaryPx[idx],
                    c2: x2,
                }));
                const splitDimY = startY + rectH + 18;
                const splitElements = splitPositionsPx.map((xPos, idx) => (
                    <g key={`tussenmuur-${idx}`}>
                        <line
                            x1={xPos}
                            y1={startY}
                            x2={xPos}
                            y2={startY + rectH}
                            stroke="#14b8a6"
                            strokeWidth="1"
                            strokeDasharray="4,4"
                            opacity="0.7"
                        />
                        <text
                            x={xPos}
                            y={startY - 8}
                            textAnchor="middle"
                            className="fill-teal-500 text-[10px] font-mono select-none"
                        >
                            {'tussenmuur'}
                        </text>
                    </g>
                ));
                const splitMeasurementElements = splitGapMeasurements.map((gap, idx) => {
                    const midVal = (gap.c1 + gap.c2) / 2;
                    return (
                        <g key={`split-gap-${idx}`}>
                            <line
                                x1={gap.c1}
                                y1={splitDimY}
                                x2={gap.c1}
                                y2={startY + rectH}
                                stroke="#14b8a6"
                                strokeWidth="0.5"
                                opacity="0.5"
                            />
                            <line
                                x1={gap.c2}
                                y1={splitDimY}
                                x2={gap.c2}
                                y2={startY + rectH}
                                stroke="#14b8a6"
                                strokeWidth="0.5"
                                opacity="0.5"
                            />
                            <line
                                x1={gap.c1}
                                y1={splitDimY}
                                x2={gap.c2}
                                y2={splitDimY}
                                stroke="#14b8a6"
                                strokeWidth="0.5"
                            />
                            <circle cx={gap.c1} cy={splitDimY} r="1.5" fill="#14b8a6" />
                            <circle cx={gap.c2} cy={splitDimY} r="1.5" fill="#14b8a6" />
                            <text
                                x={midVal}
                                y={splitDimY + 11}
                                textAnchor="middle"
                                className="fill-teal-500 text-[10px] font-mono select-none"
                            >
                                {Math.round(gap.value)}
                            </text>
                        </g>
                    );
                });
                const splitWallElements = splitPositionsMm.map((centerMm, idx) => {
                    const leftMm = Math.max(0, centerMm - (TUSSENMUUR_WIDTH_MM / 2));
                    const rightMm = Math.min(lengteNum, centerMm + (TUSSENMUUR_WIDTH_MM / 2));
                    const leftPx = startX + (leftMm * pxPerMm);
                    const widthPx = Math.max(1, (rightMm - leftMm) * pxPerMm);
                    return (
                        <g key={`tussenmuur-band-${idx}`}>
                            <rect
                                x={leftPx}
                                y={startY}
                                width={widthPx}
                                height={rectH}
                                fill="rgba(20, 184, 166, 0.12)"
                                stroke="#14b8a6"
                                strokeWidth="0.8"
                            />
                        </g>
                    );
                });

                // --- 3. Opening Visuals (Interactive) ---
                const openingElements = openings.map(op => {
                    const wPx = op.width * pxPerMm;
                    const hPx = op.height * pxPerMm;
                    const xPx = startX + (op.fromLeft * pxPerMm);
                    const yPx = (startY + rectH) - (op.fromBottom * pxPerMm) - hPx;

                    return (
                        <g
                            key={op.id}
                            onPointerDown={(e) => handlePointerDown(e, op)}
                            style={{ cursor: onOpeningsChange ? 'move' : 'default' }}
                        >
                            <rect
                                x={xPx} y={yPx} width={wPx} height={hPx}
                                fill="#09090b" stroke={BEAM_STROKE} strokeWidth="2"
                                opacity={draggingId === op.id ? 0.7 : 1}
                            />
                            <path
                                d={`M ${xPx} ${yPx} L ${xPx + wPx} ${yPx + hPx} M ${xPx + wPx} ${yPx} L ${xPx} ${yPx + hPx}`}
                                stroke={BEAM_FILL} strokeWidth="1" opacity="0.3"
                            />
                            <OpeningLabels
                                centerX={xPx + wPx / 2}
                                centerY={yPx + hPx / 2}
                                typeName={labelMap[op.type] || op.type || 'Sparing'}
                                width={op.width}
                                height={op.height}
                            />
                        </g>
                    );
                });

                return (
                    <>
                        <rect x={startX} y={startY} width={rectW} height={rectH} fill="none" stroke={BEAM_FILL} strokeWidth="2" />
                        {surfaceElement}
                        {gordingElements}
                        {splitWallElements}
                        {splitElements}
                        {openingElements}

                        {showGordingen && gordingGapMeasurements.length > 0 && (
                            <GridMeasurements
                                gaps={gordingGapMeasurements}
                                svgBaseX={startX + rectW}
                                orientation="vertical"
                            />
                        )}

                        {splitPositionsMm.length > 0 && splitGapMeasurements.length > 1 && splitMeasurementElements}

                        {/* UNIVERSAL DIMENSIONS */}
                        <OverallDimensions
                            wallLength={lengteNum}
                            wallHeight={heightNum}
                            svgBaseX={startX}
                            svgBaseY={startY + rectH}
                            pxPerMm={pxPerMm}
                        />

                        <OpeningMeasurements
                            openings={openings.map(op => ({
                                id: op.id,
                                width: op.width,
                                height: op.height,
                                fromLeft: op.fromLeft,
                                fromBottom: op.fromBottom,
                                type: op.type
                            }))}
                            wallLength={lengteNum}
                            wallHeight={heightNum}
                            svgBaseX={startX}
                            svgBaseY={startY + rectH}
                            pxPerMm={pxPerMm}
                            compactLabels={true}
                        />

                        {/* Custom Title Placement (Bottom Right, above Area) */}
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
                    </>
                );
            }}
        </BaseDrawingFrame>
    );
}
