import { NextResponse } from 'next/server';
import { authenticateMeetingRequest, meetingConfiguration, meetingErrorResponse, queueMeeting } from '@/lib/client-meetings-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, { params }: { params: { meetingId: string } }): Promise<NextResponse> {
    try {
        const uid = await authenticateMeetingRequest(request);
        const meeting = await queueMeeting(uid, params.meetingId, await request.json());
        return NextResponse.json({ meeting, configuration: await meetingConfiguration() }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return meetingErrorResponse(error); }
}
