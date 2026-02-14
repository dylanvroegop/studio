import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { initFirebaseAdmin } from '@/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        // 1. Auth Check
        const authHeader = req.headers.get('authorization') || '';
        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        if (!match) {
            return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
        }
        const token = match[1].trim();

        // Initialize Firebase Admin (ensures app is ready)
        const { auth } = initFirebaseAdmin();

        // Verify token
        let uid = '';
        try {
            const decoded = await auth.verifyIdToken(token);
            uid = decoded.uid;
        } catch (e) {
            console.error("Token verification failed:", e);
            return NextResponse.json({ ok: false, message: 'Invalid token' }, { status: 401 });
        }
        if (!uid) {
            return NextResponse.json({ ok: false, message: 'Invalid token' }, { status: 401 });
        }

        // 2. Parse Body
        const { materiaalnaam, prijs_incl_btw, prijs_excl_btw, row_id, new_materiaalnaam, eenheid } = await req.json();

        if ((!materiaalnaam && !row_id) || (prijs_incl_btw === undefined && prijs_excl_btw === undefined && new_materiaalnaam === undefined && eenheid === undefined)) {
            return NextResponse.json({ ok: false, message: 'Missing required fields' }, { status: 400 });
        }
        if (row_id !== undefined && typeof row_id !== 'string') {
            return NextResponse.json({ ok: false, message: 'row_id moet een string zijn' }, { status: 400 });
        }
        if (!row_id && typeof materiaalnaam !== 'string') {
            return NextResponse.json({ ok: false, message: 'materiaalnaam moet een string zijn' }, { status: 400 });
        }

        // 3. Update Supabase
        // Build conditional update payload based on which fields are provided
        const updatePayload: Record<string, any> = {};
        if (prijs_incl_btw !== undefined) {
            const parsed = Number(prijs_incl_btw);
            if (!Number.isFinite(parsed)) {
                return NextResponse.json({ ok: false, message: 'prijs_incl_btw is ongeldig' }, { status: 400 });
            }
            updatePayload.prijs_incl_btw = parsed;
        }
        if (prijs_excl_btw !== undefined) {
            const parsed = Number(prijs_excl_btw);
            if (!Number.isFinite(parsed)) {
                return NextResponse.json({ ok: false, message: 'prijs_excl_btw is ongeldig' }, { status: 400 });
            }
            updatePayload.prijs_excl_btw = parsed;
        }
        if (typeof new_materiaalnaam === 'string' && new_materiaalnaam.trim()) {
            updatePayload.materiaalnaam = new_materiaalnaam.trim();
        }
        if (typeof eenheid === 'string' && eenheid.trim()) {
            updatePayload.eenheid = eenheid.trim();
        }
        if (Object.keys(updatePayload).length === 0) {
            return NextResponse.json({ ok: false, message: 'Geen geldige update velden' }, { status: 400 });
        }

        const query = supabaseAdmin
            .from('main_material_list')
            .update(updatePayload)
            .eq('gebruikerid', uid);
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
