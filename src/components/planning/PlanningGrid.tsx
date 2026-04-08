'use client';

import React, { useMemo } from 'react';
import { TimelineView, PlanningEntry, Employee } from '@/lib/types-planning';
import { getDaysInRange, getHoursInDay, isWorkDay } from '@/lib/planning-utils';
import { useDragResize } from './useDragResize';
import { ScheduleBlock } from './ScheduleBlock';
import { format, isSameDay, isToday, startOfMonth, addMonths, isSameMonth } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Timestamp } from 'firebase/firestore';

interface PlanningGridProps {
    view: TimelineView;
    dateRange: { start: Date; end: Date };
    employees: Employee[];
    entries: PlanningEntry[];
    onEntryClick: (entry: PlanningEntry) => void;
    onEntryDrop: (entryId: string, newStart: Date, employeeId: string) => void;
    onEntryResize: (entryId: string, newStart: Date, newEnd: Date) => void;
    onEmptyCellClick: (date: Date, employeeId: string) => void;
    schedulingMode?: boolean;
    currentDate?: Date;
    pauseMinutes?: number;
    showDailyEarnings?: boolean;
}

export function PlanningGrid({
    view,
    dateRange,
    employees,
    entries,
    onEntryClick,
    onEntryDrop,
    onEntryResize,
    onEmptyCellClick,
    schedulingMode = false,
    currentDate = new Date(),
    pauseMinutes = 0,
    showDailyEarnings = false,
}: PlanningGridProps) {
    const days = useMemo(() => getDaysInRange(dateRange.start, dateRange.end), [dateRange]);
    const hours = useMemo(() => getHoursInDay(6, 20), []);
    const employeeMap = useMemo(() => new Map(employees.map(employee => [employee.id, employee])), [employees]);

    const { onDragStart, isDragging, suppressClick } = useDragResize({
        entries,
        view,
        onEntryDrop,
        onEntryResize,
        hours
    });

    const getEntriesForEmployeeAndDay = (employeeId: string, day: Date) => {
        const filtered = entries.filter(entry => {
            if (entry.employeeId !== employeeId) return false;

            const entryStart = entry.startDate instanceof Timestamp
                ? entry.startDate.toDate()
                : new Date(entry.startDate as unknown as string);
            const entryEnd = entry.endDate instanceof Timestamp
                ? entry.endDate.toDate()
                : new Date(entry.endDate as unknown as string);

            return isSameDay(entryStart, day) || isSameDay(entryEnd, day) ||
                (entryStart < day && entryEnd > day);
        });

        return filtered.sort((a, b) => {
            const aStart = a.startDate instanceof Timestamp ? a.startDate.toDate() : new Date(a.startDate as unknown as string);
            const bStart = b.startDate instanceof Timestamp ? b.startDate.toDate() : new Date(b.startDate as unknown as string);
            return aStart.getTime() - bStart.getTime();
        });
    };

    const getEntriesForDay = (day: Date) => {
        const filtered = entries.filter(entry => {
            const entryStart = entry.startDate instanceof Timestamp
                ? entry.startDate.toDate()
                : new Date(entry.startDate as unknown as string);
            const entryEnd = entry.endDate instanceof Timestamp
                ? entry.endDate.toDate()
                : new Date(entry.endDate as unknown as string);

            return isSameDay(entryStart, day) || isSameDay(entryEnd, day) ||
                (entryStart < day && entryEnd > day);
        });

        return filtered.sort((a, b) => {
            const aStart = a.startDate instanceof Timestamp ? a.startDate.toDate() : new Date(a.startDate as unknown as string);
            const bStart = b.startDate instanceof Timestamp ? b.startDate.toDate() : new Date(b.startDate as unknown as string);
            return aStart.getTime() - bStart.getTime();
        });
    };

    const getEntryEarnings = (entry: PlanningEntry): number => {
        const planningType = entry.planningType || 'job';
        if (planningType !== 'job') return 0;
        if (!showDailyEarnings) return 0;
        const totalQuoteEarnings = Number((entry.cache as any)?.totalQuoteEarnings || 0);
        const totalQuoteHours = Number((entry.cache as any)?.totalQuoteHours || 0);
        const scheduledHours = Number(entry.scheduledHours || 0);
        if (!Number.isFinite(totalQuoteEarnings) || totalQuoteEarnings <= 0) return 0;
        if (!Number.isFinite(totalQuoteHours) || totalQuoteHours <= 0) return 0;
        if (!Number.isFinite(scheduledHours) || scheduledHours <= 0) return 0;
        const value = (totalQuoteEarnings / totalQuoteHours) * scheduledHours;
        return Number.isFinite(value) && value > 0 ? value : 0;
    };

    if (view === 'day') {
        // "Dag" view is now a detailed weekly overview (7 rows per employee)
        // Each row is a timeline of hours for that day

        return (
            <div className="flex-1 bg-card rounded-lg border border-border overflow-auto">
                <div className="min-w-[800px]">
                    {/* Hour Headers - Sticky Top */}
                    <div className="sticky top-0 z-10 bg-card border-b border-border grid"
                        style={{ gridTemplateColumns: `150px repeat(${hours.length}, 1fr)` }}>
                        <div className="p-3 border-r border-border">
                            <span className="text-sm font-medium text-muted-foreground"></span>
                        </div>
                        {hours.map(hour => (
                            <div key={hour} className="p-2 text-center border-r border-border last:border-r-0">
                                <span className="text-xs text-muted-foreground">{hour}:00</span>
                            </div>
                        ))}
                    </div>

                    {/* Employee Rows */}
                    {employees.map(employee => (
                        <div key={employee.id} className="border-b border-border last:border-b-0">
                            {/* Employee Header - Sticky Left (Optional, but good for context if scrolling horizontally) */}
                            <div className="bg-card/50 p-2 border-b border-border sticky left-0 z-[5]">
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-3 h-3 rounded-full shrink-0"
                                        style={{ backgroundColor: employee.color }}
                                    />
                                    <span className="text-sm font-medium truncate">{employee.name}</span>
                                </div>
                            </div>

                            {/* 7 Day Rows for this Employee */}
                            {days.map(day => {
                                const dayEntries = getEntriesForEmployeeAndDay(employee.id, day);

                                return (
                                    <div
                                        key={day.toISOString()}
                                        className="grid border-b border-border last:border-b-0 min-h-[60px]"
                                        style={{ gridTemplateColumns: `150px repeat(${hours.length}, 1fr)` }}
                                    >
                                        {/* Day Label */}
                                        <div className={cn(
                                            "p-3 border-r border-border flex flex-col justify-center sticky left-0 z-[4] bg-card"
                                        )}>
                                            <span className={cn(
                                                "text-sm font-medium",
                                                "text-foreground"
                                            )}>
                                                {format(day, 'EEE d MMM', { locale: nl })}
                                            </span>
                                        </div>

                                        {/* Timeline Track */}
                                        <div
                                            className={cn(
                                                "relative col-span-full col-start-2",
                                                !isWorkDay(day, employee.workDays) && "bg-muted/30",
                                                schedulingMode && "cursor-pointer hover:bg-emerald-500/5 transition-colors",
                                                !schedulingMode && "cursor-default"
                                            )}
                                            onClick={() => !suppressClick && onEmptyCellClick(day, employee.id)}
                                            data-date={day.toISOString()}
                                            data-employee-id={employee.id}
                                            data-role="day-slot"
                                        >
                                            {/* Vertical Grid Lines for Hours */}
                                            <div className="absolute inset-0 grid pointer-events-none"
                                                style={{ gridTemplateColumns: `repeat(${hours.length}, 1fr)` }}>
                                                {hours.map(h => (
                                                    <div key={h} className="border-r border-border last:border-r-0 h-full" />
                                                ))}
                                            </div>
                                            {/* 15-minute Grid Lines */}
                                            <div
                                                className="absolute inset-0 pointer-events-none"
                                                style={{
                                                    backgroundImage: 'repeating-linear-gradient(to right, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 1px, transparent 1px, transparent 25%)',
                                                    backgroundSize: `calc(100% / ${hours.length}) 100%`
                                                }}
                                            />

                                            {/* Entries */}
                                            {dayEntries.map(entry => (
                                                <ScheduleBlock
                                                    key={entry.id}
                                                    entry={entry}
                                                    employee={employee}
                                                    view={view}
                                                    day={day}
                                                    hours={hours}
                                                    pauseMinutes={pauseMinutes}
                                                    showDailyEarnings={showDailyEarnings}
                                                    onClick={() => !isDragging && !suppressClick && onEntryClick(entry)}
                                                    onDragStart={onDragStart}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (view === 'month') {
        const monthStart = startOfMonth(dateRange.start);
        const months = Array.from({ length: 8 }, (_, idx) => addMonths(monthStart, idx));
        const dayNumbers = Array.from({ length: 31 }, (_, idx) => idx + 1);

        return (
            <div className="flex-1 bg-card rounded-lg border border-border overflow-auto">
                <div className="min-w-[900px]">
                    <div
                        className="sticky top-0 z-10 bg-card border-b border-border grid"
                        style={{ gridTemplateColumns: `150px repeat(${dayNumbers.length}, 1fr)` }}
                    >
                        <div className="p-3 border-r border-border">
                            <span className="text-sm font-medium text-muted-foreground"></span>
                        </div>
                        {dayNumbers.map(dayNum => (
                            <div
                                key={dayNum}
                                className="p-2 text-center border-r border-border last:border-r-0"
                            >
                                <div className="text-sm font-medium text-foreground">
                                    {dayNum}
                                </div>
                            </div>
                        ))}
                    </div>

                    {months.map(monthDate => {
                        const monthLabel = format(monthDate, 'MMMM yyyy', { locale: nl });

                        return (
                            <div
                                key={monthDate.toISOString()}
                                className="grid border-b border-border last:border-b-0"
                                style={{ gridTemplateColumns: `150px repeat(${dayNumbers.length}, 1fr)` }}
                            >
                                <div className="p-3 border-r border-border flex items-center gap-2 bg-card/50 sticky left-0 z-[5]">
                                    <span className="text-sm font-medium truncate">{monthLabel}</span>
                                </div>
                                {dayNumbers.map(dayNum => {
                                    const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), dayNum);
                                    const isValidDay = date.getMonth() === monthDate.getMonth();
                                    const dayEntries = isValidDay ? getEntriesForDay(date) : [];
                                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

                                    return (
                                        <div
                                            key={`${monthDate.toISOString()}-${dayNum}`}
                                            className={cn(
                                                "relative min-h-[60px] border-r border-border last:border-r-0 p-0",
                                                isValidDay ? "" : "bg-muted/30",
                                                isValidDay && isWeekend && "bg-muted/20",
                                                schedulingMode && isValidDay && "cursor-pointer hover:bg-emerald-500/5 transition-colors",
                                                !schedulingMode && "cursor-default"
                                            )}
                                            onClick={() => isValidDay && !suppressClick && onEmptyCellClick(date, '')}
                                            data-date={isValidDay ? date.toISOString() : undefined}
                                            data-employee-id=""
                                            data-role={isValidDay ? "month-slot" : undefined}
                                        >
                                            <div className="flex flex-col items-stretch gap-1 px-1 py-1">
                                                {dayEntries.map((entry, idx) => {
                                                    const employee = employeeMap.get(entry.employeeId);
                                                    if (!employee) return null;

                                                    return (
                                                        <ScheduleBlock
                                                            key={entry.id}
                                                            entry={entry}
                                                            employee={employee}
                                                            view={view}
                                                            day={date}
                                                            hours={hours}
                                                            pauseMinutes={pauseMinutes}
                                                            stackIndex={idx}
                                                            showDailyEarnings={showDailyEarnings}
                                                            onClick={() => !isDragging && !suppressClick && onEntryClick(entry)}
                                                            onDragStart={onDragStart}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    if (view === 'week') {
        // Create an array of weeks from the date range days
        const weeks: Date[][] = [];
        for (let i = 0; i < days.length; i += 7) {
            weeks.push(days.slice(i, i + 7));
        }

        // Days header (Mon - Sun) - just use the first week to get names
        const headerDays = weeks[0] || [];
        const weekGridStyle: React.CSSProperties = { gridTemplateColumns: '100px repeat(7, minmax(0, 1fr))' };

        return (
            <div className="flex-1 bg-card rounded-lg border border-zinc-700/50 overflow-auto">
                <div className="min-w-[740px]">
                    {/* Header: Month + Mon - Sun */}
                    <div
                        className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-zinc-700/50 grid"
                        style={weekGridStyle}
                    >
                        <div className="min-w-0 p-2 text-center border-r border-zinc-700/50">
                            <span className="text-[10px] text-emerald-200/70 font-medium uppercase tracking-wide">
                                Winst
                            </span>
                        </div>
                        {headerDays.map(day => {
                            const dayIsToday = isToday(day);
                            return (
                                <div
                                    key={format(day, 'EEE')}
                                    className={cn(
                                        "min-w-0 p-2 text-center border-r border-zinc-700/50 last:border-r-0",
                                        dayIsToday && "bg-emerald-500/12"
                                    )}
                                >
                                    <span className={cn(
                                        "text-xs font-medium",
                                        dayIsToday ? "text-emerald-300" : "text-muted-foreground/80"
                                    )}>
                                        {format(day, 'EEEE', { locale: nl })}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Employee Rows */}
                    {employees.map(employee => (
                        <div key={employee.id} className="border-b border-zinc-700/50 last:border-b-0">
                            {/* Weeks */}
                            {weeks.map((weekDays, weekIdx) => {
                                const weekEntryIds = new Set<string>();
                                const weekEarnings = weekDays.reduce((sum, day) => {
                                    const dayEntries = getEntriesForEmployeeAndDay(employee.id, day);
                                    return dayEntries.reduce((daySum, entry) => {
                                        if (weekEntryIds.has(entry.id)) return daySum;
                                        weekEntryIds.add(entry.id);
                                        return daySum + getEntryEarnings(entry);
                                    }, sum);
                                }, 0);

                                const weekEarningsLabel = new Intl.NumberFormat('nl-NL', {
                                    style: 'currency',
                                    currency: 'EUR',
                                    maximumFractionDigits: 0,
                                }).format(Math.max(0, weekEarnings));

                                return (
                                <div key={`${employee.id}-week-${weekIdx}`} className="border-b border-zinc-700/50 last:border-b-0">
                                    <div className="grid" style={weekGridStyle}>
                                        <div className="border-r border-zinc-700/50 border-b border-zinc-700/50 px-2 py-1.5">
                                            <div className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1">
                                                <div className="truncate text-[10px] leading-none text-emerald-200/75">
                                                    Week
                                                </div>
                                                <div className="mt-1 truncate text-xs font-semibold leading-none text-emerald-300">
                                                    {weekEarningsLabel}
                                                </div>
                                            </div>
                                        </div>
                                        {weekDays.map((day, dayIdx) => {
                                            const dayEntries = getEntriesForEmployeeAndDay(employee.id, day);
                                            const dayOfWeek = day.getDay();
                                            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                                            const isCurrentMonth = isSameMonth(day, currentDate);
                                            const dayIsToday = isToday(day);
                                            return (
                                                <div
                                                    key={day.toISOString()}
                                                    className={cn(
                                                        "relative min-h-[108px] min-w-0 overflow-hidden border-r border-zinc-700/50 border-b border-zinc-700/50 px-1 pt-1",
                                                        "last:border-r-0",
                                                        isWeekend && "bg-muted/20",
                                                        dayIsToday && "bg-emerald-500/10 ring-1 ring-inset ring-emerald-400/50",
                                                        schedulingMode && "cursor-pointer hover:bg-emerald-500/5 transition-colors",
                                                        !schedulingMode && "cursor-default hover:bg-zinc-900/12 transition-colors"
                                                    )}
                                                    onClick={() => !suppressClick && onEmptyCellClick(day, employee.id)}
                                                    data-date={day.toISOString()}
                                                    data-employee-id={employee.id}
                                                    data-role="week-slot"
                                                >
                                                    {dayIdx === 0 && (
                                                        <div className="absolute left-1 top-1 z-[1] text-[9px] font-medium uppercase tracking-wide text-zinc-600">
                                                            {format(day, 'MMM', { locale: nl })}
                                                        </div>
                                                    )}
                                                    <div
                                                        className={cn(
                                                            "absolute right-1 top-1 z-[1] text-[11px] leading-none font-medium",
                                                            dayIsToday
                                                                ? "rounded-full bg-emerald-500 px-1.5 py-0.5 text-zinc-950 shadow-sm"
                                                                : isCurrentMonth
                                                                    ? "text-zinc-400"
                                                                    : "text-zinc-600"
                                                        )}
                                                    >
                                                        {format(day, 'd', { locale: nl })}
                                                    </div>

                                                    <div className="relative z-0 mt-5 flex min-w-0 flex-col gap-1">
                                                        {dayEntries.map((entry, idx) => (
                                                            <div key={entry.id} className="min-w-0">
                                                                <ScheduleBlock
                                                                    entry={entry}
                                                                    employee={employee}
                                                                    view={view}
                                                                    day={day}
                                                                    hours={hours}
                                                                    pauseMinutes={pauseMinutes}
                                                                    stackIndex={idx}
                                                                    showDailyEarnings={showDailyEarnings}
                                                                    onClick={() => !isDragging && !suppressClick && onEntryClick(entry)}
                                                                    onDragStart={onDragStart}
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )})}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Week / Month view
    return (
        <div className="flex-1 bg-card rounded-lg border border-border overflow-auto">
            <div className="min-w-[800px]">
                {/* Day Headers */}
                <div
                    className="sticky top-0 z-10 bg-card border-b border-border grid"
                    style={{ gridTemplateColumns: `150px repeat(${days.length}, 1fr)` }}
                >
                    <div className="p-3 border-r border-border">
                        <span className="text-sm font-medium text-muted-foreground"></span>
                    </div>
                    {days.map(day => (
                        <div
                            key={day.toISOString()}
                            className={cn(
                                "p-2 text-center border-r border-border last:border-r-0",
                                isToday(day) && "bg-emerald-500/10"
                            )}
                        >
                            <div className="text-xs text-muted-foreground">
                                {format(day, 'EEE', { locale: nl })}
                            </div>
                            <div className={cn(
                                "text-sm font-medium",
                                isToday(day) ? "text-emerald-400" : "text-foreground"
                            )}>
                                {format(day, 'd', { locale: nl })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Employee Rows */}
                {employees.map(employee => (
                    <div
                        key={employee.id}
                        className="grid border-b border-border last:border-b-0"
                        style={{ gridTemplateColumns: `150px repeat(${days.length}, 1fr)` }}
                    >
                        <div className="p-3 border-r border-border flex items-center gap-2 bg-card/50 sticky left-0 z-[5]">
                            <div
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: employee.color }}
                            />
                            <span className="text-sm font-medium truncate">{employee.name}</span>
                        </div>
                        {days.map(day => {
                            const dayEntries = getEntriesForEmployeeAndDay(employee.id, day);

                            return (
                                <div
                                    key={day.toISOString()}
                                    className={cn(
                                        "relative min-h-[60px] border-r border-border last:border-r-0 p-1",
                                        isToday(day) && "bg-emerald-500/5",
                                        !isWorkDay(day, employee.workDays) && "bg-muted/30",
                                        schedulingMode && "cursor-pointer hover:bg-emerald-500/5 transition-colors",
                                        !schedulingMode && "cursor-default"
                                    )}
                                    onClick={() => !suppressClick && onEmptyCellClick(day, employee.id)}
                                    data-date={day.toISOString()}
                                    data-employee-id={employee.id}
                                    data-role="month-slot"
                                >
                                    {dayEntries.map((entry, idx) => (
                                        <ScheduleBlock
                                            key={entry.id}
                                            entry={entry}
                                            employee={employee}
                                            view={view}
                                            day={day}
                                            hours={hours}
                                            pauseMinutes={pauseMinutes}
                                            stackIndex={idx}
                                            showDailyEarnings={showDailyEarnings}
                                        onClick={() => !isDragging && !suppressClick && onEntryClick(entry)}
                                        onDragStart={onDragStart}
                                    />
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
