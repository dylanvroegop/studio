import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '@/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKUP_PURPOSE = 'BACKUP_ONLY_DO_NOT_USE_IN_APP';

type BackupBody = {
  quoteId?: unknown;
  kind?: unknown;
  notes?: unknown;
  klusId?: unknown;
  measurements?: unknown;
  source?: unknown;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Internal Server Error';
}

function normalizeForBackup(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { auth, firestore } = initFirebaseAdmin();
    let uid = '';
    try {
      uid = (await auth.verifyIdToken(match[1].trim())).uid;
    } catch {
      return NextResponse.json({ ok: false, message: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as BackupBody | null;
    const quoteId = typeof body?.quoteId === 'string' ? body.quoteId.trim() : '';
    const kind = body?.kind === 'notes' || body?.kind === 'measurements' ? body.kind : null;
    const source = typeof body?.source === 'string' ? body.source.trim().slice(0, 120) : 'unknown';
    if (!quoteId || !kind) {
      return NextResponse.json({ ok: false, message: 'Ongeldig back-upverzoek.' }, { status: 400 });
    }

    const quoteRef = firestore.collection('quotes').doc(quoteId);
    const quoteSnapshot = await quoteRef.get();
    if (!quoteSnapshot.exists) {
      return NextResponse.json({ ok: false, message: 'Offerte niet gevonden.' }, { status: 404 });
    }
    if (quoteSnapshot.data()?.userId !== uid) {
      return NextResponse.json({ ok: false, message: 'Geen toegang tot deze offerte.' }, { status: 403 });
    }

    const klusId = typeof body?.klusId === 'string' ? body.klusId.trim() : '';
    const requestedSnapshot = kind === 'notes'
      ? { notes: typeof body?.notes === 'string' ? body.notes : '' }
      : { klusId, measurements: normalizeForBackup(body?.measurements ?? null) };

    if (kind === 'measurements' && !klusId) {
      return NextResponse.json({ ok: false, message: 'Klus-id ontbreekt voor maatvoeringback-up.' }, { status: 400 });
    }

    const collectionName = kind === 'notes' ? 'backup_notes' : 'backup_measurements';
    const quoteData = quoteSnapshot.data() || {};
    const currentKlus = klusId && quoteData.klussen && typeof quoteData.klussen === 'object'
      ? (quoteData.klussen as Record<string, Record<string, unknown>>)[klusId]
      : null;
    const currentSnapshot = kind === 'notes'
      ? { notes: typeof quoteData.notities === 'string' ? quoteData.notities : '' }
      : { klusId, measurements: normalizeForBackup(currentKlus?.maatwerk ?? null) };

    const createBackup = async (snapshot: Record<string, unknown>, snapshotSource: string) => {
      const serialized = JSON.stringify({ kind, quoteId, ...snapshot });
      const contentHash = createHash('sha256').update(serialized).digest('hex');
      const backupRef = quoteRef.collection(collectionName).doc(contentHash);

      try {
        await backupRef.create({
          backupOnly: true,
          purpose: BACKUP_PURPOSE,
          warning: 'Alleen voor herstel na gegevensverlies. Nooit gebruiken als normale app-data.',
          schemaVersion: 1,
          dataType: kind === 'notes' ? 'quote_notes' : 'calculation_measurements',
          quoteId,
          userId: uid,
          source: snapshotSource,
          contentHash,
          ...snapshot,
          createdAt: FieldValue.serverTimestamp(),
        });
        return { backupId: contentHash, deduplicated: false };
      } catch (error: unknown) {
        const code = (error as { code?: string | number })?.code;
        if (code !== 6 && code !== '6' && code !== 'already-exists') throw error;
        return { backupId: contentHash, deduplicated: true };
      }
    };

    const [previous, requested] = await Promise.all([
      createBackup(currentSnapshot, 'pre-save-current-state'),
      createBackup(requestedSnapshot, source),
    ]);

    return NextResponse.json({ ok: true, previous, requested });
  } catch (error) {
    console.error('API Error /api/quotes/backup:', error);
    return NextResponse.json({ ok: false, message: getErrorMessage(error) }, { status: 500 });
  }
}
