import React from 'react';

/**
 * OpeningMeasurements Component - Universal Opening Measurement Renderer
 * 
 * This component renders measurement lines, dimensions, and labels for wall/ceiling openings.
 * It uses the EXACT rendering logic from WallDrawing.tsx (the golden standard) to ensure
 * visual consistency across all 20+ drawing components.
 * 
 * Copied from WallDrawing.tsx lines 991-1208 (inline measurement rendering)
 */

interface OpeningMeasurementsProps {
    openings: {
        id: string;
        width: number;
        height: number;
        fromLeft: number;
        fromBottom: number;
        type?: string;
    }[];
    wallLength: number;
    wallHeight: number;
    svgBaseX: number;  // WALL_X - Left edge of wall
    svgBaseY: number;  // Y_BOTTOM - Bottom edge of wall (floor line)
    pxPerMm: number;
    showVertical?: boolean;
    showHorizontal?: boolean;

    // Optional: For complex shapes that need dynamic height calculation
    getWallTopMm?: (xMm: number) => number;
    compactLabels?: boolean;
}

export const OpeningMeasurements: React.FC<OpeningMeasurementsProps> = ({
    openings,
    wallLength,
    wallHeight,
    svgBaseX,
    svgBaseY,
    pxPerMm,
    getWallTopMm,
    showVertical = true,
    showHorizontal = true,
    compactLabels = false
}) => {
    if (!openings || openings.length === 0) return null;

    // Sort openings left to right for stacking dimension lines
    const sorted = [...openings].sort((a, b) => a.fromLeft - b.fromLeft);
    const roundedWallLength = Math.round(wallLength);
    const roundedWallHeight = Math.round(wallHeight);

    // Default wall top calculation (flat wall)
    const defaultGetWallTopMm = () => wallHeight;
    const calcWallTopMm = getWallTopMm || defaultGetWallTopMm;

    // De-duplicate equal opening/koof width/height labels.
    // Priority: wall total dimensions (OverallDimensions) win, so we hide equal duplicates there.
    const firstWidthIndexByValue = new Map<number, number>();
    const firstHeightIndexByValue = new Map<number, number>();
    const firstTopGapIndexByValue = new Map<number, number>();
    sorted.forEach((op, idx) => {
        const roundedWidth = Math.round(op.width);
        const roundedHeight = Math.round(op.height);
        const roundedFromBottom = Math.round(op.fromBottom);
        const openingCenterX = op.fromLeft + op.width / 2;
        const roundedWallTopAtOpening = Math.round(calcWallTopMm(openingCenterX));
        let roundedTopGap = Math.max(0, roundedWallTopAtOpening - roundedFromBottom - roundedHeight);

        // Stabilize flat/floor-attached cases to prevent 1mm drift (e.g. 634 vs 635)
        if (roundedFromBottom === 0 && Math.abs(roundedWallTopAtOpening - roundedWallHeight) <= 1) {
            roundedTopGap = Math.max(0, roundedWallHeight - roundedHeight);
        }

        if (!firstWidthIndexByValue.has(roundedWidth)) {
            firstWidthIndexByValue.set(roundedWidth, idx);
        }
        if (!firstHeightIndexByValue.has(roundedHeight)) {
            firstHeightIndexByValue.set(roundedHeight, idx);
        }
        if (!firstTopGapIndexByValue.has(roundedTopGap)) {
            firstTopGapIndexByValue.set(roundedTopGap, idx);
        }
    });

    // Helper to convert mm to SVG Y coordinate
    const getY = (mm: number) => svgBaseY - (mm * pxPerMm);

    const mergedHorizontalDimY = svgBaseY + 40;

    const horizontalBoundariesMm = React.useMemo(() => {
        const values: number[] = [0, wallLength];
        sorted.forEach((op) => {
            const left = Math.max(0, Math.min(wallLength, op.fromLeft));
            const right = Math.max(0, Math.min(wallLength, op.fromLeft + op.width));
            values.push(left, right);
        });

        values.sort((a, b) => a - b);
        const unique: number[] = [];
        const EPSILON = 0.5;
        values.forEach((value) => {
            if (unique.length === 0 || Math.abs(value - unique[unique.length - 1]) > EPSILON) {
                unique.push(value);
            }
        });
        return unique;
    }, [sorted, wallLength]);

    return (
        <g className="text-emerald-500 pointer-events-none">
            {sorted.map((op, i) => {
                // Calculate screen coordinates for opening
                const wPx = op.width * pxPerMm;
                const hPx = op.height * pxPerMm;
                const drawX = svgBaseX + (op.fromLeft * pxPerMm);
                const drawY = svgBaseY - (op.fromBottom * pxPerMm) - hPx;

                // Stacking offsets for multiple openings
                const stackStep = 25;
                const bottomBaseY = svgBaseY + 40; // Start 40px below wall
                const dimY = bottomBaseY + (i * stackStep);

                const leftBaseX = svgBaseX - 40; // Start 40px left of wall
                const dimX = leftBaseX - (i * stackStep);

                // Calculate wall top at opening position (for sloped/complex shapes)
                const openingCenterX = op.fromLeft + op.width / 2;
                const wallTopMmAtOpening = calcWallTopMm(openingCenterX);
                const wallTopY = getY(wallTopMmAtOpening);
                const openingTopY = drawY;
                const openingBottomY = drawY + hPx;
                const roundedFromBottom = Math.round(op.fromBottom);
                const roundedOpHeight = Math.round(op.height);
                const roundedWallTopAtOpening = Math.round(wallTopMmAtOpening);
                let topSegmentHeight = Math.max(0, roundedWallTopAtOpening - roundedFromBottom - roundedOpHeight);
                if (roundedFromBottom === 0 && Math.abs(roundedWallTopAtOpening - roundedWallHeight) <= 1) {
                    topSegmentHeight = Math.max(0, roundedWallHeight - roundedOpHeight);
                }
                const roundedWidth = Math.round(op.width);
                const roundedHeight = Math.round(op.height);
                const showOpeningWidthSegment =
                    roundedWidth > 0
                    && roundedWidth !== roundedWallLength
                    && firstWidthIndexByValue.get(roundedWidth) === i;
                const showOpeningHeightSegment =
                    roundedHeight > 0
                    && roundedHeight !== roundedWallHeight
                    && firstHeightIndexByValue.get(roundedHeight) === i;
                const showTopSegment =
                    topSegmentHeight > 0
                    && firstTopGapIndexByValue.get(topSegmentHeight) === i;

                return (
                    <g key={`dim-${op.id}`}>
                        {showVertical && (
                            <>
                                {/* 3. VERTICAL DIMENSIONS - 3 segments */}
                                {/* Segment 1: Floor to Opening Bottom */}
                                {roundedFromBottom > 0 && (
                                    <>
                                        <line
                                            x1={dimX} y1={svgBaseY}
                                            x2={dimX} y2={openingBottomY}
                                            stroke="#10b981" strokeWidth="0.5"
                                        />
                                        <circle cx={dimX} cy={svgBaseY} r="1.5" fill="#10b981" />
                                        <circle cx={dimX} cy={openingBottomY} r="1.5" fill="#10b981" />
                                        {compactLabels ? (
                                            <g transform={`translate(${dimX + 5}, ${(svgBaseY + openingBottomY) / 2}) rotate(-90)`}>
                                                <text
                                                    textAnchor="middle"
                                                    dominantBaseline="middle"
                                                    fill="#10b981"
                                                    className="text-[10px] font-mono select-none"
                                                >
                                                    {roundedFromBottom}
                                                </text>
                                            </g>
                                        ) : (
                                            <g transform={`translate(${dimX}, ${(svgBaseY + openingBottomY) / 2}) rotate(-90)`}>
                                                <rect x="-18" y="-7" width="36" height="14" fill="#09090b" opacity="1" />
                                                <text
                                                    textAnchor="middle"
                                                    dominantBaseline="middle"
                                                    fill="#10b981"
                                                    className="text-[12px] font-mono select-none font-medium"
                                                >
                                                    {roundedFromBottom}
                                                </text>
                                            </g>
                                        )}
                                    </>
                                )}

                                {/* Segment 2: Opening Height */}
                                {showOpeningHeightSegment && (
                                    <>
                                        <line
                                            x1={dimX} y1={openingBottomY}
                                            x2={dimX} y2={openingTopY}
                                            stroke="#10b981" strokeWidth="0.5"
                                        />
                                        <circle cx={dimX} cy={openingTopY} r="1.5" fill="#10b981" />
                                        {roundedFromBottom === 0 && <circle cx={dimX} cy={openingBottomY} r="1.5" fill="#10b981" />}
                                        {compactLabels ? (
                                            <g transform={`translate(${dimX + 5}, ${(openingBottomY + openingTopY) / 2}) rotate(-90)`}>
                                                <text
                                                    textAnchor="middle"
                                                    dominantBaseline="middle"
                                                    fill="#10b981"
                                                    className="text-[10px] font-mono select-none"
                                                >
                                                    {roundedOpHeight}
                                                </text>
                                            </g>
                                        ) : (
                                            <g transform={`translate(${dimX}, ${(openingBottomY + openingTopY) / 2}) rotate(-90)`}>
                                                <rect x="-18" y="-7" width="36" height="14" fill="#09090b" opacity="1" />
                                                <text
                                                    textAnchor="middle"
                                                    dominantBaseline="middle"
                                                    fill="#10b981"
                                                    className="text-[12px] font-mono select-none font-medium"
                                                >
                                                    {roundedOpHeight}
                                                </text>
                                            </g>
                                        )}
                                    </>
                                )}

                                {/* Segment 3: Opening Top to Wall Top */}
                                {showTopSegment && (
                                    <>
                                        <line
                                            x1={dimX} y1={openingTopY}
                                            x2={dimX} y2={wallTopY}
                                            stroke="#10b981" strokeWidth="0.5"
                                        />
                                        <circle cx={dimX} cy={wallTopY} r="1.5" fill="#10b981" />
                                        {compactLabels ? (
                                            <g transform={`translate(${dimX + 5}, ${(openingTopY + wallTopY) / 2}) rotate(-90)`}>
                                                <text
                                                    textAnchor="middle"
                                                    dominantBaseline="middle"
                                                    fill="#10b981"
                                                    className="text-[10px] font-mono select-none"
                                                >
                                                    {topSegmentHeight}
                                                </text>
                                            </g>
                                        ) : (
                                            <g transform={`translate(${dimX}, ${(openingTopY + wallTopY) / 2}) rotate(-90)`}>
                                                <rect x="-18" y="-7" width="36" height="14" fill="#09090b" opacity="1" />
                                                <text
                                                    textAnchor="middle"
                                                    dominantBaseline="middle"
                                                    fill="#10b981"
                                                    className="text-[12px] font-mono select-none font-medium"
                                                >
                                                    {topSegmentHeight}
                                                </text>
                                            </g>
                                        )}
                                    </>
                                )}

                                {/* Extension lines to wall (vertical measurements) */}
                                <line x1={dimX} y1={svgBaseY} x2={svgBaseX} y2={svgBaseY} stroke="#10b981" strokeWidth="0.5" />
                                <line x1={dimX} y1={openingBottomY} x2={svgBaseX} y2={openingBottomY} stroke="#10b981" strokeWidth="0.5" />
                                <line x1={dimX} y1={openingTopY} x2={svgBaseX} y2={openingTopY} stroke="#10b981" strokeWidth="0.5" />
                                {topSegmentHeight > 0 && <line x1={dimX} y1={wallTopY} x2={svgBaseX} y2={wallTopY} stroke="#10b981" strokeWidth="0.5" />}
                            </>
                        )}

                        {showHorizontal && null}
                    </g>
                );
            })}

            {showHorizontal && (
                <g>
                    {horizontalBoundariesMm.slice(0, -1).map((startMm, idx) => {
                        const endMm = horizontalBoundariesMm[idx + 1];
                        const segmentMm = endMm - startMm;
                        const roundedSegment = Math.round(segmentMm);
                        if (roundedSegment <= 0 || roundedSegment === roundedWallLength) return null;

                        const x1 = svgBaseX + (startMm * pxPerMm);
                        const x2 = svgBaseX + (endMm * pxPerMm);
                        const midX = (x1 + x2) / 2;

                        return (
                            <g key={`h-seg-${idx}`}>
                                <line x1={x1} y1={mergedHorizontalDimY} x2={x2} y2={mergedHorizontalDimY} stroke="#10b981" strokeWidth="0.5" />
                                <circle cx={x1} cy={mergedHorizontalDimY} r="1.5" fill="#10b981" />
                                <circle cx={x2} cy={mergedHorizontalDimY} r="1.5" fill="#10b981" />
                                {!compactLabels && (
                                    <rect x={midX - 18} y={mergedHorizontalDimY - 7} width="36" height="14" fill="#09090b" opacity="1" />
                                )}
                                <text
                                    x={midX}
                                    y={compactLabels ? mergedHorizontalDimY + 10 : mergedHorizontalDimY + 0.5}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    fill="#10b981"
                                    className={compactLabels ? "text-[10px] font-mono select-none" : "text-[12px] font-mono select-none font-medium"}
                                >
                                    {roundedSegment}
                                </text>
                            </g>
                        );
                    })}

                    {horizontalBoundariesMm.map((boundaryMm, idx) => {
                        const x = svgBaseX + (boundaryMm * pxPerMm);
                        return (
                            <line
                                key={`h-ext-${idx}`}
                                x1={x}
                                y1={mergedHorizontalDimY}
                                x2={x}
                                y2={svgBaseY}
                                stroke="#10b981"
                                strokeWidth="0.5"
                            />
                        );
                    })}
                </g>
            )}
        </g>
    );
};
