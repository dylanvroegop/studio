/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps */
import React from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';
import { DimensionLine, DrawingData, WallOpening } from '@/lib/drawing-types';
import { OverallDimensions, OpeningMeasurements, GridMeasurements } from './shared/measurements';
import { calculateGridGaps } from './shared/framing-utils';
import { useDraggableOpenings } from './shared/useDraggableOpenings';
import { calculateRaveelwerk, raveelwerkToSVG } from './shared/raveelwerk-utils';
import { OpeningLabels } from './shared/OpeningLabels';

export interface CeilingOpening {
    id: string;
    type: 'door' | 'window' | 'opening';
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
    requires_raveelwerk?: boolean;
}

// Helper to standardise opening data for measurements
const mappingOpeningsForOverlay = (raw: CeilingOpening[], effectiveHeight: number) => {
    return raw.map(op => {
        const w = op.width ?? (op as any).breedte ?? 0;
        const h = op.length ?? (op as any).lengte ?? op.height ?? 0;
        const l = op.fromLeft ?? (op as any).vanafLinks ?? 0;

        // CRITICAL: Calculate fromBottom from fromTop
        // Don't fallback to fromBottom in the fromTop calculation - that's circular!
        let fromBottom: number;

        if (op.fromBottom !== undefined) {
            // If fromBottom is explicitly set, use it directly
            fromBottom = op.fromBottom;
        } else {
            // Otherwise calculate from fromTop (default for ceiling)
            const t = op.fromTop ?? (op as any).vanafBoven ?? 0;
            fromBottom = effectiveHeight - t - h;
        }

        return {
            id: op.id,
            width: w,
            height: h,
            fromLeft: l,
            fromBottom: fromBottom,
            type: op.type,
            requires_raveelwerk: op.requires_raveelwerk
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

        doubleEndBeams?: boolean;
        doubleEndBattens?: boolean;
        surroundingBeams?: boolean;
        openings?: CeilingOpening[];
    };
    className?: string;
    fitContainer?: boolean;
    startFromRight?: boolean;
    startLattenFromBottom?: boolean;
    onOpeningsChange?: (openings: CeilingOpening[]) => void;
    gridLabel?: string;
    title?: string;
}

export function CeilingWoodDrawing({
    item,
    startFromRight,
    startLattenFromBottom,
    fitContainer = false,
    className = "",
    onOpeningsChange,
    gridLabel,
    title
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
    const [pxPerMmState, setPxPerMmState] = React.useState(1);

    // Update pxPerMm state when metrics change
    React.useLayoutEffect(() => {
        if (metricsRef.current?.pxPerMm && metricsRef.current.pxPerMm !== pxPerMmState) {
            setPxPerMmState(metricsRef.current.pxPerMm);
        }
    });

    // Adapt openings for hook - Convert fromTop to fromBottom for dragging
    const draggableOpenings = React.useMemo(() => {
        return rawOpenings.map(o => {
            const h = o.length ?? (o as any).lengte ?? o.height ?? 0;
            const w = o.width ?? (o as any).breedte ?? 0;
            const l = o.fromLeft ?? (o as any).vanafLinks ?? 0;

            // CRITICAL: Use same logic as mappingOpeningsForOverlay
            let fromBottom: number;

            if (o.fromBottom !== undefined) {
                // If fromBottom is explicitly set, use it directly
                fromBottom = o.fromBottom;
            } else {
                // Otherwise calculate from fromTop (default for ceiling)
                const t = o.fromTop ?? (o as any).vanafBoven ?? 0;
                fromBottom = effectiveHeight - t - h;
            }

            return {
                ...o,
                fromBottom,
                height: h,  // Normalize height field
                width: w,
                fromLeft: l
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
        pxPerMm: pxPerMmState,
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

    // 5. CALCULATE AREA (M2)
    const areaStats = React.useMemo(() => {
        let areaMm2 = 0;
        const L = lengte;
        const H = effectiveHeight;

        if (shape === 'rectangle') areaMm2 = L * H;
        else if (shape === 'slope') {
            areaMm2 = L * ((hLeft + hRight) / 2);
        } else if (shape === 'gable') {
            areaMm2 = L * ((effectiveHeight + hPeak) / 2); // Approximate standard
        } else if (shape === 'l-shape') {
            areaMm2 = (lengte1 * hoogte1) + ((L - lengte1) * hoogte2);
        } else if (shape === 'u-shape') {
            areaMm2 = (lengte1 * hoogte1) + (lengte2 * hoogte2) + ((L - lengte1 - lengte2) * hoogte3);
        } else {
            areaMm2 = L * H;
        }

        // Openings
        const opArea = rawOpenings.reduce((acc, op) => {
            const w = op.width ?? (op as any).breedte ?? 0;
            const h = op.length ?? (op as any).lengte ?? op.height ?? 0;
            return acc + (w * h);
        }, 0);

        return {
            gross: areaMm2,
            net: Math.max(0, areaMm2 - opArea),
            hasOpenings: opArea > 0
        };
    }, [shape, lengte, effectiveHeight, hLeft, hRight, hPeak, lengte1, hoogte1, hoogte2, lengte2, hoogte3, rawOpenings, lengte3]);

    return (
        <BaseDrawingFrame
            areaStats={areaStats}
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

                // LATTEN (Horizontal) Measure
                const lattenFramingForDims = calculateGridGaps({
                    wallLength: effectiveHeight,
                    spacing: latafstand,
                    studWidth: 46, // Latten width (approx)
                    startFromRight: startLattenFromBottom // If start from bottom, it's like "startFromRight" in 1D space
                });

                const latGaps = lattenFramingForDims.gaps.map(g => ({
                    value: g.value,
                    c1: startY + g.c1 * pxPerMmH,
                    c2: startY + g.c2 * pxPerMmH
                }));

                // Openings for Overlay (moved here so beams can check intersections)
                const opsForOverlay = mappingOpeningsForOverlay(rawOpenings, effectiveHeight);

                // Render Beams from framing.beamCenters
                if (balkafstand > 0) {
                    const BEAM_STROKE = Math.max(1, 75 * pxPerMmW);
                    const STUD_WIDTH = 70; // used in framing calc

                    // Frame Beams Logic (Surrounding)
                    const isFrame = item.surroundingBeams;
                    const frameThicknessPx = isFrame ? (STUD_WIDTH * pxPerMmH) : 0;

                    // If Frame, draw Top and Bottom Beams
                    if (isFrame) {
                        // Top Beam
                        elements.push(
                            <line key="beam-frame-top" x1={startX} y1={startY + frameThicknessPx / 2} x2={startX + rectW} y2={startY + frameThicknessPx / 2} stroke={structureColor} strokeWidth={frameThicknessPx} opacity="0.4" />
                        );
                        // Bottom Beam
                        elements.push(
                            <line key="beam-frame-bottom" x1={startX} y1={startY + rectH - frameThicknessPx / 2} x2={startX + rectW} y2={startY + rectH - frameThicknessPx / 2} stroke={structureColor} strokeWidth={frameThicknessPx} opacity="0.4" />
                        );
                    }

                    // Adjust Vertical Beam Start/End
                    const vStartY = startY + frameThicknessPx;
                    const vEndY = startY + rectH - frameThicknessPx;

                    // Render Standard Beams (with interruption for openings)
                    const STUD_WIDTH_MM = 70;
                    const HEADER_THICKNESS = 70; // Same as beam width for headers

                    framing.beamCenters.forEach(cx => {
                        const drawX = startX + (cx * pxPerMmW);
                        // Don't draw if outside
                        if (drawX < startX - 2 || drawX > startX + rectW + 2) return;

                        // Check if this beam intersects any opening
                        const intersectingOpening = opsForOverlay.find(op => {
                            const opLeft = op.fromLeft;
                            const opRight = op.fromLeft + op.width;
                            // Beam center is in mm, check if it falls within opening's horizontal range
                            // Add some tolerance for beam width
                            const beamLeft = cx - STUD_WIDTH_MM / 2;
                            const beamRight = cx + STUD_WIDTH_MM / 2;
                            return beamRight > opLeft && beamLeft < opRight;
                        });

                        if (intersectingOpening && intersectingOpening.requires_raveelwerk) {
                            // Beam intersects an opening with raveelwerk - split it!
                            // Calculate opening Y positions in screen coordinates
                            const opTopMm = intersectingOpening.fromBottom + intersectingOpening.height;
                            const opBottomMm = intersectingOpening.fromBottom;

                            // Convert to SVG Y (remember SVG Y is inverted)
                            // vStartY is at top of beam area, vEndY is at bottom
                            // Opening fromBottom is from the floor (bottom of rect)
                            const svgOpTop = (startY + rectH) - opTopMm * pxPerMm - HEADER_THICKNESS * pxPerMm;
                            const svgOpBottom = (startY + rectH) - opBottomMm * pxPerMm + HEADER_THICKNESS * pxPerMm;

                            // Draw top segment (from vStartY to top of opening header)
                            if (svgOpTop > vStartY) {
                                elements.push(
                                    <line key={`beam-${cx}-top`} x1={drawX} y1={vStartY} x2={drawX} y2={svgOpTop} stroke={structureColor} strokeWidth={BEAM_STROKE} opacity="0.4" />
                                );
                            }

                            // Draw bottom segment (from bottom of opening header to vEndY)
                            if (svgOpBottom < vEndY) {
                                elements.push(
                                    <line key={`beam-${cx}-bottom`} x1={drawX} y1={svgOpBottom} x2={drawX} y2={vEndY} stroke={structureColor} strokeWidth={BEAM_STROKE} opacity="0.4" />
                                );
                            }
                        } else {
                            // No intersection or no raveelwerk - draw full beam
                            elements.push(
                                <line key={`beam-${cx}`} x1={drawX} y1={vStartY} x2={drawX} y2={vEndY} stroke={structureColor} strokeWidth={BEAM_STROKE} opacity="0.4" />
                            );
                        }
                    });

                    // Render Double End Beams if enabled
                    if (item.doubleEndBeams) {
                        const extraStart = (STUD_WIDTH / 2) + STUD_WIDTH; // 35 + 70 = 105
                        const extraEnd = lengte - ((STUD_WIDTH / 2) + STUD_WIDTH);

                        // Start
                        if (extraStart < lengte) {
                            const drawX = startX + (extraStart * pxPerMmW);
                            elements.push(
                                <line key="beam-double-start" x1={drawX} y1={vStartY} x2={drawX} y2={vEndY} stroke={structureColor} strokeWidth={BEAM_STROKE} opacity="0.4" />
                            );
                        }

                        // End
                        if (extraEnd > 0) {
                            const drawX = startX + (extraEnd * pxPerMmW);
                            elements.push(
                                <line key="beam-double-end" x1={drawX} y1={vStartY} x2={drawX} y2={vEndY} stroke={structureColor} strokeWidth={BEAM_STROKE} opacity="0.4" />
                            );
                        }
                    }
                }

                // ===========================================
                // LATTEN (Horizontal Battens)
                // ===========================================
                if (latafstand > 0) {

                    // Standard Latten
                    // Calculate latten positions (horizontal lines)
                    const lattenFraming = calculateGridGaps({
                        wallLength: effectiveHeight, // Use height as the "length" for horizontal lines
                        spacing: latafstand,
                        studWidth: 50,
                        startFromRight: startLattenFromBottom
                    });

                    // Helper to draw a single lat (batten)
                    const drawLat = (cy: number, key: string) => {
                        const centerY = startY + (cy * pxPerMmH);
                        const halfWidth = (50 * pxPerMmH) / 2; // Half of 50mm

                        const topY = centerY - halfWidth;
                        const bottomY = centerY + halfWidth;

                        // Don't draw if outside
                        if (bottomY < startY - 2 || topY > startY + rectH + 2) return;

                        // Draw two parallel thin lines for the top and bottom edges
                        elements.push(
                            <line key={`${key}-top`} x1={startX} y1={topY} x2={startX + rectW} y2={topY} stroke={lattenColor} strokeWidth={1} strokeDasharray="4,4" />
                        );
                        elements.push(
                            <line key={`${key}-bottom`} x1={startX} y1={bottomY} x2={startX + rectW} y2={bottomY} stroke={lattenColor} strokeWidth={1} strokeDasharray="4,4" />
                        );
                    };

                    lattenFraming.beamCenters.forEach(cy => drawLat(cy, `latten-${cy}`));

                    // Double End Battens Logic
                    if (item.doubleEndBattens) {
                        const LAT_WIDTH = 50;
                        const extraTop = (LAT_WIDTH / 2) + LAT_WIDTH;
                        const extraBottom = effectiveHeight - ((LAT_WIDTH / 2) + LAT_WIDTH);

                        // Top Extra
                        if (extraTop < effectiveHeight) {
                            drawLat(extraTop, 'latten-double-top');
                        }

                        // Bottom Extra
                        if (extraBottom > 0) {
                            drawLat(extraBottom, 'latten-double-bottom');
                        }
                    }
                }

                // Openings already calculated above (opsForOverlay)

                const clipId = `ceiling-clip-${item.shape}`;


                return (
                    <>
                        <defs><clipPath id={clipId}><path d={outlinePath} /></clipPath></defs>
                        <path d={outlinePath} stroke={structureColor} strokeWidth="0.5" fill="none" />
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

                            // Smart Raveelwerk Geometry
                            const isRaveel = (op as any).requires_raveelwerk;

                            // Calculate smart raveelwerk beams if enabled
                            let raveelSVGBeams: any[] = [];
                            if (isRaveel && framing.beamCenters.length > 0) {
                                const raveelGeometry = calculateRaveelwerk({
                                    openingFromLeft: op.fromLeft,
                                    openingWidth: op.width,
                                    openingHeight: op.height,
                                    openingFromBottom: op.fromBottom,
                                    existingBeamCenters: framing.beamCenters,
                                    beamWidth: 70, // Same as STUD_WIDTH used for beams
                                    totalHeight: effectiveHeight
                                });

                                raveelSVGBeams = raveelwerkToSVG(
                                    raveelGeometry,
                                    startX,
                                    startY,
                                    rectH,
                                    pxPerMm
                                );
                            }

                            return (
                                <g
                                    key={op.id}
                                    onPointerDown={(e) => handlePointerDown(e, draggableOpenings.find(o => o.id === op.id) as any)}
                                    onPointerMove={handlePointerMove}
                                    onPointerUp={handlePointerUp}
                                    className={onOpeningsChange ? "cursor-move" : ""}
                                    style={{ cursor: onOpeningsChange ? 'move' : 'default' }}
                                >
                                    {/* Smart Raveelwerk Beams (rendered like existing beams) */}
                                    {isRaveel && raveelSVGBeams.map((beam, idx) => {
                                        if (beam.type === 'header') {
                                            // Horizontal headers - rendered as lines like existing beams
                                            const centerY = beam.svgY + beam.svgHeight / 2;
                                            return (
                                                <line
                                                    key={`raveel-${beam.position}-${idx}`}
                                                    x1={beam.svgX}
                                                    y1={centerY}
                                                    x2={beam.svgX + beam.svgWidth}
                                                    y2={centerY}
                                                    stroke={structureColor}
                                                    strokeWidth={beam.svgHeight}
                                                    opacity="0.4"
                                                />
                                            );
                                        } else {
                                            // Vertical trimmers - rendered as lines like existing beams
                                            const centerX = beam.svgX + beam.svgWidth / 2;
                                            return (
                                                <line
                                                    key={`raveel-${beam.position}-${idx}`}
                                                    x1={centerX}
                                                    y1={beam.svgY}
                                                    x2={centerX}
                                                    y2={beam.svgY + beam.svgHeight}
                                                    stroke={structureColor}
                                                    strokeWidth={beam.svgWidth}
                                                    opacity="0.4"
                                                />
                                            );
                                        }
                                    })}

                                    <rect
                                        x={x} y={y} width={w} height={h}
                                        fill="#09090b"
                                        stroke={draggingId === op.id ? "#10b981" : "rgb(55,60,70)"}
                                        strokeWidth={draggingId === op.id ? 2 : 1}
                                    />
                                    {/* Cross */}
                                    <line x1={x} y1={y} x2={x + w} y2={y + h} stroke="rgb(55,60,70)" strokeWidth="0.5" strokeDasharray="2,2" />
                                    <line x1={x} y1={y + h} x2={x + w} y2={y} stroke="rgb(55,60,70)" strokeWidth="0.5" strokeDasharray="2,2" />

                                    {/* Opening Labels (using universal component) */}
                                    <OpeningLabels
                                        centerX={x + w / 2}
                                        centerY={y + h / 2}
                                        typeName={op.type === 'door' ? 'Deur' : op.type === 'window' ? 'Lichtkoepel' : 'Sparing'}
                                        width={op.width}
                                        height={op.height}
                                    />
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

                        {/* Latwerk Vertical Gaps */}
                        {latGaps.length > 0 && (
                            <GridMeasurements
                                gaps={latGaps}
                                svgBaseX={startX + rectW}
                                orientation="vertical"
                            />
                        )}

                        <OpeningMeasurements
                            openings={opsForOverlay}
                            wallLength={lengte}
                            wallHeight={effectiveHeight}
                            svgBaseX={startX}
                            svgBaseY={startY + rectH}
                            pxPerMm={pxPerMm}
                        />

                        {/* Custom Title Placement */}
                        {title && (
                            <text
                                key="drawing-title"
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
    );
}
