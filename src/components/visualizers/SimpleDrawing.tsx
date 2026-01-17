'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { BaseDrawingFrame } from './BaseDrawingFrame';

export type DrawingMode = 'surface' | 'roof' | 'linear' | 'object' | 'box';

interface SimpleDrawingProps {
    item: {
        lengte?: string | number;
        hoogte?: string | number;
        breedte?: string | number;
        shape?: 'rectangle' | 'slope' | 'gable' | 'l-shape' | 'u-shape';
        balkafstand?: string | number;
        latafstand?: string | number;
    };
    type?: DrawingMode;
    mode?: DrawingMode;
    className?: string;
    fitContainer?: boolean;
}

export function SimpleDrawing({ item, type = 'box', mode, className, fitContainer }: SimpleDrawingProps) {
    const currentMode = mode || type;

    const lengte = parseFloat(String(item.lengte || 0));
    const hoogte = parseFloat(String(item.hoogte || 0));
    const breedte = parseFloat(String(item.breedte || 0));

    // Determinen dimensions. 
    // For Roof/Surface, we usually map Length -> Width, and Height/Width -> Height.
    const drawingWidth = lengte;
    const drawingHeight = hoogte > 0 ? hoogte : (breedte > 0 ? breedte : 0);

    const balkafstand = parseFloat(String(item.balkafstand || 0));
    const latafstand = parseFloat(String(item.latafstand || 0));

    const widthLabel = drawingWidth > 0 ? `${drawingWidth} mm` : '---';
    const heightLabel = drawingHeight > 0 ? `${drawingHeight} mm` : '---';

    // Style Constants matching WallDrawing
    const strokeColor = "rgb(70, 75, 85)";
    const fillColor = "rgba(70, 75, 85, 0.2)";
    const dimColor = "#10b981";

    // Determine grid label
    let gridLabel = 'Dimensies';
    if (currentMode === 'surface') gridLabel = 'Vlak / Oppervlakte';
    if (currentMode === 'roof') gridLabel = `Dakvlak: ${item.shape || 'Standaard'}`;
    if (currentMode === 'linear') gridLabel = 'Lineair / Profiel';
    if (currentMode === 'object') gridLabel = 'Object / Element';

    return (
        <BaseDrawingFrame
            width={drawingWidth}
            height={drawingHeight}
            primarySpacing={balkafstand}
            secondarySpacing={latafstand}
            widthLabel={widthLabel}
            heightLabel={heightLabel}
            className={className}
            fitContainer={fitContainer}
            gridLabel={gridLabel}
        >
            {({ startX, startY, rectW, rectH, drawW, drawH, pxPerMm }) => {

                // --- RENDER HELPERS ---

                const renderSurfaceGrid = () => {
                    const inputW = drawingWidth || 2400;
                    const inputH = drawingHeight || 2400;

                    const BEAM_THICKNESS = 45; // mm
                    const LATH_THICKNESS = 22; // mm

                    const beamPx = BEAM_THICKNESS * pxPerMm;
                    const lathPx = LATH_THICKNESS * pxPerMm;

                    // Style matching WallDrawing
                    const timberColor = "rgb(70, 75, 85)";
                    const timberStroke = "rgb(55, 60, 70)";

                    const plates = [];
                    const beams = [];
                    const slats = [];

                    // 1. FRAME PLATES (Top/Bottom) - Always Solid, Full Width
                    // Top Plate
                    plates.push(
                        <rect key="plate-top" x={startX} y={startY} width={rectW} height={beamPx} fill={timberColor} stroke={timberStroke} strokeWidth="0.5" />
                    );
                    // Bottom Plate
                    plates.push(
                        <rect key="plate-bottom" x={startX} y={startY + rectH - beamPx} width={rectW} height={beamPx} fill={timberColor} stroke={timberStroke} strokeWidth="0.5" />
                    );

                    // Side Studs (Left/Right) - Part of the main vertical frame
                    // Left Stud
                    beams.push(
                        <rect key="plate-left" x={startX} y={startY + beamPx} width={beamPx} height={rectH - (2 * beamPx)} fill={timberColor} stroke={timberStroke} strokeWidth="0.5" />
                    );
                    // Right Stud
                    beams.push(
                        <rect key="plate-right" x={startX + rectW - beamPx} y={startY + beamPx} width={beamPx} height={rectH - (2 * beamPx)} fill={timberColor} stroke={timberStroke} strokeWidth="0.5" />
                    );

                    // 2. VERTICAL BEAMS (Balken) - Infill
                    if (balkafstand > 0) {
                        const count = Math.floor(inputW / balkafstand);
                        for (let i = 1; i <= count; i++) {
                            const centerPos = startX + (i * (balkafstand / inputW) * rectW);
                            const xPos = centerPos - (beamPx / 2);

                            // Check collisions with Side Studs (Frame)
                            if (xPos <= startX + beamPx) continue;
                            if (xPos + beamPx >= startX + rectW - beamPx) continue;

                            beams.push(
                                <rect
                                    key={`beam-${i}`}
                                    x={xPos}
                                    y={startY + beamPx} // Between plates
                                    width={beamPx}
                                    height={rectH - (2 * beamPx)}
                                    fill={timberColor}
                                    stroke={timberStroke}
                                    strokeWidth="0.5"
                                />
                            );
                        }
                    }

                    // 3. HORIZONTAL SLATS (Latten) - Infill
                    // Render Solid, "On Top" of beams/plates to ensure visibility at bounds.
                    // VISUAL RULE: Include Flush Top/Bottom slats to "go to the end".

                    const topY = startY;
                    const bottomY = startY + rectH - lathPx;

                    // A. Top Slat (Flush)
                    slats.push(
                        <rect key="slat-top" x={startX} y={topY} width={rectW} height={lathPx}
                            fill={timberColor} stroke={timberStroke} strokeWidth="0.5" />
                    );

                    // B. Bottom Slat (Flush)
                    if (rectH > lathPx * 2) {
                        slats.push(
                            <rect key="slat-bottom" x={startX} y={bottomY} width={rectW} height={lathPx}
                                fill={timberColor} stroke={timberStroke} strokeWidth="0.5" />
                        );
                    }

                    // C. Middle Slats (H.O.H)
                    if (latafstand > 0) {
                        const count = Math.floor(inputH / latafstand);
                        for (let i = 1; i <= count; i++) {
                            const centerPos = startY + (i * (latafstand / inputH) * rectH);
                            const yPos = centerPos - (lathPx / 2);

                            // Skip if overlaps Top Slat visual
                            if (yPos < topY + lathPx) continue;
                            // Skip if overlaps Bottom Slat visual
                            if (yPos + lathPx > bottomY) continue;

                            slats.push(
                                <rect
                                    key={`slat-${i}`}
                                    x={startX}
                                    y={yPos}
                                    width={rectW}
                                    height={lathPx}
                                    fill={timberColor}
                                    stroke={timberStroke}
                                    strokeWidth="0.5"
                                />
                            );
                        }
                    }

                    // Render Order: Plates/Beams (Structure) -> Slats (Overlay Grid)
                    // Allows Slats to be visible crossing the beams.
                    return (
                        <g>
                            {plates}
                            {beams}
                            {slats}
                        </g>
                    );
                };

                // --- MODE LOGIC ---

                if (currentMode === 'surface') {
                    return renderSurfaceGrid();
                }

                if (currentMode === 'roof') {
                    const shape = item.shape || 'rectangle';
                    let path = '';
                    if (shape === 'gable' || shape.includes('punt')) {
                        path = `M ${startX} ${startY + rectH} L ${startX + rectW / 2} ${startY} L ${startX + rectW} ${startY + rectH} Z`;
                    } else if (shape === 'slope' || shape.includes('schuin')) {
                        path = `M ${startX} ${startY + rectH} L ${startX} ${startY + rectH * 0.3} L ${startX + rectW} ${startY} L ${startX + rectW} ${startY + rectH} Z`;
                    } else {
                        path = `M ${startX} ${startY} L ${startX + rectW} ${startY} L ${startX + rectW} ${startY + rectH} L ${startX} ${startY + rectH} Z`;
                    }
                    return <path d={path} fill={fillColor} stroke={strokeColor} strokeWidth="2" />;
                }

                if (currentMode === 'linear') {
                    const barH = 60;
                    const barY = startY + (rectH - barH) / 2;
                    return (
                        <rect x={startX} y={barY} width={rectW} height={barH} fill={fillColor} stroke={strokeColor} strokeWidth="2" rx="4" />
                    );
                }

                // Default / Box / Object
                return (
                    <rect x={startX} y={startY} width={rectW} height={rectH} fill={fillColor} stroke={strokeColor} strokeWidth="2" rx="4" />
                );
            }}
        </BaseDrawingFrame>
    );
}
