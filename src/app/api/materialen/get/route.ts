/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parsePriceToNumber } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Re-using your existing logic from your other route.ts files
function krijgFirebaseAdminApp() {
  if (admin.apps.length > 0) return admin.app();
  const projectId =
    process.env.FIREBASE_PROJECT_ID
    || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    || 'studio-6011690104-60fbf';
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });
}

async function provisionOwnedCatalogForUser(uid: string): Promise<void> {
  const { data: templateRows, error: templateError } = await supabaseAdmin
    .from('main_material_list')
    .select('*')
    .neq('gebruikerid', uid)
    .order('order_id', { ascending: true })
    .range(0, 5000);

  if (templateError) {
    throw templateError;
  }
  if (!Array.isArray(templateRows) || templateRows.length === 0) {
    return;
  }

  const dedupedByRowId = new Map<string, any>();
  for (const row of templateRows) {
    const rowId = row?.row_id ?? row?.id;
    if (!rowId) continue;
    const key = String(rowId);
    if (!dedupedByRowId.has(key)) {
      dedupedByRowId.set(key, row);
    }
  }

  const sourceRows = Array.from(dedupedByRowId.values());
  if (sourceRows.length === 0) return;

  const rowsToInsert = sourceRows.map((row) => {
    const {
      created_at: _createdAt,
      gebruikerid: _owner,
      ...rest
    } = row as Record<string, unknown>;
    return {
      ...rest,
      gebruikerid: uid,
    };
  });

  const chunkSize = 500;
  for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
    const chunk = rowsToInsert.slice(i, i + chunkSize);
    const { error } = await supabaseAdmin
      .from('main_material_list')
      .upsert(chunk, { onConflict: 'gebruikerid,row_id' });
    if (error) throw error;
  }
}

export async function GET(req: Request) {
  try {
    // 1. Get UID from Token
    const authHeader = req.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    if (!token) return NextResponse.json({ ok: false, error: 'No token' }, { status: 401 });

    krijgFirebaseAdminApp();
    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded?.uid;
    if (!uid) {
      return NextResponse.json({ ok: false, error: 'Invalid token' }, { status: 401 });
    }

    // 2. Fetch only user-owned materials.
    const { data: ownData, error: ownError } = await supabaseAdmin
      .from('main_material_list')
      .select('*')
      .eq('gebruikerid', uid)
      .order('order_id', { ascending: true })
      .range(0, 5000);

    if (ownError) throw ownError;

    let data = [...(ownData || [])];

    // First-login/self-heal: if user has no personal catalog yet,
    // clone from an existing owned catalog template.
    if (data.length === 0) {
      await provisionOwnedCatalogForUser(uid);
      const { data: refetchedOwnData, error: refetchError } = await supabaseAdmin
        .from('main_material_list')
        .select('*')
        .eq('gebruikerid', uid)
        .order('order_id', { ascending: true })
        .range(0, 5000);
      if (refetchError) throw refetchError;
      data = [...(refetchedOwnData || [])];
    }

    data = data.filter((row, index, arr) => {
      const rowId = row?.row_id ?? row?.id;
      if (!rowId) return true;
      return arr.findIndex((candidate) => (candidate?.row_id ?? candidate?.id) === rowId) === index;
    });

    const normalized = Array.isArray(data)
      ? data.map((row: any) => {
          const excl =
            parsePriceToNumber(row?.prijs_excl_btw ?? row?.prijs) ??
            (() => {
              const incl = parsePriceToNumber(row?.prijs_incl_btw);
              return incl == null ? null : Number((incl / 1.21).toFixed(2));
            })();
          const incl =
            parsePriceToNumber(row?.prijs_incl_btw) ??
            (excl == null ? null : Number((excl * 1.21).toFixed(2)));

          return {
            ...row,
            // Canonical unit price in the app is excl. btw.
            prijs: excl,
            prijs_excl_btw: excl,
            prijs_incl_btw: incl,
            // Keep subcategory separate from main category.
            subsectie: row?.subsectie ?? row?.sub_categorie ?? null,
          };
        })
      : data;

    return NextResponse.json({ ok: true, data: normalized });
  } catch (error: any) {
    console.error("Fetch Error:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
