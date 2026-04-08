import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function getUid(request: Request): Promise<string | null> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) return null;
  const { auth } = initFirebaseAdmin();
  const decoded = await auth.verifyIdToken(token).catch(() => null);
  return decoded?.uid || null;
}

export async function POST(request: Request) {
  try {
    const uid = await getUid(request);
    if (!uid) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const promptKey = safeString(body?.promptKey);
    const quoteId = safeString(body?.quoteId);
    const workDate = safeString(body?.workDate);
    const action = safeString(body?.action);

    if (!promptKey) return NextResponse.json({ ok: false, message: 'promptKey is verplicht' }, { status: 400 });
    if (!quoteId) return NextResponse.json({ ok: false, message: 'quoteId is verplicht' }, { status: 400 });
    if (!isValidDateOnly(workDate)) return NextResponse.json({ ok: false, message: 'workDate is ongeldig' }, { status: 400 });
    if (action !== 'later' && action !== 'not_worked') {
      return NextResponse.json({ ok: false, message: 'action moet later of not_worked zijn' }, { status: 400 });
    }

    const snoozeUntil = action === 'later'
      ? new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString()
      : null;

    const { error } = await supabaseAdmin
      .from('time_entry_prompt_state')
      .upsert(
        {
          user_id: uid,
          prompt_key: promptKey,
          quote_id: quoteId,
          work_date: workDate,
          action,
          snooze_until: snoozeUntil,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,prompt_key' }
      );

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
