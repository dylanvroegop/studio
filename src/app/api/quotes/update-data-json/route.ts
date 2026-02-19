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
        const { calculation_id, data_json } = await req.json();

        if (!calculation_id || !data_json) {
            return NextResponse.json({ ok: false, message: 'Missing required fields' }, { status: 400 });
        }

        // 3. Update Supabase using admin client (bypasses RLS)
        const { data, error } = await supabaseAdmin
            .from('quotes_collection')
            .update({ data_json })
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
