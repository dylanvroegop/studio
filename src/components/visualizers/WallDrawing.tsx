'use client';

import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { WallOpening, DrawingData, Beam } from '@/lib/drawing-types';
import { OpeningLabels } from './shared/OpeningLabels';
import { GridMeasurements, OpeningMeasurements, OverallDimensions, DimensionLine } from './shared/measurements';
import { BaseDrawingFrame } from './BaseDrawingFrame';
import { Dagkant, Vensterbank } from '../openingen/OpeningCard';
import { LeidingkoofItem } from '../leidingkoof/LeidingkoofSection';

export { type WallOpening };

export interface WallDrawingProps {
    lengte: string | number;
    hoogte?: string | number;
    shape?: 'rectangle' | 'slope' | 'gable' | 'l-shape' | 'u-shape';
    hoogteLinks?: string | number;
    hoogteRechts?: string | number;
    hoogteNok?: string | number;
    lengte1?: string | number;
    hoogte1?: string | number;
    lengte2?: string | number;
    hoogte2?: string | number;
    lengte3?: string | number;
    hoogte3?: string | number;
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
    doubleTopPlate?: boolean;
    doubleBottomPlate?: boolean;
    doubleEndBeams?: boolean;
    dagkanten?: Dagkant[];
    vensterbanken?: Vensterbank[];
    leidingkofen?: LeidingkoofItem[];
    onLeidingkoofChange?: (updated: LeidingkoofItem[]) => void;
}

type LogicalBeam = {
    type: string;
    xMm: number;
    yMm: number;
    wMm: number;
    hMm: number;
};



type RenderGap = {
    value: number;
    startMm: number;
    endMm: number;
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
    title,
    doubleTopPlate = false,
    doubleBottomPlate = false,
    doubleEndBeams = false,
    dagkanten = [],
    vensterbanken = [],
    leidingkofen = [],
    onLeidingkoofChange,
    onDataGenerated
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

    // Helper: Get Wall Top Y (mm) at given X 
    const getWallTopMm = useCallback((xMm: number) => {
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
    }, [lengteNum, variant, shape, maxH, hLeft, hRight, hPeak, l1, l2, h1, h2, h3]);

    const getWallBottomMm = useCallback((xMm: number) => {
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
    }, [variant, lengteNum, shape, maxH, hLeft, hRight, l1, l2, h1, h2, h3]);

    const STUD_W = 50;
    const HALF_STUD = 25;
    const PLATE_HEIGHT_MM = 44;

    // --- CALCULATE LOGICAL STRUCTURE (MEMOIZED) ---
    const structure = useMemo(() => {
        if (lengteNum <= 0 || balkafstandNum <= 0) return { beams: [], gaps: [] };

        const b: LogicalBeam[] = [];
        const g: RenderGap[] = [];

        type Segment = { startX: number; length: number; label: string };
        const segments: Segment[] = [];
        if (shape === 'l-shape') { segments.push({ startX: 0, length: l1, label: 'L1' }); segments.push({ startX: l1, length: lengteNum - l1, label: 'L2' }); }
        else if (shape === 'u-shape') { segments.push({ startX: 0, length: l1, label: 'L1' }); segments.push({ startX: l1, length: l2, label: 'L2' }); segments.push({ startX: l1 + l2, length: lengteNum - (l1 + l2), label: 'L3' }); }
        else { segments.push({ startX: 0, length: lengteNum, label: 'Main' }); }

        segments.forEach((seg) => {
            if (seg.length <= 0) return;
            const segBeams: number[] = [seg.startX]; // Start Stud
            if (doubleEndBeams) segBeams.push(seg.startX + STUD_W); // Double Start

            const endStudX = seg.startX + seg.length - STUD_W;
            if (endStudX > seg.startX + 1) {
                segBeams.push(endStudX); // End Stud
                if (doubleEndBeams) segBeams.push(endStudX - STUD_W); // Double End
            }

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

                const topPlatesCount = doubleTopPlate ? 2 : 1;
                const bottomPlatesCount = doubleBottomPlate ? 2 : 1;

                // Adjust stud height for double plates
                const studTopMm = wt - (PLATE_HEIGHT_MM * topPlatesCount);
                const studBottomMm = wb + (PLATE_HEIGHT_MM * bottomPlatesCount);
                const hMm = studTopMm - studBottomMm;

                const fullBeam: LogicalBeam = { xMm, yMm: studBottomMm, wMm: STUD_W, hMm, type: 'stud' };

                const op = openings.find(o => (xMm + STUD_W > o.fromLeft && xMm < o.fromLeft + o.width));
                if (op) {
                    // Header Height Calculation including Double
                    const headerThick = op.headerDikte || STUD_W;
                    const headerBaseY = op.fromBottom + op.height;
                    const headerTopY = headerBaseY + headerThick + (op.dubbeleBovendorpel ? headerThick : 0);

                    const topCripH = studTopMm - headerTopY; // Start from top of (double) header
                    if (topCripH > 10) b.push({ ...fullBeam, yMm: headerTopY, hMm: topCripH, type: 'cripple-top' });

                    // Sill Height Calculation including Double
                    const sillThick = op.onderdorpelDikte || STUD_W;
                    const sillTopY = op.fromBottom;
                    const sillBottomY = sillTopY - sillThick - (op.dubbeleOnderdorpel ? sillThick : 0);

                    const botCripH = sillBottomY - studBottomMm;
                    if (botCripH > 10) b.push({ ...fullBeam, yMm: studBottomMm, hMm: botCripH, type: 'cripple-bottom' });
                } else {
                    b.push(fullBeam);
                }
            });

            // Gaps
            const centers = uniqueX.map(x => x + HALF_STUD);
            for (let i = 0; i < centers.length - 1; i++) {
                const startMm = (i === 0) ? seg.startX : centers[i];
                const endMm = (i === centers.length - 2) ? seg.startX + seg.length : centers[i + 1];
                g.push({ value: endMm - startMm, startMm, endMm });
            }
        });

        // Fixed Openings Frames & HSB Detail
        openings.forEach(op => {
            const studW = 50;
            // King Left
            const klCenter = (op.fromLeft - studW) + HALF_STUD;
            const wtL = getWallTopMm(klCenter); const wbL = getWallBottomMm(klCenter);
            const khL = (wtL - PLATE_HEIGHT_MM) - (wbL + PLATE_HEIGHT_MM);
            b.push({ xMm: op.fromLeft - studW, yMm: wbL + PLATE_HEIGHT_MM, wMm: STUD_W, hMm: khL, type: 'king' });

            // Double King Left
            if (op.dubbeleStijlLinks) {
                const dkX = op.fromLeft - (studW * 2);
                const dkCenter = dkX + HALF_STUD;
                const wt = getWallTopMm(dkCenter); const wb = getWallBottomMm(dkCenter);
                const h = (wt - PLATE_HEIGHT_MM) - (wb + PLATE_HEIGHT_MM);
                b.push({ xMm: dkX, yMm: wb + PLATE_HEIGHT_MM, wMm: STUD_W, hMm: h, type: 'king' });
            }

            // Trimmer (Jack) Support Logic
            if (op.trimmer) {
                const trimL_X = op.fromLeft;
                const trimR_X = op.fromLeft + op.width - studW;

                // Left Jack
                const jlBot = getWallBottomMm(trimL_X + HALF_STUD) + PLATE_HEIGHT_MM;
                const jackTopMm = op.fromBottom;
                const jlHeight = jackTopMm - jlBot;
                if (jlHeight > 10) {
                    b.push({ xMm: trimL_X, yMm: jlBot, wMm: STUD_W, hMm: jlHeight, type: 'stud' });
                }

                // Right Jack
                const jrBot = getWallBottomMm(trimR_X + HALF_STUD) + PLATE_HEIGHT_MM;
                const jrHeight = jackTopMm - jrBot;
                if (jrHeight > 10) {
                    b.push({ xMm: trimR_X, yMm: jrBot, wMm: STUD_W, hMm: jrHeight, type: 'stud' });
                }
            }

            // King Right
            const krCenter = (op.fromLeft + op.width) + HALF_STUD;
            const wtR = getWallTopMm(krCenter); const wbR = getWallBottomMm(krCenter);
            const khR = (wtR - PLATE_HEIGHT_MM) - (wbR + PLATE_HEIGHT_MM);
            b.push({ xMm: op.fromLeft + op.width, yMm: wbR + PLATE_HEIGHT_MM, wMm: STUD_W, hMm: khR, type: 'king' });

            // Double King Right
            if (op.dubbeleStijlRechts) {
                const dkX = op.fromLeft + op.width + studW;
                const dkCenter = dkX + HALF_STUD;
                const wt = getWallTopMm(dkCenter); const wb = getWallBottomMm(dkCenter);
                const h = (wt - PLATE_HEIGHT_MM) - (wb + PLATE_HEIGHT_MM);
                b.push({ xMm: dkX, yMm: wb + PLATE_HEIGHT_MM, wMm: STUD_W, hMm: h, type: 'king' });
            }

            const hMmVal = op.headerDikte || STUD_W;
            const headerBottomMm = op.fromBottom + op.height;
            // Header
            b.push({
                xMm: op.fromLeft,
                yMm: headerBottomMm,
                wMm: op.width,
                hMm: hMmVal,
                type: 'header'
            });

            // Double Header
            if (op.dubbeleBovendorpel) {
                b.push({
                    xMm: op.fromLeft,
                    yMm: headerBottomMm + hMmVal,
                    wMm: op.width,
                    hMm: hMmVal,
                    type: 'header'
                });
            }

            // Standard Sill (Windows/Openings)
            if (op.type !== 'door' && op.type !== 'door-frame') {
                const sillH = op.onderdorpelDikte ? op.onderdorpelDikte : STUD_W;
                b.push({ xMm: op.fromLeft, yMm: op.fromBottom - sillH, wMm: op.width, hMm: sillH, type: 'sill' });

                // Double Sill
                if (op.dubbeleOnderdorpel) {
                    b.push({ xMm: op.fromLeft, yMm: op.fromBottom - sillH - sillH, wMm: op.width, hMm: sillH, type: 'sill' });
                }
            }
        });

        return { beams: b, gaps: g };
    }, [lengteNum, balkafstandNum, shape, doubleEndBeams, doubleTopPlate, doubleBottomPlate, openings, getWallTopMm, getWallBottomMm, l1, l2]);

    // Area Calculation
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

    // Emit Data
    const lastEmittedRef = useRef<string>('');
    useEffect(() => {
        if (!onDataGenerated) return;

        const data: DrawingData = {
            walls: [{ label: 'Main', lengte: lengteNum, hoogte: maxH, shape }],
            beams: structure.beams.map(b => ({
                ...b,
                type: b.type as Beam['type'],
                x: b.xMm, y: b.yMm, xMm: b.xMm, yMm: b.yMm, wMm: b.wMm, hMm: b.hMm
            })),
            dimensions: [],
            params: {
                doubleTopPlate, doubleBottomPlate, doubleEndBeams, balkafstand,
                dagkanten,
                vensterbanken
            }
        };

        const json = JSON.stringify(data);
        if (json !== lastEmittedRef.current) {
            lastEmittedRef.current = json;
            onDataGenerated(data);
        }
    }, [structure, onDataGenerated, lengteNum, maxH, shape, openings, doubleTopPlate, doubleBottomPlate, doubleEndBeams, balkafstand]);


    // Internal Drag State
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [draggingType, setDraggingType] = useState<'opening' | 'koof' | null>(null);
    const dragStartRef = useRef<{ x: number; y: number; id: string; origLeft: number; origBottom: number } | null>(null);
    const metricsRef = useRef<{ pxPerMm: number } | null>(null);

    const handlePointerDown = (e: React.PointerEvent, op: WallOpening) => {
        if (isMagnifier) return;
        if (!onOpeningsChange) return;
        e.preventDefault();
        e.stopPropagation();
        (e.target as Element).setPointerCapture(e.pointerId);
        setDraggingId(op.id);
        setDraggingType('opening');
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            id: op.id,
            origLeft: op.fromLeft,
            origBottom: op.fromBottom
        };
    };

    const handleKoofPointerDown = (e: React.PointerEvent, koof: LeidingkoofItem) => {
        if (isMagnifier) return;
        if (!onLeidingkoofChange) return;
        e.preventDefault();
        e.stopPropagation();
        (e.target as Element).setPointerCapture(e.pointerId);
        setDraggingId(koof.id);
        setDraggingType('koof');
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            id: koof.id,
            origLeft: Number(koof.vanLinks) || 0,
            origBottom: Number(koof.vanOnder) || 0
        };
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!draggingId || !dragStartRef.current || !metricsRef.current) return;

        const { pxPerMm } = metricsRef.current;
        const start = dragStartRef.current;

        const dxPx = e.clientX - start.x;
        const dyPx = e.clientY - start.y;

        const dxMm = dxPx / pxPerMm;
        const dyMm = -(dyPx / pxPerMm);

        const newLeft = Math.max(0, Math.round(start.origLeft + dxMm));
        const newBottom = Math.max(0, Math.round(start.origBottom + dyMm));

        if (draggingType === 'opening' && onOpeningsChange) {
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
        } else if (draggingType === 'koof' && onLeidingkoofChange) {
            const SNAP_THRESHOLD = 50; // mm
            const updatedKofen = leidingkofen.map(k => {
                if (k.id !== draggingId) return k;

                const orientation = k.orientation || 'side';
                const koofLengte = Number(k.lengte) || 0;
                const koofHoogte = Number(k.hoogte) || 0;
                const rectWMm = orientation === 'side' ? koofHoogte : koofLengte;
                const rectHMm = orientation === 'side' ? koofLengte : koofHoogte;

                let finalLeft = newLeft;
                let finalBottom = newBottom;

                // Snap to left wall edge
                if (finalLeft < SNAP_THRESHOLD) {
                    finalLeft = 0;
                }
                // Snap to right wall edge
                if (lengteNum > 0 && (finalLeft + rectWMm) > (lengteNum - SNAP_THRESHOLD)) {
                    finalLeft = Math.max(0, lengteNum - rectWMm);
                }
                // Snap to bottom (floor)
                if (finalBottom < SNAP_THRESHOLD) {
                    finalBottom = 0;
                }
                // Snap to top (ceiling)
                if (maxH > 0 && (finalBottom + rectHMm) > (maxH - SNAP_THRESHOLD)) {
                    finalBottom = Math.max(0, maxH - rectHMm);
                }

                // Calculate sides logic
                let sides = 3;
                if (lengteNum > 0 && (finalLeft === 0 || Math.abs(finalLeft + rectWMm - lengteNum) < 2)) {
                    sides = 2;
                }
                if (maxH > 0 && (finalBottom === 0 || Math.abs(finalBottom + rectHMm - maxH) < 2)) {
                    sides = 2;
                }

                return { ...k, vanLinks: finalLeft, vanOnder: finalBottom, aantalZijden: sides };
            });
            onLeidingkoofChange(updatedKofen);
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (draggingId) {
            (e.target as Element).releasePointerCapture(e.pointerId);
            setDraggingId(null);
            setDraggingType(null);
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
            primarySpacing={undefined}
            gridLabel={!balkafstand ? 'Wand Vlak' : undefined}
            suppressTotalDimensions={true}
        >
            {(ctx) => {
                metricsRef.current = ctx;
                const { startX, startY, rectW, rectH, pxPerMm, SVG_HEIGHT } = ctx;

                const WALL_X = startX;
                const WALL_WIDTH = rectW;
                const Y_BOTTOM = startY + rectH;
                const getY = (mm: number) => Y_BOTTOM - (mm * pxPerMm);

                // Convert Logical Structure to Render Objects
                const timberW = Math.max(1.5, STUD_W * pxPerMm);
                const PLATE_HEIGHT = PLATE_HEIGHT_MM * pxPerMm;

                const beams = structure.beams.map(b => ({
                    x: WALL_X + b.xMm * pxPerMm,
                    y: getY(b.yMm + b.hMm),
                    w: b.wMm * pxPerMm < timberW ? timberW : b.wMm * pxPerMm,
                    h: b.hMm * pxPerMm,
                    type: b.type
                }));

                const renderGaps = structure.gaps.map(g => ({
                    value: g.value,
                    c1: WALL_X + g.startMm * pxPerMm,
                    c2: WALL_X + g.endMm * pxPerMm
                }));

                // Plate Paths Generation
                const generateTopPlatePath = (offsetLevel: number) => {
                    const extraY = offsetLevel * PLATE_HEIGHT;
                    if (shape === 'slope') {
                        return `${WALL_X},${getY(hLeft) + extraY} ${WALL_X + WALL_WIDTH},${getY(hRight) + extraY} ${WALL_X + WALL_WIDTH},${getY(hRight) + PLATE_HEIGHT + extraY} ${WALL_X},${getY(hLeft) + PLATE_HEIGHT + extraY}`;
                    } else if (shape === 'gable') {
                        const midX = WALL_X + WALL_WIDTH / 2;
                        const peakY = getY(hPeak);
                        return `${WALL_X},${getY(hLeft) + extraY} ${midX},${peakY + extraY} ${WALL_X + WALL_WIDTH},${getY(hRight) + extraY} ${WALL_X + WALL_WIDTH},${getY(hRight) + PLATE_HEIGHT + extraY} ${midX},${peakY + PLATE_HEIGHT + extraY} ${WALL_X},${getY(hLeft) + PLATE_HEIGHT + extraY}`;
                    } else {
                        return `${WALL_X},${getY(hLeft) + extraY} ${WALL_X + WALL_WIDTH},${getY(hRight) + extraY} ${WALL_X + WALL_WIDTH},${getY(hRight) + PLATE_HEIGHT + extraY} ${WALL_X},${getY(hLeft) + PLATE_HEIGHT + extraY}`;
                    }
                };

                const topPlatePath = generateTopPlatePath(0);
                const topPlate2Path = doubleTopPlate ? generateTopPlatePath(1) : null;

                const yBot = getY(0);
                const bottomPlatePath = `${WALL_X},${yBot - PLATE_HEIGHT} ${WALL_X + WALL_WIDTH},${yBot - PLATE_HEIGHT} ${WALL_X + WALL_WIDTH},${yBot} ${WALL_X},${yBot}`;
                const bottomPlate2Path = doubleBottomPlate ? `${WALL_X},${yBot - (PLATE_HEIGHT * 2)} ${WALL_X + WALL_WIDTH},${yBot - (PLATE_HEIGHT * 2)} ${WALL_X + WALL_WIDTH},${yBot - PLATE_HEIGHT} ${WALL_X},${yBot - PLATE_HEIGHT}` : null;

                const segments: { len: number }[] = [];
                if (shape === 'l-shape') { segments.push({ len: l1 }); segments.push({ len: l2 }); }
                else if (shape === 'u-shape') { segments.push({ len: l1 }); segments.push({ len: l2 }); segments.push({ len: l3 }); }

                return (
                    <>
                        <polygon points={topPlatePath} fill="rgb(70, 75, 85)" stroke="rgb(55, 60, 70)" strokeWidth="0.5" />
                        {topPlate2Path && <polygon points={topPlate2Path} fill="rgb(70, 75, 85)" stroke="rgb(55, 60, 70)" strokeWidth="0.5" />}

                        <polygon points={bottomPlatePath} fill="rgb(70, 75, 85)" stroke="rgb(55, 60, 70)" strokeWidth="0.5" />
                        {bottomPlate2Path && <polygon points={bottomPlate2Path} fill="rgb(70, 75, 85)" stroke="rgb(55, 60, 70)" strokeWidth="0.5" />}
                        {beams.map((b, i: number) => <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill="rgb(70, 75, 85)" stroke="rgb(55, 60, 70)" strokeWidth="0.5" />)}

                        {openings.map((op) => {
                            const wPx = op.width * pxPerMm;
                            const hPx = op.height * pxPerMm;
                            const drawX = WALL_X + op.fromLeft * pxPerMm;
                            const drawY = getY(op.fromBottom + op.height);

                            let onderdorpelRect = null;
                            if ((op.type === 'door' || op.type === 'door-frame') && op.onderdorpel && op.onderdorpelDikte) {
                                const thPx = op.onderdorpelDikte * pxPerMm;
                                const odY = getY(op.fromBottom + op.onderdorpelDikte);
                                onderdorpelRect = <rect x={drawX} y={odY} width={wPx} height={thPx} fill="rgb(70, 75, 85)" stroke="rgb(55, 60, 70)" strokeWidth="0.5" />;
                            }

                            return (
                                <g key={op.id}
                                    onPointerDown={(e) => handlePointerDown(e, op)}
                                    style={{ cursor: onOpeningsChange ? 'move' : 'default' }}
                                >
                                    <rect x={drawX} y={drawY} width={wPx} height={hPx} fill="#09090b" stroke={draggingId === op.id ? "#10b981" : "rgb(55, 60, 70)"} strokeWidth={draggingId === op.id ? "2" : "1"} />

                                    {/* Dagkanten Depths Visualization */}
                                    {(() => {
                                        const opDagkant = dagkanten.find(d => d.openingId === op.id);
                                        if (!opDagkant || !opDagkant.diepte) return null;

                                        const dPx = Math.min(Number(opDagkant.diepte) * 0.2, 40) * pxPerMm; // Scale down depth for visual sanity
                                        const inset = 1 * pxPerMm;

                                        return (
                                            <g opacity="0.6">
                                                {/* Dagkant depth lines - white */}
                                                <rect
                                                    x={drawX + inset}
                                                    y={drawY + inset}
                                                    width={wPx - inset * 2}
                                                    height={hPx - inset * 2}
                                                    fill="none"
                                                    stroke="#ffffff"
                                                    strokeWidth="1"
                                                />
                                                <line x1={drawX} y1={drawY} x2={drawX + inset * 4} y2={drawY + inset * 4} stroke="#ffffff" strokeWidth="1" />
                                                <line x1={drawX + wPx} y1={drawY} x2={drawX + wPx - inset * 4} y2={drawY + inset * 4} stroke="#ffffff" strokeWidth="1" />
                                                <line x1={drawX} y1={drawY + hPx} x2={drawX + inset * 4} y2={drawY + hPx - inset * 4} stroke="#ffffff" strokeWidth="1" />
                                                <line x1={drawX + wPx} y1={drawY + hPx} x2={drawX + wPx - inset * 4} y2={drawY + hPx - inset * 4} stroke="#ffffff" strokeWidth="1" />
                                            </g>
                                        );
                                    })()}

                                    {/* Vensterbank Visualization */}
                                    {(() => {
                                        const opVensterbank = vensterbanken.find(v => v.openingId === op.id);
                                        if (!opVensterbank) return null;

                                        const uitL = (Number(opVensterbank.uitstekLinks) || 0) * pxPerMm;
                                        const uitR = (Number(opVensterbank.uitstekRechts) || 0) * pxPerMm;
                                        const vbDiepte = (Number(opVensterbank.diepte) || 20) * pxPerMm;
                                        const vbH = 4 * pxPerMm; // Visual thickness of the sill board

                                        const vbX = drawX - uitL;
                                        const vbY = drawY + hPx;
                                        const vbW = wPx + uitL + uitR;

                                        return (
                                            <g>
                                                <rect
                                                    x={vbX}
                                                    y={vbY}
                                                    width={vbW}
                                                    height={vbH}
                                                    fill="#10b981"
                                                    fillOpacity="0.2"
                                                    stroke="#10b981"
                                                    strokeWidth="0.5"
                                                />
                                                {/* Optional front face / detail */}
                                                <rect x={vbX} y={vbY} width={vbW} height={1} fill="#10b981" fillOpacity="0.8" />
                                            </g>
                                        );
                                    })()}

                                    {onderdorpelRect}
                                    <line x1={drawX} y1={drawY} x2={drawX + wPx} y2={drawY + hPx} stroke="rgb(55, 60, 70)" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.5" />
                                    <line x1={drawX} y1={drawY + hPx} x2={drawX + wPx} y2={drawY} stroke="rgb(55, 60, 70)" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.5" />
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

                        {/* Leidingkoof Visualization */}
                        {leidingkofen.map((koof) => {
                            const koofLengte = Number(koof.lengte) || 0;
                            const koofHoogte = Number(koof.hoogte) || 0;
                            const koofVanLinks = Number(koof.vanLinks) || 0;
                            const koofVanOnder = Number(koof.vanOnder) || 0;
                            const orientation = koof.orientation || 'side';

                            if (koofLengte <= 0 || koofHoogte <= 0) return null;

                            // Side: lengte = vertical height on wall, hoogte = horizontal width
                            // Top: lengte = horizontal width on wall, hoogte = vertical height
                            const rectWMm = orientation === 'side' ? koofHoogte : koofLengte;
                            const rectHMm = orientation === 'side' ? koofLengte : koofHoogte;

                            const koofX = WALL_X + koofVanLinks * pxPerMm;
                            const koofY = getY(koofVanOnder + rectHMm);
                            const koofW = rectWMm * pxPerMm;
                            const koofH = rectHMm * pxPerMm;
                            const isDragging = draggingId === koof.id;

                            return (
                                <g
                                    key={koof.id}
                                    onPointerDown={(e) => handleKoofPointerDown(e, koof)}
                                    onPointerMove={handlePointerMove}
                                    onPointerUp={handlePointerUp}
                                    style={{ cursor: onLeidingkoofChange ? 'move' : 'default' }}
                                >
                                    {/* Opaque background to hide beams */}
                                    <rect
                                        x={koofX}
                                        y={koofY}
                                        width={koofW}
                                        height={koofH}
                                        fill="#09090b"
                                    />
                                    {/* Semi-transparent blue overlay */}
                                    <rect
                                        x={koofX}
                                        y={koofY}
                                        width={koofW}
                                        height={koofH}
                                        fill="rgba(59, 130, 246, 0.15)"
                                        stroke={isDragging ? "#3b82f6" : "rgba(59, 130, 246, 0.5)"}
                                        strokeWidth={isDragging ? "2" : "1"}
                                        strokeDasharray={isDragging ? "none" : "4,2"}
                                    />
                                    <text
                                        x={koofX + koofW / 2}
                                        y={koofY + koofH / 2}
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                        fill="rgba(96, 165, 250, 1)"
                                        fontSize={Math.min(10, koofH * 0.4)}
                                        fontWeight="bold"
                                        style={{ pointerEvents: 'none', fontFamily: 'monospace' }}
                                    >
                                        Koof
                                    </text>
                                    {/* Beam on opposite side when snapped to wall edge */}
                                    {koofVanLinks === 0 && orientation === 'side' && (
                                        <rect
                                            x={koofX + koofW}
                                            y={koofY}
                                            width={STUD_W * pxPerMm}
                                            height={koofH}
                                            fill="rgb(70, 75, 85)"
                                            stroke="rgb(55, 60, 70)"
                                            strokeWidth="0.5"
                                        />
                                    )}
                                    {lengteNum > 0 && Math.abs(koofVanLinks + rectWMm - lengteNum) < 1 && orientation === 'side' && (
                                        <rect
                                            x={koofX - STUD_W * pxPerMm}
                                            y={koofY}
                                            width={STUD_W * pxPerMm}
                                            height={koofH}
                                            fill="rgb(70, 75, 85)"
                                            stroke="rgb(55, 60, 70)"
                                            strokeWidth="0.5"
                                        />
                                    )}
                                </g>
                            );
                        })}

                        <OverallDimensions
                            wallLength={lengteNum}
                            wallHeight={maxH}
                            svgBaseX={WALL_X}
                            svgBaseY={Y_BOTTOM}
                            pxPerMm={pxPerMm}
                        />

                        {segments.length > 0 && (
                            <g>
                                {(() => {
                                    let currentX = WALL_X;
                                    return segments.map((seg, i) => {
                                        const wPx = seg.len * pxPerMm;
                                        const endX = currentX + wPx;
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

                        {renderGaps.length > 0 && <GridMeasurements gaps={renderGaps} svgBaseYTop={getY(maxH)} />}

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
