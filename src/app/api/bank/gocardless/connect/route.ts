import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { noStoreHeaders, resolveBankIdentity } from '@/lib/bank-api-auth';
import { createEndUserAgreement, createRequisition, getGoCardlessRedirectUri } from '@/lib/gocardless-bank-data/client';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const inputSchema = z.object({ institutionId: z.string().min(1).max(200) });

export async function POST(request: Request) {
  try {
    const identity = await resolveBankIdentity(request);
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(identity.firebaseUid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }

    const body = await request.json().catch(() => ({}));
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: 'Kies eerst een bank.' }, { status: 400, headers: noStoreHeaders() });
    }

    const state = randomUUID();
    const agreement = await createEndUserAgreement({ institutionId: parsed.data.institutionId });
    const redirectBase = getGoCardlessRedirectUri();
    const redirectUri = `${redirectBase}${redirectBase.includes('?') ? '&' : '?'}state=${encodeURIComponent(state)}`;
    const requisition = await createRequisition({
      institutionId: parsed.data.institutionId,
      agreementId: agreement.id,
      reference: state,
      redirectUri,
    });

    const existing = await supabaseAdmin
      .from('bank_connections')
      .select('id')
      .eq('provider', 'gocardless')
      .eq('user_id', identity.bankUserId)
      .eq('reference', state)
      .maybeSingle();
    if (existing.error) throw new Error(`Kon bestaande koppeling niet controleren: ${existing.error.message}`);

    const insertResult = await supabaseAdmin
      .from('bank_connections')
      .insert({
        user_id: identity.bankUserId,
        provider: 'gocardless',
        link_ref: `gocardless:${identity.bankUserId}:${state}`,
        requisition_id: requisition.id,
        institution_id: parsed.data.institutionId,
        institution_name: 'Knab',
        agreement_id: agreement.id,
        reference: state,
        status: 'pending',
        accounts: [],
        linked_account_ids: [],
        metadata: { source: 'gocardless-bank-account-data', bank: 'knab' },
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (insertResult.error || !insertResult.data?.id) {
      throw new Error(`Kon Knab-koppeling niet opslaan: ${insertResult.error?.message || 'onbekende fout'}`);
    }

    return NextResponse.json({ ok: true, requisitionId: requisition.id, link: requisition.link }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Knab koppelen is mislukt.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status, headers: noStoreHeaders() });
  }
}
