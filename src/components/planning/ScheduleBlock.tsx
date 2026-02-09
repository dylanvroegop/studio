'use client';

import React from 'react';
import { TimelineView, PlanningEntry, Employee } from '@/lib/types-planning';
import { formatHoursDisplay, calculateDayBlockPosition, calculateEndDateFromHours } from '@/lib/planning-utils';
import { format, isSameDay } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { User, MapPin, Clock, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScheduleBlockProps {
    entry: PlanningEntry;
    employee: Employee;
    view: TimelineView;
    day: Date;
    hours: number[];
    stackIndex?: number;
    onClick: () => void;
    onDragStart?: (e: React.PointerEvent, entryId: string, type: 'move' | 'resize-start' | 'resize-end') => void;
    pauseMinutes?: number;
}

export function ScheduleBlock({
    entry,
    employee,
    view,
    day,
    hours,
    stackIndex = 0,
    onClick,
    onDragStart,
    pauseMinutes = 0
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

    const timeLabel = view === 'day'
        ? `${format(startDate, 'HH:mm')} - ${format(displayEndDate, 'HH:mm')}`
        : formatHoursDisplay(entry.scheduledHours);

    const blendWithBackground = (hex: string, alpha: number, base: string = '#0f0f12') => {
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

    return (
        <TooltipProvider delayDuration={200}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div
                        className={cn(
                            "rounded-md px-2 py-1 cursor-pointer transition-all hover:opacity-90 hover:shadow-md group relative box-border",
                            view === 'day' ? 'flex items-center gap-2' : 'text-xs w-full'
                        )}
                        style={{
                            backgroundColor: view === 'day'
                                ? blendWithBackground(employee.color, 0.2)
                                : employee.color + '20',
                            borderLeft: `3px solid ${employee.color}`,
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

                        <span className="font-medium truncate text-white/90 select-none">
                            {entry.cache.projectTitle && entry.cache.projectTitle !== 'Klus'
                                ? entry.cache.projectTitle
                                : entry.cache.clientName || ''}
                            {entry.cache.projectTitle && entry.cache.projectTitle !== 'Klus' && entry.cache.clientName
                                ? ` · ${entry.cache.clientName}`
                                : ''}
                        </span>
                        {view === 'day' && (
                            <span className="text-xs text-white/60 shrink-0 select-none">
                                {timeLabel}
                            </span>
                        )}
                        {view !== 'day' && (
                            <div className="text-white/60 truncate select-none">
                                {timeLabel}
                            </div>
                        )}
                    </div>
                </TooltipTrigger>
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
                            <div className="flex items-center gap-2 text-white text-sm font-medium">
                                <User className="w-3 h-3 text-zinc-400" />
                                {employee.name}
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

                        <div className="border-t border-zinc-700 pt-2 flex items-center justify-between text-xs">
                            <span className="text-zinc-400">Ingepland</span>
                            <span className="text-emerald-400 font-medium">
                                {formatHoursDisplay(entry.scheduledHours)} van {formatHoursDisplay(entry.cache.totalQuoteHours)}
                            </span>
                        </div>
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
