'use client';

import React, { useMemo } from 'react';
import { TimelineView, PlanningEntry, Employee } from '@/lib/types-planning';
import { getDaysInRange, getHoursInDay, formatDateHeader, isWorkDay } from '@/lib/planning-utils';
import { useDragResize } from './useDragResize';
import { ScheduleBlock } from './ScheduleBlock';
import { format, isSameDay, isToday, startOfMonth, addMonths } from 'date-fns';
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
}

export function PlanningGrid({
    view,
    dateRange,
    employees,
    entries,
    onEntryClick,
    onEntryDrop,
    onEntryResize,
    onEmptyCellClick
}: PlanningGridProps) {
    const days = useMemo(() => getDaysInRange(dateRange.start, dateRange.end), [dateRange]);
    const hours = useMemo(() => getHoursInDay(6, 20), []);
    const employeeMap = useMemo(() => new Map(employees.map(employee => [employee.id, employee])), [employees]);

    const { onDragStart, dragState, isDragging, suppressClick } = useDragResize({
        entries,
        view,
        onEntryDrop,
        onEntryResize,
        hours
    });

    const getEntriesForEmployeeAndDay = (employeeId: string, day: Date) => {
        return entries.filter(entry => {
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
    };

    const getEntriesForDay = (day: Date) => {
        return entries.filter(entry => {
            const entryStart = entry.startDate instanceof Timestamp
                ? entry.startDate.toDate()
                : new Date(entry.startDate as unknown as string);
            const entryEnd = entry.endDate instanceof Timestamp
                ? entry.endDate.toDate()
                : new Date(entry.endDate as unknown as string);

            return isSameDay(entryStart, day) || isSameDay(entryEnd, day) ||
                (entryStart < day && entryEnd > day);
        });
    };

    if (view === 'day') {
        // "Dag" view is now a detailed weekly overview (7 rows per employee)
        // Each row is a timeline of hours for that day

        return (
            <div className="flex-1 bg-zinc-900 rounded-lg border border-zinc-800 overflow-auto">
                <div className="min-w-[800px]">
                    {/* Hour Headers - Sticky Top */}
                    <div className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800 grid"
                        style={{ gridTemplateColumns: `150px repeat(${hours.length}, 1fr)` }}>
                        <div className="p-3 border-r border-zinc-800">
                            <span className="text-sm font-medium text-zinc-400"></span>
                        </div>
                        {hours.map(hour => (
                            <div key={hour} className="p-2 text-center border-r border-zinc-800 last:border-r-0">
                                <span className="text-xs text-zinc-500">{hour}:00</span>
                            </div>
                        ))}
                    </div>

                    {/* Employee Rows */}
                    {employees.map(employee => (
                        <div key={employee.id} className="border-b border-zinc-800 last:border-b-0">
                            {/* Employee Header - Sticky Left (Optional, but good for context if scrolling horizontally) */}
                            <div className="bg-zinc-900/50 p-2 border-b border-zinc-800/50 sticky left-0 z-[5]">
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
                                        className="grid border-b border-zinc-800/50 last:border-b-0 min-h-[60px]"
                                        style={{ gridTemplateColumns: `150px repeat(${hours.length}, 1fr)` }}
                                    >
                                        {/* Day Label */}
                                        <div className={cn(
                                            "p-3 border-r border-zinc-800 flex flex-col justify-center sticky left-0 z-[4] bg-zinc-900",
                                            isToday(day) && "bg-emerald-500/5"
                                        )}>
                                            <span className={cn(
                                                "text-sm font-medium",
                                                isToday(day) ? "text-emerald-400" : "text-zinc-300"
                                            )}>
                                                {format(day, 'EEE d MMM', { locale: nl })}
                                            </span>
                                        </div>

                                        {/* Timeline Track */}
                                        <div
                                            className={cn(
                                                "relative col-span-full col-start-2",
                                                !isWorkDay(day, employee.workDays) && "bg-zinc-800/30"
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
                                                    <div key={h} className="border-r border-zinc-800 last:border-r-0 h-full" />
                                                ))}
                                            </div>
                                            {/* 15-minute Grid Lines */}
                                            <div
                                                className="absolute inset-0 pointer-events-none"
                                                style={{
                                                    backgroundImage: 'repeating-linear-gradient(to right, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 1px, transparent 1px, transparent 25%)',
                                                    backgroundSize: 'calc(100% / 14) 100%'
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
            <div className="flex-1 bg-zinc-900 rounded-lg border border-zinc-800 overflow-auto">
                <div className="min-w-[900px]">
                    <div
                        className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800 grid"
                        style={{ gridTemplateColumns: `150px repeat(${dayNumbers.length}, 1fr)` }}
                    >
                        <div className="p-3 border-r border-zinc-800">
                            <span className="text-sm font-medium text-zinc-400"></span>
                        </div>
                        {dayNumbers.map(dayNum => (
                            <div
                                key={dayNum}
                                className="p-2 text-center border-r border-zinc-800 last:border-r-0"
                            >
                                <div className="text-sm font-medium text-zinc-300">
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
                                className="grid border-b border-zinc-800 last:border-b-0"
                                style={{ gridTemplateColumns: `150px repeat(${dayNumbers.length}, 1fr)` }}
                            >
                                <div className="p-3 border-r border-zinc-800 flex items-center gap-2 bg-zinc-900/50 sticky left-0 z-[5]">
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
                                                "relative min-h-[60px] border-r border-zinc-800 last:border-r-0 p-0",
                                                isValidDay ? "" : "bg-zinc-800/30",
                                                isValidDay && isWeekend && "bg-zinc-800/20"
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
                                                            stackIndex={idx}
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
        // Create an array of 6 weeks from the date range days
        const weeks: Date[][] = [];
        for (let i = 0; i < days.length; i += 7) {
            weeks.push(days.slice(i, i + 7));
        }

        // Days header (Mon - Sun) - just use the first week to get names
        const headerDays = weeks[0] || [];

        return (
            <div className="flex-1 bg-zinc-900 rounded-lg border border-zinc-800 overflow-auto">
                <div className="min-w-[800px]">
                    {/* Header: Mon - Sun */}
                    <div
                        className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800 grid"
                        style={{ gridTemplateColumns: `150px repeat(7, 1fr)` }}
                    >
                        <div className="p-3 border-r border-zinc-800">
                            <span className="text-sm font-medium text-zinc-400"></span>
                        </div>
                        {headerDays.map(day => (
                            <div
                                key={format(day, 'EEE')}
                                className="p-2 text-center border-r border-zinc-800 last:border-r-0"
                            >
                                <span className="text-xs text-zinc-500 font-medium">
                                    {format(day, 'EEEE', { locale: nl })}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Employee Rows */}
                    {employees.map(employee => (
                        <div key={employee.id} className="border-b border-zinc-800 last:border-b-0">
                            <div
                                className="grid"
                                style={{ gridTemplateColumns: `150px repeat(7, 1fr)` }}
                            >
                                {/* Employee Info - Spans all weeks */}
                                <div
                                    className="p-3 border-r border-zinc-800 bg-zinc-900/50 flex flex-col justify-start sticky left-0 z-[5]"
                                    style={{ gridRow: `1 / span ${weeks.length}` }}
                                >
                                    <div className="flex items-center gap-2 sticky top-[45px]">
                                        <div
                                            className="w-3 h-3 rounded-full shrink-0"
                                            style={{ backgroundColor: employee.color }}
                                        />
                                        <span className="text-sm font-medium truncate">{employee.name}</span>
                                    </div>
                                </div>

                                {/* Weeks */}
                                {weeks.map((weekDays, weekIdx) => (
                                    <React.Fragment key={weekIdx}>
                                        {weekDays.map(day => {
                                            const dayEntries = getEntriesForEmployeeAndDay(employee.id, day);
                                            return (
                                                <div
                                                    key={day.toISOString()}
                                                    className={cn(
                                                        "relative min-h-[100px] border-r border-zinc-800 border-b border-zinc-800/50 p-1",
                                                        "last:border-r-0", // Last day of week
                                                        // weekIdx === weeks.length - 1 && "border-b-0", // Last week
                                                        isToday(day) && "bg-emerald-500/5",
                                                        !isWorkDay(day, employee.workDays) && "bg-zinc-800/30",
                                                        // If it's not the first week, we don't need to specify column because they flow naturally?
                                                        // Actually in CSS Grid, if we didn't use subgrid/nested, this works because the parent grid 
                                                        // defines the columns. 
                                                        // BUT: The Employee div is taking up grid-column 1 / 2.
                                                        // So all these divs need to be placed in columns 2-8.
                                                        // However, just letting them flow will put them in col 1 if we aren't careful?
                                                        // No, grid-auto-flow: row.
                                                        // The employee cell took up the first slot of rows 1..N.
                                                        // The next items will fill the available slots.
                                                    )}
                                                    onClick={() => !suppressClick && onEmptyCellClick(day, employee.id)}
                                                    data-date={day.toISOString()}
                                                    data-employee-id={employee.id}
                                                    data-role="week-slot"
                                                >
                                                    <div className={cn(
                                                        "text-xs mb-1 text-right px-1",
                                                        isToday(day) ? "text-emerald-400 font-bold" : "text-zinc-500"
                                                    )}>
                                                        {format(day, 'd MMM', { locale: nl })}
                                                    </div>

                                                    <div className="flex flex-col gap-1">
                                                        {dayEntries.map((entry, idx) => (
                                                            <ScheduleBlock
                                                                key={entry.id}
                                                                entry={entry}
                                                                employee={employee}
                                                                view={view}
                                                                day={day}
                                                                hours={hours}
                                                                stackIndex={idx}
                                                                onClick={() => !isDragging && !suppressClick && onEntryClick(entry)}
                                                                onDragStart={onDragStart}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Week / Month view
    return (
        <div className="flex-1 bg-zinc-900 rounded-lg border border-zinc-800 overflow-auto">
            <div className="min-w-[800px]">
                {/* Day Headers */}
                <div
                    className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800 grid"
                    style={{ gridTemplateColumns: `150px repeat(${days.length}, 1fr)` }}
                >
                    <div className="p-3 border-r border-zinc-800">
                        <span className="text-sm font-medium text-zinc-400"></span>
                    </div>
                    {days.map(day => (
                        <div
                            key={day.toISOString()}
                            className={cn(
                                "p-2 text-center border-r border-zinc-800 last:border-r-0",
                                isToday(day) && "bg-emerald-500/10"
                            )}
                        >
                            <div className="text-xs text-zinc-500">
                                {format(day, 'EEE', { locale: nl })}
                            </div>
                            <div className={cn(
                                "text-sm font-medium",
                                isToday(day) ? "text-emerald-400" : "text-zinc-300"
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
                        className="grid border-b border-zinc-800 last:border-b-0"
                        style={{ gridTemplateColumns: `150px repeat(${days.length}, 1fr)` }}
                    >
                        <div className="p-3 border-r border-zinc-800 flex items-center gap-2 bg-zinc-900/50 sticky left-0 z-[5]">
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
                                        "relative min-h-[60px] border-r border-zinc-800 last:border-r-0 p-1",
                                        isToday(day) && "bg-emerald-500/5",
                                        !isWorkDay(day, employee.workDays) && "bg-zinc-800/30"
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
                                            stackIndex={idx}
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
