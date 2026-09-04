export interface AppointmentPlanningEntry {
    startDate: Date;
    endDate: Date;
    city: string;
}

export interface AppointmentSuggestion {
    date: string;
    time: string;
    startDate: Date;
    endDate: Date;
    reason: string;
}

const DEFAULT_APPOINTMENT_TIME = '19:00';
const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];
const AMSTERDAM_TIME_ZONE = 'Europe/Amsterdam';

export function normalizeCity(value: string): string {
    return value
        .toLocaleLowerCase('nl-NL')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function getCityFromAddress(value: unknown): string {
    const address = String(value ?? '').trim();
    if (!address) return '';

    const postcodeMatch = address.match(/\b\d{4}\s*[A-Z]{2}\s+(.+)$/i);
    if (postcodeMatch?.[1]) return postcodeMatch[1].trim();

    const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
    return parts.at(-1) || '';
}

export function getLocalDateKey(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: AMSTERDAM_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
}

function getIsoDay(date: Date): number {
    const weekday = new Intl.DateTimeFormat('en-US', {
        timeZone: AMSTERDAM_TIME_ZONE,
        weekday: 'short',
    }).format(date);
    return ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[weekday] || 1;
}

function getAmsterdamDateParts(date: Date): { year: number; month: number; day: number } {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: AMSTERDAM_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
    return { year: get('year'), month: get('month'), day: get('day') };
}

function addDaysToDateKey(date: Date, days: number): string {
    const current = getAmsterdamDateParts(date);
    const shifted = new Date(Date.UTC(current.year, current.month - 1, current.day + days, 12));
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

function getDateAtAmsterdamTime(dateKey: string, time: string): Date {
    const [year, month, day] = dateKey.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
    const getOffset = (date: Date): number => {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: AMSTERDAM_TIME_ZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(date);
        const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
        return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - date.getTime();
    };

    let utc = localAsUtc - getOffset(new Date(localAsUtc));
    utc = localAsUtc - getOffset(new Date(utc));
    return new Date(utc);
}

export function getAppointmentSuggestion(
    clientCity: string,
    entries: AppointmentPlanningEntry[],
    options?: { workDays?: number[]; now?: Date },
): AppointmentSuggestion | null {
    const normalizedClientCity = normalizeCity(clientCity);
    const configuredWorkDays = (options?.workDays || DEFAULT_WORK_DAYS)
        .map(Number)
        .filter((day) => Number.isFinite(day) && day >= 1 && day <= 7);
    const workDays = configuredWorkDays.length > 0 ? configuredWorkDays : DEFAULT_WORK_DAYS;
    const now = options?.now || new Date();
    const candidates = Array.from({ length: 4 }, (_, index) => {
        const dateKey = addDaysToDateKey(now, index + 1);
        const candidateDate = getDateAtAmsterdamTime(dateKey, '12:00');
        return { dateKey, candidateDate };
    }).filter(({ candidateDate }) => workDays.includes(getIsoDay(candidateDate)));

    const isSlotFree = (dateKey: string) => {
        const start = getDateAtAmsterdamTime(dateKey, DEFAULT_APPOINTMENT_TIME);
        const end = new Date(start.getTime() + 60 * 60 * 1000);

        return entries.every((entry) => entry.endDate <= start || entry.startDate >= end);
    };

    const hasSameCityWork = (dateKey: string) => {
        return entries.some((entry) =>
            getLocalDateKey(entry.startDate) === dateKey
            && normalizedClientCity
            && normalizeCity(entry.city) === normalizedClientCity,
        );
    };

    const matchingRouteDate = candidates.find(({ dateKey }) => isSlotFree(dateKey) && hasSameCityWork(dateKey));
    const selectedDate = matchingRouteDate || candidates.find(({ dateKey }) => isSlotFree(dateKey));
    if (!selectedDate) return null;

    const startDate = getDateAtAmsterdamTime(selectedDate.dateKey, DEFAULT_APPOINTMENT_TIME);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

    return {
        date: selectedDate.dateKey,
        time: DEFAULT_APPOINTMENT_TIME,
        startDate,
        endDate,
        reason: matchingRouteDate
            ? `Je werkt die dag al in ${clientCity}.`
            : 'Vrije plek om 19:00 binnen 1–4 dagen.',
    };
}
