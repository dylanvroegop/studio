'use client';

import React from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';
import { OverallDimensions, DimensionLine } from './shared/measurements';

interface SchuttingDrawingProps {
    lengte: number;
    hoogte: number;
    paalafstand: number;
    plank_richting?: 'horizontal' | 'vertical';
    type_schutting?: 'planken' | 'schermen';
    betonband_hoogte?: number;
    fitContainer?: boolean;
    className?: string;
    // ... allow generic props
    [key: string]: any;
}

export function SchuttingDrawing({
    lengte,
    hoogte,
    paalafstand = 1800,
    plank_richting = 'horizontal',
    type_schutting = 'schermen',
    betonband_hoogte = 0,
    fitContainer = false,
    className,
    ...props
}: SchuttingDrawingProps) {

    const drawingWidth = parseFloat(String(lengte)) || 0;
    const drawingHeight = parseFloat(String(hoogte)) || 0;
    const rawPostDistance = parseFloat(String(paalafstand)) || 1800;
    const postDistance = Math.max(200, rawPostDistance); // Minimum 200mm limit
    const bandHeight = parseFloat(String(betonband_hoogte)) || 0;

    const areaStats = React.useMemo(() => ({
        gross: drawingWidth * drawingHeight,
        net: drawingWidth * drawingHeight,
        hasOpenings: false
    }), [drawingWidth, drawingHeight]);

    return (
        <BaseDrawingFrame
            areaStats={areaStats}
            width={drawingWidth}
            height={drawingHeight}
            className={className}
            fitContainer={fitContainer}
            suppressTotalDimensions={true}

        >
            {({ startX, startY, rectW, rectH, pxPerMm }) => {

                const postWidthMm = 100; // Standard 10x10 post
                const postWidthPx = postWidthMm * pxPerMm;

                const bandHeightPx = bandHeight * pxPerMm;
                const effectiveFenceHeightPx = rectH - bandHeightPx;
                const fenceStartY = startY;

                // Colors
                const postColor = "#5D4037"; // Dark Brown
                const plankColor = "#8D6E63"; // Brown
                const bandColor = "#9E9E9E"; // Grey

                const elements = [];

                // 1. Concrete Band (Bottom)
                if (bandHeight > 0) {
                    elements.push(
                        <rect
                            key="concrete-band"
                            x={startX}
                            y={startY + effectiveFenceHeightPx}
                            width={rectW}
                            height={bandHeightPx}
                            fill={bandColor}
                            stroke="#616161"
                            strokeWidth="1"
                        />
                    );
                }

                // 2. Posts (Palen)
                // Post Data
                const innerDistance = postDistance; // User input is now "between" posts
                const periodMm = innerDistance + postWidthMm;
                const periodPx = periodMm * pxPerMm;

                // How many full segments fit?
                // length = Post + (Space + Post) * N + Remainder?
                // Simplified: Just loop steps of periodMm until we run out of width.
                // Or: Math.ceil((drawingWidth - postWidthMm) / periodMm) + 1?
                // Let's just loop.

                const posts = [];
                const panels = [];

                // Calculate positions dynamically
                const postXPositions: number[] = [];
                let currentX = 0;

                while (currentX + postWidthMm <= drawingWidth) {
                    postXPositions.push(currentX);
                    currentX += periodMm;
                }
                // Always ensure at least one post if width > 0 ? Or ensure last post logic?
                // If the last post goes beyond width, do we clamp it or skip it?
                // Schutting usually ends with a post.
                // If the remainder is small, maybe we don't put a full spacing.
                // Let's stick to strict period spacing, and if the last one exceeds drawing width, we clamp/cut or just end.
                // User expects "Totale Lengte " to be exact.
                // So often the last panel is cut.
                // We should place a post at the very end regardless?
                // Let's place standard periodic posts. 
                // AND ensure there is a post at the end if the pattern doesn't land exactly there? 
                // Or just standard pattern filling. Let's do standard pattern filling first.

                if (drawingWidth > 0 && postXPositions.length === 0) postXPositions.push(0);

                // Add end post explicitly if we want the wall to be "closed" and the last periodic post is not at the end.
                // However, standard builder logic: fixed spacing, last bit is cut.
                // The drawing should reflect: Post @ 0, Post @ P, Post @ 2P...

                // Draw Posts
                postXPositions.forEach((xMm, i) => {
                    const xPx = startX + (xMm * pxPerMm);
                    // Check if completely OOB
                    if (xMm >= drawingWidth) return;

                    // Draw Post
                    if (effectiveFenceHeightPx > 0) {
                        posts.push(
                            <rect
                                key={`post-${i}`}
                                x={xPx}
                                y={startY}
                                width={postWidthPx}
                                height={effectiveFenceHeightPx + (bandHeightPx > 0 ? bandHeightPx : 0)}
                                fill={postColor}
                                stroke="#3E2723"
                                strokeWidth="1"
                            />
                        );
                    }
                });

                // Also draw a post at the VERY END if needed (to close the fence)?
                // Typically a fence has a start and end post.
                // If our periodic loop didn't place a post at `drawingWidth - postWidthMm`, we might want to?
                // Let's add an explicit END POST if there's enough gap?
                // For now, let's stick to the periodic loop which represents "fixed spacing". 
                // But typically you want the fence to END with a post.
                // Let's add a post at `drawingWidth - postWidthMm` to show the boundary?
                // The user said "Totale Lengte".
                const endPostXMm = drawingWidth - postWidthMm;
                const lastPeriodic = postXPositions[postXPositions.length - 1];

                let hasEndPost = false;
                if (Math.abs(lastPeriodic - endPostXMm) > 10) { // If significant diff
                    // Add visual end post?
                    // Often builders calculate spacing to fit exactly OR cut the last panel.
                    // If we just cut the last panel, we need a post to hold it.
                    const xPx = startX + (endPostXMm * pxPerMm);
                    posts.push(
                        <rect
                            key="post-end"
                            x={xPx}
                            y={startY}
                            width={postWidthPx}
                            height={effectiveFenceHeightPx + (bandHeightPx > 0 ? bandHeightPx : 0)}
                            fill={postColor}
                            stroke="#3E2723"
                            strokeWidth="1"
                        />
                    );
                    hasEndPost = true;
                } else {
                    hasEndPost = true; // Last periodic IS the end post effectively
                }

                // Draw Panels in between
                // The spaces are between postXPositions[i] + postWidth and postXPositions[i+1] (or end).

                // Merge all post positions for panel logic (include the forced end post if it exists and isn't dup)
                const allPostStarts = [...postXPositions];
                if (drawingWidth > 0 && Math.abs(lastPeriodic - endPostXMm) > 10) {
                    allPostStarts.push(endPostXMm);
                }
                allPostStarts.sort((a, b) => a - b);

                for (let i = 0; i < allPostStarts.length - 1; i++) {
                    const currentPostX = allPostStarts[i];
                    const nextPostX = allPostStarts[i + 1];

                    const panelStartX = currentPostX + postWidthMm;
                    const panelWidthMm = nextPostX - panelStartX;

                    if (panelWidthMm <= 1) continue; // No space

                    const pxX = startX + (panelStartX * pxPerMm);
                    const pxW = panelWidthMm * pxPerMm;

                    if (effectiveFenceHeightPx > 0) {
                        if (type_schutting === 'schermen') {
                            const margin = 5 * pxPerMm;
                            panels.push(
                                <rect
                                    key={`panel-${i}`}
                                    x={pxX + margin}
                                    y={startY + margin}
                                    width={Math.max(0, pxW - 2 * margin)}
                                    height={Math.max(0, effectiveFenceHeightPx - 2 * margin)}
                                    fill={plankColor}
                                    opacity="0.8"
                                    stroke="#5D4037"
                                    strokeWidth="1"
                                />
                            );
                            // Cross
                            if (pxW > 20) {
                                panels.push(<line key={`c1-${i}`} x1={pxX + margin} y1={startY + margin} x2={pxX + pxW - margin} y2={startY + effectiveFenceHeightPx - margin} stroke="#6D4C41" strokeWidth="1" />);
                                panels.push(<line key={`c2-${i}`} x1={pxX + pxW - margin} y1={startY + margin} x2={pxX + margin} y2={startY + effectiveFenceHeightPx - margin} stroke="#6D4C41" strokeWidth="1" />);
                            }
                        } else {
                            // Horizontal Planks fill
                            // Simplified just drawing a rect for now to save complexity, or reused logic?
                            // Reuse simple logic:
                            const plankSizeMm = 140;
                            const gapMm = 10;
                            const numPlanks = Math.floor(drawingHeight / (plankSizeMm + gapMm));
                            for (let r = 0; r < numPlanks; r++) {
                                const pY = startY + (r * (plankSizeMm + gapMm) * pxPerMm);
                                if (pY + (plankSizeMm * pxPerMm) > startY + effectiveFenceHeightPx) break;
                                panels.push(<rect key={`pl-${i}-${r}`} x={pxX} y={pY} width={pxW} height={plankSizeMm * pxPerMm} fill={plankColor} stroke="#5D4037" strokeWidth="0.5" />);
                            }
                        }
                    }
                }

                return (
                    <g>
                        {bandHeight > 0 &&
                            <rect
                                key="concrete-band"
                                x={startX}
                                y={startY + effectiveFenceHeightPx}
                                width={rectW}
                                height={bandHeightPx}
                                fill={bandColor}
                                stroke="#616161"
                                strokeWidth="1"
                            />
                        }
                        {panels}
                        {posts}

                        {/* Paalafstand Measurement (Inner Distance) */
                            postXPositions.length >= 2 && (() => {
                                // Coordinates
                                const yRef = startY + rectH; // Bottom of drawing (including band)
                                const dimY = yRef + 40; // 40px below bottom

                                const p1x = startX + postWidthPx; // Right edge of 1st post (startX is left edge of 1st post)
                                const p2x = startX + postWidthPx + (innerDistance * pxPerMm); // Left edge of 2nd post

                                return (
                                    <g>
                                        {/* Extension lines */}
                                        <line
                                            x1={p1x} y1={yRef}
                                            x2={p1x} y2={dimY}
                                            stroke="#10b981"
                                            strokeWidth="0.5"
                                            opacity="0.5"
                                        />
                                        <line
                                            x1={p2x} y1={yRef}
                                            x2={p2x} y2={dimY}
                                            stroke="#10b981"
                                            strokeWidth="0.5"
                                            opacity="0.5"
                                        />

                                        {/* Dimension Line */}
                                        {/* We use DimensionLine component but manually styled to match OpeningMeasurements exact look if needed, 
                                         or just use DimensionLine which is robust. 
                                         OpeningMeasurements does manual line/rect/text drawing.
                                         Let's use DimensionLine for simplicity but with 0 offset since we calculated y manually.
                                     */}
                                        <DimensionLine
                                            p1={{ x: p1x, y: dimY }}
                                            p2={{ x: p2x, y: dimY }}
                                            label={Math.round(innerDistance).toString()}
                                            offset={0}
                                            color="#10b981"
                                            orientation="horizontal"
                                        />
                                    </g>
                                );
                            })()}

                        <OverallDimensions
                            wallLength={drawingWidth}
                            wallHeight={drawingHeight}
                            svgBaseX={startX}
                            svgBaseY={startY + rectH}
                            pxPerMm={pxPerMm}
                            offsetBottom={80} // Push overall dimensions further down to avoid overlap
                        />
                    </g>
                );
            }}
        </BaseDrawingFrame>
    );
}
