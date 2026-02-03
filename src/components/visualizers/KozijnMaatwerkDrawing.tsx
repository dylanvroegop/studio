'use client';

import React from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';
import { DrawingStyles } from './drawing-styles';

interface KozijnMaatwerkDrawingProps {
  breedte?: string | number;
  hoogte?: string | number;
  frameThickness?: number | null;
  className?: string;
  fitContainer?: boolean;
  title?: string;
}

const toNum = (v: any) => (typeof v === 'number' ? v : parseFloat(String(v ?? '')) || 0);

export function KozijnMaatwerkDrawing({
  breedte,
  hoogte,
  frameThickness,
  className,
  fitContainer,
  title,
}: KozijnMaatwerkDrawingProps) {
  const width = toNum(breedte);
  const height = toNum(hoogte);
  const rawThickness = toNum(frameThickness);
  const maxThickness = Math.min(width, height) / 2;
  const thickness = Math.max(0, Math.min(rawThickness, maxThickness));

  const innerWidth = Math.max(0, width - (2 * thickness));
  const innerHeight = Math.max(0, height - (2 * thickness));

  const areaStats = React.useMemo(() => {
    const gross = width * height;
    const net = innerWidth * innerHeight;
    return {
      gross,
      net,
      hasOpenings: thickness > 0 && innerWidth > 0 && innerHeight > 0,
    };
  }, [width, height, innerWidth, innerHeight, thickness]);

  const { colors, strokes } = DrawingStyles;
  const timberFill = 'rgba(70, 75, 85, 0.35)';
  const openingFill = 'rgba(9, 9, 11, 0.65)';

  return (
    <BaseDrawingFrame
      width={width}
      height={height}
      className={className}
      fitContainer={fitContainer}
      gridLabel={title || 'Kozijn (maatwerk)'}
      areaStats={areaStats}
    >
      {({ startX, startY, rectW, rectH, pxPerMm }) => {
        const thicknessPx = thickness * pxPerMm;
        const innerX = startX + thicknessPx;
        const innerY = startY + thicknessPx;
        const innerW = Math.max(0, rectW - (2 * thicknessPx));
        const innerH = Math.max(0, rectH - (2 * thicknessPx));

        return (
          <g>
            <rect
              x={startX}
              y={startY}
              width={rectW}
              height={rectH}
              fill={timberFill}
              stroke={colors.TIMBER_STROKE}
              strokeWidth="0.8"
            />
            {innerW > 0 && innerH > 0 && (
              <rect
                x={innerX}
                y={innerY}
                width={innerW}
                height={innerH}
                fill={openingFill}
                stroke={colors.OPENING_LABEL}
                strokeWidth="0.6"
                strokeDasharray={strokes.DASHED_MAIN}
              />
            )}
          </g>
        );
      }}
    </BaseDrawingFrame>
  );
}
