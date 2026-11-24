/** Draait naast de webserver; --once verwerkt één ronde en stopt. */
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
import { initFirebaseAdmin } from '../src/firebase/admin';
import { runClientIntakeReminders } from '../src/lib/client-intake-reminders';

let stopping = false;
let wake: (() => void) | undefined;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { stopping = true; wake?.(); });

async function heartbeat(patch: Record<string, unknown> = {}): Promise<void> {
  await initFirebaseAdmin().firestore.collection('client_intake_worker').doc('status')
    .set({ heartbeatAt: Date.now(), ...patch }, { merge: true });
}

export async function runIntakeWorkerOnce(): Promise<number> {
  await heartbeat({ state: 'running' });
  const count = await runClientIntakeReminders();
  await heartbeat({ state: 'idle', lastCompletedAt: Date.now(), lastSentCount: count });
  return count;
}

async function main(): Promise<void> {
  const pulse = setInterval(() => { void heartbeat().catch(() => console.error('Aanvragenworkerstatus tijdelijk niet bereikbaar.')); }, 60_000);
  try {
    do {
      try { await runIntakeWorkerOnce(); }
      catch {
        console.error('Aanvraagherinneringen konden niet worden gecontroleerd; volgende ronde probeert opnieuw.');
        await heartbeat({ state: 'error' }).catch(() => undefined);
        if (process.argv.includes('--once')) process.exitCode = 1;
      }
      if (process.argv.includes('--once') || stopping) break;
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => { wake = undefined; resolve(); }, 60_000);
        wake = () => { clearTimeout(timer); wake = undefined; resolve(); };
      });
    } while (!stopping);
  } finally { clearInterval(pulse); }
}

if (require.main === module) void main().catch(() => { console.error('Aanvragenworker gestopt.'); process.exitCode = 1; });
