import {
    addMinutes,
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

export interface DutchHoliday {
    dateKey: string;
    name: string;
}

function easterSunday(year: number): Date {
    // Meeus/Jones/Butcher algorithm (Gregorian calendar)
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
}

export function getDutchHolidaysForYear(year: number): DutchHoliday[] {
    const pasen = easterSunday(year);
    const holidays: DutchHoliday[] = [
        { dateKey: format(new Date(year, 0, 1), 'yyyy-MM-dd'), name: 'Nieuwjaarsdag' },
        { dateKey: format(addDays(pasen, -2), 'yyyy-MM-dd'), name: 'Goede Vrijdag' },
        { dateKey: format(pasen, 'yyyy-MM-dd'), name: 'Eerste Paasdag' },
        { dateKey: format(addDays(pasen, 1), 'yyyy-MM-dd'), name: 'Tweede Paasdag' },
        { dateKey: format(new Date(year, 3, 27), 'yyyy-MM-dd'), name: 'Koningsdag' },
        { dateKey: format(addDays(pasen, 39), 'yyyy-MM-dd'), name: 'Hemelvaartsdag' },
        { dateKey: format(addDays(pasen, 49), 'yyyy-MM-dd'), name: 'Eerste Pinksterdag' },
        { dateKey: format(addDays(pasen, 50), 'yyyy-MM-dd'), name: 'Tweede Pinksterdag' },
        { dateKey: format(new Date(year, 11, 25), 'yyyy-MM-dd'), name: 'Eerste Kerstdag' },
        { dateKey: format(new Date(year, 11, 26), 'yyyy-MM-dd'), name: 'Tweede Kerstdag' },
    ];
    return holidays;
}

export function autoSplitJob(
    totalHours: number,
    startDate: Date,
    settings: PlanningSettings = DEFAULT_PLANNING_SETTINGS
): AutoSplitEntry[] {
    const { defaultWorkdayHours, workDays, defaultStartTime } = settings;
    const entries: AutoSplitEntry[] = [];
    let remainingHours = totalHours;
    let currentDate = startOfDay(startDate);

    const [startHour, startMin] = defaultStartTime.split(':').map(Number);
    const pauseMinutes = Math.max(0, Number(settings.pauzeMinuten || 0));

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
        const entryEndDate = calculateEndDateFromHours(entryStartDate, hoursThisDay, pauseMinutes);

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

export function calculateEndDateFromHours(
    startDate: Date,
    scheduledHours: number,
    pauseMinutes: number = 0
): Date {
    const workMinutes = Math.max(0, Math.round(scheduledHours * 60));
    const pause = Math.max(0, Math.round(pauseMinutes));
    return addMinutes(startDate, workMinutes + pause);
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
            // "Week" view shows exactly 6 weeks starting from the week containing the 1st
            // Similar to Google Calendar approach
            const monthStart = startOfMonth(currentDate);
            const start = startOfWeek(monthStart, { weekStartsOn: 1 });
            const end = addDays(start, 41); // Exactly 6 weeks (42 days)
            return {
                start,
                end
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
