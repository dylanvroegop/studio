import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';

import { initFirebaseAdmin } from '@/firebase/admin';

const SECRET_HEADER = 'x-offertehulp-secret';
const MAX_MATERIAL_LENGTH = 500;

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getSafeIdPart(value: unknown): string {
  return getString(value).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const expectedSecret = process.env.N8N_HEADER_SECRET?.trim();
  const providedSecret = request.headers.get(SECRET_HEADER)?.trim();

  if (!expectedSecret) {
    return NextResponse.json({ ok: false, message: 'N8N_HEADER_SECRET ontbreekt.' }, { status: 500 });
  }
  if (!providedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ ok: false, message: 'Ongeldige webhook-authenticatie.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return NextResponse.json({ ok: false, message: 'Ongeldige JSON.' }, { status: 400 });
  }

  const material = getString(body.material);
  if (!material) {
    return NextResponse.json({ ok: false, message: 'Materiaalnaam ontbreekt.' }, { status: 400 });
  }
  if (material.length > MAX_MATERIAL_LENGTH) {
    return NextResponse.json({ ok: false, message: 'Materiaalnaam is te lang.' }, { status: 400 });
  }

  try {
    const { firestore } = initFirebaseAdmin();
    const listSnapshot = await firestore
      .collection('material_lists')
      .where('is_general', '==', true)
      .limit(1)
      .get();

    if (listSnapshot.empty) {
      return NextResponse.json({ ok: false, message: 'Algemene materiaallijst bestaat nog niet.' }, { status: 404 });
    }

    const listDocument = listSnapshot.docs[0];
    const chatPart = getSafeIdPart(body.chatId) || 'telegram';
    const messagePart = getSafeIdPart(body.messageId) || Date.now().toString();
    const itemRef = firestore.collection('material_list_items').doc(`telegram-${chatPart}-${messagePart}`);
    const existingItem = await itemRef.get();

    if (existingItem.exists) {
      return NextResponse.json({ ok: true, duplicate: true, material, listId: listDocument.id });
    }

    const currentItemCount = Number(listDocument.data().item_count || 0);
    await itemRef.set({
      material_list_id: listDocument.id,
      product_name: material,
      quantity: 1,
      unit: 'st',
      supplier: '',
      category: '',
      checked: false,
      notes: '',
      sort_order: currentItemCount,
      created_via: 'telegram',
      created_at: FieldValue.serverTimestamp(),
    });
    await listDocument.ref.update({
      item_count: currentItemCount + 1,
      updated_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, duplicate: false, material, listId: listDocument.id });
  } catch (error) {
    console.error('Telegram materiaallijst opslaan mislukt:', error);
    return NextResponse.json({ ok: false, message: 'Materiaal kon niet worden opgeslagen.' }, { status: 500 });
  }
}
