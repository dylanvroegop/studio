import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';

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

function getClientName(data: Record<string, unknown>): string {
  const info = data.klantinformatie && typeof data.klantinformatie === 'object'
    ? data.klantinformatie as Record<string, unknown>
    : {};
  const company = cleanText(info.bedrijfsnaam);
  if (company) return company;

  const person = [cleanText(info.voornaam), cleanText(info.achternaam)].filter(Boolean).join(' ');
  return person || 'Onbekende klant';
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
    const [quotesSnapshot, invoicesSnapshot] = await Promise.all([
      firestore.collection('quotes').where('userId', '==', uid).get(),
      firestore.collection('invoices').where('userId', '==', uid).get(),
    ]);

    const acceptedQuoteIds = new Set<string>();
    invoicesSnapshot.docs.forEach((invoice) => {
      const data = invoice.data() as Record<string, unknown>;
      if (data.archived === true) return;
      if (data.status !== 'gedeeltelijk_betaald' && data.status !== 'betaald') return;
      const quoteId = cleanText(data.quoteId);
      if (quoteId) acceptedQuoteIds.add(quoteId);
    });

    const quotes = quotesSnapshot.docs
      .map((quote) => {
        const data = quote.data() as Record<string, unknown>;
        const offerteNummer = Number(data.offerteNummer);
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
        };
      })
      .filter((quote) => quote.status === 'concept' && !quote.archived && !acceptedQuoteIds.has(quote.id))
      .sort((left, right) => {
        const leftNumber = left.offerteNummer ?? 0;
        const rightNumber = right.offerteNummer ?? 0;
        if (leftNumber !== rightNumber) return rightNumber - leftNumber;
        return (right.updatedAt || '').localeCompare(left.updatedAt || '');
      });

    return NextResponse.json({
      ok: true,
      shouldAlert: quotes.length > 0,
      count: quotes.length,
      status: 'concept',
      timezone: AMSTERDAM_TIME_ZONE,
      checkedAt: new Date().toISOString(),
      checkedAtLocal: getAmsterdamDateTime(),
      message: quotes.length > 0
        ? `Er staan nog ${quotes.length} offerte${quotes.length === 1 ? '' : 's'} klaar om te maken.`
        : 'Er staan geen open concept-offertes klaar om te maken.',
      quotes,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Concept-offertes voor Telegram-herinnering ophalen mislukt:', error);
    return NextResponse.json({ ok: false, error: 'Openstaande offertes controleren mislukt.' }, { status: 500 });
  }
}
