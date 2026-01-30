'use client';

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';
import { DrawingData } from '@/lib/drawing-types';
import { DimensionLine } from './shared/measurements';

interface BoeiboordDrawingProps {
    lengte: string | number;
    hoogte: string | number; // Voorzijde Hoogte
    breedte: string | number; // Onderzijde Breedte
    balkafstand: string | number;
    latafstand: string | number; // Voorzijde
    onderzijde_latafstand: string | number; // Onderzijde
    className?: string;
    fitContainer?: boolean;
    onDataGenerated?: (data: DrawingData) => void;
    title?: string;
    showKopkanten?: boolean;
}

export function BoeiboordDrawing({
    lengte,
    hoogte,
    breedte,
    balkafstand,
    latafstand,
    onderzijde_latafstand,
    className,
    fitContainer,
    onDataGenerated,
    title,
}: BoeiboordDrawingProps) {
    const lengteNum = typeof lengte === 'number' ? lengte : parseFloat(String(lengte)) || 0;
    const hoogteNum = typeof hoogte === 'number' ? hoogte : parseFloat(String(hoogte)) || 0; // Front Height
    const breedteNum = typeof breedte === 'number' ? breedte : parseFloat(String(breedte)) || 0; // Bottom Width

    // Spacing
    const balkafstandNum = typeof balkafstand === 'number' ? balkafstand : parseFloat(String(balkafstand)) || 600;
    const latVoorzijdeNum = typeof latafstand === 'number' ? latafstand : parseFloat(String(latafstand)) || 300;
    const latOnderzijdeNum = typeof onderzijde_latafstand === 'number' ? onderzijde_latafstand : parseFloat(String(onderzijde_latafstand)) || 300;

    // We split the canvas into two stacked views.
    // Top: Voorzijde (Height = hoogteNum)
    // Bottom: Onderzijde (Height = breedteNum)
    // We need some gap between them for visual separation.
    const GAP_BETWEEN_VIEWS = 200; // mm visual gap
    const totalDrawingHeight = hoogteNum + GAP_BETWEEN_VIEWS + breedteNum;

    // --- LOGIC: BEAMS (Verticals) --- 
    // "just a vertical beam at h.o.h. whatever is filled in" - No top/bottom plates mentioned, but structural sense implies they attach to something. 
    // User said: "not show a 'top beam and bottom beam' just a vertical beam".
    // We assume these beams run through the *entire* structure? Or just backing?
    // Usually boeiboord construction: Vertical backing beams (regelwerk) against the wall/roof edge.
    // Visual: Vertical bars along the length.

    const STUD_W = 44; // Standard slat width? Or 50? component-registry says 'balkafstand', usually 44x69 or similar. Let's use 44mm.

    const structure = useMemo(() => {
        if (lengteNum <= 0) return { voorzijdeItems: [], onderzijdeItems: [] };

        const voorzijdeItems: any[] = [];
        const onderzijdeItems: any[] = [];

        // 1. VERTICALS (Balken / Regelwerk)
        // Distribute along length
        const numBeams = Math.floor(lengteNum / balkafstandNum) + 1;
        const beamXPositions: number[] = [];
        for (let i = 0; i < numBeams; i++) {
            let x = i * balkafstandNum;
            if (x > lengteNum - STUD_W) x = lengteNum - STUD_W; // Clamp last one
            beamXPositions.push(x);
        }
        // Ensure end beam
        if (beamXPositions[beamXPositions.length - 1] < lengteNum - STUD_W) {
            beamXPositions.push(lengteNum - STUD_W);
        }
        const uniqueBeams = Array.from(new Set(beamXPositions)).sort((a, b) => a - b);

        // Add Vertical Beams to BOTH views (since they provide backing for both front and bottom usually, or at least the position is relevant)
        // User said: "split screen... top shows voorzijde and bottom shows onderzijde... pretty much 2 drawings"
        uniqueBeams.forEach(x => {
            // Voorzijde Vertical
            voorzijdeItems.push({ type: 'beam', x, y: 0, w: STUD_W, h: hoogteNum });
            // Onderzijde "Vertical" (which is actually a cross member in the bottom view? Or just the same beam viewed from bottom?)
            // If viewing from bottom, a vertical beam against the wall would be a rectangle at the 'back' of the bottom view?
            // User query: "divide by the onderzijde breedte... so that the onderzijde shows inside the drawing the measurements equally." -> This refers to LATTEN (horizontal).
            // Vertical beams in bottom view: If it's an L-shape construction, the vertical beam is visible as a block.
            // Let's render them as 'support blocks' in the bottom view for context.
            onderzijdeItems.push({ type: 'beam', x, y: 0, w: STUD_W, h: breedteNum, opacity: 0.3 }); // Faint structural reference
        });

        // 2. HORIZONTAL LATTEN - VOORZIJDE
        // "if hoogte is 300mm, place one at bottom and one at top"
        // "h.o.h structure... start from 0"
        // Interpretation: Always one at 0 (Bottom of front view?), one at Top (Height). And intermediates.
        // User: "starts from 0, then to the middle... then 600... it should be divided among so its nicely structured." -> This was about ONDERZIJDE.
        // For Voorzijde: "latafstand... horizontally placed... if hoogte 300, place one bottom one top".
        // Let's just create slats at interval.
        const LAT_H = 22; // Thin slat

        // Always Top and Bottom for Voorzijde?
        voorzijdeItems.push({ type: 'lat', x: 0, y: 0, w: lengteNum, h: LAT_H }); // Bottom (Y=0 is bottom in our coord system usually, or we flip)
        // BaseDrawingFrame Y=0 is usually bottom? No, SVG coords Y=0 is top. BaseDrawingFrame flips it? 
        // BaseDrawingFrame: "getY(mm) => Y_BOTTOM - (mm * pxPerMm)". So logical Y=0 is visual bottom.

        voorzijdeItems.push({ type: 'lat', x: 0, y: hoogteNum - LAT_H, w: lengteNum, h: LAT_H }); // Top

        // Intermediates for Voorzijde
        if (hoogteNum > latVoorzijdeNum) {
            const numSpacesV = Math.ceil(hoogteNum / latVoorzijdeNum);
            const distV = hoogteNum / numSpacesV; // Equal distribution? Or fixed latVoorzijdeNum?
            // User said about ONDERZIJDE: "calculate down, never up... 800/4 = 200". 
            // For Voorzijde, let's stick to standard interval logic or equal distribution if implied. 
            // "latafstand... starts from 0, then to the middle..." -> This seems to apply to standard ceiling logic. 
            // Let's use standard h.o.h from bottom (0).
            for (let y = latVoorzijdeNum; y < hoogteNum - LAT_H; y += latVoorzijdeNum) {
                voorzijdeItems.push({ type: 'lat', x: 0, y: y - (LAT_H / 2), w: lengteNum, h: LAT_H });
            }
        }

        // 3. HORIZONTAL LATTEN - ONDERZIJDE (The "Smart" One)
        // "onderzijde 800mm? latafstand 300mm? 800/4 = 200mm... 4 latten placed horizontally... divided among so its nicely structured"
        // So: N = Math.ceil(breedte / requested_spacing). Spacing = breedte / N.

        // Always start/end latten for construction? usually yes.
        // User example says "4 latten". If 800 wide. 4 latten means 3 spaces? Or 4 spaces?
        // "800mm / 4 = 200mm". 200mm is the space. 800mm is total.
        // This implies 5 latten if 4 spaces? Or 4 latten dividing the space?
        // "4 latten placed horizontally... with measurement... start from 0... second 200..."
        // If start is 0, second is 200, third 400, fourth 600, fifth 800. That is 5 latten, 4 spaces.
        // So N_Spaces = Math.ceil(breedte / defined_max_spacing).
        // Actual Spacing = breedte / N_Spaces.
        // Lat positions: 0, 1*Sp, 2*Sp... N*Sp.

        let safeOnderLatInfo = { count: 0, spacing: 0 };
        if (breedteNum > 0 && latOnderzijdeNum > 0) {
            const numSpaces = Math.ceil(breedteNum / latOnderzijdeNum); // e.g. 800 / 300 = 2.66 -> 3 spaces. 
            // Wait user example: "800 / 4 = 200". (User used 4 squares? 800/300 is approx 2.6. If they want 200, they divided by 4. 800/4=200. 300 is larger than 200. This means they rounded UP the number of spaces to make spacing SMALLER or EQUAL to target. Correct.)
            const actualSpacing = breedteNum / numSpaces;
            safeOnderLatInfo = { count: numSpaces, spacing: actualSpacing };

            for (let i = 0; i <= numSpaces; i++) {
                const yPos = i * actualSpacing;
                // Center the lat around the pos? or start edge?
                // "Start from 0".
                let drawY = yPos;
                if (i === numSpaces) drawY = breedteNum - LAT_H; // Align last one inside
                else if (i > 0) drawY = yPos - (LAT_H / 2); // Center intermediate

                onderzijdeItems.push({ type: 'lat', x: 0, y: drawY, w: lengteNum, h: LAT_H });
            }
        }

        return { voorzijdeItems, onderzijdeItems, safeOnderLatInfo };
    }, [lengteNum, hoogteNum, breedteNum, balkafstandNum, latVoorzijdeNum, latOnderzijdeNum]);

    // Emit Data
    const lastEmittedRef = useRef<string>('');
    useEffect(() => {
        if (!onDataGenerated) return;
        const data: DrawingData = {
            walls: [],
            beams: [],
            dimensions: [],
            params: { lengte: lengteNum, hoogte: hoogteNum, breedte: breedteNum },
            calculatedData: {
                lengte: lengteNum,
                voorzijde_hoogte: hoogteNum,
                onderzijde_breedte: breedteNum,
                interne_onderzijde_verdeling: structure.safeOnderLatInfo
            }
        };
        const json = JSON.stringify(data);
        if (json !== lastEmittedRef.current) {
            lastEmittedRef.current = json;
            onDataGenerated(data);
        }
    }, [structure, onDataGenerated, lengteNum, hoogteNum, breedteNum]);

    return (
        <BaseDrawingFrame
            width={lengteNum}
            height={totalDrawingHeight}
            className={className}
            fitContainer={fitContainer}
            widthLabel={`${lengteNum}`}
            heightLabel={`${hoogteNum} + ${breedteNum}`}
            suppressTotalDimensions={true}
        >
            {(ctx) => {
                const { startX, startY, rectW, rectH, pxPerMm, SVG_HEIGHT } = ctx;

                // We define our own Y Mapping because BaseDrawingFrame assumes one big box fitting 'height'.
                // Our 'height' passed to BaseFrame is `totalDrawingHeight`.
                // BaseFrame maps logical 0 to Y_BOTTOM.
                // Logical TotalHeight to Y_TOP.

                const Y_BOTTOM = startY + rectH;
                const getY = (mm: number) => Y_BOTTOM - (mm * pxPerMm);

                // --- RENDER ONDERZIJDE (Bottom View) ---
                // Logical Y range: [0, breedteNum]
                const renderOnderzijde = () => {
                    const items = structure.onderzijdeItems.map((item, i) => {
                        const yAbs = getY(item.y + item.h); // Top-left Y in SVG
                        return (
                            <rect
                                key={`onder-${i}`}
                                x={startX + item.x * pxPerMm}
                                y={getY(item.y + item.h)} // Rect Y is top-left
                                width={item.w * pxPerMm}
                                height={item.h * pxPerMm}
                                fill="rgb(70, 75, 85)"
                                stroke="rgb(55, 60, 70)"
                                strokeWidth="0.5"
                                opacity={item.opacity || 1}
                            />
                        );
                    });

                    // Outline
                    const outline = (
                        <rect
                            x={startX}
                            y={getY(breedteNum)}
                            width={rectW}
                            height={breedteNum * pxPerMm}
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="1"
                            strokeDasharray="5,5"
                        />
                    );

                    // Label
                    const label = (
                        <text x={startX - 10} y={getY(breedteNum / 2)} textAnchor="end" fill="#10b981" fontSize="10" transform={`rotate(-90, ${startX - 10}, ${getY(breedteNum / 2)})`}>
                            Onderzijde ({breedteNum}mm)
                        </text>
                    );

                    return <>{items}{outline}{label}</>;
                };

                // --- VISUAL GAP ---
                // Range [breedteNum, breedteNum + GAP_BETWEEN_VIEWS]
                const renderGap = () => {
                    const y1 = getY(breedteNum);
                    const y2 = getY(breedteNum + GAP_BETWEEN_VIEWS);
                    return (
                        <line x1={startX} y1={(y1 + y2) / 2} x2={startX + rectW} y2={(y1 + y2) / 2} stroke="rgb(255,255,255)" strokeOpacity="0.1" strokeWidth="1" />
                    );
                };

                // --- RENDER VOORZIJDE (Top View) ---
                // Logical Shift: breedteNum + GAP_BETWEEN_VIEWS
                const V_OFFSET = breedteNum + GAP_BETWEEN_VIEWS;

                const renderVoorzijde = () => {
                    const items = structure.voorzijdeItems.map((item, i) => {
                        // Shift visual Y by V_OFFSET
                        // Logical Item Y is relative to Voorzijde Base (0).
                        // Actual Logical Y = V_OFFSET + item.y
                        const logicY = V_OFFSET + item.y;
                        const svgY = getY(logicY + item.h); // Rect Y is top-left

                        return (
                            <rect
                                key={`voor-${i}`}
                                x={startX + item.x * pxPerMm}
                                y={svgY}
                                width={item.w * pxPerMm}
                                height={item.h * pxPerMm}
                                fill="rgb(70, 75, 85)"
                                stroke="rgb(55, 60, 70)"
                                strokeWidth="0.5"
                            />
                        );
                    });

                    // Outline
                    const outline = (
                        <rect
                            x={startX}
                            y={getY(V_OFFSET + hoogteNum)}
                            width={rectW}
                            height={hoogteNum * pxPerMm}
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth="1"
                        />
                    );

                    // Label
                    const label = (
                        <text x={startX - 10} y={getY(V_OFFSET + hoogteNum / 2)} textAnchor="end" fill="#3b82f6" fontSize="10" transform={`rotate(-90, ${startX - 10}, ${getY(V_OFFSET + hoogteNum / 2)})`}>
                            Voorzijde ({hoogteNum}mm)
                        </text>
                    );

                    return <>{items}{outline}{label}</>;
                };

                return (
                    <>
                        {renderOnderzijde()}
                        {renderGap()}
                        {renderVoorzijde()}

                        {/* Overall Width Dimension */}
                        <DimensionLine
                            p1={{ x: startX, y: Y_BOTTOM + 20 }}
                            p2={{ x: startX + rectW, y: Y_BOTTOM + 20 }}
                            label={lengteNum}
                            offset={0}
                        />
                    </>
                );
            }}
        </BaseDrawingFrame>
    );
}
