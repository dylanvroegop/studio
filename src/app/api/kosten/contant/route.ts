import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { extractBearerToken, noStoreHeaders, resolveUid } from '@/lib/bank-api-auth';
import { CASH_ID, cashPurchaseReference, parseCashEntry, type CashDeposit } from '@/lib/kosten-cash';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function failure(message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, message }, { status, headers: noStoreHeaders() });
}

async function handle(request: Request): Promise<NextResponse> {
  if (!extractBearerToken(request.headers.get('authorization'))) return failure('Log opnieuw in bij Studio.', 401);
  let uid: string;
  try {
    uid = await resolveUid(request);
  } catch (error) {
    if ((error instanceof Error && error.message === 'Unauthorized') || String((error as { code?: string } | null)?.code).startsWith('auth/')) {
      return failure('Log opnieuw in bij Studio.', 401);
    }
    console.error('[kosten/contant] Sessiecontrole mislukt', error);
    return failure('Studio kon je sessie niet controleren.', 500);
  }

  try {
    if (request.method === 'GET') {
      const snap = await initFirebaseAdmin().firestore.collection('users').doc(uid)
        .collection('cash_deposits').orderBy('date', 'desc').get();
      const deposits = snap.docs.map((doc): CashDeposit => {
        const { date, amountCents, description } = doc.data();
        return { id: doc.id, date, amountCents, description };
      });
      return NextResponse.json({ ok: true, deposits }, { headers: noStoreHeaders() });
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return failure('Ongeldige boeking.', 400);

    if (request.method === 'DELETE') {
      if (typeof body.id !== 'string' || !CASH_ID.test(body.id)) return failure('Ongeldig boekingskenmerk.', 400);
      const ref = initFirebaseAdmin().firestore.collection('users').doc(uid).collection('cash_deposits').doc(body.id);
      await ref.delete();
      return NextResponse.json({ ok: true }, { headers: noStoreHeaders() });
    }

    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date());
    const entry = parseCashEntry(body, today);
    if (typeof entry === 'string') return failure(entry, 400);

    if (entry.kind === 'deposit') {
      const ref = initFirebaseAdmin().firestore.collection('users').doc(uid).collection('cash_deposits').doc(entry.id);
      const data = { date: entry.date, amountCents: entry.amountCents, description: entry.description };
      if (entry.editing) {
        await ref.update(data);
      } else {
        try {
          await ref.create(data);
        } catch (error) {
          if ((error as { code?: number })?.code !== 6) throw error;
          const existing = (await ref.get()).data();
          if (!existing || existing.date !== data.date || existing.amountCents !== data.amountCents || existing.description !== data.description) {
            return failure('Deze inleg is al opgeslagen. Open de regel om deze te wijzigen.', 409);
          }
        }
      }
    } else {
      const amount = entry.amountCents / 100;
      const reference = cashPurchaseReference(entry.id, entry.kind === 'private-purchase');
      const values = {
        id: entry.id,
        user_id: uid,
        date: entry.date,
        category: entry.category,
        description: entry.description,
        supplier_name: entry.supplier || 'Contante aankoop',
        supplier_order_number: reference,
        status: 'paid_cash',
        payment_status: 'paid',
        reconciliation_status: 'not_applicable',
        amount_incl_btw: amount,
        amount_excl_btw: amount,
        btw_percentage: 0,
        btw_amount: 0,
        line_items: [],
      };
      const result = await supabaseAdmin.from('project_costs').insert(values);
      if (result.error && result.error.code !== '23505') throw result.error;
      if (result.error) {
        const existing = await supabaseAdmin.from('project_costs')
          .select('supplier_order_number,date,category,description,supplier_name,amount_incl_btw')
          .eq('id', entry.id).eq('user_id', uid).maybeSingle();
        if (existing.error) throw existing.error;
        if (!existing.data || existing.data.supplier_order_number !== reference || existing.data.date !== values.date
          || existing.data.category !== values.category || existing.data.description !== values.description
          || existing.data.supplier_name !== values.supplier_name || Number(existing.data.amount_incl_btw) !== amount) {
          return failure('Deze boeking is al opgeslagen. Open de kost om deze te wijzigen.', 409);
        }
      }
    }

    return NextResponse.json({ ok: true }, { headers: noStoreHeaders() });
  } catch (error) {
    console.error('[kosten/contant]', error);
    const message = request.method === 'GET' ? 'Contante privé-inleg kon niet worden geladen.'
      : request.method === 'DELETE' ? 'De privé-inleg kon niet worden verwijderd. Probeer het opnieuw.'
      : 'De contante boeking kon niet worden opgeslagen. Probeer het opnieuw.';
    return failure(message, 500);
  }
}

export { handle as GET, handle as POST, handle as DELETE };
