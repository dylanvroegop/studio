import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { initFirebaseAdmin } from '@/firebase/admin';
import { loadJobFinanceReports } from '@/lib/job-finance-report-server';
import { claimJobReportPart, acknowledgeJobReportPart } from '@/lib/job-finance-delivery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'no-store' };
function owner(request: Request): string | null {
  const expected = Buffer.from(process.env.N8N_HEADER_SECRET?.trim() || '');
  const supplied = Buffer.from(request.headers.get('x-offertehulp-secret')?.trim() || '');
  return expected.length > 0 && expected.length === supplied.length && timingSafeEqual(expected, supplied)
    ? process.env.CALVORA_USER_ID?.trim() || null : null;
}

/** Alleen voorbeeld: geen reserveringen, geen verzending en geen financiële mutaties. */
export async function GET(request: Request): Promise<NextResponse> {
  const uid = owner(request);
  if (!uid) return NextResponse.json({ ok: false }, { status: 401, headers });
  try {
    return NextResponse.json({ ok: true, version: 1, timezone: 'Europe/Amsterdam', reports: await loadJobFinanceReports(uid) }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: 'Klusrapporten konden niet volledig worden opgehaald.' }, { status: 503, headers });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const uid = owner(request);
  if (!uid) return NextResponse.json({ ok: false }, { status: 401, headers });
  const body = await request.json().catch(() => null);
  if (!body || !['prepare', 'claim', 'sent'].includes(body.action)) return NextResponse.json({ ok: false }, { status: 400, headers });
  try {
    const { firestore } = initFirebaseAdmin();
    if (body.action === 'prepare') {
      const reports = await loadJobFinanceReports(uid);
      const collection = firestore.collection('users').doc(uid).collection('jobFinanceReports');
      for (const report of reports) {
        const ref = collection.doc(report.invoiceId);
        await firestore.runTransaction(async transaction => {
          const existing = await transaction.get(ref);
          if (!existing.exists) transaction.create(ref, report);
        });
      }
      // Ook ongereserveerde delen van een eerdere onderbroken uitvoering komen terug.
      const saved = await collection.get();
      const messages: Array<{ invoiceId: string; part: number }> = [];
      const uncertain: Array<{ invoiceId: string; part: number }> = [];
      for (const report of saved.docs) {
        const deliveries = await report.ref.collection('deliveries').get();
        const states = new Map(deliveries.docs.map(doc => [Number(doc.id), doc.data().state]));
        const parts = report.data().messages;
        if (!Array.isArray(parts)) continue;
        parts.forEach((_, part) => {
          if (!states.has(part)) messages.push({ invoiceId: report.id, part });
          if (states.get(part) === 'sending') uncertain.push({ invoiceId: report.id, part });
        });
      }
      return NextResponse.json({ ok: true, version: 1, messages, uncertain }, { headers });
    }
    if (typeof body.invoiceId !== 'string' || !/^[\w-]{1,128}$/.test(body.invoiceId)
      || !Number.isInteger(body.part) || body.part < 0) return NextResponse.json({ ok: false }, { status: 400, headers });
    if (body.action === 'claim') {
      return NextResponse.json({ ok: true, ...await claimJobReportPart(firestore, uid, body.invoiceId, body.part) }, { headers });
    }
    if (typeof body.token !== 'string' || !Number.isInteger(body.telegramMessageId) || body.telegramMessageId <= 0) {
      return NextResponse.json({ ok: false }, { status: 400, headers });
    }
    await acknowledgeJobReportPart(firestore, uid, body.invoiceId, body.part, body.token, body.telegramMessageId);
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: 'Klusrapport verwerken mislukt; controleer de uitvoering voordat je opnieuw verstuurt.' }, { status: 503, headers });
  }
}
