import { z } from 'zod';

const text = z.string().trim().max(500).nullable().default(null);
export const intakeClientSchema = z.object({
    client_name: text, phone: text,
    email: z.string().trim().max(320).nullable().default(null),
    address: text, city: text, job_title: text,
    appointment_date: text, appointment_time: text,
    appointment_status: z.enum(['not_found', 'pending', 'confirmed']).default('not_found'),
    appointment_evidence: z.string().trim().max(4000).nullable().default(null),
});
export type IntakeClient = z.infer<typeof intakeClientSchema>;
export interface IntakeResult {
    client_id: string; project_id: string; appointment_id: string | null;
    appointment_status: 'none' | 'pending' | 'scheduled' | 'cancelled' | 'completed';
    appointment_date: string | null; appointment_time: string | null;
    telegram_message: string | null; calendar_synced?: boolean; google_calendar_event_id?: string | null;
}
export interface IntakeSession {
    id: string; revision: number; client: IntakeClient;
    state: 'draft' | 'processing' | 'done' | 'error';
    createdAt: number; updatedAt: number; result?: IntakeResult;
    error?: string; reminderDueAt?: number | null; reminderSentAt?: number | null;
}
export const EMPTY_INTAKE_CLIENT: IntakeClient = intakeClientSchema.parse({});

// Ontbrekende informatie in een vervolgbericht mag bestaande gegevens niet wissen.
export function mergeIntakeExtraction(current: IntakeClient, incoming: IntakeClient): IntakeClient {
    const merged = { ...current };
    for (const key of ['client_name', 'phone', 'email', 'address', 'city', 'job_title', 'appointment_evidence'] as const) {
        if (incoming[key]) merged[key] = incoming[key];
    }
    if (incoming.appointment_status !== 'not_found') {
        merged.appointment_status = incoming.appointment_status;
        // Een expliciet nieuw maar onduidelijk moment niet invullen met een oude datum.
        merged.appointment_date = incoming.appointment_date;
        merged.appointment_time = incoming.appointment_time;
    }
    return merged;
}
export function validateIntakeClient(client: IntakeClient, previous?: IntakeClient, now = new Date()): string | null {
    if (!client.phone && !client.email && !(client.client_name && client.city)) return 'Vul een telefoonnummer, e-mailadres of klantnaam en woonplaats in.';
    if (client.email && !z.string().email().safeParse(client.email).success) return 'Controleer het e-mailadres.';
    const date = client.appointment_date;
    const time = client.appointment_time;
    if (client.appointment_status === 'not_found' && (date || time)) return 'Kies Voorstel of Bevestigd bij een ingevulde afspraakdatum, of wis de datum en tijd.';
    if (!date && (time || client.appointment_status !== 'not_found')) return 'De afspraakdatum ontbreekt. Controleer de datum en het jaartal.';
    if (date) {
        const parsed = new Date(`${date}T12:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return 'Ongeldige afspraakdatum.';
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
        if (date < today && !(previous?.appointment_date === date && previous?.appointment_time === time)) return 'De afspraakdatum ligt in het verleden. Controleer het jaartal.';
    }
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return 'Ongeldige afspraaktijd.';
    if (client.appointment_status === 'confirmed' && !time) return 'De bevestigde afspraaktijd ontbreekt.';
    return null;
}
export function isCompleteIntakeResult(value: unknown): value is IntakeResult {
    if (!value || typeof value !== 'object') return false;
    const r = value as Record<string, unknown>;
    if (typeof r.client_id !== 'string' || !r.client_id || typeof r.project_id !== 'string' || !r.project_id) return false;
    if (r.appointment_status === 'pending' || r.appointment_status === 'scheduled') return Boolean(r.appointment_id && r.appointment_date && r.appointment_time && r.calendar_synced === true && r.google_calendar_event_id);
    return ['none', 'cancelled', 'completed'].includes(String(r.appointment_status));
}
