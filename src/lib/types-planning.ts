import { Timestamp } from "firebase/firestore";

export type TimelineView = 'day' | 'week' | 'month';

export type PlanningStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface PlanningEntry {
    id: string;
    userId: string;
    quoteId: string;
    employeeId: string;

    startDate: Timestamp;
    endDate: Timestamp;

    scheduledHours: number;
    isAutoSplit: boolean;
    parentEntryId?: string;

    status: PlanningStatus;
    notes?: string;

    cache: {
        clientName: string;
        projectTitle: string;
        projectAddress: string;
        totalQuoteHours: number;
    };

    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export interface Employee {
    id: string;
    userId: string;

    name: string;
    color: string;
    email?: string;
    phone?: string;

    isActive: boolean;

    defaultWorkHours: {
        start: string;
        end: string;
    };
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
}

export const DEFAULT_PLANNING_SETTINGS: PlanningSettings = {
    defaultWorkdayHours: 8,
    allowAutoSplit: true,
    defaultStartTime: "08:00",
    defaultEndTime: "17:00",
    workDays: [1, 2, 3, 4, 5]
};

export const EMPLOYEE_COLORS = [
    "#10b981", // emerald-500
    "#3b82f6", // blue-500
    "#f59e0b", // amber-500
    "#ec4899", // pink-500
    "#8b5cf6", // violet-500
    "#06b6d4", // cyan-500
    "#f97316", // orange-500
    "#84cc16", // lime-500
];

export interface ScheduleBlock {
    entry: PlanningEntry;
    employee: Employee;
    left: number;
    width: number;
    top: number;
}
