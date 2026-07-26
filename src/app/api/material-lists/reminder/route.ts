import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AMSTERDAM_TIME_ZONE = 'Europe/Amsterdam';
const CALVORA_BASE_URL = 'https://app.calvora.nl';

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

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function unauthorized(): NextResponse {
  return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
}

export async function GET(request: Request): Promise<NextResponse> {
  const uid = resolveAutomationUid(request);
  if (!uid) return unauthorized();

  try {
    const { firestore } = initFirebaseAdmin();
    const listsSnapshot = await firestore.collection('material_lists').where('userId', '==', uid).get();
    const listDoc = listsSnapshot.docs.find((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return data.is_general === true && data.status !== 'archived';
    });

    if (!listDoc) {
      return NextResponse.json({
        ok: true,
        shouldAlert: false,
        count: 0,
        items: [],
        timezone: AMSTERDAM_TIME_ZONE,
        checkedAt: new Date().toISOString(),
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const itemsSnapshot = await firestore
      .collection('material_list_items')
      .where('material_list_id', '==', listDoc.id)
      .get();

    const items = itemsSnapshot.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const productName = cleanText(data.product_name);
        const quantity = typeof data.quantity === 'number' && Number.isFinite(data.quantity)
          ? data.quantity
          : 1;
        return {
          id: doc.id,
          productName,
          quantity,
          unit: cleanText(data.unit) || 'st',
          notes: cleanText(data.notes),
          checked: data.checked === true,
          sortOrder: typeof data.sort_order === 'number' ? data.sort_order : 0,
          url: `${CALVORA_BASE_URL}/materiaallijsten/${encodeURIComponent(listDoc.id)}`,
        };
      })
      .filter((item) => item.productName && item.quantity > 0)
      .filter((item) => !item.checked)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map(({ sortOrder: _sortOrder, checked: _checked, ...item }) => item);

    return NextResponse.json({
      ok: true,
      shouldAlert: items.length > 0,
      count: items.length,
      listId: listDoc.id,
      listUrl: `${CALVORA_BASE_URL}/materiaallijsten/${encodeURIComponent(listDoc.id)}`,
      timezone: AMSTERDAM_TIME_ZONE,
      checkedAt: new Date().toISOString(),
      items,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Openstaande materialen voor Telegram-herinnering ophalen mislukt:', error);
    return NextResponse.json({ ok: false, error: 'Openstaande materialen controleren mislukt.' }, { status: 500 });
  }
}
