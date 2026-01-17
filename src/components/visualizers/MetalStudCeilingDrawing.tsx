import React from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';

export interface CeilingOpening {
    id: string;
    type: string;
    width: number; // Breedte (X)
    length: number; // Lengte (Y)
    fromLeft: number;
    fromTop: number; // Vanaf Boven

    // UI compatibility props
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
        hoogte?: string | number;
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
        // L-Shape / U-Shape props
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
    // Extract shape
    const shape = item.shape || 'rectangle';
    const variant = item.variant || 'top';
    const openings = item.openings || [];

    // Parse dimensions
    const lengte = parseFloat(String(item.lengte || 0));
    const width = parseFloat(String((item as any).width || 0)); // Fallback
    const hoogte = parseFloat(String(item.hoogte || 0));
    const balkafstand = parseFloat(String(item.balkafstand || 0));
    const latafstand = parseFloat(String(item.latafstand || 0));

    // Slope props
    const hoogteLinks = parseFloat(String(item.hoogteLinks || 0));
    const hoogteRechts = parseFloat(String(item.hoogteRechts || 0));

    // Gable props
    const hoogteNok = parseFloat(String(item.hoogteNok || 0));

    // L-Shape / U-Shape props
    const lengte1 = parseFloat(String(item.lengte1 || 0));
    const hoogte1 = parseFloat(String(item.hoogte1 || 0));
    const lengte2 = parseFloat(String(item.lengte2 || 0));
    const hoogte2 = parseFloat(String(item.hoogte2 || 0));
    const lengte3 = parseFloat(String(item.lengte3 || 0));
    const hoogte3 = parseFloat(String(item.hoogte3 || 0));

    // Calculate effective height based on shape
    let effectiveHeight = hoogte;
    let hLeft = hoogte;
    let hRight = hoogte;
    let hPeak = 0;

    if (shape === 'slope') {
        hLeft = hoogteLinks;
        hRight = hoogteRechts;
        effectiveHeight = Math.max(hLeft, hRight);
    } else if (shape === 'gable') {
        hLeft = hoogte;
        hRight = hoogte;
        hPeak = hoogteNok;
        effectiveHeight = hPeak || hoogte;
    } else if (shape === 'l-shape') {
        effectiveHeight = Math.max(hoogte1, hoogte2);
    } else if (shape === 'u-shape') {
        effectiveHeight = Math.max(hoogte1, hoogte2, hoogte3);
    }

    // Style Constants
    const structureColor = "rgb(70, 75, 85)";
    const lattenColor = structureColor;
    const dimColor = "#10b981"; // Emerald-500

    // Determine height label based on shape
    let hLabelLeft = effectiveHeight > 0 ? `${effectiveHeight}` : '---';
    let hLabelRight: string | undefined = undefined;

    if (shape === 'slope') {
        hLabelLeft = `${hLeft || '---'}`;
        hLabelRight = `${hRight || '---'}`;
    } else if (shape === 'gable') {
        hLabelLeft = `${hLeft || '---'}`;
        // For gable, maybe show peak in middle? 
        // Original was "Left / Peak". 
        // Let's keep Left on Left. Right on Right (which is same as Left usually).
        // And maybe Peak should be separate? 
        // For now, let's put Peak as Right label so it's visible? 
        // No, Right side is hRight. 
        // Let's stick to physical reality: Left Wall Height, Right Wall Height.
        // If user wants Peak, it usually goes in the middle. 
        // BUT, the original code showed "Left / Peak".
        // Use judgement: For Gable, maybe Right Label isn't the best place for Peak.
        // Let's default to Left=Left, Right=Right.
        hLabelRight = `${hRight || '---'}`;
    } else if (shape === 'l-shape') {
        // L-Shape heights are complex. 
        // Original: h1 / h2.
        // Let's keep split.
        hLabelLeft = `${hoogte1 || '---'}`;
        hLabelRight = `${hoogte2 || '---'}`;
    } else if (shape === 'u-shape') {
        hLabelLeft = `${hoogte1 || '---'}`;
        hLabelRight = `${hoogte3 || '---'}`; // H3 is arguably the "right" leg height
    }

    // State for drag
    const [draggingId, setDraggingId] = React.useState<string | null>(null);
    const dragStartRef = React.useRef<{ x: number; y: number; opId: string; origLeft: number; origTop: number } | null>(null);
    const metricsRef = React.useRef<any>(null);

    const handlePointerDown = (e: React.PointerEvent, op: CeilingOpening) => {
        if (!onOpeningsChange) return;
        e.preventDefault();
        e.stopPropagation();
        (e.target as Element).setPointerCapture(e.pointerId);
        setDraggingId(op.id);

        // Normalize props
        const xRaw = op.fromLeft ?? (op as any).vanafLinks ?? 0;
        const yRaw = op.fromTop ?? (op as any).vanafBoven ?? op.fromBottom ?? 0;

        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            opId: op.id,
            origLeft: xRaw,
            origTop: yRaw
        };
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!draggingId || !dragStartRef.current || !onOpeningsChange) return;

        const pxPerMm = metricsRef.current?.pxPerMm || 1;
        const start = dragStartRef.current;

        const dxPx = e.clientX - start.x;
        const dyPx = e.clientY - start.y;

        const dxMm = dxPx / pxPerMm;
        const dyMm = dyPx / pxPerMm; // Y is Top-Down in Ceiling

        let newLeft = Math.round(start.origLeft + dxMm);
        let newTop = Math.round(start.origTop + dyMm);

        const draggedOp = (item.openings || []).find(o => o.id === draggingId);

        // SNAP TO BEAMS (Alignment)
        if (draggedOp) {
            const SNAP_DIST_MM = 50;
            const BEAM_W = 75;
            const BEAM_HALF = BEAM_W / 2;

            const balf = parseFloat(String(item.balkafstand ?? 0));
            const rightAligned = !!(item as any).startFromRight;
            const iW = parseFloat(String(item.lengte ?? (item as any).width ?? 0)); // Length is usually Width in UI mapping

            if (balf > 0) {
                const beamCenters: number[] = [];
                // Edge Beams
                beamCenters.push(BEAM_HALF); // Left Edge
                beamCenters.push(iW - BEAM_HALF); // Right Edge

                // Grid Beams
                if (rightAligned) {
                    let c = (iW - BEAM_HALF) - balf;
                    while (c > BEAM_HALF + 1) {
                        beamCenters.push(c);
                        c -= balf;
                    }
                } else {
                    let c = balf;
                    while (c < iW - BEAM_HALF - 1) {
                        beamCenters.push(c);
                        c += balf;
                    }
                }

                const opW = draggedOp.width ?? (draggedOp as any).breedte ?? 0;

                for (const center of beamCenters) {
                    const faceL = center - BEAM_HALF;
                    const faceR = center + BEAM_HALF;

                    // 1. Snap Left Edge of Opening to Right Face of Beam
                    if (Math.abs(newLeft - faceR) < SNAP_DIST_MM) {
                        newLeft = Math.round(faceR);
                        break;
                    }

                    // 2. Snap Right Edge of Opening to Left Face of Beam
                    if (Math.abs((newLeft + opW) - faceL) < SNAP_DIST_MM) {
                        newLeft = Math.round(faceL - opW);
                        break;
                    }
                }
            }
        }

        const newOpenings = (item.openings || []).map(o => {
            if (o.id === draggingId) {
                // Update specific properties. Maintain data structure integrity.
                // We update main English props + sync UI props if they exist
                return {
                    ...o,
                    fromLeft: newLeft,
                    fromTop: newTop,
                    vanafLinks: (o as any).vanafLinks !== undefined ? newLeft : undefined,
                    vanafBoven: (o as any).vanafBoven !== undefined ? newTop : undefined,
                    fromBottom: (o as any).fromBottom !== undefined ? newTop : undefined // Keep fromBottom synced to newTop for consistency (though semantically weird, UI maps them)
                };
            }
            return o;
        });

        onOpeningsChange(newOpenings);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (draggingId) {
            (e.target as Element).releasePointerCapture(e.pointerId);
            setDraggingId(null);
            dragStartRef.current = null;
        }
    };

    return (
        <BaseDrawingFrame
            width={lengte}
            height={effectiveHeight}
            primarySpacing={balkafstand}
            secondarySpacing={latafstand}
            widthLabel={lengte > 0 ? `${lengte}` : '---'}
            heightLabel={hLabelLeft}
            rightHeightLabel={hLabelRight}
            gridLabel={!balkafstand && !latafstand ? 'Plafond Vlak' : undefined}
            className={className}
            fitContainer={fitContainer}
            startFromRight={startFromRight}
            suppressTotalDimensions={true}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            {(metrics) => {
                metricsRef.current = metrics;
                const { startX, startY, rectW, rectH, pxPerMm } = metrics;
                // Standardize scale for rendering
                const pxPerMmW = pxPerMm;
                const pxPerMmH = pxPerMm;

                const elements: React.ReactNode[] = [];
                const inputW = lengte || 2400;
                const inputH = effectiveHeight || 2400;

                // Use the uniform scaling factor from BaseDrawingFrame
                // This ensures X and Y scaling is identical (uniform aspect ratio)

                // ============================================================
                // SHAPE OUTLINE PATH
                // ============================================================
                // Default to rectangle
                let outlinePath = `
                    M ${startX} ${startY}
                    L ${startX + rectW} ${startY}
                    L ${startX + rectW} ${startY + rectH}
                    L ${startX} ${startY + rectH}
                    Z
                `;

                if (shape === 'slope') {
                    // Sloped ceiling - top edge is diagonal
                    const yTopLeft = variant === 'bottom' ? startY + rectH - (hLeft * pxPerMmH) : startY;
                    const yTopRight = variant === 'bottom' ? startY + rectH - (hRight * pxPerMmH) : startY + (Math.max(hLeft, hRight) - hRight) * pxPerMmH;
                    const yBotLeft = variant === 'bottom' ? startY + rectH : startY + rectH;
                    const yBotRight = variant === 'bottom' ? startY + rectH : startY + rectH;

                    if (variant === 'bottom') {
                        // Slope bottom: Top is flat, bottom varies
                        const yTop = startY;
                        const yBL = startY + (hLeft * pxPerMmH);
                        const yBR = startY + (hRight * pxPerMmH);
                        outlinePath = `
                            M ${startX} ${yTop}
                            L ${startX + rectW} ${yTop}
                            L ${startX + rectW} ${yBR}
                            L ${startX} ${yBL}
                            Z
                        `;
                    } else {
                        // Slope top: Bottom is flat, top varies
                        const yBot = startY + rectH;
                        const yTL = startY + (inputH - hLeft) * pxPerMmH;
                        const yTR = startY + (inputH - hRight) * pxPerMmH;
                        outlinePath = `
                            M ${startX} ${yTL}
                            L ${startX + rectW} ${yTR}
                            L ${startX + rectW} ${yBot}
                            L ${startX} ${yBot}
                            Z
                        `;
                    }
                } else if (shape === 'gable') {
                    // Gable / Pitched ceiling (triangle peak)
                    const midX = startX + rectW / 2;
                    const yBot = startY + rectH;
                    const ySide = startY + (inputH - hLeft) * pxPerMmH;
                    const yPeakPos = startY + (inputH - hPeak) * pxPerMmH;

                    if (variant === 'bottom') {
                        // Peak at bottom (Inverted Gable)
                        const yTop = startY;
                        const ySidePos = startY + (hLeft * pxPerMmH);
                        const yPeakPosBottom = startY + (hPeak * pxPerMmH);
                        outlinePath = `
                            M ${startX} ${yTop}
                            L ${startX + rectW} ${yTop}
                            L ${startX + rectW} ${ySidePos}
                            L ${midX} ${yPeakPosBottom}
                            L ${startX} ${ySidePos}
                            Z
                        `;
                    } else {
                        // Peak at top
                        outlinePath = `
                            M ${startX} ${ySide}
                            L ${midX} ${yPeakPos}
                            L ${startX + rectW} ${ySide}
                            L ${startX + rectW} ${yBot}
                            L ${startX} ${yBot}
                            Z
                        `;
                    }
                } else if (shape === 'l-shape') {
                    // L-Shaped ceiling
                    const l1Px = lengte1 * pxPerMmW;
                    const h1Px = hoogte1 * pxPerMmH;
                    const h2Px = hoogte2 * pxPerMmH;

                    const yBot = startY + rectH;
                    const yH1 = startY + (inputH - hoogte1) * pxPerMmH;
                    const yH2 = startY + (inputH - hoogte2) * pxPerMmH;
                    const xL1 = startX + l1Px;

                    if (variant === 'bottom') {
                        // Step at bottom
                        const yTop = startY;
                        const yB1 = startY + h1Px;
                        const yB2 = startY + h2Px;
                        outlinePath = `
                            M ${startX} ${yTop}
                            L ${startX + rectW} ${yTop}
                            L ${startX + rectW} ${yB2}
                            L ${xL1} ${yB2}
                            L ${xL1} ${yB1}
                            L ${startX} ${yB1}
                            Z
                        `;
                    } else {
                        // Step at top
                        outlinePath = `
                            M ${startX} ${yH1}
                            L ${xL1} ${yH1}
                            L ${xL1} ${yH2}
                            L ${startX + rectW} ${yH2}
                            L ${startX + rectW} ${yBot}
                            L ${startX} ${yBot}
                            Z
                        `;
                    }
                } else if (shape === 'u-shape') {
                    // U-Shaped ceiling
                    const l1Px = lengte1 * pxPerMmW;
                    const l2Px = lengte2 * pxPerMmW;
                    const h1Px = hoogte1 * pxPerMmH;
                    const h2Px = hoogte2 * pxPerMmH;
                    const h3Px = hoogte3 * pxPerMmH;

                    const yBot = startY + rectH;
                    const yH1 = startY + (inputH - hoogte1) * pxPerMmH;
                    const yH2 = startY + (inputH - hoogte2) * pxPerMmH;
                    const yH3 = startY + (inputH - hoogte3) * pxPerMmH;
                    const xL1 = startX + l1Px;
                    const xL2 = startX + l1Px + l2Px;

                    if (variant === 'bottom') {
                        // Step at bottom
                        const yTop = startY;
                        const yB1 = startY + rectH - h1Px;
                        const yB2 = startY + rectH - h2Px;
                        const yB3 = startY + rectH - h3Px;
                        outlinePath = `
                            M ${startX} ${yTop}
                            L ${startX + rectW} ${yTop}
                            L ${startX + rectW} ${yB3}
                            L ${xL2} ${yB3}
                            L ${xL2} ${yB2}
                            L ${xL1} ${yB2}
                            L ${xL1} ${yB1}
                            L ${startX} ${yB1}
                            Z
                        `;
                    } else {
                        // Step at top
                        outlinePath = `
                            M ${startX} ${yH1}
                            L ${xL1} ${yH1}
                            L ${xL1} ${yH2}
                            L ${xL2} ${yH2}
                            L ${xL2} ${yH3}
                            L ${startX + rectW} ${yH3}
                            L ${startX + rectW} ${yBot}
                            L ${startX} ${yBot}
                            Z
                        `;
                    }
                }

                // NOTE: Ceiling outline is handled by BaseDrawingFrame, no need to draw here

                // ============================================================
                // Helper: Get ceiling Y position at given X (for beam clipping)
                // ============================================================
                const getCeilingTop = (xPx: number): number => {
                    const ratio = (xPx - startX) / rectW;
                    const xMm = ratio * inputW;

                    if (shape === 'slope') {
                        if (variant === 'bottom') {
                            return startY; // Flat top
                        } else {
                            // Top varies: interpolate between hLeft and hRight
                            const hAtX = hLeft + (hRight - hLeft) * ratio;
                            return startY + (inputH - hAtX) * pxPerMmH;
                        }
                    } else if (shape === 'gable') {
                        if (variant === 'bottom') {
                            return startY;
                        } else {
                            const midRatio = 0.5;
                            if (ratio <= midRatio) {
                                const hAtX = hLeft + (hPeak - hLeft) * (ratio / midRatio);
                                return startY + (inputH - hAtX) * pxPerMmH;
                            } else {
                                const hAtX = hPeak + (hRight - hPeak) * ((ratio - midRatio) / midRatio);
                                return startY + (inputH - hAtX) * pxPerMmH;
                            }
                        }
                    } else if (shape === 'l-shape') {
                        if (variant === 'bottom') {
                            return startY;
                        } else {
                            return xMm <= lengte1
                                ? startY + (inputH - hoogte1) * pxPerMmH
                                : startY + (inputH - hoogte2) * pxPerMmH;
                        }
                    } else if (shape === 'u-shape') {
                        if (variant === 'bottom') {
                            return startY;
                        } else {
                            if (xMm <= lengte1) return startY + (inputH - hoogte1) * pxPerMmH;
                            if (xMm <= lengte1 + lengte2) return startY + (inputH - hoogte2) * pxPerMmH;
                            return startY + (inputH - hoogte3) * pxPerMmH;
                        }
                    }
                    return startY;
                };

                const getCeilingBottom = (xPx: number): number => {
                    const ratio = (xPx - startX) / rectW;
                    const xMm = ratio * inputW;

                    if (shape === 'slope' && variant === 'bottom') {
                        const hAtX = hLeft + (hRight - hLeft) * ratio;
                        return startY + (hAtX * pxPerMmH);
                    } else if (shape === 'gable' && variant === 'bottom') {
                        const midRatio = 0.5;
                        if (ratio <= midRatio) {
                            const hAtX = hLeft + (hPeak - hLeft) * (ratio / midRatio);
                            return startY + (hAtX * pxPerMmH);
                        } else {
                            const hAtX = hPeak + (hRight - hPeak) * ((ratio - midRatio) / midRatio);
                            return startY + (hAtX * pxPerMmH);
                        }
                    } else if (shape === 'l-shape' && variant === 'bottom') {
                        return xMm <= lengte1
                            ? startY + (hoogte1 * pxPerMmH)
                            : startY + (hoogte2 * pxPerMmH);
                    } else if (shape === 'u-shape' && variant === 'bottom') {
                        if (xMm <= lengte1) return startY + (hoogte1 * pxPerMmH);
                        if (xMm <= lengte1 + lengte2) return startY + (hoogte2 * pxPerMmH);
                        return startY + (hoogte3 * pxPerMmH);
                    }
                    return startY + rectH;
                };

                // ============================================================
                // CLIP PATH DEFINITION
                // ============================================================
                const clipId = `ceiling-clip-${React.useId().replace(/:/g, '')}`;

                // ============================================================
                // RENDER
                // ============================================================

                // Arrays to store centers for dimensioning later
                const beamCentersForDims: number[] = [];
                const latCentersForDims: number[] = [];

                // Group for the structure that should be clipped
                const clippedContent: React.ReactNode[] = [];

                // 1. BALKEN (Vertical Lines)
                if (balkafstand > 0) {
                    // Scalable Stroke Widths
                    const BEAM_WIDTH_MM = 75; // Reduced from 45mm per user feedback ("too big")
                    const beamStroke = Math.max(1, BEAM_WIDTH_MM * pxPerMmW); // Minimum 1px visibility
                    const beamHalfWidth = beamStroke / 2;

                    const spacingPx = balkafstand * pxPerMmW;

                    // First beam (EDGE)
                    const firstEdgeBeamCenter = startX + beamHalfWidth;
                    // We can still use manual clipping for beams to get clean line caps, 
                    // or rely on the SVG clip. Keeping manual calc for beams is fine, 
                    // but we'll add them to the clipped group for consistency.
                    const firstTop = getCeilingTop(firstEdgeBeamCenter);
                    const firstBot = getCeilingBottom(firstEdgeBeamCenter);
                    clippedContent.push(
                        <line
                            key="beam-edge-first"
                            x1={firstEdgeBeamCenter} y1={firstTop}
                            x2={firstEdgeBeamCenter} y2={firstBot}
                            stroke={structureColor}
                            strokeWidth={beamStroke}
                            opacity="0.5"
                        />
                    );

                    // Last beam (EDGE)
                    const lastEdgeBeamCenter = startX + rectW - beamHalfWidth;

                    // H.O.H. beams
                    let beamIndex = 1;

                    if (startFromRight) {
                        let currentX = lastEdgeBeamCenter - spacingPx;
                        while (currentX > firstEdgeBeamCenter + 0.1) { // Tolerance
                            const beamTop = getCeilingTop(currentX);
                            const beamBot = getCeilingBottom(currentX);
                            beamCentersForDims.push(currentX);
                            clippedContent.push(
                                <line
                                    key={`beam-${beamIndex}`}
                                    x1={currentX} y1={beamTop}
                                    x2={currentX} y2={beamBot}
                                    stroke={structureColor}
                                    strokeWidth={beamStroke}
                                    opacity="0.5"
                                />
                            );
                            beamIndex++;
                            currentX -= spacingPx;
                        }
                    } else {
                        let currentX = startX + spacingPx;
                        while (currentX < lastEdgeBeamCenter - 0.1) {
                            const beamTop = getCeilingTop(currentX);
                            const beamBot = getCeilingBottom(currentX);
                            beamCentersForDims.push(currentX);
                            clippedContent.push(
                                <line
                                    key={`beam-${beamIndex}`}
                                    x1={currentX} y1={beamTop}
                                    x2={currentX} y2={beamBot}
                                    stroke={structureColor}
                                    strokeWidth={beamStroke}
                                    opacity="0.5"
                                />
                            );
                            beamIndex++;
                            currentX += spacingPx;
                        }
                    }
                    // Sort dims for correct gap calculation
                    beamCentersForDims.sort((a, b) => a - b);

                    // Last edge beam
                    const lastTop = getCeilingTop(lastEdgeBeamCenter);
                    const lastBot = getCeilingBottom(lastEdgeBeamCenter);
                    clippedContent.push(
                        <line
                            key="beam-edge-last"
                            x1={lastEdgeBeamCenter} y1={lastTop}
                            x2={lastEdgeBeamCenter} y2={lastBot}
                            stroke={structureColor}
                            strokeWidth={beamStroke}
                            opacity="0.5"
                        />
                    );
                }

                // 2. LATTEN (Horizontal Lines)
                if (latafstand > 0) {
                    // Scalable Spacing for Latten Outline
                    const LAT_WIDTH_MM = 50; // User specified 50mm
                    const latHeightPx = LAT_WIDTH_MM * pxPerMmH;
                    const halfLat = latHeightPx / 2;

                    const spacingPx = latafstand * pxPerMmH;

                    const latStartX = startX;
                    const latEndX = startX + rectW;
                    // Cover full height, let clip handle the rest
                    const topBoundY = startY;
                    const bottomBoundY = startY + rectH;

                    // Start exactly one spacing distance from the top or bottom
                    let latIndex = 0;

                    // Explicit Start & End Latten (Flush with edges)
                    const firstLatCenter = topBoundY + halfLat;
                    const lastLatCenter = bottomBoundY - halfLat;

                    // 1. Start Edge Lat
                    // latCentersForDims.push(firstLatCenter); // Don't dimension edge lats individually
                    clippedContent.push(
                        <g key="lat-edge-first">
                            <line x1={latStartX} y1={firstLatCenter - halfLat} x2={latEndX} y2={firstLatCenter - halfLat} stroke={lattenColor} strokeWidth="1" strokeDasharray="4 2" opacity="0.7" />
                            <line x1={latStartX} y1={firstLatCenter + halfLat} x2={latEndX} y2={firstLatCenter + halfLat} stroke={lattenColor} strokeWidth="1" strokeDasharray="4 2" opacity="0.7" />
                        </g>
                    );

                    // 2. End Edge Lat
                    // latCentersForDims.push(lastLatCenter); // Don't dimension edge lats individually
                    clippedContent.push(
                        <g key="lat-edge-last">
                            <line x1={latStartX} y1={lastLatCenter - halfLat} x2={latEndX} y2={lastLatCenter - halfLat} stroke={lattenColor} strokeWidth="1" strokeDasharray="4 2" opacity="0.7" />
                            <line x1={latStartX} y1={lastLatCenter + halfLat} x2={latEndX} y2={lastLatCenter + halfLat} stroke={lattenColor} strokeWidth="1" strokeDasharray="4 2" opacity="0.7" />
                        </g>
                    );

                    if (startLattenFromBottom) {
                        let currentY = bottomBoundY - spacingPx;
                        // Avoid overlapping last edge
                        if (Math.abs(currentY - lastLatCenter) < 1) currentY -= spacingPx;

                        while (currentY > topBoundY + halfLat + 1) { // Stop before hitting top edge
                            // Check overlap with first edge
                            if (Math.abs(currentY - firstLatCenter) > 1) {
                                latCentersForDims.push(currentY);
                                clippedContent.push(
                                    <g key={`slat-${latIndex}`}>
                                        <line x1={latStartX} y1={currentY - halfLat} x2={latEndX} y2={currentY - halfLat} stroke={lattenColor} strokeWidth="1" strokeDasharray="4 2" opacity="0.7" />
                                        <line x1={latStartX} y1={currentY + halfLat} x2={latEndX} y2={currentY + halfLat} stroke={lattenColor} strokeWidth="1" strokeDasharray="4 2" opacity="0.7" />
                                    </g>
                                );
                            }
                            latIndex++;
                            currentY -= spacingPx;
                        }
                    } else {
                        let currentY = topBoundY + spacingPx;
                        // Avoid overlapping first edge
                        if (Math.abs(currentY - firstLatCenter) < 1) currentY += spacingPx;

                        while (currentY < bottomBoundY - halfLat - 1) {
                            if (Math.abs(currentY - lastLatCenter) > 1) {
                                latCentersForDims.push(currentY);
                                clippedContent.push(
                                    <g key={`slat-${latIndex}`}>
                                        <line x1={latStartX} y1={currentY - halfLat} x2={latEndX} y2={currentY - halfLat} stroke={lattenColor} strokeWidth="1" strokeDasharray="4 2" opacity="0.7" />
                                        <line x1={latStartX} y1={currentY + halfLat} x2={latEndX} y2={currentY + halfLat} stroke={lattenColor} strokeWidth="1" strokeDasharray="4 2" opacity="0.7" />
                                    </g>
                                );
                            }
                            latIndex++;
                            currentY += spacingPx;
                        }
                    }
                    // Sort dims
                    latCentersForDims.sort((a, b) => a - b);
                }

                // 3. OPENINGS (Masking "Holes" + Framing)
                if (openings.length > 0) {
                    openings.forEach((op) => {
                        // Handle potential property name mismatches (English vs Dutch UI data)
                        // UI 'Lengte' is saved as 'height', 'Vanaf Boven' is saved as 'fromBottom'
                        const wRaw = op.width ?? (op as any).breedte ?? 0;
                        const hRaw = op.length ?? (op as any).lengte ?? op.height ?? 0;
                        const xRaw = op.fromLeft ?? (op as any).vanafLinks ?? 0;
                        const yRaw = op.fromTop ?? (op as any).vanafBoven ?? op.fromBottom ?? 0;

                        const x = startX + (xRaw * pxPerMmW);
                        const y = startY + (yRaw * pxPerMmH);
                        const w = wRaw * pxPerMmW;
                        const h = hRaw * pxPerMmH;






                        const framingWidth = Math.max(1.5, 75 * pxPerMmW); // 75mm framing to match ceiling beams
                        const halfFrame = framingWidth / 2;

                        // Find structural beams to connect to
                        // Include Edge Beams in the search to ensure we always connect to something
                        const edgeBeamOffset = (75 * pxPerMmW) / 2;
                        const firstEdge = startX + edgeBeamOffset;
                        const lastEdge = startX + rectW - edgeBeamOffset;
                        // Combine edge beams with H.O.H beams
                        const allSupports = [firstEdge, ...beamCentersForDims, lastEdge].sort((a, b) => a - b);

                        // Find closest supports outside the opening
                        const leftSupportCenter = allSupports.slice().reverse().find(c => c < x) ?? firstEdge;
                        const rightSupportCenter = allSupports.find(c => c > x + w) ?? lastEdge;

                        // Check if the Skylight Frame aligns with an Existing Beam (Grid Beam)
                        // If aligned, that Vertical Beam is PRIORITY (Continuous). Header butts into it.
                        // If NOT aligned (New Trimmer), the Horizontal Header is PRIORITY (Full). Trimmer stops at header.
                        const isLeftAligned = Math.abs(leftSupportCenter - (x - halfFrame)) < 1.5;
                        const isRightAligned = Math.abs(rightSupportCenter - (x + w + halfFrame)) < 1.5;

                        // Header X positions - Always Butt against the Supporting Beam (Vertical Priority)
                        const headerStartX = leftSupportCenter + halfFrame;
                        const headerEndX = rightSupportCenter - halfFrame;

                        // Trimmer Y positions
                        const leftTrimmerY1 = isLeftAligned ? y - framingWidth : y;
                        const leftTrimmerY2 = isLeftAligned ? y + h + framingWidth : y + h;

                        const rightTrimmerY1 = isRightAligned ? y - framingWidth : y;
                        const rightTrimmerY2 = isRightAligned ? y + h + framingWidth : y + h;


                        // Background Mask (Hides beams/lats behind) + Frame
                        clippedContent.push(
                            <g key={`op-${op.id}`} onPointerDown={(e) => handlePointerDown(e, op)} style={{ cursor: onOpeningsChange ? 'move' : 'default' }}>
                                {/* Mask covers ONLY the Opening + Immediate Frame (Exposing lats/beams in the wings) */}
                                <rect
                                    x={x - framingWidth}
                                    y={y - framingWidth}
                                    width={w + (framingWidth * 2)}
                                    height={h + (framingWidth * 2)}
                                    fill="#09090b"
                                    opacity={draggingId === op.id ? 0.7 : 1}
                                />

                                {/* 1. Top Header */}
                                <line
                                    x1={headerStartX} y1={y - halfFrame}
                                    x2={headerEndX} y2={y - halfFrame}
                                    stroke={structureColor} strokeWidth={framingWidth} opacity="0.5"
                                />

                                {/* 2. Bottom Header */}
                                <line
                                    x1={headerStartX} y1={y + h + halfFrame}
                                    x2={headerEndX} y2={y + h + halfFrame}
                                    stroke={structureColor} strokeWidth={framingWidth} opacity="0.5"
                                />

                                {/* 3. Left Trimmer */}
                                <line
                                    x1={x - halfFrame} y1={leftTrimmerY1}
                                    x2={x - halfFrame} y2={leftTrimmerY2}
                                    stroke={structureColor} strokeWidth={framingWidth} opacity="0.5"
                                />

                                {/* 4. Right Trimmer */}
                                <line
                                    x1={x + w + halfFrame} y1={rightTrimmerY1}
                                    x2={x + w + halfFrame} y2={rightTrimmerY2}
                                    stroke={structureColor} strokeWidth={framingWidth} opacity="0.5"
                                />
                                {/* Cross (Inner Dimension 1000x1000) */}
                                <line x1={x} y1={y} x2={x + w} y2={y + h} stroke={structureColor} strokeWidth="1" />
                                <line x1={x + w} y1={y} x2={x} y2={y + h} stroke={structureColor} strokeWidth="1" />

                                {/* Draw Lats THROUGH the vertical Trimmer beams (User requirement: "Lat goes into vertical beam") */}
                                {latCentersForDims.length > 0 && latCentersForDims.map((yc, idx) => {
                                    if (yc > y && yc < y + h) {
                                        const hL = (50 * pxPerMmH) / 2;
                                        return (
                                            <g key={`op-lat-through-${op.id}-${idx}`}>
                                                {/* Left Trimmer Crossing */}
                                                <line x1={x - framingWidth} y1={yc - hL} x2={x} y2={yc - hL} stroke={lattenColor} strokeWidth="1" strokeDasharray="4 2" opacity="0.7" />
                                                <line x1={x - framingWidth} y1={yc + hL} x2={x} y2={yc + hL} stroke={lattenColor} strokeWidth="1" strokeDasharray="4 2" opacity="0.7" />

                                                {/* Right Trimmer Crossing */}
                                                <line x1={x + w} y1={yc - hL} x2={x + w + framingWidth} y2={yc - hL} stroke={lattenColor} strokeWidth="1" strokeDasharray="4 2" opacity="0.7" />
                                                <line x1={x + w} y1={yc + hL} x2={x + w + framingWidth} y2={yc + hL} stroke={lattenColor} strokeWidth="1" strokeDasharray="4 2" opacity="0.7" />
                                            </g>
                                        );
                                    }
                                    return null;
                                })}

                                {/* Label + Dimensions */}
                                {op.type && (
                                    <>
                                        <text
                                            x={x + w / 2} y={y + h / 2 + 10}
                                            textAnchor="middle"
                                            fill="white"
                                            fontSize={10}
                                            opacity={0.9}
                                            style={{ fontFamily: 'monospace', fontWeight: 'bold' }}
                                        >
                                            {{ 'opening': 'Sparing', 'window': 'Lichtkoepel', 'hatch': 'Luik', 'Lichtkoepel': 'Lichtkoepel' }[op.type] || op.type}
                                        </text>
                                        <text
                                            x={x + w / 2} y={y + h / 2 + 22}
                                            textAnchor="middle"
                                            fill="white"
                                            fontSize={9}
                                            opacity={0.7}
                                            style={{ fontFamily: 'monospace' }}
                                        >
                                            {Math.round(wRaw)} x {Math.round(hRaw)}
                                        </text>
                                    </>
                                )}
                            </g>
                        );
                    });

                    // ============================================================
                    // TIERED DIMENSION SYSTEM (Matching RoofDrawing)
                    // ============================================================
                    // Configuration
                    const DIM_BASE_OFFSET = 20;
                    const DIM_TRACK_STEP = 30;
                    const EXTENSION_GAP = 5;

                    // Helper for standard dots
                    const drawTick = (tx: number, ty: number, color: string = "#10b981") => {
                        return <circle cx={tx} cy={ty} r="1.5" fill={color} />;
                    };

                    // Helper to pack intervals into tracks
                    const packTracks = (items: { start: number; end: number; size: number; id: string; showLabel: boolean }[]) => {
                        const sorted = [...items].sort((a, b) => a.start - b.start);
                        const tracks: typeof items[] = [];

                        sorted.forEach(item => {
                            let placed = false;
                            for (const track of tracks) {
                                const lastItem = track[track.length - 1];
                                if (item.start >= lastItem.end) {
                                    track.push(item);
                                    placed = true;
                                    break;
                                }
                            }
                            if (!placed) {
                                tracks.push([item]);
                            }
                        });
                        return tracks;
                    };

                    const hasManyOpenings = openings.length > 2;

                    // 1. Horizontal Dimensions (X-Axis)
                    const xItems: { start: number; end: number; size: number; id: string; showLabel: boolean }[] = [];
                    openings.forEach(op => {
                        const x = op.fromLeft ?? (op as any).vanafLinks ?? 0;
                        const w = op.width ?? (op as any).breedte ?? 0;
                        const exists = xItems.find(i => Math.abs(i.start - x) < 1 && Math.abs(i.size - w) < 1);
                        if (!exists) {
                            const hideLabel = w > 600 || hasManyOpenings;
                            xItems.push({ start: x, end: x + w, size: w, id: op.id, showLabel: !hideLabel });
                        }
                    });

                    const xTracks = packTracks(xItems);

                    xTracks.forEach((track, trackIdx) => {
                        const tierY = startY + rectH + DIM_BASE_OFFSET + (trackIdx * DIM_TRACK_STEP);
                        let currentX = 0;

                        track.forEach((item, itemIdx) => {
                            // Gap Segment
                            if (item.start > currentX) {
                                const gap = item.start - currentX;
                                const x1 = startX + (currentX * pxPerMmW);
                                const x2 = startX + (item.start * pxPerMmW);
                                const mid = (x1 + x2) / 2;

                                elements.push(
                                    <g key={`dim-x-gap-${trackIdx}-${itemIdx}`}>
                                        <line x1={x1} y1={tierY} x2={x2} y2={tierY} stroke="#10b981" strokeWidth="0.5" />
                                        {drawTick(x1, tierY)}
                                        {drawTick(x2, tierY)}
                                        <rect x={mid - 12} y={tierY - 5} width="24" height="10" fill="#09090b" />
                                        <text x={mid} y={tierY + 0.5} textAnchor="middle" dominantBaseline="middle" fill="#10b981" fontSize={10} style={{ fontFamily: 'monospace' }}>
                                            {Math.round(gap)}
                                        </text>
                                        {itemIdx === 0 && (
                                            <line x1={x1} y1={startY + rectH + EXTENSION_GAP} x2={x1} y2={tierY} stroke="#10b981" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.5" />
                                        )}
                                    </g>
                                );
                            }

                            // Item Segment
                            const ix1 = startX + (item.start * pxPerMmW);
                            const ix2 = startX + (item.end * pxPerMmW);
                            const imid = (ix1 + ix2) / 2;

                            elements.push(
                                <g key={`dim-x-item-${trackIdx}-${itemIdx}`}>
                                    <line x1={ix1} y1={tierY} x2={ix2} y2={tierY} stroke="#10b981" strokeWidth="0.5" />
                                    {drawTick(ix2, tierY)}
                                    {item.showLabel && (
                                        <>
                                            <rect x={imid - 12} y={tierY - 5} width="24" height="10" fill="#09090b" />
                                            <text x={imid} y={tierY + 0.5} textAnchor="middle" dominantBaseline="middle" fill="#10b981" fontSize={10} style={{ fontFamily: 'monospace' }}>
                                                {Math.round(item.size)}
                                            </text>
                                        </>
                                    )}
                                    <line x1={ix1} y1={startY + rectH + EXTENSION_GAP} x2={ix1} y2={tierY} stroke="#10b981" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.5" />
                                    <line x1={ix2} y1={startY + rectH + EXTENSION_GAP} x2={ix2} y2={tierY} stroke="#10b981" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.5" />
                                </g>
                            );
                            currentX = item.end;
                        });

                        // Final Gap to End
                        if (currentX < inputW) {
                            const rem = inputW - currentX;
                            const rx1 = startX + (currentX * pxPerMmW);
                            const rx2 = startX + (inputW * pxPerMmW);
                            const rmid = (rx1 + rx2) / 2;

                            elements.push(
                                <g key={`dim-x-end-${trackIdx}`}>
                                    <line x1={rx1} y1={tierY} x2={rx2} y2={tierY} stroke="#10b981" strokeWidth="0.5" />
                                    {drawTick(rx2, tierY)}
                                    <rect x={rmid - 12} y={tierY - 5} width="24" height="10" fill="#09090b" />
                                    <text x={rmid} y={tierY + 0.5} textAnchor="middle" dominantBaseline="middle" fill="#10b981" fontSize={10} style={{ fontFamily: 'monospace' }}>
                                        {Math.round(rem)}
                                    </text>
                                    <line x1={rx2} y1={startY + rectH + EXTENSION_GAP} x2={rx2} y2={tierY} stroke="#10b981" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.5" />
                                </g>
                            );
                        }
                    });

                    // Total X Dimension (Furthest Out)
                    const totalX_Y = startY + rectH + DIM_BASE_OFFSET + ((xTracks.length) * DIM_TRACK_STEP);
                    const txEnd = startX + (inputW * pxPerMmW);
                    const txMid = (startX + txEnd) / 2;

                    elements.push(
                        <g key="dim-x-total">
                            <line x1={startX} y1={totalX_Y} x2={txEnd} y2={totalX_Y} stroke="#10b981" strokeWidth="0.5" />
                            {drawTick(startX, totalX_Y)}
                            {drawTick(txEnd, totalX_Y)}
                            <rect x={txMid - 20} y={totalX_Y - 6} width="40" height="12" fill="#09090b" />
                            <text x={txMid} y={totalX_Y + 0.5} textAnchor="middle" dominantBaseline="middle" fill="#10b981" fontSize={12} fontWeight="bold" style={{ fontFamily: 'monospace' }}>
                                {Math.round(inputW)}
                            </text>
                            <line x1={startX} y1={startY + rectH + EXTENSION_GAP} x2={startX} y2={totalX_Y} stroke="#10b981" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.3" />
                            <line x1={txEnd} y1={startY + rectH + EXTENSION_GAP} x2={txEnd} y2={totalX_Y} stroke="#10b981" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.3" />
                        </g>
                    );

                    // 2. Vertical Dimensions (Y-Axis)
                    const yItems: { start: number; end: number; size: number; id: string; showLabel: boolean }[] = [];
                    openings.forEach(op => {
                        const b = op.fromTop ?? (op as any).vanafBoven ?? op.fromBottom ?? 0;
                        const h = op.length ?? (op as any).lengte ?? op.height ?? 0;
                        const exists = yItems.find(i => Math.abs(i.start - b) < 1 && Math.abs(i.size - h) < 1);
                        if (!exists) {
                            const hideLabel = h > 600 || hasManyOpenings;
                            yItems.push({ start: b, end: b + h, size: h, id: op.id, showLabel: !hideLabel });
                        }
                    });

                    const yTracks = packTracks(yItems);

                    yTracks.forEach((track, trackIdx) => {
                        const tierX = startX - DIM_BASE_OFFSET - (trackIdx * DIM_TRACK_STEP);
                        let currentTop = 0;

                        track.forEach((item, itemIdx) => {
                            // Gap Segment
                            if (item.start > currentTop) {
                                const gap = item.start - currentTop;
                                const y1 = startY + (currentTop * pxPerMmH);
                                const y2 = startY + (item.start * pxPerMmH);
                                const mid = (y1 + y2) / 2;

                                elements.push(
                                    <g key={`dim-y-gap-${trackIdx}-${itemIdx}`}>
                                        <line x1={tierX} y1={y1} x2={tierX} y2={y2} stroke="#10b981" strokeWidth="0.5" />
                                        {drawTick(tierX, y1)}
                                        {drawTick(tierX, y2)}
                                        <g transform={`translate(${tierX}, ${mid}) rotate(-90)`}>
                                            <rect x="-12" y="-5" width="24" height="10" fill="#09090b" />
                                            <text textAnchor="middle" dominantBaseline="middle" fill="#10b981" fontSize={10} style={{ fontFamily: 'monospace' }}>
                                                {Math.round(gap)}
                                            </text>
                                        </g>
                                        {itemIdx === 0 && (
                                            <line x1={startX - EXTENSION_GAP} y1={y1} x2={tierX} y2={y1} stroke="#10b981" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.5" />
                                        )}
                                    </g>
                                );
                            }

                            // Item Segment
                            const iy1 = startY + (item.start * pxPerMmH);
                            const iy2 = startY + (item.end * pxPerMmH);
                            const imid = (iy1 + iy2) / 2;

                            elements.push(
                                <g key={`dim-y-item-${trackIdx}-${itemIdx}`}>
                                    <line x1={tierX} y1={iy1} x2={tierX} y2={iy2} stroke="#10b981" strokeWidth="0.5" />
                                    {drawTick(tierX, iy2)}
                                    {item.showLabel && (
                                        <g transform={`translate(${tierX}, ${imid}) rotate(-90)`}>
                                            <rect x="-12" y="-5" width="24" height="10" fill="#09090b" />
                                            <text textAnchor="middle" dominantBaseline="middle" fill="#10b981" fontSize={10} style={{ fontFamily: 'monospace' }}>
                                                {Math.round(item.size)}
                                            </text>
                                        </g>
                                    )}
                                    <line x1={startX - EXTENSION_GAP} y1={iy1} x2={tierX} y2={iy1} stroke="#10b981" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.5" />
                                    <line x1={startX - EXTENSION_GAP} y1={iy2} x2={tierX} y2={iy2} stroke="#10b981" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.5" />
                                </g>
                            );
                            currentTop = item.end;
                        });

                        // Final Gap to End
                        if (currentTop < inputH) {
                            const rem = inputH - currentTop;
                            const ry1 = startY + (currentTop * pxPerMmH);
                            const ry2 = startY + (inputH * pxPerMmH);
                            const rmid = (ry1 + ry2) / 2;

                            elements.push(
                                <g key={`dim-y-end-${trackIdx}`}>
                                    <line x1={tierX} y1={ry1} x2={tierX} y2={ry2} stroke="#10b981" strokeWidth="0.5" />
                                    {drawTick(tierX, ry2)}
                                    <g transform={`translate(${tierX}, ${rmid}) rotate(-90)`}>
                                        <rect x="-12" y="-5" width="24" height="10" fill="#09090b" />
                                        <text textAnchor="middle" dominantBaseline="middle" fill="#10b981" fontSize={10} style={{ fontFamily: 'monospace' }}>
                                            {Math.round(rem)}
                                        </text>
                                    </g>
                                    <line x1={startX - EXTENSION_GAP} y1={ry2} x2={tierX} y2={ry2} stroke="#10b981" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.5" />
                                </g>
                            );
                        }
                    });

                    // Total Y Dimension (Furthest Out)
                    const totalY_X = startX - DIM_BASE_OFFSET - ((yTracks.length) * DIM_TRACK_STEP);
                    const tyStart = startY;
                    const tyEnd = startY + rectH;
                    const tyMid = (tyStart + tyEnd) / 2;

                    elements.push(
                        <g key="dim-y-total">
                            <line x1={totalY_X} y1={tyStart} x2={totalY_X} y2={tyEnd} stroke="#10b981" strokeWidth="0.5" />
                            {drawTick(totalY_X, tyStart)}
                            {drawTick(totalY_X, tyEnd)}
                            <g transform={`translate(${totalY_X}, ${tyMid}) rotate(-90)`}>
                                <rect x="-20" y="-6" width="40" height="12" fill="#09090b" />
                                <text textAnchor="middle" dominantBaseline="middle" fill="#10b981" fontSize={12} fontWeight="bold" style={{ fontFamily: 'monospace' }}>
                                    {Math.round(inputH)}
                                </text>
                            </g>
                            <line x1={startX - EXTENSION_GAP} y1={tyStart} x2={totalY_X} y2={tyStart} stroke="#10b981" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.3" />
                            <line x1={startX - EXTENSION_GAP} y1={tyEnd} x2={totalY_X} y2={tyEnd} stroke="#10b981" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.3" />
                        </g>
                    );
                }

                elements.push(
                    <defs key="defs">
                        <clipPath id={clipId}>
                            <path d={outlinePath} />
                        </clipPath>
                    </defs>
                );

                // Render the shape outline (background/border)
                elements.push(
                    <path
                        key="shape-outline"
                        d={outlinePath}
                        stroke={structureColor}
                        strokeWidth="2"
                        fill="none"
                        opacity="0.3"
                    />
                );

                // MANDATORY U-Profile (Thicker Perimeter)
                elements.push(
                    <path
                        key="u-profile-perimeter"
                        d={outlinePath}
                        stroke={structureColor}
                        strokeWidth="4"
                        fill="none"
                        opacity="0.8"
                    />
                );

                // Render clipped content
                elements.push(
                    <g key="clipped-content" clipPath={`url(#${clipId})`}>
                        {clippedContent}
                    </g>
                );

                // All dimensions are now handled by BaseDrawingFrame

                return <>{elements}</>;
            }}
        </BaseDrawingFrame >
    );
}
