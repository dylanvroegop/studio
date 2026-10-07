import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as firebaseAdmin from '../firebase/admin';
import type { DocumentReference } from 'firebase-admin/firestore';
import {
    assertMeetingQuoteClient, canClaimMeeting, claimMeeting, withMeetingLease, createMeetingSchema, MEETING_MAX_CHUNK_BYTES,
    readBoundedAudio, serializeMeeting, validateChunkMetadata, validateChunkSequence,
} from '../lib/client-meetings-server';
import { normalizeMeetingMeasurement, validateAndPrepareMeetingReport, validateTranscriptSegments } from '../lib/client-meetings-ai';
import type { MeetingReport, MeetingTranscriptSegment } from '../lib/client-meetings';

const transcript: MeetingTranscriptSegment[] = [{ id: 'c0-s0', chunkIndex: 0, startMs: 0, endMs: 60000, speaker: null,
    text: 'De kast is 3,20 meter breed. Nee, correctie: 3,10 meter. MDF 18 millimeter, misschien groen. De oude scharnieren hergebruiken.' }];
function report(): MeetingReport {
    return { projectName: 'Kast', description: 'Kast vervangen. Breedte controleren.', items: [{ id: 'maat-1', section: 'measurement',
        title: 'Breedte kast', detail: 'Eerst 3,20 meter, later expliciet gecorrigeerd naar 3,10 meter. Controleren.',
        status: 'contradiction', basis: 'spoken', priority: 'high', reviewed: true,
        evidence: [{ segmentId: 'c0-s0', quote: 'De kast is 3,20 meter breed. Nee, correctie: 3,10 meter.' }],
        measurement: { element: 'Kast', dimension: 'Breedte', value: '3,10', unit: 'meter', normalizedValue: 999, normalizedUnit: 'cm' },
    }] };
}

test('consent is required and IDs cannot contain storage paths', () => {
    assert.equal(createMeetingSchema.safeParse({ id: 'a/../b', clientId: 'abc', title: 'Gesprek', consent: true }).success, false);
    assert.equal(createMeetingSchema.safeParse({ id: '6d7dfb5e-0a9b-4ed9-8de8-fb207d428b95', clientId: 'abc', title: 'Gesprek', consent: false }).success, false);
});

test('client linkage accepts canonical ID and rejects any conflicting identity', () => {
    assert.doesNotThrow(() => assertMeetingQuoteClient({ klantinformatie: { clientId: 'client-a' } }, 'client-a'));
    assert.throws(() => assertMeetingQuoteClient({ klantinformatie: { clientId: 'client-a' }, clientId: 'client-b' }, 'client-a'));
    assert.throws(() => assertMeetingQuoteClient({ klantinformatie: { naam: 'Zelfde naam' } }, 'client-a'));
    assert.throws(() => assertMeetingQuoteClient({ klantinformatie: { clientId: 'client-a' }, clientId: 123 }, 'client-a'));
});

test('all upload chunks must exist and follow the original order without a gap', () => {
    const chunks = [{ index: 0, startMs: 0, durationMs: 60000 }, { index: 1, startMs: 60000, durationMs: 5000 }];
    assert.doesNotThrow(() => validateChunkSequence(chunks, 2));
    assert.throws(() => validateChunkSequence(chunks.slice(1), 2));
    assert.throws(() => validateChunkSequence([{ ...chunks[0], startMs: 10000 }, chunks[1]], 2));
    assert.throws(() => validateChunkSequence([chunks[0], { ...chunks[1], startMs: 45000 }], 2));
});

test('MP4/WebM codec types and recovered WAV accepted; malformed upload rejected', () => {
    for (const type of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/wav']) {
        const req = new Request('https://local.test', { headers: { 'content-type': type, 'x-start-ms': '0', 'x-duration-ms': '60000' } });
        assert.equal(validateChunkMetadata(req, '0').durationMs, 60000);
    }
    assert.throws(() => validateChunkMetadata(new Request('https://local.test', { headers: { 'content-type': 'text/html' } }), '0'));
    assert.throws(() => validateChunkMetadata(new Request('https://local.test'), '../0'));
});

test('audio is bounded while streaming, without trusting Content-Length', async () => {
    const req = new Request('https://local.test', { method: 'POST', body: new Uint8Array(MEETING_MAX_CHUNK_BYTES + 1) });
    await assert.rejects(() => readBoundedAudio(req), /te groot/);
    assert.deepEqual(await readBoundedAudio(new Request('https://local.test', { method: 'POST', body: new Uint8Array([1, 2, 3]) })), Buffer.from([1, 2, 3]));
});

test('only expired worker leases can be reclaimed; deleted and expired meetings never return', () => {
    const now = 100000;
    const queued = { status: 'queued', expiresAt: now + 1000, leaseUntil: 0 };
    assert.equal(canClaimMeeting(queued, now), true);
    assert.equal(canClaimMeeting({ ...queued, status: 'analyzing', leaseUntil: now - 1 }, now), true);
    assert.equal(canClaimMeeting({ ...queued, status: 'transcribing', leaseUntil: now + 1 }, now), false);
    assert.equal(canClaimMeeting({ ...queued, deletedAt: now - 1 }, now), false);
    assert.equal(canClaimMeeting({ ...queued, expiresAt: now }, now), false);
    assert.equal(canClaimMeeting({ ...queued, nextAttemptAt: now + 1 }, now), false);
    assert.equal(canClaimMeeting({ ...queued, status: 'ready' }, now), false);
});

test('API metadata excludes report and internal lease token', () => {
    const result = serializeMeeting('id', { title: 'Test', leaseToken: 'secret', report: { description: 'Large report' } });
    assert.equal('leaseToken' in result, false);
    assert.equal('report' in result, false);
    assert.equal(result.id, 'id');
});

test('original correction is preserved and normalized only deterministically; AI cannot self-approve', () => {
    const prepared = validateAndPrepareMeetingReport(report(), transcript);
    assert.equal(prepared.items[0].status, 'contradiction');
    assert.equal(prepared.items[0].reviewed, false);
    assert.equal(prepared.items[0].measurement?.value, '3,10');
    assert.equal(prepared.items[0].measurement?.normalizedValue, 3100);
    assert.equal(prepared.items[0].measurement?.normalizedUnit, 'mm');
    assert.equal(prepared.items[0].evidence[0].quote.includes('3,20'), true);
});

test('rejects missing or fabricated evidence, invented measurement and changed original unit', () => {
    const badSource = report(); badSource.items[0].evidence[0].segmentId = 'missing';
    assert.throws(() => validateAndPrepareMeetingReport(badSource, transcript));
    const madeUp = report(); madeUp.items[0].evidence[0].quote = 'Het moet eikenhout zijn.';
    assert.throws(() => validateAndPrepareMeetingReport(madeUp, transcript));
    const madeUpNumber = report(); madeUpNumber.items[0].measurement!.value = '4,20';
    assert.throws(() => validateAndPrepareMeetingReport(madeUpNumber, transcript));
    const partialNumber = report(); partialNumber.items[0].measurement!.value = '3';
    assert.throws(() => validateAndPrepareMeetingReport(partialNumber, transcript));
    const changedUnit = report(); changedUnit.items[0].measurement!.unit = 'cm';
    assert.throws(() => validateAndPrepareMeetingReport(changedUnit, transcript));
});

test('assessments are restricted to clearly labelled risks and questions', () => {
    const invented = report(); invented.items[0].basis = 'assessment';
    assert.throws(() => validateAndPrepareMeetingReport(invented, transcript));
    const question = report(); question.items[0] = { ...question.items[0], section: 'question', basis: 'assessment',
        title: 'Afwerking', detail: 'Ontbrekende informatie: welke afwerking is gekozen?', evidence: [], measurement: null };
    assert.doesNotThrow(() => validateAndPrepareMeetingReport(question, transcript));
});

test('ambiguous separators and verbal/approximate measurements never receive guessed normalizations', () => {
    assert.equal(normalizeMeetingMeasurement('1.200', 'mm'), null);
    assert.equal(normalizeMeetingMeasurement('1,200', 'm'), null);
    assert.equal(normalizeMeetingMeasurement('ongeveer drie', 'meter'), null);
    assert.deepEqual(normalizeMeetingMeasurement('18', 'millimeter'), { value: 18, unit: 'mm' });
});

test('whole-fragment timestamps remain honest and speaker identity is local to each fragment', () => {
    const chunk = { index: 2, startMs: 120000, durationMs: 60000 };
    const ordinary = validateTranscriptSegments({ text: 'Een kast.' }, chunk);
    assert.equal(ordinary[0].startMs, 120000); assert.equal(ordinary[0].endMs, 180000); assert.equal(ordinary[0].speaker, null);
    const speakers = validateTranscriptSegments({ text: 'Een kast.', segments: [{ text: 'Een kast.', start: 2, end: 4, speaker: 'A' }] }, chunk);
    assert.equal(speakers[0].startMs, 122000); assert.match(speakers[0].speaker!, /Fragment 3/);
    assert.throws(() => validateTranscriptSegments({ text: 'kast', segments: [{ text: 'kast', start: 50, end: 49 }] }, chunk));
    assert.throws(() => validateTranscriptSegments({ text: 'kast', segments: [{ text: 'kast', start: 50, end: 99 }] }, chunk));
});


test('transaction fencing prevents writes from deleted, expired and superseded workers', async () => {
    const original = firebaseAdmin.initFirebaseAdmin;
    const ref = { id: 'meeting' } as DocumentReference;
    const writes: string[] = [];
    const data: Record<string, unknown> = { expiresAt: Date.now() + 100000, leaseUntil: Date.now() + 100000, leaseToken: 'current' };
    Object.defineProperty(firebaseAdmin, 'initFirebaseAdmin', { value: () => ({ firestore: { runTransaction: async (callback: (tx: unknown) => Promise<void>) => callback({
        get: async () => ({ data: () => data }), update: () => writes.push('update'), set: () => writes.push('set'),
    }) } }), configurable: true });
    try {
        await assert.rejects(() => withMeetingLease(ref, 'old', { status: 'ready' }));
        assert.equal(writes.length, 0);
        data.deletedAt = Date.now();
        await assert.rejects(() => withMeetingLease(ref, 'current', { status: 'ready' }));
        assert.equal(writes.length, 0);
        delete data.deletedAt;
        data.leaseUntil = Date.now() - 1;
        await assert.rejects(() => withMeetingLease(ref, 'current', { status: 'ready' }));
        assert.equal(writes.length, 0);
        data.leaseUntil = Date.now() + 100000;
        await withMeetingLease(ref, 'current', { status: 'transcribing' }, { ref, data: { segments: [] } });
        assert.deepEqual(writes, ['update', 'set']);
    } finally { Object.defineProperty(firebaseAdmin, 'initFirebaseAdmin', { value: original, configurable: true }); }
});

test('two concurrent worker claims grant only one durable lease', async () => {
    const original = firebaseAdmin.initFirebaseAdmin;
    const ref = { id: 'meeting' } as DocumentReference;
    let data: Record<string, unknown> = { status: 'queued', expiresAt: Date.now() + 100000, leaseUntil: 0 };
    let queue: Promise<unknown> = Promise.resolve();
    Object.defineProperty(firebaseAdmin, 'initFirebaseAdmin', { value: () => ({ firestore: { runTransaction: (callback: (tx: unknown) => Promise<unknown>) => {
        const result = queue.then(() => callback({ get: async () => ({ data: () => ({ ...data }) }), update: (_ref: unknown, update: Record<string, unknown>) => { data = { ...data, ...update }; } }));
        queue = result.catch(() => undefined); return result;
    } } }), configurable: true });
    try {
        const claims = await Promise.all([claimMeeting(ref), claimMeeting(ref)]);
        assert.equal(claims.filter(Boolean).length, 1);
        assert.equal(data.leaseToken, claims.find(Boolean));
        assert.equal(data.status, 'transcribing');
    } finally { Object.defineProperty(firebaseAdmin, 'initFirebaseAdmin', { value: original, configurable: true }); }
});
