/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps */
import React from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';
import { DrawingData } from '@/lib/drawing-types';
import { OverallDimensions, OpeningMeasurements, GridMeasurements } from './shared/measurements';
import { calculateGridGaps } from './shared/framing-utils';
import { useDraggableOpenings } from './shared/useDraggableOpenings';
import { OpeningRenderer } from './shared/OpeningRenderer';
import { calculateRaveelwerk, raveelwerkToSVG } from './shared/raveelwerk-utils';
import { LeidingkoofOverlay } from './shared/LeidingkoofOverlay';
import { LeidingkoofItem } from '../leidingkoof/LeidingkoofSection';

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
    requires_raveelwerk?: boolean;
}

// Helper to standardise opening data for overlay/logic
const mappingOpeningsForOverlay = (raw: CeilingOpening[], effectiveHeight: number) => {
    return raw.map(op => {
        const w = op.width ?? (op as any).breedte ?? 0;
        const h = op.length ?? (op as any).lengte ?? op.height ?? 0;
        const l = op.fromLeft ?? (op as any).vanafLinks ?? 0;

        let fromBottom: number;
        if (op.fromBottom !== undefined) {
            fromBottom = op.fromBottom;
        } else {
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

        doubleEndBattens?: boolean;
        openings?: CeilingOpening[];
        leidingkofen?: LeidingkoofItem[];
    };
    className?: string;
    fitContainer?: boolean;
    startFromRight?: boolean;
    startLattenFromBottom?: boolean;
    onOpeningsChange?: (openings: CeilingOpening[]) => void;
    onLeidingkoofChange?: (updated: LeidingkoofItem[]) => void;
    title?: string;
}

export function MetalStudCeilingDrawing({
    item,
    startFromRight,
    startLattenFromBottom,
    fitContainer = false,
    className = "",
    onOpeningsChange,
    onLeidingkoofChange,
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

    React.useLayoutEffect(() => {
        if (metricsRef.current?.pxPerMm && metricsRef.current.pxPerMm !== pxPerMmState) {
            setPxPerMmState(metricsRef.current.pxPerMm);
        }
    });

    // Adapt openings for hook (Convert fromTop to fromBottom for ceiling drawings)
    const draggableOpenings = React.useMemo(() => {
        return rawOpenings.map(o => {
            const h = o.length ?? (o as any).lengte ?? o.height ?? 0;
            const t = o.fromTop ?? (o as any).vanafBoven ?? 0;

            // Convert fromTop to fromBottom: bottom = totalHeight - top - height
            let fromBottom = o.fromBottom;
            if (fromBottom === undefined) {
                fromBottom = effectiveHeight - t - h;
            }

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
        pxPerMm: pxPerMmState,
        isMagnifier: false
    });

    const [draggingKoofId, setDraggingKoofId] = React.useState<string | null>(null);
    const koofDragStartRef = React.useRef<{
        x: number;
        y: number;
        id: string;
        origLeft: number;
        origBottom: number;
    } | null>(null);

    const handleKoofPointerDown = React.useCallback((e: React.PointerEvent, koof: LeidingkoofItem) => {
        if (!onLeidingkoofChange) return;
        e.preventDefault();
        e.stopPropagation();
        (e.target as Element).setPointerCapture(e.pointerId);
        setDraggingKoofId(koof.id);
        koofDragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            id: koof.id,
            origLeft: Number(koof.vanLinks) || 0,
            origBottom: Number(koof.vanOnder) || 0
        };
    }, [onLeidingkoofChange]);

    const handleKoofPointerMove = React.useCallback((e: React.PointerEvent) => {
        if (!draggingKoofId || !koofDragStartRef.current || !onLeidingkoofChange) return;
        if (!pxPerMmState) return;

        const start = koofDragStartRef.current;
        const dxPx = e.clientX - start.x;
        const dyPx = e.clientY - start.y;

        const dxMm = dxPx / pxPerMmState;
        const dyMm = -(dyPx / pxPerMmState);

        const newLeft = Math.max(0, Math.round(start.origLeft + dxMm));
        const newBottom = Math.max(0, Math.round(start.origBottom + dyMm));

        const SNAP_THRESHOLD = 50; // mm
        const updatedKofen = (item.leidingkofen || []).map(k => {
            if (k.id !== draggingKoofId) return k;

            const orientation = k.orientation || 'side';
            const koofLengte = Number(k.lengte) || 0;
            const koofHoogte = Number(k.hoogte) || 0;
            const rectWMm = orientation === 'side' ? koofHoogte : koofLengte;
            const rectHMm = orientation === 'side' ? koofLengte : koofHoogte;

            let finalLeft = newLeft;
            let finalBottom = newBottom;

            if (finalLeft < SNAP_THRESHOLD) finalLeft = 0;
            if (lengte > 0 && (finalLeft + rectWMm) > (lengte - SNAP_THRESHOLD)) {
                finalLeft = Math.max(0, lengte - rectWMm);
            }
            if (finalBottom < SNAP_THRESHOLD) finalBottom = 0;
            if (effectiveHeight > 0 && (finalBottom + rectHMm) > (effectiveHeight - SNAP_THRESHOLD)) {
                finalBottom = Math.max(0, effectiveHeight - rectHMm);
            }

            let sides = 3;
            if (lengte > 0 && (finalLeft === 0 || Math.abs(finalLeft + rectWMm - lengte) < 2)) {
                sides = 2;
            }
            if (effectiveHeight > 0 && (finalBottom === 0 || Math.abs(finalBottom + rectHMm - effectiveHeight) < 2)) {
                sides = 2;
            }

            return { ...k, vanLinks: finalLeft, vanOnder: finalBottom, aantalZijden: sides };
        });

        onLeidingkoofChange(updatedKofen);
    }, [draggingKoofId, onLeidingkoofChange, pxPerMmState, item.leidingkofen, lengte, effectiveHeight]);

    const handleKoofPointerUp = React.useCallback((e: React.PointerEvent) => {
        if (draggingKoofId) {
            (e.target as Element).releasePointerCapture(e.pointerId);
            setDraggingKoofId(null);
            koofDragStartRef.current = null;
        }
    }, [draggingKoofId]);

    const handleCombinedPointerMove = React.useCallback((e: React.PointerEvent) => {
        handlePointerMove(e);
        handleKoofPointerMove(e);
    }, [handlePointerMove, handleKoofPointerMove]);

    const handleCombinedPointerUp = React.useCallback((e: React.PointerEvent) => {
        handlePointerUp(e);
        handleKoofPointerUp(e);
    }, [handlePointerUp, handleKoofPointerUp]);

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
            gridLabel={!balkafstand && !latafstand ? 'Plafond Vlak' : undefined}
            className={className}
            fitContainer={fitContainer}
            startFromRight={startFromRight}
            suppressTotalDimensions={true}
            drawingData={drawingData}
            onPointerMove={handleCombinedPointerMove}
            onPointerUp={handleCombinedPointerUp}
        >
            {(ctx) => {
                metricsRef.current = ctx;
                const { startX, startY, rectW, rectH, pxPerMm, SVG_HEIGHT } = ctx;
                const pxPerMmW = pxPerMm;
                const pxPerMmH = pxPerMm;
                const structureColor = "rgb(70, 75, 85)";
                const lattenColor = "rgb(70, 75, 85)";
                const profileColor = "rgb(90, 95, 105)"; // Slightly lighter for metal

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

                // 25mm Beginprofiel (Frame) - Metal Stud Specific
                const FRAME_WIDTH_MM = 25;
                const framePx = FRAME_WIDTH_MM * pxPerMm;

                // Draw 25mm frame rect inside the outline
                // Top
                elements.push(<line key="ms-frame-top" x1={startX} y1={startY + framePx / 2} x2={startX + rectW} y2={startY + framePx / 2} stroke={profileColor} strokeWidth={framePx} opacity="0.6" />);
                // Bottom
                elements.push(<line key="ms-frame-bottom" x1={startX} y1={startY + rectH - framePx / 2} x2={startX + rectW} y2={startY + rectH - framePx / 2} stroke={profileColor} strokeWidth={framePx} opacity="0.6" />);
                // Left
                elements.push(<line key="ms-frame-left" x1={startX + framePx / 2} y1={startY} x2={startX + framePx / 2} y2={startY + rectH} stroke={profileColor} strokeWidth={framePx} opacity="0.6" />);
                // Right
                elements.push(<line key="ms-frame-right" x1={startX + rectW - framePx / 2} y1={startY} x2={startX + rectW - framePx / 2} y2={startY + rectH} stroke={profileColor} strokeWidth={framePx} opacity="0.6" />);

                // BEAMS (Vertical Profiles)
                const opsForOverlay = mappingOpeningsForOverlay(rawOpenings, effectiveHeight);

                // Calculate Available Space inside frame for profiles
                // The profiles start AFTER the 25mm frame usually? Or is spacing from wall edge?
                // Usually spacing is from wall edge (0). The frame is just visual overlay or structural edge.
                // We keep grid calculation from 0 to conform to "h.o.h" from wall.

                const framing = calculateGridGaps({
                    wallLength: lengte,
                    spacing: balkafstand,
                    studWidth: 45, // Metal stud ~45mm (C-profile)
                    startFromRight
                });

                const gridGaps = framing.gaps.map(g => ({
                    value: g.value,
                    c1: startX + g.c1 * pxPerMmW,
                    c2: startX + g.c2 * pxPerMmW
                }));

                // Render Profiles
                if (balkafstand > 0) {
                    const PROFILE_WIDTH_MM = 60; // Metal C-profiles often 50-75mm, let's use 60mm for good visibility
                    const BEAM_STROKE = Math.max(1, PROFILE_WIDTH_MM * pxPerMmW);

                    const vStartY = startY + framePx; // Profiles sit inside top frame
                    const vEndY = startY + rectH - framePx; // Profiles sit inside bottom frame

                    framing.beamCenters.forEach(cx => {
                        const drawX = startX + (cx * pxPerMmW);
                        // Hide if overlapping with frame (start/end)
                        if (drawX < startX + framePx || drawX > startX + rectW - framePx) return;

                        // Check Intersections with Openings (Raveelwerk check)
                        const intersectingOpening = opsForOverlay.find(op => {
                            const opLeft = op.fromLeft;
                            const opRight = op.fromLeft + op.width;
                            const beamLeft = cx - PROFILE_WIDTH_MM / 2;
                            const beamRight = cx + PROFILE_WIDTH_MM / 2;
                            return beamRight > opLeft && beamLeft < opRight;
                        });

                        if (intersectingOpening && intersectingOpening.requires_raveelwerk) {
                            // Beam intersects an opening with raveelwerk - split it!
                            const opTopMm = intersectingOpening.fromBottom + intersectingOpening.height;
                            const opBottomMm = intersectingOpening.fromBottom;
                            const TOP_HEADER_THICKNESS_MM = 60; // Same as profile width
                            const BOTTOM_HEADER_THICKNESS_MM = 60; // Same as profile width

                            const svgOpTop = (startY + rectH) - opTopMm * pxPerMm - TOP_HEADER_THICKNESS_MM * pxPerMm;
                            const svgOpBottom = (startY + rectH) - opBottomMm * pxPerMm + BOTTOM_HEADER_THICKNESS_MM * pxPerMm;

                            if (svgOpTop > vStartY) {
                                elements.push(<line key={`pro-${cx}-top`} x1={drawX} y1={vStartY} x2={drawX} y2={svgOpTop} stroke={profileColor} strokeWidth={BEAM_STROKE} opacity="0.5" />);
                            }
                            if (svgOpBottom < vEndY) {
                                elements.push(<line key={`pro-${cx}-bottom`} x1={drawX} y1={svgOpBottom} x2={drawX} y2={vEndY} stroke={profileColor} strokeWidth={BEAM_STROKE} opacity="0.5" />);
                            }
                        } else {
                            elements.push(<line key={`pro-${cx}`} x1={drawX} y1={vStartY} x2={drawX} y2={vEndY} stroke={profileColor} strokeWidth={BEAM_STROKE} opacity="0.5" />);
                        }
                    });
                }

                // LATTEN (Secondary Structure - Horizontal)
                if (latafstand > 0) {
                    const lattenFraming = calculateGridGaps({
                        wallLength: effectiveHeight,
                        spacing: latafstand,
                        studWidth: 50, // Latten 50mm
                        startFromRight: startLattenFromBottom
                    });

                    // Draw Latten
                    lattenFraming.beamCenters.forEach(cy => {
                        const centerY = startY + (cy * pxPerMmH);
                        const halfWidth = (50 * pxPerMmH) / 2;
                        const topY = centerY - halfWidth;
                        const bottomY = centerY + halfWidth;

                        if (bottomY < startY + framePx || topY > startY + rectH - framePx) return;

                        elements.push(
                            <line key={`lat-${cy}-top`} x1={startX} y1={topY} x2={startX + rectW} y2={topY} stroke={lattenColor} strokeWidth={1} strokeDasharray="4,4" opacity="0.8" />
                        );
                        elements.push(
                            <line key={`lat-${cy}-bottom`} x1={startX} y1={bottomY} x2={startX + rectW} y2={bottomY} stroke={lattenColor} strokeWidth={1} strokeDasharray="4,4" opacity="0.8" />
                        );
                    });

                    if (item.doubleEndBattens) {
                        const LAT_WIDTH = 50;
                        const extraTop = (LAT_WIDTH / 2) + LAT_WIDTH + FRAME_WIDTH_MM; // Offset from frame
                        const extraBottom = effectiveHeight - ((LAT_WIDTH / 2) + LAT_WIDTH + FRAME_WIDTH_MM);

                        const drawLat = (cy: number, k: string) => {
                            const centerY = startY + (cy * pxPerMmH);
                            const halfWidth = (50 * pxPerMmH) / 2;
                            const topY = centerY - halfWidth;
                            const bottomY = centerY + halfWidth;
                            elements.push(<line key={`${k}-t`} x1={startX} y1={topY} x2={startX + rectW} y2={topY} stroke={lattenColor} strokeWidth={1} strokeDasharray="4,4" />);
                            elements.push(<line key={`${k}-b`} x1={startX} y1={bottomY} x2={startX + rectW} y2={bottomY} stroke={lattenColor} strokeWidth={1} strokeDasharray="4,4" />);
                        }

                        if (extraTop < effectiveHeight) drawLat(extraTop, 'lat-dbl-t');
                        if (extraBottom > 0) drawLat(extraBottom, 'lat-dbl-b');
                    }
                }

                const clipId = `ms-ceiling-clip-${shape}`;
                return (
                    <>
                        <defs><clipPath id={clipId}><path d={outlinePath} /></clipPath></defs>
                        <path d={outlinePath} stroke={structureColor} strokeWidth="0.5" fill="none" />
                        <g clipPath={`url(#${clipId})`}>
                            {elements}
                        </g>

                        {/* RAVEELWERK Overlays */}
                        {opsForOverlay.map((op) => {
                            const isRaveel = (op as any).requires_raveelwerk;
                            let raveelSVGBeams: any[] = [];

                            if (isRaveel && framing.beamCenters.length > 0) {
                                const raveelGeometry = calculateRaveelwerk({
                                    openingFromLeft: op.fromLeft,
                                    openingWidth: op.width,
                                    openingHeight: op.height,
                                    openingFromBottom: op.fromBottom,
                                    existingBeamCenters: framing.beamCenters,
                                    beamWidth: 60, // Profile width
                                    totalHeight: effectiveHeight
                                });
                                raveelSVGBeams = raveelwerkToSVG(raveelGeometry, startX, startY, rectH, pxPerMm);
                            }

                            return (
                                <g key={`raveel-grp-${op.id}`} className="pointer-events-none">
                                    {isRaveel && raveelSVGBeams.map((beam, idx) => {
                                        if (beam.type === 'header') {
                                            const centerY = beam.svgY + beam.svgHeight / 2;
                                            return <line key={`r-h-${idx}`} x1={beam.svgX} y1={centerY} x2={beam.svgX + beam.svgWidth} y2={centerY} stroke={profileColor} strokeWidth={beam.svgHeight} opacity="0.5" />;
                                        } else {
                                            const centerX = beam.svgX + beam.svgWidth / 2;
                                            return <line key={`r-v-${idx}`} x1={centerX} y1={beam.svgY} x2={centerX} y2={beam.svgY + beam.svgHeight} stroke={profileColor} strokeWidth={beam.svgWidth} opacity="0.5" />;
                                        }
                                    })}
                                </g>
                            );
                        })}

                        {/* Leidingkoof Overlay */}
                        <LeidingkoofOverlay
                            leidingkofen={item.leidingkofen || []}
                            startX={startX}
                            startY={startY}
                            rectW={rectW}
                            rectH={rectH}
                            pxPerMm={pxPerMm}
                            wallLength={lengte}
                            wallHeight={effectiveHeight}
                            onPointerDown={handleKoofPointerDown}
                            onPointerMove={handleKoofPointerMove}
                            onPointerUp={handleKoofPointerUp}
                            draggingId={draggingKoofId}
                            isDraggable={Boolean(onLeidingkoofChange)}
                        />

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
        </BaseDrawingFrame >
    );
}
