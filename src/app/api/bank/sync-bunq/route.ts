import { NextResponse } from 'next/server';
import { z } from 'zod';

import { noStoreHeaders, resolveBankIdentity } from '@/lib/bank-api-auth';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { syncAllTransactions } from '@/lib/bunq/sync';
import { normalizeBunqProfile } from '@/lib/bunq/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const inputSchema = z.object({
  profile: z.enum(['personal', 'business']).optional(),
});

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
    const profile = normalizeBunqProfile(parsed.success ? parsed.data.profile : 'personal');

    const result = await syncAllTransactions(identity.bankUserId, profile);

    return NextResponse.json(
      {
        ok: true,
        newCount: result.newCount,
        accountsSynced: result.accountsSynced,
        profile: result.profile,
      },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Synchroniseren met bunq is mislukt.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { ok: false, error: message },
      { status, headers: noStoreHeaders() }
    );
  }
}
