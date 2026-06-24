/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function bepaalUid(req: Request): Promise<string> {
  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) throw new Error('Geen Bearer token in Authorization header');

  const { auth } = initFirebaseAdmin();
  const decoded = await auth.verifyIdToken(token);
  if (!decoded?.uid) throw new Error('UID ontbreekt in token');
  return decoded.uid;
}

export async function POST(req: Request) {
  try {
    const uid = await bepaalUid(req);
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const { count: totalBeforeDelete, error: countError } = await supabaseAdmin
      .from('main_material_list')
      .select('row_id', { count: 'exact', head: true })
      .eq('gebruikerid', uid)
      .eq('is_active', true);

    if (countError) {
      return NextResponse.json(
        { ok: false, message: countError.message || 'Kon aantal materialen niet bepalen.' },
        { status: 500 }
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from('main_material_list')
      .delete()
      .eq('gebruikerid', uid)
      .eq('is_active', true);

    if (deleteError) {
      return NextResponse.json(
        { ok: false, message: deleteError.message || 'Kon materialen niet verwijderen.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      deletedCount: totalBeforeDelete ?? 0,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || 'Onbekende serverfout' },
      { status: 500 }
    );
  }
}
