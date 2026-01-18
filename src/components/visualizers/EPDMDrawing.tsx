import React from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';
import { RoofDrawingProps } from './RoofDrawing';

interface EPDMDrawingProps extends RoofDrawingProps {
    dakrandWidth?: number;
    edgeTop?: 'free' | 'wall';
    edgeBottom?: 'free' | 'wall';
    edgeLeft?: 'free' | 'wall';
    edgeRight?: 'free' | 'wall';
    onEdgeChange?: (side: string, value: string) => void;
}

const dakColor = "#f59e0b"; // Amber-500
const wallColor = "#ef4444"; // Red-500
const dimColor = "#10b981"; // Emerald-500
const structureColor = "rgb(70, 75, 85)";
const lattenColor = structureColor;
const labelColor = "rgb(100, 116, 139)"; // Slate-500

const labelMap: Record<string, string> = {
    'dakraam': 'Lichtkoepel',
    'schoorsteen': 'Schoorsteen',
    'pijp': 'Pijp',
    'afvoer': 'HWA',
    'opening': 'Sparing'
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
    isMagnifier,
    onOpeningsChange,
    onEdgeChange,
    shape = 'rectangle'
}: EPDMDrawingProps) {
    // State for drag
    const [draggingId, setDraggingId] = React.useState<string | null>(null);
    const dragStartRef = React.useRef<{ x: number; y: number; opId: string; origLeft: number; origBottom: number } | null>(null);
    const metricsRef = React.useRef<any>(null);

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

        // Use lengteNum/heightNum from scope closure or parse again? 
        // Better to use props passed in component closure.
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

    if (lengteNum <= 0 || heightNum <= 0) {
        // Render an "empty" frame that preserves the look and feel
        return (
            <BaseDrawingFrame
                width={1000} // Dummy width
                height={1000} // Dummy height
                widthLabel=""
                heightLabel=""
                className={className}
                fitContainer={true}
            >
                {({ SVG_WIDTH, SVG_HEIGHT }) => (
                    <text
                        x={SVG_WIDTH / 2}
                        y={SVG_HEIGHT / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="rgb(113, 113, 122)" // zinc-500
                        fontSize="14"
                        style={{ fontFamily: 'monospace' }}
                    >
                        Voer afmetingen in...
                    </text>
                )}
            </BaseDrawingFrame>
        );
    }

    return (
        <BaseDrawingFrame
            width={lengteNum}
            height={heightNum}
            widthLabel={`${lengteNum}`}
            heightLabel={`${heightNum}`}
            // gridLabel is removed to custom place it
            className={className}
            fitContainer={fitContainer}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            {(metrics) => {
                metricsRef.current = metrics;
                const { startX, startY, rectW, rectH, pxPerMm, SVG_WIDTH, SVG_HEIGHT } = metrics;

                // Convert dakrandWidth (mm) to pixels
                const drPxRaw = dakrandNum * pxPerMm;
                const drPx = Math.max(1.5, drPxRaw);

                // Determine inner boundaries
                const topIsWall = edgeTop === 'wall';
                const bottomIsWall = edgeBottom === 'wall';
                const leftIsWall = edgeLeft === 'wall';
                const rightIsWall = edgeRight === 'wall';

                const xL = startX + (leftIsWall ? 0 : drPx);
                const xR = startX + rectW - (rightIsWall ? 0 : drPx);
                const yT = startY + (topIsWall ? 0 : drPx);
                const yB = startY + rectH - (bottomIsWall ? 0 : drPx);

                const innerW = Math.max(0, xR - xL);
                const innerH = Math.max(0, yB - yT);

                // --- 1. Roof Surface (Inner Fill) ---
                const surfaceElement = (
                    <rect
                        key="roof-surface"
                        x={xL}
                        y={yT}
                        width={innerW}
                        height={innerH}
                        fill="rgba(70, 75, 85, 0.05)"
                    />
                );

                // --- 2. Dakrand (Solid Beam Style) & Interaction ---
                const segments: React.ReactNode[] = [];
                const drFill = "rgb(70, 75, 85)";
                const drOpacity = 0.5;

                const hasTop = !topIsWall && dakrandNum > 0;
                const hasBottom = !bottomIsWall && dakrandNum > 0;
                const hasLeft = !leftIsWall && dakrandNum > 0;
                const hasRight = !rightIsWall && dakrandNum > 0;

                // Visual Segments

                // --- WALL VISUALS (Thick Line) ---
                // Removed per request: Gevel should be thin (default canvas stroke)
                // const wallColor = "rgb(70, 75, 85)";
                // const wallStroke = 3; 

                // if (topIsWall) { ... } logic removed to keep default thin line

                // Top (Full Width)
                if (hasTop) {
                    segments.push(
                        <rect key="i-top" x={startX} y={startY} width={rectW} height={drPx} fill={drFill} opacity={drOpacity} pointerEvents="none" />
                    );
                }
                // Bottom (Full Width)
                if (hasBottom) {
                    segments.push(
                        <rect key="i-bot" x={startX} y={startY + rectH - drPx} width={rectW} height={drPx} fill={drFill} opacity={drOpacity} pointerEvents="none" />
                    );
                }

                // Vertical Side Segments (Trimmed to avoid overlap with Top/Bottom)
                const vY = startY + (hasTop ? drPx : 0);
                const vH = rectH - (hasTop ? drPx : 0) - (hasBottom ? drPx : 0);

                // Left Inner
                if (hasLeft) {
                    segments.push(
                        <rect key="i-left" x={startX} y={vY} width={drPx} height={vH} fill={drFill} opacity={drOpacity} pointerEvents="none" />
                    );
                }
                // Right Inner
                if (hasRight) {
                    segments.push(
                        <rect key="i-right" x={startX + rectW - drPx} y={vY} width={drPx} height={vH} fill={drFill} opacity={drOpacity} pointerEvents="none" />
                    );
                }

                // Interaction Zones (Click to toggle)
                // Use slightly larger hit area for better UX (add 20px internal padding)
                const hitPad = 20;
                const toggleEdge = (side: 'top' | 'bottom' | 'left' | 'right', isWall: boolean) => {
                    if (onEdgeChange) onEdgeChange(side, isWall ? 'free' : 'wall');
                };

                // Top Zone
                segments.push(
                    <rect
                        key="hit-top"
                        x={startX} y={startY} width={rectW} height={drPx + hitPad}
                        fill="transparent" cursor="pointer"
                        onClick={(e) => { e.stopPropagation(); toggleEdge('top', topIsWall); }}
                    >
                        <title>{topIsWall ? "Wijzig naar Dakrand" : "Wijzig naar Muur"}</title>
                    </rect>
                );

                // Bottom Zone
                segments.push(
                    <rect
                        key="hit-bot"
                        x={startX} y={startY + rectH - (drPx + hitPad)} width={rectW} height={drPx + hitPad}
                        fill="transparent" cursor="pointer"
                        onClick={(e) => { e.stopPropagation(); toggleEdge('bottom', bottomIsWall); }}
                    >
                        <title>{bottomIsWall ? "Wijzig naar Dakrand" : "Wijzig naar Muur"}</title>
                    </rect>
                );

                // Left Zone (Vertical middle)
                segments.push(
                    <rect
                        key="hit-left"
                        x={startX} y={startY + drPx} width={drPx + hitPad} height={rectH - 2 * drPx}
                        fill="transparent" cursor="pointer"
                        onClick={(e) => { e.stopPropagation(); toggleEdge('left', leftIsWall); }}
                    >
                        <title>{leftIsWall ? "Wijzig naar Dakrand" : "Wijzig naar Muur"}</title>
                    </rect>
                );

                // Right Zone (Vertical middle)
                segments.push(
                    <rect
                        key="hit-right"
                        x={startX + rectW - (drPx + hitPad)} y={startY + drPx} width={drPx + hitPad} height={rectH - 2 * drPx}
                        fill="transparent" cursor="pointer"
                        onClick={(e) => { e.stopPropagation(); toggleEdge('right', rightIsWall); }}
                    >
                        <title>{rightIsWall ? "Wijzig naar Dakrand" : "Wijzig naar Muur"}</title>
                    </rect>
                );

                // --- 3. Wall Labels ---
                const labelElements: React.ReactNode[] = [];
                const labelStyle: React.CSSProperties = {
                    fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '10px', fontWeight: 600
                };

                const renderLabel = (text: string, x: number, y: number, rotate: number) => (
                    <text key={`lbl-${x}-${y}`} x={x} y={y} transform={`rotate(${rotate}, ${x}, ${y})`} textAnchor="middle" fill={labelColor} style={labelStyle} dy="0.3em">
                        {text}
                    </text>
                );

                const inset = 15;
                // Always render labels as per user request
                labelElements.push(renderLabel(topIsWall ? "GEVEL" : "VRIJSTAAND", startX + rectW / 2, startY + inset, 0));
                labelElements.push(renderLabel(bottomIsWall ? "GEVEL" : "VRIJSTAAND", startX + rectW / 2, startY + rectH - inset, 0));
                labelElements.push(renderLabel(leftIsWall ? "GEVEL" : "VRIJSTAAND", startX + inset, startY + rectH / 2, -90));
                labelElements.push(renderLabel(rightIsWall ? "GEVEL" : "VRIJSTAAND", startX + rectW - inset, startY + rectH / 2, -90));

                // --- 4. Openings & Dimensions ---
                const openingElements: React.ReactNode[] = [];
                const dimElements: React.ReactNode[] = [];

                // Helper for standard dots
                const drawTick = (tx: number, ty: number, color: string = "#10b981") => {
                    return <circle cx={tx} cy={ty} r="1.5" fill={color} />;
                };

                // Helper to pack intervals
                const packTracks = (items: { start: number; end: number; size: number; id: string; showLabel: boolean }[]) => {
                    const sorted = [...items].sort((a, b) => a.start - b.start);
                    const tracks: typeof items[] = [];
                    sorted.forEach(item => {
                        let placed = false;
                        for (const track of tracks) {
                            if (item.start >= track[track.length - 1].end) {
                                track.push(item);
                                placed = true;
                                break;
                            }
                        }
                        if (!placed) tracks.push([item]);
                    });
                    return tracks;
                };

                // Dimensions Config
                const DIM_BASE_OFFSET = 20;
                const DIM_TRACK_STEP = 30;
                const EXTENSION_GAP = 5;

                // X-AXIS: Left to Right
                // Identical to CeilingWoodDrawing
                const xItems: any[] = [];
                openings.forEach(op => {
                    const x = op.fromLeft || 0;
                    const w = op.width || 0;
                    xItems.push({ start: x, end: x + w, size: w, id: op.id, showLabel: true });
                });
                const xTracks = packTracks(xItems);

                xTracks.forEach((track, trackIdx) => {
                    const tierY = startY + rectH + DIM_BASE_OFFSET + (trackIdx * DIM_TRACK_STEP);
                    let currentX = 0;

                    track.forEach((item, itemIdx) => {
                        // Gap
                        if (item.start > currentX) {
                            const gap = item.start - currentX;
                            const x1 = startX + (currentX * pxPerMm);
                            const x2 = startX + (item.start * pxPerMm);
                            const mid = (x1 + x2) / 2;
                            dimElements.push(
                                <g key={`dxg-${trackIdx}-${itemIdx}`}>
                                    <line x1={x1} y1={tierY} x2={x2} y2={tierY} stroke={dimColor} strokeWidth="0.5" />
                                    {drawTick(x1, tierY)}
                                    {drawTick(x2, tierY)}
                                    <rect x={mid - 12} y={tierY - 5} width="24" height="10" fill="#09090b" />
                                    <text x={mid} y={tierY + 0.5} textAnchor="middle" dominantBaseline="middle" fill={dimColor} fontSize={10} style={{ fontFamily: 'monospace' }}>{Math.round(gap)}</text>
                                    <line x1={x2} y1={startY + rectH + EXTENSION_GAP} x2={x2} y2={tierY} stroke={dimColor} strokeWidth="0.5" strokeDasharray="2 2" opacity="0.3" />
                                </g>
                            );
                        }
                        // Item
                        const ix1 = startX + (item.start * pxPerMm);
                        const ix2 = startX + (item.end * pxPerMm);
                        const mid = (ix1 + ix2) / 2;
                        dimElements.push(
                            <g key={`dxi-${trackIdx}-${itemIdx}`}>
                                <line x1={ix1} y1={tierY} x2={ix2} y2={tierY} stroke={dimColor} strokeWidth="0.5" />
                                {drawTick(ix2, tierY)}
                                <rect x={mid - 12} y={tierY - 5} width="24" height="10" fill="#09090b" />
                                <text x={mid} y={tierY + 0.5} textAnchor="middle" dominantBaseline="middle" fill={dimColor} fontSize={10} style={{ fontFamily: 'monospace' }}>{Math.round(item.size)}</text>
                                <line x1={ix2} y1={startY + rectH + EXTENSION_GAP} x2={ix2} y2={tierY} stroke={dimColor} strokeWidth="0.5" strokeDasharray="2 2" opacity="0.3" />
                            </g>
                        );
                        currentX = item.end;
                    });

                    // Final Gap
                    if (currentX < lengteNum) {
                        const gap = lengteNum - currentX;
                        const x1 = startX + (currentX * pxPerMm);
                        const x2 = startX + (lengteNum * pxPerMm);
                        const mid = (x1 + x2) / 2;
                        dimElements.push(
                            <g key={`dxe-${trackIdx}`}>
                                <line x1={x1} y1={tierY} x2={x2} y2={tierY} stroke={dimColor} strokeWidth="0.5" />
                                {drawTick(x2, tierY)}
                                <rect x={mid - 12} y={tierY - 5} width="24" height="10" fill="#09090b" />
                                <text x={mid} y={tierY + 0.5} textAnchor="middle" dominantBaseline="middle" fill={dimColor} fontSize={10} style={{ fontFamily: 'monospace' }}>{Math.round(gap)}</text>
                                <line x1={x2} y1={startY + rectH + EXTENSION_GAP} x2={x2} y2={tierY} stroke={dimColor} strokeWidth="0.5" strokeDasharray="2 2" opacity="0.3" />
                            </g>
                        );
                    }
                });

                // Y-AXIS: Bottom to Top (since op.fromBottom)
                // We render dimension lines at Left of drawing.
                // We process "tracks" based on fromBottom.
                const yItems: any[] = [];
                openings.forEach(op => {
                    const b = op.fromBottom || 0;
                    const h = op.height || 0;
                    yItems.push({ start: b, end: b + h, size: h, id: op.id, showLabel: true });
                });
                const yTracks = packTracks(yItems);

                yTracks.forEach((track, trackIdx) => {
                    const tierX = startX - DIM_BASE_OFFSET - (trackIdx * DIM_TRACK_STEP);
                    let currentBottom = 0; // Starts from bottom edge

                    track.forEach((item, itemIdx) => {
                        // Gap from Bottom
                        if (item.start > currentBottom) {
                            const gap = item.start - currentBottom;
                            // SVG Coordinates: Y decreases as we go up.
                            // Bottom Edge Y = startY + rectH
                            const y1 = (startY + rectH) - (currentBottom * pxPerMm);
                            const y2 = (startY + rectH) - (item.start * pxPerMm);
                            const mid = (y1 + y2) / 2;

                            dimElements.push(
                                <g key={`dyg-${trackIdx}-${itemIdx}`}>
                                    <line x1={tierX} y1={y1} x2={tierX} y2={y2} stroke={dimColor} strokeWidth="0.5" />
                                    {drawTick(tierX, y2)}
                                    {drawTick(tierX, y1)}
                                    <g transform={`translate(${tierX}, ${mid}) rotate(-90)`}>
                                        <rect x="-12" y="-5" width="24" height="10" fill="#09090b" />
                                        <text textAnchor="middle" dominantBaseline="middle" fill={dimColor} fontSize={10} style={{ fontFamily: 'monospace' }}>{Math.round(gap)}</text>
                                    </g>
                                    <line x1={startX - EXTENSION_GAP} y1={y2} x2={tierX} y2={y2} stroke={dimColor} strokeWidth="0.5" strokeDasharray="2 2" opacity="0.3" />
                                </g>
                            );
                        }

                        // Item
                        const iy1 = (startY + rectH) - (item.start * pxPerMm);
                        const iy2 = (startY + rectH) - (item.end * pxPerMm);
                        const mid = (iy1 + iy2) / 2;
                        dimElements.push(
                            <g key={`dyi-${trackIdx}-${itemIdx}`}>
                                <line x1={tierX} y1={iy1} x2={tierX} y2={iy2} stroke={dimColor} strokeWidth="0.5" />
                                {drawTick(tierX, iy2)}
                                <g transform={`translate(${tierX}, ${mid}) rotate(-90)`}>
                                    <rect x="-12" y="-5" width="24" height="10" fill="#09090b" />
                                    <text textAnchor="middle" dominantBaseline="middle" fill={dimColor} fontSize={10} style={{ fontFamily: 'monospace' }}>{Math.round(item.size)}</text>
                                </g>
                                <line x1={startX - EXTENSION_GAP} y1={iy2} x2={tierX} y2={iy2} stroke={dimColor} strokeWidth="0.5" strokeDasharray="2 2" opacity="0.3" />
                            </g>
                        );
                        currentBottom = item.end;
                    });

                    // Final Gap to Top
                    if (currentBottom < heightNum) {
                        const gap = heightNum - currentBottom;
                        const ry1 = (startY + rectH) - (currentBottom * pxPerMm);
                        const ry2 = (startY + rectH) - (heightNum * pxPerMm); // Should be startY
                        const mid = (ry1 + ry2) / 2;
                        dimElements.push(
                            <g key={`dye-${trackIdx}`}>
                                <line x1={tierX} y1={ry1} x2={tierX} y2={ry2} stroke={dimColor} strokeWidth="0.5" />
                                {drawTick(tierX, ry2)}
                                <g transform={`translate(${tierX}, ${mid}) rotate(-90)`}>
                                    <rect x="-12" y="-5" width="24" height="10" fill="#09090b" />
                                    <text textAnchor="middle" dominantBaseline="middle" fill={dimColor} fontSize={10} style={{ fontFamily: 'monospace' }}>{Math.round(gap)}</text>
                                </g>
                                <line x1={startX - EXTENSION_GAP} y1={ry2} x2={tierX} y2={ry2} stroke={dimColor} strokeWidth="0.5" strokeDasharray="2 2" opacity="0.3" />
                            </g>
                        );
                    }

                });



                openings.forEach(op => {
                    const wPx = op.width * pxPerMm;
                    const hPx = op.height * pxPerMm;
                    const xPx = startX + (op.fromLeft * pxPerMm);
                    const yPx = (startY + rectH) - (op.fromBottom * pxPerMm) - hPx;

                    const label = labelMap[op.type] || 'Sparing';

                    openingElements.push(
                        <g
                            key={op.id}
                            onPointerDown={(e) => handlePointerDown(e, op)}
                            style={{ cursor: onOpeningsChange ? 'move' : 'default' }}
                        >
                            <rect
                                x={xPx} y={yPx} width={wPx} height={hPx}
                                fill="#09090b" stroke="rgb(70, 75, 85)" strokeWidth="2"
                                opacity={draggingId === op.id ? 0.7 : 1}
                            />
                            <path
                                d={`M ${xPx} ${yPx} L ${xPx + wPx} ${yPx + hPx} M ${xPx + wPx} ${yPx} L ${xPx} ${yPx + hPx}`}
                                stroke="rgb(70, 75, 85)" strokeWidth="1" opacity="0.3"
                            />
                            {wPx > 40 && hPx > 20 && (
                                <>
                                    <text
                                        x={xPx + wPx / 2} y={yPx + hPx / 2 - 6}
                                        textAnchor="middle" fill="white" fontSize="10" fontWeight="bold"
                                        style={{ fontFamily: 'monospace' }}
                                    >
                                        {label}
                                    </text>
                                    <text
                                        x={xPx + wPx / 2} y={yPx + hPx / 2 + 6}
                                        textAnchor="middle" fill="white" fontSize="9"
                                        style={{ fontFamily: 'monospace' }}
                                    >
                                        {op.width} x {op.height}
                                    </text>
                                </>
                            )}
                        </g>
                    );
                });

                return (
                    <>
                        <rect x={startX} y={startY} width={rectW} height={rectH} fill="none" stroke="rgb(70, 75, 85)" strokeWidth="2" />
                        {surfaceElement}
                        {segments}
                        {labelElements}
                        {dimElements}
                        {openingElements}

                        {/* Interaction Helper Text (Top-Left) */}
                        <text
                            x={10}
                            y={15}
                            textAnchor="start"
                            fill="rgb(148, 163, 184)" // Slate-400
                            fontSize="10"
                            fontStyle="italic"
                            pointerEvents="none"
                            style={{ userSelect: 'none' }}
                        >
                            Tip: Klik op de randen in de tekening om te wijzigen
                        </text>

                        {/* Custom Title Placement (Bottom Right, above Area) */}
                        <text
                            x={SVG_WIDTH - 20}
                            y={SVG_HEIGHT - 35}
                            textAnchor="end"
                            fill="rgb(100, 116, 139)"
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
