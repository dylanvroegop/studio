import type { DecodedIdToken } from 'firebase-admin/auth';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';

const DEFAULT_ERROR_WEBHOOK_URL = 'https://n8n.dylan8n.org/webhook/error_calvora';
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

type AlertSeverity = 'warning' | 'error' | 'critical';

interface GoogleCalendarAlertInput {
  firestore: Firestore;
  userRef: DocumentReference;
  decoded: Pick<DecodedIdToken, 'uid' | 'email'> & { name?: unknown };
  source: string;
  title: string;
  message: string;
  code: string;
  severity?: AlertSeverity;
  context?: unknown;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getWebhookUrl(): string {
  return process.env.N8N_ERROR_WEBHOOK_URL?.trim() || DEFAULT_ERROR_WEBHOOK_URL;
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
    return String(input).slice(0, 4000);
  }
}

function timestampToMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return 0;
}

function renderTelegramText(input: {
  title: string;
  message: string;
  source: string;
  severity: AlertSeverity;
  code: string;
  uid: string;
  email: string | null;
}): string {
  return [
    '[ERROR] Calvora Google Calendar',
    `Titel: ${input.title}`,
    `Bron: ${input.source}`,
    `Code: ${input.code}`,
    `Severity: ${input.severity}`,
    `Melding: ${input.message}`,
    '',
    'Gebruiker',
    `UID: ${input.uid}`,
    `Email: ${input.email || '-'}`,
  ].join('\n');
}

export async function reportGoogleCalendarAlert(input: GoogleCalendarAlertInput): Promise<void> {
  try {
    const severity = input.severity || 'error';
    const userSnap = await input.userRef.get().catch(() => null);
    const googleCalendar = userSnap?.data()?.integrations?.googleCalendar as {
      lastFailureAlertAt?: unknown;
      lastFailureAlertCode?: unknown;
    } | undefined;
    const previousCode = normalizeString(googleCalendar?.lastFailureAlertCode);
    const previousAt = timestampToMillis(googleCalendar?.lastFailureAlertAt);
    const now = Date.now();

    if (previousCode === input.code && previousAt > 0 && now - previousAt < ALERT_COOLDOWN_MS) {
      return;
    }

    await input.userRef.set({
      integrations: {
        googleCalendar: {
          lastFailureAlertAt: Timestamp.fromMillis(now),
          lastFailureAlertCode: input.code,
          lastFailureAlertSource: input.source,
          lastFailureAlertMessage: input.message,
        },
      },
    }, { merge: true });

    const webhookSecret = process.env.N8N_HEADER_SECRET?.trim() || null;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (webhookSecret) {
      headers['x-offertehulp-secret'] = webhookSecret;
    }

    const payload = {
      event: 'google_calendar_sync_failure',
      app: {
        name: 'Calvora',
        env: process.env.NODE_ENV || 'unknown',
      },
      title: input.title,
      message: input.message,
      source: input.source,
      severity,
      code: input.code,
      context: sanitizeContext(input.context),
      serverTimestamp: new Date(now).toISOString(),
      user: {
        uid: input.decoded.uid,
        email: normalizeString(input.decoded.email),
        name: normalizeString(input.decoded.name),
      },
      telegramText: renderTelegramText({
        title: input.title,
        message: input.message,
        source: input.source,
        severity,
        code: input.code,
        uid: input.decoded.uid,
        email: normalizeString(input.decoded.email),
      }),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(getWebhookUrl(), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('Google Calendar alert webhook failed', {
        status: response.status,
        bodyPreview: body.slice(0, 500),
      });
    }
  } catch (error) {
    console.error('Google Calendar alert failed', error);
  }
}
