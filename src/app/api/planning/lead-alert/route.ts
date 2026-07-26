import { timingSafeEqual } from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

import { initFirebaseAdmin } from '@/firebase/admin';
import { GOOGLE_CALENDAR_RED_COLOR_ID } from '@/lib/planning-colors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AMSTERDAM_TIME_ZONE = 'Europe/Amsterdam';
const WINDOW_DAYS = 3;

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

function dateOnly(year: number, month: number, day: number): string {
    return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function nextDateOnly(value: string, offset: number): string {
    const [year, month, day] = value.split('-').map(Number);
    const shifted = new Date(Date.UTC(year, month - 1, day + offset));
    return dateOnly(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

function formatDateLabel(value: string): string {
    const [year, month, day] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('nl-NL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function timestampToDate(value: unknown): Date | null {
    if (value instanceof Timestamp) return value.toDate();
    if (value instanceof Date && Number.isFinite(value.getTime())) return value;
    if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
        const result = value.toDate();
        return result instanceof Date && Number.isFinite(result.getTime()) ? result : null;
    }
    if (typeof value === 'string' || typeof value === 'number') {
        const result = new Date(value);
        return Number.isFinite(result.getTime()) ? result : null;
    }
    return null;
}

function dateOnlyInAmsterdam(value: unknown): string | null {
    const date = timestampToDate(value);
    if (!date) return null;
    const parts = amsterdamDateParts(date);
    return dateOnly(parts.year, parts.month, parts.day);
}

function isWerkbesprekingEntry(entry: {
    planningType?: unknown;
    googleCalendarColorId?: unknown;
    cache?: { projectTitle?: unknown; clientName?: unknown };
}): boolean {
    if (entry.planningType === 'werkbespreking') return true;
    if (String(entry.googleCalendarColorId || '') === GOOGLE_CALENDAR_RED_COLOR_ID) return true;

    const title = `${String(entry.cache?.projectTitle || '')} ${String(entry.cache?.clientName || '')}`;
    if (/werkbespreking/i.test(title)) return true;
    return false;
}

function isEntryOnDate(entry: {
    planningType?: unknown;
    googleCalendarColorId?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    cache?: { projectTitle?: unknown; clientName?: unknown };
}, target: string): boolean {
    if (!isWerkbesprekingEntry(entry)) return false;
    const start = dateOnlyInAmsterdam(entry.startDate);
    const end = dateOnlyInAmsterdam(entry.endDate);
    return Boolean(start && end && start <= target && end >= target);
}

function getSnoozeUntil(value: unknown): Date | null {
    if (!value) return null;
    const date = timestampToDate(value);
    return date && date.getTime() > Date.now() ? date : null;
}

function getWindowDates(now = new Date()): string[] {
    const current = amsterdamDateParts(now);
    const today = dateOnly(current.year, current.month, current.day);
    return Array.from({ length: WINDOW_DAYS }, (_, index) => nextDateOnly(today, index));
}

function isPauseCommand(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const command = value.trim().toLocaleLowerCase('nl-NL');
    return command === 'turn off for 1 week'
        || command === 'turn off for a week'
        || command === 'zet uit voor 1 week'
        || command === 'zet uit voor een week';
}

function isResumeCommand(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const command = value.trim().toLocaleLowerCase('nl-NL');
    return command === 'turn on'
        || command === 'resume'
        || command === 'zet aan'
        || command === 'hervat';
}

function unauthorized() {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
}

export async function GET(request: Request) {
    const uid = resolveAutomationUid(request);
    if (!uid) return unauthorized();

    try {
        const { firestore } = initFirebaseAdmin();
        const userRef = firestore.collection('users').doc(uid);
        const [userSnap, planningSnapshot] = await Promise.all([
            userRef.get(),
            firestore.collection('planning_entries').where('userId', '==', uid).get(),
        ]);

        const userData = userSnap.data() || {};
        const settings = (userData.settings || {}) as {
            planningLeadAlert?: { enabled?: unknown; snoozeUntil?: unknown };
        };
        const alertSettings = settings.planningLeadAlert || {};
        const enabled = alertSettings.enabled !== false;
        const snoozeUntil = getSnoozeUntil(alertSettings.snoozeUntil);
        const dates = getWindowDates();
        const entries = planningSnapshot.docs
            .map((document) => document.data())
            .filter((entry) => entry.status !== 'cancelled' && isWerkbesprekingEntry(entry));

        const days = dates.map((date) => ({
            date,
            label: formatDateLabel(date),
            hasWerkbespreking: entries.some((entry) => isEntryOnDate(entry, date)),
        }));
        const missingDays = days.filter((day) => !day.hasWerkbespreking);
        const shouldAlert = enabled && !snoozeUntil && missingDays.length > 0;

        return NextResponse.json({
            ok: true,
            enabled,
            snoozeUntil: snoozeUntil?.toISOString() || null,
            windowDays: WINDOW_DAYS,
            days,
            missingDays,
            shouldAlert,
            message: shouldAlert
                ? `Nieuwe lead zoeken: ${missingDays.map((day) => day.label).join(', ')} heeft nog geen werkbespreking.`
                : null,
        });
    } catch (error) {
        console.error('Planning lead alert check failed', error);
        return NextResponse.json({ ok: false, error: 'Planning controleren mislukt.' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const uid = resolveAutomationUid(request);
    if (!uid) return unauthorized();

    try {
        const body = await request.json().catch(() => ({})) as { command?: unknown };
        if (!isPauseCommand(body.command) && !isResumeCommand(body.command)) {
            return NextResponse.json({ ok: false, error: 'Onbekend commando.' }, { status: 400 });
        }

        const { firestore } = initFirebaseAdmin();
        const userRef = firestore.collection('users').doc(uid);
        const userSnap = await userRef.get();
        const existingSettings = (userSnap.data()?.settings || {}) as {
            planningLeadAlert?: { enabled?: unknown };
        };
        const enabled = existingSettings.planningLeadAlert?.enabled !== false;
        const paused = isPauseCommand(body.command);
        const snoozeUntil = paused ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null;
        await userRef.set({
            settings: {
                planningLeadAlert: {
                    enabled,
                    snoozeUntil,
                },
            },
        }, { merge: true });

        return NextResponse.json({
            ok: true,
            paused,
            snoozeUntil,
            message: paused
                ? 'Lead-meldingen zijn 1 week uitgezet.'
                : 'Lead-meldingen zijn weer aangezet.',
        });
    } catch (error) {
        console.error('Planning lead alert command failed', error);
        return NextResponse.json({ ok: false, error: 'Commando verwerken mislukt.' }, { status: 500 });
    }
}
