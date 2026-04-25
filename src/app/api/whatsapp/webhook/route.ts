import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getVerifyToken(): string {
  return (
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim()
    || 'calvora_test_123'
  );
}

// Meta webhook verification
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode') || '';
  const token = url.searchParams.get('hub.verify_token') || '';
  const challenge = url.searchParams.get('hub.challenge') || '';

  if (mode === 'subscribe' && token === getVerifyToken()) {
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json(
    { ok: false, message: 'Webhook verification failed' },
    { status: 403 }
  );
}

// Meta message/status callbacks
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  console.log('[whatsapp-webhook] incoming:', JSON.stringify(body));

  try {
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: true });
    }

    const { firestore } = initFirebaseAdmin();
    const payload = body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            statuses?: Array<Record<string, unknown>>;
            messages?: Array<Record<string, unknown>>;
            metadata?: Record<string, unknown>;
          };
        }>;
      }>;
    };

    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    const statusEvents: Array<Record<string, unknown>> = [];

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value && typeof change.value === 'object' ? change.value : null;
        if (!value) continue;

        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        for (const status of statuses) {
          const statusId = typeof status?.id === 'string' ? status.id : '';
          if (!statusId) continue;

          const event = {
            messageId: statusId,
            status: typeof status?.status === 'string' ? status.status : 'unknown',
            recipientId: typeof status?.recipient_id === 'string' ? status.recipient_id : '',
            timestamp: typeof status?.timestamp === 'string' ? status.timestamp : '',
            errors: Array.isArray(status?.errors) ? status.errors : [],
            raw: status,
            metadata: value.metadata || null,
            createdAt: new Date().toISOString(),
          };

          statusEvents.push(event);
          await firestore.collection('whatsapp_delivery_events').add(event);
        }
      }
    }

    if (statusEvents.length > 0) {
      for (const event of statusEvents) {
        const messageId = typeof event.messageId === 'string' ? event.messageId : '';
        if (!messageId) continue;

        const communications = await firestore
          .collectionGroup('communication_logs')
          .where('messageIds', 'array-contains', messageId)
          .get();

        for (const commDoc of communications.docs) {
          const data = commDoc.data() as { deliveryStatuses?: unknown };
          const current = data.deliveryStatuses && typeof data.deliveryStatuses === 'object'
            ? data.deliveryStatuses as Record<string, unknown>
            : {};
          const next = { ...current, [messageId]: event };

          await commDoc.ref.update({
            deliveryStatuses: next,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }
  } catch (error) {
    console.error('[whatsapp-webhook] processing failed:', error);
  }

  return NextResponse.json({ ok: true });
}
