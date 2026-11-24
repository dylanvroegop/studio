import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { intakeUser, intakeErrorResponse, listIntakes, saveIntake, withIntakeDeadline } from '@/lib/client-intake-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function GET(request: Request): Promise<NextResponse> {
    try {
        const uid = await intakeUser(request);
        const [sessions, worker] = await withIntakeDeadline(Promise.all([listIntakes(uid), initFirebaseAdmin().firestore.collection('client_intake_worker').doc('status').get()]));
        return NextResponse.json({ sessions, configuration: { aiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()), workerOnline: (worker.data()?.heartbeatAt || 0) > Date.now() - 180_000 } }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return intakeErrorResponse(error); }
}
export async function POST(request: Request): Promise<NextResponse> {
    try { const uid = await intakeUser(request); return NextResponse.json({ session: await saveIntake(uid, await request.json()) }, { headers: { 'Cache-Control': 'no-store' } }); }
    catch (error) { return intakeErrorResponse(error); }
}
