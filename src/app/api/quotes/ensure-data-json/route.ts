import { syncInvoiceDraftClients } from '@/lib/invoice-draft-client-sync';
import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { buildManualDataJson } from '@/lib/manual-quote-data';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Internal Server Error';
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const token = match[1].trim();
    const { auth, firestore } = initFirebaseAdmin();

    let decodedTokenUid = '';
    try {
      const decodedToken = await auth.verifyIdToken(token);
      decodedTokenUid = decodedToken.uid;
    } catch (error) {
      console.error('Token verification failed:', error);
      return NextResponse.json({ ok: false, message: 'Invalid token' }, { status: 401 });
    }
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(decodedTokenUid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const { quoteId } = await req.json();
    if (!quoteId || typeof quoteId !== 'string') {
      return NextResponse.json({ ok: false, message: 'Missing required field: quoteId' }, { status: 400 });
    }

    const quoteRef = firestore.collection('quotes').doc(quoteId);
    const quoteSnap = await quoteRef.get();
    if (!quoteSnap.exists) {
      return NextResponse.json({ ok: false, message: 'Offerte niet gevonden' }, { status: 404 });
    }

    const quoteData = (quoteSnap.data() ?? {}) as Parameters<typeof buildManualDataJson>[0];
    if (quoteData.userId !== decodedTokenUid) {
      return NextResponse.json({ ok: false, message: 'Geen toegang tot deze offerte' }, { status: 403 });
    }

    await syncInvoiceDraftClients(firestore, quoteId, decodedTokenUid);

    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from('quotes_collection')
      .select('id, quoteid, gebruikerid, status, data_json')
      .eq('quoteid', quoteId)
      .eq('gebruikerid', decodedTokenUid)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingError) {
      console.error('Supabase read error (ensure-data-json):', existingError);
      return NextResponse.json({ ok: false, message: existingError.message }, { status: 500 });
    }

    const existing = Array.isArray(existingRows) ? existingRows[0] : null;
    const dataJson = buildManualDataJson(quoteData);

    if (existing?.data_json) {
      const existingId = typeof existing.id === 'string' ? existing.id : String(existing.id || '');
      if (!existingId) {
        return NextResponse.json({ ok: false, message: 'Ongeldige bestaande calculatie-ID' }, { status: 500 });
      }
      const existingRoot = Array.isArray(existing.data_json)
        ? existing.data_json[0]
        : existing.data_json;
      const existingJson = existingRoot && typeof existingRoot === 'object'
        ? (existingRoot as Record<string, unknown>)
        : {};
      const mergedDataJson = {
        ...existingJson,
        klantinformatie: quoteData.klantinformatie ?? existingJson.klantinformatie ?? null,
      };

      const { data: updatedRows, error: updateExistingError } = await supabaseAdmin
        .from('quotes_collection')
        .update({
          data_json: mergedDataJson,
        })
        .eq('id', existingId)
        .select('id, quoteid, gebruikerid, status, data_json')
        .limit(1);

      if (updateExistingError) {
        console.error('Supabase update error (ensure-data-json existing merge):', updateExistingError);
        return NextResponse.json({ ok: false, message: updateExistingError.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        created: false,
        data: Array.isArray(updatedRows) ? updatedRows[0] : existing,
      });
    }

    if (existing?.id) {
      const { data: updatedRows, error: updateError } = await supabaseAdmin
        .from('quotes_collection')
        .update({
          data_json: dataJson,
        })
        .eq('id', existing.id)
        .select('id, quoteid, gebruikerid, status, data_json')
        .limit(1);

      if (updateError) {
        console.error('Supabase update error (ensure-data-json):', updateError);
        return NextResponse.json({ ok: false, message: updateError.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        created: false,
        data: Array.isArray(updatedRows) ? updatedRows[0] : null,
      });
    }

    const { data: insertedRows, error: insertError } = await supabaseAdmin
      .from('quotes_collection')
      .insert({
        quoteid: quoteId,
        gebruikerid: decodedTokenUid,
        status: 'completed',
        data_json: dataJson,
      })
      .select('id, quoteid, gebruikerid, status, data_json')
      .limit(1);

    if (insertError) {
      console.error('Supabase insert error (ensure-data-json):', insertError);
      return NextResponse.json({ ok: false, message: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      created: true,
      data: Array.isArray(insertedRows) ? insertedRows[0] : null,
    });
  } catch (error: unknown) {
    console.error('API Error /api/quotes/ensure-data-json:', error);
    return NextResponse.json({ ok: false, message: getErrorMessage(error) }, { status: 500 });
  }
}
