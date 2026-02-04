'use client';

import React from 'react';
import { BaseDrawingFrame } from './BaseDrawingFrame';
import { DrawingStyles } from './drawing-styles';
import { OverallDimensions, OpeningMeasurements } from './shared/measurements';
import { GridMeasurements } from './shared/measurements/GridMeasurements';

interface KozijnMaatwerkDrawingProps {
  breedte?: string | number;
  hoogte?: string | number;
  frameThickness?: number | null;
  tussenstijlThickness?: number | null;
  tussenstijlOffset?: number | null;
  tussenstijlen?: (number | string)[];
  showGlas?: boolean;
  vakken?: {
    id?: string;
    type?: string;
    breedte?: string | number;
    hoogte?: string | number;
    width?: string | number;
    height?: string | number;
    hasBorstwering?: boolean;
    borstweringHeight?: number;
  }[];
  doorWidth?: string | number;
  doorHeight?: string | number;
  glasWidth?: string | number;
  glasHeight?: string | number;
  paneelWidth?: string | number;
  paneelHeight?: string | number;
  openWidth?: string | number;
  openHeight?: string | number;
  className?: string;
  fitContainer?: boolean;
  title?: string;
  doorPosition?: 'left' | 'right';
}

const toNum = (v: any) => (typeof v === 'number' ? v : parseFloat(String(v ?? '')) || 0);

export function KozijnMaatwerkDrawing({
  breedte,
  hoogte,
  frameThickness,
  tussenstijlThickness,
  tussenstijlOffset,
  tussenstijlen,
  showGlas,
  vakken: vakkenProp,
  doorWidth,
  doorHeight,
  glasWidth,
  glasHeight,
  paneelWidth,
  paneelHeight,
  openWidth,
  openHeight,
  className,
  fitContainer,
  title,
  doorPosition = 'left',
}: KozijnMaatwerkDrawingProps) {
  const width = toNum(breedte);
  const height = toNum(hoogte);
  const sponning = 17;
  const rawThickness = toNum(frameThickness);
  const maxThickness = Math.min(width, height) / 2;
  // Frame thickness (eindstijlen/bovenstijl) = dikte - 17mm
  const thickness = rawThickness > 0 ? Math.max(0, Math.min(rawThickness - sponning, maxThickness)) : 0;

  // Transom (stijl) = frame thickness - 17mm (effectively raw - 34mm)
  const transomThickness = Math.max(0, thickness - sponning);

  const innerWidth = Math.max(0, width - (2 * thickness));
  const innerHeight = Math.max(0, height - (2 * thickness));
  const rawTussenstijl = toNum(tussenstijlThickness);
  // Tussenstijl = dikte - 2x 17mm
  const tussenstijl = rawTussenstijl > 0 ? Math.max(0, Math.min(rawTussenstijl, innerWidth) - (2 * sponning)) : 0;
  const rawOffset = toNum(tussenstijlOffset);
  const hasOffset = tussenstijlOffset !== undefined && tussenstijlOffset !== null && Number.isFinite(rawOffset);
  const maxOffset = Math.max(0, innerWidth - tussenstijl);
  const clampedOffset = hasOffset ? Math.min(Math.max(0, rawOffset), maxOffset) : null;

  const areaStats = React.useMemo(() => {
    const gross = width * height;
    const net = innerWidth * innerHeight;
    return {
      gross,
      net,
      hasOpenings: thickness > 0 && innerWidth > 0 && innerHeight > 0,
    };
  }, [width, height, innerWidth, innerHeight, thickness]);

  const { colors } = DrawingStyles;

  return (
    <BaseDrawingFrame
      width={width}
      height={height}
      className={className}
      fitContainer={fitContainer}
      gridLabel={undefined}
      areaStats={areaStats}
      suppressTotalDimensions={true}
    >
      {({ startX, startY, rectW, rectH, pxPerMm, SVG_HEIGHT }) => {
        const thicknessPx = thickness * pxPerMm;
        const innerX = startX + thicknessPx;
        const innerY = startY + thicknessPx;
        const innerW = Math.max(0, rectW - (2 * thicknessPx));
        const innerH = Math.max(0, rectH - (2 * thicknessPx));
        const yBottom = startY + rectH;
        const tussenstijlPx = tussenstijl * pxPerMm;
        const tussenstijlXDefault = innerX + (clampedOffset !== null ? (clampedOffset * pxPerMm) : (innerW / 2) - (tussenstijlPx / 2));

        const kozijnDiktePx = thickness * pxPerMm;
        const rightMeasureX = startX + rectW - (kozijnDiktePx / 2);
        const kozijnGap = kozijnDiktePx > 0
          ? [{ value: thickness, c1: rightMeasureX - (kozijnDiktePx / 2), c2: rightMeasureX + (kozijnDiktePx / 2) }]
          : [];
        let stijlGap: { value: number; c1: number; c2: number }[] = [];

        const fallbackVakken = [
          { type: 'glas', width: toNum(glasWidth), height: toNum(glasHeight), enabled: !!showGlas },
          { type: 'paneel', width: toNum(paneelWidth), height: toNum(paneelHeight), enabled: true },
          { type: 'open', width: toNum(openWidth), height: toNum(openHeight), enabled: true },
        ].filter(v => (v.enabled !== false) && (v.width > 0 || v.height > 0));

        const vakInputs = (Array.isArray(vakkenProp) && vakkenProp.length > 0)
          ? vakkenProp.map((v, idx) => ({
            id: v.id || `vak-${idx}`,
            type: v.type || 'open',
            width: toNum(v.breedte ?? v.width),
            height: toNum(v.hoogte ?? v.height),
            labelNumber: idx + 2,
            hasBorstwering: v.hasBorstwering,
            borstweringHeight: toNum(v.borstweringHeight)
          }))
          : fallbackVakken.map((v, idx) => ({
            id: `vak-fallback-${idx}`,
            type: v.type,
            width: v.width,
            height: v.height,
            labelNumber: idx + 2
          }));

        const vakken: { id: string; type: string; width: number; height: number; fromLeft: number; fromBottom: number; labelNumber: number }[] = [];

        const doorWidthVal = toNum(doorWidth);
        const doorHeightVal = toNum(doorHeight);
        const hasDoorHeight = doorHeightVal > 0;
        const doorBarHeight = hasDoorHeight && thickness > 0 && (doorHeightVal + thickness) < innerHeight ? thickness : 0;
        const doorBarHeightPx = doorBarHeight * pxPerMm;
        const doorBarY = innerY + innerH - (doorHeightVal * pxPerMm) - doorBarHeightPx;
        const showOpeningVertical = !hasDoorHeight;
        const showOpeningHorizontal = !hasDoorHeight;

        const addVak = (id: string, type: string, width: number, height: number, fromLeft: number, fromBottom: number, labelNumber: number, extraProps?: any) => {
          if (width <= 0 || height <= 0) return;
          const availableHeight = innerHeight - (fromBottom - thickness);
          const clampedHeight = Math.min(height, availableHeight);
          if (clampedHeight <= 0) return;

          // Check for Borstwering
          if (extraProps?.hasBorstwering && extraProps?.borstweringHeight > 0 && type === 'glas') {
            const bwHeight = Math.min(extraProps.borstweringHeight, clampedHeight);
            const remainingHeight = clampedHeight - bwHeight - transomThickness; // Subtract thickness for the 'stijl' (transom)

            // 1. Borstwering (Paneel) at bottom
            if (bwHeight > 0) {
              vakken.push({
                id: `${id}-bw`,
                type: 'paneel', // Always panel for borstwering
                width: Math.min(width, innerWidth),
                height: bwHeight,
                fromLeft,
                fromBottom,
                labelNumber // Use the same label number as the main vak
              });
            }

            // 2. Transom (Stijl) in middle
            // Explicitly add a Vak for the Stijl so we can color it correctly
            vakken.push({
              id: `${id}-stijl`,
              type: 'stijl',
              width: Math.min(width, innerWidth),
              height: transomThickness,
              fromLeft,
              fromBottom: fromBottom + bwHeight,
              labelNumber: -1 // No label for transom
            });

            // 3. Glas on top
            if (remainingHeight > 0) {
              vakken.push({
                id,
                type,
                width: Math.min(width, innerWidth),
                height: remainingHeight,
                fromLeft,
                fromBottom: fromBottom + bwHeight + transomThickness,
                labelNumber
              });
            }
          } else {
            // Normal Single Vak
            vakken.push({
              id,
              type,
              width: Math.min(width, innerWidth),
              height: clampedHeight,
              fromLeft,
              fromBottom,
              labelNumber
            });
          }
        };

        const isDoorLeft = doorPosition !== 'right';

        const normalizePositions = (positions: number[]) => {
          const maxPos = Math.max(0, innerWidth - tussenstijl);
          const sorted = positions
            .map(p => Math.min(Math.max(0, p), maxPos))
            .sort((a, b) => a - b);
          const clamped: number[] = [];
          let cursor = 0;
          sorted.forEach(pos => {
            const next = Math.max(cursor, pos);
            const clampedPos = Math.min(next, maxPos);
            clamped.push(clampedPos);
            cursor = clampedPos + tussenstijl;
          });
          return clamped;
        };

        const rawPositions = Array.isArray(tussenstijlen)
          ? tussenstijlen.map(v => toNum(v)).filter(v => v > 0)
          : [];

        const autoDoorPos = (tussenstijlPx > 0 && hasDoorHeight && doorWidthVal > 0 && doorWidthVal < innerWidth)
          ? (isDoorLeft ? doorWidthVal : Math.max(0, innerWidth - doorWidthVal - tussenstijl))
          : null;

        let basePositions = rawPositions.length > 0
          ? rawPositions
          : (hasOffset ? [clampedOffset ?? 0] : []);

        if (autoDoorPos !== null) {
          const eps = 1;
          const withoutDup = basePositions.filter(p => Math.abs(p - autoDoorPos) > eps);
          basePositions = [autoDoorPos, ...withoutDup];
        } else if (basePositions.length === 0 && tussenstijlPx > 0 && !hasOffset && doorWidthVal > 0 && doorWidthVal < innerWidth) {
          basePositions = [isDoorLeft ? doorWidthVal : Math.max(0, innerWidth - doorWidthVal - tussenstijl)];
        }

        const tussenstijlPositions = tussenstijlPx > 0 ? normalizePositions(basePositions) : [];
        const stijlRects = tussenstijlPositions.map(pos => ({
          x: innerX + (pos * pxPerMm),
          w: tussenstijlPx
        }));

        if (stijlRects.length > 0) {
          stijlGap = stijlRects.map(r => ({ value: tussenstijl, c1: r.x, c2: r.x + r.w }));
        }

        const colStarts: number[] = [];
        const colWidths: number[] = [];
        let cursor = 0;
        tussenstijlPositions.forEach(pos => {
          colStarts.push(cursor);
          colWidths.push(Math.max(0, pos - cursor));
          cursor = pos + tussenstijl;
        });
        colStarts.push(cursor);
        colWidths.push(Math.max(0, innerWidth - cursor));
        const colCount = colWidths.length;

        if (hasDoorHeight) {
          const doorColIndex = isDoorLeft ? 0 : Math.max(0, colCount - 1);
          const doorWidthActual = colWidths[doorColIndex] || innerWidth;
          const doorLeft = thickness + (colStarts[doorColIndex] || 0);
          addVak('deur', 'door', doorWidthActual, Math.min(doorHeightVal, innerHeight), doorLeft, thickness, 1, {});

          const doorRowCols = colCount > 1
            ? Array.from({ length: colCount }, (_, i) => i).filter(i => i !== doorColIndex)
            : [];

          for (let i = 0; i < Math.min(vakInputs.length, doorRowCols.length); i++) {
            const entry = vakInputs[i];
            const colIdx = doorRowCols[i];
            const colWidth = colWidths[colIdx] || 0;
            if (entry && colWidth > 0) {
              const left = thickness + (colStarts[colIdx] || 0);
              addVak(entry.id, entry.type || (showGlas ? 'glas' : 'open'), colWidth, Math.min(doorHeightVal, innerHeight), left, thickness, entry.labelNumber, entry);
            }
          }

          let cursorBottom = thickness + doorHeightVal + doorBarHeight;
          let index = doorRowCols.length;
          while (index < vakInputs.length && cursorBottom < (innerHeight + thickness)) {
            const rowEntries = vakInputs.slice(index, index + colCount);
            let rowHeight = Math.max(...rowEntries.map(v => v?.height || 0), 0);
            if (rowHeight <= 0) {
              rowHeight = Math.max(0, (innerHeight + thickness) - cursorBottom);
            }
            if (rowHeight <= 0) break;
            rowEntries.forEach((entry, colIdx) => {
              if (!entry) return;
              const colWidth = colWidths[colIdx] || 0;
              if (colWidth <= 0) return;
              const left = thickness + (colStarts[colIdx] || 0);
              addVak(entry.id, entry.type, colWidth, rowHeight, left, cursorBottom, entry.labelNumber, entry);
            });
            cursorBottom += rowHeight;
            index += colCount;
          }
        } else if (vakInputs.length > 0) {
          let cursorBottom = thickness;
          let index = 0;
          while (index < vakInputs.length && cursorBottom < (innerHeight + thickness)) {
            const rowEntries = vakInputs.slice(index, index + colCount);
            let rowHeight = Math.max(...rowEntries.map(v => v?.height || 0), 0);
            if (rowHeight <= 0) {
              rowHeight = Math.max(0, (innerHeight + thickness) - cursorBottom);
            }
            if (rowHeight <= 0) break;
            rowEntries.forEach((entry, colIdx) => {
              if (!entry) return;
              const colWidth = colWidths[colIdx] || 0;
              if (colWidth <= 0) return;
              const left = thickness + (colStarts[colIdx] || 0);
              addVak(entry.id, entry.type, colWidth, rowHeight, left, cursorBottom, entry.labelNumber, entry);
            });
            cursorBottom += rowHeight;
            index += colCount;
          }
        }

        const renderGlassPane = (x: number, y: number, w: number, h: number) => {
          if (w <= 0 || h <= 0) return null;
          const bw = Math.min(10 * pxPerMm, h / 2, w / 2);
          const innerH2 = Math.max(0, h - bw * 2);
          return (
            <g>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill="#1e293b"
                opacity="0.8"
                stroke="rgba(180, 210, 230, 0.4)"
                strokeWidth="1"
              />
              <rect x={x} y={y} width={w} height={bw} fill="rgb(10, 10, 10)" />
              <rect x={x} y={y + h - bw} width={w} height={bw} fill="rgb(10, 10, 10)" />
              <rect x={x} y={y + bw} width={bw} height={innerH2} fill="rgb(10, 10, 10)" />
              <rect x={x + w - bw} y={y + bw} width={bw} height={innerH2} fill="rgb(10, 10, 10)" />
            </g>
          );
        };

        const vakLabelMap: Record<string, string> = {
          door: 'Deur',
          glas: 'Glas',
          paneel: 'Paneel',
          open: 'Open'
        };
        const renderVakLabel = (x: number, y: number, w: number, h: number, label: string, widthMm: number, heightMm: number, type: string) => {
          if (label.includes('-1')) return null; // Skip if labelNumber is -1
          // Skip label if height is very small (like for transom) or if label is explicitly disabled
          if (h < 20) return null;

          const isGlas = type === 'glas';

          return (
            <text
              x={x + (w / 2)}
              y={y + (h / 2)}
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-[10px] font-mono select-none"
            >
              <tspan x={x + (w / 2)} dy="-0.6em" fill="#10b981" fontWeight="bold">{label}</tspan>
              <tspan x={x + (w / 2)} dy="1.4em" fill="#10b981" fontSize="9px" fontWeight="normal">
                {Math.round(widthMm)} x {Math.round(heightMm)}
              </tspan>
              {isGlas && (
                <tspan x={x + (w / 2)} dy="1.4em" fill="#3b82f6" fontSize="8px" fontWeight="normal" fontStyle="italic">
                  Glasmaat: {Math.round(widthMm - 10)} x {Math.round(heightMm - 10)}
                </tspan>
              )}
            </text>
          );
        };

        return (
          <g>
            <rect
              x={startX}
              y={startY}
              width={rectW}
              height={rectH}
              fill="rgb(70, 75, 85)"
              stroke={colors.TIMBER_STROKE}
              strokeWidth="0.5"
            />

            {innerW > 0 && innerH > 0 && thickness > 0 && (
              <>
                <rect
                  x={innerX}
                  y={innerY}
                  width={innerW}
                  height={innerH}
                  fill="#09090b"
                  stroke="rgb(55, 60, 70)"
                  strokeWidth="1"
                />
                {vakken.map((v) => {
                  const drawX = startX + (v.fromLeft * pxPerMm);
                  const drawY = yBottom - ((v.fromBottom + v.height) * pxPerMm);
                  const w = v.width * pxPerMm;
                  const h = v.height * pxPerMm;
                  const label = v.labelNumber > 0 ? `${vakLabelMap[v.type] || 'Vak'} ${v.labelNumber}` : '';

                  if (v.type === 'glas') {
                    return (
                      <g key={v.id}>
                        {renderGlassPane(drawX, drawY, w, h)}
                        {renderVakLabel(drawX, drawY, w, h, label, v.width, v.height, v.type)}
                      </g>
                    );
                  }

                  if (v.type === 'stijl') {
                    return (
                      <g key={v.id}>
                        <rect x={drawX} y={drawY} width={w} height={h} fill="rgb(70, 75, 85)" stroke={colors.TIMBER_STROKE} strokeWidth="0.5" />
                      </g>
                    );
                  }

                  if (v.type === 'paneel') {
                    return (
                      <g key={v.id}>
                        <rect x={drawX} y={drawY} width={w} height={h} fill="rgb(70, 75, 85)" opacity="0.8" stroke="rgb(55, 60, 70)" strokeWidth="0.5" />
                        {renderVakLabel(drawX, drawY, w, h, label, v.width, v.height, v.type)}
                      </g>
                    );
                  }

                  return (
                    <g key={v.id}>
                      <rect x={drawX} y={drawY} width={w} height={h} fill="#09090b" stroke="rgb(55, 60, 70)" strokeWidth="1" />
                      <line x1={drawX} y1={drawY} x2={drawX + w} y2={drawY + h} stroke="rgb(55, 60, 70)" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.5" />
                      <line x1={drawX} y1={drawY + h} x2={drawX + w} y2={drawY} stroke="rgb(55, 60, 70)" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.5" />
                      {renderVakLabel(drawX, drawY, w, h, label, v.width, v.height, v.type)}
                    </g>
                  );
                })}

                {doorBarHeight > 0 && (
                  <rect
                    x={innerX}
                    y={doorBarY}
                    width={innerW}
                    height={doorBarHeightPx}
                    fill="rgb(70, 75, 85)"
                    stroke={colors.TIMBER_STROKE}
                    strokeWidth="0.5"
                  />
                )}

                {stijlRects.length > 0 && stijlRects.map((r, idx) => (
                  <rect
                    key={`stijl-${idx}`}
                    x={r.x}
                    y={innerY}
                    width={r.w}
                    height={innerH}
                    fill="rgb(70, 75, 85)"
                    stroke={colors.TIMBER_STROKE}
                    strokeWidth="0.5"
                  />
                ))}
              </>
            )}

            {kozijnGap.length > 0 && (
              <GridMeasurements gaps={kozijnGap} svgBaseYTop={startY} orientation="horizontal" />
            )}

            {stijlGap.length > 0 && (
              <GridMeasurements gaps={stijlGap} svgBaseYTop={startY} orientation="horizontal" />
            )}

            {hasDoorHeight && thickness > 0 && (
              <>
                {(() => {
                  const lineColor = '#10b981';
                  const dimX = startX + rectW + 40; // Right side
                  const segments = [
                    // thickness, // Remove frame
                    doorHeightVal,
                    // doorBarHeight, // Usually frame thickness (66), remove it? User said "remove 66".
                    Math.max(0, innerHeight - doorHeightVal - doorBarHeight),
                    // thickness, // Remove frame
                  ].filter(v => v > 0 && v !== thickness && v !== doorBarHeight);

                  let currentY = startY + rectH - (thickness * pxPerMm); // Start inside the frame? 
                  // Wait, original started at `startY + rectH` (Bottom outer edge).
                  // If we remove thickness, we should start at `startY + rectH - frameThicknessPx`. (Inner Bottom).
                  // Vertical goes UP. `currentY` is starting Y.
                  // Original: `currentY = startY + rectH;` (Total Bottom).
                  // Segment 1 was `thickness`. So `y2` became `TotalBottom - thickness`.
                  // If we skip thickness, we should start `currentY` at `TotalBottom - thickness`.

                  currentY = startY + rectH - (thickness * pxPerMm);

                  return (
                    <g className="pointer-events-none">
                      {segments.map((segment, idx) => {
                        const segPx = segment * pxPerMm;
                        const y1 = currentY;
                        const y2 = currentY - segPx;
                        const midY = (y1 + y2) / 2;

                        // If there is a door bar (transom) gap, we need to skip it in drawing?
                        // `segments` logic above is consecutive. If we removed `doorBarHeight` from array, 
                        // the next segment will visually append immediately to the previous one in the loop.
                        // BUT spatially, there is a gap of `doorBarHeight`.
                        // So `currentY` for the NEXT segment needs to jump by the gap.
                        // This implies I cannot just filter the array. I need to iterate the FULL array but only DRAW the non-frame segments.

                        return null; // Logic rewrite below
                      })}
                    </g>
                  );
                })()}

                {/* Rewritten Vertical Logic (Left Side) */}
                {(() => {
                  const lineColor = '#10b981';
                  const dimX = startX - 40; // Left side

                  // If Door is Left: Show Door Layout.
                  // If Door is Right: Show Left Column (Vak) Layout.

                  let segments: { val: number; show: boolean }[] = [];

                  if (isDoorLeft) {
                    // Door Logic
                    segments = [
                      { val: thickness, show: false },
                      { val: doorHeightVal, show: true },
                      { val: doorBarHeight, show: false },
                      { val: Math.max(0, innerHeight - doorHeightVal - doorBarHeight), show: true },
                      { val: thickness, show: false },
                    ];
                  } else {
                    // Vak Logic (Left Column)
                    // Filter vakken that are in the left column
                    const leftStart = thickness;
                    // Use small tolerance for float matching
                    const leftVaks = vakken.filter(v => Math.abs(v.fromLeft - leftStart) < 1);
                    leftVaks.sort((a, b) => a.fromBottom - b.fromBottom);

                    let currentH = 0;
                    segments.push({ val: thickness, show: false });
                    currentH += thickness;

                    leftVaks.forEach(v => {
                      const gap = v.fromBottom - currentH;
                      if (gap > 1) {
                        segments.push({ val: gap, show: false });
                        currentH += gap;
                      }
                      segments.push({ val: v.height, show: v.type !== 'stijl' });
                      currentH += v.height;
                    });

                    const remaining = height - currentH;
                    if (remaining > 0) segments.push({ val: remaining, show: false });
                  }

                  let currentY = startY + rectH;

                  return (
                    <g className="pointer-events-none">
                      {segments.map((seg, idx) => {
                        const segPx = seg.val * pxPerMm;
                        const y1 = currentY;
                        const y2 = currentY - segPx;
                        const midY = (y1 + y2) / 2;
                        currentY = y2;

                        if (!seg.show || seg.val <= 0) return null;

                        return (
                          <g key={`vseg-left-${idx}`}>
                            <line x1={dimX} y1={y1} x2={dimX} y2={y2} stroke={lineColor} strokeWidth="0.5" />
                            <circle cx={dimX} cy={y1} r="1.5" fill={lineColor} />
                            <circle cx={dimX} cy={y2} r="1.5" fill={lineColor} />
                            <line x1={dimX} y1={y1} x2={startX} y2={y1} stroke={lineColor} strokeWidth="0.5" strokeDasharray="2,2" opacity="0.5" />
                            <line x1={dimX} y1={y2} x2={startX} y2={y2} stroke={lineColor} strokeWidth="0.5" strokeDasharray="2,2" opacity="0.5" />
                            <g transform={`translate(${dimX}, ${midY}) rotate(-90)`}>
                              <rect x="-18" y="-7" width="36" height="14" fill="#09090b" opacity="1" />
                              <text textAnchor="middle" dominantBaseline="middle" fill={lineColor} className="text-[12px] font-mono select-none font-medium">
                                {Math.round(seg.val)}
                              </text>
                            </g>
                          </g>
                        );
                      })}
                    </g>
                  );
                })()}

                {/* Rewritten Horizontal Logic (Bottom) */}
                {(() => {
                  const lineColor = '#10b981';
                  const dimY = yBottom + 40; // Bottom side
                  const rawSegments: { val: number; show: boolean }[] = [];
                  if (thickness > 0) rawSegments.push({ val: thickness, show: false });
                  if (colWidths.length > 0) {
                    colWidths.forEach((w, idx) => {
                      if (w > 0) rawSegments.push({ val: w, show: true });
                      if (idx < colWidths.length - 1 && tussenstijl > 0) rawSegments.push({ val: tussenstijl, show: false });
                    });
                  } else if (innerWidth > 0) {
                    rawSegments.push({ val: innerWidth, show: true });
                  }
                  if (thickness > 0) rawSegments.push({ val: thickness, show: false });

                  let currentX = startX;
                  return (
                    <g className="pointer-events-none">
                      {rawSegments.map((seg, idx) => {
                        const segPx = seg.val * pxPerMm;
                        const x1 = currentX;
                        const x2 = currentX + segPx;
                        const midX = (x1 + x2) / 2;

                        currentX = x2;

                        if (!seg.show || seg.val <= 0) return null;

                        return (
                          <g key={`hseg-${idx}`}>
                            <line x1={x1} y1={dimY} x2={x2} y2={dimY} stroke={lineColor} strokeWidth="0.5" />
                            <circle cx={x1} cy={dimY} r="1.5" fill={lineColor} />
                            <circle cx={x2} cy={dimY} r="1.5" fill={lineColor} />

                            {/* Lines connecting to Bottom of drawing (yBottom) */}
                            <line x1={x1} y1={dimY} x2={x1} y2={yBottom} stroke={lineColor} strokeWidth="0.5" strokeDasharray="2,2" opacity="0.5" />
                            <line x1={x2} y1={dimY} x2={x2} y2={yBottom} stroke={lineColor} strokeWidth="0.5" strokeDasharray="2,2" opacity="0.5" />

                            <rect x={midX - 18} y={dimY - 7} width="36" height="14" fill="#09090b" opacity="1" />
                            <text
                              x={midX}
                              y={dimY + 0.5}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill={lineColor}
                              className="text-[12px] font-mono select-none font-medium"
                            >
                              {Math.round(seg.val)}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })()}

                
              </>
            )}

            {vakken.length > 0 && thickness > 0 && (
              <OpeningMeasurements
                openings={vakken.map(v => ({
                  id: v.id,
                  width: v.width,
                  height: v.height,
                  fromLeft: v.fromLeft,
                  fromBottom: v.fromBottom,
                  type: v.type
                }))}
                wallLength={width}
                wallHeight={height}
                svgBaseX={startX}
                svgBaseY={yBottom}
                pxPerMm={pxPerMm}
                showVertical={showOpeningVertical}
                showHorizontal={showOpeningHorizontal}
              />
            )}

            <OverallDimensions
              wallLength={width}
              wallHeight={height}
              svgBaseX={startX}
              svgBaseY={yBottom}
              pxPerMm={pxPerMm}
            />

            {title && (
              <text
                x={20}
                y={SVG_HEIGHT - 20}
                textAnchor="start"
                fill="rgb(100, 116, 139)"
                fontSize="14"
                style={{ fontFamily: 'monospace' }}
              >
                {title}
              </text>
            )}
          </g>
        );
      }}
    </BaseDrawingFrame>
  );
}
