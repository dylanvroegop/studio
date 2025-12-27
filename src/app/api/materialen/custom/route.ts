import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { initFirebaseAdmin } from '@/firebase/admin';

export async function POST(req: NextRequest) {
  try {
    // 1. Read & verify Firebase token
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);

    const gebruikerid = decoded.uid;

    // 2. Parse body
    const body = await req.json();

    // 3. Create Supabase admin client (server only)
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 4. Insert (force gebruikerid server-side)
    const { error } = await supabaseAdmin.from('materialen').insert({
      materiaalnaam: body.materiaalnaam,
      prijs: body.prijs,
      eenheid: body.eenheid,
      leverancier: body.leverancier ?? null,
      categorie: body.categorie ?? null,
      gebruikerid, // ← forced, cannot be spoofed
    });

    if (error) {
      console.error(error);
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
