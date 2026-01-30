'use client';

import React, { useMemo, useRef, useEffect } from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';
import { DrawingData } from '@/lib/drawing-types';
import {
    OverallDimensions,
    GridMeasurements
} from './shared/measurements';
import { calculateGridGaps } from './shared/framing-utils';

interface BoeiboordDrawingProps {
    lengte: string | number;
    hoogte: string | number; // Voorzijde Hoogte
    breedte: string | number; // Onderzijde Breedte
    balkafstand: string | number;
    latafstand: string | number; // Voorzijde spacing
    onderzijde_latafstand?: string | number;
    className?: string;
    fitContainer?: boolean;
    onDataGenerated?: (data: DrawingData) => void;
    title?: string;
    showKopkanten?: boolean;
    startLattenFromBottom?: boolean;
    doubleEndBattens?: boolean;
}

export function BoeiboordDrawing({
    lengte,
    hoogte,
    breedte,
    balkafstand,
    latafstand,
    className,
    fitContainer,
    onDataGenerated,
    title,
    startLattenFromBottom,
    doubleEndBattens
}: BoeiboordDrawingProps) {
    const lengteNum = typeof lengte === 'number' ? lengte : parseFloat(String(lengte)) || 0;
    const hoogteNum = typeof hoogte === 'number' ? hoogte : parseFloat(String(hoogte)) || 0;
    const breedteNum = typeof breedte === 'number' ? breedte : parseFloat(String(breedte)) || 0;

    // The user wants "1 drawing again". We combine Voorzijde and Onderzijde into one total height.
    const totalHeight = hoogteNum + breedteNum;

    // Spacing
    const balkafstandNum = typeof balkafstand === 'number' ? balkafstand : parseFloat(String(balkafstand)) || 600;
    const latafstandNum = typeof latafstand === 'number' ? latafstand : parseFloat(String(latafstand)) || 300;

    const structure = useMemo(() => {
        if (lengteNum <= 0 || totalHeight <= 0) return { beamCenters: [], gridGaps: [], latCenters: [], latGaps: [] };

        // 1. VERTICAL BEAMS (Balken) - along the length
        const framing = calculateGridGaps({
            wallLength: lengteNum,
            spacing: balkafstandNum,
            studWidth: 70
        });

        // 2. HORIZONTAL LATTEN (Latten) - along the height
        const lattenFraming = calculateGridGaps({
            wallLength: totalHeight,
            spacing: latafstandNum,
            studWidth: 22,
            startFromRight: startLattenFromBottom
        });

        return {
            beamCenters: framing.beamCenters,
            gridGaps: framing.gaps,
            latCenters: lattenFraming.beamCenters,
            latGaps: lattenFraming.gaps
        };
    }, [lengteNum, totalHeight, balkafstandNum, latafstandNum, startLattenFromBottom]);

    // Emit Data
    const lastEmittedRef = useRef<string>('');
    useEffect(() => {
        if (!onDataGenerated) return;
        const data: DrawingData = {
            walls: [{ label: 'Main', lengte: lengteNum, hoogte: totalHeight, shape: 'rectangle' }],
            beams: [],
            dimensions: [],
            params: { lengte: lengteNum, hoogte: totalHeight },
            calculatedData: {
                totalHeight,
                beamCount: structure.beamCenters.length,
                latCount: structure.latCenters.length
            }
        };
        const json = JSON.stringify(data);
        if (json !== lastEmittedRef.current) {
            lastEmittedRef.current = json;
            onDataGenerated(data);
        }
    }, [structure, onDataGenerated, lengteNum, totalHeight]);

    return (
        <BaseDrawingFrame
            areaStats={{
                gross: lengteNum * totalHeight,
                net: lengteNum * totalHeight,
                hasOpenings: false
            }}
            width={lengteNum}
            height={totalHeight}
            className={className}
            fitContainer={fitContainer}
            widthLabel={`${lengteNum}`}
            heightLabel={`${totalHeight}`}
            suppressTotalDimensions={true}
        >
            {(ctx) => {
                const { startX, startY, rectW, rectH, pxPerMm, SVG_HEIGHT } = ctx;

                // Colors - matching CeilingWoodDrawing (No Blue)
                const structureColor = "rgb(70, 75, 85)";
                const lattenColor = "rgb(70, 75, 85)";

                const elements: React.ReactNode[] = [];

                // Render Vertical Beams (Balken)
                if (balkafstandNum > 0) {
                    const BEAM_WIDTH_MM = 70;
                    const BEAM_STROKE = BEAM_WIDTH_MM * pxPerMm;

                    structure.beamCenters.forEach((cx, idx) => {
                        const drawX = startX + (cx * pxPerMm);
                        // Vertical line for the beam
                        elements.push(
                            <line
                                key={`beam-${idx}`}
                                x1={drawX} y1={startY}
                                x2={drawX} y2={startY + rectH}
                                stroke={structureColor}
                                strokeWidth={BEAM_STROKE}
                                opacity="0.4"
                            />
                        );
                    });
                }

                // Render Horizontal Latten (following CeilingWoodDrawing style: two dashed lines)
                if (latafstandNum > 0) {
                    const LAT_WIDTH_MM = 22;
                    const halfWidthPx = (LAT_WIDTH_MM * pxPerMm) / 2;
                    const dashProps = {
                        stroke: lattenColor,
                        strokeWidth: 1,
                        strokeDasharray: "4,4"
                    };

                    structure.latCenters.forEach((cy, idx) => {
                        const centerY = startY + (cy * pxPerMm);
                        const topY = centerY - halfWidthPx;
                        const bottomY = centerY + halfWidthPx;

                        elements.push(<line key={`lat-${idx}-t`} x1={startX} y1={topY} x2={startX + rectW} y2={topY} {...dashProps} />);
                        elements.push(<line key={`lat-${idx}-b`} x1={startX} y1={bottomY} x2={startX + rectW} y2={bottomY} {...dashProps} />);
                    });

                    // Render Double End Latten if enabled
                    if (doubleEndBattens) {
                        const extraStart = (LAT_WIDTH_MM / 2) + LAT_WIDTH_MM;
                        const extraEnd = totalHeight - ((LAT_WIDTH_MM / 2) + LAT_WIDTH_MM);

                        if (extraStart < totalHeight) {
                            const drawY = startY + (extraStart * pxPerMm);
                            elements.push(<line key="lat-double-start-t" x1={startX} y1={drawY - halfWidthPx} x2={startX + rectW} y2={drawY - halfWidthPx} {...dashProps} />);
                            elements.push(<line key="lat-double-start-b" x1={startX} y1={drawY + halfWidthPx} x2={startX + rectW} y2={drawY + halfWidthPx} {...dashProps} />);
                        }

                        if (extraEnd > 0) {
                            const drawY = startY + (extraEnd * pxPerMm);
                            elements.push(<line key="lat-double-end-t" x1={startX} y1={drawY - halfWidthPx} x2={startX + rectW} y2={drawY - halfWidthPx} {...dashProps} />);
                            elements.push(<line key="lat-double-end-b" x1={startX} y1={drawY + halfWidthPx} x2={startX + rectW} y2={drawY + halfWidthPx} {...dashProps} />);
                        }
                    }
                }

                // Prepare gap measurements for the shared components
                const gridGaps = structure.gridGaps.map(g => ({
                    value: g.value,
                    c1: startX + g.c1 * pxPerMm,
                    c2: startX + g.c2 * pxPerMm
                }));

                const latGaps = structure.latGaps.map(g => ({
                    value: g.value,
                    c1: startY + g.c1 * pxPerMm,
                    c2: startY + g.c2 * pxPerMm
                }));

                return (
                    <>
                        {/* Main outer outline */}
                        <rect
                            x={startX}
                            y={startY}
                            width={rectW}
                            height={rectH}
                            fill="none"
                            stroke={structureColor}
                            strokeWidth="1"
                        />

                        {/* Faint indicator of the split between Voorzijde and Onderzijde if both exist */}
                        {hoogteNum > 0 && breedteNum > 0 && (
                            <line
                                x1={startX}
                                y1={startY + (hoogteNum * pxPerMm)}
                                x2={startX + rectW}
                                y2={startY + (hoogteNum * pxPerMm)}
                                stroke={structureColor}
                                strokeWidth="0.5"
                                strokeDasharray="2,2"
                                opacity="0.3"
                            />
                        )}

                        {elements}

                        {/* Universal Dimensions Overlay */}
                        <OverallDimensions
                            wallLength={lengteNum}
                            wallHeight={totalHeight}
                            svgBaseX={startX}
                            svgBaseY={startY + rectH}
                            pxPerMm={pxPerMm}
                        />

                        <GridMeasurements
                            gaps={gridGaps}
                            svgBaseYTop={startY}
                        />

                        {latGaps.length > 0 && (
                            <GridMeasurements
                                gaps={latGaps}
                                svgBaseX={startX + rectW}
                                orientation="vertical"
                            />
                        )}

                        {title && (
                            <text
                                x={25}
                                y={SVG_HEIGHT - 25}
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
