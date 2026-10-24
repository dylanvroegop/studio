import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { summarizeTimeEntries } from '@/lib/time-entry-totals';

import { isReportTimeEntry, KOSTEN_REPORT_START } from '@/lib/kosten-report-period';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const header = request.headers.get('authorization') || '';
    const { auth } = initFirebaseAdmin();
    const decoded = header.startsWith('Bearer ') ? await auth.verifyIdToken(header.slice(7)).catch(() => null) : null;
    if (!decoded?.uid) return NextResponse.json({ ok: false }, { status: 401 });
    const blocked = await ensureDemoTrialActiveByUid(decoded.uid);
    if (blocked) return blocked;
    const rows: Record<string, unknown>[] = [];
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date());
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabaseAdmin.from('time_entries').select('*')
        .eq('user_id', decoded.uid).gte('work_date', KOSTEN_REPORT_START).lte('work_date', today).order('id').range(offset, offset + 999);
      if (error) throw error;
      rows.push(...(data || []).filter((row) => isReportTimeEntry(row, today)));
      if (!data || data.length < 1000) break;
    }
    const months = [...new Set(rows.map((row) => String(row.work_date || '').slice(0, 7)))].filter(Boolean);
    return NextResponse.json({ ok: true, dates: [...new Set(rows.map((row) => String(row.work_date || '')))].filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort(), all: summarizeTimeEntries(rows), months: Object.fromEntries(months.map((month) => [month, summarizeTimeEntries(rows.filter((row) => String(row.work_date).startsWith(month)))])) });
  } catch {
    return NextResponse.json({ ok: false, message: 'Uren konden niet worden geladen.' }, { status: 500 });
  }
}
