import { NextResponse } from 'next/server';
import { authenticateMeetingRequest, chunkDocumentId, getMeetingForOwner, MeetingError, meetingAudioPath, meetingBucket, meetingErrorResponse, uploadMeetingChunk } from '@/lib/client-meetings-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
interface Context { params: { meetingId: string; index: string } }

export async function PUT(request: Request, { params }: Context): Promise<NextResponse> {
    try {
        const uid = await authenticateMeetingRequest(request);
        return NextResponse.json(await uploadMeetingChunk(uid, params.meetingId, params.index, request), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return meetingErrorResponse(error); }
}

export async function GET(request: Request, { params }: Context): Promise<Response> {
    try {
        const uid = await authenticateMeetingRequest(request);
        const { ref } = await getMeetingForOwner(params.meetingId, uid);
        if (!/^\d{1,4}$/.test(params.index)) throw new MeetingError(400, 'Ongeldig audiofragment.');
        const index = Number(params.index);
        const chunk = await ref.collection('chunks').doc(chunkDocumentId(index)).get();
        if (!chunk.exists) throw new MeetingError(404, 'Audiofragment niet gevonden.');
        const [audio] = await meetingBucket().file(meetingAudioPath(uid, params.meetingId, index)).download();
        return new Response(new Uint8Array(audio), { headers: {
            'Content-Type': chunk.data()!.mimeType, 'Content-Length': String(audio.byteLength),
            'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
        } });
    } catch (error) { return meetingErrorResponse(error); }
}
