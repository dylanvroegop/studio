/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';
import { RoofDrawingProps } from './RoofDrawing';
import { OverallDimensions, OpeningMeasurements } from './shared/measurements';
import { OpeningLabels } from './shared/OpeningLabels';

type EPDMDrawingProps = Omit<RoofDrawingProps, 'edgeLeft' | 'edgeRight' | 'onEdgeChange'> & {
    dakrandWidth?: number;
    edgeTop?: 'free' | 'wall';
    edgeBottom?: 'free' | 'wall';
    edgeLeft?: 'free' | 'wall';
    edgeRight?: 'free' | 'wall';
    onEdgeChange?: (side: 'top' | 'bottom' | 'left' | 'right', value: 'free' | 'wall') => void;
};

const labelColor = "rgb(100, 116, 139)"; // Slate-500

const labelMap: Record<string, string> = {
    'dakraam': 'Lichtkoepel',
    'schoorsteen': 'Schoorsteen',
    'pijp': 'Pijp',
    'afvoer': 'HWA',
    'opening': 'Sparing',
    'nis': 'Nis'
};

export function EPDMDrawing({
    lengte,
    hoogte,
    dakrandWidth = 0,
    edgeTop = 'wall', // Default Top to Wall (standard Gevel)
    edgeBottom = 'free',
    edgeLeft = 'free',
    edgeRight = 'free',
    openings = [],
    title = 'Dak Vlak',
    className,
    fitContainer,
    // isMagnifier, // Unused
    onOpeningsChange,
    onEdgeChange,
    shape = 'rectangle',
    // L-Shape / U-Shape specific
    lengte1, hoogte1, lengte2, hoogte2, lengte3, hoogte3,
    // Slope / Gable
    hoogteLinks, hoogteRechts, hoogteNok,
    variant
}: EPDMDrawingProps) {
    // State for drag
    const [draggingId, setDraggingId] = React.useState<string | null>(null);
    const dragStartRef = React.useRef<{ x: number; y: number; opId: string; origLeft: number; origBottom: number } | null>(null);
    const metricsRef = React.useRef<any>(null);
    const clipBaseId = React.useId(); // Move hook to top level

    const handlePointerDown = (e: React.PointerEvent, op: any) => {
        if (!onOpeningsChange) return;
        e.preventDefault();
        e.stopPropagation();
        (e.target as Element).setPointerCapture(e.pointerId);
        setDraggingId(op.id);

        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            opId: op.id,
            origLeft: op.fromLeft || 0,
            origBottom: op.fromBottom || 0
        };
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!draggingId || !dragStartRef.current || !onOpeningsChange) return;

        const pxPerMm = metricsRef.current?.pxPerMm || 1;
        const start = dragStartRef.current;

        const dxPx = e.clientX - start.x;
        const dyPx = e.clientY - start.y;

        const dxMm = dxPx / pxPerMm;
        const dyMm = dyPx / pxPerMm; // Y is Top-Down, so +dy means Down

        // Update positions
        const draggedOp = openings.find((o: any) => o.id === draggingId);
        if (!draggedOp) return;

        // X: simple add
        // Y: +dy means moving down. 'fromBottom' means distance from bottom.
        // Moving down REDUCES fromBottom.
        let newLeft = Math.round(start.origLeft + dxMm);
        let newBottom = Math.round(start.origBottom - dyMm);

        const opW = draggedOp.width || 0;
        const opH = draggedOp.height || 0;

        const L = typeof lengte === 'number' ? lengte : parseFloat(String(lengte)) || 0;
        const H = typeof hoogte === 'number' ? hoogte : parseFloat(String(hoogte)) || 0;

        newLeft = Math.max(0, Math.min(newLeft, L - opW));
        newBottom = Math.max(0, Math.min(newBottom, H - opH));

        onOpeningsChange(openings.map((o: any) =>
            o.id === draggingId ? { ...o, fromLeft: newLeft, fromBottom: newBottom } : o
        ));
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (draggingId) {
            setDraggingId(null);
            dragStartRef.current = null;
            (e.target as Element).releasePointerCapture(e.pointerId);
        }
    };

    const lengteNum = typeof lengte === 'number' ? lengte : parseFloat(String(lengte)) || 0;
    const heightNum = typeof hoogte === 'number' ? hoogte : parseFloat(String(hoogte)) || 0;
    const dakrandNum = typeof dakrandWidth === 'number' ? dakrandWidth : parseFloat(String(dakrandWidth)) || 0;

    // Resolve heights based on shape
    let hLeft = heightNum;
    let hRight = heightNum;
    let hPeak = 0;

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

    const areaStats = React.useMemo(() => {
        let areaMm2 = 0;
        const L = lengteNum;
        const H = effectiveHeight; // Use effective height default

        if (shape === 'rectangle') areaMm2 = L * H;
        else if (shape === 'slope') areaMm2 = L * ((hLeft + hRight) / 2);
        else if (shape === 'gable') areaMm2 = L * ((hLeft + hPeak) / 2);
        else if (shape === 'l-shape') areaMm2 = (l1 * h1) + ((L - l1) * h2);
        else if (shape === 'u-shape') areaMm2 = (l1 * h1) + (l2 * h2) + ((L - l1 - l2) * h3);
        else areaMm2 = L * H;

        const opArea = openings.reduce((acc, op) => acc + (op.width * op.height), 0);
        return {
            gross: areaMm2,
            net: Math.max(0, areaMm2 - opArea),
            hasOpenings: opArea > 0
        };
    }, [lengteNum, effectiveHeight, openings, shape, hLeft, hRight, hPeak, l1, h1, h2, h3, l2]);

    return (
        <BaseDrawingFrame
            areaStats={areaStats}
            width={lengteNum}
            height={effectiveHeight}
            widthLabel={shape === 'slope' ? '' : `${lengteNum}`} // Suppress standard labels for slope
            heightLabel={shape === 'slope' ? '' : `${effectiveHeight}`}
            suppressTotalDimensions={true} // Use universal OverallDimensions manually
            className={className}
            fitContainer={fitContainer}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            {(metrics) => {
                metricsRef.current = metrics;
                const { startX, startY, rectW, rectH, pxPerMm, SVG_HEIGHT } = metrics;
                const pxPerMmH = pxPerMm;
                const pxPerMmW = pxPerMm;

                // Convert dakrandWidth (mm) to pixels
                const drPxRaw = dakrandNum * pxPerMm;
                const drPx = Math.max(1.5, drPxRaw);

                // Determine inner boundaries
                const topIsWall = edgeTop === 'wall';
                const bottomIsWall = edgeBottom === 'wall';
                const leftIsWall = edgeLeft === 'wall';
                const rightIsWall = edgeRight === 'wall';

                // --- Geometry Calculation ---
                // Physical Y (mm) increases UPWARDS. SVG Y increases DOWNWARDS.
                // Floor is at svgY = startY + rectH.

                const getSvgPt = (xMm: number, yMm: number) => ({
                    x: startX + (xMm * pxPerMmW),
                    y: (startY + rectH) - (yMm * pxPerMmH)
                });

                let outlinePoints: { x: number; y: number }[] = [];
                // Edges: [Start, End, SideName, isWall]
                let edges: { p1: { x: number, y: number }, p2: { x: number, y: number }, side: 'top' | 'bottom' | 'left' | 'right', isWall: boolean }[] = [];
                let outlinePath = '';

                if (shape === 'slope') {
                    const pBL = getSvgPt(0, 0); // Bottom Left
                    const pBR = getSvgPt(lengteNum, 0); // Bottom Right
                    const pTL = getSvgPt(0, hLeft); // Top Left
                    const pTR = getSvgPt(lengteNum, hRight); // Top Right

                    outlinePoints = [pBL, pTL, pTR, pBR];
                    outlinePath = `M ${pBL.x} ${pBL.y} L ${pTL.x} ${pTL.y} L ${pTR.x} ${pTR.y} L ${pBR.x} ${pBR.y} Z`;

                    edges = [
                        { p1: pTL, p2: pTR, side: 'top', isWall: edgeTop === 'wall' },
                        { p1: pTR, p2: pBR, side: 'right', isWall: edgeRight === 'wall' },
                        { p1: pBR, p2: pBL, side: 'bottom', isWall: edgeBottom === 'wall' },
                        { p1: pBL, p2: pTL, side: 'left', isWall: edgeLeft === 'wall' }
                    ];
                } else if (shape === 'rectangle') {
                    // Standard Rect
                    const pBL = { x: startX, y: startY + rectH };
                    const pBR = { x: startX + rectW, y: startY + rectH };
                    const pTL = { x: startX, y: startY };
                    const pTR = { x: startX + rectW, y: startY };

                    outlinePoints = [pBL, pTL, pTR, pBR];
                    outlinePath = `M ${pBL.x} ${pBL.y} L ${pTL.x} ${pTL.y} L ${pTR.x} ${pTR.y} L ${pBR.x} ${pBR.y} Z`;

                    edges = [
                        { p1: pTL, p2: pTR, side: 'top', isWall: edgeTop === 'wall' },
                        { p1: pTR, p2: pBR, side: 'right', isWall: edgeRight === 'wall' },
                        { p1: pBR, p2: pBL, side: 'bottom', isWall: edgeBottom === 'wall' },
                        { p1: pBL, p2: pTL, side: 'left', isWall: edgeLeft === 'wall' }
                    ];
                } else if (shape === 'gable') {
                    const midX = startX + rectW / 2;
                    const yBot = startY + rectH;
                    const ySide = yBot - (hLeft * pxPerMmH);
                    const yPeakPos = yBot - (hPeak * pxPerMmH);

                    if (variant === 'bottom') {
                        const yTop = startY;
                        const ySidePos = startY + (hLeft * pxPerMmH);
                        const yPeakPosBottom = startY + (hPeak * pxPerMmH);
                        outlinePath = `M ${startX} ${yTop} L ${startX + rectW} ${yTop} L ${startX + rectW} ${ySidePos} L ${midX} ${yPeakPosBottom} L ${startX} ${ySidePos} Z`;
                    } else {
                        outlinePath = `M ${startX} ${ySide} L ${midX} ${yPeakPos} L ${startX + rectW} ${ySide} L ${startX + rectW} ${yBot} L ${startX} ${yBot} Z`;
                    }
                } else if (shape === 'l-shape') {
                    const l1Px = l1 * pxPerMmW;
                    const yBot = startY + rectH;
                    const yH1 = yBot - (h1 * pxPerMmH);
                    const yH2 = yBot - (h2 * pxPerMmH);
                    const xL1 = startX + l1Px;

                    if (variant === 'bottom') {
                        const yTop = startY;
                        const yB1 = startY + (h1 * pxPerMmH);
                        const yB2 = startY + (h2 * pxPerMmH);
                        outlinePath = `M ${startX} ${yTop} L ${startX + rectW} ${yTop} L ${startX + rectW} ${yB2} L ${xL1} ${yB2} L ${xL1} ${yB1} L ${startX} ${yB1} Z`;
                    } else {
                        outlinePath = `M ${startX} ${yH1} L ${xL1} ${yH1} L ${xL1} ${yH2} L ${startX + rectW} ${yH2} L ${startX + rectW} ${yBot} L ${startX} ${yBot} Z`;
                    }
                } else if (shape === 'u-shape') {
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
                        const yTop = startY;
                        const yB1 = startY + (h1 * pxPerMmH);
                        const yB2 = startY + (h2 * pxPerMmH);
                        const yB3_fixed = startY + (h3 * pxPerMmH);
                        outlinePath = `M ${startX} ${yTop} L ${startX + rectW} ${yTop} L ${startX + rectW} ${yB3_fixed} L ${xL2} ${yB3_fixed} L ${xL2} ${yB2} L ${xL1} ${yB2} L ${xL1} ${yB1} L ${startX} ${yB1} Z`;
                    } else {
                        outlinePath = `M ${startX} ${yH1} L ${xL1} ${yH1} L ${xL1} ${yH2} L ${xL2} ${yH2} L ${xL2} ${yH3} L ${startX + rectW} ${yH3} L ${startX + rectW} ${yBot} L ${startX} ${yBot} Z`;
                    }
                } else {
                    // Fallback
                    const pBL = getSvgPt(0, 0);
                    const pBR = getSvgPt(lengteNum, 0);
                    const pTL = getSvgPt(0, effectiveHeight);
                    const pTR = getSvgPt(lengteNum, effectiveHeight);
                    outlinePoints = [pBL, pTL, pTR, pBR];
                    outlinePath = `M ${pBL.x} ${pBL.y} L ${pTL.x} ${pTL.y} L ${pTR.x} ${pTR.y} L ${pBR.x} ${pBR.y} Z`;
                }

                // Render Polygon Path (Use outlinePath directly)


                // --- Helper: Render Interactive Edge ---
                const renderInteractiveEdge = (
                    key: string,
                    p1: { x: number, y: number },
                    p2: { x: number, y: number },
                    thickness: number,
                    isWall: boolean,
                    side: 'top' | 'bottom' | 'left' | 'right'
                ) => {
                    // Math
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    let angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);

                    const midX = (p1.x + p2.x) / 2;
                    const midY = (p1.y + p2.y) / 2;

                    // Calculate Inside Normal (Clockwise winding -> 90deg right is inside)
                    // Normal = (-dy, dx) normalized
                    const nx = -dy / len;
                    const ny = dx / len;

                    // Label Position (Inside)
                    const textDist = 25;
                    const labelX = midX + (nx * textDist);
                    const labelY = midY + (ny * textDist);

                    // Normalize Angle for Readability (Keep between 0 and 180, preferring 90)
                    // This aligns verticals to read Down (90) per user request
                    // Normalize Angle for Readability (Keep between -90 and 90)
                    while (angleDeg > 90) angleDeg -= 180;
                    while (angleDeg <= -90) angleDeg += 180;

                    // Toggle Handler
                    const toggle = (e: React.MouseEvent) => {
                        e.stopPropagation();
                        if (dragStartRef.current) return; // Prevent click during drag
                        if (onEdgeChange) onEdgeChange(side, isWall ? 'free' : 'wall');
                    };

                    // Beam Visualization
                    const showBeam = !isWall && dakrandNum > 0;

                    // Interaction Zone (Invisible but clickable)
                    const hitThickness = 40;

                    return (
                        <g key={key} onClick={toggle} cursor="pointer">
                            <title>{isWall ? "Wijzig naar Dakrand" : "Wijzig naar Muur"}</title>

                            {/* Visual Beam (Only if dakrand) */}
                            {showBeam && (
                                <line
                                    x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                                    stroke="rgb(70, 75, 85)"
                                    strokeWidth={thickness * 2} // Double width, then clipped effectively
                                    strokeOpacity={0.5}
                                    clipPath={`url(#${clipId})`} // We'll need a clip path for the whole shape
                                />
                            )}

                            {/* Hit Area */}
                            <line
                                x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                                stroke="transparent"
                                strokeWidth={hitThickness}
                            />

                            {/* Label */}
                            <text
                                x={labelX} y={labelY}
                                transform={`rotate(${angleDeg}, ${labelX}, ${labelY})`}
                                textAnchor="middle"
                                dy="0.3em"
                                fill="rgb(100, 116, 139)"
                                style={{ fontSize: 10, fontWeight: 600, fontFamily: 'monospace', userSelect: 'none' }}
                            >
                                {isWall ? "GEVEL" : "VRIJSTAAND"}
                            </text>
                        </g>
                    );
                };

                // --- Clip Path for Beams ---
                // We define a clip path matching the main polygon so 'centered' edge-strokes are cut in half (inner part remains)
                const clipId = `poly-clip-${clipBaseId.replace(/:/g, '')}`;

                return (
                    <>
                        <defs>
                            <clipPath id={clipId}>
                                <path d={outlinePath} />
                            </clipPath>
                        </defs>

                        {/* Shape Outline / Surface */}
                        <path d={outlinePath} fill="none" stroke="rgb(70, 75, 85)" strokeWidth="0.5" />

                        {/* Interactive Edges */}
                        {edges.map((e, i) => (
                            <React.Fragment key={`edge-${i}`}>
                                {/** Render Control **/}
                                {renderInteractiveEdge(
                                    `ctrl-${e.side}`,
                                    e.p1, e.p2,
                                    drPx, e.isWall, e.side
                                )}
                            </React.Fragment>
                        ))}

                        {/* Openings */}
                        {openings.map(op => {
                            const wPx = op.width * pxPerMm;
                            const hPx = op.height * pxPerMm;
                            const xPx = startX + (op.fromLeft * pxPerMm);
                            const yPx = (startY + rectH) - (op.fromBottom * pxPerMm) - hPx;

                            return (
                                <g
                                    key={op.id}
                                    onPointerDown={(e) => handlePointerDown(e, op)}
                                    style={{ cursor: onOpeningsChange ? 'move' : 'default' }}
                                >
                                    <rect
                                        x={xPx} y={yPx} width={wPx} height={hPx}
                                        fill="#09090b" stroke="rgb(70, 75, 85)" strokeWidth={2}
                                        opacity={draggingId === op.id ? 0.7 : 1}
                                    />
                                    <path
                                        d={`M ${xPx} ${yPx} L ${xPx + wPx} ${yPx + hPx} M ${xPx + wPx} ${yPx} L ${xPx} ${yPx + hPx}`}
                                        stroke="rgb(70, 75, 85)" strokeWidth="1" opacity="0.3"
                                    />
                                    <OpeningLabels
                                        centerX={xPx + wPx / 2}
                                        centerY={yPx + hPx / 2}
                                        typeName={labelMap[op.type] || op.type || 'Sparing'}
                                        width={op.width}
                                        height={op.height}
                                    />
                                </g>
                            );
                        })}

                        {/* MEASUREMENTS */}
                        {shape === 'slope' ? (
                            <g className="measurements">
                                {/* Bottom Width */}
                                <DimensionLine
                                    p1={edges.find(e => e.side === 'bottom')!.p2}
                                    p2={edges.find(e => e.side === 'bottom')!.p1}
                                    label={lengteNum}
                                    offset={50}
                                />
                                {/* Left Height */}
                                <DimensionLine
                                    p1={edges.find(e => e.side === 'left')!.p2} // Top Left
                                    p2={edges.find(e => e.side === 'left')!.p1} // Bottom Left
                                    label={hLeft}
                                    offset={50}
                                    orientation="vertical"
                                />
                                {/* Right Height */}
                                <DimensionLine
                                    p1={edges.find(e => e.side === 'right')!.p2} // Bottom Right
                                    p2={edges.find(e => e.side === 'right')!.p1} // Top Right
                                    label={hRight}
                                    offset={50}
                                    orientation="vertical"
                                />
                            </g>
                        ) : (
                            <OverallDimensions
                                wallLength={lengteNum}
                                wallHeight={effectiveHeight}
                                svgBaseX={startX}
                                svgBaseY={startY + rectH}
                                pxPerMm={pxPerMm}
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
                            pxPerMm={pxPerMm}
                        />

                        {/* Interaction Helper Text */}
                        <text
                            x={10}
                            y={15}
                            textAnchor="start"
                            fill="rgb(148, 163, 184)"
                            fontSize="10"
                            fontStyle="italic"
                            pointerEvents="none"
                            style={{ userSelect: 'none' }}
                        >
                            Tip: Klik op de randen om type te wijzigen
                        </text>

                        {/* Custom Title Placement */}
                        <text
                            x={25}
                            y={SVG_HEIGHT - 25}
                            textAnchor="start"
                            fill="rgb(148, 163, 184)"
                            fontSize="14"
                            style={{ fontFamily: 'monospace' }}
                        >
                            {title}
                        </text>
                    </>
                );
            }}
        </BaseDrawingFrame>
    );
}

// Minimal internal definition to avoid missing imports in this replacing block
import { DimensionLine } from './shared/measurements/DimensionLine';
