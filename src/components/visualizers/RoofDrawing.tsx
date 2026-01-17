import React from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';

export interface RoofOpening {
    id: string;
    type: 'dakraam' | 'schoorsteen' | 'opening'; // Skylight, chimney, or other opening
    width: number;
    height: number;
    fromLeft: number;
    fromBottom: number;
}

export interface RoofDrawingProps {
    lengte: string | number;
    hoogte?: string | number;
    // Sloped / Gable props
    shape?: 'rectangle' | 'slope' | 'gable' | 'l-shape' | 'u-shape';
    hoogteLinks?: string | number;
    hoogteRechts?: string | number;
    hoogteNok?: string | number;
    // L-Shape / U-Shape specific
    lengte1?: string | number;
    hoogte1?: string | number;
    lengte2?: string | number;
    hoogte2?: string | number;
    lengte3?: string | number;
    hoogte3?: string | number;
    // Variant
    variant?: 'top' | 'bottom';

    balkafstand: string | number;
    latafstand?: string | number; // Optional secondary spacing (rachel/vertical battens)
    openings?: RoofOpening[];
    className?: string;
    onOpeningsChange?: (newOpenings: RoofOpening[]) => void;
    fitContainer?: boolean;
    isMagnifier?: boolean;
    startFromRight?: boolean;
}

export function RoofDrawing({
    lengte,
    hoogte,
    shape = 'rectangle',
    hoogteLinks,
    hoogteRechts,
    hoogteNok,
    lengte1,
    hoogte1,
    lengte2,
    hoogte2,
    lengte3,
    hoogte3,
    variant = 'top',
    balkafstand,
    latafstand,
    openings = [],
    className,
    onOpeningsChange,
    fitContainer,
    isMagnifier,
    startFromRight
}: RoofDrawingProps) {
    const lengteNum = typeof lengte === 'number' ? lengte : parseFloat(String(lengte)) || 0;
    const heightNum = typeof hoogte === 'number' ? hoogte : parseFloat(String(hoogte)) || 0;
    const balkafstandNum = typeof balkafstand === 'number' ? balkafstand : parseFloat(String(balkafstand)) || 0;
    const latafstandNum = typeof latafstand === 'number' ? latafstand : parseFloat(String(latafstand)) || 0;

    // Resolve heights based on shape
    let hLeft = heightNum;
    let hRight = heightNum;
    let hPeak = 0; // For gable

    // L-Shape / U-Shape specific vars
    let h1 = 0;
    let h2 = 0;
    let h3 = 0;
    let l1 = 0;
    let l2 = 0;
    let l3 = 0;

    let effectiveHeight = heightNum;

    if (shape === 'slope') {
        hLeft = typeof hoogteLinks === 'number' ? hoogteLinks : parseFloat(String(hoogteLinks)) || 0;
        hRight = typeof hoogteRechts === 'number' ? hoogteRechts : parseFloat(String(hoogteRechts)) || 0;
        effectiveHeight = Math.max(hLeft, hRight);
    } else if (shape === 'gable') {
        hLeft = heightNum;
        hRight = heightNum;
        hPeak = typeof hoogteNok === 'number' ? hoogteNok : parseFloat(String(hoogteNok)) || 0;
        effectiveHeight = hPeak || heightNum;
    } else if (shape === 'l-shape' || shape === 'u-shape') {
        h1 = typeof hoogte1 === 'number' ? hoogte1 : parseFloat(String(hoogte1)) || 0;
        h2 = typeof hoogte2 === 'number' ? hoogte2 : parseFloat(String(hoogte2)) || 0;
        h3 = typeof hoogte3 === 'number' ? hoogte3 : parseFloat(String(hoogte3)) || 0;

        l1 = typeof lengte1 === 'number' ? lengte1 : parseFloat(String(lengte1)) || 0;
        l2 = typeof lengte2 === 'number' ? lengte2 : parseFloat(String(lengte2)) || 0;
        l3 = typeof lengte3 === 'number' ? lengte3 : parseFloat(String(lengte3)) || 0;

        if (shape === 'l-shape') effectiveHeight = Math.max(h1, h2);
        else effectiveHeight = Math.max(h1, h2, h3);
    }

    // Determine height labels
    let hLabelLeft = effectiveHeight > 0 ? `${effectiveHeight}` : '---';
    let hLabelRight: string | undefined = undefined;

    if (shape === 'slope') {
        hLabelLeft = `${hLeft || '---'}`;
        hLabelRight = `${hRight || '---'}`;
    } else if (shape === 'gable') {
        hLabelLeft = `${hLeft || '---'}`;
        hLabelRight = `${hRight || '---'}`;
    } else if (shape === 'l-shape') {
        hLabelLeft = `${h1 || '---'}`;
        hLabelRight = `${h2 || '---'}`;
    } else if (shape === 'u-shape') {
        hLabelLeft = `${h1 || '---'}`;
        hLabelRight = `${h3 || '---'}`;
    }

    // State for drag
    const [draggingId, setDraggingId] = React.useState<string | null>(null);
    const dragStartRef = React.useRef<{ x: number; y: number; opId: string; origLeft: number; origBottom: number } | null>(null);
    const metricsRef = React.useRef<any>(null);

    const handlePointerDown = (e: React.PointerEvent, op: RoofOpening) => {
        if (!onOpeningsChange) return;
        if (isMagnifier) return;
        e.preventDefault();
        e.stopPropagation();
        (e.target as Element).setPointerCapture(e.pointerId);
        setDraggingId(op.id);

        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            opId: op.id,
            origLeft: op.fromLeft,
            origBottom: op.fromBottom
        };
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!draggingId || !dragStartRef.current || !onOpeningsChange) return;

        const pxPerMm = metricsRef.current?.pxPerMm || 1;
        const start = dragStartRef.current;

        const dxPx = e.clientX - start.x;
        const dyPx = e.clientY - start.y;

        const dxMm = dxPx / pxPerMm;
        const dyMm = -(dyPx / pxPerMm); // Up is positive MM, Down is positive Pixels in screen, but Up is positive in math

        let newLeft = Math.round(start.origLeft + dxMm);
        let newBottom = Math.round(start.origBottom + dyMm);

        const updatedOpenings = openings.map(o => {
            if (o.id === draggingId) {
                let finalBottom = newBottom;

                // Sticky bottom for schoorsteenen and some opening types
                if (o.type === 'schoorsteen' || o.type === 'opening') { // Chimneys go to floor/base
                    if (Math.abs(finalBottom) < 100) { // Snap within 100mm
                        finalBottom = 0;
                    }
                }
                return { ...o, fromLeft: newLeft, fromBottom: finalBottom };
            }
            return o;
        });

        onOpeningsChange(updatedOpenings);
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
            width={lengteNum}
            height={effectiveHeight}
            primarySpacing={balkafstandNum}
            secondarySpacing={latafstandNum}
            widthLabel={lengteNum > 0 ? `${lengteNum}` : '---'}
            heightLabel={hLabelLeft}
            rightHeightLabel={hLabelRight}
            gridLabel={!balkafstandNum && !latafstandNum ? 'Dak Vlak' : undefined}
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
                // Standardize scale
                const pxPerMmW = pxPerMm;
                const pxPerMmH = pxPerMm;

                const elements: React.ReactNode[] = [];
                const inputW = lengteNum || 2400;
                const inputH = effectiveHeight || 2400;

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
                    if (variant === 'bottom') {
                        // Slope bottom: Top is flat, bottom varies
                        const yTop = startY;
                        // Let's reuse Ceiling Logic exactly.
                        const yBL_pos = startY + (hLeft * pxPerMmH);
                        const yBR_pos = startY + (hRight * pxPerMmH);
                        outlinePath = `
                            M ${startX} ${yTop}
                            L ${startX + rectW} ${yTop}
                            L ${startX + rectW} ${yBR_pos}
                            L ${startX} ${yBL_pos}
                            Z
                        `;
                    } else {
                        // Slope top: Bottom is flat, top varies
                        const yBot = startY + rectH;
                        const yTL = yBot - (hLeft * pxPerMmH);
                        const yTR = yBot - (hRight * pxPerMmH);
                        outlinePath = `
                            M ${startX} ${yTL}
                            L ${startX + rectW} ${yTR}
                            L ${startX + rectW} ${yBot}
                            L ${startX} ${yBot}
                            Z
                        `;
                    }
                } else if (shape === 'gable') {
                    // Gable / Pitched
                    const midX = startX + rectW / 2;
                    const yBot = startY + rectH;
                    const ySide = yBot - (hLeft * pxPerMmH); // Eaves
                    // For gable, hLeft = hRight usually.
                    const yPeakPos = yBot - (hPeak * pxPerMmH);

                    if (variant === 'bottom') {
                        // Inverted Gable?
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
                    // L-Shaped
                    const l1Px = l1 * pxPerMmW;
                    // h1 is Height of Left part.
                    // h2 is Height of Right part.

                    const yBot = startY + rectH;
                    const yH1 = yBot - (h1 * pxPerMmH);
                    const yH2 = yBot - (h2 * pxPerMmH);
                    const xL1 = startX + l1Px;

                    if (variant === 'bottom') {
                        // Step at bottom
                        const yTop = startY;
                        const yB1 = startY + (h1 * pxPerMmH);
                        const yB2 = startY + (h2 * pxPerMmH);
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
                    // U-Shaped
                    const l1Px = l1 * pxPerMmW;
                    const l2Px = l2 * pxPerMmW;
                    const h1Px = h1 * pxPerMmH;
                    const h2Px = h2 * pxPerMmH;
                    const h3Px = h3 * pxPerMmH;

                    const yBot = startY + rectH;
                    const yH1 = yBot - h1Px;
                    const yH2 = yBot - h2Px;
                    const yH3 = yBot - h3Px;
                    const xL1 = startX + l1Px;
                    const xL2 = startX + l1Px + l2Px;

                    if (variant === 'bottom') {
                        // Step at bottom
                        const yTop = startY;
                        // Be careful with coordinates. startY is top.
                        // If height is h1, then bottom point is startY + h1
                        const yB1 = startY + h1Px;
                        const yB2 = startY + h2Px;
                        const yB3 = startY + h3Px;

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

                // ============================================================
                // Helper: Get Y position at given X (for beam clipping)
                // ============================================================
                // "Top" in Roof means Physically High Y. But in SVG Y=0 is Top.
                // So "Roof Top" is Low Y in SVG.
                // "Roof Bottom" is High Y in SVG (usually yBot = startY + rectH).

                const getRoofTopSVG = (xPx: number): number => {
                    const ratio = (xPx - startX) / rectW;
                    const xMm = ratio * inputW;

                    if (shape === 'slope') {
                        if (variant === 'bottom') return startY;
                        else {
                            // Top varies
                            // hAtX.
                            const hAtX = hLeft + (hRight - hLeft) * ratio;
                            return (startY + rectH) - (hAtX * pxPerMmH);
                        }
                    } else if (shape === 'gable') {
                        if (variant === 'bottom') return startY;
                        else {
                            const midRatio = 0.5;
                            if (ratio <= midRatio) {
                                const hAtX = hLeft + (hPeak - hLeft) * (ratio / midRatio);
                                return (startY + rectH) - (hAtX * pxPerMmH);
                            } else {
                                const hAtX = hPeak + (hRight - hPeak) * ((ratio - midRatio) / midRatio);
                                return (startY + rectH) - (hAtX * pxPerMmH);
                            }
                        }
                    } else if (shape === 'l-shape') {
                        if (variant === 'bottom') return startY;
                        else {
                            // Step.
                            return xMm <= l1
                                ? (startY + rectH) - (h1 * pxPerMmH)
                                : (startY + rectH) - (h2 * pxPerMmH);
                        }
                    } else if (shape === 'u-shape') {
                        if (variant === 'bottom') return startY;
                        else {
                            if (xMm <= l1) return (startY + rectH) - (h1 * pxPerMmH);
                            if (xMm <= l1 + l2) return (startY + rectH) - (h2 * pxPerMmH);
                            return (startY + rectH) - (h3 * pxPerMmH);
                        }
                    }

                    return startY; // Rectangle Top
                };

                const getRoofBottomSVG = (xPx: number): number => {
                    // Usually Bottom is Flat at startY + rectH
                    if (variant !== 'bottom') return startY + rectH;

                    const ratio = (xPx - startX) / rectW;
                    const xMm = ratio * inputW;

                    if (shape === 'slope') {
                        const hAtX = hLeft + (hRight - hLeft) * ratio;
                        return startY + (hAtX * pxPerMmH);
                    } else if (shape === 'gable') {
                        // ... same logic for bottom variants ...
                        const midRatio = 0.5;
                        if (ratio <= midRatio) {
                            const hAtX = hLeft + (hPeak - hLeft) * (ratio / midRatio);
                            return startY + (hAtX * pxPerMmH);
                        } else {
                            const hAtX = hPeak + (hRight - hPeak) * ((ratio - midRatio) / midRatio);
                            return startY + (hAtX * pxPerMmH);
                        }
                    } else if (shape === 'l-shape') {
                        return xMm <= l1
                            ? startY + (h1 * pxPerMmH)
                            : startY + (h2 * pxPerMmH);
                    } else if (shape === 'u-shape') {
                        if (xMm <= l1) return startY + (h1 * pxPerMmH);
                        if (xMm <= l1 + l2) return startY + (h2 * pxPerMmH);
                        return startY + (h3 * pxPerMmH);
                    }

                    return startY + rectH;
                };

                // ============================================================
                // CLIP PATH DEFINITION
                // ============================================================
                const clipId = `roof-clip-${React.useId().replace(/:/g, '')}`;

                // ============================================================
                // RENDER BEAMS & RACHELS
                // ============================================================

                const clippedContent: React.ReactNode[] = [];
                const structureColor = "rgb(70, 75, 85)";
                const rachelColor = "rgb(70, 75, 85)";

                const beamCentersForDims: number[] = [];

                // 1. BEAMS (TENGELS - Vertical)
                if (balkafstandNum > 0) {
                    const BEAM_WIDTH_MM = 50; // Tengel
                    const beamStroke = Math.max(1.5, BEAM_WIDTH_MM * pxPerMmW);
                    const beamHalfWidth = beamStroke / 2;
                    const spacingPx = balkafstandNum * pxPerMmW;

                    // First & Last Edge Beams
                    const firstEdgeX = startX + beamHalfWidth;
                    const lastEdgeX = startX + rectW - beamHalfWidth;

                    // Helper to add beam
                    const addBeam = (x: number, key: string) => {
                        const yt = getRoofTopSVG(x);
                        const yb = getRoofBottomSVG(x);
                        clippedContent.push(
                            <line
                                key={key}
                                x1={x} y1={yt}
                                x2={x} y2={yb}
                                stroke={structureColor}
                                strokeWidth={beamStroke}
                                opacity="0.5"
                            />
                        );
                    };

                    addBeam(firstEdgeX, 'beam-edge-first');
                    addBeam(lastEdgeX, 'beam-edge-last');

                    // H.O.H
                    let beamIndex = 1;
                    if (startFromRight) {
                        // Start measuring from Right Wall (not beam center)
                        const rightWall = startX + rectW;
                        let cx = rightWall - spacingPx;

                        // Loop until we hit the first edge beam (or close to it)
                        // We do not want to overlap the first edge beam (firstEdgeX)
                        while (cx > firstEdgeX + 1) { // Tolerance
                            addBeam(cx, `beam-${beamIndex}`);
                            beamCentersForDims.push(cx);
                            cx -= spacingPx;
                            beamIndex++;
                        }
                    } else {
                        // Start measuring from Left Wall (startX)
                        // Logic: First HOH beam is at startX + spacing
                        let cx = startX + spacingPx;

                        // Loop until we hit the last edge beam
                        while (cx < lastEdgeX - 1) { // Tolerance
                            addBeam(cx, `beam-${beamIndex}`);
                            beamCentersForDims.push(cx);
                            cx += spacingPx;
                            beamIndex++;
                        }
                    }
                    beamCentersForDims.sort((a, b) => a - b);
                }

                // 2. RACHELS (Horizontal Lines) - THE CRITICAL PART
                if (latafstandNum > 0) {
                    const RACHEL_WIDTH_MM = 50;
                    const rachelHeightPx = RACHEL_WIDTH_MM * pxPerMmH;
                    const halfRachel = rachelHeightPx / 2;
                    const spacingPx = latafstandNum * pxPerMmH;

                    const rStartX = startX;
                    const rEndX = startX + rectW;

                    // We cover entire bounding box vertically
                    const topBoundY = startY;
                    const bottomBoundY = startY + rectH;

                    let curY = topBoundY + spacingPx;
                    // Adjust start to prevent overlap/bad loop
                    if (curY < topBoundY) curY = topBoundY + spacingPx;

                    let rachelIndex = 0;

                    // Force a safety limit
                    const MAX_LOOPS = 1000;
                    let safety = 0;

                    // Draw loop
                    while (curY < bottomBoundY && safety < MAX_LOOPS) {
                        clippedContent.push(
                            <g key={`rachel-${rachelIndex}`}>
                                <line x1={rStartX} y1={curY - halfRachel} x2={rEndX} y2={curY - halfRachel} stroke={rachelColor} strokeWidth="1" strokeDasharray="4 2" opacity="1.0" />
                                <line x1={rStartX} y1={curY + halfRachel} x2={rEndX} y2={curY + halfRachel} stroke={rachelColor} strokeWidth="1" strokeDasharray="4 2" opacity="1.0" />
                            </g>
                        );
                        curY += spacingPx;
                        rachelIndex++;
                        safety++;
                    }
                }

                // 3. OPENINGS
                if (openings.length > 0) {
                    // We need to render the opening structural details AND the dimensions.
                    // Dimensions go OUTSIDE the clip path. Structural details go INSIDE.

                    const openingDimensions: React.ReactNode[] = [];

                    openings.forEach((op, i) => {
                        const wRaw = op.width;
                        const hRaw = op.height;
                        const xRaw = op.fromLeft;
                        const bRaw = op.fromBottom; // fromBottom is distance FROM FLOOR (Y_BOTTOM)

                        // Convert to SVG coords.
                        // Y axis is inverted.
                        // Roof Bottom is at startY + rectH (visually floor level for top variant)
                        // So svgY = (startY + rectH) - bRaw - hRaw * px
                        // BUT: Usually for Roofs, "fromBottom" means to the BOTTOM of the opening?
                        // "SparingBottom = FloorY - fromBottom".
                        // OpeningTop = SparingBottom - Height.
                        // Let's assume standard intuitive logic:
                        // A window at "1000mm from bottom" starts at 1000mm up from the floor.
                        // So bottom edge of window is at Floor - 1000.
                        const yFloor = startY + rectH;
                        const yWindowBottom = yFloor - (bRaw * pxPerMmH); // Bottom edge of window in SVG
                        const yWindowTop = yWindowBottom - (hRaw * pxPerMmH); // Top edge of window in SVG

                        const displayX = startX + (xRaw * pxPerMmW);
                        const displayY = yWindowTop;
                        const displayW = wRaw * pxPerMmW;
                        const displayH = hRaw * pxPerMmH;

                        const framingWidth = Math.max(1.5, 50 * pxPerMmW); // 50mm framing
                        const halfFrame = framingWidth / 2;

                        // Add to clipped content (Structure inside the roof)
                        clippedContent.push(
                            <g key={`op-${op.id}`} onPointerDown={(e) => handlePointerDown(e, op)} style={{ cursor: onOpeningsChange ? 'move' : 'default' }}>
                                {/* Mask covers the opening area to hide beams behind it */}
                                <rect
                                    x={displayX - framingWidth} y={displayY - framingWidth}
                                    width={displayW + (framingWidth * 2)} height={displayH + (framingWidth * 2)}
                                    fill="#09090b" opacity={draggingId === op.id ? 0.7 : 1}
                                />

                                {/* 4-Part Framing (Headers & Trimmers) */}
                                {/* Top Header */}
                                <line x1={displayX - framingWidth} y1={displayY - halfFrame} x2={displayX + displayW + framingWidth} y2={displayY - halfFrame} stroke={structureColor} strokeWidth={framingWidth} opacity="0.5" />
                                {/* Bottom Header */}
                                <line x1={displayX - framingWidth} y1={displayY + displayH + halfFrame} x2={displayX + displayW + framingWidth} y2={displayY + displayH + halfFrame} stroke={structureColor} strokeWidth={framingWidth} opacity="0.5" />
                                {/* Left Trimmer */}
                                <line x1={displayX - halfFrame} y1={displayY} x2={displayX - halfFrame} y2={displayY + displayH} stroke={structureColor} strokeWidth={framingWidth} opacity="0.5" />
                                {/* Right Trimmer */}
                                <line x1={displayX + displayW + halfFrame} y1={displayY} x2={displayX + displayW + halfFrame} y2={displayY + displayH} stroke={structureColor} strokeWidth={framingWidth} opacity="0.5" />

                                {/* Cross */}
                                <line x1={displayX} y1={displayY} x2={displayX + displayW} y2={displayY + displayH} stroke={structureColor} strokeWidth="1" />
                                <line x1={displayX + displayW} y1={displayY} x2={displayX} y2={displayY + displayH} stroke={structureColor} strokeWidth="1" />

                                {/* Corner Dots (Inside - Anchors for measurements) */}
                                <circle cx={displayX + 1} cy={displayY + 1} r="1" fill={structureColor} />
                                <circle cx={displayX + displayW - 1} cy={displayY + 1} r="1" fill={structureColor} />
                                <circle cx={displayX + 1} cy={displayY + displayH - 1} r="1" fill={structureColor} />
                                <circle cx={displayX + displayW - 1} cy={displayY + displayH - 1} r="1" fill={structureColor} />

                                {/* Labels (Center) */}
                                <text
                                    x={displayX + displayW / 2} y={displayY + displayH / 2 - 5}
                                    textAnchor="middle" fill="white" fontSize={10} opacity={0.9}
                                    style={{ fontFamily: 'monospace', fontWeight: 'bold', pointerEvents: 'none' }}
                                >
                                    {{ 'opening': 'Sparing', 'dakraam': 'Dakraam', 'schoorsteen': 'Schoorsteen' }[op.type] || op.type}
                                </text>
                                <text
                                    x={displayX + displayW / 2} y={displayY + displayH / 2 + 10}
                                    textAnchor="middle" fill="white" fontSize={9} opacity={0.7}
                                    style={{ fontFamily: 'monospace', pointerEvents: 'none' }}
                                >
                                    {Math.round(wRaw)} x {Math.round(hRaw)}
                                </text>
                            </g>
                        );
                    });

                    // Dimensions (Outside the roof)
                    // ============================================================
                    // DIMENSIONS (Tiered Architectural System)
                    // ============================================================

                    // Configuration
                    const DIM_BASE_OFFSET = 20; // Base distance from roof
                    const DIM_TRACK_STEP = 30;  // Step between tiers
                    const EXTENSION_GAP = 5;    // "Air gap" from roof edge

                    // Helper for standard dots
                    const drawTick = (tx: number, ty: number, color: string = "#10b981", isVertical: boolean = false) => {
                        return <circle cx={tx} cy={ty} r="1.5" fill={color} />;
                    };

                    // Helper to pack intervals into tracks
                    const packTracks = (items: { start: number; end: number; size: number; id: string; showLabel: boolean }[]) => {
                        // Sort by start position
                        const sorted = [...items].sort((a, b) => a.start - b.start);
                        const tracks: typeof items[] = [];

                        sorted.forEach(item => {
                            let placed = false;
                            for (const track of tracks) {
                                const lastItem = track[track.length - 1];
                                // Strict non-overlap
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

                    // 1. Horizontal Dimensions (X-Axis) ==========================
                    const xItems: { start: number; end: number; size: number; id: string; showLabel: boolean }[] = [];
                    openings.forEach(op => {
                        const x = op.fromLeft;
                        const w = op.width;
                        const exists = xItems.find(i => Math.abs(i.start - x) < 1 && Math.abs(i.size - w) < 1);
                        if (!exists) {
                            const hideLabel = w > 600 || hasManyOpenings;
                            xItems.push({ start: x, end: x + w, size: w, id: op.id, showLabel: !hideLabel });
                        }
                    });

                    // TIER 2+: Component Chains
                    const xTracks = packTracks(xItems);

                    // Render Tracks (Chains)
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
                                        {/* Extension Lines with Air Gap */}
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

                    // TIER 1: Total Dimension (Furthest Out)
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
                            {/* Extensions for Total */}
                            <line x1={startX} y1={startY + rectH + EXTENSION_GAP} x2={startX} y2={totalX_Y} stroke="#10b981" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.3" />
                            <line x1={txEnd} y1={startY + rectH + EXTENSION_GAP} x2={txEnd} y2={totalX_Y} stroke="#10b981" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.3" />
                        </g>
                    );


                    // 2. Vertical Dimensions (Y-Axis) ============================
                    const yItems: { start: number; end: number; size: number; id: string; showLabel: boolean }[] = [];
                    openings.forEach(op => {
                        const b = op.fromBottom;
                        const h = op.height;
                        const exists = yItems.find(i => Math.abs(i.start - b) < 1 && Math.abs(i.size - h) < 1);
                        if (!exists) {
                            const hideLabel = h > 600 || hasManyOpenings;
                            yItems.push({ start: b, end: b + h, size: h, id: op.id, showLabel: !hideLabel });
                        }
                    });

                    // TIER 2+: Component Chains
                    const yTracks = packTracks(yItems);

                    yTracks.forEach((track, trackIdx) => {
                        const tierX = startX - DIM_BASE_OFFSET - (trackIdx * DIM_TRACK_STEP);
                        let currentBottom = 0;

                        track.forEach((item, itemIdx) => {
                            // Gap Segment
                            if (item.start > currentBottom) {
                                const gap = item.start - currentBottom;
                                const y1 = (startY + rectH) - (currentBottom * pxPerMmH);
                                const y2 = (startY + rectH) - (item.start * pxPerMmH);
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
                            const iy1 = (startY + rectH) - (item.start * pxPerMmH);
                            const iy2 = (startY + rectH) - (item.end * pxPerMmH);
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
                            currentBottom = item.end;
                        });

                        // Final Gap
                        if (currentBottom < inputH) {
                            const rem = inputH - currentBottom;
                            const ry1 = (startY + rectH) - (currentBottom * pxPerMmH);
                            const ry2 = (startY + rectH) - (inputH * pxPerMmH);
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

                    // TIER 1: Total Y Dimension (Furthest Out)
                    const totalY_X = startX - DIM_BASE_OFFSET - ((yTracks.length) * DIM_TRACK_STEP);
                    const tyStart = startY + rectH;
                    const tyEnd = startY; // Top of roof
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
                            {/* Extensions */}
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

                // Render clipped content
                elements.push(
                    <g key="clipped-content" clipPath={`url(#${clipId})`}>
                        {clippedContent}
                    </g>
                );

                return <>{elements}</>;
            }
            }
        </BaseDrawingFrame>
    );
}

export default RoofDrawing;
