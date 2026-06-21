import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COPIED_SUBCOLLECTIONS = ['jobs', 'klussen', 'quote_notes'] as const;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Internal Server Error';
}

async function reserveQuoteNumber(
  firestore: FirebaseFirestore.Firestore,
  userId: string,
  startNumber = 260001,
): Promise<number> {
  const counterRef = firestore.collection('counters').doc(`quoteNumber_${userId}`);
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(counterRef);
    const currentNext = snapshot.exists && typeof snapshot.data()?.next === 'number'
      ? Number(snapshot.data()?.next)
      : startNumber;

    transaction.set(counterRef, {
      next: currentNext + 1,
      updatedAt: FieldValue.serverTimestamp(),
      userId,
    }, { merge: true });

    return currentNext;
  });
}

function buildDuplicateQuotePayload(
  sourceQuote: FirebaseFirestore.DocumentData,
  sourceQuoteId: string,
  offerteNummer: number,
): FirebaseFirestore.DocumentData {
  const payload: FirebaseFirestore.DocumentData = {
    ...sourceQuote,
    status: 'concept',
    offerteNummer,
    archived: false,
    duplicateSource: {
      quoteId: sourceQuoteId,
      offerteNummer: sourceQuote.offerteNummer ?? null,
      createdAt: FieldValue.serverTimestamp(),
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  // A duplicate starts as a clean concept. Files remain owned by the source
  // quote, so copying their references would make delete actions unsafe.
  [
    'sentAt',
    'acceptedAt',
    'rejectedAt',
    'expiredAt',
    'signedAt',
    'pdf_url',
    'pdfUrl',
    'calculationStartedAt',
    'bonnetjes',
    'fotos',
    'materialPresentations',
    'splitChildren',
  ].forEach((field) => delete payload[field]);

  return payload;
}

async function copyCollection(
  source: FirebaseFirestore.CollectionReference,
  destination: FirebaseFirestore.CollectionReference,
  sourceQuoteId: string,
  destinationQuoteId: string,
): Promise<void> {
  const snapshot = await source.get();

  for (const sourceDoc of snapshot.docs) {
    const data = { ...sourceDoc.data() };
    if (data.quoteId === sourceQuoteId) data.quoteId = destinationQuoteId;
    if (data.quoteid === sourceQuoteId) data.quoteid = destinationQuoteId;

    const destinationDoc = destination.doc(sourceDoc.id);
    await destinationDoc.set(data);

    const nestedCollections = await sourceDoc.ref.listCollections();
    for (const nestedCollection of nestedCollections) {
      await copyCollection(
        nestedCollection,
        destinationDoc.collection(nestedCollection.id),
        sourceQuoteId,
        destinationQuoteId,
      );
    }
  }
}

export async function POST(request: Request) {
  let duplicateQuoteId = '';
  let calculationInserted = false;

  try {
    const authHeader = request.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { auth, firestore } = initFirebaseAdmin();
    let uid = '';
    try {
      uid = (await auth.verifyIdToken(match[1].trim())).uid;
    } catch {
      return NextResponse.json({ ok: false, message: 'Invalid token' }, { status: 401 });
    }

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const body = await request.json().catch(() => null);
    const quoteId = typeof body?.quoteId === 'string' ? body.quoteId.trim() : '';
    if (!quoteId) {
      return NextResponse.json({ ok: false, message: 'Offerte-id ontbreekt.' }, { status: 400 });
    }

    const sourceRef = firestore.collection('quotes').doc(quoteId);
    const sourceSnapshot = await sourceRef.get();
    if (!sourceSnapshot.exists) {
      return NextResponse.json({ ok: false, message: 'Offerte niet gevonden.' }, { status: 404 });
    }

    const sourceQuote = sourceSnapshot.data() || {};
    if (sourceQuote.userId !== uid) {
      return NextResponse.json({ ok: false, message: 'Geen toegang tot deze offerte.' }, { status: 403 });
    }

    let calculationData = body?.dataJson && typeof body.dataJson === 'object'
      ? body.dataJson
      : null;

    if (!calculationData) {
      const { data: sourceCalculation, error: calculationError } = await supabaseAdmin
        .from('quotes_collection')
        .select('data_json')
        .eq('quoteid', quoteId)
        .eq('gebruikerid', uid)
        .not('data_json', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (calculationError) throw new Error(calculationError.message);
      calculationData = sourceCalculation?.data_json ?? null;
      if (!calculationData) {
        return NextResponse.json({
          ok: false,
          message: 'Deze offerte heeft nog geen opgeslagen calculatie om te kopiëren.',
        }, { status: 409 });
      }
    }

    const offerteNummer = await reserveQuoteNumber(firestore, uid);
    const duplicateRef = firestore.collection('quotes').doc();
    duplicateQuoteId = duplicateRef.id;

    const { error: insertError } = await supabaseAdmin
      .from('quotes_collection')
      .insert({
        quoteid: duplicateQuoteId,
        gebruikerid: uid,
        status: 'completed',
        data_json: calculationData,
      });

    if (insertError) throw new Error(insertError.message);
    calculationInserted = true;

    for (const collectionName of COPIED_SUBCOLLECTIONS) {
      await copyCollection(
        sourceRef.collection(collectionName),
        duplicateRef.collection(collectionName),
        quoteId,
        duplicateQuoteId,
      );
    }

    const duplicateSourceQuote = Object.prototype.hasOwnProperty.call(body || {}, 'notes')
      ? { ...sourceQuote, notities: typeof body.notes === 'string' ? body.notes : '' }
      : sourceQuote;
    await duplicateRef.set(buildDuplicateQuotePayload(duplicateSourceQuote, quoteId, offerteNummer));
    await sourceRef.set({
      duplicateChildren: FieldValue.arrayUnion({
        quoteId: duplicateQuoteId,
        offerteNummer,
      }),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({
      ok: true,
      quote: { id: duplicateQuoteId, offerteNummer },
    });
  } catch (error) {
    console.error('Quote duplication failed:', error);

    if (duplicateQuoteId) {
      const { firestore } = initFirebaseAdmin();
      await firestore.recursiveDelete(firestore.collection('quotes').doc(duplicateQuoteId)).catch(() => undefined);
      if (calculationInserted) {
        try {
          await supabaseAdmin
            .from('quotes_collection')
            .delete()
            .eq('quoteid', duplicateQuoteId);
        } catch {
          // Keep the original error as the response; rollback is best effort.
        }
      }
    }

    return NextResponse.json({ ok: false, message: getErrorMessage(error) }, { status: 500 });
  }
}
