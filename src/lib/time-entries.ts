export type TimeEntrySource =
  | 'today_quick'
  | 'timer_rounded'
  | 'timer_exact'
  | 'manual'
  | 'login_prompt_confirm'
  | 'login_prompt_adjust'
  | 'gps_tracking_confirm'
  | 'gps_tracking_adjust'
  | 'gps_tracking_auto';

export interface TimeEntryRecord {
  id: string;
  userId: string;
  quoteId: string | null;
  workDate: string;
  workedHours: number;
  workedDays: number | null;
  quotedHours: number | null;
  source: TimeEntrySource;
  note: string | null;
  startTime: string | null;
  endTime: string | null;
  breakDurationMinutes: number | null;
  exactMinutes: number | null;
  roundingRule: string | null;
  onsiteMinutes?: number | null;
  outboundTravelMinutes?: number | null;
  returnTravelMinutes?: number | null;
  clientTransferMinutes?: number | null;
  supplierTravelMinutes?: number | null;
  supplierStopMinutes?: number | null;
  unallocatedMinutes?: number | null;
  supplierVisits?: Array<{ name?: string; address?: string; minutes?: number }> | null;
  gpsWorkSessionId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PendingHourPrompt {
  promptKey: string;
  quoteId: string;
  quoteLabel: string;
  quoteNumber?: string;
  clientName?: string;
  projectTitle?: string;
  planningType?: 'job' | 'werkbespreking' | 'mixed';
  promptSource?: 'planning' | 'gps_tracking';
  startTime?: string;
  endTime?: string;
  matchedDistanceM?: number;
  gpsPointCount?: number;
  workDate: string;
  endWorkDate?: string;
  suggestedHours: number;
  pendingDaysCount?: number;
  pendingDates?: Array<{
    workDate: string;
    suggestedHours: number;
    dayPromptKey?: string;
  }>;
  plannedEntryRefs: string[];
}
