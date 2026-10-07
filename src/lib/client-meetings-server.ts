import { createHash, randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { FieldValue, type DocumentReference, type DocumentData } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { initFirebaseAdmin } from '../firebase/admin';
import { firebaseConfig } from '../firebase/config';
import type { ClientMeeting } from './client-meetings';

export const MEETING_COLLECTION = 'client_meetings';
export const MEETING_MAX_CHUNKS = 180;
export const MEETING_MAX_DURATION_MS = 90 * 60 * 1000;
export const MEETING_MAX_CHUNK_BYTES = 12 * 1024 * 1024;
export const MEETING_RETENTION_DAYS = 30;
export const MEETING_LEASE_MS = 10 * 60 * 1000;
export const meetingIdSchema = z.string().uuid();
const documentIdSchema = z.string().min(1).max(200).regex(/^[^/]+$/);
export const createMeetingSchema = z.object({
    id: meetingIdSchema,
    clientId: documentIdSchema,
    quoteId: documentIdSchema.nullable().optional(),
    title: z.string().trim().min(1).max(160),
    consent: z.literal(true),
}).strict();

export class MeetingError extends Error {
    constructor(public status: number, message: string) { super(message); }
}

export function meetingErrorResponse(error: unknown): NextResponse {
    if (error instanceof MeetingError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Controleer de ingevulde gespreksgegevens.' }, { status: 400 });
    // Geen providerfouten, transcripties, tokens of klantgegevens naar logs/browser.
    return NextResponse.json({ error: 'Het gesprek kon niet worden verwerkt. Probeer opnieuw.' }, { status: 500 });
}

export async function authenticateMeetingRequest(request: Request): Promise<string> {
    const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw new MeetingError(401, 'Log in om klantgesprekken te openen.');
    try { return (await initFirebaseAdmin().auth.verifyIdToken(token, true)).uid; }
    catch { throw new MeetingError(401, 'Log opnieuw in.'); }
}

export function meetingCollection() { return initFirebaseAdmin().firestore.collection(MEETING_COLLECTION); }
export function meetingBucket() {
    initFirebaseAdmin();
    return getStorage().bucket(process.env.FIREBASE_STORAGE_BUCKET?.trim() || firebaseConfig.storageBucket);
}
export function meetingAudioPath(uid: string, id: string, index: number): string { return `client-meetings/${uid}/${id}/${String(index).padStart(4, '0')}`; }
export function chunkDocumentId(index: number): string { return String(index).padStart(4, '0'); }

export async function getMeetingForOwner(id: string, uid: string) {
    meetingIdSchema.parse(id);
    const ref = meetingCollection().doc(id);
    const snapshot = await ref.get();
    const data = snapshot.data();
    if (!data || data.userId !== uid || data.deletedAt || data.expiresAt <= Date.now()) throw new MeetingError(404, 'Gesprek niet gevonden of verlopen.');
    return { ref, data };
}

export function serializeMeeting(id: string, data: DocumentData): ClientMeeting {
    return { id, userId: data.userId, clientId: data.clientId, quoteId: data.quoteId, title: data.title,
        status: data.status, chunkCount: data.chunkCount, uploadedChunks: data.uploadedChunks || 0,
        processedChunks: data.processedChunks, durationMs: data.durationMs, createdAt: data.createdAt,
        updatedAt: data.updatedAt, expiresAt: data.expiresAt, error: data.error || null,
        revision: data.revision, generatedQuoteId: data.generatedQuoteId || null };
}

export async function meetingConfiguration() {
    const worker = await initFirebaseAdmin().firestore.collection('client_meeting_worker').doc('status').get();
    const heartbeat = worker.data()?.heartbeatAt;
    return {
        aiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
        workerConfigured: process.env.MEETING_WORKER_ENABLED === 'true',
        workerOnline: typeof heartbeat === 'number' && heartbeat > Date.now() - 180000,
        retentionDays: MEETING_RETENTION_DAYS,
    };
}

export function assertMeetingQuoteClient(quote: DocumentData, clientId: string): void {
    const ids = [quote.klantinformatie?.klantId, quote.klantinformatie?.clientId, quote.clientId, quote.klantId, quote.klant?.id, quote.client?.id]
        .filter((id) => id !== undefined && id !== null && id !== '');
    if (!ids.length || ids.some((id) => typeof id !== 'string' || id !== clientId)) throw new MeetingError(409, 'Deze offerte hoort niet eenduidig bij de gekozen klant.');
}

export async function createMeeting(uid: string, input: unknown) {
    const value = createMeetingSchema.parse(input);
    const { firestore } = initFirebaseAdmin();
    return firestore.runTransaction(async (transaction) => {
        const ref = meetingCollection().doc(value.id);
        const existing = await transaction.get(ref);
        if (existing.exists) {
            const data = existing.data()!;
            if (data.userId !== uid || data.deletedAt || data.expiresAt <= Date.now()) throw new MeetingError(409, 'Dit gesprek kan niet opnieuw worden aangemaakt.');
            if (data.clientId !== value.clientId || data.quoteId !== (value.quoteId || null)) throw new MeetingError(409, 'De klant of offerte van dit gesprek wijkt af.');
            return serializeMeeting(ref.id, data);
        }
        const client = await transaction.get(firestore.collection('clients').doc(value.clientId));
        if (!client.exists || client.data()?.userId !== uid) throw new MeetingError(404, 'Klant niet gevonden.');
        if (value.quoteId) {
            const quote = await transaction.get(firestore.collection('quotes').doc(value.quoteId));
            const q = quote.data();
            if (!q || q.userId !== uid) throw new MeetingError(404, 'Offerte niet gevonden.');
            assertMeetingQuoteClient(q, value.clientId);
        }
        const now = Date.now();
        const data = {
            userId: uid, clientId: value.clientId, quoteId: value.quoteId || null, title: value.title,
            status: 'recording', consentAt: now, createdAt: now, updatedAt: now,
            expiresAt: now + MEETING_RETENTION_DAYS * 86400000,
            chunkCount: 0, uploadedChunks: 0, processedChunks: 0, durationMs: 0,
            revision: 0, error: null, attempts: 0, report: null,
        };
        transaction.create(ref, data);
        return serializeMeeting(ref.id, data);
    });
}

export function validateChunkMetadata(request: Request, rawIndex: string) {
    if (!/^\d{1,4}$/.test(rawIndex)) throw new MeetingError(400, 'Ongeldig audiofragment.');
    const index = Number(rawIndex);
    const mimeType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
    const durationHeader = request.headers.get('x-duration-ms');
    const startHeader = request.headers.get('x-start-ms');
    const durationMs = Number(durationHeader);
    const startMs = Number(startHeader);
    if (index >= MEETING_MAX_CHUNKS || !['audio/mp4', 'audio/webm', 'audio/mpeg', 'audio/x-m4a', 'audio/wav'].includes(mimeType)
        || !durationHeader || !startHeader || !Number.isSafeInteger(durationMs) || durationMs <= 0 || durationMs > 5 * 60000
        || !Number.isSafeInteger(startMs) || startMs < 0 || startMs + durationMs > MEETING_MAX_DURATION_MS + 1000) {
        throw new MeetingError(400, 'Ongeldig audioformaat of te lang audiofragment.');
    }
    return { index, mimeType, durationMs, startMs };
}

export async function readBoundedAudio(request: Request): Promise<Buffer> {
    const contentLength = Number(request.headers.get('content-length'));
    if (contentLength > MEETING_MAX_CHUNK_BYTES) throw new MeetingError(413, 'Het audiofragment is te groot.');
    if (!request.body) throw new MeetingError(400, 'Het audiofragment is leeg.');
    const reader = request.body.getReader();
    const parts: Uint8Array[] = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MEETING_MAX_CHUNK_BYTES) {
                await reader.cancel();
                throw new MeetingError(413, 'Het audiofragment is te groot.');
            }
            parts.push(value);
        }
    } finally { reader.releaseLock(); }
    if (!total) throw new MeetingError(400, 'Het audiofragment is leeg.');
    return Buffer.concat(parts);
}

export async function uploadMeetingChunk(uid: string, id: string, index: string, request: Request) {
    const metadata = validateChunkMetadata(request, index);
    const { ref, data: meetingData } = await getMeetingForOwner(id, uid);
    if (meetingData.status !== 'recording') {
        const existing = await ref.collection('chunks').doc(chunkDocumentId(metadata.index)).get();
        if (!existing.exists) throw new MeetingError(409, 'De opname is al afgesloten.');
    }
    const audio = await readBoundedAudio(request);
    const sha256 = createHash('sha256').update(audio).digest('hex');
    const chunkRef = ref.collection('chunks').doc(chunkDocumentId(metadata.index));
    const path = meetingAudioPath(uid, id, metadata.index);
    const file = meetingBucket().file(path);
    // GCS create-only: een retry mag bestaand audio nooit overschrijven.
    try {
        await file.save(audio, { resumable: false, contentType: metadata.mimeType, preconditionOpts: { ifGenerationMatch: 0 },
            metadata: { cacheControl: 'private, no-store', metadata: { sha256, startMs: String(metadata.startMs), durationMs: String(metadata.durationMs) } } });
    } catch (error) {
        if ((error as { code?: number }).code !== 412) throw error;
        const [stored] = await file.getMetadata();
        if (stored.metadata?.sha256 !== sha256 || stored.contentType !== metadata.mimeType
            || stored.metadata?.startMs !== String(metadata.startMs) || stored.metadata?.durationMs !== String(metadata.durationMs)) {
            throw new MeetingError(409, 'Een ander audiofragment is al onder dit nummer opgeslagen.');
        }
    }
    try {
        return await initFirebaseAdmin().firestore.runTransaction(async (transaction) => {
            const [meeting, chunk] = await Promise.all([transaction.get(ref), transaction.get(chunkRef)]);
            const data = meeting.data();
            if (!data || data.userId !== uid || data.deletedAt || data.expiresAt <= Date.now()) throw new MeetingError(404, 'Gesprek niet gevonden.');
            if (chunk.exists) {
                if (chunk.data()?.sha256 !== sha256) throw new MeetingError(409, 'Dit audiofragment wijkt af van het opgeslagen fragment.');
                return { chunk: { ...chunk.data(), path: undefined } };
            }
            if (data.status !== 'recording') throw new MeetingError(409, 'De opname is al afgesloten.');
            const storedChunk = { ...metadata, bytes: audio.byteLength, sha256, path, createdAt: Date.now() };
            transaction.create(chunkRef, storedChunk);
            transaction.update(ref, { uploadedChunks: FieldValue.increment(1), durationMs: Math.max(data.durationMs || 0, metadata.startMs + metadata.durationMs), updatedAt: Date.now() });
            return { chunk: { ...storedChunk, path: undefined } };
        });
    } catch (error) {
        // Alleen tombstones of afgewezen nieuwe fragmenten opruimen; geldige gelijktijdige retries behouden.
        try {
            const [current, storedChunk] = await Promise.all([ref.get(), chunkRef.get()]);
            if (!current.exists || current.data()?.deletedAt || (current.data()?.status !== 'recording' && !storedChunk.exists)) {
                await file.delete({ ignoreNotFound: true });
            }
        } catch { /* De bewaartermijn ruimt een achtergebleven blob alsnog op; uploadfout blijft zichtbaar. */ }
        throw error;
    }
}

export async function queueMeeting(uid: string, id: string, input: unknown, retry = false) {
    const parsed = retry ? null : z.object({ chunkCount: z.number().int().min(1).max(MEETING_MAX_CHUNKS) }).strict().parse(input);
    const { ref } = await getMeetingForOwner(id, uid);
    return initFirebaseAdmin().firestore.runTransaction(async (transaction) => {
        const meeting = await transaction.get(ref);
        const data = meeting.data()!;
        if (data.userId !== uid || data.deletedAt || data.expiresAt <= Date.now()) throw new MeetingError(404, 'Gesprek niet gevonden.');
        if (['queued', 'transcribing', 'analyzing', 'ready'].includes(data.status)) {
            if (parsed && data.chunkCount !== parsed.chunkCount) throw new MeetingError(409, 'Het aantal audiofragmenten wijkt af.');
            return serializeMeeting(ref.id, data);
        }
        if (retry && data.status !== 'error') throw new MeetingError(409, 'Dit gesprek kan nu niet opnieuw worden verwerkt.');
        const count = parsed?.chunkCount || data.chunkCount;
        if (!count) throw new MeetingError(400, 'Upload eerst de opname.');
        const chunks = await transaction.get(ref.collection('chunks').orderBy('index'));
        validateChunkSequence(chunks.docs.map((doc) => doc.data()), count);
        const update = { status: 'queued', chunkCount: count, error: null, attempts: 0, nextAttemptAt: 0, leaseToken: null, leaseUntil: 0, updatedAt: Date.now() };
        transaction.update(ref, update);
        return serializeMeeting(ref.id, { ...data, ...update });
    });
}

export function validateChunkSequence(chunks: DocumentData[], count: number): void {
    if (chunks.length !== count || chunks.some((chunk, index) => chunk.index !== index)) throw new MeetingError(409, 'Nog niet alle audiofragmenten zijn opgeslagen. Probeer de upload opnieuw.');
    let previousEnd = 0;
    for (const chunk of chunks) {
        if (chunk.startMs < previousEnd - 1000 || chunk.startMs > previousEnd + 1000) throw new MeetingError(409, 'De audiofragmenten sluiten niet aan. Controleer de opname.');
        previousEnd = chunk.startMs + chunk.durationMs;
    }
    if (previousEnd > MEETING_MAX_DURATION_MS + 1000) throw new MeetingError(400, 'De opname is langer dan 90 minuten.');
}

export async function tombstoneMeeting(ref: DocumentReference, uid?: string): Promise<void> {
    await initFirebaseAdmin().firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const data = snapshot.data();
        if (!data || (uid && data.userId !== uid)) throw new MeetingError(404, 'Gesprek niet gevonden.');
        // Een tombstone blijft bestaan: oude uploads/workers kunnen het gesprek niet terugbrengen.
        transaction.set(ref, { userId: data.userId, deletedAt: data.deletedAt || Date.now(), cleanupPending: true,
            status: 'deleted', updatedAt: Date.now() });
    });
}

export async function cleanupMeeting(ref: DocumentReference): Promise<void> {
    const snapshot = await ref.get();
    const data = snapshot.data();
    if (!data?.deletedAt) return;
    await meetingBucket().deleteFiles({ prefix: `client-meetings/${data.userId}/${ref.id}/`, force: true });
    for (const name of ['chunks', 'transcripts']) await initFirebaseAdmin().firestore.recursiveDelete(ref.collection(name));
    await ref.update({ cleanupPending: false, cleanedAt: Date.now() });
}

export function canClaimMeeting(data: DocumentData, now: number): boolean {
    return !data.deletedAt && data.expiresAt > now && ['queued', 'transcribing', 'analyzing'].includes(data.status)
        && (!data.leaseUntil || data.leaseUntil <= now) && (!data.nextAttemptAt || data.nextAttemptAt <= now);
}

export async function claimMeeting(ref: DocumentReference): Promise<string | null> {
    return initFirebaseAdmin().firestore.runTransaction(async (transaction) => {
        const data = (await transaction.get(ref)).data();
        const now = Date.now();
        if (!data || !canClaimMeeting(data, now)) return null;
        const leaseToken = randomUUID();
        transaction.update(ref, { leaseToken, leaseUntil: now + MEETING_LEASE_MS, status: data.status === 'analyzing' ? 'analyzing' : 'transcribing', updatedAt: now });
        return leaseToken;
    });
}

export async function withMeetingLease(ref: DocumentReference, leaseToken: string, update: DocumentData,
    extraWrite?: { ref: DocumentReference; data: DocumentData }): Promise<void> {
    await initFirebaseAdmin().firestore.runTransaction(async (transaction) => {
        const data = (await transaction.get(ref)).data();
        if (!data || data.deletedAt || data.expiresAt <= Date.now() || data.leaseToken !== leaseToken || data.leaseUntil <= Date.now()) {
            throw new MeetingError(409, 'De verwerking is overgenomen of het gesprek is verwijderd.');
        }
        transaction.update(ref, { ...update, updatedAt: Date.now() });
        if (extraWrite) transaction.set(extraWrite.ref, extraWrite.data);
    });
}
