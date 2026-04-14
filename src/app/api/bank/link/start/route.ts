import { NextResponse } from 'next/server';

import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { noStoreHeaders, resolveUid } from '@/lib/bank-api-auth';
import { createRequisition } from '@/lib/bank-provider-gocardless';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: Request) {
  try {
    const uid = await resolveUid(request);
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const institutionId = safeString(body?.institution_id);
    const institutionName = safeString(body?.institution_name) || null;
    if (!institutionId) {
      return NextResponse.json(
        { ok: false, message: 'Kies eerst een bank om te koppelen.' },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const ref = crypto.randomUUID();
    const url = new URL(request.url);
    const redirectUrl = `${url.origin}/api/bank/link/callback`;
    const requisition = await createRequisition({
      institutionId,
      reference: ref,
      redirectUrl,
    });

    const upsert = await supabaseAdmin
      .from('bank_connections')
      .upsert(
        {
          user_id: uid,
          provider: 'gocardless',
          link_ref: ref,
          requisition_id: requisition.id,
          institution_id: institutionId,
          institution_name: institutionName,
          status: 'pending',
          accounts: [],
          metadata: {},
          last_error: null,
        },
        { onConflict: 'requisition_id' }
      )
      .select('id,requisition_id,link_ref,status')
      .single();

    if (upsert.error) {
      return NextResponse.json(
        { ok: false, message: upsert.error.message },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          requisition_id: requisition.id,
          link: requisition.link,
          ref,
          connection_id: upsert.data.id,
        },
      },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon bankkoppeling niet starten.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { ok: false, message },
      { status, headers: noStoreHeaders() }
    );
  }
}

