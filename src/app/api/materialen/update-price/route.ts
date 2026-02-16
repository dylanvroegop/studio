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
        const normalizedRowId = typeof row_id === 'string' ? row_id.trim() : '';
        const normalizedMateriaalnaam = typeof materiaalnaam === 'string' ? materiaalnaam.trim() : '';

        if ((!normalizedMateriaalnaam && !normalizedRowId) || (prijs_incl_btw === undefined && prijs_excl_btw === undefined && new_materiaalnaam === undefined && eenheid === undefined)) {
            return NextResponse.json({ ok: false, message: 'Missing required fields' }, { status: 400 });
        }
        if (row_id !== undefined && typeof row_id !== 'string') {
            return NextResponse.json({ ok: false, message: 'row_id moet een string zijn' }, { status: 400 });
        }
        if (!normalizedRowId && typeof materiaalnaam !== 'string') {
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

        // First try to update an owned row.
        const query = supabaseAdmin
            .from('main_material_list')
            .update(updatePayload)
            .eq('gebruikerid', uid);
        const { data: updatedRows, error: updateError } = normalizedRowId
            ? await query.eq('row_id', normalizedRowId).select()
            : await query.eq('materiaalnaam', normalizedMateriaalnaam).select();

        if (updateError) {
            console.error('Supabase update error:', updateError);
            return NextResponse.json({ ok: false, message: updateError.message }, { status: 500 });
        }

        if (Array.isArray(updatedRows) && updatedRows.length > 0) {
            return NextResponse.json({ ok: true, data: updatedRows });
        }

        // Fallback: clone source row from another owned catalog (never from NULL owner),
        // then apply the update as a user-owned row.
        let sourceQuery = supabaseAdmin
            .from('main_material_list')
            .select('*')
            .neq('gebruikerid', uid)
            .limit(1);

        sourceQuery = normalizedRowId
            ? sourceQuery.eq('row_id', normalizedRowId)
            : sourceQuery.eq('materiaalnaam', normalizedMateriaalnaam).order('created_at', { ascending: false });

        const { data: sourceRow, error: sourceError } = await sourceQuery.maybeSingle();
        if (sourceError) {
            console.error('Supabase source lookup error:', sourceError);
            return NextResponse.json({ ok: false, message: sourceError.message }, { status: 500 });
        }

        if (!sourceRow) {
            return NextResponse.json(
                { ok: false, message: 'Geen bronmateriaal gevonden voor deze update.' },
                { status: 404 }
            );
        }

        const {
            created_at: _createdAt,
            gebruikerid: _sourceOwner,
            ...sourceBase
        } = sourceRow as Record<string, any>;

        const insertPayload: Record<string, any> = {
            ...sourceBase,
            ...updatePayload,
            gebruikerid: uid,
        };

        if (!insertPayload.materiaalnaam && normalizedMateriaalnaam) {
            insertPayload.materiaalnaam = normalizedMateriaalnaam;
        }

        const upsertAttempt = await supabaseAdmin
            .from('main_material_list')
            .upsert(insertPayload, { onConflict: 'gebruikerid,row_id' })
            .select()
            .maybeSingle();

        if (upsertAttempt.error) {
            console.error('Supabase upsert fallback error:', upsertAttempt.error);
            return NextResponse.json({ ok: false, message: upsertAttempt.error.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true, data: upsertAttempt.data ? [upsertAttempt.data] : [] });

    } catch (error: any) {
        console.error('API Error /api/materialen/update-price:', error);
        return NextResponse.json({ ok: false, message: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
