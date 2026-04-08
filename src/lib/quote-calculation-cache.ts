import 'server-only';

import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';

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

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildManualDataJson(quoteData: QuoteDataShape): Record<string, unknown> {
  const instellingen = quoteData.instellingen ?? {};
  const transport = quoteData.extras?.transport ?? {};
  const winstMarge = quoteData.extras?.winstMarge ?? {};
  const werkomschrijving =
    typeof quoteData.werkomschrijving === 'string' ? quoteData.werkomschrijving.trim() : '';

  return {
    grootmaterialen: [],
    verbruiksartikelen: [],
    uren_specificatie: [],
    totaal_uren: 0,
    werkbeschrijving: werkomschrijving ? [werkomschrijving] : [],
    werkbeschrijving_structured: {
      title: '',
      context: '',
      sections: {
        voorbereiding: [],
        uitvoering: werkomschrijving ? [werkomschrijving] : [],
        afwerking: [],
      },
      legacyNotes: [],
    },
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

export async function rebuildQuoteDataJsonForUser(params: {
  quoteId: string;
  uid: string;
}): Promise<{
  created: boolean;
  data: Record<string, unknown> | null;
}> {
  const { quoteId, uid } = params;
  const { firestore } = initFirebaseAdmin();

  const quoteRef = firestore.collection('quotes').doc(quoteId);
  const quoteSnap = await quoteRef.get();
  if (!quoteSnap.exists) {
    throw new Error('Offerte niet gevonden');
  }

  const quoteData = (quoteSnap.data() ?? {}) as QuoteDataShape;
  if (quoteData.userId !== uid) {
    throw new Error('Geen toegang tot deze offerte');
  }

  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from('quotes_collection')
    .select('id, quoteid, gebruikerid, status, data_json, created_at')
    .eq('quoteid', quoteId)
    .eq('gebruikerid', uid)
    .order('created_at', { ascending: false })
    .limit(1);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existing = Array.isArray(existingRows) ? existingRows[0] : null;
  const dataJson = buildManualDataJson(quoteData);

  if (existing?.id) {
    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from('quotes_collection')
      .update({
        status: 'completed',
        data_json: dataJson,
      })
      .eq('id', existing.id)
      .select('id, quoteid, gebruikerid, status, data_json, created_at')
      .limit(1);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return {
      created: false,
      data: (Array.isArray(updatedRows) ? updatedRows[0] : null) as Record<string, unknown> | null,
    };
  }

  const { data: insertedRows, error: insertError } = await supabaseAdmin
    .from('quotes_collection')
    .insert({
      quoteid: quoteId,
      gebruikerid: uid,
      status: 'completed',
      data_json: dataJson,
    })
    .select('id, quoteid, gebruikerid, status, data_json, created_at')
    .limit(1);

  if (insertError) {
    throw new Error(insertError.message);
  }

  return {
    created: true,
    data: (Array.isArray(insertedRows) ? insertedRows[0] : null) as Record<string, unknown> | null,
  };
}
