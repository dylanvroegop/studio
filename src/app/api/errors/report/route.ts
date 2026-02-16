import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_ERROR_WEBHOOK_URL = 'https://n8n.dylan8n.org/webhook/error_calvora';

type UserProfile = {
  uid: string;
  email: string | null;
  naam: string | null;
  telefoon: string | null;
  bedrijfsnaam: string | null;
};

function readPathString(obj: Record<string, unknown>, path: string[]): string | null {
  let current: unknown = obj;
  for (const segment of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return normalizeString(current);
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function toPreview(value: unknown, max = 1200): string {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.slice(0, max);
}

function sanitizeContext(input: unknown): unknown {
  if (input == null) return null;

  try {
    const json = JSON.stringify(input);
    if (!json) return null;
    if (json.length <= 4000) return JSON.parse(json);
    return {
      truncated: true,
      preview: json.slice(0, 4000),
    };
  } catch {
    return toPreview(input, 4000);
  }
}

function getWebhookUrl(): string {
  return process.env.N8N_ERROR_WEBHOOK_URL?.trim() || DEFAULT_ERROR_WEBHOOK_URL;
}

async function resolveUserProfile(
  uid: string,
  emailClaim: string | null,
  nameClaim: string | null
): Promise<UserProfile> {
  const { firestore } = initFirebaseAdmin();

  const [userSnap, businessSnap] = await Promise.all([
    firestore.collection('users').doc(uid).get().catch(() => null),
    firestore.collection('businesses').doc(uid).get().catch(() => null),
  ]);

  const userData = userSnap?.exists ? (userSnap.data() as Record<string, unknown>) : {};
  const businessData = businessSnap?.exists ? (businessSnap.data() as Record<string, unknown>) : {};

  const email =
    emailClaim ||
    readPathString(userData, ['settings', 'email']) ||
    readPathString(userData, ['email']) ||
    readPathString(businessData, ['email']) ||
    null;

  const bedrijfsnaam =
    readPathString(userData, ['settings', 'bedrijfsnaam']) ||
    readPathString(businessData, ['bedrijfsnaam']) ||
    null;

  const naam =
    readPathString(userData, ['displayName']) ||
    readPathString(userData, ['settings', 'contactNaam']) ||
    readPathString(businessData, ['contactNaam']) ||
    nameClaim ||
    bedrijfsnaam ||
    null;

  const telefoon =
    readPathString(userData, ['settings', 'telefoon']) ||
    readPathString(userData, ['telefoon']) ||
    readPathString(businessData, ['telefoon']) ||
    null;

  return {
    uid,
    email,
    naam,
    telefoon,
    bedrijfsnaam,
  };
}

function renderTelegramText(payload: {
  title: string;
  message: string;
  source: string;
  severity: string;
  route: string | null;
  url: string | null;
  user: UserProfile;
}): string {
  const show = (value: string | null) => (value && value.trim() ? value : '-');

  return [
    '[ERROR] OfferteHulp',
    `Titel: ${payload.title}`,
    `Bron: ${payload.source}`,
    `Severity: ${payload.severity}`,
    `Melding: ${payload.message}`,
    '',
    'Gebruiker',
    `UID: ${payload.user.uid}`,
    `Naam: ${show(payload.user.naam)}`,
    `Bedrijf: ${show(payload.user.bedrijfsnaam)}`,
    `Email: ${show(payload.user.email)}`,
    `Telefoon: ${show(payload.user.telefoon)}`,
    '',
    'Context',
    `Route: ${show(payload.route)}`,
    `URL: ${show(payload.url)}`,
  ].join('\n');
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { auth } = initFirebaseAdmin();
    let decoded: Awaited<ReturnType<typeof auth.verifyIdToken>>;
    try {
      decoded = await auth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ ok: false, message: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ ok: false, message: 'Invalid JSON body' }, { status: 400 });
    }

    const title = normalizeString(body.title) || 'Onbekende fout';
    const message = normalizeString(body.message) || 'Geen foutmelding opgegeven.';
    const source = normalizeString(body.source) || 'unknown';
    const severity = normalizeString(body.severity) || 'error';
    const route = normalizeString(body.route);
    const url = normalizeString(body.url);

    const user = await resolveUserProfile(
      decoded.uid,
      normalizeString(decoded.email),
      normalizeString(decoded.name)
    );

    const payload = {
      event: 'offertehulp_error',
      title,
      message,
      source,
      severity,
      route,
      url,
      context: sanitizeContext(body.context),
      clientTimestamp: normalizeString(body.clientTimestamp),
      serverTimestamp: new Date().toISOString(),
      app: {
        name: 'OfferteHulp',
        env: process.env.NODE_ENV || 'unknown',
      },
      request: {
        ip: normalizeString(request.headers.get('x-forwarded-for')),
        userAgent:
          normalizeString(request.headers.get('user-agent')) ||
          normalizeString(body.userAgent),
      },
      user,
    };

    const webhookUrl = getWebhookUrl();
    const webhookSecret = process.env.N8N_HEADER_SECRET?.trim();

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (webhookSecret) {
      headers['x-offertehulp-secret'] = webhookSecret;
    }

    const webhookPayload = {
      ...payload,
      telegramText: renderTelegramText({
        title,
        message,
        source,
        severity,
        route,
        url,
        user,
      }),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(webhookPayload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const webhookBody = await webhookResponse.text().catch(() => '');
    if (!webhookResponse.ok) {
      console.error('Error webhook failed', {
        webhookUrl,
        status: webhookResponse.status,
        bodyPreview: webhookBody.slice(0, 400),
      });
      return NextResponse.json(
        {
          ok: false,
          message: 'Error webhook failed',
          status: webhookResponse.status,
          body: webhookBody.slice(0, 1200),
          webhookUrl,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Onbekende serverfout.';
    console.error('Error reporting route crashed', { message });
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
