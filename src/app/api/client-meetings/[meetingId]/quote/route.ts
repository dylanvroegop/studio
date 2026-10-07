import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { initFirebaseAdmin } from '@/firebase/admin';
import { buildEmptyQuoteDefaults } from '@/lib/quote-defaults';
import { getConfirmedMeetingItems, meetingReportSchema } from '@/lib/client-meetings';
import { isEditableMeetingQuote, meetingClientToQuote, meetingQuoteNotes, meetingQuoteSource } from '@/lib/client-meeting-quote';
import { authenticateMeetingRequest, meetingCollection, meetingErrorResponse, meetingIdSchema, MeetingError } from '@/lib/client-meetings-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function checkQuoteSize(value: Record<string, unknown>): void {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 850000) {
    throw new MeetingError(413, 'Te veel gegevens voor één offerte. Beperk de gecontroleerde gegevens en probeer opnieuw.');
  }
}

export async function POST(request: Request, { params }: { params: { meetingId: string } }): Promise<NextResponse> {
  try {
    const uid = await authenticateMeetingRequest(request);
    const id = meetingIdSchema.parse(params.meetingId);
    const { revision } = z.object({ revision: z.number().int().nonnegative() }).strict().parse(await request.json());
    const { firestore } = initFirebaseAdmin();
    const quoteId = await firestore.runTransaction(async (tx) => {
      const meetingRef = meetingCollection().doc(id);
      const meeting = (await tx.get(meetingRef)).data();
      if (!meeting || meeting.userId !== uid || meeting.deletedAt || meeting.expiresAt <= Date.now()) throw new MeetingError(404, 'Gesprek niet gevonden.');
      if (meeting.generatedQuoteId) {
        const existing = (await tx.get(firestore.collection('quotes').doc(meeting.generatedQuoteId))).data();
        if (!existing || existing.userId !== uid) throw new MeetingError(409, 'De eerder aangemaakte offerte is niet meer beschikbaar.');
        return String(meeting.generatedQuoteId);
      }
      if (meeting.status !== 'ready' || meeting.revision !== revision) throw new MeetingError(409, 'Sla de laatste controle op voordat je een offerte maakt.');
      const report = meetingReportSchema.parse(meeting.report);
      if (!getConfirmedMeetingItems(report).some((item) => item.section === 'scope')) throw new MeetingError(400, 'Controleer en bevestig eerst minstens één werkzaamheid.');
      const client = (await tx.get(firestore.collection('clients').doc(meeting.clientId))).data();
      if (!client || client.userId !== uid) throw new MeetingError(409, 'De gekozen klant is niet meer beschikbaar.');
      const targetId = meeting.quoteId || `meeting_${id}`;
      const quoteRef = firestore.collection('quotes').doc(targetId);
      const existingQuote = (await tx.get(quoteRef)).data();
      const notes = meetingQuoteNotes(report);
      const source = meetingQuoteSource(id, report, revision);
      if (meeting.quoteId) {
        if (!existingQuote || !isEditableMeetingQuote(existingQuote, uid, meeting.clientId)) throw new MeetingError(409, 'Alleen een ongestuurde conceptofferte van deze klant kan worden aangevuld.');
        const existingNotes = typeof existingQuote.notities === 'string' ? existingQuote.notities.trim() : '';
        if (existingNotes.length + notes.length > 200000) throw new MeetingError(400, 'De offertenotities zijn te lang om dit gesprek toe te voegen.');
        checkQuoteSize({ ...existingQuote, notities: [existingNotes, notes].filter(Boolean).join('\n\n'),
          clientMeetingSources: { ...existingQuote.clientMeetingSources, [id]: source } });
        tx.update(quoteRef, {
          notities: [existingNotes, notes].filter(Boolean).join('\n\n'),
          [`clientMeetingSources.${id}`]: source,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        if (existingQuote) throw new MeetingError(409, 'Deze offerte bestaat al. Vernieuw het gesprek.');
        const counterRef = firestore.collection('counters').doc(`quoteNumber_${uid}`);
        const [counter, user] = await Promise.all([tx.get(counterRef), tx.get(firestore.collection('users').doc(uid))]);
        const next = counter.data()?.next;
        const number = Number.isSafeInteger(next) && next > 0 ? next : 260001;
        tx.set(counterRef, { next: number + 1, userId: uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        const payload = {
          ...buildEmptyQuoteDefaults(user.data() || {}),
          userId: uid, clientId: meeting.clientId, status: 'concept', offerteNummer: number,
          titel: report.projectName, werkomschrijving: report.projectName,
          klantinformatie: meetingClientToQuote(meeting.clientId, client), notities: notes,
          clientMeetingSources: { [id]: source },
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        };
        checkQuoteSize(payload);
        tx.create(quoteRef, payload);
      }
      tx.update(meetingRef, { generatedQuoteId: targetId, updatedAt: Date.now() });
      return String(targetId);
    });
    return NextResponse.json({ quoteId, url: `/offertes/${quoteId}` }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return meetingErrorResponse(error); }
}
