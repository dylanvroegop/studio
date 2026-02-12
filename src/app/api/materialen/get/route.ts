/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parsePriceToNumber } from '@/lib/utils';

// Re-using your existing logic from your other route.ts files
function krijgFirebaseAdminApp() {
  if (admin.apps.length > 0) return admin.app();
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

export async function GET(req: Request) {
  try {
    // 1. Get UID from Token
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.split('Bearer ')[1];
    if (!token) return NextResponse.json({ ok: false, error: 'No token' }, { status: 401 });

    krijgFirebaseAdminApp();
    await admin.auth().verifyIdToken(token);

    // 2. Use Shared Supabase Admin Client


    const { data, error } = await supabaseAdmin
      .from('main_material_list')
      .select('*')
      .order('order_id', { ascending: true })
      .range(0, 5000);

    if (error) throw error;

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
            subsectie: row?.subsectie ?? row?.categorie ?? null,
          };
        })
      : data;

    return NextResponse.json({ ok: true, data: normalized });
  } catch (error: any) {
    console.error("Fetch Error:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
