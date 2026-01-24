import React from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';
import { OverallDimensions, OpeningMeasurements } from './shared/measurements';
import { OpeningLabels } from './shared/OpeningLabels';

interface GolfplaatDrawingProps {
    lengte?: number | string;
    hoogte?: number | string; // Using 'hoogte' as breedte for consistency with other drawings
    title?: string;
    className?: string;
    fitContainer?: boolean;
    openings?: any[];
    onOpeningsChange?: (newOpenings: any[]) => void;
}

const dimColor = "#10b981"; // Emerald-500
const structureColor = "rgb(70, 75, 85)";
const labelColor = "rgb(100, 116, 139)"; // Slate-500

const labelMap: Record<string, string> = {
    'dakraam': 'Lichtkoepel',
    'schoorsteen': 'Schoorsteen',
    'pijp': 'Pijp',
    'afvoer': 'HWA',
    'opening': 'Sparing'
};

export function GolfplaatDrawing({
    lengte,
    hoogte, // This is "breedte" in the UI but we use height for vertical axis
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

    // Use fallback dimensions for rendering if input is empty/zero
    const isBlank = lengteNum <= 0 || heightNum <= 0;

    return (
        <BaseDrawingFrame
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
                const { startX, startY, rectW, rectH, pxPerMm, SVG_WIDTH, SVG_HEIGHT } = metrics;

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

                // --- 2. Corrugated Lines (Visual representation of golfplaat) ---
                const corrugatedLines: React.ReactNode[] = [];
                const waveSpacing = 50 * pxPerMm; // 50mm spacing between waves
                const numWaves = Math.floor(rectW / waveSpacing);

                for (let i = 1; i <= numWaves; i++) {
                    const x = startX + (i * waveSpacing);
                    if (x < startX + rectW - 5) {
                        corrugatedLines.push(
                            <line
                                key={`wave-${i}`}
                                x1={x}
                                y1={startY}
                                x2={x}
                                y2={startY + rectH}
                                stroke={structureColor}
                                strokeWidth="0.5"
                                opacity="0.3"
                                strokeDasharray="4 4"
                            />
                        );
                    }
                }

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
                                fill="#09090b" stroke="rgb(70, 75, 85)" strokeWidth="2"
                                opacity={draggingId === op.id ? 0.7 : 1}
                            />
                            <path
                                d={`M ${xPx} ${yPx} L ${xPx + wPx} ${yPx + hPx} M ${xPx + wPx} ${yPx} L ${xPx} ${yPx + hPx}`}
                                stroke="rgb(70, 75, 85)" strokeWidth="1" opacity="0.3"
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
                        <rect x={startX} y={startY} width={rectW} height={rectH} fill="none" stroke="rgb(70, 75, 85)" strokeWidth="2" />
                        {surfaceElement}
                        {corrugatedLines}
                        {openingElements}

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
                        />

                        {/* Custom Title Placement (Bottom Right, above Area) */}
                        <text
                            x={SVG_WIDTH - 20}
                            y={SVG_HEIGHT - 35}
                            textAnchor="end"
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
