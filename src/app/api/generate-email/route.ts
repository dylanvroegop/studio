import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getWebhookUrl(): string | null {
  const url = (
    process.env.N8N_GENERATE_EMAIL_WEBHOOK_URL
    || process.env.NEXT_PUBLIC_N8N_GENERATE_EMAIL_WEBHOOK
    || ''
  ).trim();
  return url || null;
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { auth } = initFirebaseAdmin();
    try {
      const decoded = await auth.verifyIdToken(token);
      const trialBlockedResponse = await ensureDemoTrialActiveByUid(decoded.uid);
      if (trialBlockedResponse) return trialBlockedResponse;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const webhookUrl = getWebhookUrl();
    if (!webhookUrl) {
      return NextResponse.json({ error: 'Webhook URL is not configured' }, { status: 500 });
    }

    const webhookSecret = process.env.N8N_HEADER_SECRET?.trim();
    if (!webhookSecret) {
      return NextResponse.json({ error: 'N8N_HEADER_SECRET is not configured' }, { status: 500 });
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-offertehulp-secret': webhookSecret,
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        { error: 'Email generation webhook failed' },
        { status: 502 }
      );
    }

    let parsedData: unknown;
    try {
      parsedData = JSON.parse(responseText);
    } catch {
      return NextResponse.json({ error: 'Invalid webhook response' }, { status: 502 });
    }

    const result =
      Array.isArray(parsedData) && parsedData.length > 0
        ? parsedData[0]
        : parsedData;
    const aiOutput =
      result && typeof result === 'object' && 'output' in result
        ? (result as { output?: unknown }).output
        : null;

    if (typeof aiOutput !== 'string' || !aiOutput.trim()) {
      return NextResponse.json({ error: 'No output in webhook response' }, { status: 502 });
    }

    let onderwerp = '';
    let emailBody = aiOutput;

    try {
      const parsedOutput = JSON.parse(aiOutput) as { onderwerp?: unknown; body?: unknown };
      if (typeof parsedOutput.onderwerp === 'string') onderwerp = parsedOutput.onderwerp;
      if (typeof parsedOutput.body === 'string') emailBody = parsedOutput.body;
    } catch {
      // If AI output is plain text instead of JSON, keep fallback values.
    }

    return NextResponse.json({ onderwerp, body: emailBody });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate email text';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
