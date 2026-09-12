import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { getGmailClient, encodeBase64Url } from '@/lib/integrations/google-gmail';

function safe(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function bearer(request: Request): string | null {
  const header = request.headers.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7).trim() || null : null;
}
function mimeHeader(value: string): string { return value.replace(/[\r\n]+/g, ' ').trim(); }

export async function POST(request: Request) {
  try {
    const authToken = bearer(request);
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { auth, firestore } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(authToken).catch(() => null);
    if (!decoded?.uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null) as { quoteId?: unknown; to?: unknown; supplierName?: unknown; subject?: unknown; text?: unknown; photoIds?: unknown } | null;
    const quoteId = safe(body?.quoteId);
    const to = safe(body?.to);
    const supplierName = safe(body?.supplierName);
    const subject = safe(body?.subject) || 'Materiaalvraag';
    const text = safe(body?.text);
    const photoIds = Array.isArray(body?.photoIds) ? body.photoIds.map(safe).filter(Boolean) : [];
    if (!quoteId || !to || !text) return NextResponse.json({ error: 'Offerte, ontvanger en bericht zijn verplicht.' }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return NextResponse.json({ error: 'E-mailadres is ongeldig.' }, { status: 400 });

    const quoteRef = firestore.collection('quotes').doc(quoteId);
    const quoteSnap = await quoteRef.get();
    const quote = quoteSnap.data() as { userId?: unknown; fotos?: Array<{ id?: unknown; originalName?: unknown; mimeType?: unknown; downloadUrl?: unknown }> } | undefined;
    if (!quoteSnap.exists || safe(quote?.userId) !== decoded.uid) return NextResponse.json({ error: 'Geen toegang tot deze offerte.' }, { status: 403 });

    const data = (await firestore.collection('users').doc(decoded.uid).get()).data() as { integrations?: { googleGmail?: { connected?: boolean; refreshToken?: string; accessToken?: string; expiryDate?: number } } } | undefined;
    const integration = data?.integrations?.googleGmail;
    if (!integration?.connected || !integration.refreshToken) return NextResponse.json({ error: 'Gmail is nog niet gekoppeld.' }, { status: 409 });

    const attachments = (quote?.fotos || []).filter((photo) => photoIds.includes(safe(photo.id)) && safe(photo.downloadUrl));
    const boundary = `=_Calvora_${Date.now()}`;
    const parts = [
      `From: me`,
      `To: ${mimeHeader(to)}`,
      `Subject: ${mimeHeader(subject)}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      text,
    ];

    for (const attachment of attachments) {
      const response = await fetch(safe(attachment.downloadUrl));
      if (!response.ok) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      const base64 = bytes.toString('base64');
      parts.push(
        `--${boundary}`,
        `Content-Type: ${mimeHeader(safe(attachment.mimeType) || 'application/octet-stream')}; name="${mimeHeader(safe(attachment.originalName) || 'foto.jpg')}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${mimeHeader(safe(attachment.originalName) || 'foto.jpg')}"`,
        '',
        base64.match(/.{1,76}/g)?.join('\r\n') || '',
      );
    }
    parts.push(`--${boundary}--`);

    const { gmail, credentials } = await getGmailClient({
      refreshToken: integration.refreshToken,
      accessToken: integration.accessToken,
      expiryDate: integration.expiryDate,
    });
    const result = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encodeBase64Url(parts.join('\r\n')) } });
    await quoteRef.collection('communication_logs').add({ channel: 'gmail', type: 'supplier_material_question', quoteId, createdBy: decoded.uid, supplierName, to, attachmentCount: attachments.length, subject, messagePreview: text.slice(0, 500), messageId: result.data.id || null, createdAt: new Date().toISOString() });
    if (credentials.access_token || credentials.expiry_date) {
      await firestore.collection('users').doc(decoded.uid).set({ integrations: { googleGmail: { ...integration, accessToken: credentials.access_token || integration.accessToken || null, expiryDate: credentials.expiry_date || integration.expiryDate || null, updatedAt: new Date() } } }, { merge: true });
    }
    return NextResponse.json({ ok: true, attachmentCount: attachments.length });
  } catch (error) {
    console.error('google gmail send error', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Gmail versturen mislukt.' }, { status: 500 });
  }
}
