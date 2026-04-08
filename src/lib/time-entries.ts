export type TimeEntrySource =
  | 'today_quick'
  | 'timer_rounded'
  | 'timer_exact'
  | 'manual'
  | 'login_prompt_confirm'
  | 'login_prompt_adjust';

export interface TimeEntryRecord {
  id: string;
  userId: string;
  quoteId: string | null;
  workDate: string;
  workedHours: number;
  quotedHours: number | null;
  source: TimeEntrySource;
  note: string | null;
  startTime: string | null;
  endTime: string | null;
  breakDurationMinutes: number | null;
  exactMinutes: number | null;
  roundingRule: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PendingHourPrompt {
  promptKey: string;
  quoteId: string;
  quoteLabel: string;
  workDate: string;
  suggestedHours: number;
  plannedEntryRefs: string[];
}

