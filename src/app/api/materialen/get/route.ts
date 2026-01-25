/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { supabaseAdmin } from '@/lib/supabase-admin';

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
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;

    // 2. Use Shared Supabase Admin Client


    const { data, error } = await supabaseAdmin
      .from('materialen')
      .select('*')
      .eq('gebruikerid', uid)
      .range(0, 5000)
      .order('volgorde', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error("Fetch Error:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}