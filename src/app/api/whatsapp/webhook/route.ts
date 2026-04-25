import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getVerifyToken(): string {
  return (
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim()
    || 'calvora_test_123'
  );
}

// Meta webhook verification
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode') || '';
  const token = url.searchParams.get('hub.verify_token') || '';
  const challenge = url.searchParams.get('hub.challenge') || '';

  if (mode === 'subscribe' && token === getVerifyToken()) {
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json(
    { ok: false, message: 'Webhook verification failed' },
    { status: 403 }
  );
}

// Meta message/status callbacks
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  console.log('[whatsapp-webhook] incoming:', JSON.stringify(body));
  return NextResponse.json({ ok: true });
}
