import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parsePriceToNumber } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  naam?: unknown;
  old_naam?: unknown;
  prijs_excl_btw?: unknown;
};

type SchemaConfig = {
  nameColumn: 'materiaalnaam' | 'naam';
};

const SCHEMAS: SchemaConfig[] = [
  { nameColumn: 'materiaalnaam' },
  { nameColumn: 'naam' },
];

function normalizeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded?.uid || null;
    if (!uid) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const naam = normalizeName(body.naam);
    const oldNaam = normalizeName(body.old_naam);
    const prijsExclBtw = parsePriceToNumber(body.prijs_excl_btw);

    if (!naam) {
      return NextResponse.json({ ok: false, message: 'Naam is verplicht' }, { status: 400 });
    }
    if (prijsExclBtw === null || prijsExclBtw < 0) {
      return NextResponse.json({ ok: false, message: 'Geldige prijs_excl_btw is verplicht' }, { status: 400 });
    }

    const candidateNames = [naam, oldNaam].filter((v): v is string => !!v);

    let activeSchema: SchemaConfig | null = null;
    let existingRows: any[] = [];
    let lastErrorMessage = '';

    for (const schema of SCHEMAS) {
      const { data, error } = await supabaseAdmin
        .from('main_small_material_list')
        .select('*')
        .in(schema.nameColumn, candidateNames)
        .eq('gebruikerid', uid)
        .limit(5);

      if (!error) {
        activeSchema = schema;
        existingRows = data || [];
        break;
      }
      if (error.message?.includes('gebruikerid')) {
        return NextResponse.json(
          { ok: false, message: 'main_small_material_list mist eigenaar-kolom gebruikerid.' },
          { status: 500 }
        );
      }
      lastErrorMessage = error.message || lastErrorMessage;
    }

    if (!activeSchema) {
      return NextResponse.json(
        { ok: false, message: lastErrorMessage || 'Kon kolommen niet detecteren voor main_small_material_list' },
        { status: 500 }
      );
    }

    const nameColumn = activeSchema.nameColumn;
    const existingRow =
      existingRows.find((r) => (r?.[nameColumn] || '').toString().trim() === oldNaam) ||
      existingRows.find((r) => (r?.[nameColumn] || '').toString().trim() === naam) ||
      existingRows[0];

    const basePayload: Record<string, any> = {
      [nameColumn]: naam,
      prijs_excl_btw: Number(prijsExclBtw).toFixed(2),
    };

    basePayload.gebruikerid = uid;

    if (existingRow?.id !== undefined && existingRow?.id !== null) {
      // Update by primary id when available.
      let updateAttempt = await supabaseAdmin
        .from('main_small_material_list')
        .update(basePayload)
        .eq('id', existingRow.id)
        .eq('gebruikerid', uid)
        .select('*')
        .single();

      if (updateAttempt.error) {
        return NextResponse.json({ ok: false, message: updateAttempt.error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, data: updateAttempt.data, action: 'updated' });
    }

    // Insert new row.
    let insertPayload: Record<string, any> = {
      ...basePayload,
      eenheid: 'stuk',
    };
    let insertAttempt = await supabaseAdmin
      .from('main_small_material_list')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertAttempt.error && insertAttempt.error.message?.includes('eenheid')) {
      const { eenheid, ...payloadWithoutUnit } = insertPayload;
      insertAttempt = await supabaseAdmin
        .from('main_small_material_list')
        .insert(payloadWithoutUnit)
        .select('*')
        .single();
    }

    if (insertAttempt.error) {
      return NextResponse.json({ ok: false, message: insertAttempt.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: insertAttempt.data, action: 'inserted' });
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
