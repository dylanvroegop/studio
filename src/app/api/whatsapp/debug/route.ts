import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type GraphSendResponse = {
  messages?: Array<{ id?: string }>;
  error?: {
    message?: string;
    error_user_msg?: string;
  };
};

type QuoteDocShape = {
  userId?: unknown;
  klantinformatie?: {
    userId?: unknown;
    telefoonnummer?: unknown;
  };
};

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function normalizePhoneForWhatsApp(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  let digits = trimmed.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    digits = digits.slice(1);
  }
  digits = digits.replace(/\D/g, '');

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('0') && digits.length === 10) {
    digits = `31${digits.slice(1)}`;
  }

  return digits;
}

function resolveWhatsAppConfig(): {
  accessToken: string;
  phoneNumberId: string;
  graphBaseUrl: string;
} | null {
  const accessToken = safeString(process.env.WHATSAPP_ACCESS_TOKEN);
  const phoneNumberId = safeString(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const graphBaseUrl = safeString(process.env.WHATSAPP_GRAPH_BASE_URL) || 'https://graph.facebook.com/v20.0';

  if (!accessToken || !phoneNumberId) return null;
  return { accessToken, phoneNumberId, graphBaseUrl };
}

async function sendTextMessage(params: {
  accessToken: string;
  graphBaseUrl: string;
  phoneNumberId: string;
  to: string;
  text: string;
}): Promise<{ messageId: string | null; raw: GraphSendResponse | null }> {
  const response = await fetch(`${params.graphBaseUrl}/${params.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: params.to,
      type: 'text',
      text: {
        body: params.text,
      },
    }),
  });

  const payload = (await response.json().catch(() => null)) as GraphSendResponse | null;
  if (!response.ok) {
    const message = safeString(payload?.error?.error_user_msg) || safeString(payload?.error?.message) || 'WhatsApp tekstbericht versturen is mislukt.';
    throw new Error(message);
  }

  return {
    messageId: safeString(payload?.messages?.[0]?.id) || null,
    raw: payload,
  };
}

async function verifyQuoteOwnership(params: {
  firestore: ReturnType<typeof initFirebaseAdmin>['firestore'];
  quoteId: string;
  uid: string;
}): Promise<{
  quoteRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
  fallbackPhone: string;
}> {
  const quoteRef = params.firestore.collection('quotes').doc(params.quoteId);
  const quoteSnap = await quoteRef.get();
  if (!quoteSnap.exists) {
    throw new Error('Offerte niet gevonden.');
  }
  const quoteData = (quoteSnap.data() ?? {}) as QuoteDocShape;
  const ownerId = safeString(quoteData.userId) || safeString(quoteData.klantinformatie?.userId);
  if (!ownerId || ownerId !== params.uid) {
    throw new Error('Geen toegang tot deze offerte.');
  }

  return {
    quoteRef,
    fallbackPhone: safeString(quoteData.klantinformatie?.telefoonnummer),
  };
}

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token).catch(() => null);
    if (!decoded?.uid) {
      return NextResponse.json({ ok: false, message: 'Invalid token' }, { status: 401 });
    }

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(decoded.uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const config = resolveWhatsAppConfig();
    const url = new URL(request.url);
    const quoteId = safeString(url.searchParams.get('quoteId'));

    let logs: Array<Record<string, unknown>> = [];
    if (quoteId) {
      const { quoteRef } = await verifyQuoteOwnership({ firestore, quoteId, uid: decoded.uid });
      const logsSnap = await quoteRef
        .collection('communication_logs')
        .orderBy('createdAt', 'desc')
        .limit(30)
        .get();

      logs = logsSnap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
    }

    const accessToken = safeString(process.env.WHATSAPP_ACCESS_TOKEN);
    return NextResponse.json({
      ok: true,
      config: {
        configured: Boolean(config),
        hasAccessToken: Boolean(accessToken),
        hasPhoneNumberId: Boolean(safeString(process.env.WHATSAPP_PHONE_NUMBER_ID)),
        graphBaseUrl: config?.graphBaseUrl || 'https://graph.facebook.com/v20.0',
        accessTokenPreview: accessToken ? `${accessToken.slice(0, 6)}...(${accessToken.length})` : '',
      },
      quoteId,
      logs,
      note: 'Accepted by WhatsApp API does not always mean delivered. Delivery states come via webhooks.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon WhatsApp diagnostics niet ophalen.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const config = resolveWhatsAppConfig();
    if (!config) {
      return NextResponse.json({
        ok: false,
        message: 'WhatsApp is nog niet geconfigureerd op de server (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID).',
      }, { status: 503 });
    }

    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token).catch(() => null);
    if (!decoded?.uid) {
      return NextResponse.json({ ok: false, message: 'Invalid token' }, { status: 401 });
    }

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(decoded.uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const payload = await request.json().catch(() => null) as {
      quoteId?: unknown;
      phone?: unknown;
      message?: unknown;
    } | null;

    const quoteId = safeString(payload?.quoteId);
    const incomingPhone = safeString(payload?.phone);
    const message = safeString(payload?.message) || 'Dit is een testbericht vanuit OfferteHulp WhatsApp diagnostics.';

    let quoteRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData> | null = null;
    let fallbackPhone = '';
    if (quoteId) {
      const verified = await verifyQuoteOwnership({ firestore, quoteId, uid: decoded.uid });
      quoteRef = verified.quoteRef;
      fallbackPhone = verified.fallbackPhone;
    }

    const normalizedPhone = normalizePhoneForWhatsApp(incomingPhone || fallbackPhone);
    if (!normalizedPhone || normalizedPhone.length < 8 || normalizedPhone.length > 15) {
      return NextResponse.json({
        ok: false,
        message: 'Telefoonnummer is ongeldig. Gebruik bijvoorbeeld +31 6 12345678.',
      }, { status: 400 });
    }

    const sendResult = await sendTextMessage({
      accessToken: config.accessToken,
      graphBaseUrl: config.graphBaseUrl,
      phoneNumberId: config.phoneNumberId,
      to: normalizedPhone,
      text: message,
    });

    if (quoteRef) {
      await quoteRef.collection('communication_logs').add({
        channel: 'whatsapp',
        type: 'whatsapp_debug_text',
        quoteId,
        createdBy: decoded.uid,
        to: normalizedPhone,
        messagePreview: message.slice(0, 500),
        messageIds: sendResult.messageId ? [sendResult.messageId] : [],
        rawResponse: sendResult.raw || null,
        createdAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      ok: true,
      to: normalizedPhone,
      messageId: sendResult.messageId,
      rawResponse: sendResult.raw,
      note: 'Accepted by API. Delivery requires webhook status tracking.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon WhatsApp testbericht niet versturen.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
