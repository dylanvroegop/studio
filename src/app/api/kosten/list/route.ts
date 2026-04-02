import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { mapProjectCostRow } from '@/lib/project-costs';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function isMissingUserIdColumnError(message: string): boolean {
  return message.toLowerCase().includes('column project_costs.user_id does not exist');
}

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded?.uid || '';
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const { data, error } = await supabaseAdmin
      .from('project_costs')
      .select('*')
      .eq('user_id', uid)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingUserIdColumnError(error.message)) {
        return NextResponse.json(
          {
            ok: false,
            message:
              'Database migratie ontbreekt: voer staging_sql/20260402_add_user_id_to_existing_project_costs.sql uit.',
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    const rows = Array.isArray(data) ? data.map((row) => mapProjectCostRow(row)) : [];
    return NextResponse.json({ ok: true, data: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon kosten niet laden.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
