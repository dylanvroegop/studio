'use client';

import React from 'react';
import { TimelineView, PlanningEntry } from '@/lib/types-planning';
import { calculateDayBlockPosition, calculateEndDateFromHours } from '@/lib/planning-utils';
import { format } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { MapPin, Clock, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPlanningColor } from '@/lib/planning-colors';

interface ScheduleBlockProps {
    entry: PlanningEntry;
    view: TimelineView;
    day: Date;
    stackIndex?: number;
    onClick: () => void;
    onDragStart?: (e: React.PointerEvent, entryId: string, type: 'move' | 'resize-start' | 'resize-end') => void;
    pauseMinutes?: number;
}

export function ScheduleBlock({
    entry,
    view,
    day,
    stackIndex = 0,
    onClick,
    onDragStart,
    pauseMinutes = 0,
}: ScheduleBlockProps) {
    const startDate = entry.startDate instanceof Timestamp
        ? entry.startDate.toDate()
        : new Date(entry.startDate as unknown as string);
    const endDate = entry.endDate instanceof Timestamp
        ? entry.endDate.toDate()
        : new Date(entry.endDate as unknown as string);

    const rawDurationMinutes = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60)));
    const expectedDurationWithPauseMinutes = Math.max(0, Math.round(entry.scheduledHours * 60)) + Math.max(0, pauseMinutes);
    const displayEndDate = view === 'day' && pauseMinutes > 0 && rawDurationMinutes < expectedDurationWithPauseMinutes
        ? calculateEndDateFromHours(startDate, entry.scheduledHours, pauseMinutes)
        : endDate;

    const getBlockStyle = (): React.CSSProperties => {
        if (view === 'day') {
            const position = calculateDayBlockPosition(startDate, displayEndDate, day);
            if (!position) return { display: 'none' };
            return {
                position: 'absolute',
                left: `${position.left}%`,
                width: `${position.width}%`,
                top: '0',
                bottom: '0',
                touchAction: 'none', // Important for pointer events
                zIndex: 2
            };
        }

        // Week/Month view - blocks stack vertically
        return {
            marginTop: stackIndex > 0 ? '2px' : '0',
            touchAction: 'none',
        };
    };

    const timeLabel = entry.isAllDay ? 'Hele dag' : `${format(startDate, 'HH:mm')} - ${format(displayEndDate, 'HH:mm')}`;
    const planningType = entry.planningType || 'job';

    const planningTypeLabel = planningType === 'werkbespreking' ? 'Werkbespreking' : 'Klus';
    const planningColor = getPlanningColor(entry);
    const planningTypeColor = planningColor.background;
    const projectTitleRaw = entry.cache.projectTitle || '';
    const projectTitle = planningType === 'werkbespreking'
        ? projectTitleRaw
            .replace(/^werkbespreking\s*[·-]?\s*/i, '')
            .trim()
        : projectTitleRaw;
    const clientName = entry.cache.clientName || '';
    const hasProjectTitle = Boolean(projectTitle && projectTitle !== 'Klus');
    const displayTitle = planningType === 'werkbespreking' && clientName
        ? hasProjectTitle
            ? `${clientName} · ${projectTitle}`
            : clientName
        : hasProjectTitle
            ? projectTitle
            : clientName;

    const blendWithBackground = (hex: string, alpha: number, base: string = '#1c1c1f') => {
        const toRgb = (value: string) => {
            const normalized = value.replace('#', '');
            const full = normalized.length === 3
                ? normalized.split('').map(c => c + c).join('')
                : normalized;
            const num = parseInt(full, 16);
            return {
                r: (num >> 16) & 255,
                g: (num >> 8) & 255,
                b: num & 255
            };
        };
        const fg = toRgb(hex);
        const bg = toRgb(base);
        const mix = {
            r: Math.round(bg.r * (1 - alpha) + fg.r * alpha),
            g: Math.round(bg.g * (1 - alpha) + fg.g * alpha),
            b: Math.round(bg.b * (1 - alpha) + fg.b * alpha)
        };
        return `rgb(${mix.r}, ${mix.g}, ${mix.b})`;
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (onDragStart) {
            e.preventDefault();
            e.stopPropagation();
            onDragStart(e, entry.id, 'move');
        }
    };

    const block = (
        <div
            className={cn(
                "group relative box-border min-w-0 cursor-pointer overflow-hidden rounded-[4px] border px-2 py-1 transition-[filter,box-shadow] hover:brightness-110 hover:shadow-sm",
                view === 'day' ? 'flex items-center gap-2' : 'w-full text-xs leading-[1.2]'
            )}
            style={{
                backgroundColor: view === 'day'
                    ? blendWithBackground(planningTypeColor, 0.26)
                    : blendWithBackground(planningTypeColor, 0.38),
                borderColor: blendWithBackground(planningTypeColor, 0.42, '#3a3a3d'),
                borderLeft: `3px solid ${planningTypeColor}`,
                boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.04)',
                ...getBlockStyle()
            }}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            onPointerDown={handlePointerDown}
        >
            {/* Resize Handles for Day View */}
            {view === 'day' && onDragStart && (
                <>
                    <div
                        className="absolute left-0 top-0 bottom-0 w-2 cursor-w-resize hover:bg-white/20 z-10"
                        onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDragStart(e, entry.id, 'resize-start');
                        }}
                    />
                    <div
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-e-resize hover:bg-white/20 z-10"
                        onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDragStart(e, entry.id, 'resize-end');
                        }}
                    />
                </>
            )}

            <div className="min-w-0 flex-1 overflow-hidden">
                <span className="block truncate font-medium text-white/90 select-none">
                    {displayTitle}
                </span>
            </div>
            {view === 'day' && (
                <span className="shrink-0 text-xs text-white/60 select-none">
                    {timeLabel}
                </span>
            )}
            {view !== 'day' && (
                <div className="mt-0.5 truncate text-[11px] text-white/55 select-none">
                    {timeLabel}
                </div>
            )}
        </div>
    );

    if (view !== 'day') {
        return block;
    }

    return (
        <TooltipProvider delayDuration={200}>
            <Tooltip>
                <TooltipTrigger asChild>{block}</TooltipTrigger>
                <TooltipContent
                    side="right"
                    className="bg-zinc-900 border-zinc-700 p-0 w-64"
                >
                    <div className="p-3 space-y-2">
                        <div className="flex items-center gap-2 text-zinc-400 text-xs">
                            <Clock className="w-3 h-3" />
                            <span>
                                {format(startDate, 'HH:mm')} - {format(displayEndDate, 'HH:mm')}
                            </span>
                        </div>

                        <div className="border-t border-zinc-700 pt-2">
                            <div className="mt-1 text-xs font-medium" style={{ color: planningColor.background }}>
                                {planningTypeLabel}
                            </div>
                        </div>

                        <div className="flex items-start gap-2">
                            <Briefcase className="w-3 h-3 text-zinc-400 mt-0.5" />
                            <div>
                                <div className="text-white text-sm font-medium">
                                    {entry.cache.projectTitle || 'Klus'}
                                </div>
                                {entry.cache.clientName && (
                                    <div className="text-zinc-400 text-xs">
                                        {entry.cache.clientName}
                                    </div>
                                )}
                            </div>
                        </div>

                        {entry.cache.projectAddress && (
                            <div className="flex items-start gap-2">
                                <MapPin className="w-3 h-3 text-zinc-400 mt-0.5" />
                                <div className="text-zinc-400 text-xs">
                                    {entry.cache.projectAddress}
                                </div>
                            </div>
                        )}
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
