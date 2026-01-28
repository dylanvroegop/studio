'use client';

import React, { useMemo, useRef } from 'react';
import { WallOpening, DrawingData } from '@/lib/drawing-types';
import { OpeningLabels } from './shared/OpeningLabels';
import { GridMeasurements, OpeningMeasurements, OverallDimensions, DimensionLine } from './shared/measurements';
import { BaseDrawingFrame } from './BaseDrawingFrame';

// Helper to remove undefined values for Firestore


export { type WallOpening };

export interface WallDrawingProps {
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
    openings?: WallOpening[];
    className?: string;
    onOpeningsChange?: (newOpenings: WallOpening[]) => void;
    fitContainer?: boolean;
    isMagnifier?: boolean;
    startFromRight?: boolean;
    onDataGenerated?: (data: DrawingData) => void;
    title?: string;
}

type RenderBeam = {
    x: number;
    y: number;
    w: number;
    h: number;
    type: string;
    xMm?: number;
    yMm?: number;
    hMm?: number;
};

type RenderGap = {
    value: number;
    c1: number;
    c2: number;
};

export function WallDrawing({
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
    openings = [],
    className,
    onOpeningsChange,
    fitContainer,
    isMagnifier,
    // startFromRight, // Unused
    // onDataGenerated, // Unused
    title
}: WallDrawingProps) {
    const lengteNum = typeof lengte === 'number' ? lengte : parseFloat(String(lengte)) || 0;
    const balkafstandNum = typeof balkafstand === 'number' ? balkafstand : parseFloat(String(balkafstand)) || 0;

    // Default standard height
    const hStd = typeof hoogte === 'number' ? hoogte : parseFloat(String(hoogte)) || 0;

    // Resolve heights based on shape
    let hLeft = hStd;
    let hRight = hStd;
    let hPeak = 0; // For gable

    // L-Shape / U-Shape specific vars
    let h1 = 0;
    let h2 = 0;
    let h3 = 0;
    let l1 = 0;
    let l2 = 0;
    let l3 = 0;

    // Extract detailed props for shapes
    if (shape === 'gable') {
        const hL = typeof hoogteLinks === 'number' ? hoogteLinks : parseFloat(String(hoogteLinks)) || 0;
        const hR = typeof hoogteRechts === 'number' ? hoogteRechts : parseFloat(String(hoogteRechts)) || 0;
        const hN = typeof hoogteNok === 'number' ? hoogteNok : parseFloat(String(hoogteNok)) || 0;

        hLeft = hL || hStd;
        hRight = hR || hStd;
        hPeak = hN || hStd + 500;
    } else if (shape === 'slope') {
        const hL = typeof hoogteLinks === 'number' ? hoogteLinks : parseFloat(String(hoogteLinks)) || 0;
        const hR = typeof hoogteRechts === 'number' ? hoogteRechts : parseFloat(String(hoogteRechts)) || 0;

        hLeft = hL || hStd;
        hRight = hR || hStd;
        hPeak = typeof hoogteNok === 'number' ? hoogteNok : parseFloat(String(hoogteNok)) || 0;
    } else if (shape === 'l-shape' || shape === 'u-shape') {
        h1 = typeof hoogte1 === 'number' ? hoogte1 : parseFloat(String(hoogte1)) || 0;
        h2 = typeof hoogte2 === 'number' ? hoogte2 : parseFloat(String(hoogte2)) || 0;
        h3 = typeof hoogte3 === 'number' ? hoogte3 : parseFloat(String(hoogte3)) || 0;

        l1 = typeof lengte1 === 'number' ? lengte1 : parseFloat(String(lengte1)) || 0;
        l2 = typeof lengte2 === 'number' ? lengte2 : parseFloat(String(lengte2)) || 0;
        l3 = typeof lengte3 === 'number' ? lengte3 : parseFloat(String(lengte3)) || 0;

        // Set maxH for scaling
        hLeft = h1;
        hRight = shape === 'l-shape' ? h2 : h3;
    }

    // Determine MAX Height for canvas scaling
    const heights = [hStd, hLeft, hRight, hPeak, h1, h2, h3];
    const maxH = Math.max(...heights);

    // Calculate effective dimensions for BaseDrawingFrame
    let effectiveLength = lengteNum;
    if (shape === 'l-shape') effectiveLength = l1 + l2;
    if (shape === 'u-shape') effectiveLength = l1 + l2 + l3;

    // Use maxH for height to Ensure room for highest point
    const drawingHeight = maxH;

    // Area Calculation (reused existing logic)
    const areaStats = useMemo(() => {
        const L = lengteNum;
        let areaMm2 = L * hStd;
        if (shape === 'slope') areaMm2 = L * ((hLeft + hRight) / 2);
        if (shape === 'gable') areaMm2 = L * ((hLeft + hPeak) / 2);
        if (shape === 'l-shape') areaMm2 = (l1 * h1) + ((L - l1) * h2);
        if (shape === 'u-shape') areaMm2 = (l1 * h1) + (l2 * h2) + ((L - l1 - l2) * h3);

        const openingsAreaMm2 = openings.reduce((acc, op) => acc + (op.width * op.height), 0);
        return {
            gross: areaMm2,
            net: Math.max(0, areaMm2 - openingsAreaMm2),
            hasOpenings: openingsAreaMm2 > 0
        };
    }, [lengteNum, hStd, shape, hLeft, hRight, hPeak, l1, h1, h2, l2, h3, openings]);

    // Internal Drag State
    const [draggingId, setDraggingId] = React.useState<string | null>(null);
    const dragStartRef = useRef<{ x: number; y: number; opId: string; origLeft: number; origBottom: number } | null>(null);

    // Pointer Handlers
    const metricsRef = useRef<{ pxPerMm: number } | null>(null);

    const handlePointerDown = (e: React.PointerEvent, op: WallOpening) => {
        if (isMagnifier) return;
        if (!onOpeningsChange) return;
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
        if (!draggingId || !dragStartRef.current || !onOpeningsChange || !metricsRef.current) return;

        const { pxPerMm } = metricsRef.current;
        const start = dragStartRef.current;

        const dxPx = e.clientX - start.x;
        const dyPx = e.clientY - start.y;

        const dxMm = dxPx / pxPerMm;
        const dyMm = -(dyPx / pxPerMm); // Up is positive MM

        const newLeft = Math.round(start.origLeft + dxMm);
        const newBottom = Math.round(start.origBottom + dyMm);

        const updatedOpenings = openings.map(o => {
            if (o.id === draggingId) {
                let finalBottom = newBottom;
                if (o.type === 'door' || o.type === 'door-frame' || o.type === 'opening') {
                    if (Math.abs(finalBottom) < 100) finalBottom = 0;
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
            width={effectiveLength}
            height={drawingHeight}
            areaStats={areaStats}
            className={className}
            fitContainer={fitContainer}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            widthLabel={lengteNum > 0 ? `${lengteNum}` : '---'}
            heightLabel={hStd > 0 ? `${hStd}` : '---'}
            primarySpacing={undefined} // Disable Base H.O.H
            gridLabel={!balkafstand ? 'Wand Vlak' : undefined}
            suppressTotalDimensions={true} // WallDrawing renders its own specific dims
        >
            {(ctx) => {
                metricsRef.current = ctx; // Capture for drag logic
                const { startX, startY, rectW, rectH, pxPerMm, SVG_HEIGHT } = ctx;

                // Mapped Coordinates (replacing WallDrawing's internal calcs)
                const WALL_X = startX;
                const WALL_WIDTH = rectW;
                const Y_BOTTOM = startY + rectH;

                const getY = (mm: number) => Y_BOTTOM - (mm * pxPerMm);

                // Helper: Get Wall Top Y (mm) at given X 
                const getWallTopMm = (xMm: number) => {
                    const ratio = xMm / lengteNum;
                    if (variant === 'bottom' && (shape === 'slope' || shape === 'l-shape' || shape === 'u-shape')) return maxH;
                    if (shape === 'slope') return hLeft + (hRight - hLeft) * ratio;
                    if (shape === 'gable') return ratio <= 0.5 ? hLeft + (hPeak - hLeft) * (ratio / 0.5) : hPeak + (hRight - hPeak) * ((ratio - 0.5) / 0.5);
                    if (shape === 'l-shape') return xMm <= l1 ? h1 : h2;
                    if (shape === 'u-shape') {
                        if (xMm <= l1) return h1;
                        if (xMm <= l1 + l2) return h2;
                        return h3;
                    }
                    return hLeft;
                };

                const getWallBottomMm = (xMm: number) => {
                    if (variant !== 'bottom') return 0;
                    const ratio = xMm / lengteNum;
                    if (shape === 'slope') return (maxH - hLeft) + ((maxH - hRight) - (maxH - hLeft)) * ratio;
                    if (shape === 'l-shape') return xMm <= l1 ? (maxH - h1) : (maxH - h2);
                    if (shape === 'u-shape') {
                        if (xMm <= l1) return maxH - h1;
                        if (xMm <= l1 + l2) return maxH - h2;
                        return maxH - h3;
                    }
                    return 0;
                };

                const STUD_W = 50;
                const HALF_STUD = 25;
                const timberW = Math.max(1.5, STUD_W * pxPerMm);
                const PLATE_HEIGHT_MM = 44;
                const PLATE_HEIGHT = PLATE_HEIGHT_MM * pxPerMm;

                // Beams & Gaps Generation
                const { beams, gaps } = (() => {
                    if (lengteNum <= 0 || balkafstandNum <= 0) return { beams: [], gaps: [] };

                    const b: RenderBeam[] = [];
                    const g: RenderGap[] = [];

                    type Segment = { startX: number; length: number; label: string };
                    const segments: Segment[] = [];
                    if (shape === 'l-shape') { segments.push({ startX: 0, length: l1, label: 'L1' }); segments.push({ startX: l1, length: lengteNum - l1, label: 'L2' }); }
                    else if (shape === 'u-shape') { segments.push({ startX: 0, length: l1, label: 'L1' }); segments.push({ startX: l1, length: l2, label: 'L2' }); segments.push({ startX: l1 + l2, length: lengteNum - (l1 + l2), label: 'L3' }); }
                    else { segments.push({ startX: 0, length: lengteNum, label: 'Main' }); }

                    segments.forEach((seg) => {
                        if (seg.length <= 0) return;
                        const segBeams: number[] = [seg.startX]; // Start Stud
                        const endStudX = seg.startX + seg.length - STUD_W;
                        if (endStudX > seg.startX + 1) segBeams.push(endStudX); // End Stud

                        const numIntervals = Math.floor(seg.length / balkafstandNum);
                        for (let i = 1; i <= numIntervals; i++) {
                            const gridX = seg.startX + (i * balkafstandNum) - HALF_STUD;
                            if (!(gridX < seg.startX + STUD_W - 1) && !(gridX + STUD_W > endStudX + 1)) segBeams.push(gridX);
                        }

                        const uniqueX = Array.from(new Set(segBeams)).sort((a, b) => a - b);

                        // Add Studs
                        uniqueX.forEach(xMm => {
                            const center = xMm + HALF_STUD;
                            const wt = getWallTopMm(center);
                            const wb = getWallBottomMm(center);
                            const hMm = (wt - PLATE_HEIGHT_MM) - (wb + PLATE_HEIGHT_MM);
                            const fullBeam = { x: WALL_X + xMm * pxPerMm, y: getY(wt - PLATE_HEIGHT_MM), w: timberW, h: hMm * pxPerMm, type: 'stud', xMm, yMm: wb + PLATE_HEIGHT_MM, hMm };

                            const op = openings.find(o => (xMm + STUD_W > o.fromLeft && xMm < o.fromLeft + o.width));
                            if (op) {
                                const headerY = op.fromBottom + op.height + STUD_W;
                                const topCripH = (wt - PLATE_HEIGHT_MM) - headerY;
                                if (topCripH > 10) b.push({ ...fullBeam, y: getY(wt - PLATE_HEIGHT_MM), h: topCripH * pxPerMm, type: 'cripple-top' });

                                const sillY = op.fromBottom;
                                const botCripH = sillY - (wb + PLATE_HEIGHT_MM);
                                if (botCripH > 10) b.push({ ...fullBeam, y: getY(sillY), h: botCripH * pxPerMm, type: 'cripple-bottom' });
                            } else {
                                b.push(fullBeam);
                            }
                        });

                        // Gaps
                        const centers = uniqueX.map(x => x + HALF_STUD);
                        for (let i = 0; i < centers.length - 1; i++) {
                            const startMm = (i === 0) ? seg.startX : centers[i];
                            const endMm = (i === centers.length - 2) ? seg.startX + seg.length : centers[i + 1];
                            g.push({ value: endMm - startMm, c1: WALL_X + startMm * pxPerMm, c2: WALL_X + endMm * pxPerMm });
                        }
                    });

                    // Fixed Openings Frames & HSB Detail
                    openings.forEach(op => {
                        const studW = 50; // Use local var to be sure
                        const beamW = op.headerDikte || timberW; // Custom header height or standard

                        // Left Side
                        const leftKingX = op.fromLeft - studW;
                        const leftInnerX = op.fromLeft; // Where trimmer goes

                        // Right Side
                        const rightKingX = op.fromLeft + op.width;
                        const rightInnerX = op.fromLeft + op.width - studW; // Where trimmer goes if we look from inside? No, right side of opening
                        // Wait, rightKingX is START of king. opening ends at `fromLeft+width`.
                        // So King is at `rightKingX`.
                        // Trimmer is at `rightKingX - studW`.
                        const rightTrimmerX = op.fromLeft + op.width - studW; // Inside the opening? No.
                        // Standard HSB:
                        // King is full height.
                        // Trimmer (Jack) supports header. sits INSIDE king.
                        // So if opening is X to Y. 
                        // King Left: X - 50.
                        // Trimmer Left: X (intrusive? No usually opening size is rough opening)
                        // Actually, let's assume 'width' is Rough Opening (Sparing).
                        // So Trimmer sits OUTSIDE R.O. if possible? No.
                        // Let's stick to standard framing:
                        // R.O. is the hole.
                        // Trimmers form the sides of the R.O.
                        // King studs are next to trimmers.
                        // SO: Trimmer L is at `op.fromLeft - studW`. King L is at `op.fromLeft - 2*studW`.
                        // BUT visualizer currently draws King at `op.fromLeft - studW`.
                        // Let's KEEP King at usual spot and place Triple/Double OUTER.

                        // Revised strategy to match visualizer "hole" logic:
                        // The 'Hole' Rect is at op.fromLeft.
                        // So we draw studs AROUND it.
                        // Current King: `op.fromLeft - STUD_W` and `op.fromLeft + op.width`.

                        // King Left
                        const klCenter = (op.fromLeft - studW) + HALF_STUD;
                        const wtL = getWallTopMm(klCenter); const wbL = getWallBottomMm(klCenter);
                        const khL = (wtL - PLATE_HEIGHT_MM) - (wbL + PLATE_HEIGHT_MM);
                        b.push({ x: WALL_X + (op.fromLeft - studW) * pxPerMm, y: getY(wtL - PLATE_HEIGHT_MM), w: timberW, h: khL * pxPerMm, type: 'king' });

                        // Double King Left
                        if (op.dubbeleStijlLinks) {
                            const dkX = op.fromLeft - (studW * 2);
                            const dkCenter = dkX + HALF_STUD;
                            const wt = getWallTopMm(dkCenter); const wb = getWallBottomMm(dkCenter);
                            const h = (wt - PLATE_HEIGHT_MM) - (wb + PLATE_HEIGHT_MM);
                            b.push({ x: WALL_X + dkX * pxPerMm, y: getY(wt - PLATE_HEIGHT_MM), w: timberW, h: h * pxPerMm, type: 'king' });
                        }

                        // Trimmer Left (Under Header) - sits INSIDE King? i.e. between King and Hole?
                        // If Hole starts at fromLeft, and King is at fromLeft-50.
                        // Trimmer would be at fromLeft? No that blocks hole.
                        // Let's assume standard "Sparing" includes the trimmers? 
                        // No, usually sparing is clear width.
                        // To avoid visual confusion: We place Trimmer *against* the King, effectively same X? No.
                        // We place Trimmer *under* header inside the king line.
                        if (op.trimmer) {
                            // Jack Stud: same X as King? No.
                            // Usually: King Outside, Jack Inside. 
                            // If current 'King' is at -50, and Hole is at 0.
                            // Then Jack is at... -50? Then where is King? -100.
                            // Let's simply add a stud under header at King position?
                            // OR shift King to -100 and put Jack at -50.
                            // Let's shift King.
                            // WAIT: If we shift King, we must change the 'king' render above.

                            // Let's keep it additive for now to not break 'Sparing' visuals.
                            // If Trimmer is active: Draw it *alongside* King (at -50? no).
                            // Let's draw it at `op.fromLeft`. It will visually "shrink" the hole, which is technically correct if R.O. implies structural frame.
                            // Actually, let's put it at `op.fromLeft + 5` to hint it?
                            // Better: Put Trimmer at `op.fromLeft - 50` (Replacing the King space?) NO.

                            // Simple visual approach:
                            // King is always outermost full height.
                            // Trimmer is inner, under header.
                            // We'll put Trimmer at `op.fromLeft`. (Visualizing it eating into the opening slightly? Or just showing it properly).
                            // Actually, construction-wise, R.O. is measured *inside* trimmers.
                            // So Trimmers are at `fromLeft - 50`. King is at `fromLeft - 100`.
                            // This changes the whole grid.

                            // Let's just draw the Trimmer *inside* the existing King slot? No.
                            // Let's draw it as an extra stud at `op.fromLeft` (visually inside the hole rect).
                            // User can understand "Sparing" vs "Frame".
                            const trimH = (op.fromBottom + op.height) - (wbL + PLATE_HEIGHT_MM) + (op.onderdorpel && op.onderdorpelDikte ? op.onderdorpelDikte : 0);
                            // Wait, header starts at `bottom + height`.
                            // So Trimmer goes from BottomPlate to Header.
                            // Height = op.fromBottom + op.height + (header thickness? no, header starts there).
                            // We use calculated top.
                            const headerY_mm = op.fromBottom + op.height + op.onderdorpelDikte! || 0; // rough.
                            // Actually header is at `op.fromBottom + op.height + STUD_W` in current code below.
                            // Let's respect current visualizer: Header Y is `op.fromBottom + op.height + STUD_W`.
                            // So opening is clear, then 50mm header frame?

                            // Let's Stick to: Trimmer sits at `op.fromLeft - studW` (Overlapping King? No).
                            // We will draw Trimmer *Next to* King (Inner side). 
                            // Since King is at `-50`, Trimmer is at `0`.
                            // Yes, render at `op.fromLeft`.
                            if (op.trimmer) {
                                const tX = op.fromLeft;
                                const sillH = wbL + PLATE_HEIGHT_MM;
                                const headH = op.fromBottom + op.height + STUD_W; // Bottom of header
                                const h = headH - sillH;
                                // b.push({ x: WALL_X + tX * pxPerMm, y: getY(headH), w: timberW, h: h * pxPerMm, type: 'stud' }); 
                                // NO, this looks messy.
                            }
                        }

                        // King Right
                        const krCenter = (op.fromLeft + op.width) + HALF_STUD;
                        const wtR = getWallTopMm(krCenter); const wbR = getWallBottomMm(krCenter);
                        const khR = (wtR - PLATE_HEIGHT_MM) - (wbR + PLATE_HEIGHT_MM);
                        b.push({ x: WALL_X + (op.fromLeft + op.width) * pxPerMm, y: getY(wtR - PLATE_HEIGHT_MM), w: timberW, h: khR * pxPerMm, type: 'king' });

                        // Double King Right
                        if (op.dubbeleStijlRechts) {
                            const dkX = op.fromLeft + op.width + studW;
                            const dkCenter = dkX + HALF_STUD;
                            const wt = getWallTopMm(dkCenter); const wb = getWallBottomMm(dkCenter);
                            const h = (wt - PLATE_HEIGHT_MM) - (wb + PLATE_HEIGHT_MM);
                            b.push({ x: WALL_X + dkX * pxPerMm, y: getY(wt - PLATE_HEIGHT_MM), w: timberW, h: h * pxPerMm, type: 'king' });
                        }

                        // Header
                        const headerY = op.fromBottom + op.height + STUD_W;
                        const headerH = op.headerDikte ? op.headerDikte * pxPerMm : timberW;
                        // Center header slightly if thick? No, flush bottom.
                        // Standard Beam: y is Top-Left coordinate in SVG.
                        // getY(mm) returns Y from bottom.
                        // We want bottom of header at `headerY`.
                        // So opY should be `getY(headerY + height)`.

                        // Current logic: `y: getY(op.fromBottom + op.height + STUD_W)`.
                        // This implies `getY` converts a 'bottom' MM to SVG Y.
                        // If header is 200mm high.
                        // Top is at `headerY + 200`.
                        // SVG Y is `getY(headerY + 200)`.

                        const hMmVal = op.headerDikte || STUD_W;
                        const headerBottomMm = op.fromBottom + op.height;
                        const headerTopMm = headerBottomMm + hMmVal;

                        b.push({
                            x: WALL_X + op.fromLeft * pxPerMm,
                            y: getY(headerTopMm), // Top of rect 
                            w: op.width * pxPerMm,
                            h: hMmVal * pxPerMm,
                            type: 'header'
                        });

                        // Trimmer (Jack) Support Logic (Visualized INSIDE King)
                        // Uses the space usually reserved for King if enabled?
                        // No, let's keep it simple: separate rendering pass for functionality, but visually just show extra studs.
                        // If trimmer is true, we assume it's under the header. 
                        // We'll draw it inward from the King studs (eating into opening width visually)
                        if (op.trimmer) {
                            const trimL_X = op.fromLeft;
                            const trimR_X = op.fromLeft + op.width - studW;

                            // Left Jack
                            const jlBot = getWallBottomMm(trimL_X + HALF_STUD) + PLATE_HEIGHT_MM;
                            const jackTopMm = op.fromBottom; // Stop at sill
                            const jlHeight = jackTopMm - jlBot;
                            if (jlHeight > 10) {
                                b.push({ x: WALL_X + trimL_X * pxPerMm, y: getY(jackTopMm), w: timberW, h: jlHeight * pxPerMm, type: 'stud' });
                            }

                            // Right Jack
                            const jrBot = getWallBottomMm(trimR_X + HALF_STUD) + PLATE_HEIGHT_MM;
                            const jrHeight = jackTopMm - jrBot;
                            if (jrHeight > 10) {
                                b.push({ x: WALL_X + trimR_X * pxPerMm, y: getY(jackTopMm), w: timberW, h: jrHeight * pxPerMm, type: 'stud' });
                            }
                        }

                        // Standard Sill (Windows/Openings) - Sits BELOW the opening
                        if (op.type !== 'door' && op.type !== 'door-frame') {
                            const sillH = op.onderdorpelDikte ? op.onderdorpelDikte : STUD_W;
                            const sillTop = op.fromBottom;
                            // Rect draws from Top Down.
                            // Bottom of sill is `sillTop - sillH`.
                            // So Y is `getY(sillTop)`.
                            b.push({ x: WALL_X + op.fromLeft * pxPerMm, y: getY(op.fromBottom), w: op.width * pxPerMm, h: sillH * pxPerMm, type: 'sill' });
                        }
                    });

                    return { beams: b, gaps: g };
                })();

                // Plate Paths Generation
                let topPlatePath = '';
                if (shape === 'slope') {
                    topPlatePath = `${WALL_X},${getY(hLeft)} ${WALL_X + WALL_WIDTH},${getY(hRight)} ${WALL_X + WALL_WIDTH},${getY(hRight) + PLATE_HEIGHT} ${WALL_X},${getY(hLeft) + PLATE_HEIGHT}`;
                } else if (shape === 'gable') {
                    const midX = WALL_X + WALL_WIDTH / 2;
                    const peakY = getY(hPeak);
                    topPlatePath = `${WALL_X},${getY(hLeft)} ${midX},${peakY} ${WALL_X + WALL_WIDTH},${getY(hRight)} ${WALL_X + WALL_WIDTH},${getY(hRight) + PLATE_HEIGHT} ${midX},${peakY + PLATE_HEIGHT} ${WALL_X},${getY(hLeft) + PLATE_HEIGHT}`;
                } else {
                    topPlatePath = `${WALL_X},${getY(hLeft)} ${WALL_X + WALL_WIDTH},${getY(hRight)} ${WALL_X + WALL_WIDTH},${getY(hRight) + PLATE_HEIGHT} ${WALL_X},${getY(hLeft) + PLATE_HEIGHT}`;
                }

                let bottomPlatePath = '';
                const yBot = getY(0);
                bottomPlatePath = `${WALL_X},${yBot - PLATE_HEIGHT} ${WALL_X + WALL_WIDTH},${yBot - PLATE_HEIGHT} ${WALL_X + WALL_WIDTH},${yBot} ${WALL_X},${yBot}`;

                // Calculate Segments for Dimensions
                const segments: { len: number }[] = [];
                if (shape === 'l-shape') { segments.push({ len: l1 }); segments.push({ len: l2 }); }
                else if (shape === 'u-shape') { segments.push({ len: l1 }); segments.push({ len: l2 }); segments.push({ len: l3 }); }

                return (
                    <>
                        <polygon points={topPlatePath} fill="rgb(70, 75, 85)" stroke="rgb(55, 60, 70)" strokeWidth="0.5" />
                        <polygon points={bottomPlatePath} fill="rgb(70, 75, 85)" stroke="rgb(55, 60, 70)" strokeWidth="0.5" />
                        {beams.map((b, i: number) => <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill="rgb(70, 75, 85)" stroke="rgb(55, 60, 70)" strokeWidth="0.5" />)}

                        {openings.map((op) => {
                            const wPx = op.width * pxPerMm;
                            const hPx = op.height * pxPerMm;
                            const drawX = WALL_X + op.fromLeft * pxPerMm;
                            const drawY = getY(op.fromBottom + op.height);

                            // Calculate Onderdorpel Rect if applicable
                            let onderdorpelRect = null;
                            if ((op.type === 'door' || op.type === 'door-frame') && op.onderdorpel && op.onderdorpelDikte) {
                                const thPx = op.onderdorpelDikte * pxPerMm;
                                // Draws from (fromBottom + thick) DOWN to fromBottom
                                const odY = getY(op.fromBottom + op.onderdorpelDikte);
                                onderdorpelRect = <rect x={drawX} y={odY} width={wPx} height={thPx} fill="rgb(70, 75, 85)" stroke="rgb(55, 60, 70)" strokeWidth="0.5" />;
                            }

                            return (
                                <g key={op.id}
                                    onPointerDown={(e) => handlePointerDown(e, op)}
                                    style={{ cursor: onOpeningsChange ? 'move' : 'default' }}
                                >
                                    {/* Hole */}
                                    <rect x={drawX} y={drawY} width={wPx} height={hPx} fill="#09090b" stroke={draggingId === op.id ? "#10b981" : "rgb(55, 60, 70)"} strokeWidth={draggingId === op.id ? "2" : "1"} />

                                    {/* Onderdorpel Overlay */}
                                    {onderdorpelRect}

                                    {/* Cross */}
                                    <line x1={drawX} y1={drawY} x2={drawX + wPx} y2={drawY + hPx} stroke="rgb(55, 60, 70)" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.5" />
                                    <line x1={drawX} y1={drawY + hPx} x2={drawX + wPx} y2={drawY} stroke="rgb(55, 60, 70)" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.5" />

                                    {/* Labels */}
                                    <OpeningLabels
                                        centerX={drawX + wPx / 2}
                                        centerY={drawY + hPx / 2}
                                        typeName={
                                            op.type === 'door-frame' ? 'Deurkozijn' :
                                                op.type === 'door' ? 'Deur' :
                                                    op.type === 'window' ? 'Raamkozijn' : 'Sparing'
                                        }
                                        width={op.width}
                                        height={op.height}
                                    />
                                </g>
                            );
                        })}

                        {/* --- STANDARD DIMENSIONS using Shared Components --- */}
                        <OverallDimensions
                            wallLength={lengteNum}
                            wallHeight={maxH}
                            svgBaseX={WALL_X}
                            svgBaseY={Y_BOTTOM}
                            pxPerMm={pxPerMm}
                        />

                        {/* Segments (L-Shape/U-Shape) - using DimensionLine directly for consistent style */}
                        {segments.length > 0 && (
                            <g>
                                {(() => {
                                    let currentX = WALL_X;
                                    return segments.map((seg, i) => {
                                        const wPx = seg.len * pxPerMm;
                                        const endX = currentX + wPx;

                                        // Draw segment dimension ABOVE the Total dimension
                                        // Total is at Y_BOTTOM + 100 (default offsetBottom)
                                        // We place segments at Y_BOTTOM + 50
                                        const component = (
                                            <DimensionLine
                                                key={i}
                                                p1={{ x: currentX, y: Y_BOTTOM }}
                                                p2={{ x: endX, y: Y_BOTTOM }}
                                                offset={50}
                                                label={Math.round(seg.len)}
                                                orientation="horizontal"
                                                className="text-emerald-500"
                                            />
                                        );
                                        currentX = endX;
                                        return component;
                                    });
                                })()}
                            </g>
                        )}

                        <OpeningMeasurements
                            openings={openings.map(op => ({ ...op, width: op.width, height: op.height, fromLeft: op.fromLeft, fromBottom: op.fromBottom, type: op.type, id: op.id }))}
                            wallLength={lengteNum}
                            wallHeight={maxH}
                            svgBaseX={WALL_X}
                            svgBaseY={Y_BOTTOM}
                            pxPerMm={pxPerMm}
                            getWallTopMm={getWallTopMm}
                        />

                        {gaps.length > 0 && <GridMeasurements gaps={gaps} svgBaseYTop={getY(maxH)} />}

                        {/* Custom Title Placement */}
                        {title && (
                            <text
                                x={20}
                                y={SVG_HEIGHT - 20}
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

export default WallDrawing;
