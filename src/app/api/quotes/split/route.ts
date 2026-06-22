import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SplitMaterialRow = {
  sourceCategory: 'groot' | 'verbruik';
  sourceIndex: number;
  item: Record<string, unknown>;
};

type SplitDraft = {
  id: string;
  title: string;
  materialRows: SplitMaterialRow[];
  totalHours?: number;
  marginAmount?: number;
  workJobIndex?: number | null;
  selectedKlusIds?: string[];
};

type WorkJobRecord = Record<string, unknown> & {
  title?: unknown;
  context?: unknown;
  summary?: unknown;
  work_scope?: unknown;
  materials?: unknown;
  dimensions?: unknown;
  included?: unknown;
  excluded?: unknown;
  internal_notes?: unknown;
  afvalAfvoeren?: unknown;
  electricalScope?: unknown;
  finishLevel?: unknown;
  customFinishDescription?: unknown;
  sections?: unknown;
  legacyNotes?: unknown;
};

type SourceDataJson = Record<string, unknown> & {
  werkbeschrijving_structured?: {
    jobs?: unknown;
  };
  werkbeschrijving_jobs?: unknown;
};

type ParsedQuoteNoteSection = {
  title: string;
  block: string;
};

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanObject<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanObject(item))
      .filter((item) => item !== undefined) as T;
  }
  if (value && typeof value === 'object') {
    const ctorName = (value as { constructor?: { name?: string } }).constructor?.name;
    if (ctorName && ctorName !== 'Object') return value;
    const output: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      if (entry === undefined) return;
      output[key] = cleanObject(entry);
    });
    return output as T;
  }
  return value;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Internal Server Error';
}

async function createSplitSafetyBackup(
  collection: FirebaseFirestore.CollectionReference,
  payload: Record<string, unknown>,
): Promise<void> {
  const contentHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  try {
    await collection.doc(contentHash).create({
      backupOnly: true,
      purpose: 'BACKUP_ONLY_DO_NOT_USE_IN_APP',
      warning: 'Alleen voor herstel na gegevensverlies. Nooit gebruiken als normale app-data.',
      schemaVersion: 1,
      source: 'pre-split-safety-snapshot',
      contentHash,
      ...payload,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error: unknown) {
    const code = (error as { code?: string | number })?.code;
    if (code !== 6 && code !== '6' && code !== 'already-exists') throw error;
  }
}

async function reserveQuoteNumberAdmin(firestore: FirebaseFirestore.Firestore, userId: string, startNumber = 260001): Promise<number> {
  const counterRef = firestore.collection('counters').doc(`quoteNumber_${userId}`);
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const currentNext =
      snap.exists && typeof snap.data()?.next === 'number'
        ? Number(snap.data()?.next)
        : startNumber;
    tx.set(counterRef, {
      next: currentNext + 1,
      updatedAt: FieldValue.serverTimestamp(),
      userId,
    }, { merge: true });
    return currentNext;
  });
}

function normalizeMaterialItem(row: SplitMaterialRow): Record<string, unknown> {
  const item = row.item && typeof row.item === 'object' ? row.item : {};
  const product = String(item.product || item.materiaal || item.materiaalnaam || '').trim();
  const aantal = toFiniteNumber(item.aantal, 1);
  const prijs = toFiniteNumber(item.prijs_per_stuk ?? item.prijs_excl_btw ?? item.prijs, 0);

  return cleanObject({
    ...item,
    product,
    aantal,
    prijs_per_stuk: prijs,
  });
}

function isWorkJobRecord(value: unknown): value is WorkJobRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getStructuredJobs(dataJson: SourceDataJson): WorkJobRecord[] {
  const structured = dataJson?.werkbeschrijving_structured;
  if (structured && typeof structured === 'object' && Array.isArray(structured.jobs)) {
    return structured.jobs.filter(isWorkJobRecord);
  }
  if (Array.isArray(dataJson?.werkbeschrijving_jobs)) {
    return dataJson.werkbeschrijving_jobs.filter(isWorkJobRecord);
  }
  return [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((line) => String(line || '').trim()).filter(Boolean)
    : [];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function parseSerializedQuoteNotes(value: unknown): ParsedQuoteNoteSection[] {
  if (typeof value !== 'string') return [];
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const sections: ParsedQuoteNoteSection[] = [];
  let activeTitle = '';
  let activeLines: string[] = [];

  const flush = () => {
    const block = activeLines.join('\n').trim();
    if (!block) return;
    sections.push({ title: activeTitle, block });
  };

  for (const line of normalized.split('\n')) {
    const titleMatch = line.match(/^###\s*(.*)$/);
    if (titleMatch) {
      flush();
      activeTitle = titleMatch[1].trim();
      activeLines = [line];
      continue;
    }

    activeLines.push(line);
  }

  flush();
  return sections;
}

function normalizeMatchText(value: unknown): string[] {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function pickSplitNotes(
  sourceNotes: unknown,
  split: SplitDraft,
  selectedJob: WorkJobRecord | null,
  splitIndex: number,
  splitCount: number,
): string {
  const sections = parseSerializedQuoteNotes(sourceNotes);
  if (sections.length === 0) return '';

  const selectedIndex = typeof split.workJobIndex === 'number' && split.workJobIndex >= 0
    ? split.workJobIndex
    : splitIndex;

  if (sections.length === splitCount && sections[selectedIndex]) {
    return sections[selectedIndex].block;
  }

  const candidateTokens = new Set([
    ...normalizeMatchText(split.title),
    ...normalizeMatchText(selectedJob?.title),
    ...normalizeMatchText(selectedJob?.summary),
  ]);
  if (candidateTokens.size === 0) return '';

  let bestSection: ParsedQuoteNoteSection | null = null;
  let bestScore = 0;

  for (const section of sections) {
    const sectionTokens = normalizeMatchText(section.title);
    if (sectionTokens.length === 0) continue;

    let score = 0;
    for (const token of sectionTokens) {
      if (candidateTokens.has(token)) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestSection = section;
    }
  }

  return bestSection && bestScore >= 2 ? bestSection.block : '';
}

function flattenWorkJob(job: WorkJobRecord): string[] {
  if (!job || typeof job !== 'object') return [];
  const sections = [
    ...stringArray(job.work_scope),
    ...stringArray(job.dimensions),
    ...stringArray(job.included),
    ...stringArray(job.excluded).map((line) => `Niet inbegrepen: ${line}`),
  ];
  return sections.map((line) => String(line || '').trim()).filter(Boolean);
}

function buildFallbackWorkJob(split: SplitDraft, materials: Record<string, unknown>[]) {
  const materialLines = materials
    .map((item) => String(item.product || '').trim())
    .filter(Boolean)
    .slice(0, 12);

  return {
    title: split.title,
    context: '',
    summary: `Werkzaamheden voor ${split.title}.`,
    work_scope: [`Uitvoeren van de werkzaamheden voor ${split.title}.`],
    materials: materialLines,
    dimensions: [],
    included: [
      'Levering en montage van de gekozen materialen volgens deze offerte.',
      'Arbeid, bevestigingsmateriaal en normale montagewerkzaamheden voor dit onderdeel.',
    ],
    excluded: [],
    internal_notes: [],
    afvalAfvoeren: true,
    electricalScope: 'excluded',
    finishLevel: 'constructief_gereed',
    sections: {
      voorbereiding: [],
      uitvoering: [`Uitvoeren van de werkzaamheden voor ${split.title}.`],
      afwerking: [],
    },
    legacyNotes: [],
  };
}

function getSelectedWorkJob(split: SplitDraft, sourceDataJson: SourceDataJson): WorkJobRecord | null {
  const jobs = getStructuredJobs(sourceDataJson);
  return typeof split.workJobIndex === 'number' && split.workJobIndex >= 0
    ? jobs[split.workJobIndex]
    : null;
}

function buildSplitWorkDescription(
  split: SplitDraft,
  sourceDataJson: SourceDataJson,
  materials: Record<string, unknown>[],
  splitNotes: string,
) {
  const selectedJob = getSelectedWorkJob(split, sourceDataJson);
  const baseJob: WorkJobRecord = selectedJob && typeof selectedJob === 'object'
    ? { ...selectedJob }
    : buildFallbackWorkJob(split, materials);
  const jobInternalNotes = uniqueStrings([...stringArray(baseJob.internal_notes), splitNotes]);
  const job: WorkJobRecord = {
    ...baseJob,
    title: split.title || String(baseJob.title || '') || 'Deelofferte',
    internal_notes: jobInternalNotes,
  };

  const structured = {
    title: String(job.title || ''),
    context: String(job.context || ''),
    summary: String(job.summary || ''),
    work_scope: stringArray(job.work_scope),
    materials: stringArray(job.materials).length > 0 ? stringArray(job.materials) : materials.map((item) => String(item.product || '')).filter(Boolean),
    dimensions: stringArray(job.dimensions),
    included: stringArray(job.included),
    excluded: stringArray(job.excluded),
    internal_notes: jobInternalNotes,
    afvalAfvoeren: job.afvalAfvoeren !== false,
    electricalScope: String(job.electricalScope || 'excluded'),
    finishLevel: String(job.finishLevel || 'constructief_gereed'),
    customFinishDescription: job.customFinishDescription ? String(job.customFinishDescription) : undefined,
    sections: job.sections && typeof job.sections === 'object' ? job.sections : { voorbereiding: [], uitvoering: [], afwerking: [] },
    jobs: [job],
    activeJobIndex: 0,
    legacyNotes: stringArray(job.legacyNotes),
  };

  return {
    structured,
    flat: flattenWorkJob(job),
  };
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { auth, firestore } = initFirebaseAdmin();
    let uid = '';
    try {
      const decodedToken = await auth.verifyIdToken(match[1].trim());
      uid = decodedToken.uid;
    } catch (error) {
      console.error('Token verification failed:', error);
      return NextResponse.json({ ok: false, message: 'Invalid token' }, { status: 401 });
    }

    const trialBlockedResponse = await ensureDemoTrialActiveByUid(uid);
    if (trialBlockedResponse) return trialBlockedResponse;

    const body = await req.json();
    const quoteId = typeof body?.quoteId === 'string' ? body.quoteId.trim() : '';
    const splitDrafts = Array.isArray(body?.splits) ? body.splits as SplitDraft[] : [];
    const sourceDataJson: SourceDataJson = body?.dataJson && typeof body.dataJson === 'object' ? body.dataJson : {};

    if (!quoteId) {
      return NextResponse.json({ ok: false, message: 'Missing required field: quoteId' }, { status: 400 });
    }
    if (splitDrafts.length < 2) {
      return NextResponse.json({ ok: false, message: 'Maak minimaal twee deeloffertes.' }, { status: 400 });
    }

    const sourceRef = firestore.collection('quotes').doc(quoteId);
    const sourceSnap = await sourceRef.get();
    if (!sourceSnap.exists) {
      return NextResponse.json({ ok: false, message: 'Offerte niet gevonden' }, { status: 404 });
    }

    const sourceQuote = sourceSnap.data() || {};
    if (sourceQuote.userId !== uid) {
      return NextResponse.json({ ok: false, message: 'Geen toegang tot deze offerte' }, { status: 403 });
    }

    const created: Array<{ id: string; offerteNummer: number; title: string }> = [];
    const sourceKlussen = sourceQuote.klussen && typeof sourceQuote.klussen === 'object'
      ? sourceQuote.klussen as Record<string, unknown>
      : {};
    const sourceNotes = typeof sourceQuote.notities === 'string' ? sourceQuote.notities : '';
    const sourceQuoteNotesSnapshot = await sourceRef.collection('quote_notes').get();

    await Promise.all([
      createSplitSafetyBackup(sourceRef.collection('backup_notes'), {
        dataType: 'quote_notes',
        quoteId,
        userId: uid,
        notes: sourceNotes,
      }),
      ...Object.entries(sourceKlussen).map(async ([klusId, rawKlus]) => {
        const klus = rawKlus && typeof rawKlus === 'object' ? rawKlus as Record<string, unknown> : {};
        await createSplitSafetyBackup(sourceRef.collection('backup_measurements'), {
          dataType: 'calculation_measurements',
          quoteId,
          userId: uid,
          klusId,
          measurements: klus.maatwerk ?? null,
        });
      }),
    ]);

    for (let index = 0; index < splitDrafts.length; index += 1) {
      const split = splitDrafts[index];
      const isPrimarySplit = index === 0;
      const title = String(split?.title || `Deelofferte ${index + 1}`).trim();
      const rows = Array.isArray(split?.materialRows) ? split.materialRows : [];
      if (!title) {
        return NextResponse.json({ ok: false, message: 'Elke deelofferte heeft een titel nodig.' }, { status: 400 });
      }
      if (rows.length === 0 && toFiniteNumber(split?.totalHours, 0) <= 0) {
        return NextResponse.json({ ok: false, message: `${title} heeft nog geen materialen of uren.` }, { status: 400 });
      }

      const offerteNummer = isPrimarySplit
        ? toFiniteNumber(sourceQuote.offerteNummer, 0)
        : await reserveQuoteNumberAdmin(firestore, uid);
      const targetQuoteRef = isPrimarySplit ? sourceRef : firestore.collection('quotes').doc();
      const grootmaterialen = rows
        .filter((row) => row.sourceCategory === 'groot')
        .map(normalizeMaterialItem)
        .filter((item) => String(item.product || '').trim());
      const verbruiksartikelen = rows
        .filter((row) => row.sourceCategory === 'verbruik')
        .map(normalizeMaterialItem)
        .filter((item) => String(item.product || '').trim());
      const allMaterials = [...grootmaterialen, ...verbruiksartikelen];
      const selectedWorkJob = getSelectedWorkJob(split, sourceDataJson);
      const splitNotes = pickSplitNotes(sourceQuote.notities, { ...split, title }, selectedWorkJob, index, splitDrafts.length);
      // The retained source quote is the safety copy and must always keep every note.
      // New quotes use their matching section when possible and fall back to all notes.
      const notesForQuote = isPrimarySplit ? sourceNotes : (splitNotes || sourceNotes);
      const workDescription = buildSplitWorkDescription({ ...split, title }, sourceDataJson, allMaterials, splitNotes);
      const marginAmount = Math.max(0, toFiniteNumber(split?.marginAmount, 0));
      const sourceExtras = sourceDataJson.extras && typeof sourceDataJson.extras === 'object'
        ? sourceDataJson.extras as Record<string, unknown>
        : {};
      const sourceTransport = sourceExtras.transport && typeof sourceExtras.transport === 'object'
        ? sourceExtras.transport
        : undefined;
      const splitExtras = cleanObject({
        ...sourceExtras,
        ...(sourceTransport ? { transport: sourceTransport } : {}),
        winstMarge: {
          mode: 'fixed',
          fixedAmount: marginAmount,
          percentage: 0,
          basis: 'totaal',
        },
      });

      const calculationDataJson = cleanObject({
        ...sourceDataJson,
        grootmaterialen,
        verbruiksartikelen,
        totaal_uren: Math.max(0, toFiniteNumber(split?.totalHours, 0)),
        extras: splitExtras,
        instellingen: {
          ...(sourceDataJson.instellingen && typeof sourceDataJson.instellingen === 'object' ? sourceDataJson.instellingen : {}),
          extras: splitExtras,
        },
        werkbeschrijving: workDescription.flat,
        werkbeschrijving_jobs: workDescription.structured.jobs,
        werkbeschrijving_structured: workDescription.structured,
        korteTitel: title,
        korteBeschrijving: workDescription.structured.summary || title,
        interneNotities: notesForQuote || undefined,
        splitVanOfferteId: quoteId,
        splitVanOfferteNummer: sourceQuote.offerteNummer || null,
      });

      const selectedKlusIds = Array.isArray(split.selectedKlusIds)
        ? split.selectedKlusIds.map((klusId) => String(klusId || '').trim()).filter(Boolean)
        : [];
      const selectedKlusEntries = selectedKlusIds
        .map((klusId) => [klusId, sourceKlussen[klusId]] as const)
        .filter((entry): entry is readonly [string, unknown] => entry[1] !== undefined);
      const selectedKlusEntry = typeof split.workJobIndex === 'number'
        ? Object.entries(sourceKlussen)[split.workJobIndex]
        : null;
      const selectedKlussenMap = selectedKlusEntries.length > 0
        ? Object.fromEntries(selectedKlusEntries)
        : selectedKlusEntry
          ? { [selectedKlusEntry[0]]: selectedKlusEntry[1] }
          : null;
      const sourceQuoteExtras = sourceQuote.extras && typeof sourceQuote.extras === 'object'
        ? sourceQuote.extras as Record<string, unknown>
        : {};
      const sourceQuoteInstellingen = sourceQuote.instellingen && typeof sourceQuote.instellingen === 'object'
        ? sourceQuote.instellingen as Record<string, unknown>
        : {};
      const quoteSplitExtras = cleanObject({
        ...sourceQuoteExtras,
        winstMarge: {
          mode: 'fixed',
          fixedAmount: marginAmount,
          percentage: 0,
          basis: 'totaal',
        },
      });
      const quotePayload = cleanObject({
        ...sourceQuote,
        status: 'concept',
        offerteNummer,
        titel: title,
        werkomschrijving: title,
        extras: quoteSplitExtras,
        instellingen: {
          ...sourceQuoteInstellingen,
          extras: {
            ...(sourceQuoteInstellingen.extras && typeof sourceQuoteInstellingen.extras === 'object' ? sourceQuoteInstellingen.extras : {}),
            winstMarge: {
              mode: 'fixed',
              fixedAmount: marginAmount,
              percentage: 0,
              basis: 'totaal',
            },
          },
        },
        archived: false,
        ...(isPrimarySplit
          ? {
              splitPrimary: {
                quoteId,
                offerteNummer: sourceQuote.offerteNummer || null,
                marginAmount,
                updatedAt: FieldValue.serverTimestamp(),
              },
            }
          : {
              splitSource: {
                quoteId,
                offerteNummer: sourceQuote.offerteNummer || null,
                marginAmount,
                createdAt: FieldValue.serverTimestamp(),
              },
              createdAt: FieldValue.serverTimestamp(),
            }),
        updatedAt: FieldValue.serverTimestamp(),
      });
      const mutableQuotePayload = quotePayload as Record<string, unknown>;
      delete mutableQuotePayload.sentAt;
      delete mutableQuotePayload.pdf_url;
      delete mutableQuotePayload.pdfUrl;
      delete mutableQuotePayload.calculationStartedAt;
      if (Object.prototype.hasOwnProperty.call(sourceQuote, 'notities')) {
        mutableQuotePayload.notities = notesForQuote || sourceQuote.notities;
      } else if (notesForQuote) {
        mutableQuotePayload.notities = notesForQuote;
      }
      if (selectedKlussenMap) {
        mutableQuotePayload.klussen = selectedKlussenMap;
      } else {
        delete mutableQuotePayload.klussen;
      }

      await targetQuoteRef.set(mutableQuotePayload);

      if (!isPrimarySplit && !sourceQuoteNotesSnapshot.empty) {
        await Promise.all(sourceQuoteNotesSnapshot.docs.map(async (sourceNoteDoc) => {
          const noteData = { ...sourceNoteDoc.data() };
          if (noteData.quoteId === quoteId) noteData.quoteId = targetQuoteRef.id;
          if (noteData.quoteid === quoteId) noteData.quoteid = targetQuoteRef.id;
          await targetQuoteRef.collection('quote_notes').doc(sourceNoteDoc.id).set(noteData);
        }));
      }

      const supabaseWrite = isPrimarySplit
        ? await supabaseAdmin
            .from('quotes_collection')
            .update({
              status: 'completed',
              data_json: calculationDataJson,
            })
            .eq('quoteid', quoteId)
            .eq('gebruikerid', uid)
        : await supabaseAdmin
            .from('quotes_collection')
            .insert({
              quoteid: targetQuoteRef.id,
              gebruikerid: uid,
              status: 'completed',
              data_json: calculationDataJson,
            });

      if (supabaseWrite.error) {
        console.error('Supabase write error (split quote):', supabaseWrite.error);
        return NextResponse.json({ ok: false, message: supabaseWrite.error.message }, { status: 500 });
      }

      if (!isPrimarySplit) {
        created.push({ id: targetQuoteRef.id, offerteNummer, title });
      }
    }

    await sourceRef.set({
      splitChildren: created.map((item) => ({
        quoteId: item.id,
        offerteNummer: item.offerteNummer,
        title: item.title,
      })),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ ok: true, created });
  } catch (error) {
    console.error('API Error /api/quotes/split:', error);
    return NextResponse.json({ ok: false, message: getErrorMessage(error) }, { status: 500 });
  }
}
