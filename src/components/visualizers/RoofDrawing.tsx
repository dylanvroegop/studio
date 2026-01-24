import React from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';
import { OverallDimensions, GridMeasurements } from './shared/measurements';
import { OpeningMeasurements } from './shared/measurements/OpeningMeasurements';
import { calculateGridGaps } from './shared/framing-utils';
import { useDraggableOpenings } from './shared/useDraggableOpenings';
import { OpeningLabels } from './shared/OpeningLabels';

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
    title?: string;
    doubleEndBattens?: boolean;
    includeOuterBattens?: boolean;
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
    startFromRight,
    title = 'Dak Vlak',
    doubleEndBattens,
    includeOuterBattens
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
    const isBlank = lengteNum <= 0 || heightNum <= 0;

    let hLabelLeft = effectiveHeight > 0 ? `${effectiveHeight}` : '---';
    let hLabelRight: string | undefined = undefined;

    if (shape === 'slope') {
        hLabelLeft = hLeft > 0 ? `${hLeft}` : '---';
        hLabelRight = hRight > 0 ? `${hRight}` : '---';
    } else if (shape === 'gable') {
        hLabelLeft = hLeft > 0 ? `${hLeft}` : '---';
        hLabelRight = hRight > 0 ? `${hRight}` : '---';
    } else if (shape === 'l-shape') {
        hLabelLeft = h1 > 0 ? `${h1}` : '---';
        hLabelRight = h2 > 0 ? `${h2}` : '---';
    } else if (shape === 'u-shape') {
        hLabelLeft = h1 > 0 ? `${h1}` : '---';
        hLabelRight = h3 > 0 ? `${h3}` : '---';
    }

    // State for drag
    const metricsRef = React.useRef<any>(null);
    const pxPerMmRef = React.useRef(1); // Helper to avoid prop drilling loop if possible, or just use metricsRef

    // Use Shared Hook
    const { draggingId, handlePointerDown, handlePointerMove, handlePointerUp } = useDraggableOpenings({
        openings,
        onOpeningsChange,
        pxPerMm: metricsRef.current?.pxPerMm || 1,
        isMagnifier
    });

    // Calculate M2
    const areaStats = React.useMemo(() => {
        let areaMm2 = 0;
        const L = lengteNum;
        const H = effectiveHeight;

        if (shape === 'rectangle') areaMm2 = L * H;
        else if (shape === 'slope') {
            // Slope: L * avg(hL, hR)
            areaMm2 = L * ((hLeft + hRight) / 2);
        } else if (shape === 'gable') {
            // Gable: L * avg(hL, hRight) ? No, Gable has peak.
            // Usually symmetric: L * (hSide + hPeak)/2 is correct for symmetric.
            // If asymmetric, it's (L * hLeft + L * hRight)/2 + Triangles?
            // Actually, for prism volume: Base Area * Length? No this is Surface Area.
            // Surface Area of Gable Roof Face: 
            // Wait, "RoofDrawing" is visualizing the *Top Down* or *Face* view?
            // It visualizes a "Vlak" (Face).
            // So if it's a Gable roof FACE, it's usually a rectangle (Length x SlopedLength).
            // BUT our input fields are usually projected measurements?
            // "Hoogte Nok" and "Hoogte Goots".
            // If we are drawing the *projected* view (from top), area is Projected Area / cos(pitch).
            // BUT: Users typically input the *actual* dimensions of the flat plane for the drawing?
            // "Lengte" and "Hoogte".
            // If "Hoogte" is the sloped height, then Area = L * H.
            // IF however the shape implies variable height (like a wall), then we use the wall logic.
            // The "RoofDrawing" seems to treat it as a Wall-like projection (beams vertical).
            // So we stick to the Wall logic for area calculation consistency.
            areaMm2 = L * ((hLeft + hPeak) / 2);
        } else if (shape === 'l-shape') {
            areaMm2 = (l1 * h1) + ((L - l1) * h2);
        } else if (shape === 'u-shape') {
            areaMm2 = (l1 * h1) + (l2 * h2) + ((L - l1 - l2) * h3);
        } else {
            areaMm2 = L * H;
        }

        const opArea = openings.reduce((acc, op) => acc + (op.width * op.height), 0);

        return {
            gross: areaMm2,
            net: Math.max(0, areaMm2 - opArea),
            hasOpenings: opArea > 0
        };
    }, [shape, lengteNum, effectiveHeight, hLeft, hRight, hPeak, l1, h1, h2, h3, l2, openings]);

    return (<BaseDrawingFrame
        areaStats={areaStats}
        width={lengteNum}
        height={effectiveHeight}
        primarySpacing={balkafstandNum}
        secondarySpacing={latafstandNum}
        widthLabel={lengteNum > 0 ? `${lengteNum}` : '---'}
        heightLabel={hLabelLeft}
        rightHeightLabel={hLabelRight}
        gridLabel={!balkafstandNum && !latafstandNum ? title : undefined}
        className={className}
        fitContainer={fitContainer}
        startFromRight={startFromRight}
        suppressTotalDimensions={true}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        // Fix: Pass simple drawingData to disable BaseDrawingFrame's legacy automatic dimensions
        // This prevents the "double numbers" effect, as we render our own specific dimensions below.
        drawingData={{
            walls: [], beams: [], openings: [], dimensions: [], params: {}
        }}
    >
        {(metrics) => {
            metricsRef.current = metrics;
            const { startX, startY, rectW, rectH, pxPerMm } = metrics;
            // Standardize scale
            const pxPerMmW = pxPerMm;
            const pxPerMmH = pxPerMm;

            // Calculate Frame
            const framing = calculateGridGaps({
                wallLength: lengteNum,
                spacing: balkafstandNum,
                startFromRight
            });

            // Convert MM Gaps to Screen Gaps for Visualizer
            // calculateGridGaps returns MM. GridMeasurements expects ... MM value and Screen Coords?
            // "c1" in GridMeasurements is SCREEN X.
            // framing.gaps has c1, c2 in MM relative to wall start.

            const gridGaps = framing.gaps.map(g => ({
                value: g.value,
                c1: startX + g.c1 * pxPerMmW,
                c2: startX + g.c2 * pxPerMmW
            }));

            const elements: React.ReactNode[] = [];
            const inputW = lengteNum || 2000; // Use fallback for internal calc
            const inputH = effectiveHeight || 2000;

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

                // Default: Start one spacing down (inner)
                let curY = topBoundY + spacingPx;

                // If includeOuterBattens, start at Top (Ridge)
                if (includeOuterBattens) {
                    curY = topBoundY;
                }

                // Adjust start to prevent overlap/bad loop
                if (curY < topBoundY) curY = topBoundY;

                // Helper to draw rachel
                const drawRachel = (y: number, key: string) => {
                    clippedContent.push(
                        <g key={key}>
                            <line x1={rStartX} y1={y - halfRachel} x2={rEndX} y2={y - halfRachel} stroke={rachelColor} strokeWidth="1" strokeDasharray="4 2" opacity="1.0" />
                            <line x1={rStartX} y1={y + halfRachel} x2={rEndX} y2={y + halfRachel} stroke={rachelColor} strokeWidth="1" strokeDasharray="4 2" opacity="1.0" />
                        </g>
                    );
                };

                // Standard Rachels
                let rachelIndex = 0;
                // Force a safety limit
                const MAX_LOOPS = 1000;
                let safety = 0;

                // For outer battens, we want to include the bottom edge (approx)
                const limitY = includeOuterBattens ? bottomBoundY + 1 : bottomBoundY;

                while (curY < limitY && safety < MAX_LOOPS) {
                    drawRachel(curY, `rachel-${rachelIndex}`);
                    curY += spacingPx;
                    rachelIndex++;
                    safety++;
                }

                // Double End Rachels Logic
                // Note: In RoofDrawing, we iterate DOWN screen Y.
                // Roof Top (Start) is at startY (approx).
                // Roof Bottom (End) is at startY + rectH.
                // We use MM offsets to calculate position.
                // Start Rachel = 0 + Width + HalfWidth? No, Standard logic starts at 0?
                // Visualizer above starts at topBoundY + spacingPx.
                // So First Edge is topBoundY + HalfWidth.

                // Let's assume user wants "Double Start" and "Double End" lines.
                // Start (Top): at topBoundY + (WIDTH + HALF_WIDTH)
                // End (Bottom): at bottomBoundY - (WIDTH + HALF_WIDTH)

                if (doubleEndBattens) {
                    const extraTopY = topBoundY + (rachelHeightPx * 1.5);
                    const extraBottomY = bottomBoundY - (rachelHeightPx * 1.5);

                    drawRachel(extraTopY, 'rachel-double-top');
                    drawRachel(extraBottomY, 'rachel-double-bottom');
                }

                // Special 22mm Bottom Rachel (Roof Specific)
                // This represents a "flipped" batten at the very bottom edge.
                const BOTTOM_RACHEL_MM = 22;
                const bRachelPx = BOTTOM_RACHEL_MM * pxPerMmH;
                const bRachelHalf = bRachelPx / 2;
                // Position centered so its bottom touches the floor (bottomBoundY)
                const bRachelY = bottomBoundY - bRachelHalf;

                clippedContent.push(
                    <g key="rachel-special-bottom">
                        <line x1={rStartX} y1={bRachelY - bRachelHalf} x2={rEndX} y2={bRachelY - bRachelHalf} stroke={rachelColor} strokeWidth="1" strokeDasharray="4 2" />
                        <line x1={rStartX} y1={bRachelY + bRachelHalf} x2={rEndX} y2={bRachelY + bRachelHalf} stroke={rachelColor} strokeWidth="1" strokeDasharray="4 2" />
                    </g>
                );
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

                    // Add to clipped content (Visuals only, no interaction here)
                    clippedContent.push(
                        <g key={`op-${op.id}`}>
                            {/* Mask covers the opening area to hide beams behind it */}
                            <rect
                                x={displayX} y={displayY}
                                width={displayW} height={displayH}
                                fill="#09090b" opacity={draggingId === op.id ? 0.7 : 1}
                            />

                            {/* Cross */}
                            <line x1={displayX} y1={displayY} x2={displayX + displayW} y2={displayY + displayH} stroke={structureColor} strokeWidth="1" />
                            <line x1={displayX + displayW} y1={displayY} x2={displayX} y2={displayY + displayH} stroke={structureColor} strokeWidth="1" />
                        </g>
                    );
                });
            }

            // ============================================================
            // UNIVERSAL MEASUREMENTS
            // ============================================================

            // ============================================================
            // INTERACTIVE OVERLAY (Invisible Hit Boxes)
            // ============================================================
            // ============================================================
            // INTERACTIVE OVERLAY (Visible Hit Boxes)
            // ============================================================
            const interactiveOverlays = openings.map(op => {
                const wRaw = op.width;
                const hRaw = op.height;
                const xRaw = op.fromLeft;
                const bRaw = op.fromBottom;

                const yFloor = startY + rectH;
                const yWindowBottom = yFloor - (bRaw * pxPerMmH);
                const yWindowTop = yWindowBottom - (hRaw * pxPerMmH);

                const displayX = startX + (xRaw * pxPerMmW);
                const displayY = yWindowTop;
                const displayW = wRaw * pxPerMmW;
                const displayH = hRaw * pxPerMmH;

                return (
                    <g
                        key={`op-${op.id}`}
                        onPointerDown={(e) => handlePointerDown(e, op)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        className={onOpeningsChange ? "cursor-move" : ""}
                        style={{ cursor: onOpeningsChange ? 'move' : 'default' }}
                    >
                        {/* Visible Rect (Hides beams + Interaction) */}
                        <rect
                            x={displayX}
                            y={displayY}
                            width={displayW}
                            height={displayH}
                            fill="#09090b"
                            stroke={draggingId === op.id ? "#10b981" : "rgb(55,60,70)"}
                            strokeWidth={draggingId === op.id ? 2 : 1}
                        />
                        {/* Cross */}
                        <line x1={displayX} y1={displayY} x2={displayX + displayW} y2={displayY + displayH} stroke="rgb(55,60,70)" strokeWidth="0.5" strokeDasharray="2,2" />
                        <line x1={displayX} y1={displayY + displayH} x2={displayX + displayW} y2={displayY} stroke="rgb(55,60,70)" strokeWidth="0.5" strokeDasharray="2,2" />

                        {/* Opening Labels (using universal component) */}
                        <OpeningLabels
                            centerX={displayX + displayW / 2}
                            centerY={displayY + displayH / 2}
                            typeName={{ 'opening': 'Sparing', 'dakraam': 'Dakraam', 'schoorsteen': 'Schoorsteen' }[op.type] || op.type}
                            width={wRaw}
                            height={hRaw}
                        />
                    </g>
                );
            });

            elements.push(
                <React.Fragment key="universal-measurements">
                    <OverallDimensions
                        wallLength={lengteNum}
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
                        openings={openings.map(op => ({
                            id: op.id,
                            width: op.width,
                            height: op.height,
                            fromLeft: op.fromLeft,
                            fromBottom: op.fromBottom,
                            type: op.type
                        }))}
                        wallLength={lengteNum}
                        wallHeight={effectiveHeight}
                        svgBaseX={startX}
                        svgBaseY={startY + rectH}
                        pxPerMm={pxPerMmW}
                    />
                </React.Fragment>
            );


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
                    strokeWidth="0.5"
                    fill="none"
                />
            );

            // Render clipped content
            elements.push(
                <g key="clipped-content" clipPath={`url(#${clipId})`}>
                    {clippedContent}
                </g>
            );

            // Render interactive overlays (Top Layer)
            if (interactiveOverlays.length > 0) {
                elements.push(
                    <g key="interactive-overlays">
                        {interactiveOverlays}
                    </g>
                );
            }

            return <>{elements}</>;
        }
        }
    </BaseDrawingFrame >
    );
}

export default RoofDrawing;
