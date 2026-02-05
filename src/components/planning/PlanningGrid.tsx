'use client';

import React, { useMemo } from 'react';
import { TimelineView, PlanningEntry, Employee } from '@/lib/types-planning';
import { getDaysInRange, getHoursInDay, formatDateHeader, isWorkDay } from '@/lib/planning-utils';
import { ScheduleBlock } from './ScheduleBlock';
import { format, isSameDay, isToday } from 'date-fns';
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
    onEmptyCellClick: (date: Date, employeeId: string) => void;
}

export function PlanningGrid({
    view,
    dateRange,
    employees,
    entries,
    onEntryClick,
    onEntryDrop,
    onEmptyCellClick
}: PlanningGridProps) {
    const days = useMemo(() => getDaysInRange(dateRange.start, dateRange.end), [dateRange]);
    const hours = useMemo(() => getHoursInDay(6, 20), []);

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
                                                    onClick={() => onEmptyCellClick(day, employee.id)}
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
                                                                onClick={() => onEntryClick(entry)}
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
                                    onClick={() => onEmptyCellClick(day, employee.id)}
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
                                            onClick={() => onEntryClick(entry)}
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
