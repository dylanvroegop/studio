import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { getDecodedRequestAuth } from '@/lib/admin-auth';
import { mollieMode, mollieRequest, type MolliePaymentLink } from '@/lib/mollie-client';
import { paymentRequestInput, type PaymentRequestView } from '@/lib/payment-request';

import { currentPaymentTotalCents } from '@/lib/payment-request-total';
import { syncPaymentInstallments, PaymentRequestError as RequestError } from '@/lib/sync-payment-installments';
import { formatOfferteNummerLabel } from '@/lib/quote-number';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function ownedQuote(request: Request, id: string) {
  const decoded = await getDecodedRequestAuth(request, { allowBearer: true });
  if (!decoded) throw new RequestError('Log opnieuw in.', 401);
  // De server heeft één Mollie-account: uitsluitend de ingestelde eigenaar mag dit gebruiken.
  if (!process.env.MOLLIE_OWNER_UID) throw new RequestError('De Mollie-eigenaar is nog niet ingesteld.', 503);
  if (decoded.uid !== process.env.MOLLIE_OWNER_UID) throw new RequestError('Geen toegang tot Mollie.', 403);
  const { firestore } = initFirebaseAdmin();
  const quoteRef = firestore.collection('quotes').doc(id);
  const quote = await quoteRef.get();
  if (!quote.exists || quote.data()?.userId !== decoded.uid) throw new RequestError('Geen toegang tot deze offerte.', 403);
  return { firestore, quote: quote.data()!, collection: quoteRef.collection('payment_requests') };
}

function failed(error: unknown): NextResponse {
  return json({ error: error instanceof RequestError ? error.message : 'Betaalverzoek kon niet worden verwerkt. Probeer opnieuw.' }, error instanceof RequestError ? error.status : 502);
}

export async function GET(request: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  try {
    const { firestore, collection, quote } = await ownedQuote(request, params.id);
    const mode = mollieMode();
    const snapshot = await collection.where('mode', '==', mode).get();
    const records = snapshot.docs.map(doc => doc.data());
    const items = records.filter(item => item.url && !item.updating).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json({ mode, items, totalCents: await currentPaymentTotalCents(params.id, quote, firestore) });
  } catch (error) { return failed(error); }
}

export async function POST(request: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  try {
    const { firestore, collection, quote } = await ownedQuote(request, params.id);
    const parsed = paymentRequestInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Vul een geldig bedrag en een omschrijving van maximaal 255 tekens in.' }, 400);
    const input = parsed.data;
    const mode = mollieMode();
    if (input.kind !== 'custom') {
      const totalCents = await currentPaymentTotalCents(params.id, quote, firestore);
      if (!Number.isSafeInteger(totalCents) || totalCents < 0 || totalCents > 200000000 || (input.kind !== 'sync' && totalCents < 2)) {
        throw new RequestError('Vul eerst een geldig offertetotaal in, of kies Ander bedrag.', 400);
      }
      if (input.expectedTotalCents !== totalCents) throw new RequestError('De offerte wordt nog opgeslagen. Probeer opnieuw zodra het eindbedrag is opgeslagen.', 409);
      const installments = await syncPaymentInstallments({ firestore, collection, quoteId: params.id, mode, totalCents,
        description: `Offerte ${formatOfferteNummerLabel(quote.offerteNummer, quote.offerteVersie)}`,
        ...(input.kind === 'sync' ? {} : { createKind: input.kind }),
      });
      const snapshot = await collection.where('mode', '==', mode).get();
      const items = snapshot.docs.map(doc => doc.data()).filter(item => item.url && !item.updating)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return json({ mode, items, totalCents, item: installments.find(item => item.kind === input.kind) });
    }
    const suffix = input.requestId;
    const ref = collection.doc(`${mode}_${suffix}`);
    const reservation = await firestore.runTransaction(async transaction => {
      const existing = await transaction.get(ref);
      const { amountCents, description } = input;
      const fingerprint = createHash('sha256').update(JSON.stringify({ amountCents, description })).digest('hex');
      if (existing.exists) {
        if (existing.data()?.fingerprint !== fingerprint) throw new RequestError('Dit verzoek is gewijzigd. Maak een nieuw betaalverzoek.', 409);
        return existing.data()!;
      }
      const reserved = {
        id: ref.id, fingerprint, createdAt: new Date().toISOString(), amountCents, description, mode,
        kind: input.kind,
      };
      transaction.create(ref, reserved);
      return reserved;
    });
    if ('url' in reservation && reservation.url) return json({ item: reservation });
    const { amountCents, description } = reservation;
    const idempotencyKey = createHash('sha256').update(`${params.id}:${mode}:${suffix}`).digest('hex');
    const link = await mollieRequest<MolliePaymentLink>('/payment-links', {
      amount: { currency: 'EUR', value: (amountCents / 100).toFixed(2) },
      description,
      reusable: false,
      allowedMethods: ['ideal'],
    }, idempotencyKey);
    const url = link._links?.paymentLink?.href;
    if (!url || !url.startsWith('https://') || !link.id?.startsWith('pl_')) throw new Error('Ongeldige Mollie-response.');
    const item: PaymentRequestView = {
      id: ref.id, amountCents, description, mode, url,
      createdAt: reservation.createdAt,
      kind: input.kind,
      paidAt: link.paidAt || null, expiresAt: link.expiresAt || null,
    };
    await ref.set({ ...item, mollieId: link.id }, { merge: true });
    return json({ item });
  } catch (error) { return failed(error); }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  try {
    const { firestore, collection } = await ownedQuote(request, params.id);
    const body = await request.json().catch(() => null);
    if (typeof body?.id !== 'string' || !/^(test|live)_(upfront|final|[0-9a-f-]{36})$/.test(body.id)) return json({ error: 'Ongeldig betaalverzoek.' }, 400);
    const ref = collection.doc(body.id);
    const saved = (await ref.get()).data();
    if (!saved?.mollieId || saved.mode !== mollieMode()) throw new RequestError('Betaalverzoek niet beschikbaar in deze modus.', 404);
    const link = await mollieRequest<MolliePaymentLink>(`/payment-links/${encodeURIComponent(saved.mollieId)}`);
    const update = { paidAt: link.paidAt || null, expiresAt: link.expiresAt || null };
    await firestore.runTransaction(async transaction => {
      const current = (await transaction.get(ref)).data();
      if (current?.mollieId !== saved.mollieId || current?.updating) throw new RequestError('De betaallink is gewijzigd. Open het venster opnieuw.', 409);
      transaction.update(ref, update);
    });
    return json({ item: { ...saved, ...update } });
  } catch (error) { return failed(error); }
}
