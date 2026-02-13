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

    // Helper to convert mm to SVG Y coordinate
    const getY = (mm: number) => svgBaseY - (mm * pxPerMm);

    // Default wall top calculation (flat wall)
    const defaultGetWallTopMm = () => wallHeight;
    const calcWallTopMm = getWallTopMm || defaultGetWallTopMm;

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
                const topSegmentHeight = Math.round(wallTopMmAtOpening - op.fromBottom - op.height);

                return (
                    <g key={`dim-${op.id}`}>
                        {showVertical && (
                            <>
                                {/* 3. VERTICAL DIMENSIONS - 3 segments */}
                                {/* Segment 1: Floor to Opening Bottom */}
                                {op.fromBottom > 0 && (
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
                                                    {op.fromBottom}
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
                                                    {op.fromBottom}
                                                </text>
                                            </g>
                                        )}
                                    </>
                                )}

                                {/* Segment 2: Opening Height */}
                                <line
                                    x1={dimX} y1={openingBottomY}
                                    x2={dimX} y2={openingTopY}
                                    stroke="#10b981" strokeWidth="0.5"
                                />
                                <circle cx={dimX} cy={openingTopY} r="1.5" fill="#10b981" />
                                {op.fromBottom === 0 && <circle cx={dimX} cy={openingBottomY} r="1.5" fill="#10b981" />}
                                {compactLabels ? (
                                    <g transform={`translate(${dimX + 5}, ${(openingBottomY + openingTopY) / 2}) rotate(-90)`}>
                                        <text
                                            textAnchor="middle"
                                            dominantBaseline="middle"
                                            fill="#10b981"
                                            className="text-[10px] font-mono select-none"
                                        >
                                            {op.height}
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
                                            {op.height}
                                        </text>
                                    </g>
                                )}

                                {/* Segment 3: Opening Top to Wall Top */}
                                {topSegmentHeight > 0 && (
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

                        {showHorizontal && (
                            <>
                                {/* 4. HORIZONTAL DIMENSIONS - 3 segments */}
                                {/* Segment 1: Wall Left to Opening Left */}
                                {op.fromLeft > 0 && (
                                    <>
                                        <line
                                            x1={svgBaseX} y1={dimY}
                                            x2={drawX} y2={dimY}
                                            stroke="#10b981" strokeWidth="0.5"
                                        />
                                        <circle cx={svgBaseX} cy={dimY} r="1.5" fill="#10b981" />
                                        <circle cx={drawX} cy={dimY} r="1.5" fill="#10b981" />
                                        {!compactLabels && (
                                            <rect x={(svgBaseX + drawX) / 2 - 18} y={dimY - 7} width="36" height="14" fill="#09090b" opacity="1" />
                                        )}
                                        <text
                                            x={(svgBaseX + drawX) / 2}
                                            y={compactLabels ? dimY + 10 : dimY + 0.5}
                                            textAnchor="middle"
                                            dominantBaseline="middle"
                                            fill="#10b981"
                                            className={compactLabels ? "text-[10px] font-mono select-none" : "text-[12px] font-mono select-none font-medium"}
                                        >
                                            {op.fromLeft}
                                        </text>
                                    </>
                                )}

                                {/* Segment 2: Opening Width */}
                                <line
                                    x1={drawX} y1={dimY}
                                    x2={drawX + wPx} y2={dimY}
                                    stroke="#10b981" strokeWidth="0.5"
                                />
                                <circle cx={drawX} cy={dimY} r="1.5" fill="#10b981" />
                                {op.fromLeft === 0 && <circle cx={drawX} cy={dimY} r="1.5" fill="#10b981" />}
                                <circle cx={drawX + wPx} cy={dimY} r="1.5" fill="#10b981" />
                                {!compactLabels && (
                                    <rect x={(drawX + drawX + wPx) / 2 - 18} y={dimY - 7} width="36" height="14" fill="#09090b" opacity="1" />
                                )}
                                <text
                                    x={(drawX + drawX + wPx) / 2}
                                    y={compactLabels ? dimY + 10 : dimY + 0.5}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    fill="#10b981"
                                    className={compactLabels ? "text-[10px] font-mono select-none" : "text-[12px] font-mono select-none font-medium"}
                                >
                                    {op.width}
                                </text>

                                {/* Segment 3: Opening Right to Wall Right */}
                                {(() => {
                                    const rightSegmentWidth = wallLength - op.fromLeft - op.width;
                                    const midX = (drawX + wPx + svgBaseX + wallLength * pxPerMm) / 2;

                                    if (rightSegmentWidth <= 1) return null; // Hide if 0 (or close to 0 due to rounding)

                                    return (
                                        <>
                                            <line
                                                x1={drawX + wPx} y1={dimY}
                                                x2={svgBaseX + wallLength * pxPerMm} y2={dimY}
                                                stroke="#10b981" strokeWidth="0.5"
                                            />
                                            <circle cx={svgBaseX + wallLength * pxPerMm} cy={dimY} r="1.5" fill="#10b981" />
                                            {!compactLabels && (
                                                <rect x={midX - 18} y={dimY - 7} width="36" height="14" fill="#09090b" opacity="1" />
                                            )}
                                            <text
                                                x={midX}
                                                y={compactLabels ? dimY + 10 : dimY + 0.5}
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                fill="#10b981"
                                                className={compactLabels ? "text-[10px] font-mono select-none" : "text-[12px] font-mono select-none font-medium"}
                                            >
                                                {Math.round(rightSegmentWidth)}
                                            </text>
                                        </>
                                    );
                                })()}

                                {/* Extension lines down to wall (horizontal measurements) */}
                                <line x1={svgBaseX} y1={dimY} x2={svgBaseX} y2={svgBaseY} stroke="#10b981" strokeWidth="0.5" />
                                <line x1={drawX} y1={dimY} x2={drawX} y2={svgBaseY} stroke="#10b981" strokeWidth="0.5" />
                                <line x1={drawX + wPx} y1={dimY} x2={drawX + wPx} y2={svgBaseY} stroke="#10b981" strokeWidth="0.5" />
                                <line x1={svgBaseX + wallLength * pxPerMm} y1={dimY} x2={svgBaseX + wallLength * pxPerMm} y2={svgBaseY} stroke="#10b981" strokeWidth="0.5" />
                            </>
                        )}
                    </g>
                );
            })}
        </g>
    );
};
