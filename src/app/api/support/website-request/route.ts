import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AuthContext = {
  uid: string;
  email: string | null;
  name: string | null;
};

type WebsiteRequestBody = {
  contactNaam: string;
  bedrijfsnaam: string | null;
  telefoon: string;
  email: string;
  websiteType: string;
  projectBeschrijving: string;
  budgetRange: string | null;
  extraWensen: string | null;
  contactVoorkeur: 'call_anytime' | 'plan_appointment';
  afspraakDatum: string | null;
  afspraakTijd: string | null;
  betaaldeDienstBevestigd: boolean;
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

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDash(value: string | null): string {
  return value && value.trim().length > 0 ? value : '-';
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const value = await req.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function determineAuth(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error('Geen Bearer token in Authorization header.');

  const token = match[1];
  const app = krijgFirebaseAdminApp();
  const decoded = await admin.auth(app).verifyIdToken(token);
  if (!decoded?.uid) throw new Error('UID ontbreekt in token.');

  return {
    uid: decoded.uid,
    email: normalizeString(decoded.email),
    name: normalizeString(decoded.name),
  };
}

function buildBody(raw: Record<string, unknown>): WebsiteRequestBody | null {
  const contactVoorkeurRaw = normalizeString(raw.contactVoorkeur) || 'call_anytime';
  const contactVoorkeur =
    contactVoorkeurRaw === 'plan_appointment' ? 'plan_appointment' : 'call_anytime';

  const body: WebsiteRequestBody = {
    contactNaam: normalizeString(raw.contactNaam) || '',
    bedrijfsnaam: normalizeString(raw.bedrijfsnaam),
    telefoon: normalizeString(raw.telefoon) || '',
    email: normalizeString(raw.email) || '',
    websiteType: normalizeString(raw.websiteType) || '',
    projectBeschrijving: normalizeString(raw.projectBeschrijving) || '',
    budgetRange: normalizeString(raw.budgetRange),
    extraWensen: normalizeString(raw.extraWensen),
    contactVoorkeur,
    afspraakDatum: normalizeString(raw.afspraakDatum),
    afspraakTijd: normalizeString(raw.afspraakTijd),
    betaaldeDienstBevestigd: raw.betaaldeDienstBevestigd === true,
  };

  if (
    !body.contactNaam
    || !body.telefoon
    || !body.email
    || !body.websiteType
    || !body.projectBeschrijving
    || !body.betaaldeDienstBevestigd
  ) {
    return null;
  }

  if (body.contactVoorkeur === 'plan_appointment' && (!body.afspraakDatum || !body.afspraakTijd)) {
    return null;
  }

  return body;
}

function getOptionalEnv(key: string): string | null {
  const value = process.env[key]?.trim();
  return value || null;
}

export async function POST(req: Request) {
  try {
    const auth = await determineAuth(req);
    const rawBody = await readJson(req);
    if (!rawBody) {
      return NextResponse.json(
        { ok: false, message: 'Body is geen geldige JSON.' },
        { status: 400 }
      );
    }

    const body = buildBody(rawBody);
    if (!body) {
      return NextResponse.json(
        { ok: false, message: 'Aanvraag is onvolledig of ongeldig.' },
        { status: 400 }
      );
    }

    const firestore = admin.firestore(krijgFirebaseAdminApp());
    const userSnap = await firestore.collection('users').doc(auth.uid).get();
    const userData = userSnap.exists
      ? (userSnap.data() as {
          settings?: {
            bedrijfsnaam?: string;
            email?: string;
            telefoon?: string;
            contactNaam?: string;
          };
          displayName?: string;
          email?: string;
          telefoon?: string;
        })
      : {};

    const contactNaam =
      body.contactNaam
      || normalizeString(userData.settings?.contactNaam)
      || normalizeString(userData.displayName)
      || auth.name
      || '';
    const bedrijfsnaam =
      body.bedrijfsnaam
      || normalizeString(userData.settings?.bedrijfsnaam)
      || null;
    const email =
      body.email
      || normalizeString(userData.settings?.email)
      || normalizeString(userData.email)
      || auth.email
      || '';
    const telefoon =
      body.telefoon
      || normalizeString(userData.settings?.telefoon)
      || normalizeString(userData.telefoon)
      || '';

    const afspraakLabel =
      body.contactVoorkeur === 'plan_appointment'
        ? `${toDash(body.afspraakDatum)} om ${toDash(body.afspraakTijd)}`
        : 'Niet van toepassing';

    const requestRef = await firestore.collection('website_build_requests').add({
      userId: auth.uid,
      status: 'nieuw',
      bron: 'website_laten_maken_page',
      contactNaam,
      bedrijfsnaam,
      email,
      telefoon,
      websiteType: body.websiteType,
      projectBeschrijving: body.projectBeschrijving,
      budgetRange: body.budgetRange,
      extraWensen: body.extraWensen,
      contactVoorkeur: body.contactVoorkeur,
      afspraakDatum: body.afspraakDatum,
      afspraakTijd: body.afspraakTijd,
      betaaldeDienstBevestigd: body.betaaldeDienstBevestigd,
      n8nStatus: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const webhookUrl = getOptionalEnv('N8N_WEBSITE_REQUEST_WEBHOOK_URL');
    const webhookSecret = getOptionalEnv('N8N_HEADER_SECRET');

    if (!webhookUrl) {
      await requestRef.update({
        n8nStatus: 'skipped',
        n8nResponse: 'N8N_WEBSITE_REQUEST_WEBHOOK_URL ontbreekt; melding overgeslagen.',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return NextResponse.json({
        ok: true,
        requestId: requestRef.id,
        webhookStatus: 'skipped',
      });
    }

    if (!webhookSecret) {
      await requestRef.update({
        n8nStatus: 'failed',
        n8nResponse: 'N8N_HEADER_SECRET ontbreekt.',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return NextResponse.json({
        ok: true,
        requestId: requestRef.id,
        webhookStatus: 'failed',
        message: 'Aanvraag opgeslagen, maar teammelding niet verzonden.',
      });
    }

    const contactVoorkeurLabel =
      body.contactVoorkeur === 'plan_appointment'
        ? 'Ik plan nu een afspraak'
        : 'Bel mij wanneer het uitkomt';

    const webhookPayload = {
      event: 'website_build_request_submitted',
      requestId: requestRef.id,
      bron: 'website_laten_maken_page',
      userId: auth.uid,
      aanvraag: {
        contactNaam,
        bedrijfsnaam,
        email,
        telefoon,
        websiteType: body.websiteType,
        projectBeschrijving: body.projectBeschrijving,
        budgetRange: body.budgetRange,
        extraWensen: body.extraWensen,
        contactVoorkeur: body.contactVoorkeur,
        contactVoorkeurLabel,
        afspraakDatum: body.afspraakDatum,
        afspraakTijd: body.afspraakTijd,
      },
      telegramText: [
        '🌐 Nieuwe website-aanvraag',
        `Aanvraag ID: ${requestRef.id}`,
        '',
        '👤 Klant',
        `Naam: ${toDash(contactNaam)}`,
        `Bedrijf: ${toDash(bedrijfsnaam)}`,
        `Email: ${toDash(email)}`,
        `Telefoon: ${toDash(telefoon)}`,
        '',
        '📌 Verzoek',
        `Type website: ${toDash(body.websiteType)}`,
        `Budget: ${toDash(body.budgetRange)}`,
        `Contactvoorkeur: ${contactVoorkeurLabel}`,
        `Afspraak: ${afspraakLabel}`,
        '',
        'Project:',
        body.projectBeschrijving,
        '',
        'Extra wensen:',
        toDash(body.extraWensen),
      ].join('\n'),
      verstuurdOp: new Date().toISOString(),
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const webhookResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-offertehulp-secret': webhookSecret,
        },
        body: JSON.stringify(webhookPayload),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      const webhookBody = await webhookResponse.text().catch(() => '');
      if (!webhookResponse.ok) {
        await requestRef.update({
          n8nStatus: 'failed',
          n8nStatusCode: webhookResponse.status,
          n8nResponse: webhookBody.slice(0, 1200),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return NextResponse.json({
          ok: true,
          requestId: requestRef.id,
          webhookStatus: 'failed',
          message: 'Aanvraag opgeslagen, maar teammelding niet verzonden.',
        });
      }

      await requestRef.update({
        n8nStatus: 'sent',
        n8nStatusCode: webhookResponse.status,
        n8nResponse: webhookBody.slice(0, 1200),
        notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return NextResponse.json({
        ok: true,
        requestId: requestRef.id,
        webhookStatus: 'sent',
      });
    } catch (webhookError) {
      await requestRef.update({
        n8nStatus: 'failed',
        n8nResponse: String(webhookError).slice(0, 1200),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return NextResponse.json({
        ok: true,
        requestId: requestRef.id,
        webhookStatus: 'failed',
        message: 'Aanvraag opgeslagen, maar teammelding niet verzonden.',
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Onbekende serverfout.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
