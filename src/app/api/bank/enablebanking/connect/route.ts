import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { noStoreHeaders, resolveBankIdentity } from '@/lib/bank-api-auth';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { getEnableBankingRedirectUri, startAuthorization } from '@/lib/enable-banking/client';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const inputSchema = z.object({ institutionId: z.string().min(1).max(200).default('Knab') });

export async function POST(request: Request) {
  try {
    const identity = await resolveBankIdentity(request);
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(identity.firebaseUid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }
    const parsed = inputSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ ok: false, message: 'Kies eerst een bank.' }, { status: 400, headers: noStoreHeaders() });

    const state = randomUUID();
    const authorization = await startAuthorization({
      aspspName: parsed.data.institutionId,
      state,
      redirectUrl: getEnableBankingRedirectUri(),
      psuType: 'personal',
    });
    const insertResult = await supabaseAdmin.from('bank_connections').insert({
      user_id: identity.bankUserId,
      provider: 'enablebanking',
      link_ref: `enablebanking:${identity.bankUserId}:${state}`,
      requisition_id: `pending:${state}`,
      institution_id: parsed.data.institutionId,
      institution_name: parsed.data.institutionId,
      reference: state,
      status: 'pending',
      accounts: [],
      linked_account_ids: [],
      metadata: { source: 'enablebanking', bank: parsed.data.institutionId, authorizationId: authorization.authorizationId },
      updated_at: new Date().toISOString(),
    }).select('id').single();
    if (insertResult.error || !insertResult.data?.id) throw new Error(`Kon Knab-koppeling niet opslaan: ${insertResult.error?.message || 'onbekende fout'}`);
    return NextResponse.json({ ok: true, link: authorization.url }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Knab koppelen is mislukt.';
    return NextResponse.json({ ok: false, message }, { status: message === 'Unauthorized' ? 401 : 500, headers: noStoreHeaders() });
  }
}
