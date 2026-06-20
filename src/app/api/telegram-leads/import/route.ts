import { createHash, timingSafeEqual } from 'crypto';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { initFirebaseAdmin } from '@/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOURCE = 'telegram_werkspot';
const AMSTERDAM_TIME_ZONE = 'Europe/Amsterdam';

const nullableString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().max(500).nullable().optional()
);

const importSchema = z.object({
  lead_key: z.string().trim().min(1).max(200),
  client: z.object({
    client_name: nullableString,
    phone: nullableString,
    email: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      z.string().trim().email().max(320).nullable().optional()
    ),
    address: nullableString,
    city: nullableString,
    job_title: z.string().trim().min(1).max(500),
    appointment_date: nullableString,
    appointment_time: nullableString,
  }).superRefine((client, context) => {
    if (!client.phone && !client.email && !(client.client_name && client.city)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide phone, email, or both client_name and city.',
      });
    }
  }),
});

type ImportInput = z.infer<typeof importSchema>;

interface ImportResult {
  client_id: string;
  project_id: string;
  appointment_id: string | null;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function resolveAutomationUid(request: Request): string | null {
  const expectedSecret = process.env.N8N_HEADER_SECRET?.trim() || '';
  const providedSecret = request.headers.get('x-offertehulp-secret')?.trim() || '';
  if (!expectedSecret || !providedSecret || !safeEqual(providedSecret, expectedSecret)) return null;

  return (
    request.headers.get('x-offertehulp-user-id')?.trim()
    || process.env.CALVORA_USER_ID?.trim()
    || null
  );
}

function normalizePhone(value: string | null | undefined): string {
  const digits = value?.replace(/\D+/g, '') || '';
  if (digits.startsWith('0031')) return `0${digits.slice(4)}`;
  if (digits.startsWith('31')) return `0${digits.slice(2)}`;
  return digits;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase('nl-NL') : '';
}

function splitName(name: string | null | undefined): { firstName: string | null; lastName: string | null } {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function splitAddress(address: string | null | undefined): { street: string | null; houseNumber: string | null } {
  const normalized = address?.trim() || '';
  if (!normalized) return { street: null, houseNumber: null };

  const match = normalized.match(/^(.+?)\s+(\d.*)$/);
  if (!match) return { street: normalized, houseNumber: null };
  return { street: match[1].trim(), houseNumber: match[2].trim() };
}

function amsterdamDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: AMSTERDAM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function formatDateOnly(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function resolveDateOnly(value: string, now = new Date()): string | null {
  const normalized = value.trim().toLocaleLowerCase('nl-NL');
  const relativeDays: Record<string, number> = {
    today: 0,
    vandaag: 0,
    tomorrow: 1,
    morgen: 1,
    'day after tomorrow': 2,
    overmorgen: 2,
  };

  if (normalized in relativeDays) {
    const current = amsterdamDateParts(now);
    const shifted = new Date(Date.UTC(current.year, current.month - 1, current.day + relativeDays[normalized]));
    return formatDateOnly(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
  }

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!isoMatch) return null;
  const year = Number(isoMatch[1]);
  const month = Number(isoMatch[2]);
  const day = Number(isoMatch[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return formatDateOnly(year, month, day);
}

function timeZoneOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: AMSTERDAM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const representedAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return representedAsUtc - date.getTime();
}

function amsterdamDateTime(dateOnly: string, time: string): Date | null {
  const timeMatch = time.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!timeMatch) return null;

  const [year, month, day] = dateOnly.split('-').map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, Number(timeMatch[1]), Number(timeMatch[2]));
  let utc = localAsUtc - timeZoneOffsetMs(new Date(localAsUtc));
  utc = localAsUtc - timeZoneOffsetMs(new Date(utc));
  return new Date(utc);
}

function importDocumentId(uid: string, leadKey: string): string {
  return createHash('sha256').update(`${uid}:${leadKey}`).digest('hex');
}

function response(result: ImportResult) {
  return NextResponse.json({
    success: true,
    ...result,
    message: 'Telegram lead imported',
  });
}

export async function POST(request: Request) {
  const uid = resolveAutomationUid(request);
  if (!uid) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized or CALVORA_USER_ID is not configured' },
      { status: 401 }
    );
  }

  let input: ImportInput;
  try {
    const rawBody: unknown = await request.json();
    const parsed = importSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: 'Invalid request body', errors: parsed.error.flatten() },
        { status: 400 }
      );
    }
    input = parsed.data;
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const { firestore, auth } = initFirebaseAdmin();
  const importRef = firestore.collection('telegram_lead_imports').doc(importDocumentId(uid, input.lead_key));

  try {
    await auth.getUser(uid);

    const clientInput = input.client;
    const normalizedPhone = normalizePhone(clientInput.phone);
    const normalizedEmail = normalizeText(clientInput.email);
    const normalizedName = normalizeText(clientInput.client_name);
    const normalizedCity = normalizeText(clientInput.city);

    const clientsSnapshot = await firestore.collection('clients').where('userId', '==', uid).get();
    const clients = clientsSnapshot.docs.map((document) => ({ ref: document.ref, data: document.data() }));
    const matchedClient =
      (normalizedPhone
        ? clients.find(({ data }) => normalizePhone(data.telefoonnummer) === normalizedPhone)
        : undefined)
      || (normalizedEmail
        ? clients.find(({ data }) => normalizeText(data.emailadres) === normalizedEmail)
        : undefined)
      || (normalizedName && normalizedCity
        ? clients.find(({ data }) => {
          const fullName = normalizeText([data.voornaam, data.achternaam].filter(Boolean).join(' '));
          return fullName === normalizedName && normalizeText(data.plaats) === normalizedCity;
        })
        : undefined);

    const clientRef = matchedClient?.ref || firestore.collection('clients').doc();
    const projectRef = firestore.collection('quotes').doc();
    const appointmentRef = firestore.collection('planning_entries').doc();
    const { firstName, lastName } = splitName(clientInput.client_name);
    const { street, houseNumber } = splitAddress(clientInput.address);

    let appointmentStart: Date | null = null;
    if (clientInput.appointment_date && clientInput.appointment_time) {
      const dateOnly = resolveDateOnly(clientInput.appointment_date);
      appointmentStart = dateOnly ? amsterdamDateTime(dateOnly, clientInput.appointment_time) : null;
      if (!appointmentStart) {
        return NextResponse.json(
          { success: false, message: 'Invalid appointment_date or appointment_time' },
          { status: 400 }
        );
      }
    }

    const userSnapshot = await firestore.collection('users').doc(uid).get();
    const userSettings = userSnapshot.data()?.instellingen || userSnapshot.data()?.settings || {};
    const counterRef = firestore.collection('counters').doc(`quoteNumber_${uid}`);

    const result = await firestore.runTransaction(async (transaction): Promise<ImportResult> => {
      const duplicate = await transaction.get(importRef);
      if (duplicate.exists) {
        const data = duplicate.data() as ImportResult;
        const duplicateProjectRef = typeof data.project_id === 'string' && data.project_id
          ? firestore.collection('quotes').doc(data.project_id)
          : null;
        const duplicateAppointmentRef = appointmentStart
          && typeof data.appointment_id === 'string'
          && data.appointment_id
          ? firestore.collection('planning_entries').doc(data.appointment_id)
          : null;

        const duplicateSnapshots = await transaction.getAll(
          ...[duplicateProjectRef, duplicateAppointmentRef].filter(
            (reference): reference is NonNullable<typeof reference> => reference !== null
          )
        );
        const duplicateProject = duplicateProjectRef ? duplicateSnapshots.shift() : null;
        const duplicateAppointment = duplicateAppointmentRef ? duplicateSnapshots.shift() : null;
        const projectIsReusable = duplicateProject?.exists
          && duplicateProject.data()?.userId === uid
          && duplicateProject.data()?.archived !== true;
        const appointmentIsReusable = !appointmentStart || (
          duplicateAppointment?.exists
          && duplicateAppointment.data()?.userId === uid
          && duplicateAppointment.data()?.quoteId === data.project_id
        );

        if (projectIsReusable && appointmentIsReusable) {
          return {
            client_id: data.client_id,
            project_id: data.project_id,
            appointment_id: data.appointment_id || null,
          };
        }
      }

      const counterSnapshot = await transaction.get(counterRef);
      const quoteNumber = counterSnapshot.exists && typeof counterSnapshot.data()?.next === 'number'
        ? counterSnapshot.data()!.next
        : 260001;

      const clientPatch: Record<string, unknown> = {
        userId: uid,
        source: SOURCE,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (firstName) clientPatch.voornaam = firstName;
      if (lastName) clientPatch.achternaam = lastName;
      if (clientInput.email) clientPatch.emailadres = clientInput.email;
      if (clientInput.phone) clientPatch.telefoonnummer = clientInput.phone;
      if (street) clientPatch.straat = street;
      if (houseNumber) clientPatch.huisnummer = houseNumber;
      if (clientInput.city) clientPatch.plaats = clientInput.city;

      transaction.set(clientRef, {
        ...clientPatch,
        ...(!matchedClient ? {
          bedrijfsnaam: null,
          postcode: null,
          klanttype: 'Particulier',
          createdAt: FieldValue.serverTimestamp(),
        } : {}),
      }, { merge: true });

      transaction.set(projectRef, {
        userId: uid,
        clientId: clientRef.id,
        leadKey: input.lead_key,
        source: SOURCE,
        status: 'werkbespreking',
        offerteNummer: quoteNumber,
        titel: clientInput.job_title,
        werkomschrijving: clientInput.job_title,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        klantinformatie: {
          clientId: clientRef.id,
          klanttype: 'Particulier',
          bedrijfsnaam: null,
          contactpersoon: null,
          voornaam: firstName,
          achternaam: lastName,
          emailadres: clientInput.email || null,
          'e-mailadres': clientInput.email || null,
          telefoonnummer: clientInput.phone || null,
          straat: street,
          huisnummer: houseNumber,
          postcode: null,
          plaats: clientInput.city || null,
          factuuradres: { straat: street, huisnummer: houseNumber, postcode: null, plaats: clientInput.city || null },
          afwijkendProjectadres: false,
          projectStraat: street,
          projectHuisnummer: houseNumber,
          projectPostcode: null,
          projectPlaats: clientInput.city || null,
          projectadres: { straat: street, huisnummer: houseNumber, postcode: null, plaats: clientInput.city || null },
        },
        instellingen: {
          btwTarief: 21,
          uurTariefExclBtw: userSettings.standaardUurtarief ?? 45,
        },
        extras: {
          transport: userSettings.standaardTransport ?? { mode: 'fixed', vasteTransportkosten: 45 },
          winstMarge: userSettings.standaardWinstMarge ?? { mode: 'percentage', percentage: 10 },
        },
      });

      transaction.set(counterRef, {
        next: quoteNumber + 1,
        userId: uid,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      let appointmentId: string | null = null;
      if (appointmentStart) {
        appointmentId = appointmentRef.id;
        const appointmentEnd = new Date(appointmentStart.getTime() + 60 * 60 * 1000);
        transaction.set(appointmentRef, {
          userId: uid,
          quoteId: projectRef.id,
          leadKey: input.lead_key,
          source: SOURCE,
          startDate: Timestamp.fromDate(appointmentStart),
          endDate: Timestamp.fromDate(appointmentEnd),
          scheduledHours: 1,
          planningType: 'werkbespreking',
          isAutoSplit: false,
          parentEntryId: null,
          status: 'scheduled',
          notes: '',
          cache: {
            clientName: clientInput.client_name || '',
            projectTitle: `Werkbespreking · ${clientInput.job_title}`,
            projectAddress: [clientInput.address, clientInput.city].filter(Boolean).join(', '),
            totalQuoteHours: 1,
            totalQuoteAmount: 0,
            totalQuoteEarnings: 0,
          },
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      const imported: ImportResult = {
        client_id: clientRef.id,
        project_id: projectRef.id,
        appointment_id: appointmentId,
      };
      transaction.set(importRef, {
        ...imported,
        userId: uid,
        lead_key: input.lead_key,
        source: SOURCE,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return imported;
    });

    console.info('[telegram-leads/import] imported', {
      leadKey: input.lead_key,
      clientId: result.client_id,
      projectId: result.project_id,
      appointmentId: result.appointment_id,
    });
    return response(result);
  } catch (error) {
    console.error('[telegram-leads/import] failed', {
      leadKey: input.lead_key,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, message: 'Telegram lead import failed' },
      { status: 500 }
    );
  }
}
