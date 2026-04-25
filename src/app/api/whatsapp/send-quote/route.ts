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

async function uploadMedia(params: {
  accessToken: string;
  graphBaseUrl: string;
  phoneNumberId: string;
  file: File;
}): Promise<string> {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', params.file, params.file.name || 'offerte.pdf');

  const response = await fetch(`${params.graphBaseUrl}/${params.phoneNumberId}/media`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: form,
  });

  const payload = (await response.json().catch(() => null)) as { id?: unknown; error?: { message?: unknown; error_user_msg?: unknown } } | null;
  if (!response.ok) {
    const message = safeString(payload?.error?.error_user_msg) || safeString(payload?.error?.message) || 'Media upload naar WhatsApp is mislukt.';
    throw new Error(message);
  }

  const mediaId = safeString(payload?.id);
  if (!mediaId) {
    throw new Error('WhatsApp media upload gaf geen media-id terug.');
  }

  return mediaId;
}

async function sendTextMessage(params: {
  accessToken: string;
  graphBaseUrl: string;
  phoneNumberId: string;
  to: string;
  text: string;
}): Promise<string | null> {
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

  return safeString(payload?.messages?.[0]?.id) || null;
}

async function sendDocumentMessage(params: {
  accessToken: string;
  graphBaseUrl: string;
  phoneNumberId: string;
  to: string;
  mediaId: string;
  filename: string;
  caption?: string;
}): Promise<string | null> {
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
      type: 'document',
      document: {
        id: params.mediaId,
        filename: params.filename || 'offerte.pdf',
        ...(params.caption ? { caption: params.caption } : {}),
      },
    }),
  });

  const payload = (await response.json().catch(() => null)) as GraphSendResponse | null;
  if (!response.ok) {
    const message = safeString(payload?.error?.error_user_msg) || safeString(payload?.error?.message) || 'WhatsApp document versturen is mislukt.';
    throw new Error(message);
  }

  return safeString(payload?.messages?.[0]?.id) || null;
}

type QuoteDocShape = {
  userId?: unknown;
  klantinformatie?: {
    userId?: unknown;
    telefoonnummer?: unknown;
  };
};

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
    const hasDeveloperAccess = decoded.dev === true || decoded.admin === true;
    if (!hasDeveloperAccess) {
      return NextResponse.json(
        { ok: false, message: 'WhatsApp is alleen beschikbaar voor developer-accounts.' },
        { status: 403 }
      );
    }

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(decoded.uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const formData = await request.formData();
    const quoteId = safeString(formData.get('quoteId'));
    const rawPhoneFromBody = safeString(formData.get('phone'));
    const message = safeString(formData.get('message'));
    const files = formData.getAll('files').filter((value): value is File => value instanceof File);

    if (!quoteId) {
      return NextResponse.json({ ok: false, message: 'quoteId ontbreekt.' }, { status: 400 });
    }

    const quoteRef = firestore.collection('quotes').doc(quoteId);
    const quoteSnap = await quoteRef.get();
    if (!quoteSnap.exists) {
      return NextResponse.json({ ok: false, message: 'Offerte niet gevonden.' }, { status: 404 });
    }

    const quoteData = (quoteSnap.data() ?? {}) as QuoteDocShape;
    const ownerId = safeString(quoteData.userId) || safeString(quoteData.klantinformatie?.userId);
    if (!ownerId || ownerId !== decoded.uid) {
      return NextResponse.json({ ok: false, message: 'Geen toegang tot deze offerte.' }, { status: 403 });
    }

    const fallbackPhone = safeString(quoteData.klantinformatie?.telefoonnummer);
    const normalizedPhone = normalizePhoneForWhatsApp(rawPhoneFromBody || fallbackPhone);
    if (!normalizedPhone || normalizedPhone.length < 8 || normalizedPhone.length > 15) {
      return NextResponse.json({
        ok: false,
        message: 'Telefoonnummer is ongeldig. Gebruik bijvoorbeeld +31 6 12345678.',
      }, { status: 400 });
    }

    const maxFileSizeBytes = 90 * 1024 * 1024;
    for (const file of files) {
      const mimeType = safeString(file.type).toLowerCase();
      if (mimeType && mimeType !== 'application/pdf') {
        return NextResponse.json({
          ok: false,
          message: `Bestand ${file.name || 'zonder naam'} is geen PDF.`,
        }, { status: 400 });
      }
      if (file.size > maxFileSizeBytes) {
        return NextResponse.json({
          ok: false,
          message: `Bestand ${file.name || 'zonder naam'} is te groot voor WhatsApp.`,
        }, { status: 400 });
      }
    }

    const sentMessageIds: string[] = [];
    const hasFiles = files.length > 0;
    const messageIsLong = message.length > 1024;

    if (!hasFiles && !message) {
      return NextResponse.json({
        ok: false,
        message: 'Er is geen bericht of PDF om te versturen.',
      }, { status: 400 });
    }

    if (!hasFiles && message) {
      const textMessageId = await sendTextMessage({
        accessToken: config.accessToken,
        graphBaseUrl: config.graphBaseUrl,
        phoneNumberId: config.phoneNumberId,
        to: normalizedPhone,
        text: message,
      });
      if (textMessageId) sentMessageIds.push(textMessageId);
    }

    if (hasFiles && message && messageIsLong) {
      const textMessageId = await sendTextMessage({
        accessToken: config.accessToken,
        graphBaseUrl: config.graphBaseUrl,
        phoneNumberId: config.phoneNumberId,
        to: normalizedPhone,
        text: message,
      });
      if (textMessageId) sentMessageIds.push(textMessageId);
    }

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const mediaId = await uploadMedia({
        accessToken: config.accessToken,
        graphBaseUrl: config.graphBaseUrl,
        phoneNumberId: config.phoneNumberId,
        file,
      });

      const caption = !messageIsLong && message && index === 0 ? message.slice(0, 1024) : '';
      const docMessageId = await sendDocumentMessage({
        accessToken: config.accessToken,
        graphBaseUrl: config.graphBaseUrl,
        phoneNumberId: config.phoneNumberId,
        to: normalizedPhone,
        mediaId,
        filename: file.name || `offerte-${index + 1}.pdf`,
        caption,
      });
      if (docMessageId) sentMessageIds.push(docMessageId);
    }

    await quoteRef.collection('communication_logs').add({
      channel: 'whatsapp',
      type: 'quote_send',
      quoteId,
      createdBy: decoded.uid,
      to: normalizedPhone,
      attachmentCount: files.length,
      attachmentNames: files.map((file) => file.name || 'offerte.pdf'),
      messagePreview: message.slice(0, 500),
      textSentSeparately: messageIsLong,
      messageIds: sentMessageIds,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      quoteId,
      to: normalizedPhone,
      attachmentCount: files.length,
      messageIds: sentMessageIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'WhatsApp versturen is mislukt.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
