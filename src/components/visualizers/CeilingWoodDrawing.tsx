import React from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';
import { DimensionLine, DrawingData, WallOpening } from '@/lib/drawing-types';
import { OverallDimensions, OpeningMeasurements, GridMeasurements } from './shared/measurements';
import { calculateGridGaps } from './shared/framing-utils';
import { useDraggableOpenings } from './shared/useDraggableOpenings';

export interface CeilingOpening {
    id: string;
    type: string;
    width: number;
    length: number; // usually 'height' in logic
    fromLeft: number;
    fromTop: number;

    // UI props
    height?: number;
    fromBottom?: number;
    breedte?: number;
    lengte?: number; // length of opening?
    vanafLinks?: number;
    vanafBoven?: number;
}

// Helper to standardise opening data for measurements
const mappingOpeningsForOverlay = (raw: CeilingOpening[], effectiveHeight: number) => {
    return raw.map(op => {
        const w = op.width ?? (op as any).breedte ?? 0;
        const h = op.length ?? (op as any).lengte ?? op.height ?? 0;
        const l = op.fromLeft ?? (op as any).vanafLinks ?? 0;
        const t = op.fromTop ?? (op as any).vanafBoven ?? op.fromBottom ?? 0;

        // Calculate fromBottom. 
        // Logic: if fromTop is provided, fromBottom = H - fromTop - h.
        // If fromBottom provided? 
        let fromBottom = (effectiveHeight - t - h);
        if (op.fromBottom !== undefined) {
            // Trust fromBottom if it seems like that's the primary
            // But UI often updates fromTop for ceiling...
            // Let's stick to Cartesian separation: fromTop is UI default for ceiling.
        }

        return {
            id: op.id,
            width: w,
            height: h,
            fromLeft: l,
            fromBottom: fromBottom,
            type: op.type
        };
    });
};




export interface CeilingDrawingProps {
    item: {
        lengte?: string | number;
        hoogte?: string | number; // Y-axis length
        breedte?: string | number;
        balkafstand?: string | number;
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
    gridLabel?: string;
}

export function CeilingWoodDrawing({
    item,
    startFromRight,
    startLattenFromBottom,
    fitContainer = false,
    className = "",
    onOpeningsChange,
    gridLabel
}: CeilingDrawingProps) {
    // 1. EXTRACT PROPS
    const shape = item.shape || 'rectangle';
    const variant = item.variant || 'top';
    const rawOpenings = item.openings || [];

    const lengte = parseFloat(String(item.lengte || 0)); // X-axis
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

    // Adapt openings for hook - Convert fromTop to fromBottom for dragging
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

    // 4. GENERATE DRAWING DATA (Dimensions & Openings)
    const generateDrawingData = (): DrawingData => {
        return {
            walls: [{ label: 'Main', lengte, hoogte: effectiveHeight, shape }],
            beams: [], // We render beams via children
            openings: [], // We render openings via our overlay loop to ensure correct Z-index and interaction
            dimensions: [], // Universal components replace this
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
            gridLabel={gridLabel || (!balkafstand && !latafstand ? 'Plafond Vlak' : undefined)}
            className={className}
            fitContainer={fitContainer}
            startFromRight={startFromRight}
            suppressTotalDimensions={true} // Suppress default ones, we use our own now!
            drawingData={drawingData}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            {(ctx) => {
                metricsRef.current = ctx;
                const { startX, startY, rectW, rectH, pxPerMm, SVG_WIDTH, SVG_HEIGHT } = ctx;
                const pxPerMmW = pxPerMm;
                const pxPerMmH = pxPerMm;

                // Structure Colors
                const structureColor = "rgb(70, 75, 85)";
                const lattenColor = "rgb(70, 75, 85)";

                // ===========================================
                // SHAPE OUTLINE PATH (Legacy Logic Preserved)
                // ===========================================
                let outlinePath = `M ${startX} ${startY} L ${startX + rectW} ${startY} L ${startX + rectW} ${startY + rectH} L ${startX} ${startY + rectH} Z`;
                if (shape === 'slope') {
                    const yTopLeft = variant === 'bottom' ? startY + rectH - (hLeft * pxPerMmH) : startY;
                    const yTopRight = variant === 'bottom' ? startY + rectH - (hRight * pxPerMmH) : startY + (Math.max(hLeft, hRight) - hRight) * pxPerMmH;
                    const yBot = startY + rectH;
                    if (variant === 'bottom') {
                        const yBL = startY + (hLeft * pxPerMmH);
                        const yBR = startY + (hRight * pxPerMmH);
                        outlinePath = `M ${startX} ${startY} L ${startX + rectW} ${startY} L ${startX + rectW} ${yBR} L ${startX} ${yBL} Z`;
                    } else {
                        const yTL = startY + (hoogte - hLeft) * pxPerMmH;
                        const yTR = startY + (hoogte - hRight) * pxPerMmH;
                        outlinePath = `M ${startX} ${yTL} L ${startX + rectW} ${yTR} L ${startX + rectW} ${yBot} L ${startX} ${yBot} Z`;
                    }
                }

                // ===========================================
                // BEAMS (Balken) - Vertical
                // ===========================================
                const elements: React.ReactNode[] = [];
                const beamCentersForDims: number[] = [];

                // Universal Gaps (New Logic)
                const framing = calculateGridGaps({
                    wallLength: lengte,
                    spacing: balkafstand,
                    studWidth: 70, // Wood stud ~70-75?
                    startFromRight
                });

                const gridGaps = framing.gaps.map(g => ({
                    value: g.value,
                    c1: startX + g.c1 * pxPerMmW,
                    c2: startX + g.c2 * pxPerMmW
                }));

                // Render Beams from framing.beamCenters
                if (balkafstand > 0) {
                    const BEAM_STROKE = Math.max(1, 75 * pxPerMmW);
                    framing.beamCenters.forEach(cx => {
                        const drawX = startX + (cx * pxPerMmW);
                        // Don't draw if outside
                        if (drawX < startX - 2 || drawX > startX + rectW + 2) return;

                        elements.push(
                            <line key={`beam-${cx}`} x1={drawX} y1={startY} x2={drawX} y2={startY + rectH} stroke={structureColor} strokeWidth={BEAM_STROKE} opacity="0.5" />
                        );
                    });
                }

                // 2. Openings for Overlay
                const opsForOverlay = mappingOpeningsForOverlay(rawOpenings, effectiveHeight);

                const clipId = `ceiling-clip-${item.shape}`;


                return (
                    <>
                        <defs><clipPath id={clipId}><path d={outlinePath} /></clipPath></defs>
                        <path d={outlinePath} stroke={structureColor} strokeWidth="2" fill="rgba(70,75,85, 0.1)" />
                        <g clipPath={`url(#${clipId})`}>
                            {elements}
                        </g>

                        {/* Rendering Openings inside the clip or on top? 
                            Usually openings are voids, so they should be on top and 'clear' the area.
                            But BaseDrawingFrame handles 'drawingData.openings' for simple rects?
                            If we want DRAGGABLE interactive openings matching WallDrawing, we used to do it manually.
                            Let's keep the manual draggable logic from BEFORE if possible, or assume BaseDrawingFrame handles interaction?
                            
                            BaseDrawingFrame exposes interaction via onPointerMove etc on the SVG.
                            But it renders drawingData.openings??
                            Actually BaseDrawingFrame DOES NOT render openings automatically in a 'draggable' way unless we pass children?
                            Wait, looking at WallDrawing, it renders openings explicitly. 
                            CeilingWoodDrawing previously relied on generateDrawingData returning 'openings'?
                            BaseDrawingFrame PROBABLY renders those openings if passed in drawingData?
                            
                            Let's rely on our Universal Overlay for dimensions, 
                            but we need to render the opening RECTANGLES themselves?
                            WallDrawing renders them explicitly (lines 960+).
                            Let's add them here for visual parity and interaction target.
                        */}
                        {opsForOverlay.map((op) => {
                            // op has fromLeft, fromBottom, width, height (MM)
                            // Convert to Screen
                            const x = startX + op.fromLeft * pxPerMm;
                            const y = (startY + rectH) - op.fromBottom * pxPerMm - (op.height * pxPerMm);
                            const w = op.width * pxPerMm;
                            const h = op.height * pxPerMm;

                            return (
                                <g
                                    key={op.id}
                                    onPointerDown={(e) => handlePointerDown(e, rawOpenings.find(o => o.id === op.id) as any)}
                                    onPointerMove={handlePointerMove}
                                    onPointerUp={handlePointerUp}
                                    className={onOpeningsChange ? "cursor-move" : ""}
                                    style={{ cursor: onOpeningsChange ? 'move' : 'default' }}
                                >
                                    <rect
                                        x={x} y={y} width={w} height={h}
                                        fill="#09090b"
                                        stroke={draggingId === op.id ? "#10b981" : "rgb(55,60,70)"}
                                        strokeWidth={draggingId === op.id ? 2 : 1}
                                    />
                                    {/* Cross */}
                                    <line x1={x} y1={y} x2={x + w} y2={y + h} stroke="rgb(55,60,70)" strokeWidth="0.5" strokeDasharray="2,2" />
                                    <line x1={x} y1={y + h} x2={x + w} y2={y} stroke="rgb(55,60,70)" strokeWidth="0.5" strokeDasharray="2,2" />
                                </g>
                            );
                        })}


                        {/* UNIVERSAL DIMENSIONS OVERLAY */}
                        <OverallDimensions
                            wallLength={lengte}
                            wallHeight={effectiveHeight}
                            svgBaseX={startX}
                            svgBaseY={startY + rectH} // Floor
                            pxPerMm={pxPerMm}
                        />

                        <GridMeasurements
                            gaps={gridGaps}
                            svgBaseYTop={startY} // Top of wall
                        />

                        <OpeningMeasurements
                            openings={opsForOverlay}
                            wallLength={lengte}
                            wallHeight={effectiveHeight}
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
