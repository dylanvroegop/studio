import { NextResponse } from 'next/server';
import { z } from 'zod';

import { noStoreHeaders, resolveBankIdentity } from '@/lib/bank-api-auth';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import {
  buildAuthRedirectUrl,
  ProviderNotConfiguredError,
  ProviderRequestError,
} from '@/lib/bank-provider-gocardless';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const inputSchema = z.object({
  institutionId: z.string().trim().min(1),
  institutionName: z.string().trim().max(200).optional(),
});

export async function POST(request: Request) {
  try {
    const identity = await resolveBankIdentity(request);
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(identity.firebaseUid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }

    const body = await request.json().catch(() => null);
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Ongeldige bankkeuze.' },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const reference = crypto.randomUUID();
    const redirectUrl = buildAuthRedirectUrl({
      state: reference,
      providerId: parsed.data.institutionId,
    });

    const existingConnection = await supabaseAdmin
      .from('bank_connections')
      .select('id')
      .eq('user_id', identity.bankUserId)
      .eq('institution_id', parsed.data.institutionId)
      .limit(1)
      .maybeSingle();

    let upsertResult;
    if (existingConnection.error) {
      return NextResponse.json(
        { ok: false, message: 'Kon bankkoppeling niet opslaan.' },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    if (existingConnection.data?.id) {
      upsertResult = await supabaseAdmin
        .from('bank_connections')
        .update({
          provider: 'truelayer',
          institution_name: parsed.data.institutionName || null,
          requisition_id: null,
          agreement_id: null,
          status: 'pending',
          reference,
          linked_account_ids: [],
          access_token: null,
          refresh_token: null,
          access_token_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingConnection.data.id)
        .select('id')
        .single();
    } else {
      upsertResult = await supabaseAdmin
        .from('bank_connections')
        .insert({
          user_id: identity.bankUserId,
          provider: 'truelayer',
          institution_id: parsed.data.institutionId,
          institution_name: parsed.data.institutionName || null,
          requisition_id: null,
          agreement_id: null,
          status: 'pending',
          reference,
          linked_account_ids: [],
          access_token: null,
          refresh_token: null,
          access_token_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();
    }

    if (upsertResult.error) {
      return NextResponse.json(
        { ok: false, message: 'Kon bankkoppeling niet opslaan.' },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          redirectUrl,
        },
      },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return NextResponse.json(
        { ok: false, message: 'Bankkoppeling is nog niet geconfigureerd in de serveromgeving.' },
        { status: 503, headers: noStoreHeaders() }
      );
    }
    if (error instanceof ProviderRequestError) {
      return NextResponse.json(
        { ok: false, message: 'Kon bankkoppeling niet starten. Probeer het opnieuw.' },
        { status: 502, headers: noStoreHeaders() }
      );
    }
    const message = error instanceof Error ? error.message : 'Kon bankkoppeling niet starten.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status, headers: noStoreHeaders() });
  }
}
