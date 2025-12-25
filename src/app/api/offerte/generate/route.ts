import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, cert, getApps } from 'firebase-admin/app';

function initAdmin() {
  if (getApps().length) return;

  const json = process.env.FIREBASE_ADMIN_JSON;
  if (!json) throw new Error('FIREBASE_ADMIN_JSON ontbreekt');

  initializeApp({
    credential: cert(JSON.parse(json)),
  });
}

function leesBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7).trim();
  return token.length ? token : null;
}

async function fetchMetTimeout(url: string, options: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function POST(req: Request) {
  try {
    // 1) Body lezen
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Body is geen geldige JSON' }, { status: 400 });
    }

    const quoteId = body?.quoteId;
    if (!quoteId || typeof quoteId !== 'string') {
      return NextResponse.json({ error: 'quoteId ontbreekt' }, { status: 400 });
    }

    // extras is optioneel (transport/materieel/winstmarge)
    const extras = body?.extras ?? null;

    // 2) n8n config
    const n8nUrl = process.env.N8N_WEBHOOK_URL;
    const n8nSecret = process.env.N8N_HEADER_SECRET;

    if (!n8nUrl || !n8nSecret) {
      return NextResponse.json(
        { error: 'Server config ontbreekt (N8N_WEBHOOK_URL of N8N_HEADER_SECRET)' },
        { status: 500 }
      );
    }

    // 3) Auth: in DEV bypass, in PROD verplicht
    const devBypass = process.env.NODE_ENV !== 'production';

    let uid = 'dev-user';
    if (!devBypass) {
      const token = leesBearerToken(req);
      if (!token) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

      initAdmin();

      try {
        const d = await getAuth().verifyIdToken(token);
        uid = d.uid;
      } catch (e: any) {
        return NextResponse.json(
          { error: 'Ongeldige token', detail: String(e?.message || e) },
          { status: 401 }
        );
      }
    }

    // 4) Call n8n (met server-only secret header)
    const payload = {
      quoteId,
      uid,
      extras,
      triggeredAt: new Date().toISOString(),
    };

    let n8nRes: Response;
    try {
      n8nRes = await fetchMetTimeout(
        n8nUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-offertehulp-secret': n8nSecret,
          },
          body: JSON.stringify(payload),
        },
        20_000
      );
    } catch (e: any) {
      const msg =
        e?.name === 'AbortError'
          ? 'Timeout: n8n reageert niet binnen 20s'
          : `n8n fetch fout: ${String(e?.message || e)}`;

      return NextResponse.json({ error: 'n8n onbereikbaar', detail: msg }, { status: 502 });
    }

    const text = await n8nRes.text().catch(() => '');

    if (!n8nRes.ok) {
      return NextResponse.json(
        {
          error: 'n8n gaf een foutstatus',
          status: n8nRes.status,
          body: text.slice(0, 2000),
        },
        { status: 502 }
      );
    }

    // 5) Succes: probeer JSON, anders plain text
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    return NextResponse.json({ ok: true, quoteId, uid, n8n: data, devBypass }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Server fout', detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
