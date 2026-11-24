import { randomUUID } from 'node:crypto';
import { setTimeout, clearTimeout } from 'node:timers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { DocumentData } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '@/firebase/admin';
import { intakeClientSchema, isCompleteIntakeResult, validateIntakeClient, type IntakeSession, type IntakeResult } from '@/lib/client-intake';
import { processClientIntakeImport } from '@/lib/client-intake-import';
import { normalizeIdentityPhone, normalizeIdentityText } from '@/lib/telegram-client-identity';

const COLLECTION = 'client_intake_sessions';
export class IntakeError extends Error {
    constructor(public status: number, message: string, public code = 'INTAKE_ERROR', public session?: IntakeSession) { super(message); }
}
export async function withIntakeDeadline<T>(operation: Promise<T>, milliseconds = 30_000): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new IntakeError(503, 'De verbinding met de gegevensopslag duurt te lang. Probeer opnieuw.', 'STORAGE_TIMEOUT')), milliseconds); })]); }
    finally { if (timer) clearTimeout(timer); }
}
export async function intakeUser(request: Request): Promise<string> {
    const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw new IntakeError(401, 'Log in om aanvragen te openen.');
    try { return (await withIntakeDeadline(initFirebaseAdmin().auth.verifyIdToken(token, true), 15_000)).uid; }
    catch (error) { if (error instanceof IntakeError) throw error; throw new IntakeError(401, 'Log opnieuw in.'); }
}
export function intakeErrorResponse(error: unknown): NextResponse {
    const known = error instanceof IntakeError;
    return NextResponse.json({ error: known ? error.message : error instanceof z.ZodError ? 'Controleer de ingevulde gegevens.' : 'Verwerken is niet gelukt. Je aanvraag blijft bewaard; probeer opnieuw.',
        ...(known ? { code: error.code, ...(error.session ? { session: error.session } : {}) } : {}) },
        { status: known ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 500, headers: { 'Cache-Control': 'no-store' } });
}
function millis(value: unknown): number { return typeof value === 'number' ? value : value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function' ? value.toMillis() : 0; }
export function serializeIntake(id: string, data: DocumentData): IntakeSession {
    return { id, revision: data.revision || 0, client: intakeClientSchema.parse(data.client || {}), state: data.state || 'done',
        createdAt: millis(data.createdAt), updatedAt: millis(data.updatedAt), ...(data.result ? { result: data.result } : {}),
        ...(data.error ? { error: data.error } : {}), reminderDueAt: data.reminderDueAt || null, reminderSentAt: data.reminderSentAt || null };
}

// Historische aanvragen blijven bereikbaar onder hun bestaande import-/sessiesleutel.
async function legacyIntake(uid: string, id: string, data: DocumentData): Promise<IntakeSession & { leadKey: string }> {
    const { firestore } = initFirebaseAdmin();
    const quote = data.project_id ? (await firestore.collection('quotes').doc(data.project_id).get()).data() : null;
    if (!quote || quote.userId !== uid || data.userId !== uid || typeof data.lead_key !== 'string') throw new IntakeError(404, 'Aanvraag niet gevonden.');
    const c = quote.klantinformatie || {};
    const client = intakeClientSchema.parse({ client_name: [c.voornaam, c.achternaam].filter(Boolean).join(' ') || c.bedrijfsnaam || null,
        phone: c.telefoonnummer || null, email: c.emailadres || c['e-mailadres'] || null,
        address: [c.straat, c.huisnummer].filter(Boolean).join(' ') || null, city: c.plaats || null, job_title: quote.titel || null,
        appointment_date: data.appointment_date || null, appointment_time: data.appointment_time || null,
        appointment_status: data.appointment_status === 'scheduled' ? 'confirmed' : data.appointment_status === 'pending' ? 'pending' : 'not_found' });
    const result: IntakeResult = { client_id: data.client_id, project_id: data.project_id, appointment_id: data.appointment_id || null,
        appointment_status: data.appointment_status || 'none', appointment_date: data.appointment_date || null, appointment_time: data.appointment_time || null,
        telegram_message: data.telegram_message || null, calendar_synced: data.calendar_synced === true, google_calendar_event_id: data.google_calendar_event_id || null };
    return { id, revision: 0, client, state: isCompleteIntakeResult(result) ? 'done' : 'error', createdAt: millis(data.createdAt), updatedAt: millis(data.updatedAt), result, leadKey: data.lead_key };
}
export async function listIntakes(uid: string): Promise<IntakeSession[]> {
    const { firestore } = initFirebaseAdmin();
    const [native, legacy] = await Promise.all([
        firestore.collection(COLLECTION).where('userId', '==', uid).get(),
        firestore.collection('telegram_lead_imports').where('userId', '==', uid).get(),
    ]);
    const covered = new Set(native.docs.map(d => d.data().leadKey));
    const sessions = native.docs.map(d => serializeIntake(d.id, d.data()));
    const old = await Promise.all(legacy.docs.filter(d => !covered.has(d.data().lead_key)).map(async d => {
        try { return await legacyIntake(uid, `legacy_${d.id}`, d.data()); } catch (e) { if (e instanceof IntakeError && e.status === 404) return null; throw e; }
    }));
    // Sessiesleutels blijven server-side.
    old.forEach(s => { if (s) sessions.push(serializeIntake(s.id, s)); });
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}
const requestSchema = z.object({ id: z.string().regex(/^(?:[0-9a-f-]{36}|legacy_[0-9a-f]{64})$/).optional(), revision: z.number().int().nonnegative().optional(),
    client: intakeClientSchema, action: z.enum(['save', 'process']) }).strict();

export async function saveIntake(uid: string, raw: unknown): Promise<IntakeSession> {
    const value = requestSchema.parse(raw);
    const id = value.id || randomUUID();
    const { firestore } = initFirebaseAdmin();
    const ref = firestore.collection(COLLECTION).doc(id);
    let legacy: (IntakeSession & { leadKey: string }) | undefined;
    if (id.startsWith('legacy_')) {
        const old = await firestore.collection('telegram_lead_imports').doc(id.slice(7)).get();
        if (!old.exists) throw new IntakeError(404, 'Aanvraag niet gevonden.');
        legacy = await legacyIntake(uid, id, old.data()!);
    }
    const historical = value.action === 'process' ? (await listIntakes(uid)).filter(s => s.id.startsWith('legacy_') && s.id !== id) : [];
    const lease = randomUUID();
    const now = Date.now();
    const saved = await firestore.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const previous: DocumentData | null = snap.exists ? snap.data()! : legacy ? { ...legacy, userId: uid } : null;
        if (previous && previous.userId !== uid) throw new IntakeError(404, 'Aanvraag niet gevonden.');
        if (previous && value.revision !== (previous.revision || 0)) throw new IntakeError(409, 'Deze aanvraag is intussen gewijzigd. Open de actuele versie voordat je opnieuw opslaat.', 'REVISION_CONFLICT', serializeIntake(id, previous));
        if (previous && previous.processingUntil > now) throw new IntakeError(409, 'Deze aanvraag wordt al verwerkt. Wacht even en vernieuw de lijst.', 'PROCESSING', serializeIntake(id, previous));
        if (!previous?.result && value.action === 'process') {
            // Een tweede tab of nieuwe inzending voor dezelfde klus mag geen tweede offerte maken.
            const guard = firestore.collection('client_intake_locks').doc(uid);
            await tx.get(guard);
            const existing = await tx.get(firestore.collection(COLLECTION).where('userId', '==', uid));
            const candidates = [...existing.docs.filter(d => d.id !== id).map(d => serializeIntake(d.id, d.data())), ...historical];
            const matches = candidates.filter(s => {
                if (s.state === 'draft' && !s.result && previous && (s.createdAt > previous.createdAt || (s.createdAt === previous.createdAt && s.id > id))) return false;
                const c = s.client;
                if (!c || !normalizeIdentityText(c.job_title) || normalizeIdentityText(c.job_title) !== normalizeIdentityText(value.client.job_title)) return false;
                return (value.client.phone && normalizeIdentityPhone(c.phone) === normalizeIdentityPhone(value.client.phone))
                    || (value.client.email && normalizeIdentityText(c.email) === normalizeIdentityText(value.client.email))
                    || (value.client.client_name && value.client.city && normalizeIdentityText(c.client_name) === normalizeIdentityText(value.client.client_name) && normalizeIdentityText(c.city) === normalizeIdentityText(value.client.city));
            });
            if (matches.length) throw new IntakeError(409, 'Er bestaat al een aanvraag voor deze klant en klus. Open die aanvraag voor een aanvulling.', 'EXISTING_INTAKE', matches.length === 1 ? matches[0] : undefined);
            tx.set(guard, { updatedAt: now });
        }
        if (value.action === 'process') {
            const invalid = validateIntakeClient(value.client, previous?.result ? { ...previous.client, appointment_date: previous.result.appointment_date, appointment_time: previous.result.appointment_time } : undefined);
            if (invalid) throw new IntakeError(400, invalid, 'INVALID_APPOINTMENT');
        }
        const clearable = ['client_name', 'phone', 'email', 'address', 'city', 'job_title'] as const;
        const clearFields = clearable.filter(key => !value.client[key] && (previous?.clearFields?.includes(key) || previous?.client?.[key]));
        const data = { ...previous, clearFields, userId: uid, leadKey: previous?.leadKey || `app_intake_${id}`,
            revision: (previous?.revision || 0) + 1, client: value.client, state: value.action === 'process' ? 'processing' : 'draft',
            createdAt: previous?.createdAt || now, updatedAt: now, error: null,
            processingToken: lease, processingUntil: value.action === 'process' ? now + 10 * 60_000 : null,
            reminderDueAt: previous?.reminderDueAt || null,
        };
        tx.set(ref, data, { merge: true });
        return data;
    });
    if (value.action === 'save') return serializeIntake(id, saved);
    let result: IntakeResult | undefined;
    let failure: { status: number; message: string; code: string } | undefined;
    try {
        const response = await processClientIntakeImport(new Request('http://internal/client-intake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lead_key: saved.leadKey, client: value.client, clear_fields: saved.clearFields }) }), uid);
        const body = await response.json();
        if (!response.ok || body.success !== true || !isCompleteIntakeResult(body)) failure = { status: response.ok ? 503 : response.status, message: body.message || 'De afspraak is nog niet volledig opgeslagen. Probeer opnieuw.', code: body.code || 'IMPORT_INCOMPLETE' };
        else result = body;
    } catch { failure = { status: 503, message: 'De verwerking is onderbroken. Probeer opnieuw met deze aanvraag.', code: 'IMPORT_FAILED' }; }
    const session = await firestore.runTransaction(async tx => {
        const latest = (await tx.get(ref)).data()!;
        if (latest.processingToken !== lease) throw new IntakeError(409, 'De aanvraag is intussen opnieuw verwerkt.', 'REVISION_CONFLICT', serializeIntake(id, latest));
        const client = { ...value.client };
        if (result && ['pending', 'scheduled'].includes(result.appointment_status)) {
            client.appointment_date = result.appointment_date; client.appointment_time = result.appointment_time;
            client.appointment_status = result.appointment_status === 'scheduled' ? 'confirmed' : 'pending';
        }
        const patch = { revision: latest.revision + 1, updatedAt: Date.now(), state: failure ? 'error' : 'done', error: failure?.message || null,
            client, ...(result ? { result, clearFields: [] } : {}), processingUntil: null, processingToken: null,
            reminderDueAt: result?.appointment_status === 'pending' && !latest.reminderSentAt ? latest.reminderDueAt || Date.now() + 2 * 86400_000 : null,
        };
        tx.set(ref, patch, { merge: true });
        return serializeIntake(id, { ...latest, ...patch });
    });
    if (failure) throw new IntakeError(failure.status, failure.message, failure.code, session);
    return session;
}
