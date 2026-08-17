import { PlanningEntry, PlanningEntryType } from '@/lib/types-planning';

interface PlanningColor {
    background: string;
    foreground: string;
}

// Google Calendar's built-in event palette. The IDs are stable API values and
// are stored on planning entries when Google Calendar is refreshed.
export const GOOGLE_CALENDAR_COLORS: Record<string, PlanningColor> = {
    '1': { background: '#a4bdfc', foreground: '#172554' },
    '2': { background: '#7ae7bf', foreground: '#064e3b' },
    '3': { background: '#dbadff', foreground: '#3b0764' },
    '4': { background: '#ff887c', foreground: '#450a0a' },
    '5': { background: '#fbd75b', foreground: '#422006' },
    '6': { background: '#ffb878', foreground: '#431407' },
    '7': { background: '#46d6db', foreground: '#083344' },
    '8': { background: '#e1e1e1', foreground: '#27272a' },
    '9': { background: '#5484ed', foreground: '#eff6ff' },
    '10': { background: '#51b749', foreground: '#052e16' },
    '11': { background: '#dc2127', foreground: '#fff1f2' },
};

export const GOOGLE_CALENDAR_RED_COLOR_ID = '11';
export const GOOGLE_CALENDAR_BLUE_COLOR_ID = '9';

const DEFAULT_COLORS: Record<PlanningEntryType, PlanningColor> = {
    job: { background: '#10b981', foreground: '#ecfdf5' },
    werkbespreking: { background: '#22d3ee', foreground: '#ecfeff' },
};

export function getPlanningColor(entry: Pick<PlanningEntry, 'googleCalendarColorId' | 'planningType'>): PlanningColor {
    return GOOGLE_CALENDAR_COLORS[entry.googleCalendarColorId || '']
        || DEFAULT_COLORS[entry.planningType || 'job'];
}
