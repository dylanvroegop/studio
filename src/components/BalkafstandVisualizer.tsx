'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface BalkafstandVisualizerProps {
    /** The h.o.h. spacing value in mm */
    value: string | number;
    /** Optional additional CSS classes */
    className?: string;
}

/**
 * Dynamic SVG Visualizer for "Balkafstand (h.o.h.)" input field.
 * Displays a technical architectural diagram showing stud spacing.
 * 
 * Features:
 * - Three vertical studs with dimension lines
 * - Real-time value binding from input
 * - Premium dark-mode compatible styling
 * - Accessible with ARIA labels
 */
export function BalkafstandVisualizer({ value, className }: BalkafstandVisualizerProps) {
    // Format display value
    const displayValue = value && String(value).trim() !== ''
        ? `${value} mm`
        : '--- mm';

    return (
        <div
            className={cn(
                "w-full rounded-lg border border-border/50 bg-card/30 p-4 backdrop-blur-sm",
                className
            )}
            role="img"
            aria-label={`Balkafstand visualisatie: ${displayValue} hart-op-hart afstand tussen drie staanders`}
        >
            <svg
                viewBox="0 0 320 120"
                className="w-full h-auto max-h-[100px]"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
            >
                {/* Definitions for arrowheads */}
                <defs>
                    <marker
                        id="arrowLeft"
                        markerWidth="8"
                        markerHeight="8"
                        refX="0"
                        refY="4"
                        orient="auto"
                    >
                        <path
                            d="M8,0 L0,4 L8,8"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            className="text-emerald-500/70"
                        />
                    </marker>
                    <marker
                        id="arrowRight"
                        markerWidth="8"
                        markerHeight="8"
                        refX="8"
                        refY="4"
                        orient="auto"
                    >
                        <path
                            d="M0,0 L8,4 L0,8"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            className="text-emerald-500/70"
                        />
                    </marker>
                </defs>

                {/* Background grid lines (subtle) */}
                <g className="text-muted-foreground/10">
                    {[30, 50, 70, 90].map((y) => (
                        <line key={y} x1="20" y1={y} x2="300" y2={y} stroke="currentColor" strokeWidth="0.5" strokeDasharray="2,4" />
                    ))}
                </g>

                {/* Stud 1 (left) */}
                <g className="text-muted-foreground">
                    <rect
                        x="50"
                        y="35"
                        width="12"
                        height="70"
                        rx="1"
                        fill="currentColor"
                        className="text-slate-600"
                    />
                    <rect
                        x="51"
                        y="36"
                        width="4"
                        height="68"
                        rx="0.5"
                        fill="currentColor"
                        className="text-slate-500/50"
                    />
                </g>

                {/* Stud 2 (center) */}
                <g className="text-muted-foreground">
                    <rect
                        x="154"
                        y="35"
                        width="12"
                        height="70"
                        rx="1"
                        fill="currentColor"
                        className="text-slate-600"
                    />
                    <rect
                        x="155"
                        y="36"
                        width="4"
                        height="68"
                        rx="0.5"
                        fill="currentColor"
                        className="text-slate-500/50"
                    />
                </g>

                {/* Stud 3 (right) */}
                <g className="text-muted-foreground">
                    <rect
                        x="258"
                        y="35"
                        width="12"
                        height="70"
                        rx="1"
                        fill="currentColor"
                        className="text-slate-600"
                    />
                    <rect
                        x="259"
                        y="36"
                        width="4"
                        height="68"
                        rx="0.5"
                        fill="currentColor"
                        className="text-slate-500/50"
                    />
                </g>

                {/* Dimension line 1 (between stud 1 & 2) */}
                <g className="text-emerald-500/70">
                    {/* Vertical tick marks */}
                    <line x1="56" y1="20" x2="56" y2="28" stroke="currentColor" strokeWidth="1.5" />
                    <line x1="160" y1="20" x2="160" y2="28" stroke="currentColor" strokeWidth="1.5" />

                    {/* Horizontal dimension line with arrows */}
                    <line
                        x1="56"
                        y1="24"
                        x2="160"
                        y2="24"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        markerStart="url(#arrowLeft)"
                        markerEnd="url(#arrowRight)"
                    />
                </g>

                {/* Dimension line 2 (between stud 2 & 3) */}
                <g className="text-emerald-500/70">
                    {/* Vertical tick marks */}
                    <line x1="160" y1="20" x2="160" y2="28" stroke="currentColor" strokeWidth="1.5" />
                    <line x1="264" y1="20" x2="264" y2="28" stroke="currentColor" strokeWidth="1.5" />

                    {/* Horizontal dimension line with arrows */}
                    <line
                        x1="160"
                        y1="24"
                        x2="264"
                        y2="24"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        markerStart="url(#arrowLeft)"
                        markerEnd="url(#arrowRight)"
                    />
                </g>

                {/* Dimension value 1 (left spacing) */}
                <text
                    x="108"
                    y="12"
                    textAnchor="middle"
                    className="fill-emerald-400 text-[11px] font-mono font-medium"
                    style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', 'SF Mono', monospace" }}
                >
                    {displayValue}
                </text>

                {/* Dimension value 2 (right spacing) */}
                <text
                    x="212"
                    y="12"
                    textAnchor="middle"
                    className="fill-emerald-400 text-[11px] font-mono font-medium"
                    style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', 'SF Mono', monospace" }}
                >
                    {displayValue}
                </text>

                {/* Stud labels */}
                <text
                    x="56"
                    y="115"
                    textAnchor="middle"
                    className="fill-muted-foreground text-[9px] font-medium"
                >
                    Stud 1
                </text>
                <text
                    x="160"
                    y="115"
                    textAnchor="middle"
                    className="fill-muted-foreground text-[9px] font-medium"
                >
                    Stud 2
                </text>
                <text
                    x="264"
                    y="115"
                    textAnchor="middle"
                    className="fill-muted-foreground text-[9px] font-medium"
                >
                    Stud 3
                </text>

                {/* Center indicator lines (h.o.h. reference) */}
                <g className="text-emerald-500/30">
                    <line x1="56" y1="35" x2="56" y2="105" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2" />
                    <line x1="160" y1="35" x2="160" y2="105" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2" />
                    <line x1="264" y1="35" x2="264" y2="105" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2" />
                </g>
            </svg>

            {/* Caption */}
            <p className="text-[10px] text-muted-foreground/70 text-center mt-2 font-medium tracking-wide uppercase">
                Hart-op-hart afstand
            </p>
        </div>
    );
}

export default BalkafstandVisualizer;
