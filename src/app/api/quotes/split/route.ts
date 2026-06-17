import { NextResponse } from 'next/server';
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

    for (let index = 0; index < splitDrafts.length; index += 1) {
      const split = splitDrafts[index];
      const title = String(split?.title || `Deelofferte ${index + 1}`).trim();
      const rows = Array.isArray(split?.materialRows) ? split.materialRows : [];
      if (!title) {
        return NextResponse.json({ ok: false, message: 'Elke deelofferte heeft een titel nodig.' }, { status: 400 });
      }
      if (rows.length === 0 && toFiniteNumber(split?.totalHours, 0) <= 0) {
        return NextResponse.json({ ok: false, message: `${title} heeft nog geen materialen of uren.` }, { status: 400 });
      }

      const offerteNummer = await reserveQuoteNumberAdmin(firestore, uid);
      const newQuoteRef = firestore.collection('quotes').doc();
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
        interneNotities: splitNotes || undefined,
        splitVanOfferteId: quoteId,
        splitVanOfferteNummer: sourceQuote.offerteNummer || null,
      });

      const sourceKlussen = sourceQuote.klussen && typeof sourceQuote.klussen === 'object'
        ? sourceQuote.klussen as Record<string, unknown>
        : {};
      const selectedKlusEntry = typeof split.workJobIndex === 'number'
        ? Object.entries(sourceKlussen)[split.workJobIndex]
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
        splitSource: {
          quoteId,
          offerteNummer: sourceQuote.offerteNummer || null,
          marginAmount,
          createdAt: FieldValue.serverTimestamp(),
        },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      const mutableQuotePayload = quotePayload as Record<string, unknown>;
      delete mutableQuotePayload.sentAt;
      delete mutableQuotePayload.pdf_url;
      delete mutableQuotePayload.pdfUrl;
      delete mutableQuotePayload.calculationStartedAt;
      if (splitNotes) {
        mutableQuotePayload.notities = splitNotes;
      } else {
        delete mutableQuotePayload.notities;
      }
      if (selectedKlusEntry) {
        mutableQuotePayload.klussen = { [selectedKlusEntry[0]]: selectedKlusEntry[1] };
      } else {
        delete mutableQuotePayload.klussen;
      }

      await newQuoteRef.set(quotePayload);

      const { error: insertError } = await supabaseAdmin
        .from('quotes_collection')
        .insert({
          quoteid: newQuoteRef.id,
          gebruikerid: uid,
          status: 'completed',
          data_json: calculationDataJson,
        });

      if (insertError) {
        console.error('Supabase insert error (split quote):', insertError);
        return NextResponse.json({ ok: false, message: insertError.message }, { status: 500 });
      }

      created.push({ id: newQuoteRef.id, offerteNummer, title });
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
