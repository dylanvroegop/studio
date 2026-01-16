'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

export interface WallOpening {
    id: string;
    type: 'door' | 'window' | 'opening';
    width: number;
    height: number;
    fromLeft: number;
    fromBottom: number;
}

interface WallStructureVisualizerProps {
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
}

export function WallStructureVisualizer({
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
    startFromRight
}: WallStructureVisualizerProps) {
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

    if (shape === 'slope') {
        hLeft = typeof hoogteLinks === 'number' ? hoogteLinks : parseFloat(String(hoogteLinks)) || 0;
        hRight = typeof hoogteRechts === 'number' ? hoogteRechts : parseFloat(String(hoogteRechts)) || 0;

    } else if (shape === 'gable') {
        // usually 'hoogte' is the side height (eaves)
        hLeft = hStd;
        hRight = hStd;
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

    const lengteDisplay = lengteNum > 0 ? `${lengteNum}` : '---';
    const hL_disp = hLeft > 0 ? `${hLeft}` : '---';
    const hR_disp = hRight > 0 ? `${hRight}` : '---';
    const hP_disp = hPeak > 0 ? `${hPeak}` : '---';

    let hoogteDisplay = hL_disp;
    if (shape === 'slope') hoogteDisplay = `${hL_disp} / ${hR_disp}`;
    else if (shape === 'gable') hoogteDisplay = `${hL_disp} / ${hP_disp} / ${hR_disp}`;
    else if (shape === 'l-shape') hoogteDisplay = `${h1} / ${h2}`;
    else if (shape === 'u-shape') hoogteDisplay = `${h1} / ${h2} / ${h3}`;

    // Aspect Ratio & Scaling Logic

    const SVG_WIDTH = 600;
    const SVG_HEIGHT = 450; // Increased to allow for bottom dimensions
    const MARGIN_X = 80; // Increased to allow space for left dimensions (was 40)
    const MARGIN_Y = 40;

    const MAX_DRAW_WIDTH = SVG_WIDTH - (MARGIN_X * 2);
    const MAX_DRAW_HEIGHT = SVG_HEIGHT - (MARGIN_Y * 2) - 60; // Extra buffer for bottom dims

    const maxH = Math.max(hLeft, hRight, shape === 'gable' ? hPeak : 0, shape === 'l-shape' ? Math.max(h1, h2) : 0, shape === 'u-shape' ? Math.max(h1, h2, h3) : 0) || 2600;
    const currentLen = lengteNum || 1000;

    const scaleX = MAX_DRAW_WIDTH / currentLen;
    const scaleY = MAX_DRAW_HEIGHT / maxH;
    const pxPerMm = Math.min(scaleX, scaleY);

    const drawWidth = currentLen * pxPerMm;
    const drawHeight = maxH * pxPerMm;

    const startX = (SVG_WIDTH - drawWidth) / 2;
    const startY = (SVG_HEIGHT - drawHeight - 60) / 2; // Shift up to leave room at bottom

    const Y_BOTTOM = startY + drawHeight;
    const WALL_X = startX;
    const WALL_WIDTH = drawWidth;

    const getY = (mm: number) => Y_BOTTOM - (mm * pxPerMm);

    const yLeft = getY(hLeft);
    const yRight = getY(hRight);
    const yPeak = getY(hPeak);
    // Shape Ys
    const yH1 = getY(h1);
    const yH2 = getY(h2);
    const yH3 = getY(h3);

    // Stud width is 50mm, plates are 38mm
    const STUD_WIDTH_MM = 50;
    const PLATE_HEIGHT_MM = 38;
    const studWidthPx = Math.max(1.5, STUD_WIDTH_MM * pxPerMm);
    const PLATE_HEIGHT = Math.max(1.5, PLATE_HEIGHT_MM * pxPerMm);

    // Dimension Y Levels (External & Hierarchical)
    // Top Level (Total Length)
    const minY = Math.min(yLeft, yRight, yH1, yH2, yH3, shape === 'gable' ? yPeak : 9999);
    const DIM_Y_TOP = minY - 50;

    // Bottom Levels
    // 1. Gaps / Centers (Closest to wall)
    const DIM_Y_GAP = Y_BOTTOM + 50;
    // 2. Segment Lengths (Further down)
    const DIM_Y_SEGMENTS = Y_BOTTOM + 90;
    // 3. Total Length (Previously Bottom, now Top, but keeping variable for reference if needed or removed)
    // const DIM_Y_TOTAL = Y_BOTTOM + 120; // Moved to Top

    // Height Dimension X Levels
    const DIM_X_LEFT = WALL_X - 50;
    const DIM_X_RIGHT = WALL_X + WALL_WIDTH + 50;

    // Drag Logic
    const [draggingId, setDraggingId] = React.useState<string | null>(null);
    const dragStartRef = React.useRef<{
        x: number;
        y: number;
        opId: string;
        origLeft: number;
        origBottom: number;
    } | null>(null);

    // Magnifier Logic
    const [lensPos, setLensPos] = React.useState({ x: 0, y: 0 });

    const handlePointerDown = (e: React.PointerEvent, op: WallOpening) => {
        if (isMagnifier) return; // Magnifier tool active - disable drag
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
        // Update magnifier position
        if (isMagnifier) {
            const svg = (e.currentTarget as Element).closest('svg');
            if (svg) {
                const pt = svg.createSVGPoint();
                pt.x = e.clientX;
                pt.y = e.clientY;
                // Transform to SVG coordinates
                const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
                setLensPos({ x: svgP.x, y: svgP.y });
            }
        }

        if (!draggingId || !dragStartRef.current || !onOpeningsChange) return;
        const start = dragStartRef.current;


        const dxPx = e.clientX - start.x;
        const dyPx = e.clientY - start.y;

        const dxMm = dxPx / pxPerMm;
        const dyMm = -(dyPx / pxPerMm); // Up is positive MM, Down is positive Pixels

        const newLeft = Math.round(start.origLeft + dxMm);
        const newBottom = Math.round(start.origBottom + dyMm);

        // Optional: constrain to wall bounds?
        // Let's keep it free for now as per "move it around" flexibility, 
        // but maybe constrain min to 0?
        // const constrainedLeft = Math.max(0, Math.min(lengteNum - 100, newLeft));
        // const constrainedBottom = Math.max(0, Math.min(maxH - 100, newBottom));

        const updatedOpenings = openings.map(o => {
            if (o.id === draggingId) {
                let finalBottom = newBottom;

                // Sticky bottom for doors
                if (o.type === 'door' || o.type === 'opening') { // 'opening' (loop) usually implies walk-through too? Let's treat door/opening as sticky. 'window' is not.
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

    const studData = useMemo(() => {
        if (lengteNum <= 0 || balkafstandNum <= 0) {
            return { beams: [], gaps: [] };
        }

        const beams: { x: number; y: number; w: number; h: number; type?: string }[] = [];
        // Stud dimensions
        const STUD_W = 50; // Stud width in mm
        const HALF_STUD = STUD_W / 2; // 25mm
        const timberW = Math.max(1.5, STUD_W * pxPerMm); // Width of studs/beams

        // 1. Identify Openings in Screen Coordinates for Collision
        const ops = openings.map(o => {
            const wPx = o.width * pxPerMm;
            const hPx = o.height * pxPerMm;
            const lPx = o.fromLeft * pxPerMm;
            const bPx = o.fromBottom * pxPerMm;
            // Opening Rect (The Empty Space)
            // Left, Right, Bottom (y-up from floor), Top (y-up from floor)
            // Note: Canvas Y is inverted (0 at top).
            // Logic is easier in "Wall MM" space first.
            return {
                l: o.fromLeft,
                r: o.fromLeft + o.width,
                b: o.fromBottom,
                t: o.fromBottom + o.height,
                type: o.type
            };
        });

        const WALL_HEIGHT_MM = maxH; // Approx simple height or calc per X

        // Helper: Get Wall Top Y (mm) at given X
        // Note: X is relative to current length
        const getWallTopMm = (xMm: number) => {
            const ratio = xMm / lengteNum;

            // BOTTOM VARIANT LOGIC:
            // If variant === 'bottom', the TOP is flat (at maxH), and BOTTOM changes.
            // But this function `getWallTopMm` returns the PHYSICAL TOP bound of the wall.
            // If variant is bottom, PHYSICAL TOP is usually flat (maxH).
            // But we need a separate `getWallBottomMm` function.
            // However, stud length = Top - Bottom.
            // If variant = bottom, we treat wallTop as maxH?

            if (variant === 'bottom' && (shape === 'slope' || shape === 'l-shape' || shape === 'u-shape')) {
                // Top is flat at highest point
                return maxH;
            }

            // --- STANDARD TOP VARIANT ---
            if (shape === 'slope') return hLeft + (hRight - hLeft) * ratio;
            if (shape === 'gable') {
                return ratio <= 0.5
                    ? hLeft + (hPeak - hLeft) * (ratio / 0.5)
                    : hPeak + (hRight - hPeak) * ((ratio - 0.5) / 0.5);
            }
            if (shape === 'l-shape') {
                return xMm <= l1 ? h1 : h2;
            }
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

            if (shape === 'slope') {
                // Slope bottom:
                // We define slope by hLeft and hRight.
                // If variant=bottom, does hLeft mean "Wall height at left"? yes.
                // So if hLeft=2000, hRight=1000. Top is at max(2000, 2600?)
                // If top is FLAT, and hLeft=2000, hRight=1000.
                // It means at Left, floor is at (TotalTop - 2000).
                // At Right, floor is at (TotalTop - 1000).
                // This seems convoluted.
                // Easier: Slope Bottom usually means floor rises.
                // Let's assume Top is at maxH.
                // Bottom at x=0 is (maxH - hLeft).
                // Bottom at x=L is (maxH - hRight).
                return (maxH - hLeft) + ((maxH - hRight) - (maxH - hLeft)) * ratio;
            }
            if (shape === 'l-shape') {
                // Step Bottom.
                // Left section height h1. Right section height h2.
                // Top is maxH. 
                // Left bottom = maxH - h1.
                // Right bottom = maxH - h2.
                return xMm <= l1 ? (maxH - h1) : (maxH - h2);
            }
            if (shape === 'u-shape') {
                if (xMm <= l1) return maxH - h1;
                if (xMm <= l1 + l2) return maxH - h2;
                return maxH - h3;
            }
            return 0;
        };

        // 2. Generate Grid Studs (Kings/Cripples)
        const fullIntervals = Math.floor(lengteNum / balkafstandNum);
        const remainder = lengteNum - (fullIntervals * balkafstandNum);
        const centerMms: number[] = [];

        if (startFromRight) {
            centerMms.push(lengteNum);
            for (let i = 1; i <= fullIntervals; i++) centerMms.push(lengteNum - i * balkafstandNum);
            if (remainder > 0 && centerMms[centerMms.length - 1] !== 0) centerMms.push(0);
            centerMms.sort((a, b) => a - b);
        } else {
            centerMms.push(0);
            for (let i = 1; i <= fullIntervals; i++) centerMms.push(i * balkafstandNum);
            if (remainder > 0) centerMms.push(lengteNum);
        }

        // Track the first and last stud positions explicitly
        const firstStudPos = centerMms[0];
        const lastStudPos = centerMms[centerMms.length - 1];

        // Calculate all King Stud positions for collision detection
        // King Studs are FIXED at exact opening edges (opening dimensions are sacred)
        const kingStuds: { center: number; leftEdge: number; rightEdge: number; side: 'left' | 'right'; opL: number; opR: number }[] = [];
        ops.forEach(op => {
            // Left King Stud: positioned so its right edge is at op.l
            kingStuds.push({
                center: op.l - HALF_STUD,
                leftEdge: op.l - STUD_W,
                rightEdge: op.l,
                side: 'left',
                opL: op.l,
                opR: op.r
            });
            // Right King Stud: positioned so its left edge is at op.r
            kingStuds.push({
                center: op.r + HALF_STUD,
                leftEdge: op.r,
                rightEdge: op.r + STUD_W,
                side: 'right',
                opL: op.l,
                opR: op.r
            });
        });

        // Add Structural Corners (L/U Shape) to King Studs to prevent grid collision
        if ((shape === 'l-shape' || shape === 'u-shape') && l1 > 0) {
            // Corner at L1 (Centered)
            const cx = l1;
            kingStuds.push({
                center: cx,
                leftEdge: cx - HALF_STUD,
                rightEdge: cx + HALF_STUD,
                side: 'left', // Dummy
                opL: cx, // Dummy
                opR: cx  // Dummy
            });
        }
        if (shape === 'u-shape' && l1 > 0 && l2 > 0) {
            // Corner at L1 + L2 (Centered)
            const cx = l1 + l2;
            kingStuds.push({
                center: cx,
                leftEdge: cx - HALF_STUD,
                rightEdge: cx + HALF_STUD,
                side: 'right', // Dummy
                opL: cx, // Dummy
                opR: cx  // Dummy
            });
        }

        // 2b. Grid stud collision and movement rules
        // Opening dimensions are SACRED. King Studs are FIXED.
        // Grid Studs may MOVE to stay adjacent to Kings, but never overlap.
        const GRID_TOLERANCE = 10; // mm - if King center within ±10mm of grid, King replaces grid stud

        // Process Master Studs: determine if they stay, move, or are removed
        const adjustedStuds: { center: number; isSistered: boolean }[] = [];

        centerMms.forEach((cx, i) => {
            // Always keep start/end studs at their positions
            if (i === 0 || i === centerMms.length - 1) {
                adjustedStuds.push({ center: cx, isSistered: false });
                return;
            }

            // ========================================
            // BEAM COLLISION RULES
            // ========================================
            // 1. Beams are ALWAYS 50mm wide - never smaller
            // 2. If King center is within ±10mm of grid position → REMOVE grid stud
            // 3. If overlap but King center outside ±10mm → MOVE grid stud to be adjacent
            //    Move in direction that keeps the original grid position covered by the beam

            // Grid stud edges
            const gridLeft = cx - HALF_STUD;
            const gridRight = cx + HALF_STUD;

            let newCenter: number | null = cx;
            let wasMoved = false;

            for (const king of kingStuds) {
                const kingCenter = king.center;
                const kingLeft = king.leftEdge;
                const kingRight = king.rightEdge;

                // Rule 1: If King center is within ±10mm of grid position → REMOVE grid stud
                // (King replaces/aligns with the grid stud)
                if (Math.abs(kingCenter - cx) <= GRID_TOLERANCE) {
                    newCenter = null;
                    break;
                }

                // Rule 2: Check if beams would overlap
                const wouldOverlap = (gridRight > kingLeft) && (gridLeft < kingRight);

                if (wouldOverlap) {
                    // Move grid stud to be adjacent to King
                    // Direction: keep the original grid position (cx) covered by the moved beam

                    if (kingCenter < cx) {
                        // King is to the LEFT of grid → move grid to the RIGHT
                        // New grid left edge = King right edge
                        newCenter = kingRight + HALF_STUD;
                    } else {
                        // King is to the RIGHT of grid → move grid to the LEFT
                        // New grid right edge = King left edge
                        newCenter = kingLeft - HALF_STUD;
                    }
                    wasMoved = true;
                    break;
                }
            }

            if (newCenter !== null) {
                adjustedStuds.push({ center: newCenter, isSistered: wasMoved });
            }
        });

        // Convert back to simple array of centers for compatibility
        const adjustedCenterMms = adjustedStuds.map(s => s.center);

        adjustedCenterMms.forEach((cx, i) => {
            // Use multiple checks to determine if this is a start/end stud:
            // 1. Position-based check (matches tracked first/last positions)
            // 2. Index-based check as fallback (first or last in adjusted array)
            const isStartStud = cx === firstStudPos || i === 0;
            const isEndStud = cx === lastStudPos || i === adjustedCenterMms.length - 1;
            const isEnd = isStartStud || isEndStud;
            const studL = cx - HALF_STUD; // 50mm stud centered
            const studR = cx + HALF_STUD;

            // Adjust ends to be inside wall
            const drawL = isStartStud ? 0 : (isEndStud ? lengteNum - STUD_W : cx - HALF_STUD);
            const drawR = drawL + STUD_W;
            const centerX = drawL + HALF_STUD;

            const wallTop = getWallTopMm(centerX);
            const wallBottom = getWallBottomMm(centerX);

            // Allow plate thickness? 
            // Usually studs sit between plates. Plates are 38mm thick.
            const studYBottom = wallBottom + 38; // Bottom plate height
            const studYTop = wallTop - 38; // Top plate 

            // Check collision with all openings
            // We find "segments" of the stud that exist.
            // Start with one segment: [studYBottom, studYTop]
            // Subtract opening intervals [op.b, op.t]
            let segments = [{ b: studYBottom, t: studYTop }];

            ops.forEach(op => {
                // Check horizontal overlap with opening framing allowances
                // Opening hole is op.l to op.r.
                // Stud is drawL to drawR.
                if (drawR > op.l && drawL < op.r) {
                    // Collision horizontally. Cut vertical segments.
                    const newSegs: { b: number; t: number }[] = [];
                    segments.forEach(seg => {
                        // Opening vertical span (including header/sill framing?)
                        // Header is at op.t (height 50mm). Sill at op.b.
                        // We cut the stud where the hole is + framing.
                        // Hole is [op.b, op.t].
                        // Header takes [op.t, op.t + 50].
                        // Sill takes [op.b - 50, op.b].
                        // So stud exists BELOW op.b (minus sill) and ABOVE op.t (plus header).

                        const cutB = op.b;
                        const cutT = op.t;

                        // Bottom segment (Cripple)
                        if (seg.b < cutB) {
                            newSegs.push({ b: seg.b, t: Math.min(seg.t, cutB) });
                        }
                        // Top segment (Cripple)
                        if (seg.t > cutT) {
                            newSegs.push({ b: Math.max(seg.b, cutT), t: seg.t });
                        }
                    });
                    segments = newSegs;
                }
            });

            // Convert segments to Draw Beams
            segments.forEach(seg => {
                if (seg.t > seg.b) { // Valid segment
                    beams.push({
                        x: WALL_X + drawL * pxPerMm,
                        y: getY(seg.t), // Draw from top down sort of? Y is Top Coordinate in Canvas?
                        // getY(mm) returns canvas Y. 
                        // SVG Rect: y = Top Y.
                        // getY(seg.t) is the canvas y for the top of the stud (higher physically, lower value).
                        w: timberW,
                        h: (seg.t - seg.b) * pxPerMm,
                        type: 'stud'
                    });
                }
            });
        });

        // 3. Generate Opening Framing (Kings, Headers, Sills)
        // King Studs are FIXED at exact opening edges (opening dimensions are SACRED)
        const PLATE_H = 38; // Plate height stays at 38mm

        ops.forEach(op => {
            // King Studs (Left/Right) - Full Height (between plates)
            // Placed at EXACT opening edges - these positions are FIXED (sacred)
            const leftKingX = op.l - STUD_W;  // Left edge of left King Stud
            const rightKingX = op.r;          // Left edge of right King Stud

            // Draw the King Studs at their FIXED positions
            const kings = [
                { xMm: leftKingX, side: 'left' },
                { xMm: rightKingX, side: 'right' }
            ];

            kings.forEach(k => {
                const wallTop = getWallTopMm(k.xMm + HALF_STUD);
                beams.push({
                    x: WALL_X + k.xMm * pxPerMm,
                    y: getY(wallTop - PLATE_H),
                    w: timberW,
                    h: (wallTop - PLATE_H - PLATE_H) * pxPerMm, // Full wall height minus plates
                    type: 'king'
                });
            });

            // Header (Top) - spans EXACTLY the opening width (sacred dimension)
            beams.push({
                x: WALL_X + op.l * pxPerMm,
                y: getY(op.t + STUD_W), // Top of header (50mm header)
                w: (op.r - op.l) * pxPerMm,
                h: timberW, // 50mm height header
                type: 'header'
            });

            // Sill (Bottom) - Only for windows, EXACTLY the opening width
            if (op.type !== 'door') {
                beams.push({
                    x: WALL_X + op.l * pxPerMm,
                    y: getY(op.b), // Top of sill is op.b
                    w: (op.r - op.l) * pxPerMm,
                    h: timberW,
                });
            }
        });

        // 4. Corner/Section Studs Logic (Flush placement)
        // We need studs at: 0, L1, (L1+L2), etc.
        // User Requirement: "Last stud in a section is placed flush against the corner."
        // Our grid `centerMms` handles 0 and L_total.
        // We need to ensuring studs at L1 and L1+L2 for L/U shapes.

        const forceStudAt = (xMm: number) => {
            // Check if a beam exists near xMm (within tolerance)
            const exists = beams.some(b => Math.abs(b.x - (WALL_X + xMm * pxPerMm)) < 5); // 5px tolerance
            if (!exists) {
                // Add stud
                const w = timberW;
                // Height depends on position
                const top = getWallTopMm(xMm);
                const bot = getWallBottomMm(xMm);

                // For a junction stud (e.g. L1), it might need to span the HIGHER wall.
                // But getWallTopMm(L1) returns h1 (left side) or h2 (right side)?
                // It usually returns logic for "at this point".
                // We want the stud to support the corner.
                // Let's rely on the previous "Corner Stud" logic (which uses max of adjacents)
                // BUT, that logic pushed to `beams` array directly.
                // We should check if we NEED to add standard studs too?
                // The "Corner Stud" added in the previous block (lines 620+) is separate.
                // Let's keep that separate Corner Stud logic as the "Structural Corner".
                // This block is for "Grid Studs".
                // If we have a structural corner stud at L1, we DON'T need a grid stud there.
                // So we actually want to REMOVE grid studs that conflict with corners?
                // The `kingStuds` logic handles openings.
                // Let's treat Corners as "Kings" roughly?
                // Actually, the previous block (lines 598+) handled Corner Studs explicitly.
                // I will assume that is sufficient for the "Structural" column.
            }
        };

        // L-Shape Corner Stud (Hoekstijl) - Enforced
        if (shape === 'l-shape' && l1 > 0) {
            const cornerW_mm = 50;
            const c1_X = l1;
            const c1_L = c1_X - (cornerW_mm / 2);
            // Center the stud on the transition line

            const cornerH = Math.max(h1, h2);

            beams.push({
                x: WALL_X + c1_L * pxPerMm,
                y: getY(cornerH - PLATE_H), // Top plate allowance
                w: Math.max(1.5, cornerW_mm * pxPerMm),
                h: (cornerH - (PLATE_H * 2)) * pxPerMm,
                type: 'corner'
            });
        }

        // 5. U-Shape Corner Studs
        if (shape === 'u-shape' && l1 > 0 && l2 > 0) {
            const cornerW_mm = 50;
            // Corner 1: Between L1 and L2
            // If variant=top: Top height changes at L1.
            // If variant=bottom: Bottom height changes at L1.
            // Stud height is max of adjacent sections.

            // Corner 1 Logic
            const c1_X = l1;
            const c1_L = c1_X - (cornerW_mm / 2);
            // Height: if variant=top, max(h1, h2). 
            // If variant=bottom, top is flat (MaxH). Bottom is min( maxH-h1, maxH-h2 )? No.
            // Bottom is higher if H is smaller?
            // Let's use getWallTopMm/getWallBottomMm logic indirectly?
            // Actually, just standard h1 vs h2.
            // If variant 'bottom', and h1=2600 (full) and h2=1000 (shorter wall, higher bottom).
            // Wall 1: Top=Max, Bottom=0. H=2600.
            // Wall 2: Top=Max, Bottom=1600. H=1000.
            // Junction stud should span the union of vertical space? Or just the taller wall?
            // Taller wall requires stud to ground.
            // So stud top is MaxH (variant bottom). Stud bottom is min(bot1, bot2).

            let c1_TopY = 0;
            let c1_BotY = 0;

            if (variant === 'bottom') {
                // Top is maxH. 
                c1_TopY = getY(maxH - PLATE_H);
                // Bottom is min of the bottoms?
                // bot1 = maxH - h1. bot2 = maxH - h2.
                // We want the stud to go down to the lowest bottom (structural support).
                const bot1 = maxH - h1;
                const bot2 = maxH - h2;
                const lowestBot = Math.min(bot1, bot2);
                c1_BotY = getY(lowestBot + 38); // +38 for plate
            } else {
                // Top is max(h1, h2). Bottom is 0.
                const maxH12 = Math.max(h1, h2);
                c1_TopY = getY(maxH12 - PLATE_H);
                c1_BotY = Y_BOTTOM - PLATE_HEIGHT;
            }

            beams.push({
                x: WALL_X + c1_L * pxPerMm,
                y: c1_TopY,
                w: Math.max(1.5, cornerW_mm * pxPerMm),
                h: c1_BotY - c1_TopY, // Canvas Y diff
                type: 'corner'
            });

            // Corner 2: Between L2 and L3 (at L1+L2)
            const c2_X = l1 + l2;
            const c2_L = c2_X - (cornerW_mm / 2);

            let c2_TopY = 0;
            let c2_BotY = 0;

            if (variant === 'bottom') {
                const bot2 = maxH - h2;
                const bot3 = maxH - h3;
                const lowestBot = Math.min(bot2, bot3);
                c2_TopY = getY(maxH - PLATE_H);
                c2_BotY = getY(lowestBot + 38);
            } else {
                const maxH23 = Math.max(h2, h3);
                c2_TopY = getY(maxH23 - PLATE_H);
                c2_BotY = Y_BOTTOM - PLATE_HEIGHT;
            }

            beams.push({
                x: WALL_X + c2_L * pxPerMm,
                y: c2_TopY,
                w: Math.max(1.5, cornerW_mm * pxPerMm),
                h: c2_BotY - c2_TopY,
                type: 'corner'
            });
        }

        // Calculate Gaps for dimensions based on the H.O.H. grid (centerMms)
        // H.O.H. = center-to-center distance, should always be the configured value (e.g., 600mm)
        // We use the original grid positions for consistent H.O.H. measurements
        const dimCenters = centerMms;

        const gapsMm: number[] = [];
        for (let i = 1; i < dimCenters.length; i++) gapsMm.push(dimCenters[i] - dimCenters[i - 1]);

        const gaps = gapsMm.map((gap, i) => {
            const pos1 = dimCenters[i];
            const pos2 = dimCenters[i + 1];

            // Visual positions should be at stud CENTERS
            // First stud center is at HALF_STUD (25mm from wall edge)
            // Other stud centers are at the H.O.H. grid positions

            // Determine Visual Start Point (center of stud)
            let c1 = WALL_X + pos1 * pxPerMm;
            if (pos1 === 0) {
                // First stud: center is at HALF_STUD from wall edge, 
                // but dimension line starts at wall edge for visual clarity
                c1 = WALL_X;
            } else {
                // Other studs: add half stud width to get to right edge of stud
                c1 = WALL_X + pos1 * pxPerMm;
            }

            // Determine Visual End Point (center of next stud)
            let c2 = WALL_X + pos2 * pxPerMm;
            if (pos2 === lengteNum) {
                // Last stud: ends at wall edge
                c2 = WALL_X + lengteNum * pxPerMm;
            }

            return { value: gap, centerX1: c1, centerX2: c2 };
        });

        return { beams, gaps };

    }, [lengteNum, balkafstandNum, WALL_X, WALL_WIDTH, studWidthPx, yLeft, yRight, yPeak, yH1, yH2, shape, pxPerMm, openings, startFromRight, l1, h1, h2, PLATE_HEIGHT, Y_BOTTOM, variant, maxH, h3, l2, l3]);

    const dotGrid = useMemo(() => {
        const dots: { x: number; y: number }[] = [];
        const spacing = 12;
        for (let x = spacing / 2; x < SVG_WIDTH; x += spacing) {
            for (let y = spacing / 2; y < SVG_HEIGHT; y += spacing) {
                dots.push({ x, y });
            }
        }
        return dots;
    }, [SVG_WIDTH, SVG_HEIGHT]);

    const timberColor = 'rgb(70, 75, 85)';
    const timberStroke = 'rgb(55, 60, 70)';

    let topPlatePath = '';
    if (shape === 'slope') {
        topPlatePath = `
            ${WALL_X},${yLeft}
            ${WALL_X + WALL_WIDTH},${yRight}
            ${WALL_X + WALL_WIDTH},${yRight + PLATE_HEIGHT}
            ${WALL_X},${yLeft + PLATE_HEIGHT}
        `;
    } else if (shape === 'gable') {
        const midX = WALL_X + WALL_WIDTH / 2;
        topPlatePath = `
            ${WALL_X},${yLeft}
            ${midX},${yPeak}
            ${WALL_X + WALL_WIDTH},${yRight}
            ${WALL_X + WALL_WIDTH},${yRight + PLATE_HEIGHT}
            ${midX},${yPeak + PLATE_HEIGHT}
            ${WALL_X},${yLeft + PLATE_HEIGHT}
        `;
    } else if (shape === 'l-shape') {
        const xL1 = WALL_X + (l1 * pxPerMm);

        if (variant === 'bottom') {
            // Top is flat at maxH
            // Bottom varies.
            // We are drawing TOP Plate here.
            // So Top Plate is just a flat rect across?
            // Yes, if variant is 'bottom', the TOP of the wall is straight. 
            // Wait, usually "step wall bottom" means the wall hangs? Or sits on a step?
            // Usually sits on a step. So the bottom plate steps. The top plate is straight.
            // So Top Plate Path is simple rectangle.
            const yTop = getY(maxH);
            topPlatePath = `
                ${WALL_X},${yTop}
                ${WALL_X + WALL_WIDTH},${yTop}
                ${WALL_X + WALL_WIDTH},${yTop + PLATE_HEIGHT}
                ${WALL_X},${yTop + PLATE_HEIGHT}
             `;
        } else {
            // Standard L-Shape Top
            topPlatePath = `
                ${WALL_X},${yH1}
                ${xL1},${yH1}
                ${xL1},${yH2}
                ${WALL_X + WALL_WIDTH},${yH2}
                ${WALL_X + WALL_WIDTH},${yH2 + PLATE_HEIGHT}
                ${xL1},${yH2 + PLATE_HEIGHT}
                ${xL1},${yH1 + PLATE_HEIGHT}
                ${WALL_X},${yH1 + PLATE_HEIGHT}
            `;
        }
    } else if (shape === 'u-shape') {
        const xL1 = WALL_X + (l1 * pxPerMm);
        const xL2 = WALL_X + ((l1 + l2) * pxPerMm);

        if (variant === 'bottom') {
            // Flat Top
            const yTop = getY(maxH);
            topPlatePath = `
                ${WALL_X},${yTop}
                ${WALL_X + WALL_WIDTH},${yTop}
                ${WALL_X + WALL_WIDTH},${yTop + PLATE_HEIGHT}
                ${WALL_X},${yTop + PLATE_HEIGHT}
             `;
        } else {
            // Stepped Top
            topPlatePath = `
                ${WALL_X},${yH1}
                ${xL1},${yH1}
                ${xL1},${yH2}
                ${xL2},${yH2}
                ${xL2},${yH3}
                ${WALL_X + WALL_WIDTH},${yH3}
                ${WALL_X + WALL_WIDTH},${yH3 + PLATE_HEIGHT}
                ${xL2},${yH3 + PLATE_HEIGHT}
                ${xL2},${yH2 + PLATE_HEIGHT}
                ${xL1},${yH2 + PLATE_HEIGHT}
                ${xL1},${yH1 + PLATE_HEIGHT}
                ${WALL_X},${yH1 + PLATE_HEIGHT}
             `;
        }
    } else {
        topPlatePath = `
            ${WALL_X},${yLeft}
            ${WALL_X + WALL_WIDTH},${yLeft}
            ${WALL_X + WALL_WIDTH},${yLeft + PLATE_HEIGHT}
            ${WALL_X},${yLeft + PLATE_HEIGHT}
        `;
    }

    // BOTTOM PLATE PATH
    let bottomPlatePath = '';
    const yBotBase = Y_BOTTOM - PLATE_HEIGHT;
    const yBotLine = Y_BOTTOM;

    if (variant === 'bottom') {
        // Calculated per shape
        if (shape === 'slope') {
            // Sloped Bottom
            // Bottom varies from (maxH-hLeft) to (maxH-hRight)
            // Canvas Y: getY(maxH - hLeft) etc.
            const yB_Left = getY(maxH - hLeft);
            const yB_Right = getY(maxH - hRight);

            // Plate is ABOVE this line? Or BELOW?
            // Usually "Bottom Plate" is at the bottom of the studs.
            // If floor is sloped, plate follows floor.
            // We draw plate of thickness PLATE_HEIGHT up from the bottom line?
            // Or studs sit on plate. 
            // Let's assume plate is the bottom-most element.
            // So top of plate is yB_Left?? No, yB_Left is the stud bottom.
            // Plate is below that.
            // Let's draw plate from yB_Left down to yB_Left + PLATE_H?
            // But valid drawing area is UP.
            // Visualizer: Y_BOTTOM is the floor logic for standard.
            // Let's assume standard: Plate is at Y_BOTTOM - PLATE_HEIGHT (top of plate) to Y_BOTTOM (bot of plate).

            // Sloped: Top of plate is yB_Left. 
            // Bot of plate is yB_Left + PLATE_H (downwards in canvas).

            bottomPlatePath = `
                ${WALL_X},${yB_Left}
                ${WALL_X + WALL_WIDTH},${yB_Right}
                ${WALL_X + WALL_WIDTH},${yB_Right + PLATE_HEIGHT}
                ${WALL_X},${yB_Left + PLATE_HEIGHT}
             `;
        } else if (shape === 'l-shape') {
            // Stepped Bottom
            // L1: h1. L2: h2.
            // Bot1 = maxH - h1. Bot2 = maxH - h2.
            const yB1 = getY(maxH - h1);
            const yB2 = getY(maxH - h2);
            const xL1 = WALL_X + (l1 * pxPerMm);

            bottomPlatePath = `
                ${WALL_X},${yB1}
                ${xL1},${yB1}
                ${xL1},${yB2}
                ${WALL_X + WALL_WIDTH},${yB2}
                ${WALL_X + WALL_WIDTH},${yB2 + PLATE_HEIGHT}
                ${xL1},${yB2 + PLATE_HEIGHT}
                ${xL1},${yB1 + PLATE_HEIGHT}
                ${WALL_X},${yB1 + PLATE_HEIGHT}
             `;
        } else if (shape === 'u-shape') {
            const yB1 = getY(maxH - h1);
            const yB2 = getY(maxH - h2);
            const yB3 = getY(maxH - h3);
            const xL1 = WALL_X + (l1 * pxPerMm);
            const xL2 = WALL_X + ((l1 + l2) * pxPerMm);

            bottomPlatePath = `
                ${WALL_X},${yB1}
                ${xL1},${yB1}
                ${xL1},${yB2}
                ${xL2},${yB2}
                ${xL2},${yB3}
                ${WALL_X + WALL_WIDTH},${yB3}
                ${WALL_X + WALL_WIDTH},${yB3 + PLATE_HEIGHT}
                ${xL2},${yB3 + PLATE_HEIGHT}
                ${xL2},${yB2 + PLATE_HEIGHT}
                ${xL1},${yB2 + PLATE_HEIGHT}
                ${xL1},${yB1 + PLATE_HEIGHT}
                ${WALL_X},${yB1 + PLATE_HEIGHT}
             `;
        } else {
            // Fallback
            bottomPlatePath = `
                ${WALL_X},${yBotBase}
                ${WALL_X + WALL_WIDTH},${yBotBase}
                ${WALL_X + WALL_WIDTH},${yBotLine}
                ${WALL_X},${yBotLine}
             `;
        }
    } else {
        // Standard Flat Bottom
        bottomPlatePath = `
            ${WALL_X},${yBotBase}
            ${WALL_X + WALL_WIDTH},${yBotBase}
            ${WALL_X + WALL_WIDTH},${yBotLine}
            ${WALL_X},${yBotLine}
         `;
    }


    // --- PLATE GENERATION (Replaces old Path logic) ---
    // specific types for visual plates
    type PlateRect = { x: number; y: number; w: number; h: number; type: 'top' | 'bottom' };
    const plates: PlateRect[] = [];

    // 1. TOP PLATES
    if (shape === 'slope') {
        // Slope is unique - it's slanted. We can't use simple rects easily without rotation.
        // For visual simplicity in 2D, we might stick to a polygon for the slope top plate?
        // Or render a rotated rect. Let's keep polygon for Slope Top Plate only, or approx with path.
        // Actually, the user wants "beams connecting".
        // A sloped top plate is a single beam.
        // Let's keep the path logic for Slope but render it later as a distinct element if we must.
        // BUT, for L/U/Rectangle, we MUST use Rects.
    }

    // Helper to add a horizontal plate
    const addPlate = (xMm: number, yTopMm: number, wMm: number, type: 'top' | 'bottom') => {
        plates.push({
            x: WALL_X + xMm * pxPerMm,
            y: getY(yTopMm), // Canvas Y for the top-edge of the plate (since Y flips)
            // Wait, getY(h) returns canvas Y. 
            // If we have a plate at height H (top of wall), its Top Edge is at getY(H).
            // Its height is PLATE_HEIGHT.
            // So visual rect is y: getY(H), h: PLATE_HEIGHT? 
            // NO. getY(0) is bottom. getY(2600) is top.
            // A top plate at 2600 extends DOWN. 
            // SVG Rect y is top-left.
            // So if `yTopMm` is the physical top of the plate (e.g. 2600), 
            // Visual Y = getY(yTopMm).
            // Visual Height = PLATE_HEIGHT.
            // Does it extend down? 
            // getY(2600) is e.g. 50px. getY(0) is 500px.
            // We want plate from 2600 down to 2600-38.
            // Canvas: 50 to 50+Height? Yes.
            // So y: getY(yTopMm), h: PLATE_HEIGHT. Correct.

            // For Bottom Plate at 0:
            // Top of plate is at 38mm? No, bottom plate sits on floor.
            // So top of plate is 38mm. Bottom is 0.
            // We pass yTopMm=38?
            // VISUAL:
            // Top Plate: Top Edge = H. Rect starts at getY(H) and goes down (h positive).
            // Bottom Plate: Top Edge = 38 (if flat). Rect starts at getY(38) and goes down to getY(0)?
            // getY(38) is higher (smaller Y) than getY(0).
            // So yes.
            w: wMm * pxPerMm,
            h: PLATE_HEIGHT,
            type
        });
    };

    if (shape === 'l-shape') {
        const xL1 = l1;

        if (variant === 'bottom') {
            // Flat Top (MaxH)
            addPlate(0, maxH, lengteNum, 'top');

            // Stepped Bottom
            // Bottom Plate 1: 0 to L1. Sits on floor level "maxH-h1"? 
            // Wait, "Variatie Onder" means the bottom *cutout* is defined by heights?
            // If H1=1000, H2=2000. MaxH=2000.
            // Wall 1 (Left) is 1000 high. Top is at 2000. So Bottom is at 1000.
            // Wall 2 (Right) is 2000 high. Top at 2000. Bottom at 0.
            // So B1 is at 1000. B2 is at 0.
            // We draw plates *at* these levels.
            // Plate 1: Top=1000+38. Bottom=1000. -> yTopMm = (maxH-h1) + 38.
            addPlate(0, (maxH - h1) + 38, l1, 'bottom');
            // Plate 2: Top=38. Bottom=0. (If h2=maxH) -> yTopMm = (maxH-h2) + 38.
            addPlate(l1, (maxH - h2) + 38, l2, 'bottom');

        } else {
            // Standard Top Variant (Stepped Top, Flat Bottom)
            // Top Plate 1: 0 to L1 at H1.
            addPlate(0, h1, l1, 'top');
            // Top Plate 2: L1 to Total at H2.
            addPlate(l1, h2, l2, 'top');

            // Bottom Plate: Flat at 0.
            addPlate(0, 38, lengteNum, 'bottom');
        }
    } else if (shape === 'u-shape') {
        if (variant === 'bottom') {
            // Flat Top
            addPlate(0, maxH, lengteNum, 'top');

            // Stepped Bottoms
            // P1
            addPlate(0, (maxH - h1) + 38, l1, 'bottom');
            // P2
            addPlate(l1, (maxH - h2) + 38, l2, 'bottom');
            // P3
            addPlate(l1 + l2, (maxH - h3) + 38, l3, 'bottom');

        } else {
            // Stepped Top
            addPlate(0, h1, l1, 'top');
            addPlate(l1, h2, l2, 'top');
            addPlate(l1 + l2, h3, l3, 'top');

            // Flat Bottom
            addPlate(0, 38, lengteNum, 'bottom');
        }
    } else if (shape === 'slope') {
        // Slope Logic - keeping path for Top, but Rect for Bottom
        // If variant 'bottom', Top is flat.
        if (variant === 'bottom') {
            addPlate(0, maxH, lengteNum, 'top');
            // Bottom is sloped. Complex path or rotated rect.
            // We'll keep the path logic for slope bottom.
        } else {
            // Top Sloped (path), Bottom Flat.
            addPlate(0, 38, lengteNum, 'bottom');
        }
    } else if (shape === 'gable') {
        // Gable Top (path), Bottom Flat.
        addPlate(0, 38, lengteNum, 'bottom');
    } else {
        // Rectangle
        addPlate(0, maxH, lengteNum, 'top');
        addPlate(0, 38, lengteNum, 'bottom');
    }

    const drawOpenings = useMemo(() => {
        if (!openings || openings.length === 0) return null;

        return openings.map((op) => {
            const wPx = op.width * pxPerMm;
            const hPx = op.height * pxPerMm;
            const leftPx = op.fromLeft * pxPerMm;
            const bottomPx = op.fromBottom * pxPerMm;

            const x = WALL_X + leftPx;
            const y = Y_BOTTOM - bottomPx - hPx;

            return {
                ...op,
                drawX: x,
                drawY: y,
                drawW: wPx,
                drawH: hPx
            };
        });
    }, [openings, pxPerMm, WALL_X, Y_BOTTOM]);

    return (
        <div
            className={cn(
                "w-full rounded-lg overflow-hidden border border-border/30 bg-[#09090b]",
                className
            )}
            role="img"
            aria-label={`Wandstructuur: ${lengteDisplay} × ${hoogteDisplay} mm`}
        >
            <svg
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                className={cn("w-full touch-none", fitContainer ? "h-full" : "h-auto")} // touch-none for dragging
                xmlns="http://www.w3.org/2000/svg"
                style={{ display: 'block' }}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
            >
                <g id="main-drawing">
                    {/* Background */}
                    <rect x="0" y="0" width={SVG_WIDTH} height={SVG_HEIGHT} fill="#09090b" />

                    {/* Dot grid */}
                    {dotGrid.map((dot, i) => (
                        <circle key={i} cx={dot.x} cy={dot.y} r="0.7" fill="rgb(255, 255, 255)" opacity="0.15" />
                    ))}

                    {/* --- PLATE RENDERING (Rects) --- */}
                    {plates.map((p, i) => (
                        <rect
                            key={`plate-${i}`}
                            x={p.x}
                            y={p.y}
                            width={p.w}
                            height={p.h}
                            fill={timberColor}
                            stroke={timberStroke}
                            strokeWidth="2" // Perimeter Plates always 2px
                        />
                    ))}

                    {/* --- Sloped/Complex Plate Paths (Fallback) --- */}
                    {shape === 'slope' && variant !== 'bottom' && (
                        <polygon points={topPlatePath} fill={timberColor} stroke={timberStroke} strokeWidth="2" />
                    )}
                    {shape === 'slope' && variant === 'bottom' && (
                        <polygon points={bottomPlatePath} fill={timberColor} stroke={timberStroke} strokeWidth="2" />
                    )}
                    {shape === 'gable' && (
                        <polygon points={topPlatePath} fill={timberColor} stroke={timberStroke} strokeWidth="2" />
                    )}

                    {/* ALL Beams (Studs, Headers, Sills, Cripples) */}
                    {studData.beams.map((beam, i) => {
                        // Determine if Perimeter Stud (Leftmost or Rightmost)
                        const isLeft = Math.abs(beam.x - WALL_X) < 1;
                        const isRight = Math.abs((beam.x + beam.w) - (WALL_X + WALL_WIDTH)) < 1;
                        const isPerimeter = isLeft || isRight;

                        return (
                            <rect
                                key={i}
                                x={beam.x}
                                y={beam.y}
                                width={beam.w}
                                height={beam.h}
                                fill={timberColor}
                                stroke={timberStroke}
                                strokeWidth={isPerimeter ? "2" : "1"} // Internal 1px, Outer 2px
                            />
                        );
                    })}

                    {/* Render Openings */}
                    {drawOpenings && drawOpenings.map((op) => (
                        <g
                            key={op.id}
                            onPointerDown={(e) => handlePointerDown(e, op)}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            className={cn(
                                onOpeningsChange ? "cursor-move" : "",
                                draggingId === op.id ? "opacity-90" : ""
                            )}
                            style={{ cursor: onOpeningsChange ? 'move' : 'default' }}
                        >
                            {/* The hole itself */}
                            <rect
                                x={op.drawX}
                                y={op.drawY}
                                width={op.drawW}
                                height={op.drawH}
                                fill="#09090b"
                                stroke={draggingId === op.id ? "#10b981" : timberStroke}
                                strokeWidth={draggingId === op.id ? "2" : "1"}
                            />

                            {/* Optional: Cross */}
                            <line x1={op.drawX} y1={op.drawY} x2={op.drawX + op.drawW} y2={op.drawY + op.drawH} stroke={draggingId === op.id ? "#10b981" : timberStroke} strokeWidth="0.5" strokeDasharray="2,2" opacity="0.5" />
                            <line x1={op.drawX} y1={op.drawY + op.drawH} x2={op.drawX + op.drawW} y2={op.drawY} stroke={draggingId === op.id ? "#10b981" : timberStroke} strokeWidth="0.5" strokeDasharray="2,2" opacity="0.5" />

                        </g>
                    ))}

                    {/* Dimension Layer - Rendered on TOP of everything */}
                    {drawOpenings && (
                        <g className="text-emerald-500 pointer-events-none">
                            {(() => {
                                const sorted = [...drawOpenings].sort((a, b) => a.fromLeft - b.fromLeft);
                                const wallTopY = Math.min(yLeft, yRight, shape === 'gable' ? yPeak : yLeft);
                                const baselineY = wallTopY - 15;
                                const levelStep = 10;

                                return sorted.map((op, i) => {
                                    const levelY = baselineY - (i * levelStep);

                                    return (
                                        <g key={`dim-${op.id}`}>
                                            {/* 1. Internal Dimensions (Width x Height) - Centered inside */}
                                            <text
                                                x={op.drawX + op.drawW / 2}
                                                y={op.drawY + op.drawH / 2}
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                className="fill-emerald-500/90 text-[8px] font-mono select-none font-bold pointer-events-none"
                                            >
                                                {op.width} x {op.height}
                                            </text>

                                            {/* 2. From Bottom Dimension (Vertical line) - Only if > 0 */}
                                            {op.fromBottom > 0 && (
                                                <>
                                                    <line x1={op.drawX + op.drawW / 2} y1={Y_BOTTOM} x2={op.drawX + op.drawW / 2} y2={op.drawY + op.drawH} stroke="#10b981" strokeWidth="0.5" strokeDasharray="2,1" opacity="0.7" />
                                                    <text x={op.drawX + op.drawW / 2 + 3} y={(Y_BOTTOM + (op.drawY + op.drawH)) / 2} textAnchor="start" dominantBaseline="middle" className="fill-emerald-500/80 text-[6px] font-mono select-none font-medium text-xs">{op.fromBottom}</text>
                                                </>
                                            )}

                                            {/* 3. From Left Dimension (Stacked Above Wall) */}
                                            {/* Main Horizontal Line */}
                                            <line
                                                x1={WALL_X}
                                                y1={levelY}
                                                x2={op.drawX}
                                                y2={levelY}
                                                stroke="#10b981"
                                                strokeWidth="0.5"
                                                opacity="0.8"
                                            />

                                            {/* Extension Line Left (Wall Start) */}
                                            <line
                                                x1={WALL_X}
                                                y1={yLeft}
                                                x2={WALL_X}
                                                y2={levelY}
                                                stroke="#10b981"
                                                strokeWidth="0.5"
                                                strokeDasharray="1,2"
                                                opacity="0.3"
                                            />

                                            {/* Extension Line Right (Opening Start) */}
                                            <line
                                                x1={op.drawX}
                                                y1={op.drawY}
                                                x2={op.drawX}
                                                y2={levelY}
                                                stroke="#10b981"
                                                strokeWidth="0.5"
                                                strokeDasharray="1,2"
                                                opacity="0.3"
                                            />

                                            {/* Text Label (On the line) */}
                                            <rect x={(WALL_X + op.drawX) / 2 - 6} y={levelY - 3} width="12" height="6" fill="#09090b" opacity="0.8" />
                                            <text
                                                x={(WALL_X + op.drawX) / 2}
                                                y={levelY + 2} // centered vertically text
                                                textAnchor="middle"
                                                className="fill-emerald-500/90 text-[6px] font-mono select-none font-medium"
                                            >
                                                {op.fromLeft}
                                            </text>

                                            {/* Arrow ticks */}
                                            <line x1={WALL_X} y1={levelY - 2} x2={WALL_X} y2={levelY + 2} stroke="#10b981" strokeWidth="0.5" />
                                            <line x1={op.drawX} y1={levelY - 2} x2={op.drawX} y2={levelY + 2} stroke="#10b981" strokeWidth="0.5" />
                                        </g>
                                    );
                                });
                            })()}
                        </g>
                    )}


                    {/* --- DIMENSION LAYER (Reference Styles) --- */}
                    <g className="text-[#10b981] pointer-events-none font-mono">
                        <defs>
                            {/* Technical Drawing Markers - Smaller & Refined */}
                            <marker id="dim-arrow" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                                <path d="M0,0 L6,2 L0,4 Z" fill="#10b981" />
                            </marker>
                            <marker id="dim-arrow-start" markerWidth="6" markerHeight="4" refX="0" refY="2" orient="auto-start-reverse">
                                <path d="M0,0 L6,2 L0,4 Z" fill="#10b981" />
                            </marker>
                        </defs>

                        {/* 0. Total Length (TOP) - UPDATED */}
                        <g transform="translate(0, -15)">
                            <line x1={WALL_X} y1={yLeft} x2={WALL_X} y2={DIM_Y_TOP} stroke="#10b981" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.5" />
                            <line x1={WALL_X + WALL_WIDTH} y1={yRight} x2={WALL_X + WALL_WIDTH} y2={DIM_Y_TOP} stroke="#10b981" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.5" />

                            <line
                                x1={WALL_X} y1={DIM_Y_TOP}
                                x2={WALL_X + WALL_WIDTH} y2={DIM_Y_TOP}
                                stroke="#10b981" strokeWidth="1"
                                markerStart="url(#dim-arrow-start)" markerEnd="url(#dim-arrow)"
                            />
                            <rect x={WALL_X + WALL_WIDTH / 2 - 15} y={DIM_Y_TOP - 6} width="30" height="10" fill="#09090b" opacity="0.8" />
                            <text x={WALL_X + WALL_WIDTH / 2} y={DIM_Y_TOP + 3} textAnchor="middle" className="fill-[#10b981] text-[9px] font-bold">{lengteDisplay}</text>
                        </g>

                        {/* 1. Internal Gap Dimensions (H.O.H) - Bottom Layer 1 */}
                        {studData.gaps.map((gap, i) => {
                            const isFirst2 = i < 2;
                            const isLast2 = i >= studData.gaps.length - 2;
                            if (!isFirst2 && !isLast2) return null; // Simplified view

                            const midX = (gap.centerX1 + gap.centerX2) / 2;

                            return (
                                <g key={`gap-${i}`}>
                                    <line x1={gap.centerX1} y1={Y_BOTTOM} x2={gap.centerX1} y2={DIM_Y_GAP + 2} stroke="#10b981" strokeWidth="0.5" strokeDasharray="1,2" opacity="0.4" />
                                    <line x1={gap.centerX2} y1={Y_BOTTOM} x2={gap.centerX2} y2={DIM_Y_GAP + 2} stroke="#10b981" strokeWidth="0.5" strokeDasharray="1,2" opacity="0.4" />

                                    <line x1={gap.centerX1} y1={DIM_Y_GAP} x2={gap.centerX2} y2={DIM_Y_GAP} stroke="#10b981" strokeWidth="0.5" markerStart="url(#dim-arrow-start)" markerEnd="url(#dim-arrow)" />

                                    <text x={midX} y={DIM_Y_GAP - 2} textAnchor="middle" className="fill-[#10b981] text-[6px]">{Math.round(gap.value)}</text>
                                </g>
                            );
                        })}
                        {studData.gaps.length > 4 && (
                            <text x={WALL_X + WALL_WIDTH / 2} y={DIM_Y_GAP} textAnchor="middle" className="fill-[#10b981] text-[8px]">...</text>
                        )}

                        {/* 2. Segment Dimensions (L1, L2, L3) - Bottom Layer 2 */}
                        {(shape === 'l-shape' || shape === 'u-shape') && (
                            <g>
                                {/* L1 */}
                                <line x1={WALL_X} y1={Y_BOTTOM} x2={WALL_X} y2={DIM_Y_SEGMENTS + 5} stroke="#10b981" strokeWidth="0.5" strokeDasharray="1,2" opacity="0.5" />
                                <line x1={WALL_X + l1 * pxPerMm} y1={Y_BOTTOM} x2={WALL_X + l1 * pxPerMm} y2={DIM_Y_SEGMENTS + 5} stroke="#10b981" strokeWidth="0.5" strokeDasharray="1,2" opacity="0.5" />
                                <line x1={WALL_X} y1={DIM_Y_SEGMENTS} x2={WALL_X + l1 * pxPerMm} y2={DIM_Y_SEGMENTS} stroke="#10b981" strokeWidth="0.8" markerStart="url(#dim-arrow-start)" markerEnd="url(#dim-arrow)" />
                                <text x={WALL_X + (l1 * pxPerMm) / 2} y={DIM_Y_SEGMENTS - 3} textAnchor="middle" className="fill-[#10b981] text-[7px] font-bold">{l1}</text>

                                {/* L2 */}
                                <line x1={WALL_X + (l1 + l2) * pxPerMm} y1={Y_BOTTOM} x2={WALL_X + (l1 + l2) * pxPerMm} y2={DIM_Y_SEGMENTS + 5} stroke="#10b981" strokeWidth="0.5" strokeDasharray="1,2" opacity="0.5" />
                                <line x1={WALL_X + l1 * pxPerMm} y1={DIM_Y_SEGMENTS} x2={WALL_X + (l1 + l2) * pxPerMm} y2={DIM_Y_SEGMENTS} stroke="#10b981" strokeWidth="0.8" markerStart="url(#dim-arrow-start)" markerEnd="url(#dim-arrow)" />
                                <text x={WALL_X + l1 * pxPerMm + (l2 * pxPerMm) / 2} y={DIM_Y_SEGMENTS - 3} textAnchor="middle" className="fill-[#10b981] text-[7px] font-bold">{l2}</text>

                                {/* L3 */}
                                {shape === 'u-shape' && (
                                    <>
                                        <line x1={WALL_X + (l1 + l2 + l3) * pxPerMm} y1={Y_BOTTOM} x2={WALL_X + (l1 + l2 + l3) * pxPerMm} y2={DIM_Y_SEGMENTS + 5} stroke="#10b981" strokeWidth="0.5" strokeDasharray="1,2" opacity="0.5" />
                                        <line x1={WALL_X + (l1 + l2) * pxPerMm} y1={DIM_Y_SEGMENTS} x2={WALL_X + (l1 + l2 + l3) * pxPerMm} y2={DIM_Y_SEGMENTS} stroke="#10b981" strokeWidth="0.8" markerStart="url(#dim-arrow-start)" markerEnd="url(#dim-arrow)" />
                                        <text x={WALL_X + (l1 + l2) * pxPerMm + (l3 * pxPerMm) / 2} y={DIM_Y_SEGMENTS - 3} textAnchor="middle" className="fill-[#10b981] text-[7px] font-bold">{l3}</text>
                                    </>
                                )}
                            </g>
                        )}

                        {/* 3. Height Dimensions (Sides) */}
                        <g>
                            {/* Left Height (Total) */}
                            <line x1={WALL_X} y1={yLeft} x2={DIM_X_LEFT - 5} y2={yLeft} stroke="#10b981" strokeWidth="0.5" strokeDasharray="1,2" opacity="0.4" />
                            <line x1={WALL_X} y1={Y_BOTTOM} x2={DIM_X_LEFT - 5} y2={Y_BOTTOM} stroke="#10b981" strokeWidth="0.5" strokeDasharray="1,2" opacity="0.4" />
                            <line x1={DIM_X_LEFT} y1={yLeft} x2={DIM_X_LEFT} y2={Y_BOTTOM} stroke="#10b981" strokeWidth="1" markerStart="url(#dim-arrow-start)" markerEnd="url(#dim-arrow)" />
                            <text x={DIM_X_LEFT - 5} y={(yLeft + Y_BOTTOM) / 2} textAnchor="end" dominantBaseline="middle" className="fill-[#10b981] text-[8px] font-bold">{Math.round(hLeft)}</text>

                            {/* Right Height (Total) */}
                            <line x1={WALL_X + WALL_WIDTH} y1={yRight} x2={DIM_X_RIGHT + 5} y2={yRight} stroke="#10b981" strokeWidth="0.5" strokeDasharray="1,2" opacity="0.4" />
                            <line x1={WALL_X + WALL_WIDTH} y1={Y_BOTTOM} x2={DIM_X_RIGHT + 5} y2={Y_BOTTOM} stroke="#10b981" strokeWidth="0.5" strokeDasharray="1,2" opacity="0.4" />
                            <line x1={DIM_X_RIGHT} y1={yRight} x2={DIM_X_RIGHT} y2={Y_BOTTOM} stroke="#10b981" strokeWidth="1" markerStart="url(#dim-arrow-start)" markerEnd="url(#dim-arrow)" />
                            <text x={DIM_X_RIGHT + 5} y={(yRight + Y_BOTTOM) / 2} textAnchor="start" dominantBaseline="middle" className="fill-[#10b981] text-[8px] font-bold">{Math.round(hRight)}</text>
                        </g>

                        {/* 4. Internal Vertical Dimensions (e.g., U-Shape Void Height) */}
                        {((shape === 'u-shape' || shape === 'l-shape') && variant !== 'bottom') && (
                            <g>
                                {/* Horizontal Inner Dim (Width of L2) */}
                                {h2 < Math.max(h1, h3) && (
                                    <>
                                        {/* Horizontal Void Width */}
                                        {(() => {
                                            const voidTop = Math.min(yLeft, yRight);
                                            const voidBottom = yH2;
                                            const midY = (voidTop + voidBottom) / 2;

                                            return (
                                                <>
                                                    <line x1={WALL_X + l1 * pxPerMm} y1={midY} x2={WALL_X + (l1 + l2) * pxPerMm} y2={midY} stroke="#10b981" strokeWidth="1" markerStart="url(#dim-arrow-start)" markerEnd="url(#dim-arrow)" />
                                                    <rect x={WALL_X + l1 * pxPerMm + (l2 * pxPerMm) / 2 - 12} y={midY - 8} width="24" height="9" fill="#09090b" opacity="0.7" />
                                                    <text x={WALL_X + l1 * pxPerMm + (l2 * pxPerMm) / 2} y={midY - 2} textAnchor="middle" className="fill-[#10b981] text-[9px] font-bold">{l2}</text>
                                                </>
                                            )
                                        })()}

                                        {/* Vertical Void Height */}
                                        <line
                                            x1={WALL_X + l1 * pxPerMm + 20} y1={yH2}
                                            x2={WALL_X + l1 * pxPerMm + 20} y2={Y_BOTTOM}
                                            stroke="#10b981" strokeWidth="1" markerStart="url(#dim-arrow-start)" markerEnd="url(#dim-arrow)"
                                        />
                                        <text x={WALL_X + l1 * pxPerMm + 28} y={(yH2 + Y_BOTTOM) / 2} textAnchor="start" className="fill-[#10b981] text-[9px] font-bold">{h2}</text>
                                    </>
                                )}
                            </g>
                        )}
                        {/* Ridge */}
                        {shape === 'gable' && (
                            <g>
                                <line x1={WALL_X + WALL_WIDTH / 2} y1={yPeak} x2={WALL_X + WALL_WIDTH / 2 + 40} y2={yPeak} stroke="#10b981" strokeWidth="0.5" strokeDasharray="2,2" />
                                <text x={WALL_X + WALL_WIDTH / 2 + 5} y={yPeak - 4} textAnchor="start" className="fill-[#10b981] text-[8px] font-bold">{hP_disp}</text>
                            </g>
                        )}
                    </g>
                </g>

                {/* MAGNIFIER LENS */}
                {isMagnifier && lensPos.x !== 0 && (
                    <g pointerEvents="none">
                        <defs>
                            <clipPath id="magnifier-clip">
                                <circle cx={lensPos.x} cy={lensPos.y} r={60} />
                            </clipPath>
                        </defs>

                        {/* Shadow/Border Ring behind */}
                        <circle cx={lensPos.x} cy={lensPos.y} r={62} fill="black" opacity="0.5" />

                        {/* The Magnified Content */}
                        <g clipPath="url(#magnifier-clip)">
                            {/* Opaque background inside lens to hide non-magnified stuff behind it */}
                            <rect x={lensPos.x - 60} y={lensPos.y - 60} width={120} height={120} fill="#09090b" />
                            <use
                                href="#main-drawing"
                                transform={`translate(${-lensPos.x}, ${-lensPos.y}) scale(2)`}
                            />
                        </g>

                        {/* Lens Border / Crosshair */}
                        <circle cx={lensPos.x} cy={lensPos.y} r={60} stroke="#10b981" strokeWidth="2" fill="none" />
                        <line x1={lensPos.x - 5} y1={lensPos.y} x2={lensPos.x + 5} y2={lensPos.y} stroke="#10b981" strokeWidth="1" opacity="0.5" />
                        <line x1={lensPos.x} y1={lensPos.y - 5} x2={lensPos.x} y2={lensPos.y + 5} stroke="#10b981" strokeWidth="1" opacity="0.5" />
                    </g>
                )}
            </svg>
        </div>
    );
}

export default WallStructureVisualizer;
