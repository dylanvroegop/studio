/** Duurzame worker; uitvoeren met npm run meetings:worker, of --once voor één ronde. */
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
import { initFirebaseAdmin } from '../src/firebase/admin';
import { claimMeeting, cleanupMeeting, meetingCollection, tombstoneMeeting } from '../src/lib/client-meetings-server';
import { processMeeting } from '../src/lib/client-meetings-ai';

let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

async function heartbeat(): Promise<void> {
    await initFirebaseAdmin().firestore.collection('client_meeting_worker').doc('status').set({ heartbeatAt: Date.now() });
}

export async function runMeetingWorkerOnce(): Promise<number> {
    await heartbeat();
    const expired = await meetingCollection().where('expiresAt', '<=', Date.now()).limit(20).get();
    for (const doc of expired.docs) await tombstoneMeeting(doc.ref);
    const deleted = await meetingCollection().where('cleanupPending', '==', true).limit(20).get();
    for (const doc of deleted.docs) {
        try { await cleanupMeeting(doc.ref); }
        catch { console.error('Opschonen klantgesprek wordt opnieuw geprobeerd.'); }
    }
    if (!process.env.OPENAI_API_KEY?.trim()) return 0;
    const pending = await meetingCollection().where('status', 'in', ['queued', 'transcribing', 'analyzing']).get();
    let processed = 0;
    for (const doc of pending.docs) {
        if (stopping) break;
        const token = await claimMeeting(doc.ref);
        if (!token) continue;
        await processMeeting(doc.ref, token);
        processed += 1;
    }
    return processed;
}

async function main(): Promise<void> {
    if (!process.env.OPENAI_API_KEY?.trim()) console.error('AI-verwerking wacht op OPENAI_API_KEY. Bewaartermijnen worden wel verwerkt.');
    const timer = setInterval(() => { void heartbeat().catch(() => console.error('Workerstatus tijdelijk niet bereikbaar.')); }, 60000);
    try {
        do {
            try { await runMeetingWorkerOnce(); }
            catch { console.error('Klantgesprekkenworker kon deze ronde niet afronden; probeert opnieuw.'); }
            if (process.argv.includes('--once') || stopping) break;
            await new Promise((resolve) => setTimeout(resolve, 15000));
        } while (!stopping);
    } finally { clearInterval(timer); }
}

if (require.main === module) void main().catch(() => { console.error('Klantgesprekkenworker gestopt.'); process.exitCode = 1; });
