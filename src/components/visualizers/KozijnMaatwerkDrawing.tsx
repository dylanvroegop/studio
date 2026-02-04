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
  showGlas?: boolean;
  vakken?: { id?: string; type?: string; breedte?: string | number; hoogte?: string | number; width?: string | number; height?: string | number }[];
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
}

const toNum = (v: any) => (typeof v === 'number' ? v : parseFloat(String(v ?? '')) || 0);

export function KozijnMaatwerkDrawing({
  breedte,
  hoogte,
  frameThickness,
  tussenstijlThickness,
  tussenstijlOffset,
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
}: KozijnMaatwerkDrawingProps) {
  const width = toNum(breedte);
  const height = toNum(hoogte);
  const rawThickness = toNum(frameThickness);
  const maxThickness = Math.min(width, height) / 2;
  const thickness = rawThickness > 0 ? Math.min(rawThickness, maxThickness) : 0;

  const innerWidth = Math.max(0, width - (2 * thickness));
  const innerHeight = Math.max(0, height - (2 * thickness));
  const rawTussenstijl = toNum(tussenstijlThickness);
  const tussenstijl = rawTussenstijl > 0 ? Math.min(rawTussenstijl, innerWidth) : 0;
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
            labelNumber: idx + 2
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

        const addVak = (id: string, type: string, width: number, height: number, fromLeft: number, fromBottom: number, labelNumber: number) => {
          if (width <= 0 || height <= 0) return;
          const availableHeight = innerHeight - (fromBottom - thickness);
          const clampedHeight = Math.min(height, availableHeight);
          if (clampedHeight <= 0) return;
          vakken.push({
            id,
            type,
            width: Math.min(width, innerWidth),
            height: clampedHeight,
            fromLeft,
            fromBottom,
            labelNumber
          });
        };

        let tussenstijlX = tussenstijlXDefault;
        if (tussenstijlPx > 0 && !hasOffset && hasDoorHeight && doorWidthVal > 0 && doorWidthVal < innerWidth) {
          tussenstijlX = innerX + (doorWidthVal * pxPerMm);
        }
        if (tussenstijlPx > 0) {
          stijlGap = [{ value: tussenstijl, c1: tussenstijlX, c2: tussenstijlX + tussenstijlPx }];
        }

        const hasColumns = tussenstijlPx > 0;
        const leftColWidth = hasColumns ? Math.max(0, (tussenstijlX - innerX) / pxPerMm) : innerWidth;
        const rightColWidth = hasColumns ? Math.max(0, innerWidth - leftColWidth - tussenstijl) : innerWidth;

        if (hasDoorHeight) {
          const doorWidthActual = hasColumns ? leftColWidth : Math.min(doorWidthVal || innerWidth, innerWidth);
          addVak('deur', 'door', doorWidthActual, Math.min(doorHeightVal, innerHeight), thickness, thickness, 1);

          if (vakInputs.length > 0) {
            const side = vakInputs[0];
            const sideType = side.type || (showGlas ? 'glas' : 'open');
            const sideWidth = hasColumns ? rightColWidth : Math.max(0, innerWidth - doorWidthActual);
            if (sideWidth > 0) {
              const sideLeft = hasColumns ? (thickness + leftColWidth + tussenstijl) : (thickness + doorWidthActual);
              addVak(side.id, sideType, sideWidth, Math.min(doorHeightVal, innerHeight), sideLeft, thickness, side.labelNumber);
            }
          }

          let cursorBottom = thickness + doorHeightVal + doorBarHeight;
          let index = 1;
          while (index < vakInputs.length && cursorBottom < (innerHeight + thickness)) {
            if (hasColumns) {
              const leftEntry = vakInputs[index];
              const rightEntry = vakInputs[index + 1];
              const rowHeight = Math.max(leftEntry?.height || 0, rightEntry?.height || 0);
              if (rowHeight > 0) {
                if (leftEntry) {
                  addVak(leftEntry.id, leftEntry.type, leftColWidth, rowHeight, thickness, cursorBottom, leftEntry.labelNumber);
                }
                if (rightEntry) {
                  addVak(rightEntry.id, rightEntry.type, rightColWidth, rowHeight, thickness + leftColWidth + tussenstijl, cursorBottom, rightEntry.labelNumber);
                }
                cursorBottom += rowHeight;
              }
              index += 2;
            } else {
              const entry = vakInputs[index];
              if (entry && entry.height > 0) {
                const w = entry.width > 0 ? Math.min(entry.width, innerWidth) : innerWidth;
                addVak(entry.id, entry.type, w, entry.height, thickness + Math.max(0, (innerWidth - w) / 2), cursorBottom, entry.labelNumber);
                cursorBottom += entry.height;
              }
              index += 1;
            }
          }
        } else if (vakInputs.length > 0) {
          let cursorBottom = thickness;
          let index = 0;
          while (index < vakInputs.length && cursorBottom < (innerHeight + thickness)) {
            if (hasColumns) {
              const leftEntry = vakInputs[index];
              const rightEntry = vakInputs[index + 1];
              const rowHeight = Math.max(leftEntry?.height || 0, rightEntry?.height || 0);
              if (rowHeight > 0) {
                if (leftEntry) {
                  addVak(leftEntry.id, leftEntry.type, leftColWidth, rowHeight, thickness, cursorBottom, leftEntry.labelNumber);
                }
                if (rightEntry) {
                  addVak(rightEntry.id, rightEntry.type, rightColWidth, rowHeight, thickness + leftColWidth + tussenstijl, cursorBottom, rightEntry.labelNumber);
                }
                cursorBottom += rowHeight;
              }
              index += 2;
            } else {
              const entry = vakInputs[index];
              if (entry && entry.height > 0) {
                const w = entry.width > 0 ? Math.min(entry.width, innerWidth) : innerWidth;
                addVak(entry.id, entry.type, w, entry.height, thickness + Math.max(0, (innerWidth - w) / 2), cursorBottom, entry.labelNumber);
                cursorBottom += entry.height;
              }
              index += 1;
            }
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
        const renderVakLabel = (x: number, y: number, w: number, h: number, label: string) => (
          <text
            x={x + (w / 2)}
            y={y + (h / 2)}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgb(148, 163, 184)"
            className="text-[12px] font-mono select-none"
          >
            {label}
          </text>
        );

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
                  const label = `${vakLabelMap[v.type] || 'Vak'} ${v.labelNumber}`;

                  if (v.type === 'glas') {
                    return (
                      <g key={v.id}>
                        {renderGlassPane(drawX, drawY, w, h)}
                        {renderVakLabel(drawX, drawY, w, h, label)}
                      </g>
                    );
                  }

                  if (v.type === 'paneel') {
                    return (
                      <g key={v.id}>
                        <rect x={drawX} y={drawY} width={w} height={h} fill="rgb(70, 75, 85)" stroke="rgb(55, 60, 70)" strokeWidth="0.5" />
                        {renderVakLabel(drawX, drawY, w, h, label)}
                      </g>
                    );
                  }

                  return (
                    <g key={v.id}>
                      <rect x={drawX} y={drawY} width={w} height={h} fill="#09090b" stroke="rgb(55, 60, 70)" strokeWidth="1" />
                      <line x1={drawX} y1={drawY} x2={drawX + w} y2={drawY + h} stroke="rgb(55, 60, 70)" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.5" />
                      <line x1={drawX} y1={drawY + h} x2={drawX + w} y2={drawY} stroke="rgb(55, 60, 70)" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.5" />
                      {renderVakLabel(drawX, drawY, w, h, label)}
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

                {tussenstijlPx > 0 && (
                  <rect
                    x={tussenstijlX}
                    y={innerY}
                    width={tussenstijlPx}
                    height={innerH}
                    fill="rgb(70, 75, 85)"
                    stroke={colors.TIMBER_STROKE}
                    strokeWidth="0.5"
                  />
                )}
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
                  const dimX = startX - 40;
                  const segments = [
                    thickness,
                    doorHeightVal,
                    doorBarHeight,
                    Math.max(0, innerHeight - doorHeightVal - doorBarHeight),
                    thickness,
                  ].filter(v => v > 0);

                  let currentY = startY + rectH;
                  return (
                    <g className="pointer-events-none">
                      {segments.map((segment, idx) => {
                        const segPx = segment * pxPerMm;
                        const y1 = currentY;
                        const y2 = currentY - segPx;
                        const midY = (y1 + y2) / 2;

                        const group = (
                          <g key={`vseg-${idx}`}>
                            <line x1={dimX} y1={y1} x2={dimX} y2={y2} stroke={lineColor} strokeWidth="0.5" />
                            <circle cx={dimX} cy={y1} r="1.5" fill={lineColor} />
                            <circle cx={dimX} cy={y2} r="1.5" fill={lineColor} />
                            <line x1={dimX} y1={y1} x2={startX} y2={y1} stroke={lineColor} strokeWidth="0.5" />
                            <line x1={dimX} y1={y2} x2={startX} y2={y2} stroke={lineColor} strokeWidth="0.5" />
                            <g transform={`translate(${dimX}, ${midY}) rotate(-90)`}>
                              <rect x="-18" y="-7" width="36" height="14" fill="#09090b" opacity="1" />
                              <text
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill={lineColor}
                                className="text-[12px] font-mono select-none font-medium"
                              >
                                {Math.round(segment)}
                              </text>
                            </g>
                          </g>
                        );
                        currentY = y2;
                        return group;
                      })}
                    </g>
                  );
                })()}
                {(() => {
                  const lineColor = '#10b981';
                  const dimY = yBottom + 40;
                  const leftSegment = hasColumns ? leftColWidth : Math.min((doorWidthVal || innerWidth), innerWidth);
                  const middleSegment = hasColumns ? tussenstijl : 0;
                  const remainingWidth = hasColumns ? rightColWidth : Math.max(0, innerWidth - leftSegment);
                  const segments = [
                    thickness,
                    leftSegment,
                    middleSegment,
                    remainingWidth,
                    thickness,
                  ].filter(v => v > 0);

                  let currentX = startX;
                  return (
                    <g className="pointer-events-none">
                      {segments.map((segment, idx) => {
                        const segPx = segment * pxPerMm;
                        const x1 = currentX;
                        const x2 = currentX + segPx;
                        const midX = (x1 + x2) / 2;

                        const group = (
                          <g key={`hseg-${idx}`}>
                            <line x1={x1} y1={dimY} x2={x2} y2={dimY} stroke={lineColor} strokeWidth="0.5" />
                            <circle cx={x1} cy={dimY} r="1.5" fill={lineColor} />
                            <circle cx={x2} cy={dimY} r="1.5" fill={lineColor} />
                            <line x1={x1} y1={dimY} x2={x1} y2={yBottom} stroke={lineColor} strokeWidth="0.5" />
                            <line x1={x2} y1={dimY} x2={x2} y2={yBottom} stroke={lineColor} strokeWidth="0.5" />
                            <rect x={midX - 18} y={dimY - 7} width="36" height="14" fill="#09090b" opacity="1" />
                            <text
                              x={midX}
                              y={dimY + 0.5}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill={lineColor}
                              className="text-[12px] font-mono select-none font-medium"
                            >
                              {Math.round(segment)}
                            </text>
                          </g>
                        );
                        currentX = x2;
                        return group;
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
