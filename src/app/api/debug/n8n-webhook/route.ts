import { createHash } from 'crypto';

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_WEBHOOK_HOSTS = new Set([
  'n8n.srv1553475.hstgr.cloud',
]);

function redactHeaders(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.includes('authorization') || normalizedKey.includes('secret') || normalizedKey.includes('token')) {
      output[key] = '[redacted]';
      return;
    }
    output[key] = value;
  });
  return output;
}

function parseWebhookUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') return null;
    if (!ALLOWED_WEBHOOK_HOSTS.has(url.hostname)) return null;
    if (!url.pathname.startsWith('/webhook')) return null;
    return url;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const secret = process.env.N8N_HEADER_SECRET?.trim() || '';
  if (!secret) {
    return NextResponse.json(
      { ok: false, message: 'N8N_HEADER_SECRET ontbreekt in de app environment.' },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Ongeldige JSON body.' }, { status: 400 });
  }

  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const webhookUrl = parseWebhookUrl(input.webhookUrl);
  if (!webhookUrl) {
    return NextResponse.json(
      {
        ok: false,
        message: 'Gebruik een geldige n8n webhook URL op n8n.srv1553475.hstgr.cloud.',
      },
      { status: 400 }
    );
  }

  const payload = {
    source: 'calvora_debug_page',
    sentAt: new Date().toISOString(),
    note: 'Debug request from Calvora app to inspect received header auth in n8n.',
  };

  const startedAt = Date.now();
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-offertehulp-secret': secret,
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const responseText = await response.text();
    let responseJson: unknown = null;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = null;
    }

    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      durationMs: Date.now() - startedAt,
      sent: {
        url: webhookUrl.toString(),
        method: 'POST',
        headerName: 'x-offertehulp-secret',
        secretLength: secret.length,
        secretSha256Prefix: createHash('sha256').update(secret).digest('hex').slice(0, 12),
        payload,
      },
      received: {
        headers: redactHeaders(response.headers),
        body: responseJson ?? responseText,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Webhook request mislukt.',
        sent: {
          url: webhookUrl.toString(),
          method: 'POST',
          headerName: 'x-offertehulp-secret',
          secretLength: secret.length,
          secretSha256Prefix: createHash('sha256').update(secret).digest('hex').slice(0, 12),
          payload,
        },
      },
      { status: 502 }
    );
  }
}
