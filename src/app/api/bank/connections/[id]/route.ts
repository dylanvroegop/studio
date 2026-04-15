import { NextResponse } from 'next/server';
import { z } from 'zod';

import { noStoreHeaders, resolveBankIdentity } from '@/lib/bank-api-auth';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramSchema = z.object({
  id: z.string().uuid(),
});

export async function DELETE(request: Request, context: { params: { id: string } }) {
  try {
    const identity = await resolveBankIdentity(request);
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(identity.firebaseUid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }

    const parsed = paramSchema.safeParse(context.params);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: 'Ongeldige bankkoppeling.' },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const result = await supabaseAdmin
      .from('bank_connections')
      .update({
        status: 'revoked',
        linked_account_ids: [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.id)
      .eq('user_id', identity.bankUserId);

    if (result.error) {
      return NextResponse.json(
        { ok: false, message: 'Kon bankkoppeling niet verbreken.' },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    return NextResponse.json(
      { ok: true },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon bankkoppeling niet verbreken.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { ok: false, message },
      { status, headers: noStoreHeaders() }
    );
  }
}

