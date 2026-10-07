import { NextResponse } from 'next/server';
import { authenticateMeetingRequest, createMeeting, meetingCollection, meetingConfiguration, meetingErrorResponse, serializeMeeting } from '@/lib/client-meetings-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
    try {
        const uid = await authenticateMeetingRequest(request);
        const [snapshot, configuration] = await Promise.all([
            meetingCollection().where('userId', '==', uid).get(), meetingConfiguration(),
        ]);
        const meetings = snapshot.docs.filter((doc) => !doc.data().deletedAt && doc.data().expiresAt > Date.now())
            .map((doc) => serializeMeeting(doc.id, doc.data()))
            .sort((a, b) => b.createdAt - a.createdAt);
        return NextResponse.json({ meetings, configuration }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return meetingErrorResponse(error); }
}

export async function POST(request: Request): Promise<NextResponse> {
    try {
        const uid = await authenticateMeetingRequest(request);
        const meeting = await createMeeting(uid, await request.json());
        return NextResponse.json({ meeting }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return meetingErrorResponse(error); }
}
