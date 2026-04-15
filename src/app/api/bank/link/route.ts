import { NextResponse } from 'next/server';
import { z } from 'zod';

import { noStoreHeaders, resolveBankIdentity } from '@/lib/bank-api-auth';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import {
  createAgreement,
  createRequisition,
  getBankProviderSettings,
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

    const providerSettings = getBankProviderSettings();
    const reference = crypto.randomUUID();
    const redirectTarget = new URL(providerSettings.redirectUri);
    redirectTarget.searchParams.set('ref', reference);
    const agreementId = await createAgreement({
      institutionId: parsed.data.institutionId,
      maxHistoricalDays: providerSettings.maxTransactionDays,
    });
    const requisition = await createRequisition({
      institutionId: parsed.data.institutionId,
      reference,
      agreementId,
      redirectUrl: redirectTarget.toString(),
    });

    const upsertResult = await supabaseAdmin
      .from('bank_connections')
      .upsert(
        {
          user_id: identity.bankUserId,
          provider: 'gocardless',
          institution_id: parsed.data.institutionId,
          institution_name: parsed.data.institutionName || null,
          requisition_id: requisition.id,
          agreement_id: agreementId,
          status: 'pending',
          reference,
          linked_account_ids: [],
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'requisition_id',
        }
      )
      .select('id')
      .single();

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
          redirectUrl: requisition.link,
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

