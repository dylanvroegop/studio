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

function extractAiOutput(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;

  const row = result as {
    output?: unknown;
    content?: unknown;
  };

  if (typeof row.output === 'string' && row.output.trim()) {
    return row.output;
  }

  const contentObject =
    row.content && typeof row.content === 'object'
      ? row.content as { parts?: Array<{ text?: unknown }> }
      : null;
  const firstPart = Array.isArray(contentObject?.parts) ? contentObject.parts[0] : null;
  if (firstPart && typeof firstPart.text === 'string' && firstPart.text.trim()) {
    return firstPart.text;
  }

  // Some n8n field mappings stringify the whole content object.
  if (typeof row.content === 'string' && row.content.trim()) {
    try {
      const parsed = JSON.parse(row.content) as { parts?: Array<{ text?: unknown }> };
      const parsedFirstPart = Array.isArray(parsed.parts) ? parsed.parts[0] : null;
      if (parsedFirstPart && typeof parsedFirstPart.text === 'string' && parsedFirstPart.text.trim()) {
        return parsedFirstPart.text;
      }
    } catch {
      // Ignore invalid JSON content strings and continue fallback.
    }
  }

  return null;
}

function parseGeneratedEmail(aiOutput: string): { onderwerp: string; body: string } {
  const fallback = { onderwerp: '', body: aiOutput };

  const tryParse = (value: string): { onderwerp: string; body: string } | null => {
    try {
      const parsed = JSON.parse(value) as { onderwerp?: unknown; body?: unknown };
      const onderwerp = typeof parsed.onderwerp === 'string' ? parsed.onderwerp : '';
      const body = typeof parsed.body === 'string' ? parsed.body : aiOutput;
      return { onderwerp, body };
    } catch {
      return null;
    }
  };

  const direct = tryParse(aiOutput);
  if (direct) return direct;

  const firstCurly = aiOutput.indexOf('{');
  const lastCurly = aiOutput.lastIndexOf('}');
  if (firstCurly !== -1 && lastCurly > firstCurly) {
    const embedded = aiOutput.slice(firstCurly, lastCurly + 1);
    const parsedEmbedded = tryParse(embedded);
    if (parsedEmbedded) return parsedEmbedded;
  }

  return fallback;
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
    const aiOutput = extractAiOutput(result);

    if (!aiOutput) {
      return NextResponse.json({ error: 'No output in webhook response' }, { status: 502 });
    }
    const generated = parseGeneratedEmail(aiOutput);
    return NextResponse.json(generated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate email text';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
