import { createChecklistReminderHandler } from '@/lib/checklist-reminder-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createChecklistReminderHandler('groceries');
