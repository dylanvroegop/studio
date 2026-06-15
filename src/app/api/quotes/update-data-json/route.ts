import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { initFirebaseAdmin } from '@/firebase/admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

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

        // Initialize Firebase Admin
        const { auth } = initFirebaseAdmin();

        // Verify token
        let decodedToken: { uid: string };
        try {
            decodedToken = await auth.verifyIdToken(token);
        } catch (e) {
            console.error("Token verification failed:", e);
            return NextResponse.json({ ok: false, message: 'Invalid token' }, { status: 401 });
        }
        if (!decodedToken.uid) {
            return NextResponse.json({ ok: false, message: 'Invalid token' }, { status: 401 });
        }
        const trialBlockedResponse = await ensureDemoTrialActiveByUid(decodedToken.uid);
        if (trialBlockedResponse) return trialBlockedResponse;

        // 2. Parse Body
        const { calculation_id, data_json, data_json_patch } = await req.json();

        if (!calculation_id || (!data_json && !data_json_patch)) {
            return NextResponse.json({ ok: false, message: 'Missing required fields' }, { status: 400 });
        }

        let nextDataJson = data_json;
        if (data_json_patch && typeof data_json_patch === 'object' && !Array.isArray(data_json_patch)) {
            const { data: current, error: readError } = await supabaseAdmin
                .from('quotes_collection')
                .select('data_json')
                .eq('id', calculation_id)
                .eq('gebruikerid', decodedToken.uid)
                .maybeSingle();

            if (readError) {
                return NextResponse.json({ ok: false, message: readError.message }, { status: 500 });
            }
            if (!current) {
                return NextResponse.json({ ok: false, message: 'Calculation not found' }, { status: 404 });
            }

            const currentRoot = Array.isArray(current.data_json)
                ? current.data_json[0]
                : current.data_json;
            nextDataJson = {
                ...(currentRoot && typeof currentRoot === 'object' ? currentRoot : {}),
                ...data_json_patch,
            };
        }

        // 3. Update Supabase using admin client (bypasses RLS)
        const { data, error } = await supabaseAdmin
            .from('quotes_collection')
            .update({ data_json: nextDataJson })
            .eq('id', calculation_id)
            .eq('gebruikerid', decodedToken.uid)
            .select();

        if (error) {
            console.error('Supabase update error:', error);
            return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
        }

        if (!data || data.length === 0) {
            return NextResponse.json({ ok: false, message: 'No rows updated - calculation not found' }, { status: 404 });
        }

        return NextResponse.json({ ok: true, data: data[0] });

    } catch (error: any) {
        console.error('API Error /api/quotes/update-data-json:', error);
        return NextResponse.json({ ok: false, message: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
