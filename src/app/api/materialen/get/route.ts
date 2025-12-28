import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';

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

    // 2. Initialize Supabase with Service Role Key (from apphosting.yaml)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );


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