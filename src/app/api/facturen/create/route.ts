import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createInvoiceAtomically, InvoiceCreationError } from '@/lib/invoice-create-server';
import type { CreateInvoiceParams } from '@/lib/invoice-document';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  try {
    const { auth, firestore } = initFirebaseAdmin();
    let uid: string;
    try { uid = (await auth.verifyIdToken(token)).uid; }
    catch { return NextResponse.json({ message: 'Unauthorized' }, { status: 401 }); }
    const trialBlocked = await ensureDemoTrialActiveByUid(uid);
    if (trialBlocked) return trialBlocked;
    const input = await request.json().catch(() => null) as CreateInvoiceParams | null;
    if (!input || typeof input.quoteId !== 'string' || !input.quoteId || input.quoteId.includes('/')) {
      throw new InvoiceCreationError('Ongeldige offerte.', 400);
    }
    if (input.combinedContext && (input.combinedContext.type !== 'meerwerkbon_combined'
      || typeof input.combinedContext.meerwerkbonId !== 'string' || !input.combinedContext.meerwerkbonId)) {
      throw new InvoiceCreationError('Ongeldige meerwerkbon.', 400);
    }
    const quote = await firestore.doc(`quotes/${input.quoteId}`).get();
    if (!quote.exists || quote.data()?.userId !== uid) throw new InvoiceCreationError('Offerte niet gevonden.', 404);
    let calculation = null;
    if (!input.combinedContext) {
      // De actuele calculatie wordt server-side gecontroleerd; bedragen uit de browser zijn geen bron.
      const latest = await supabaseAdmin.from('quotes_collection').select('status,data_json')
        .eq('gebruikerid', uid).eq('quoteid', input.quoteId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (latest.error) throw new InvoiceCreationError('De actuele calculatie kan niet worden gecontroleerd. Probeer opnieuw.', 503);
      calculation = latest.data?.data_json || null;
      if (latest.data && latest.data.status !== 'completed' && !calculation) {
        const fallback = await supabaseAdmin.from('quotes_collection').select('data_json')
          .eq('gebruikerid', uid).eq('quoteid', input.quoteId).eq('status', 'completed')
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (fallback.error) throw new InvoiceCreationError('De actuele calculatie kan niet worden gecontroleerd. Probeer opnieuw.', 503);
        calculation = fallback.data?.data_json || null;
      }
    }
    const invoiceId = await createInvoiceAtomically(firestore, uid, input, calculation);
    return NextResponse.json({ ok: true, invoiceId }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof InvoiceCreationError) return NextResponse.json({ message: error.message }, { status: error.status });
    console.error('[facturen/create]', error);
    return NextResponse.json({ message: 'Factuur kon niet worden aangemaakt.' }, { status: 500 });
  }
}
