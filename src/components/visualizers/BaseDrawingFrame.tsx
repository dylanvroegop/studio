'use client';

import React, { useId } from 'react';
import { cn } from '@/lib/utils';

export interface BaseDrawingFrameProps {
    width: number;        // Total input width (mm)
    height: number;       // Total input height (mm)

    primarySpacing?: number;   // Top H.O.H (mm) (e.g. balkafstand)
    secondarySpacing?: number; // Right H.O.H (mm) (e.g. latafstand)

    className?: string; // Container class
    fitContainer?: boolean; // Expand to full container vs fixed 600x450

    startFromRight?: boolean; // Optional: Standardize grid direction if needed
    suppressTotalDimensions?: boolean; // If true, hides the outer Width/Height dimensions

    widthLabel?: string;  // Custom label for Bottom Dimension (default to width)
    heightLabel?: string; // Custom label for Left Dimension (default to height)
    gridLabel?: string;   // Watermark label centered (e.g. "Plafond Vlak")
    rightHeightLabel?: string; // Optional label for Right Dimension

    children: (ctx: DrawingContext) => React.ReactNode;

    // Advanced Props for Interactivity & Complex SVG features
    onPointerMove?: (e: React.PointerEvent) => void;
    onPointerUp?: (e: React.PointerEvent) => void;
    onPointerDown?: (e: React.PointerEvent) => void;
    svgDefs?: React.ReactNode;
    svgOverlay?: React.ReactNode;
    contentId?: string;
}

export interface DrawingContext {
    startX: number;
    startY: number;
    rectW: number; // Width in pixels of the drawing area
    rectH: number; // Height in pixels of the drawing area
    pxPerMm: number; // Scaling factor
    drawW: number; // Canvas avail width
    drawH: number; // Canvas avail height
    width: number; // Original width mm
    height: number; // Original height mm
}

export function calculateDrawingMetrics(width: number, height: number, fitContainer?: boolean) {
    // Increase container width slightly to accommodate right-side dimensions
    const SVG_WIDTH = fitContainer ? 1200 : 700;
    const SVG_HEIGHT = fitContainer ? 800 : 450;

    // Margins - Validated for new tighter dimension offsets (20px base, 30px step)
    const marginX = fitContainer ? 130 : 80;
    const marginY = fitContainer ? 100 : 70;

    // Available drawing area
    const drawW = SVG_WIDTH - (marginX * 2);
    const drawH = SVG_HEIGHT - (marginY * 2);

    let rectW = drawW;
    let rectH = drawH;

    if (width > 0 && height > 0) {
        const ratio = width / height;

        // Scale to fit within drawW x drawH maintaining aspect ratio
        const scaleX = drawW / width;
        const scaleY = drawH / height;
        const scale = Math.min(scaleX, scaleY);

        rectW = width * scale;
        rectH = height * scale;
    }

    const startX = (SVG_WIDTH - rectW) / 2;
    // Shift slightly down if plenty of space, or center
    const startY = (SVG_HEIGHT - rectH) / 2 - 10;

    const pxPerMm = rectW / (width || 1);

    return { SVG_WIDTH, SVG_HEIGHT, marginX, marginY, drawW, drawH, rectW, rectH, startX, startY, pxPerMm };
}

export function BaseDrawingFrame({
    width,
    height,
    primarySpacing = 0,
    secondarySpacing = 0,
    widthLabel,
    heightLabel,
    rightHeightLabel,
    gridLabel,
    className,
    fitContainer,
    startFromRight,
    suppressTotalDimensions,
    children,
    onPointerMove,
    onPointerUp,
    onPointerDown,
    svgDefs,
    svgOverlay,
    contentId
}: BaseDrawingFrameProps) {
    const patternId = useId().replace(/:/g, '');

    const metrics = calculateDrawingMetrics(width, height, fitContainer);
    const { SVG_WIDTH, SVG_HEIGHT, rectW, rectH, startX, startY, pxPerMm, drawW, drawH } = metrics;

    // Style Constants matching WallDrawing exactly
    const strokeColor = "rgb(70, 75, 85)";
    const fillColor = "rgba(70, 75, 85, 0.2)";
    const dimColor = "#10b981"; // Emerald-500
    const dotColor = "rgb(255, 255, 255)";

    // Calculate Grid Dots
    const dots: { x: number; y: number }[] = [];
    const spacing = 12;
    for (let x = spacing / 2; x < SVG_WIDTH; x += spacing) {
        for (let y = spacing / 2; y < SVG_HEIGHT; y += spacing) {
            dots.push({ x, y });
        }
    }

    // --- Render Helpers ---

    const renderTotalDimensions = () => {
        const x = startX;
        const y = startY;
        const w = rectW;
        const h = rectH;

        // CRITICAL: Calculate ideal position but CLAMP to stay within SVG bounds
        const idealDimY = y + h + 80; // Furthest from drawing (matches WallDrawing)

        // HARD BOUNDARY: Text height estimate + safety margin
        const textHeight = fitContainer ? 14 : 8; // Font size
        const safetyMargin = 10; // Extra space for descenders and padding
        const maxAllowedDimY = SVG_HEIGHT - safetyMargin - textHeight;

        // Clamp dimY to safe boundary
        const dimY = Math.min(idealDimY, maxAllowedDimY);

        // Warn if clamping occurred
        if (idealDimY > maxAllowedDimY && typeof window !== 'undefined') {
            console.warn(`Bottom dimension clamped: ${idealDimY} -> ${dimY} to fit in SVG_HEIGHT ${SVG_HEIGHT}`);
        }

        const dimY_Ext_Top = y + h + 2;

        const labelW = widthLabel ?? String(Math.round(width));
        const labelH = heightLabel ?? String(Math.round(height));

        return (
            <g className="text-emerald-500">
                {/* Bottom Dim (Length) */}
                <g>
                    <line x1={x} y1={dimY} x2={x + w} y2={dimY} stroke={dimColor} strokeWidth="1" />

                    {/* Extension Lines */}
                    <line x1={x} y1={dimY_Ext_Top} x2={x} y2={dimY} stroke={dimColor} strokeWidth="1" />
                    <line x1={x + w} y1={dimY_Ext_Top} x2={x + w} y2={dimY} stroke={dimColor} strokeWidth="1" />

                    {/* Dots */}
                    <circle cx={x} cy={dimY} r="1.5" fill={dimColor} />
                    <circle cx={x + w} cy={dimY} r="1.5" fill={dimColor} />

                    {/* Text with black background */}
                    <rect x={x + w / 2 - 20} y={dimY - 6} width="40" height="12" fill="#09090b" opacity="1" />
                    <text
                        x={x + w / 2} y={dimY + 3} textAnchor="middle" dominantBaseline="middle" fill={dimColor}
                        className="fill-emerald-400 font-mono font-bold"
                        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}
                    >
                        {labelW}
                    </text>
                </g>

                {/* Left Dim (Height) - FURTHEST from drawing */}
                <g>
                    {/* Main vertical dimension line at x - 80 (furthest left) */}
                    <line x1={x - 80} y1={y} x2={x - 80} y2={y + h} stroke={dimColor} strokeWidth="1" />

                    {/* Extension lines to wall */}
                    <line x1={x - 80} y1={y} x2={x - 2} y2={y} stroke={dimColor} strokeWidth="1" />
                    <line x1={x - 80} y1={y + h} x2={x - 2} y2={y + h} stroke={dimColor} strokeWidth="1" />

                    {/* Dots */}
                    <circle cx={x - 80} cy={y} r="1.5" fill={dimColor} />
                    <circle cx={x - 80} cy={y + h} r="1.5" fill={dimColor} />

                    {/* Rotated text with black background - vertical on the line */}
                    <g transform={`translate(${x - 80}, ${y + h / 2}) rotate(-90)`}>
                        <rect x="-20" y="-6" width="40" height="12" fill="#09090b" opacity="1" />
                        <text
                            textAnchor="middle" dominantBaseline="middle" fill={dimColor}
                            className="fill-emerald-400 font-mono font-bold"
                            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}
                        >
                            {labelH}
                        </text>
                    </g>
                </g>

                {/* Right Dim (Right Height) - Optional */}
                {rightHeightLabel && (
                    <g>
                        {/* Position right dimension within absolute SVG boundaries */}
                        {/* HARD CONSTRAINT: Never exceed SVG_WIDTH */}

                        {(() => {
                            const hasSecondary = secondarySpacing && secondarySpacing > 0;

                            // Calculate ideal position
                            const idealRightOffset = hasSecondary ? 35 : 25;
                            const idealLineX = x + w + idealRightOffset;

                            // HARD LIMIT: Text width estimate + safety margin
                            const textWidthEstimate = (fitContainer ? 40 : 24); // Rough estimate for "5000" at respective font sizes
                            const safetyMargin = 5;
                            const maxAllowedX = SVG_WIDTH - textWidthEstimate - safetyMargin;

                            // Clamp lineX to safe boundary
                            const lineX = Math.min(idealLineX, maxAllowedX);
                            const textX = lineX + 6;

                            // If we had to clamp, warn in console (dev only)
                            if (idealLineX > maxAllowedX && typeof window !== 'undefined') {
                                console.warn(`Right dimension clamped: ${idealLineX} -> ${lineX} to fit in SVG_WIDTH ${SVG_WIDTH}`);
                            }

                            return (
                                <>
                                    <line x1={lineX} y1={y} x2={lineX} y2={y + h} stroke={dimColor} strokeWidth="1" />

                                    <line x1={x + w + 2} y1={y} x2={lineX} y2={y} stroke={dimColor} strokeWidth="1" />
                                    <line x1={x + w + 2} y1={y + h} x2={lineX} y2={y + h} stroke={dimColor} strokeWidth="1" />

                                    <circle cx={lineX} cy={y} r="1.5" fill={dimColor} />
                                    <circle cx={lineX} cy={y + h} r="1.5" fill={dimColor} />

                                    <text
                                        x={textX} y={y + h / 2 + 3} textAnchor="start" fill={dimColor}
                                        className="fill-emerald-400 font-mono font-bold"
                                        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}
                                    >
                                        {rightHeightLabel}
                                    </text>
                                </>
                            );
                        })()}
                    </g>
                )}
            </g>
        );
    };

    const renderTopDimensions = () => {
        if (!primarySpacing || primarySpacing <= 0) return null;

        const dimY = startY - 20;
        const count = Math.floor(width / primarySpacing);

        const remainder = width - (count * primarySpacing);
        const hasRemainder = remainder > 2;

        const visibleSegments = [];
        const extensionIndices = new Set<number>();

        // Identify visible segments (1-based index)
        for (let i = 1; i <= count; i++) {
            const isFirst2 = i <= 2;
            const isLast2 = (hasRemainder ? i >= count : i >= count - 1);

            if (isFirst2 || isLast2) {
                visibleSegments.push({
                    index: i,
                    startI: i - 1,
                    endI: i,
                    val: Math.round(primarySpacing)
                });
                extensionIndices.add(i - 1);
                extensionIndices.add(i);
            }
        }

        // Render Segments & Labels
        const segmentEls = visibleSegments.map((seg) => {
            const prevX = startX + (seg.startI * (primarySpacing / width) * rectW);
            const currentX = startX + (seg.endI * (primarySpacing / width) * rectW);
            const midX = prevX + (currentX - prevX) / 2;

            return (
                <g key={`seg-top-${seg.index}`}>
                    <line
                        x1={prevX} y1={dimY} x2={currentX} y2={dimY}
                        stroke={dimColor} strokeWidth="0.5" strokeDasharray="2,2"
                    />
                    <text
                        x={midX} y={dimY - 2} textAnchor="middle" fill={dimColor}
                        className="fill-teal-500 text-[6px] font-mono select-none"
                        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: fitContainer ? '10px' : '6px' }}
                    >
                        {seg.val}
                    </text>
                </g>
            );
        });

        // Remainder Segment
        let remainderEl = null;
        if (hasRemainder) {
            const startXRem = startX + (count * (primarySpacing / width) * rectW);
            const endXRem = startX + rectW;
            const midXRem = startXRem + (endXRem - startXRem) / 2;
            const valRem = Math.round(remainder);

            // Add start extension (count index)
            extensionIndices.add(count);

            remainderEl = (
                <g key="seg-top-end">
                    <line
                        x1={startXRem} y1={dimY} x2={endXRem} y2={dimY}
                        stroke={dimColor} strokeWidth="0.5" strokeDasharray="2,2"
                    />
                    <text
                        x={midXRem} y={dimY - 2} textAnchor="middle" fill={dimColor}
                        className="fill-teal-500 text-[6px] font-mono select-none"
                        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: fitContainer ? '10px' : '6px' }}
                    >
                        {valRem}
                    </text>
                    {/* End Extension - Manual, as it might not index cleanly */}
                    <line
                        x1={endXRem} y1={startY} x2={endXRem} y2={dimY - 2}
                        stroke={dimColor} strokeWidth="0.5" strokeDasharray="1,2"
                    />
                </g>
            );
        }

        // Render Extensions from Set
        const extEls = Array.from(extensionIndices).map(i => {
            const x = startX + (i * (primarySpacing / width) * rectW);
            return (
                <line
                    key={`ext-top-${i}`}
                    x1={x} y1={startY} x2={x} y2={dimY - 2}
                    stroke={dimColor} strokeWidth="0.5" strokeDasharray="1,2"
                />
            );
        });

        return <g>{extEls}{segmentEls}{remainderEl}</g>;
    };

    const renderRightDimensions = () => {
        if (!secondarySpacing || secondarySpacing <= 0) return null;

        // HARD CONSTRAINT: Calculate ideal position but ensure it stays within SVG bounds
        const idealXDim = startX + rectW + 12; // Closer to wall (was 18)

        // Text is rotated 90 degrees, so we need space for text height (becomes width when rotated)
        // Estimate: "300" in small font ~20px, safety margin 5px
        const rotatedTextSpace = fitContainer ? 30 : 20;
        const maxAllowedXDim = SVG_WIDTH - rotatedTextSpace - 5;
        const xDim = Math.min(idealXDim, maxAllowedXDim);

        // Warn if clamping occurred
        if (idealXDim > maxAllowedXDim && typeof window !== 'undefined') {
            console.warn(`Right H.O.H. dimensions clamped: ${idealXDim} -> ${xDim} to fit in SVG_WIDTH ${SVG_WIDTH}`);
        }

        const count = Math.floor(height / secondarySpacing);
        const remainder = height - (count * secondarySpacing);
        const hasRemainder = remainder > 2;

        const visibleSegments = [];
        const extensionIndices = new Set<number>();

        for (let i = 1; i <= count; i++) {
            const isFirst2 = i <= 2;
            const isLast2 = (hasRemainder ? i >= count : i >= count - 1);

            if (isFirst2 || isLast2) {
                visibleSegments.push({
                    index: i,
                    startI: i - 1,
                    endI: i,
                    val: Math.round(secondarySpacing)
                });
                extensionIndices.add(i - 1);
                extensionIndices.add(i);
            }
        }

        const segmentEls = visibleSegments.map((seg) => {
            const prevY = startY + (seg.startI * (secondarySpacing / height) * rectH);
            const currentY = startY + (seg.endI * (secondarySpacing / height) * rectH);
            const midY = prevY + (currentY - prevY) / 2;

            // Positioning: Explicitly move text to the RIGHT of the line, then rotate
            const textX = xDim + 5; // Reduced shift (was 8) for tighter grouping
            const fontSize = fitContainer ? 10 : 6;
            // Background Box sizing
            const boxW = fontSize * 3;
            const boxH = fontSize + 4;

            return (
                <g key={`seg-right-${seg.index}`}>
                    <line
                        x1={xDim} y1={prevY} x2={xDim} y2={currentY}
                        stroke={dimColor} strokeWidth="0.5" strokeDasharray="2,2"
                    />
                    <g transform={`translate(${textX}, ${midY}) rotate(-90)`}>
                        <rect
                            x={-boxW / 2} y={-boxH / 2}
                            width={boxW} height={boxH}
                            fill="#09090b" opacity="0.8" rx="2"
                        />
                        <text
                            textAnchor="middle" dominantBaseline="middle" fill={dimColor}
                            className="fill-teal-500 font-mono select-none"
                            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: `${fontSize}px` }}
                        >
                            {seg.val}
                        </text>
                    </g>
                </g>
            );
        });

        let remainderEl = null;
        if (hasRemainder) {
            const startYRem = startY + (count * (secondarySpacing / height) * rectH);
            const endYRem = startY + rectH;
            const midYRem = startYRem + (endYRem - startYRem) / 2;
            const valRem = Math.round(remainder);

            extensionIndices.add(count);

            const fontSize = fitContainer ? 10 : 6;
            const textX = xDim + 5;
            const boxW = fontSize * 3;
            const boxH = fontSize + 4;

            remainderEl = (
                <g key="seg-right-end">
                    <line
                        x1={xDim} y1={startYRem} x2={xDim} y2={endYRem}
                        stroke={dimColor} strokeWidth="0.5" strokeDasharray="2,2"
                    />
                    <g transform={`translate(${textX}, ${midYRem}) rotate(-90)`}>
                        <rect
                            x={-boxW / 2} y={-boxH / 2}
                            width={boxW} height={boxH}
                            fill="#09090b" opacity="0.8" rx="2"
                        />
                        <text
                            textAnchor="middle" dominantBaseline="middle" fill={dimColor}
                            className="fill-teal-500 font-mono select-none"
                            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: `${fontSize}px` }}
                        >
                            {valRem}
                        </text>
                    </g>
                    <line
                        x1={startX + rectW} y1={endYRem} x2={xDim - 2} y2={endYRem}
                        stroke={dimColor} strokeWidth="0.5" strokeDasharray="1,2"
                    />
                </g>
            );
        }

        const extEls = Array.from(extensionIndices).map(i => {
            const y = startY + (i * (secondarySpacing / height) * rectH);
            return (
                <line
                    key={`ext-right-${i}`}
                    x1={startX + rectW} y1={y} x2={xDim - 2} y2={y}
                    stroke={dimColor} strokeWidth="0.5" strokeDasharray="1,2"
                />
            );
        });

        return <g>{extEls}{segmentEls}{remainderEl}</g>;
    };

    const renderWatermark = () => (
        <text
            x={SVG_WIDTH / 2} y={SVG_HEIGHT / 2} textAnchor="middle" fill="white" opacity="0.3"
            style={{ fontSize: fitContainer ? '24px' : '14px', fontFamily: 'sans-serif', pointerEvents: 'none' }}
        >
            {gridLabel}
        </text>
    );

    return (
        <div className={cn("w-full rounded-lg overflow-hidden border border-border/30 bg-[#09090b]", className)}>
            <svg
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                className={cn("w-full select-none", fitContainer ? "h-full" : "h-auto")}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerDown={onPointerDown}
                style={{ touchAction: 'none' }}
            >
                {dots.map((dot, i) => (
                    <circle key={i} cx={dot.x} cy={dot.y} r="0.7" fill={dotColor} opacity="0.15" />
                ))}

                <defs>
                    <pattern id={`grid-${patternId}`} width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke={strokeColor} strokeWidth="0.5" opacity="0.3" />
                    </pattern>

                    {/* HARD BOUNDARY CLIP PATH - Absolute safety net */}
                    {/* This ensures NOTHING can ever render outside the SVG viewBox */}
                    <clipPath id={`boundary-clip-${patternId}`}>
                        <rect x="0" y="0" width={SVG_WIDTH} height={SVG_HEIGHT} />
                    </clipPath>

                    {svgDefs}
                </defs>

                {/* Apply clip-path to entire content group - HARD BOUNDARY ENFORCEMENT */}
                <g id={contentId} clipPath={`url(#boundary-clip-${patternId})`}>
                    {/* Standard Background Frame - REMOVED for clean "Wall" style. Children render their own structure. */}
                    {/* <rect x={startX} y={startY} width={rectW} height={rectH} fill={fillColor} opacity="0.2" /> */}
                    {/* <rect x={startX} y={startY} width={rectW} height={rectH} fill="none" stroke={strokeColor} strokeWidth="2" /> */}
                    {/* Grid Pattern optional, but removing for now to match WallDrawing cleanliness */}
                    {/* <rect x={startX} y={startY} width={rectW} height={rectH} fill={`url(#grid-${patternId})`} opacity="0.5" /> */}

                    {/* Content Children */}
                    {children({
                        startX,
                        startY,
                        rectW,
                        rectH,
                        pxPerMm,
                        drawW,
                        drawH,
                        width,
                        height
                    })}

                    {/* Dimensions */}
                    {!suppressTotalDimensions && renderTotalDimensions()}
                    {renderTopDimensions()}
                    {renderRightDimensions()}
                    {gridLabel && renderWatermark()}
                </g>

                {/* Overlays (Magnifier, etc) */}
                {svgOverlay}
            </svg>
        </div>
    );
}
