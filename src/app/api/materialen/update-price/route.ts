import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { initFirebaseAdmin } from '@/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        // 1. Auth Check
        const authHeader = req.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
        }
        const token = authHeader.split('Bearer ')[1];

        // Initialize Firebase Admin (ensures app is ready)
        const { auth } = initFirebaseAdmin();

        // Verify token
        try {
            await auth.verifyIdToken(token);
        } catch (e) {
            console.error("Token verification failed:", e);
            return NextResponse.json({ ok: false, message: 'Invalid token' }, { status: 401 });
        }

        // 2. Parse Body
        const { materiaalnaam, prijs_incl_btw } = await req.json();

        if (!materiaalnaam || prijs_incl_btw === undefined) {
            return NextResponse.json({ ok: false, message: 'Missing fields' }, { status: 400 });
        }

        // 3. Update Supabase
        // main_material_list uses 'materiaalnaam' to identify the product
        const { data, error } = await supabaseAdmin
            .from('main_material_list')
            .update({ prijs_incl_btw: String(prijs_incl_btw) })
            .eq('materiaalnaam', materiaalnaam)
            .select();

        if (error) {
            console.error('Supabase update error:', error);
            return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true, data });

    } catch (error: any) {
        console.error('API Error /api/materialen/update-price:', error);
        return NextResponse.json({ ok: false, message: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
