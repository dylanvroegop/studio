import React from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';
import { DimensionLine, DrawingData, WallOpening } from '@/lib/drawing-types';
import { OverallDimensions, OpeningMeasurements, GridMeasurements } from './shared/measurements';
import { calculateGridGaps } from './shared/framing-utils';
import { useDraggableOpenings } from './shared/useDraggableOpenings';
import { OpeningRenderer } from './shared/OpeningRenderer';

export interface CeilingOpening {
    id: string;
    type: string;
    width: number;
    length: number;
    fromLeft: number;
    fromTop: number;

    // UI props
    height?: number;
    fromBottom?: number;
    breedte?: number;
    lengte?: number;
    vanafLinks?: number;
    vanafBoven?: number;
}

export interface CeilingDrawingProps {
    item: {
        lengte?: string | number;
        hoogte?: string | number; // Y-axis length
        breedte?: string | number;
        balkafstand?: string | number; // Or Profile Spacing
        latafstand?: string | number;
        shape?: 'rectangle' | 'slope' | 'gable' | 'l-shape' | 'u-shape';
        variant?: 'top' | 'bottom';
        // Slope props
        hoogteLinks?: string | number;
        hoogteRechts?: string | number;
        // Gable props
        hoogteNok?: string | number;
        // L/U props
        lengte1?: string | number;
        hoogte1?: string | number;
        lengte2?: string | number;
        hoogte2?: string | number;
        lengte3?: string | number;
        hoogte3?: string | number;

        openings?: CeilingOpening[];
    };
    className?: string;
    fitContainer?: boolean;
    startFromRight?: boolean;
    startLattenFromBottom?: boolean;
    onOpeningsChange?: (openings: CeilingOpening[]) => void;
}

export function MetalStudCeilingDrawing({
    item,
    startFromRight,
    startLattenFromBottom,
    fitContainer = false,
    className = "",
    onOpeningsChange
}: CeilingDrawingProps) {
    // 1. EXTRACT PROPS
    const shape = item.shape || 'rectangle';
    const variant = item.variant || 'top';
    const rawOpenings = item.openings || [];

    const lengte = parseFloat(String(item.lengte || 0)); // X-axis
    const width = parseFloat(String((item as any).width || 0)); // Fallback
    const hoogte = parseFloat(String(item.hoogte || item.breedte || 0)); // Y-axis (inputH)
    const balkafstand = parseFloat(String(item.balkafstand || 0));
    const latafstand = parseFloat(String(item.latafstand || 0));

    // Shape specific details
    const hLeft = parseFloat(String(item.hoogteLinks || 0));
    const hRight = parseFloat(String(item.hoogteRechts || 0));
    const hPeak = parseFloat(String(item.hoogteNok || 0));
    const lengte1 = parseFloat(String(item.lengte1 || 0));
    const hoogte1 = parseFloat(String(item.hoogte1 || 0));
    const lengte2 = parseFloat(String(item.lengte2 || 0));
    const hoogte2 = parseFloat(String(item.hoogte2 || 0));
    const lengte3 = parseFloat(String(item.lengte3 || 0));
    const hoogte3 = parseFloat(String(item.hoogte3 || 0));

    // Calculate effective visual height for the frame
    let effectiveHeight = hoogte;
    if (shape === 'slope') {
        effectiveHeight = Math.max(hLeft, hRight);
    } else if (shape === 'gable') {
        effectiveHeight = hPeak || hoogte;
    } else if (shape === 'l-shape') {
        effectiveHeight = Math.max(hoogte1, hoogte2);
    } else if (shape === 'u-shape') {
        effectiveHeight = Math.max(hoogte1, hoogte2, hoogte3);
    }

    // 2. STATE & INTERACTION (Shared Hook)
    const metricsRef = React.useRef<any>(null);

    // Adapt openings for hook (Convert fromTop to fromBottom for ceiling drawings)
    const draggableOpenings = React.useMemo(() => {
        return rawOpenings.map(o => {
            const h = o.length ?? (o as any).lengte ?? o.height ?? 0;
            const t = o.fromTop ?? (o as any).vanafBoven ?? 0;

            // Convert fromTop to fromBottom: bottom = totalHeight - top - height
            const fromBottom = effectiveHeight - t - h;

            return {
                ...o,
                fromBottom,
                height: h,  // Normalize height field
                width: o.width ?? (o as any).breedte ?? 0,
                fromLeft: o.fromLeft ?? (o as any).vanafLinks ?? 0
            };
        });
    }, [rawOpenings, effectiveHeight]);

    const { draggingId, handlePointerDown, handlePointerMove, handlePointerUp } = useDraggableOpenings({
        openings: draggableOpenings,
        onOpeningsChange: (updated) => {
            if (onOpeningsChange) {
                // CRITICAL: Convert fromBottom BACK to fromTop for ceiling drawings
                const convertedBack = updated.map(o => {
                    // fromTop = totalHeight - fromBottom - height
                    const fromTop = effectiveHeight - o.fromBottom - o.height;

                    return {
                        ...o,
                        fromTop,
                        // Remove fromBottom since raw ceiling data uses fromTop
                        fromBottom: undefined
                    } as unknown as CeilingOpening;
                });

                onOpeningsChange(convertedBack);
            }
        },
        pxPerMm: metricsRef.current?.pxPerMm || 1,
        isMagnifier: false
    });

    // 4. GENERATE DRAWING DATA
    const generateDrawingData = (): DrawingData => {
        return {
            walls: [{ label: 'Main', lengte, hoogte: effectiveHeight, shape }],
            beams: [],
            openings: [], // Disable auto-render in BaseDrawingFrame to prevent occlusion
            dimensions: [],
            params: {}
        };
    };

    const drawingData = generateDrawingData();

    return (
        <BaseDrawingFrame
            width={lengte}
            height={effectiveHeight}
            primarySpacing={balkafstand}
            secondarySpacing={latafstand}
            widthLabel={lengte > 0 ? `${lengte}` : '---'}
            heightLabel={effectiveHeight > 0 ? `${effectiveHeight}` : '---'}
            gridLabel={!balkafstand && !latafstand ? 'Plafond Vlak' : undefined}
            className={className}
            fitContainer={fitContainer}
            startFromRight={startFromRight}
            suppressTotalDimensions={true}
            drawingData={drawingData}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            {(ctx) => {
                metricsRef.current = ctx;
                const { startX, startY, rectW, rectH, pxPerMm } = ctx;
                const pxPerMmW = pxPerMm;
                const pxPerMmH = pxPerMm;
                const structureColor = "rgb(70, 75, 85)";
                const lattenColor = "rgb(70, 75, 85)";

                let outlinePath = `M ${startX} ${startY} L ${startX + rectW} ${startY} L ${startX + rectW} ${startY + rectH} L ${startX} ${startY + rectH} Z`;
                if (shape === 'slope') {
                    const hL = hLeft;
                    const hR = hRight;
                    if (variant === 'bottom') {
                        const yBL = startY + (hL * pxPerMmH);
                        const yBR = startY + (hR * pxPerMmH);
                        outlinePath = `M ${startX} ${startY} L ${startX + rectW} ${startY} L ${startX + rectW} ${yBR} L ${startX} ${yBL} Z`;
                    } else {
                        const yTL = startY + (hoogte - hL) * pxPerMmH;
                        const yTR = startY + (hoogte - hR) * pxPerMmH;
                        outlinePath = `M ${startX} ${yTL} L ${startX + rectW} ${yTR} L ${startX + rectW} ${startY + rectH} L ${startX} ${startY + rectH} Z`;
                    }
                }

                const elements: React.ReactNode[] = [];
                const beamCenters: number[] = [];

                // BEAMS (Vertical)
                // Universal Gaps (New Logic)
                const framing = calculateGridGaps({
                    wallLength: lengte,
                    spacing: balkafstand,
                    studWidth: 45, // Metal stud w
                    startFromRight
                });

                const gridGaps = framing.gaps.map(g => ({
                    value: g.value,
                    c1: startX + g.c1 * pxPerMmW,
                    c2: startX + g.c2 * pxPerMmW
                }));

                // Render Beams from framing.beamCenters
                if (balkafstand > 0) {
                    const BEAM_STROKE = Math.max(1, 45 * pxPerMmW);
                    framing.beamCenters.forEach(cx => {
                        const drawX = startX + (cx * pxPerMmW);
                        // Don't draw if outside
                        if (drawX < startX || drawX > startX + rectW) return;

                        elements.push(
                            <line key={`beam-${cx}`} x1={drawX} y1={startY} x2={drawX} y2={startY + rectH} stroke={structureColor} strokeWidth={BEAM_STROKE} opacity="0.5" />
                        );
                    });
                }

                const clipId = `ms-ceiling-clip-${shape}`;
                return (
                    <>
                        <defs><clipPath id={clipId}><path d={outlinePath} /></clipPath></defs>
                        <path d={outlinePath} stroke={structureColor} strokeWidth="0.5" fill="none" />
                        <g clipPath={`url(#${clipId})`}>
                            {elements}
                        </g>

                        <OverallDimensions
                            wallLength={lengte}
                            wallHeight={effectiveHeight}
                            svgBaseX={startX}
                            svgBaseY={startY + rectH}
                            pxPerMm={pxPerMmW}
                        />

                        {gridGaps.length > 0 && (
                            <GridMeasurements
                                gaps={gridGaps}
                                svgBaseYTop={startY}
                            />
                        )}

                        <OpeningMeasurements
                            openings={draggableOpenings}
                            wallLength={lengte}
                            wallHeight={effectiveHeight}
                            svgBaseX={startX}
                            svgBaseY={startY + rectH}
                            pxPerMm={pxPerMmW}
                        />

                        {/* Universal Opening Renderer (Pilot Test) */}
                        <OpeningRenderer
                            openings={draggableOpenings}
                            svgBaseX={startX}
                            svgBaseY={startY + rectH}
                            pxPerMm={pxPerMmW}
                            draggingId={draggingId}
                            handlePointerDown={handlePointerDown}
                            handlePointerMove={handlePointerMove}
                            handlePointerUp={handlePointerUp}
                            editable={!!onOpeningsChange}
                        />
                    </>
                );
            }}
        </BaseDrawingFrame >
    );
}
