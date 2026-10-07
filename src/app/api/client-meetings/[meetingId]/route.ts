import { NextResponse } from 'next/server';
import { z } from 'zod';
import { initFirebaseAdmin } from '@/firebase/admin';
import { meetingReportSchema, validateMeetingEvidence, type MeetingTranscriptSegment } from '@/lib/client-meetings';
import { MAX_REPORT_BYTES } from '@/lib/client-meetings-ai';
import { authenticateMeetingRequest, cleanupMeeting, getMeetingForOwner, MeetingError, meetingErrorResponse, serializeMeeting, tombstoneMeeting } from '@/lib/client-meetings-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
interface Context { params: { meetingId: string } }

export async function GET(request: Request, { params }: Context): Promise<NextResponse> {
    try {
        const uid = await authenticateMeetingRequest(request);
        const { ref, data } = await getMeetingForOwner(params.meetingId, uid);
        const [chunks, transcript] = await Promise.all([ref.collection('chunks').orderBy('index').get(), ref.collection('transcripts').orderBy('index').get()]);
        return NextResponse.json({ meeting: serializeMeeting(ref.id, data), report: data.report || null,
            chunks: chunks.docs.map((doc) => { const chunk = doc.data(); return { index: chunk.index, startMs: chunk.startMs,
                durationMs: chunk.durationMs, mimeType: chunk.mimeType, bytes: chunk.bytes, sha256: chunk.sha256 }; }),
            transcript: transcript.docs.flatMap((doc) => doc.data().segments || []),
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return meetingErrorResponse(error); }
}

export async function PATCH(request: Request, { params }: Context): Promise<NextResponse> {
    try {
        const uid = await authenticateMeetingRequest(request);
        const { ref } = await getMeetingForOwner(params.meetingId, uid);
        const input = z.object({ report: meetingReportSchema, revision: z.number().int().nonnegative() }).strict().parse(await request.json());
        if (Buffer.byteLength(JSON.stringify(input.report), 'utf8') > MAX_REPORT_BYTES) throw new MeetingError(413, 'Het verslag is te groot. Kort het in en sla opnieuw op.');
        const meeting = await initFirebaseAdmin().firestore.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(ref);
            const data = snapshot.data();
            if (!data || data.deletedAt || data.userId !== uid || data.expiresAt <= Date.now()) throw new MeetingError(404, 'Gesprek niet gevonden.');
            if (data.status !== 'ready') throw new MeetingError(409, 'Wacht tot het gesprek klaar is voor controle.');
            if (data.revision !== input.revision) throw new MeetingError(409, 'Het verslag is elders gewijzigd. Vernieuw het gesprek voor je opnieuw opslaat.');
            const transcript = await transaction.get(ref.collection('transcripts').orderBy('index'));
            const segments = transcript.docs.flatMap((doc) => doc.data().segments || []) as MeetingTranscriptSegment[];
            if (validateMeetingEvidence(input.report, segments).length) throw new MeetingError(400, 'Een bronverwijzing verwijst niet naar het originele transcript.');
            const update = { report: input.report, revision: input.revision + 1, updatedAt: Date.now() };
            transaction.update(ref, update);
            return serializeMeeting(ref.id, { ...data, ...update });
        });
        return NextResponse.json({ meeting }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return meetingErrorResponse(error); }
}

export async function DELETE(request: Request, { params }: Context): Promise<NextResponse> {
    try {
        const uid = await authenticateMeetingRequest(request);
        const { ref } = await getMeetingForOwner(params.meetingId, uid);
        await tombstoneMeeting(ref, uid);
        // Tombstone voorkomt directe toegang. Bij tijdelijke opslagfout ruimt de worker verder op.
        try { await cleanupMeeting(ref); }
        catch { return NextResponse.json({ deleted: true, cleanupPending: true }, { status: 202, headers: { 'Cache-Control': 'no-store' } }); }
        return NextResponse.json({ deleted: true }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return meetingErrorResponse(error); }
}
