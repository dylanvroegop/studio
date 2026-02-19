import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Internal Server Error';
}

type QuoteTransportExtras = {
  mode?: unknown;
  prijsPerKm?: unknown;
  vasteTransportkosten?: unknown;
  tunnelkosten?: unknown;
};

type QuoteWinstMargeExtras = {
  mode?: unknown;
  percentage?: unknown;
  fixedAmount?: unknown;
  basis?: unknown;
};

type QuoteDataShape = {
  userId?: unknown;
  werkomschrijving?: unknown;
  klantinformatie?: unknown;
  instellingen?: {
    btwTarief?: unknown;
    uurTariefExclBtw?: unknown;
    uurTarief?: unknown;
    schattingUren?: unknown;
  };
  extras?: {
    transport?: QuoteTransportExtras;
    winstMarge?: QuoteWinstMargeExtras;
  };
};

type MaterialPresetItem = {
  product: string;
  aantal: number;
  prijs_per_stuk: number;
  eenheid?: string;
};

type QuoteMaterialPreset = {
  grootmaterialen: MaterialPresetItem[];
  verbruiksartikelen: MaterialPresetItem[];
};

function sanitizePresetItems(value: unknown): MaterialPresetItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const row = raw as Record<string, unknown>;
      const product = String(row.product ?? '').trim();
      if (!product) return null;

      const parsedAantal = Number(row.aantal);
      const parsedPrijs = Number(row.prijs_per_stuk ?? row.prijs_excl_btw ?? row.prijs);
      const aantal = Number.isFinite(parsedAantal) && parsedAantal > 0 ? parsedAantal : 1;
      const prijs = Number.isFinite(parsedPrijs) && parsedPrijs >= 0 ? parsedPrijs : 0;
      const eenheid = typeof row.eenheid === 'string' ? row.eenheid : undefined;

      return {
        product,
        aantal,
        prijs_per_stuk: prijs,
        eenheid,
      } as MaterialPresetItem;
    })
    .filter((item): item is MaterialPresetItem => item !== null);
}

function resolveQuoteMaterialPreset(userData: Record<string, unknown>): QuoteMaterialPreset {
  const instellingen =
    userData?.instellingen && typeof userData.instellingen === 'object'
      ? (userData.instellingen as Record<string, unknown>)
      : {};
  const settings =
    userData?.settings && typeof userData.settings === 'object'
      ? (userData.settings as Record<string, unknown>)
      : {};

  const source =
    (instellingen.offerteMateriaalPreset && typeof instellingen.offerteMateriaalPreset === 'object'
      ? (instellingen.offerteMateriaalPreset as Record<string, unknown>)
      : null)
    ?? (settings.offerteMateriaalPreset && typeof settings.offerteMateriaalPreset === 'object'
      ? (settings.offerteMateriaalPreset as Record<string, unknown>)
      : null);

  if (!source) {
    return {
      grootmaterialen: [],
      verbruiksartikelen: [],
    };
  }

  return {
    grootmaterialen: sanitizePresetItems(source.grootmaterialen),
    verbruiksartikelen: sanitizePresetItems(source.verbruiksartikelen),
  };
}

function buildManualDataJson(
  quoteData: QuoteDataShape,
  materialPreset: QuoteMaterialPreset
): Record<string, unknown> {
  const instellingen = quoteData.instellingen ?? {};
  const transport = quoteData.extras?.transport ?? {};
  const winstMarge = quoteData.extras?.winstMarge ?? {};
  const werkomschrijving =
    typeof quoteData.werkomschrijving === 'string' ? quoteData.werkomschrijving.trim() : '';

  return {
    grootmaterialen: materialPreset.grootmaterialen,
    verbruiksartikelen: materialPreset.verbruiksartikelen,
    uren_specificatie: [],
    totaal_uren: 0,
    werkbeschrijving: werkomschrijving ? [werkomschrijving] : [],
    klantinformatie: quoteData.klantinformatie ?? null,
    instellingen: {
      btwTarief: toFiniteNumber(instellingen?.btwTarief, 21),
      uurTariefExclBtw: toFiniteNumber(
        instellingen?.uurTariefExclBtw ?? instellingen?.uurTarief,
        50
      ),
      schattingUren: Boolean(instellingen?.schattingUren ?? false),
    },
    extras: {
      transport: {
        mode: typeof transport?.mode === 'string' ? transport.mode : 'fixed',
        prijsPerKm: toFiniteNumber(transport?.prijsPerKm, 0),
        vasteTransportkosten: toFiniteNumber(transport?.vasteTransportkosten, 0),
        tunnelkosten: toFiniteNumber(transport?.tunnelkosten, 0),
      },
      winstMarge: {
        mode: winstMarge?.mode === 'fixed' ? 'fixed' : 'percentage',
        percentage: toFiniteNumber(winstMarge?.percentage, 10),
        fixedAmount: toFiniteNumber(winstMarge?.fixedAmount, 0),
        basis: winstMarge?.basis === 'arbeid' || winstMarge?.basis === 'materiaal'
          ? winstMarge.basis
          : 'totaal',
      },
    },
  };
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

    const quoteData = (quoteSnap.data() ?? {}) as QuoteDataShape;
    if (quoteData.userId !== decodedTokenUid) {
      return NextResponse.json({ ok: false, message: 'Geen toegang tot deze offerte' }, { status: 403 });
    }

    let materialPreset: QuoteMaterialPreset = { grootmaterialen: [], verbruiksartikelen: [] };
    try {
      const userSnap = await firestore.collection('users').doc(decodedTokenUid).get();
      if (userSnap.exists) {
        const userData = (userSnap.data() ?? {}) as Record<string, unknown>;
        materialPreset = resolveQuoteMaterialPreset(userData);
      }
    } catch (error) {
      console.warn('Kon offerte materiaal preset niet lezen, ga door met lege preset:', error);
    }

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
    const dataJson = buildManualDataJson(quoteData, materialPreset);

    if (existing?.data_json) {
      return NextResponse.json({
        ok: true,
        created: false,
        data: existing,
      });
    }

    if (existing?.id) {
      const { data: updatedRows, error: updateError } = await supabaseAdmin
        .from('quotes_collection')
        .update({
          status: 'completed',
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
