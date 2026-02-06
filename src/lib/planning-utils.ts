import {
    addDays,
    startOfDay,
    endOfDay,
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    eachDayOfInterval,
    addMonths,
    format,
    getDay,
    setHours,
    setMinutes,
    differenceInMinutes,
    isSameDay,
    parseISO,
    isWithinInterval
} from 'date-fns';
import { nl } from 'date-fns/locale';
import { PlanningSettings, TimelineView, DEFAULT_PLANNING_SETTINGS } from './types-planning';

export interface AutoSplitEntry {
    startDate: Date;
    endDate: Date;
    hours: number;
}

export function autoSplitJob(
    totalHours: number,
    startDate: Date,
    settings: PlanningSettings = DEFAULT_PLANNING_SETTINGS
): AutoSplitEntry[] {
    const { defaultWorkdayHours, workDays, defaultStartTime, defaultEndTime } = settings;
    const entries: AutoSplitEntry[] = [];
    let remainingHours = totalHours;
    let currentDate = startOfDay(startDate);

    const [startHour, startMin] = defaultStartTime.split(':').map(Number);
    const [endHour, endMin] = defaultEndTime.split(':').map(Number);

    while (remainingHours > 0) {
        const dayOfWeek = getDay(currentDate);
        if (dayOfWeek === 0) {
            currentDate = addDays(currentDate, 1);
            continue;
        }
        const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek;

        if (!workDays.includes(adjustedDay)) {
            currentDate = addDays(currentDate, 1);
            continue;
        }

        const hoursThisDay = Math.min(remainingHours, defaultWorkdayHours);
        const entryStartDate = setMinutes(setHours(currentDate, startHour), startMin);
        const entryEndDate = setMinutes(setHours(currentDate, startHour + hoursThisDay), startMin);

        entries.push({
            startDate: entryStartDate,
            endDate: entryEndDate,
            hours: hoursThisDay
        });

        remainingHours -= hoursThisDay;
        currentDate = addDays(currentDate, 1);
    }

    return entries;
}

export function getDateRangeForView(view: TimelineView, currentDate: Date): { start: Date; end: Date } {
    switch (view) {
        case 'day':
            // "Dag" view now shows 7 days (horizontal view)
            return {
                start: startOfWeek(currentDate, { weekStartsOn: 1 }),
                end: endOfWeek(currentDate, { weekStartsOn: 1 })
            };
        case 'week':
            // "Week" view now shows 6 weeks (grid view)
            const start = startOfWeek(currentDate, { weekStartsOn: 1 });
            return {
                start,
                end: addDays(start, 41) // 6 weeks (42 days) total
            };
        case 'month':
            return {
                start: startOfMonth(currentDate),
                end: endOfMonth(addMonths(currentDate, 7))
            };
    }
}

export function getDaysInRange(start: Date, end: Date): Date[] {
    return eachDayOfInterval({ start, end });
}

export function getHoursInDay(startHour: number = 6, endHour: number = 20): number[] {
    const hours: number[] = [];
    for (let h = startHour; h <= endHour; h++) {
        hours.push(h);
    }
    return hours;
}

export function formatDateHeader(date: Date, view: TimelineView): string {
    switch (view) {
        case 'day':
            return format(date, 'EEE d', { locale: nl });
        case 'week':
            return format(date, 'd', { locale: nl });
        case 'month':
            return format(date, 'd', { locale: nl });
    }
}

export function calculateBlockPosition(
    entryStart: Date,
    entryEnd: Date,
    viewStart: Date,
    viewEnd: Date,
    view: TimelineView
): { left: number; width: number } | null {
    const entryStartTime = entryStart.getTime();
    const entryEndTime = entryEnd.getTime();
    const viewStartTime = viewStart.getTime();
    const viewEndTime = viewEnd.getTime();

    if (entryEndTime < viewStartTime || entryStartTime > viewEndTime) {
        return null;
    }

    const clampedStart = Math.max(entryStartTime, viewStartTime);
    const clampedEnd = Math.min(entryEndTime, viewEndTime);

    const totalViewTime = viewEndTime - viewStartTime;
    const left = ((clampedStart - viewStartTime) / totalViewTime) * 100;
    const width = ((clampedEnd - clampedStart) / totalViewTime) * 100;

    return { left, width };
}

export function calculateDayBlockPosition(
    entryStart: Date,
    entryEnd: Date,
    dayDate: Date
): { left: number; width: number } | null {
    const dayStart = startOfDay(dayDate);
    // Use fixed hours matching the grid (6:00 - 20:00)
    const startHour = 6;
    // Grid renders 6..20 as 15 columns, so end is 21:00 for alignment.
    const endHour = 21;
    const totalHours = endHour - startHour;

    const entryStartHour = entryStart.getHours() + entryStart.getMinutes() / 60;
    const entryEndHour = entryEnd.getHours() + entryEnd.getMinutes() / 60;

    const clampedStart = Math.max(entryStartHour, startHour);
    const clampedEnd = Math.min(entryEndHour, endHour);

    if (clampedEnd <= clampedStart) return null;

    const left = ((clampedStart - startHour) / totalHours) * 100;
    const width = ((clampedEnd - clampedStart) / totalHours) * 100;

    return { left, width };
}



export function isWorkDay(date: Date, workDays: number[]): boolean {
    const dayOfWeek = getDay(date);
    const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
    return workDays.includes(adjustedDay);
}

export function getNextWorkDay(date: Date, workDays: number[]): Date {
    let current = addDays(date, 1);
    while (!isWorkDay(current, workDays)) {
        current = addDays(current, 1);
    }
    return current;
}

export function getPreviousWorkDay(date: Date, workDays: number[]): Date {
    let current = addDays(date, -1);
    while (!isWorkDay(current, workDays)) {
        current = addDays(current, -1);
    }
    return current;
}

export function formatHoursDisplay(hours: number): string {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (m === 0) return `${h}u`;
    return `${h}u ${m}m`;
}

export function parseTimeString(timeStr: string): { hours: number; minutes: number } {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return { hours: hours || 0, minutes: minutes || 0 };
}
