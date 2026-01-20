import React from 'react';
import { DimensionLine } from './DimensionLine';
import { DEFAULT_MEASUREMENT_STYLE } from './types';

interface OverallDimensionsProps {
    wallLength: number;
    wallHeight: number;
    svgBaseX: number;
    svgBaseY: number;
    pxPerMm: number;
    offsetBottom?: number; // How far below floor
    offsetLeft?: number; // How far left of wall
}

export const OverallDimensions: React.FC<OverallDimensionsProps> = ({
    wallLength,
    wallHeight,
    svgBaseX,
    svgBaseY,
    pxPerMm,
    offsetBottom = 80,
    offsetLeft = 80
}) => {
    const wallWidthPx = wallLength * pxPerMm;
    const wallHeightPx = wallHeight * pxPerMm;

    const dimY = svgBaseY + offsetBottom;
    const dimX = svgBaseX - offsetLeft;

    const pBotLeft = { x: svgBaseX, y: dimY };
    const pBotRight = { x: svgBaseX + wallWidthPx, y: dimY };

    const pSideBottom = { x: dimX, y: svgBaseY };
    const pSideTop = { x: dimX, y: svgBaseY - wallHeightPx };

    return (
        <g className="text-emerald-500">
            {/* Bottom Length Dimension */}
            <DimensionLine
                p1={pBotLeft} p2={pBotRight}
                label={wallLength}
            />
            {/* Extensions Bottom */}
            <line x1={svgBaseX} y1={svgBaseY + 5} x2={svgBaseX} y2={dimY} stroke={DEFAULT_MEASUREMENT_STYLE.lineColor} strokeWidth="0.5" opacity="0.5" />
            <line x1={svgBaseX + wallWidthPx} y1={svgBaseY + 5} x2={svgBaseX + wallWidthPx} y2={dimY} stroke={DEFAULT_MEASUREMENT_STYLE.lineColor} strokeWidth="0.5" opacity="0.5" />


            {/* Side Height Dimension */}
            <DimensionLine
                p1={pSideTop} p2={pSideBottom}
                label={wallHeight}
                orientation="vertical"
            />
            {/* Extensions Side */}
            <line x1={dimX} y1={svgBaseY} x2={svgBaseX - 5} y2={svgBaseY} stroke={DEFAULT_MEASUREMENT_STYLE.lineColor} strokeWidth="0.5" opacity="0.5" />
            <line x1={dimX} y1={svgBaseY - wallHeightPx} x2={svgBaseX - 5} y2={svgBaseY - wallHeightPx} stroke={DEFAULT_MEASUREMENT_STYLE.lineColor} strokeWidth="0.5" opacity="0.5" />
        </g>
    );
};
