'use client';

import React, { useMemo } from 'react';
import { Employee, PlanningEntry } from '@/lib/types-planning';
import {
    addDays,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameDay,
    isToday,
    startOfDay,
    startOfMonth,
    startOfWeek,
} from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Timestamp } from 'firebase/firestore';

interface MobileMonthCalendarProps {
    currentDate: Date;
    selectedDate: Date;
    entries: PlanningEntry[];
    employees: Employee[];
    schedulingMode?: boolean;
    onSelectDate: (date: Date) => void;
    onEntryClick: (entry: PlanningEntry) => void;
    onScheduleDayClick?: (date: Date) => void;
}

const WEEKDAY_LABELS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

function toDate(value: Timestamp | Date | string | number | null | undefined): Date {
    if (!value) return new Date();
    if (value instanceof Timestamp) return value.toDate();
    if (value instanceof Date) return value;
    return new Date(value);
}

export function MobileMonthCalendar({
    currentDate,
    selectedDate,
    entries,
    employees,
    schedulingMode = false,
    onSelectDate,
    onEntryClick,
    onScheduleDayClick,
}: MobileMonthCalendarProps) {
    const monthStart = useMemo(() => startOfMonth(currentDate), [currentDate]);
    const monthEnd = useMemo(() => endOfMonth(currentDate), [currentDate]);
    const calendarStart = useMemo(
        () => startOfWeek(monthStart, { weekStartsOn: 1 }),
        [monthStart]
    );
    const calendarEnd = useMemo(
        () => endOfWeek(monthEnd, { weekStartsOn: 1 }),
        [monthEnd]
    );

    const employeeNameById = useMemo(
        () => new Map(employees.map((employee) => [employee.id, employee.name])),
        [employees]
    );

    const eventsByDay = useMemo(() => {
        const byDay = new Map<string, PlanningEntry[]>();

        entries.forEach((entry) => {
            const start = startOfDay(toDate(entry.startDate));
            const end = startOfDay(toDate(entry.endDate));
            const eventDays = eachDayOfInterval({ start, end });

            eventDays.forEach((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const existing = byDay.get(key) || [];
                existing.push(entry);
                byDay.set(key, existing);
            });
        });

        byDay.forEach((dayEntries, key) => {
            const sorted = [...dayEntries].sort((a, b) => {
                const aStart = toDate(a.startDate).getTime();
                const bStart = toDate(b.startDate).getTime();
                return aStart - bStart;
            });
            byDay.set(key, sorted);
        });

        return byDay;
    }, [entries]);

    const calendarDays = useMemo(() => {
        const days: Date[] = [];
        let cursor = calendarStart;
        while (cursor <= calendarEnd) {
            days.push(cursor);
            cursor = addDays(cursor, 1);
        }
        return days;
    }, [calendarStart, calendarEnd]);

    return (
        <div className="rounded-2xl border border-zinc-700/60 bg-card/70">
            <div className="grid grid-cols-7 border-b border-zinc-700/60">
                {WEEKDAY_LABELS.map((label) => (
                    <div key={label} className="px-1 py-2 text-center text-[11px] font-medium text-muted-foreground">
                        {label}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7">
                {calendarDays.map((day) => {
                    const dayKey = format(day, 'yyyy-MM-dd');
                    const dayEntries = eventsByDay.get(dayKey) || [];
                    const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                    const isSelected = isSameDay(day, selectedDate);
                    const isTodayDate = isToday(day);

                    return (
                        <button
                            key={dayKey}
                            type="button"
                            onClick={() => {
                                onSelectDate(day);
                                if (schedulingMode) {
                                    onScheduleDayClick?.(day);
                                }
                            }}
                            className={cn(
                                'min-h-[88px] border-r border-b border-zinc-700/50 px-1 py-1.5 text-left align-top transition-colors',
                                !isCurrentMonth && 'bg-muted/20',
                                isTodayDate && 'bg-emerald-500/8',
                                isSelected && 'ring-1 ring-inset ring-emerald-400/55'
                            )}
                        >
                            <div className="mb-1 flex items-center justify-between">
                                <span
                                    className={cn(
                                        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold',
                                        isTodayDate
                                            ? 'bg-emerald-500 text-zinc-950'
                                            : isCurrentMonth
                                                ? 'text-foreground'
                                                : 'text-muted-foreground'
                                    )}
                                >
                                    {format(day, 'd')}
                                </span>
                                {dayEntries.length > 2 ? (
                                    <span className="text-[10px] text-muted-foreground">+{dayEntries.length - 2}</span>
                                ) : null}
                            </div>

                            <div className="space-y-1">
                                {dayEntries.slice(0, 2).map((entry) => {
                                    const start = toDate(entry.startDate);
                                    const employeeName = employeeNameById.get(entry.employeeId) || 'Onbekend';
                                    const label = (entry.cache?.clientName || employeeName).slice(0, 16);
                                    const isWerkbespreking = (entry.planningType || 'job') === 'werkbespreking';

                                    return (
                                        <div
                                            key={`${dayKey}-${entry.id}`}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onEntryClick(entry);
                                            }}
                                            className={cn(
                                                'truncate rounded px-1 py-0.5 text-[10px] font-medium',
                                                isWerkbespreking
                                                    ? 'bg-cyan-500/25 text-cyan-200'
                                                    : 'bg-emerald-500/20 text-emerald-200'
                                            )}
                                            title={`${label} · ${format(start, 'HH:mm', { locale: nl })}`}
                                        >
                                            {format(start, 'HH:mm', { locale: nl })} {label}
                                        </div>
                                    );
                                })}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
