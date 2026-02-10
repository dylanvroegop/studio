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
        const { materiaalnaam, prijs_incl_btw, prijs_excl_btw, row_id, new_materiaalnaam, eenheid } = await req.json();

        if ((!materiaalnaam && !row_id) || (prijs_incl_btw === undefined && prijs_excl_btw === undefined && new_materiaalnaam === undefined && eenheid === undefined)) {
            return NextResponse.json({ ok: false, message: 'Missing required fields' }, { status: 400 });
        }

        // 3. Update Supabase
        // Build conditional update payload based on which fields are provided
        const updatePayload: Record<string, any> = {};
        if (prijs_incl_btw !== undefined) {
            updatePayload.prijs_incl_btw = Number(prijs_incl_btw);
        }
        if (prijs_excl_btw !== undefined) {
            updatePayload.prijs_excl_btw = Number(prijs_excl_btw);
        }
        if (new_materiaalnaam !== undefined && new_materiaalnaam.trim()) {
            updatePayload.materiaalnaam = new_materiaalnaam.trim();
        }
        if (eenheid !== undefined && eenheid.trim()) {
            updatePayload.eenheid = eenheid.trim();
        }
        const query = supabaseAdmin.from('main_material_list').update(updatePayload);
        const { data, error } = row_id
            ? await query.eq('row_id', row_id).select()
            : await query.eq('materiaalnaam', materiaalnaam).select();

        if (error) {
            console.error('Supabase update error:', error);
            return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
        }

        if (!Array.isArray(data) || data.length === 0) {
            return NextResponse.json(
                { ok: false, message: 'Geen materiaal gevonden in main_material_list voor update.' },
                { status: 404 }
            );
        }

        return NextResponse.json({ ok: true, data });

    } catch (error: any) {
        console.error('API Error /api/materialen/update-price:', error);
        return NextResponse.json({ ok: false, message: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
