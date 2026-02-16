import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AuthContext = {
  uid: string;
  email: string | null;
  name: string | null;
};

type UserDocData = {
  email?: string;
  telefoon?: string;
  displayName?: string;
  settings?: {
    email?: string;
    telefoon?: string;
    bedrijfsnaam?: string;
  };
};

function krijgFirebaseAdminApp() {
  if (admin.apps.length > 0) return admin.app();
  const projectId =
    process.env.FIREBASE_PROJECT_ID
    || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    || 'studio-6011690104-60fbf';
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });
}

async function leesBodyVeilig(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const raw = await req.json();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return raw as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function bepaalAuthContext(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error('Geen Bearer token in Authorization header.');

  const token = match[1];
  const app = krijgFirebaseAdminApp();
  const decoded = await admin.auth(app).verifyIdToken(token);

  if (!decoded?.uid) throw new Error('UID ontbreekt in token.');

  return {
    uid: decoded.uid,
    email: normalizeString(decoded.email) || null,
    name: normalizeString(decoded.name) || null,
  };
}

function getRequiredEnvVar(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`ENV ontbreekt: ${key}`);
  return value;
}

function toonOfStreep(value: string | null): string {
  return value && value.trim().length > 0 ? value : '-';
}

export async function POST(req: Request) {
  try {
    const auth = await bepaalAuthContext(req);
    const body = await leesBodyVeilig(req);
    if (!body) {
      return NextResponse.json(
        { ok: false, message: 'Body is geen geldige JSON.' },
        { status: 400 }
      );
    }

    const bericht = normalizeString(body.bericht);
    if (!bericht) {
      return NextResponse.json(
        { ok: false, message: 'Feedbackbericht ontbreekt.' },
        { status: 400 }
      );
    }

    const webhookUrl = getRequiredEnvVar('N8N_FEEDBACK_WEBHOOK_URL');
    const webhookSecret = getRequiredEnvVar('N8N_HEADER_SECRET');

    const firestore = admin.firestore(krijgFirebaseAdminApp());
    const userSnap = await firestore.collection('users').doc(auth.uid).get();
    const userData: UserDocData = userSnap.exists ? (userSnap.data() as UserDocData) : {};

    const email =
      auth.email ||
      normalizeString(userData.settings?.email) ||
      normalizeString(userData.email) ||
      null;
    const telefoon =
      normalizeString(userData.settings?.telefoon) ||
      normalizeString(userData.telefoon) ||
      null;
    const naam =
      normalizeString(userData.settings?.bedrijfsnaam) ||
      normalizeString(userData.displayName) ||
      auth.name ||
      null;

    const feedbackRef = await firestore.collection('support_feedback').add({
      userId: auth.uid,
      bericht,
      bron: 'feedback_page',
      status: 'nieuw',
      afzenderNaam: naam,
      afzenderEmail: email,
      afzenderTelefoon: telefoon,
      n8nStatus: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const webhookPayload = {
      event: 'feedback_submitted',
      feedbackId: feedbackRef.id,
      bron: 'feedback_page',
      userId: auth.uid,
      bericht,
      afzender: {
        naam,
        email,
        telefoon,
      },
      telegramText: [
        '👤 Klant Informatie',
        `Naam: ${toonOfStreep(naam)}`,
        `Email: ${toonOfStreep(email)}`,
        `Telefoon: ${toonOfStreep(telefoon)}`,
        `Feedback ID: ${feedbackRef.id}`,
        '',
        '-------------------------',
        '',
        bericht,
      ].join('\n'),
      verstuurdOp: new Date().toISOString(),
    };

    let webhookResponse: Response;
    let webhookBody = '';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      webhookResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-offertehulp-secret': webhookSecret,
        },
        body: JSON.stringify(webhookPayload),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
      webhookBody = await webhookResponse.text();
    } catch (webhookError) {
      await feedbackRef.update({
        n8nStatus: 'failed',
        n8nResponse: String(webhookError).slice(0, 1200),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return NextResponse.json(
        {
          ok: false,
          feedbackId: feedbackRef.id,
          message: 'Feedback opgeslagen, maar Telegram melding via n8n mislukte.',
        },
        { status: 502 }
      );
    }

    if (!webhookResponse.ok) {
      await feedbackRef.update({
        n8nStatus: 'failed',
        n8nStatusCode: webhookResponse.status,
        n8nResponse: webhookBody.slice(0, 1200),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return NextResponse.json(
        {
          ok: false,
          feedbackId: feedbackRef.id,
          message: 'Feedback opgeslagen, maar Telegram melding via n8n mislukte.',
        },
        { status: 502 }
      );
    }

    await feedbackRef.update({
      n8nStatus: 'sent',
      n8nStatusCode: webhookResponse.status,
      n8nResponse: webhookBody.slice(0, 1200),
      notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, feedbackId: feedbackRef.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Onbekende serverfout.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
