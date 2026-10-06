import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { getQuoteVisitReminders, OPEN_VISIT_REMINDER_STATUSES } from '@/lib/quote-visit-reminder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AMSTERDAM_TIME_ZONE = 'Europe/Amsterdam';
const CALVORA_BASE_URL = 'https://app.calvora.nl';

type FirestoreTimestampLike = {
  toDate?: () => Date;
  seconds?: number;
  _seconds?: number;
};

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function resolveAutomationUid(request: Request): string | null {
  const expectedSecret = process.env.N8N_HEADER_SECRET?.trim() || '';
  const providedSecret = request.headers.get('x-offertehulp-secret')?.trim() || '';
  if (!expectedSecret || !providedSecret || !safeEqual(providedSecret, expectedSecret)) return null;

  return request.headers.get('x-offertehulp-user-id')?.trim()
    || process.env.CALVORA_USER_ID?.trim()
    || null;
}

function timestampToDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  if (!value || typeof value !== 'object') return null;

  const timestamp = value as FirestoreTimestampLike;
  if (typeof timestamp.toDate === 'function') {
    const parsed = timestamp.toDate();
    return parsed instanceof Date && Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  const seconds = typeof timestamp.seconds === 'number'
    ? timestamp.seconds
    : timestamp._seconds;
  return typeof seconds === 'number' && Number.isFinite(seconds)
    ? new Date(seconds * 1000)
    : null;
}

function toIsoDate(value: unknown): string | null {
  return timestampToDate(value)?.toISOString() || null;
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function getClientName(data: Record<string, unknown>, fallback = 'Onbekende klant'): string {
  const info = data.klantinformatie && typeof data.klantinformatie === 'object'
    ? data.klantinformatie as Record<string, unknown>
    : {};
  const company = cleanText(info.bedrijfsnaam);
  if (company) return company;

  const person = [cleanText(info.voornaam), cleanText(info.achternaam)].filter(Boolean).join(' ');
  return person || fallback;
}

function getQuoteTitle(data: Record<string, unknown>): string {
  return cleanText(data.titel)
    || cleanText(data.title)
    || cleanText(data.werkomschrijving)
    || 'Offerte';
}

function getAmsterdamDateTime(now = new Date()): string {
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: AMSTERDAM_TIME_ZONE,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(now);
}

function unauthorized(): NextResponse {
  return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
}

export async function GET(request: Request): Promise<NextResponse> {
  const uid = resolveAutomationUid(request);
  if (!uid) return unauthorized();

  try {
    const { firestore } = initFirebaseAdmin();
    const [quotesSnapshot, invoicesSnapshot, planningSnapshot] = await Promise.all([
      firestore.collection('quotes').where('userId', '==', uid).get(),
      firestore.collection('invoices').where('userId', '==', uid).get(),
      firestore.collection('planning_entries').where('userId', '==', uid).get(),
    ]);

    const acceptedQuoteIds = new Set<string>();
    invoicesSnapshot.docs.forEach((invoice) => {
      const data = invoice.data() as Record<string, unknown>;
      if (data.archived === true) return;
      if (data.status !== 'gedeeltelijk_betaald' && data.status !== 'betaald') return;
      const context = data.combinedContext && typeof data.combinedContext === 'object'
        ? data.combinedContext as Record<string, unknown> : {};
      const quoteIds = [data.quoteId,
        ...(Array.isArray(data.combinedQuoteIds) ? data.combinedQuoteIds : []),
        ...(Array.isArray(context.quoteIds) ? context.quoteIds : [])];
      quoteIds.forEach((value) => {
        const quoteId = cleanText(value);
        if (quoteId) acceptedQuoteIds.add(quoteId);
      });
    });

    const visitReminders = getQuoteVisitReminders(
      quotesSnapshot.docs.map((quote) => {
        const data = quote.data() as Record<string, unknown>;
        const client = data.klantinformatie && typeof data.klantinformatie === 'object'
          ? data.klantinformatie as Record<string, unknown> : {};
        return {
          id: quote.id,
          clientId: cleanText(data.clientId) || cleanText(client.clientId),
          clientName: getClientName(data, ''),
          status: cleanText(data.status) || 'concept',
          archived: data.archived === true,
          createdAt: timestampToDate(data.createdAt),
        };
      }),
      planningSnapshot.docs.map((planning) => {
        const data = planning.data() as Record<string, unknown>;
        const cache = data.cache && typeof data.cache === 'object'
          ? data.cache as Record<string, unknown> : {};
        return {
          id: planning.id,
          quoteId: cleanText(data.quoteId),
          clientName: cleanText(cache.clientName) || cleanText(cache.projectTitle),
          planningType: cleanText(data.planningType),
          status: cleanText(data.status),
          startDate: timestampToDate(data.startDate),
          endDate: timestampToDate(data.endDate),
          scheduledHours: Number(data.scheduledHours),
        };
      }),
      acceptedQuoteIds,
    );
    const visitsByQuoteId = new Map(visitReminders.map((visit) => [visit.quoteId, visit]));

    const quotes = quotesSnapshot.docs
      .filter((quote) => visitsByQuoteId.has(quote.id))
      .map((quote) => {
        const data = quote.data() as Record<string, unknown>;
        const offerteNummer = Number(data.offerteNummer);
        const visit = visitsByQuoteId.get(quote.id)!;
        return {
          id: quote.id,
          offerteNummer: Number.isFinite(offerteNummer) ? offerteNummer : null,
          klant: getClientName(data),
          titel: getQuoteTitle(data),
          status: cleanText(data.status) || 'concept',
          createdAt: toIsoDate(data.createdAt),
          updatedAt: toIsoDate(data.updatedAt),
          url: `${CALVORA_BASE_URL}/offertes/${encodeURIComponent(quote.id)}`,
          archived: data.archived === true,
          visitedAt: visit.visitedAt,
          planningEntryId: visit.planningEntryId,
        };
      })
      .sort((left, right) => {
        const leftNumber = left.offerteNummer ?? 0;
        const rightNumber = right.offerteNummer ?? 0;
        if (leftNumber !== rightNumber) return rightNumber - leftNumber;
        return (right.updatedAt || '').localeCompare(left.updatedAt || '');
      });

    return NextResponse.json({
      ok: true,
      visitsOnly: true,
      shouldAlert: quotes.length > 0,
      count: quotes.length,
      statuses: OPEN_VISIT_REMINDER_STATUSES,
      timezone: AMSTERDAM_TIME_ZONE,
      checkedAt: new Date().toISOString(),
      checkedAtLocal: getAmsterdamDateTime(),
      message: quotes.length > 0
        ? `Je moet nog ${quotes.length} offerte${quotes.length === 1 ? '' : 's'} maken na je bezoek.`
        : 'Er staan geen offertes meer open na een bezoek.',
      quotes,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Concept-offertes voor Telegram-herinnering ophalen mislukt:', error);
    return NextResponse.json({ ok: false, error: 'Openstaande offertes controleren mislukt.' }, { status: 500 });
  }
}
