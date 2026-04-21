import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_TEST_WEBHOOK_URL =
  'https://n8n.srv1553475.hstgr.cloud/webhook-test/74ff67bd-df68-4e92-8238-72ea9d367d37';

function getWebhookUrl(): string {
  const candidates = [
    process.env.N8N_SUPPLIER_IMPORT_WEBHOOK_URL,
    process.env.N8N_FIRECRAWL_WEBHOOK_URL,
    DEFAULT_TEST_WEBHOOK_URL,
  ];

  const found = candidates.find((value) => (value || '').trim().length > 0)?.trim();
  if (!found) {
    throw new Error(
      'ENV ontbreekt: zet N8N_SUPPLIER_IMPORT_WEBHOOK_URL (of N8N_FIRECRAWL_WEBHOOK_URL).'
    );
  }
  return found;
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Geen Bearer token.' }, { status: 401 });
    }

    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded?.uid;
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Ongeldig token.' }, { status: 401 });
    }

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const body = await req.json().catch(() => ({}));
    const webhookUrl = getWebhookUrl();
    const webhookSecret = (process.env.N8N_HEADER_SECRET || '').trim();

    const payload = {
      event: 'supplier_import_manual_trigger',
      userId: uid,
      source: typeof body?.source === 'string' ? body.source : 'materialen_page_button',
      createdAt: new Date().toISOString(),
    };

    const webhookRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(webhookSecret ? { 'x-offertehulp-secret': webhookSecret } : {}),
      },
      body: JSON.stringify(payload),
    });

    const webhookText = await webhookRes.text();
    if (!webhookRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: `Webhook faalde (${webhookRes.status}).`,
          detail: webhookText.slice(0, 1200),
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, message: 'Webhook gestart.' });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || 'Onbekende fout bij webhook trigger.' },
      { status: 500 }
    );
  }
}
