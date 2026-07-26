import { timingSafeEqual } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';

export const runtime = 'nodejs';

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function resolveAutomationUid(request: Request): string | null {
  const expectedSecret = process.env.N8N_HEADER_SECRET?.trim() || '';
  const providedSecret = request.headers.get('x-offertehulp-secret')?.trim() || '';
  if (!expectedSecret || !providedSecret || !safeEqual(providedSecret, expectedSecret)) return null;

  return request.headers.get('x-offertehulp-user-id')?.trim()
    || process.env.CALVORA_USER_ID?.trim()
    || null;
}

function unauthorized(): NextResponse {
  return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
}

export async function POST(request: Request): Promise<NextResponse> {
  const uid = resolveAutomationUid(request);
  if (!uid) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Ongeldige JSON.' }, { status: 400 });
  }

  const itemId = body && typeof body === 'object' && typeof (body as { itemId?: unknown }).itemId === 'string'
    ? (body as { itemId: string }).itemId.trim()
    : '';
  if (!itemId || !/^[A-Za-z0-9_-]+$/.test(itemId)) {
    return NextResponse.json({ ok: false, error: 'Ongeldig materiaal-item.' }, { status: 400 });
  }

  try {
    const { firestore } = initFirebaseAdmin();
    const itemRef = firestore.collection('material_list_items').doc(itemId);
    const itemSnapshot = await itemRef.get();
    if (!itemSnapshot.exists) {
      return NextResponse.json({ ok: false, error: 'Materiaal-item niet gevonden.' }, { status: 404 });
    }

    const itemData = itemSnapshot.data() as Record<string, unknown>;
    const listId = typeof itemData.material_list_id === 'string' ? itemData.material_list_id : '';
    const listSnapshot = listId
      ? await firestore.collection('material_lists').doc(listId).get()
      : null;
    const listData = listSnapshot?.data() as Record<string, unknown> | undefined;
    if (!listSnapshot?.exists || listData?.userId !== uid) {
      return NextResponse.json({ ok: false, error: 'Geen toegang tot dit materiaal-item.' }, { status: 403 });
    }

    if (itemData.checked === true) {
      return NextResponse.json({
        ok: true,
        alreadyCompleted: true,
        itemId,
        productName: itemData.product_name || null,
      });
    }

    await itemRef.update({ checked: true, updated_at: FieldValue.serverTimestamp() });
    await listSnapshot.ref.update({ updated_at: FieldValue.serverTimestamp() });

    return NextResponse.json({
      ok: true,
      alreadyCompleted: false,
      itemId,
      productName: itemData.product_name || null,
    });
  } catch (error) {
    console.error('Materiaal-item als opgepakt markeren mislukt:', error);
    return NextResponse.json({ ok: false, error: 'Materiaal-item bijwerken mislukt.' }, { status: 500 });
  }
}
