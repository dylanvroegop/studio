import { NextResponse } from 'next/server';
import { isDeepStrictEqual } from 'node:util';
import { planQuoteSplit, type SplitDraft } from '@/lib/quote-split';
import { normalizeDataJson } from '@/lib/quote-calculations';
import { resolveQuoteCalculationSettings } from '@/lib/quote-pdf-data';
import { FieldValue } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

type SplitNoteMaatwerkLine = {
  draftId?: unknown;
  title?: unknown;
  length?: unknown;
  width?: unknown;
  height?: unknown;
  thickness?: unknown;
};

type SplitNoteSection = {
  draftId?: unknown;
  title?: unknown;
  notes?: unknown;
  linksTitle?: unknown;
  links?: unknown;
  maatwerkLines?: unknown;
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

function normalizeSplitNoteDimension(value: unknown): string {
  return String(value || '').replace(/\bmm\b/gi, '').trim();
}

function hasSplitMaatwerkContent(line: SplitNoteMaatwerkLine): boolean {
  return [line.title, line.length, line.width, line.height, line.thickness]
    .some((value) => String(value || '').trim().length > 0);
}

function formatSplitMaatwerkLine(line: SplitNoteMaatwerkLine): string {
  const title = String(line.title || '').trim();
  const dimensions = [
    ['Lengte', line.length],
    ['Breedte', line.width],
    ['Hoogte', line.height],
    ['Dikte', line.thickness],
  ].map(([label, value]) => `${label}: ${normalizeSplitNoteDimension(value)} mm`);
  const prefix = title ? `${title} = ` : '';
  return `- ${prefix}${dimensions.join(' | ')}`;
}

function serializeAssignedSplitNotes(noteSections: SplitNoteSection[], draftId: string): string {
  const blocks: string[] = [];

  for (const section of noteSections) {
    const sectionDraftId = String(section.draftId || '').trim();
    const includeSectionContent = sectionDraftId === draftId;
    const title = String(section.title || '').trim();
    const notes = String(section.notes || '').trim();
    const linksTitle = String(section.linksTitle || '').trim();
    const links = Array.isArray(section.links)
      ? section.links
        .filter((link): link is Record<string, unknown> => Boolean(link && typeof link === 'object' && !Array.isArray(link)))
        .map((link) => ({
          title: String(link.title || '').trim(),
          url: String(link.url || '').trim(),
        }))
        .filter((link) => link.title || link.url)
      : [];
    const maatwerkLines = Array.isArray(section.maatwerkLines)
      ? section.maatwerkLines
        .filter((line): line is SplitNoteMaatwerkLine => Boolean(line && typeof line === 'object' && !Array.isArray(line)))
        .filter(hasSplitMaatwerkContent)
        .filter((line) => String(line.draftId || sectionDraftId).trim() === draftId)
      : [];

    if (!includeSectionContent && maatwerkLines.length === 0) continue;

    const blockLines: string[] = [];
    if (title && (includeSectionContent || maatwerkLines.length > 0)) blockLines.push(`### ${title}`);
    if (includeSectionContent && notes) blockLines.push(notes);
    if (maatwerkLines.length > 0) {
      blockLines.push('#### Maatwerk');
      maatwerkLines.forEach((line) => blockLines.push(formatSplitMaatwerkLine(line)));
    }
    if (includeSectionContent && (linksTitle || links.length > 0)) {
      blockLines.push('#### Links');
      if (linksTitle) blockLines.push(`Titel: ${linksTitle}`);
      links.forEach((link) => {
        if (link.title && link.url) blockLines.push(`- ${link.title} | ${link.url}`);
        else if (link.url) blockLines.push(`- ${link.url}`);
        else if (link.title) blockLines.push(`- ${link.title}`);
      });
    }

    if (blockLines.length > 0) blocks.push(blockLines.join('\n'));
  }

  return blocks.join('\n\n');
}

function getAssignedMaatwerkDimensions(noteSections: SplitNoteSection[], draftId?: string): string[] {
  const dimensions: string[] = [];

  for (const section of noteSections) {
    const sectionDraftId = String(section.draftId || '').trim();
    const lines = Array.isArray(section.maatwerkLines) ? section.maatwerkLines : [];
    lines.forEach((rawLine) => {
      if (!rawLine || typeof rawLine !== 'object' || Array.isArray(rawLine)) return;
      const line = rawLine as SplitNoteMaatwerkLine;
      if (!hasSplitMaatwerkContent(line)) return;
      if (draftId && String(line.draftId || sectionDraftId).trim() !== draftId) return;

      const values = [
        line.length ? `Lengte = ${normalizeSplitNoteDimension(line.length)} mm` : '',
        line.width ? `Breedte = ${normalizeSplitNoteDimension(line.width)} mm` : '',
        line.height ? `Hoogte = ${normalizeSplitNoteDimension(line.height)} mm` : '',
        line.thickness ? `Dikte = ${normalizeSplitNoteDimension(line.thickness)} mm` : '',
      ].filter(Boolean);
      if (values.length > 0) {
        dimensions.push(`${String(line.title || '').trim() || 'Maatwerk'}: | ${values.join(' | ')} |`);
      }
    });
  }

  return uniqueStrings(dimensions);
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

function buildFallbackWorkJob(split: SplitDraft, materials: Record<string, unknown>[], sourceDataJson: SourceDataJson) {
  const original = sourceDataJson.werkbeschrijving_structured as WorkJobRecord | undefined;
  const description = String(split.workDescription || '').trim();
  const materialLines = materials
    .map((item) => String(item.product || '').trim())
    .filter(Boolean)
    .slice(0, 12);

  return {
    ...original,
    title: split.title,
    context: '',
    summary: description,
    work_scope: description.split(/\n+/).filter(Boolean),
    materials: materialLines,
    dimensions: [],
    included: [],
    excluded: [],
    internal_notes: [],
    afvalAfvoeren: original?.afvalAfvoeren !== false,
    electricalScope: original?.electricalScope || 'excluded',
    finishLevel: original?.finishLevel || 'constructief_gereed',
    sections: {
      voorbereiding: [],
      uitvoering: description.split(/\n+/).filter(Boolean),
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
  assignedMaatwerkDimensions: string[],
  allMaatwerkDimensions: string[],
) {
  const selectedJob = getSelectedWorkJob(split, sourceDataJson);
  const baseJob: WorkJobRecord = selectedJob && typeof selectedJob === 'object'
    ? { ...selectedJob }
    : buildFallbackWorkJob(split, materials, sourceDataJson);
  const maatwerkDimensionIdentities = new Set(allMaatwerkDimensions.map((line) => line.toLowerCase().replace(/\s+/g, ' ').trim()));
  const retainedDimensions = stringArray(baseJob.dimensions)
    .filter((line) => !maatwerkDimensionIdentities.has(line.toLowerCase().replace(/\s+/g, ' ').trim()));
  const dimensions = uniqueStrings([...retainedDimensions, ...assignedMaatwerkDimensions]);
  const jobInternalNotes = uniqueStrings([...stringArray(baseJob.internal_notes), splitNotes]);
  const job: WorkJobRecord = {
    ...baseJob,
    title: split.title || String(baseJob.title || '') || 'Deelofferte',
    dimensions,
    internal_notes: jobInternalNotes,
  };
  // De deelbeschrijving bevat geen geneste oude beschrijvingen van andere delen.
  delete job.jobs;
  delete job.activeJobIndex;

  const structured = {
    ...job,
    title: String(job.title || ''),
    context: String(job.context || ''),
    summary: String(job.summary || ''),
    work_scope: stringArray(job.work_scope),
    materials: stringArray(job.materials).length > 0 ? stringArray(job.materials) : materials.map((item) => String(item.product || '')).filter(Boolean),
    dimensions,
    included: stringArray(job.included),
    excluded: stringArray(job.excluded),
    internal_notes: jobInternalNotes,
    afvalAfvoeren: job.afvalAfvoeren !== false,
    electricalScope: job.electricalScope || 'excluded',
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
    let sourceDataJson: SourceDataJson = {};
    const hasExplicitNoteAssignments = Array.isArray(body?.noteSections);
    const splitNoteSections = hasExplicitNoteAssignments ? body.noteSections as SplitNoteSection[] : [];

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

    const requestId = typeof body.requestId === 'string' && /^[a-f0-9-]{36}$/.test(body.requestId) ? body.requestId : '';
    if (!requestId || !body.calculationId || !body.sourceDataJson) {
      return NextResponse.json({ ok: false, message: 'Open de offerte opnieuw voordat je splitst.' }, { status: 409 });
    }
    const operationRef = sourceRef.collection('split_operations').doc(requestId);
    const previousOperation = await operationRef.get();
    if (previousOperation.data()?.state === 'completed') return NextResponse.json(previousOperation.data()?.result);
    if (previousOperation.data()?.state === 'failed' && !sourceQuote.splitInProgress) {
      return NextResponse.json({ ok: false, retryable: true, message: 'De vorige poging is teruggedraaid. Je verdeling is behouden; klik opnieuw op offerte maken.' }, { status: 409 });
    }
    if (previousOperation.exists || sourceQuote.splitInProgress) {
      return NextResponse.json({ ok: false, message: 'Deze splitsing wordt al verwerkt of moet eerst worden hersteld. Ververs de offerte.' }, { status: 409 });
    }
    const { data: calculationRows, error: calculationError } = await supabaseAdmin.from('quotes_collection')
      .select('*').eq('quoteid', quoteId).eq('gebruikerid', uid).order('created_at', { ascending: false });
    if (calculationError) throw new Error(calculationError.message);
    const sourceCalculation = calculationRows?.[0];
    if (!sourceCalculation || sourceCalculation.id !== body.calculationId
      || !isDeepStrictEqual(sourceCalculation.data_json, body.sourceDataJson)
      || calculationRows?.some(row => ['pending', 'processing'].includes(String(row.status)))
      || Number(body.quoteRevision) !== sourceQuote.updatedAt?.toMillis?.()) {
      return NextResponse.json({ ok: false, message: 'De offerte is ondertussen gewijzigd. Open splitsen opnieuw; er is niets veranderd.' }, { status: 409 });
    }
    sourceDataJson = normalizeDataJson(sourceCalculation.data_json) as SourceDataJson;
    const profile = (await firestore.collection('users').doc(uid).get()).data();
    const hoursPerDay = Number(profile?.settings?.planningSettings?.defaultWorkdayHours) || 8;
    let plan;
    try {
      plan = planQuoteSplit(sourceDataJson, resolveQuoteCalculationSettings(sourceDataJson, sourceQuote), splitDrafts, Object.keys(sourceQuote.klussen || {}), hoursPerDay, sourceQuote.klussen || {});
      if (Number.isFinite(sourceQuote.financieel?.afgesprokenPrijsInclBtw)) {
        throw new Error('Deze offerte heeft een vastgelegde prijsafspraak. Splitsen is gestopt om die afspraak te behouden.');
      }
    } catch (error) {
      return NextResponse.json({ ok: false, message: getErrorMessage(error) }, { status: 400 });
    }
    await firestore.runTransaction(async tx => {
      const current = await tx.get(sourceRef);
      if (!current.updateTime?.isEqual(sourceSnap.updateTime!) || current.data()?.splitInProgress) throw new Error('De offerte is ondertussen gewijzigd.');
      tx.create(operationRef, { state: 'preparing', sourceQuote, calculationsJson: JSON.stringify(calculationRows), createdAt: FieldValue.serverTimestamp() });
      tx.update(sourceRef, { splitInProgress: requestId });
    });
    const lockedSource = await sourceRef.get();
    const created: Array<{ id: string; offerteNummer: number; title: string }> = [];
    const staged: Array<{ ref: FirebaseFirestore.DocumentReference; quote: Record<string, unknown>; calculation: Record<string, unknown> }> = [];
    let primaryWritten = false;
    let splitStage = 'deeloffertes voorbereiden';
    let childrenWritten = false;
    let completed = false;
    try {

    const sourceKlussen = sourceQuote.klussen && typeof sourceQuote.klussen === 'object'
      ? sourceQuote.klussen as Record<string, unknown>
      : {};
    const sourceNotes = typeof body?.notes === 'string'
      ? body.notes
      : typeof sourceQuote.notities === 'string' ? sourceQuote.notities : '';
    const allMaatwerkDimensions = getAssignedMaatwerkDimensions(splitNoteSections);
    const sourceQuoteNotesSnapshot = await sourceRef.collection('quote_notes').get();
    if (splitDrafts.length * (sourceQuoteNotesSnapshot.size + 1) > 450) throw new Error('Te veel notities voor één veilige splitsing.');

    for (let index = 0; index < splitDrafts.length; index += 1) {
      const split = splitDrafts[index];
      const isPrimarySplit = index === 0;
      const title = String(split?.title || `Deelofferte ${index + 1}`).trim();
      if (!title) {
        throw new Error('Elke deelofferte heeft een titel nodig.');
      }


      const offerteNummer = isPrimarySplit
        ? toFiniteNumber(sourceQuote.offerteNummer, 0)
        : await reserveQuoteNumberAdmin(firestore, uid);
      const targetQuoteRef = isPrimarySplit ? sourceRef : firestore.collection('quotes').doc();
      const part = plan.parts[index];
      const grootmaterialen = part.data.grootmaterialen;
      const verbruiksartikelen = part.data.verbruiksartikelen;
      const allMaterials = [...grootmaterialen, ...verbruiksartikelen];
      const selectedWorkJob = getSelectedWorkJob(split, sourceDataJson);
      const splitNotes = hasExplicitNoteAssignments
        ? serializeAssignedSplitNotes(splitNoteSections, split.id)
        : pickSplitNotes(sourceNotes, { ...split, title }, selectedWorkJob, index, splitDrafts.length);
      const notesForQuote = hasExplicitNoteAssignments
        ? splitNotes
        : splitNotes || (isPrimarySplit ? sourceNotes : '');
      const assignedMaatwerkDimensions = getAssignedMaatwerkDimensions(splitNoteSections, split.id);
      const workDescription = buildSplitWorkDescription(
        { ...split, title },
        sourceDataJson,
        allMaterials,
        splitNotes,
        assignedMaatwerkDimensions,
        allMaatwerkDimensions,
      );
      const marginAmount = part.settings.extras.winstMarge.fixedAmount;
      const splitExtras = part.settings.extras;
      const calculationDataJson = cleanObject({
        ...sourceDataJson,
        ...part.data,
        splitCostAllocation: { sourceQuoteId: quoteId, operationId: requestId, transportAmount: part.transportAmount, areaM2: part.areaM2, scopeCosts: part.scopeCosts },
        grootmaterialen,
        verbruiksartikelen,
        totaal_uren: Math.max(0, toFiniteNumber(split?.totalHours, 0)),
        extras: splitExtras,
        instellingen: part.settings,
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
      const hasExplicitKlusAssignments = Array.isArray(split.selectedKlusIds);
      const selectedKlusEntries = selectedKlusIds
        .map((klusId) => [klusId, sourceKlussen[klusId]] as const)
        .filter((entry): entry is readonly [string, unknown] => entry[1] !== undefined);
      const selectedKlusEntry = typeof split.workJobIndex === 'number'
        ? Object.entries(sourceKlussen)[split.workJobIndex]
        : null;
      const selectedKlussenMap = hasExplicitKlusAssignments
        ? (selectedKlusEntries.length > 0 ? Object.fromEntries(selectedKlusEntries) : null)
        : selectedKlusEntry
          ? { [selectedKlusEntry[0]]: selectedKlusEntry[1] }
          : null;
      const quotePayload = cleanObject({
        ...sourceQuote,
        status: 'concept',
        offerteNummer,
        titel: title,
        werkomschrijving: title,
        extras: splitExtras,
        instellingen: { ...(sourceQuote.instellingen || {}), ...part.settings },
        totaalbedrag: part.totals.totaalInclBtw,
        amount: part.totals.totaalInclBtw,
        splitIncludeDrawings: true,
        archived: false,
        ...(isPrimarySplit
          ? {
              splitPrimary: {
                operationId: requestId,
                quoteId,
                offerteNummer: sourceQuote.offerteNummer || null,
                marginAmount,
                updatedAt: FieldValue.serverTimestamp(),
              },
            }
          : {
              splitSource: {
                operationId: requestId,
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
      if (!isPrimarySplit) {
        delete mutableQuotePayload.splitPrimary;
        delete mutableQuotePayload.whatsappQuoteSnapshot;
        delete mutableQuotePayload.whatsappQuoteSnapshotHistory;
        delete mutableQuotePayload.financieel;
        delete mutableQuotePayload.leadKey;
        mutableQuotePayload.source = 'quote_split';
      }
      delete mutableQuotePayload.splitInProgress;
      delete mutableQuotePayload.splitChildren;
      delete mutableQuotePayload.sentAt;
      delete mutableQuotePayload.pdf_url;
      delete mutableQuotePayload.pdfUrl;
      delete mutableQuotePayload.calculationStartedAt;
      if (hasExplicitNoteAssignments || Object.prototype.hasOwnProperty.call(sourceQuote, 'notities')) {
        mutableQuotePayload.notities = hasExplicitNoteAssignments ? notesForQuote : (notesForQuote || sourceQuote.notities);
      } else if (notesForQuote) {
        mutableQuotePayload.notities = notesForQuote;
      }
      if (selectedKlussenMap) {
        mutableQuotePayload.klussen = selectedKlussenMap;
      } else {
        delete mutableQuotePayload.klussen;
      }
      // Geen oude jobs-array laten terugvallen naar tekeningen van het andere deel.
      if (hasExplicitKlusAssignments) delete mutableQuotePayload.jobs;

      staged.push({ ref: targetQuoteRef, quote: mutableQuotePayload, calculation: calculationDataJson });

      if (!isPrimarySplit) {
        created.push({ id: targetQuoteRef.id, offerteNummer, title });
      }
    }

    const primary = staged[0];
    primary.quote.splitChildren = created.map(item => ({ quoteId: item.id, offerteNummer: item.offerteNummer, title: item.title }));
    // Bewaar het volledige plan vóór de eerste schrijfactie in de andere database.
    await operationRef.update({ state: 'writing', targetQuotesJson: JSON.stringify(staged.map(p => ({ id: p.ref.id, data: p.calculation }))) });
    const children = staged.slice(1).map(p => ({ quoteid: p.ref.id, gebruikerid: uid, status: 'completed', data_json: p.calculation }));
    childrenWritten = true;
    splitStage = 'nieuwe calculaties opslaan';
    const inserted = await supabaseAdmin.from('quotes_collection').insert(children);
    if (inserted.error) throw new Error(inserted.error.message);
    // Geen status-update: die activeert de n8n-trigger die oude uren/tekst terugzet.
    primaryWritten = true;
    splitStage = 'oorspronkelijke calculatie bijwerken';
    for (const row of calculationRows!) {
      const written = await supabaseAdmin.rpc('compare_and_swap_quote_calculation', {
        p_id: String(row.id), p_user_id: uid, p_expected: row.data_json, p_replacement: primary.calculation,
      });
      if (written.error) throw new Error(written.error.message);
      if (!Array.isArray(written.data) || written.data.length !== 1 || !isDeepStrictEqual(written.data[0].data_json, primary.calculation)) throw new Error('De calculatie is tijdens het splitsen gewijzigd of wijkt af van het gecontroleerde plan.');
    }
    const result = { ok: true, created };
    splitStage = 'offertes definitief opslaan';
    await firestore.runTransaction(async tx => {
      const current = await tx.get(sourceRef);
      if (!current.updateTime?.isEqual(lockedSource.updateTime!) || current.data()?.splitInProgress !== requestId) throw new Error('De offerte is tijdens het splitsen gewijzigd.');
      for (const part of staged) {
        tx.set(part.ref, part.quote);
        if (part.ref.id !== quoteId) for (const note of sourceQuoteNotesSnapshot.docs) {
          const noteData = { ...note.data() };
          if (noteData.quoteId === quoteId) noteData.quoteId = part.ref.id;
          if (noteData.quoteid === quoteId) noteData.quoteid = part.ref.id;
          tx.set(part.ref.collection('quote_notes').doc(note.id), noteData);
        }
      }
      tx.update(operationRef, { state: 'completed', result, completedAt: FieldValue.serverTimestamp() });
    });
    completed = true;
    return NextResponse.json(result);
    } catch (error) {
      // Alle offertes staan nog ongewijzigd in Firestore als de commit faalt.
      // Bewaar bij een mislukte compensatie het herstelpunt en blokkeer een blinde retry.
      const savedOperation = await operationRef.get();
      if (savedOperation.data()?.state === 'completed') return NextResponse.json(savedOperation.data()?.result);
      let recoveryFailed = false;
      if (primaryWritten) for (const row of calculationRows || []) {
        const current = await supabaseAdmin.from('quotes_collection').select('data_json').eq('id', String(row.id)).eq('gebruikerid', uid).maybeSingle();
        if (current.error || !current.data) { recoveryFailed = true; continue; }
        if (isDeepStrictEqual(current.data.data_json, row.data_json)) continue;
        if (!isDeepStrictEqual(current.data.data_json, staged[0].calculation)) { recoveryFailed = true; continue; }
        const rollback = await supabaseAdmin.rpc('compare_and_swap_quote_calculation', {
          p_id: String(row.id), p_user_id: uid, p_expected: staged[0].calculation, p_replacement: row.data_json,
        });
        if (rollback.error || !Array.isArray(rollback.data) || rollback.data.length !== 1) recoveryFailed = true;
      }
      if (childrenWritten && staged.length > 1) {
        const rollback = await supabaseAdmin.from('quotes_collection').delete().in('quoteid', staged.slice(1).map(p => p.ref.id)).eq('gebruikerid', uid);
        if (rollback.error) recoveryFailed = true;
      }
      await operationRef.update({ state: recoveryFailed ? 'recovery_required' : 'failed', stage: splitStage, message: getErrorMessage(error) });
      if (!recoveryFailed && !completed) await sourceRef.update({ splitInProgress: FieldValue.delete() });
      return NextResponse.json({ ok: false, retryable: !recoveryFailed, stage: splitStage, message: recoveryFailed
        ? 'Splitsen is gestopt. Automatisch herstel is niet volledig gelukt; de volledige reservekopie staat bij de offerte. Start geen nieuwe splitsing.'
        : `Mislukt bij ${splitStage}: ${getErrorMessage(error)}. De oorspronkelijke offerte is behouden. Je kunt opnieuw proberen met dezelfde verdeling.` }, { status: 500 });
    }

  } catch (error) {
    console.error('API Error /api/quotes/split:', error);
    return NextResponse.json({ ok: false, message: getErrorMessage(error) }, { status: 500 });
  }
}
