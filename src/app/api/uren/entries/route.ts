import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import type { TimeEntrySource } from '@/lib/time-entries';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_SOURCES: TimeEntrySource[] = [
  'today_quick',
  'timer_rounded',
  'timer_exact',
  'manual',
  'login_prompt_confirm',
  'login_prompt_adjust',
];

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
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

export async function GET(request: Request) {
  try {
    const uid = await getUid(request);
    if (!uid) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const url = new URL(request.url);
    const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') || 200)));

    const { data, error } = await supabaseAdmin
      .from('time_entries')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const uid = await getUid(request);
    if (!uid) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, message: 'Body ontbreekt' }, { status: 400 });

    const quoteIdRaw = safeString(body.quoteId);
    const quoteId = quoteIdRaw || null;
    const workDate = safeString(body.workDate || body.date);
    const workedHours = safeNumber(body.workedHours ?? body.hours);
    const quotedHoursRaw = safeNumber(body.quotedHours);
    const sourceRaw = safeString(body.source) as TimeEntrySource;
    const note = safeString(body.note) || null;
    const startTime = safeString(body.startTime) || null;
    const endTime = safeString(body.endTime) || null;
    const breakDurationMinutes = body.breakDurationMinutes == null
      ? (body.breakDuration == null ? null : Math.max(0, Math.round(safeNumber(body.breakDuration))))
      : Math.max(0, Math.round(safeNumber(body.breakDurationMinutes)));
    const exactMinutes = body.exactMinutes == null ? null : Math.max(0, Math.round(safeNumber(body.exactMinutes)));
    const roundingRule = safeString(body.roundingRule) || null;
    const promptKey = safeString(body.promptKey);

    if (!quoteId) return NextResponse.json({ ok: false, message: 'quoteId is verplicht' }, { status: 400 });
    if (!isValidDateOnly(workDate)) return NextResponse.json({ ok: false, message: 'workDate is ongeldig' }, { status: 400 });
    if (!Number.isFinite(workedHours) || workedHours <= 0 || workedHours > 24) {
      return NextResponse.json({ ok: false, message: 'workedHours is ongeldig' }, { status: 400 });
    }
    if (!ALLOWED_SOURCES.includes(sourceRaw)) {
      return NextResponse.json({ ok: false, message: 'source is ongeldig' }, { status: 400 });
    }
    const quotedHours = quotedHoursRaw > 0 ? quotedHoursRaw : null;

    const { data, error } = await supabaseAdmin
      .from('time_entries')
      .insert({
        user_id: uid,
        quote_id: quoteId,
        work_date: workDate,
        worked_hours: workedHours,
        quoted_hours: quotedHours,
        source: sourceRaw,
        note,
        start_time: startTime,
        end_time: endTime,
        break_duration_minutes: breakDurationMinutes,
        exact_minutes: exactMinutes,
        rounding_rule: roundingRule,
      })
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, message: error?.message || 'Kon niet opslaan' }, { status: 500 });
    }

    if (promptKey) {
      await supabaseAdmin
        .from('time_entry_prompt_state')
        .delete()
        .eq('user_id', uid)
        .eq('prompt_key', promptKey);
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const uid = await getUid(request);
    if (!uid) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const id = safeString(body?.id);
    if (!id) return NextResponse.json({ ok: false, message: 'id is verplicht' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('time_entries')
      .delete()
      .eq('id', id)
      .eq('user_id', uid);

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
