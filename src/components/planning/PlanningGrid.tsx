'use client';

import React, { useMemo } from 'react';
import { addMonths, format, isSameDay, isSameMonth, isToday, startOfMonth } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';

import { cn } from '@/lib/utils';
import { getDaysInRange, getDutchHolidaysForYear, getHoursInDay } from '@/lib/planning-utils';
import { PlanningEntry, TimelineView } from '@/lib/types-planning';

import { ScheduleBlock } from './ScheduleBlock';
import { useDragResize } from './useDragResize';

interface PlanningGridProps {
    view: TimelineView;
    dateRange: { start: Date; end: Date };
    entries: PlanningEntry[];
    onEntryClick: (entry: PlanningEntry) => void;
    onEntryDrop: (entryId: string, newStart: Date) => void;
    onEntryResize: (entryId: string, newStart: Date, newEnd: Date) => void;
    onEmptyCellClick: (date: Date) => void;
    schedulingMode?: boolean;
    currentDate?: Date;
    pauseMinutes?: number;
}

function toDate(value: PlanningEntry['startDate']): Date {
    return value instanceof Timestamp ? value.toDate() : new Date(value as unknown as string);
}

export function PlanningGrid({
    view,
    dateRange,
    entries,
    onEntryClick,
    onEntryDrop,
    onEntryResize,
    onEmptyCellClick,
    schedulingMode = false,
    currentDate = new Date(),
    pauseMinutes = 0,
}: PlanningGridProps) {
    const days = useMemo(() => getDaysInRange(dateRange.start, dateRange.end), [dateRange]);
    const hours = useMemo(() => getHoursInDay(6, 20), []);
    const holidayNameByDateKey = useMemo(() => {
        const years = new Set(days.map((day) => day.getFullYear()));
        const map = new Map<string, string>();
        years.forEach((year) => {
            getDutchHolidaysForYear(year).forEach((holiday) => map.set(holiday.dateKey, holiday.name));
        });
        return map;
    }, [days]);

    const { onDragStart, isDragging, suppressClick } = useDragResize({
        entries,
        view,
        onEntryDrop,
        onEntryResize,
        hours,
    });

    const getEntriesForDay = (day: Date): PlanningEntry[] => entries
        .filter((entry) => {
            const start = toDate(entry.startDate);
            const end = toDate(entry.endDate);
            return isSameDay(start, day) || isSameDay(end, day) || (start < day && end > day);
        })
        .sort((left, right) => toDate(left.startDate).getTime() - toDate(right.startDate).getTime());

    if (view === 'day') {
        return (
            <div className="flex-1 overflow-auto rounded-lg border border-border bg-card">
                <div className="min-w-[800px]">
                    <div className="sticky top-0 z-10 grid border-b border-border bg-card" style={{ gridTemplateColumns: `150px repeat(${hours.length}, 1fr)` }}>
                        <div className="border-r border-border p-3" />
                        {hours.map((hour) => <div key={hour} className="border-r border-border p-2 text-center text-xs text-muted-foreground">{hour}:00</div>)}
                    </div>
                    {days.map((day) => {
                        const dayEntries = getEntriesForDay(day);
                        return (
                            <div key={day.toISOString()} className="grid border-b border-border" style={{ gridTemplateColumns: `150px repeat(${hours.length}, 1fr)` }}>
                                <button type="button" className="border-r border-border p-3 text-left text-sm" onClick={() => onEmptyCellClick(day)}>
                                    {format(day, 'EEEE d MMM', { locale: nl })}
                                </button>
                                <div className="relative min-h-14" style={{ gridColumn: '2 / -1' }} data-role="day-slot" data-date={day.toISOString()}>
                                    {dayEntries.map((entry) => (
                                        <ScheduleBlock key={entry.id} entry={entry} view={view} day={day} hours={hours} pauseMinutes={pauseMinutes} onClick={() => onEntryClick(entry)} onDragStart={onDragStart} />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    if (view === 'week') {
        const weeks: Date[][] = [];
        for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));
        return (
            <div className="flex-1 overflow-auto rounded-lg border border-zinc-700/50 bg-card">
                <div className="min-w-[740px]">
                    <div className="sticky top-0 z-10 grid grid-cols-7 border-b border-zinc-700/50 bg-card/95 backdrop-blur">
                        {(weeks[0] || []).map((day) => <div key={format(day, 'EEE')} className="border-r border-zinc-700/50 p-2 text-center text-xs font-medium text-muted-foreground">{format(day, 'EEEE', { locale: nl })}</div>)}
                    </div>
                    {weeks.map((weekDays, weekIndex) => (
                        <div key={weekIndex} className="grid grid-cols-7">
                            {weekDays.map((day, dayIndex) => {
                                const holidayName = holidayNameByDateKey.get(format(day, 'yyyy-MM-dd'));
                                const dayEntries = getEntriesForDay(day);
                                return (
                                    <button
                                        type="button"
                                        key={day.toISOString()}
                                        className={cn('relative min-h-[108px] min-w-0 overflow-hidden border-b border-r border-zinc-700/50 px-1 pt-1 text-left', day.getDay() % 6 === 0 && 'bg-muted/20', holidayName && 'bg-rose-500/10', isToday(day) && 'bg-emerald-500/10 ring-1 ring-inset ring-emerald-400/50', schedulingMode && 'hover:bg-emerald-500/5')}
                                        onClick={() => !suppressClick && onEmptyCellClick(day)}
                                        data-date={day.toISOString()}
                                        data-role="week-slot"
                                    >
                                        {dayIndex === 0 && <span className="absolute left-1 top-1 text-[9px] uppercase text-zinc-600">{format(day, 'MMM', { locale: nl })}</span>}
                                        <span className={cn('absolute right-1 top-1 text-[11px]', isSameMonth(day, currentDate) ? 'text-zinc-400' : 'text-zinc-600')}>{format(day, 'd')}</span>
                                        <div className="relative mt-5 flex min-w-0 flex-col gap-1">
                                            {holidayName && <div className="truncate rounded bg-rose-500/20 px-1 py-0.5 text-[10px] text-rose-200">Feestdag: {holidayName}</div>}
                                            {dayEntries.map((entry, entryIndex) => (
                                                <ScheduleBlock key={entry.id} entry={entry} view={view} day={day} hours={hours} pauseMinutes={pauseMinutes} stackIndex={entryIndex} onClick={() => !isDragging && !suppressClick && onEntryClick(entry)} onDragStart={onDragStart} />
                                            ))}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    const months = Array.from({ length: 8 }, (_, index) => addMonths(startOfMonth(currentDate), index));
    const dayNumbers = Array.from({ length: 31 }, (_, index) => index + 1);
    return (
        <div className="flex-1 overflow-auto rounded-lg border border-border bg-card">
            <div className="min-w-[1200px]">
                {months.map((month) => (
                    <div key={month.toISOString()} className="grid border-b border-border" style={{ gridTemplateColumns: '150px repeat(31, minmax(36px, 1fr))' }}>
                        <div className="sticky left-0 z-[5] border-r border-border bg-card p-3 text-sm font-medium">{format(month, 'MMMM yyyy', { locale: nl })}</div>
                        {dayNumbers.map((dayNumber) => {
                            const day = new Date(month.getFullYear(), month.getMonth(), dayNumber);
                            const valid = day.getMonth() === month.getMonth();
                            const dayEntries = valid ? getEntriesForDay(day) : [];
                            return (
                                <button type="button" key={dayNumber} disabled={!valid} className={cn('min-h-[60px] border-r border-border p-1 text-left text-[10px]', !valid && 'bg-muted/30')} onClick={() => valid && onEmptyCellClick(day)} data-date={valid ? day.toISOString() : undefined} data-role={valid ? 'month-slot' : undefined}>
                                    {valid && <span className="text-muted-foreground">{dayNumber}</span>}
                                    {dayEntries.map((entry, entryIndex) => <ScheduleBlock key={entry.id} entry={entry} view={view} day={day} hours={hours} stackIndex={entryIndex} pauseMinutes={pauseMinutes} onClick={() => onEntryClick(entry)} onDragStart={onDragStart} />)}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
