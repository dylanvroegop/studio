import { initFirebaseAdmin } from '@/firebase/admin';
import { dateSequence, syncGpsHoursForDates } from '@/lib/gps-hour-sync';

async function main() {
  const uid = process.env.CALVORA_USER_ID?.trim();
  if (!uid) throw new Error('CALVORA_USER_ID ontbreekt.');
  const from = process.argv[2] || '2026-01-01';
  const to = process.argv[3] || new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const { firestore } = initFirebaseAdmin();
  const result = await syncGpsHoursForDates(firestore, uid, dateSequence(from, to));
  process.stdout.write(`${JSON.stringify({ from, to, ...result })}\n`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
