import { createChecklistTelegramHandler } from '@/lib/checklist-telegram-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = createChecklistTelegramHandler('groceries');
