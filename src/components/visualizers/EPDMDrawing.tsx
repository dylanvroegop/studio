import React from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';
import { RoofDrawingProps } from './RoofDrawing';
import { OverallDimensions, OpeningMeasurements } from './shared/measurements';

interface EPDMDrawingProps extends RoofDrawingProps {
    dakrandWidth?: number;
    edgeTop?: 'free' | 'wall';
    edgeBottom?: 'free' | 'wall';
    edgeLeft?: 'free' | 'wall';
    edgeRight?: 'free' | 'wall';
    onEdgeChange?: (side: string, value: string) => void;
}

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
            suppressTotalDimensions={true} // Use universal OverallDimensions
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
                labelElements.push(renderLabel(topIsWall ? "GEVEL" : "VRIJSTAAND", startX + rectW / 2, startY + inset, 0));
                labelElements.push(renderLabel(bottomIsWall ? "GEVEL" : "VRIJSTAAND", startX + rectW / 2, startY + rectH - inset, 0));
                labelElements.push(renderLabel(leftIsWall ? "GEVEL" : "VRIJSTAAND", startX + inset, startY + rectH / 2, -90));
                labelElements.push(renderLabel(rightIsWall ? "GEVEL" : "VRIJSTAAND", startX + rectW - inset, startY + rectH / 2, -90));

                // --- 4. Openings & Dimensions (Universal) ---

                // Opening Rects (Visuals & Interaction Only)
                const openingElements = openings.map(op => {
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
                                fill="#09090b" stroke="rgb(70, 75, 85)" strokeWidth="2"
                                opacity={draggingId === op.id ? 0.7 : 1}
                            />
                            <path
                                d={`M ${xPx} ${yPx} L ${xPx + wPx} ${yPx + hPx} M ${xPx + wPx} ${yPx} L ${xPx} ${yPx + hPx}`}
                                stroke="rgb(70, 75, 85)" strokeWidth="1" opacity="0.3"
                            />
                        </g>
                    );
                });

                return (
                    <>
                        <rect x={startX} y={startY} width={rectW} height={rectH} fill="none" stroke="rgb(70, 75, 85)" strokeWidth="2" />
                        {surfaceElement}
                        {segments}
                        {labelElements}
                        {openingElements}

                        {/* UNIVERSAL MEASUREMENTS */}
                        <OverallDimensions
                            wallLength={lengteNum}
                            wallHeight={heightNum}
                            svgBaseX={startX}
                            svgBaseY={startY + rectH}
                            pxPerMm={pxPerMm}
                        />

                        {/* No GridMeasurements for EPDM */}

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
                            wallHeight={heightNum}
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
                            Tip: Klik op de randen in de tekening om te wijzigen
                        </text>

                        {/* Custom Title Placement */}
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
