import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { mapProjectCostRow } from '@/lib/project-costs';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function noStoreHeaders(): HeadersInit {
  return {
    'Cache-Control': 'no-store',
  };
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function isProjectCostsSchemaMismatchError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('project_costs.') && lower.includes('does not exist');
}

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json(
        { ok: false, message: 'Unauthorized' },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded?.uid || '';
    if (!uid) {
      return NextResponse.json(
        { ok: false, message: 'Unauthorized' },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }

    const { data, error } = await supabaseAdmin
      .from('project_costs')
      .select('*')
      .eq('user_id', uid)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      if (isProjectCostsSchemaMismatchError(error.message)) {
        return NextResponse.json(
          {
            ok: false,
            message:
              'Database migratie ontbreekt: voer staging_sql/20260402_repair_project_costs_schema.sql uit.',
          },
          { status: 500, headers: noStoreHeaders() }
        );
      }
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    let rows = Array.isArray(data) ? data : [];

    // Legacy recovery path: costs may be linked to the user's quotes but carry an outdated user_id.
    if (rows.length === 0) {
      const quoteSnapshot = await firestore
        .collection('quotes')
        .where('userId', '==', uid)
        .get();

      const ownedQuoteIds = uniqueStrings(quoteSnapshot.docs.map((doc) => doc.id));
      if (ownedQuoteIds.length > 0) {
        const fallbackResult = await supabaseAdmin
          .from('project_costs')
          .select('*')
          .in('offerte_id', ownedQuoteIds)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false });

        if (!fallbackResult.error && Array.isArray(fallbackResult.data)) {
          rows = fallbackResult.data;

          const mismatchedIds = uniqueStrings(
            rows
              .filter((row) => safeString((row as { user_id?: unknown }).user_id) !== uid)
              .map((row) => safeString((row as { id?: unknown }).id))
          );

          if (mismatchedIds.length > 0) {
            const repair = await supabaseAdmin
              .from('project_costs')
              .update({ user_id: uid })
              .in('id', mismatchedIds)
              .select('*');

            if (!repair.error && Array.isArray(repair.data)) {
              const repairedById = new Map(
                repair.data.map((row) => [safeString((row as { id?: unknown }).id), row])
              );
              rows = rows.map((row) => {
                const id = safeString((row as { id?: unknown }).id);
                return repairedById.get(id) || row;
              });
            }
          }
        }
      }
    }

    // Local-dev safety net: if user scoping still yields nothing, expose existing rows
    // so costs don't appear "lost" while auth/session identity is being debugged.
    if (rows.length === 0 && process.env.NODE_ENV !== 'production') {
      const devFallback = await supabaseAdmin
        .from('project_costs')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200);

      if (!devFallback.error && Array.isArray(devFallback.data)) {
        rows = devFallback.data;
      }
    }

    const mappedRows = rows.map((row) => mapProjectCostRow(row));
    return NextResponse.json({ ok: true, data: mappedRows }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon kosten niet laden.';
    return NextResponse.json(
      { ok: false, message },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}
