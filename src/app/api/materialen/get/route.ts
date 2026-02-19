/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { initFirebaseAdmin } from '@/firebase/admin';
import { bootstrapDefaultCatalogForUser } from '@/lib/bootstrap-defaults';
import { parsePriceToNumber } from '@/lib/utils';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeLegacyCategoryName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'trappen & zolderluiken') return 'Vlieringtrappen';
  return trimmed;
}

export async function GET(req: Request) {
  try {
    // 1. Get UID from Token
    const authHeader = req.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    if (!token) return NextResponse.json({ ok: false, error: 'No token' }, { status: 401 });

    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded?.uid;
    if (!uid) {
      return NextResponse.json({ ok: false, error: 'Invalid token' }, { status: 401 });
    }
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    // 2. Fetch only user-owned materials.
    const { data: ownData, error: ownError } = await supabaseAdmin
      .from('main_material_list')
      .select('*')
      .eq('gebruikerid', uid);

    if (ownError) throw ownError;

    console.log(`[Materialen API] ownData length: ${ownData?.length}`);
    let data = [...(ownData || [])];

    // First-login/self-heal: ensure the user has a personal catalog from template defaults.
    if (data.length === 0) {
      await bootstrapDefaultCatalogForUser(uid, { ignoreCompletionMarker: true });
      const { data: refetchedOwnData, error: refetchError } = await supabaseAdmin
        .from('main_material_list')
        .select('*')
        .eq('gebruikerid', uid)
        .order('order_id', { ascending: true })
        .range(0, 5000);
      if (refetchError) throw refetchError;
      data = [...(refetchedOwnData || [])];
    }

    // DB now enforces uniqueness via Primary Key on (gebruikerid, row_id).
    // The previous JS filtering was likely causing issues if row_id property access was flaky.
    // We trust the DB result.


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
        const normalizedCategorie = normalizeLegacyCategoryName(row?.categorie);
        const normalizedSubsectie = normalizeLegacyCategoryName(row?.subsectie ?? row?.sub_categorie);

        return {
          ...row,
          // Canonical unit price in the app is excl. btw.
          prijs: excl,
          prijs_excl_btw: excl,
          prijs_incl_btw: incl,
          // Normalize legacy category naming to keep filters consistent.
          categorie: normalizedCategorie ?? row?.categorie ?? null,
          // Keep subcategory separate from main category.
          subsectie: normalizedSubsectie ?? null,
          sub_categorie: normalizedSubsectie ?? row?.sub_categorie ?? null,
        };
      })
      : data;

    console.log(`[Materialen API] Fetched ${data.length} items for user ${uid}.`);
    return NextResponse.json({ ok: true, data: normalized });
  } catch (error: any) {
    console.error("Fetch Error:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
