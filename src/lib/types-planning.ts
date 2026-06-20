import { Timestamp } from "firebase/firestore";

export type TimelineView = 'day' | 'week' | 'month';

export type PlanningStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type PlanningEntryType = 'job' | 'werkbespreking';

export interface PlanningEntry {
    id: string;
    userId: string;
    quoteId: string;
    /** Legacy field. Planning is single-user and no longer assigns employees. */
    employeeId?: string;

    startDate: Timestamp;
    endDate: Timestamp;

    scheduledHours: number;
    planningType?: PlanningEntryType;
    isAutoSplit: boolean;
    parentEntryId?: string;

    status: PlanningStatus;
    notes?: string;
    googleCalendarEventId?: string | null;

    cache: {
        clientName: string;
        projectTitle: string;
        projectAddress: string;
        totalQuoteHours: number;
        totalQuoteAmount?: number;
        totalQuoteEarnings?: number;
    };

    createdAt: Timestamp;
    updatedAt: Timestamp;
}

/** @deprecated Legacy settings data retained for backward-compatible cleanup. */
export interface Employee {
    id: string;
    userId: string;
    name: string;
    color: string;
    email?: string;
    phone?: string;
    isActive: boolean;
    defaultWorkHours: { start: string; end: string };
    workDays: number[];
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export interface PlanningSettings {
    defaultWorkdayHours: number;
    allowAutoSplit: boolean;
    defaultStartTime: string;
    defaultEndTime: string;
    workDays: number[];
    pauzeMinuten?: number;
    showDailyEarnings?: boolean;
}

export const DEFAULT_PLANNING_SETTINGS: PlanningSettings = {
    defaultWorkdayHours: 8,
    allowAutoSplit: true,
    defaultStartTime: "08:00",
    defaultEndTime: "17:00",
    workDays: [1, 2, 3, 4, 5],
    showDailyEarnings: true,
};

/** @deprecated Employee colors are no longer used by Planning. */
export const EMPLOYEE_COLORS = [
    "#10b981", "#3b82f6", "#f59e0b", "#ec4899",
    "#8b5cf6", "#06b6d4", "#f97316", "#84cc16",
];

export interface ScheduleBlock {
    entry: PlanningEntry;
    left: number;
    width: number;
    top: number;
}
