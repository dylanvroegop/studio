import { normalizeIdentityPhone, normalizeIdentityText } from './telegram-client-identity';
import { mergeIntakeExtraction, type IntakeClient, type IntakeSession } from './client-intake';

/** Alleen een eenduidige bestaande aanvraag mag door een vervolgscreenshot worden bijgewerkt. */
export function matchAppointmentIntake(sessions: IntakeSession[], incoming: IntakeClient): IntakeSession | null {
    const matches = sessions.filter(session => {
        if (!session.result || ['cancelled', 'completed'].includes(session.result.appointment_status)) return false;
        const existing = session.client;
        const same = (key: 'client_name' | 'phone' | 'email' | 'city'): boolean => {
            const normalize = key === 'phone' ? normalizeIdentityPhone : normalizeIdentityText;
            return Boolean(normalize(incoming[key])) && normalize(incoming[key]) === normalize(existing[key]);
        };
        for (const key of ['client_name', 'phone', 'email', 'city'] as const) {
            const normalize = key === 'phone' ? normalizeIdentityPhone : normalizeIdentityText;
            if (incoming[key] && existing[key] && normalize(incoming[key]) !== normalize(existing[key])) return false;
        }
        return same('phone') || same('email') || (same('client_name') && same('city'));
    });
    if (matches.length === 1) return matches[0];
    const jobMatches = matches.filter(s => incoming.job_title && normalizeIdentityText(s.client.job_title) === normalizeIdentityText(incoming.job_title));
    return jobMatches.length === 1 ? jobMatches[0] : null;
}

export function appointmentFollowup(session: IntakeSession, incoming: IntakeClient): IntakeClient {
    if (!session.result) throw new Error('Kies eerst een verwerkte aanvraag van deze klant.');
    if (incoming.appointment_status === 'not_found') throw new Error('Geen afspraak gevonden. Voeg de screenshot met de datum en reactie van de klant toe.');
    for (const key of ['client_name', 'phone', 'email', 'city'] as const) {
        const normalize = key === 'phone' ? normalizeIdentityPhone : normalizeIdentityText;
        if (incoming[key] && session.client[key] && normalize(incoming[key]) !== normalize(session.client[key])) throw new Error('Deze screenshot bevat andere klantgegevens. Kies de juiste aanvraag.');
    }
    return mergeIntakeExtraction(session.client, incoming);
}

export function intakeCustomerMessage(session?: IntakeSession): string {
    const result = session?.result;
    if (session?.state !== 'done' || !result || result.calendar_synced !== true) return '';
    if (result.appointment_status === 'pending') return result.telegram_message || '';
    if (result.appointment_status !== 'scheduled' || !result.appointment_date || !result.appointment_time) return '';
    const date = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' }).format(new Date(`${result.appointment_date}T12:00:00Z`));
    return `Bedankt voor uw bevestiging. Onze afspraak staat gepland op ${date} om ${result.appointment_time} uur. Tot dan!`;
}
