/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { initFirebaseAdmin } from '@/firebase/admin';
import { parsePriceToNumber } from '@/lib/utils';
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  materiaalnaam?: unknown;
  eenheid?: unknown;
  prijs?: unknown;
  prijs_incl_btw?: unknown;
  prijs_excl_btw?: unknown;
  leverancier?: unknown;
  lengte?: unknown;
  breedte?: unknown;
  dikte?: unknown;
  hoogte?: unknown;
  werkende_breedte_maat?: unknown;
  werkende_hoogte_maat?: unknown;
  werkende_breedte_mm?: unknown;
  werkende_hoogte_mm?: unknown;
  verbruik_per_m2?: unknown;
  vebruik_per_m2?: unknown; // alias voor typo in oudere payloads

  // UI vs DB
  categorie?: unknown;  // DB
  subsectie?: unknown;  // UI (legacy)

  // Frontend stuurt soms beide mee; in jouw DB bestaat alleen row_id
  row_id?: unknown;
  id?: unknown;

  // Safety follow-up flow
  safety_confirmed?: unknown;
  safety_answer?: unknown;
  safety_answers?: unknown;
  expected_unit?: unknown;
  safety_expected_unit?: unknown;

  // Durable pending queue context
  pending_id?: unknown;
  quote_id?: unknown;
  klus_id?: unknown;
};

type SafetyQuestion = {
  key: string;
  question: string;
  expectedUnit: string;
  targetField: string;
  valueType: string;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function normalizeString(v: unknown): string | null {
  if (!isNonEmptyString(v)) return null;
  const s = v.trim();
  return s.length ? s : null;
}

function normalizeNullableNumber(v: unknown, fieldName: string): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === 'string' && v.trim() === '') return null;

  const parsed = parsePriceToNumber(v);
  if (parsed === null) throw new Error(`${fieldName} is ongeldig.`);
  if (parsed < 0) throw new Error(`${fieldName} mag niet negatief zijn.`);
  return parsed;
}

function roundToCents(value: number): number {
  return Number(value.toFixed(2));
}

function resolveCanonicalPrices(body: Body): { prijsExcl: number | null; prijsIncl: number | null } {
  const explicitExcl = parsePriceToNumber(body.prijs_excl_btw);
  const explicitIncl = parsePriceToNumber(body.prijs_incl_btw);
  const legacyPrijs = parsePriceToNumber(body.prijs);

  // Canonical truth: excl. btw.
  let prijsExcl = explicitExcl;
  let prijsIncl = explicitIncl;

  if (prijsExcl === null && prijsIncl !== null) {
    prijsExcl = roundToCents(prijsIncl / 1.21);
  }

  if (prijsIncl === null && prijsExcl !== null) {
    prijsIncl = roundToCents(prijsExcl * 1.21);
  }

  // Legacy fallback: treat ambiguous `prijs` as excl to avoid mixed semantics.
  if (prijsExcl === null && legacyPrijs !== null) {
    prijsExcl = legacyPrijs;
    if (prijsIncl === null) {
      prijsIncl = roundToCents(legacyPrijs * 1.21);
    }
  }

  return { prijsExcl, prijsIncl };
}

function parseBooleanLike(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  if (typeof value === 'number') return value === 1;
  return false;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeSafetyAnswers(
  raw: Record<string, unknown> | null
): Record<string, string | number | boolean> {
  if (!raw) return {};
  const normalized: Record<string, string | number | boolean> = {};
  Object.entries(raw).forEach(([key, value]) => {
    const cleanKey = key.trim();
    if (!cleanKey) return;
    if (typeof value === 'string') {
      const cleanValue = value.trim();
      if (!cleanValue) return;
      normalized[cleanKey] = cleanValue;
      return;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      normalized[cleanKey] = value;
      return;
    }
    if (typeof value === 'boolean') {
      normalized[cleanKey] = value;
    }
  });
  return normalized;
}

function buildAiExtraData(input: {
  safetyAnswer: string | null;
  safetyAnswers: Record<string, string | number | boolean>;
  expectedUnit: string | null;
}): Record<string, unknown> | null {
  const { safetyAnswer, safetyAnswers, expectedUnit } = input;
  const hasSafetyAnswers = Object.keys(safetyAnswers).length > 0;
  if (!safetyAnswer && !expectedUnit && !hasSafetyAnswers) return null;

  const payload: Record<string, unknown> = {
    captured_at: new Date().toISOString(),
  };
  if (safetyAnswer) payload.safety_answer = safetyAnswer;
  if (expectedUnit) payload.expected_unit = expectedUnit;
  if (hasSafetyAnswers) payload.safety_answers = safetyAnswers;
  return payload;
}

function mergeAiExtraData(
  existing: unknown,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const base = toRecord(existing) ?? {};
  const merged: Record<string, unknown> = {
    ...base,
    ...incoming,
  };

  const baseAnswers = toRecord(base.safety_answers) ?? {};
  const incomingAnswers = toRecord(incoming.safety_answers) ?? {};
  if (Object.keys(baseAnswers).length > 0 || Object.keys(incomingAnswers).length > 0) {
    merged.safety_answers = {
      ...baseAnswers,
      ...incomingAnswers,
    };
  }

  return merged;
}

function isAiExtraDataColumnMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as Record<string, unknown>;
  const code = typeof err.code === 'string' ? err.code : '';
  const message = [
    typeof err.message === 'string' ? err.message : '',
    typeof err.details === 'string' ? err.details : '',
    typeof err.hint === 'string' ? err.hint : '',
  ].join(' ').toLowerCase();

  const mentionsColumn = message.includes('ai_extra_data');
  const columnMissing = message.includes('does not exist') || message.includes('schema cache');
  return (code === 'PGRST204' || columnMissing) && mentionsColumn;
}

const MAIN_MATERIAL_LIST_COLUMNS = new Set<string>([
  'gebruikerid',
  'materiaalnaam',
  'eenheid',
  'prijs_incl_btw',
  'prijs_excl_btw',
  'categorie',
  'leverancier',
  'lengte',
  'breedte',
  'dikte',
  'hoogte',
  'werkende_breedte_maat',
  'werkende_breedte_mm',
  'werkende_hoogte_maat',
  'werkende_hoogte_mm',
  'verbruik_per_m2',
]);

function toMainMaterialListPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const cleanPayload: Record<string, unknown> = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (!MAIN_MATERIAL_LIST_COLUMNS.has(key)) return;
    cleanPayload[key] = value;
  });
  return cleanPayload;
}

function bepaalN8nUrlVoorMaterialenUpsert(safetyConfirmed = false): string {
  if (safetyConfirmed) {
    const confirmedUrl = process.env.N8N_MATERIALEN_UPSERT_CONFIRMED_URL;
    if (confirmedUrl && confirmedUrl.trim()) return confirmedUrl.trim();
  }

  const direct = process.env.N8N_MATERIALEN_UPSERT_URL;
  if (direct && direct.trim()) return direct.trim();
  throw new Error('ENV ontbreekt: N8N_MATERIALEN_UPSERT_URL');
}

function extractN8nRow(input: any): Record<string, unknown> | null {
  if (!input) return null;

  if (Array.isArray(input)) {
    const first = input.find((item) => item && typeof item === 'object');
    return first ?? null;
  }

  if (typeof input === 'object') {
    if (input.output !== undefined) {
      const out = input.output;
      if (typeof out === 'string') {
        try {
          const parsed = JSON.parse(out);
          const nested = extractN8nRow(parsed);
          if (nested) return nested;
        } catch {
          // ignore invalid json output
        }
      } else if (out && typeof out === 'object') {
        const nested = extractN8nRow(out);
        if (nested) return nested;
      }
    }
    if (Array.isArray(input.data)) {
      const first = input.data.find((item: unknown) => item && typeof item === 'object');
      return first ?? null;
    }
    if (input.data && typeof input.data === 'object') {
      return input.data as Record<string, unknown>;
    }
    return input as Record<string, unknown>;
  }

  return null;
}

function extractN8nSafetyPrompt(input: any): { ready?: boolean; question: string; expectedUnit: string; questions: SafetyQuestion[] } {
  if (input == null) return { question: '', expectedUnit: '', questions: [] };

  let candidate: unknown = input;
  if (Array.isArray(candidate)) {
    candidate = candidate.find((item) => item && typeof item === 'object') ?? candidate[0];
  }

  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return { question: '', expectedUnit: '', questions: [] };
    }
  }

  if (candidate && typeof candidate === 'object' && 'output' in (candidate as Record<string, unknown>)) {
    const out = (candidate as Record<string, unknown>).output;
    if (typeof out === 'string') {
      try {
        candidate = JSON.parse(out);
      } catch {
        // keep candidate as-is
      }
    } else if (out && typeof out === 'object') {
      candidate = out;
    }
  }

  if (!candidate || typeof candidate !== 'object') return { question: '', expectedUnit: '', questions: [] };

  const obj = candidate as Record<string, unknown>;
  const normalizeQuestion = (raw: unknown): SafetyQuestion | null => {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Record<string, unknown>;
    const question = normalizeString(row.question ?? row.vraag) ?? '';
    if (!question) return null;
    const key =
      normalizeString(row.key) ??
      normalizeString(row.code) ??
      normalizeString(row.id) ??
      'naam_suffix';
    const expectedUnit =
      normalizeString(
        row.expected_unit ??
        row.expectedUnit ??
        row.answer_unit ??
        row.answerUnit ??
        row.unit ??
        row.eenheid
      ) ?? '';
    const targetField =
      normalizeString(row.target_field ?? row.targetField) ??
      (key === 'verbruik_per_m2' ? 'verbruik_per_m2' : 'naam_suffix');
    const valueType = normalizeString(row.value_type ?? row.valueType) ?? 'text';

    return {
      key,
      question,
      expectedUnit,
      targetField,
      valueType,
    };
  };

  const questionsRaw = Array.isArray(obj.questions) ? obj.questions : [];
  const normalizedQuestions = questionsRaw
    .map((entry) => normalizeQuestion(entry))
    .filter((entry): entry is SafetyQuestion => Boolean(entry));

  const questionRaw = obj.question ?? obj.vraag;
  const expectedUnitRaw =
    obj.expected_unit ??
    obj.expectedUnit ??
    obj.answer_unit ??
    obj.answerUnit ??
    obj.unit ??
    obj.eenheid;

  const fallbackQuestion = typeof questionRaw === 'string' ? questionRaw.trim() : '';
  const fallbackExpectedUnit = typeof expectedUnitRaw === 'string' ? expectedUnitRaw.trim() : '';

  const questions =
    normalizedQuestions.length > 0
      ? normalizedQuestions
      : (fallbackQuestion
        ? [{
            key: 'naam_suffix',
            question: fallbackQuestion,
            expectedUnit: fallbackExpectedUnit,
            targetField: 'naam_suffix',
            valueType: 'text',
          }]
        : []);

  const first = questions[0];

  return {
    ready: typeof obj.ready === 'boolean' ? obj.ready : undefined,
    question: first?.question ?? fallbackQuestion,
    expectedUnit: first?.expectedUnit ?? fallbackExpectedUnit,
    questions,
  };
}

function buildResolvedMaterialSnapshotForQuote(
  raw: unknown,
  rowId: string,
  fallbackName: string
): Record<string, unknown> {
  const base: Record<string, unknown> =
    raw && typeof raw === 'object'
      ? { ...(raw as Record<string, unknown>) }
      : {};

  delete base.pending_material_id;
  delete base.pending_material_state;
  delete base.pending_material_question;
  delete base.pending_material_error;
  delete base._raw;

  base.row_id = rowId;
  base.id = rowId;
  base.material_ref_id = rowId;

  const existingName = normalizeString(base.materiaalnaam);
  if (!existingName && fallbackName) {
    base.materiaalnaam = fallbackName;
  }

  return base;
}

function replacePendingMaterialInNode(
  value: unknown,
  pendingId: string,
  resolvedMaterial: Record<string, unknown>
): { value: unknown; changed: boolean } {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const replaced = replacePendingMaterialInNode(item, pendingId, resolvedMaterial);
      if (replaced.changed) changed = true;
      return replaced.value;
    });
    return changed ? { value: next, changed: true } : { value, changed: false };
  }

  if (!value || typeof value !== 'object') {
    return { value, changed: false };
  }

  const obj = value as Record<string, unknown>;
  const directPendingId = normalizeString(obj.pending_material_id);
  if (directPendingId === pendingId) {
    return { value: { ...resolvedMaterial }, changed: true };
  }

  let changed = false;
  const next: Record<string, unknown> = {};

  Object.entries(obj).forEach(([key, child]) => {
    if (key === 'material' && child && typeof child === 'object') {
      const childObj = child as Record<string, unknown>;
      const childPendingId = normalizeString(childObj.pending_material_id);
      if (childPendingId === pendingId) {
        next[key] = { ...resolvedMaterial };
        changed = true;
        return;
      }
    }

    const replaced = replacePendingMaterialInNode(child, pendingId, resolvedMaterial);
    next[key] = replaced.value;
    if (replaced.changed) changed = true;
  });

  return changed ? { value: next, changed: true } : { value, changed: false };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function lookupLatestInsertedMaterial(
  uid: string,
  naam: string,
  attempts = 10,
  delayMs = 300
): Promise<Record<string, unknown> | null> {
  for (let i = 0; i < attempts; i++) {
    const lookup = await supabaseAdmin
      .from('main_material_list')
      .select('*')
      .eq('gebruikerid', uid)
      .eq('materiaalnaam', naam)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookup.error) {
      throw new Error(lookup.error.message || 'Insert lookup failed');
    }

    if (lookup.data) return lookup.data as Record<string, unknown>;
    if (i < attempts - 1) await sleep(delayMs);
  }

  return null;
}

async function stuurNaarN8nVoorMaterialenUpsert(
  payload: Record<string, unknown>,
  options?: { safetyConfirmed?: boolean }
): Promise<any> {
  const secret = process.env.N8N_HEADER_SECRET;
  if (!secret || !secret.trim()) throw new Error('ENV ontbreekt: N8N_HEADER_SECRET');

  const n8nUrl = bepaalN8nUrlVoorMaterialenUpsert(Boolean(options?.safetyConfirmed));
  const res = await fetch(n8nUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-offertehulp-secret': secret.trim(),
    },
    body: JSON.stringify(payload),
  });

  const txt = await res.text();
  if (!res.ok) {
    throw new Error(`n8n webhook faalde (${res.status}): ${txt || 'lege response'}`);
  }

  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

function jsonOk(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status });
}

function jsonFail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(req: Request) {
  try {
    // 1) Bearer token
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return jsonFail('Geen Bearer token.', 401);

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) return jsonFail('Lege token.', 401);

    // 2) Firebase token verifiëren
    const { auth } = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded?.uid;
    if (!uid) return jsonFail('Token ongeldig.', 401);

    // 3) Body
    const body = (await req.json()) as Body;
    const db = getFirestore();
    const pendingId = normalizeString(body.pending_id);
    const quoteId = normalizeString(body.quote_id);
    const klusId = normalizeString(body.klus_id);
    const hasPendingContext = Boolean(pendingId && quoteId && klusId);
    let quoteOwnershipChecked = false;
    let quoteOwnedByUser = false;

    const ensureOwnedQuote = async (): Promise<boolean> => {
      if (!hasPendingContext) return false;
      if (quoteOwnershipChecked) return quoteOwnedByUser;
      quoteOwnershipChecked = true;
      try {
        const snap = await db.collection('quotes').doc(quoteId!).get();
        const ownerUid = typeof snap.get('userId') === 'string'
          ? String(snap.get('userId'))
          : (typeof snap.data()?.userId === 'string' ? String(snap.data()?.userId) : null);
        quoteOwnedByUser = snap.exists && ownerUid === uid;
      } catch {
        quoteOwnedByUser = false;
      }
      return quoteOwnedByUser;
    };

    const writePendingState = async (
      patch: Record<string, unknown>,
      options?: { remove?: boolean; setCreatedAt?: boolean }
    ): Promise<void> => {
      if (!hasPendingContext) return;
      const allowed = await ensureOwnedQuote();
      if (!allowed) return;

      const quoteRef = db.collection('quotes').doc(quoteId!);
      const basePath = `klussen.${klusId}.materialen.pending_materials.${pendingId}`;
      const legacyFieldNames = new Set<string>([
        basePath,
        `${basePath}.id`,
        `${basePath}.updatedAt`,
        `${basePath}.createdAt`,
      ]);
      Object.keys(patch).forEach((key) => {
        legacyFieldNames.add(`${basePath}.${key}`);
      });

      const cleanupArgs: Array<FieldPath | FieldValue> = [];
      legacyFieldNames.forEach((fieldName) => {
        cleanupArgs.push(new FieldPath(fieldName), FieldValue.delete());
      });
      try {
        if (cleanupArgs.length > 0) {
          await (quoteRef as any).update(...cleanupArgs);
        }
      } catch {
        // Best effort cleanup van oude foutieve veldnamen met punten.
      }

      if (options?.remove) {
        await quoteRef.update({ [basePath]: FieldValue.delete() });
        return;
      }

      const updatePayload: Record<string, unknown> = {
        [`${basePath}.id`]: pendingId,
        [`${basePath}.updatedAt`]: FieldValue.serverTimestamp(),
      };
      if (options?.setCreatedAt) {
        updatePayload[`${basePath}.createdAt`] = FieldValue.serverTimestamp();
      }
      Object.entries(patch).forEach(([key, value]) => {
        updatePayload[`${basePath}.${key}`] = value;
      });

      await quoteRef.update(updatePayload);
    };

    const replacePendingMaterialInQuote = async (
      resolvedMaterial: Record<string, unknown>
    ): Promise<boolean> => {
      if (!hasPendingContext) return false;
      const allowed = await ensureOwnedQuote();
      if (!allowed) return false;

      const quoteRef = db.collection('quotes').doc(quoteId!);
      const snap = await quoteRef.get();
      if (!snap.exists) return false;

      const materialenLijst = snap.get(`klussen.${klusId}.materialen.materialen_lijst`);
      if (!materialenLijst || typeof materialenLijst !== 'object') return false;

      const replaced = replacePendingMaterialInNode(materialenLijst, pendingId!, resolvedMaterial);
      if (!replaced.changed || !replaced.value || typeof replaced.value !== 'object') return false;

      try {
        await quoteRef.update(
          new FieldPath(`klussen.${klusId}.materialen.materialen_lijst`),
          FieldValue.delete(),
          new FieldPath(`klussen.${klusId}.materialen.savedAt`),
          FieldValue.delete(),
          new FieldPath(`klussen.${klusId}.updatedAt`),
          FieldValue.delete()
        );
      } catch {
        // Best effort cleanup van oude foutieve veldnamen met punten.
      }

      await quoteRef.update({
        [`klussen.${klusId}.materialen.materialen_lijst`]: replaced.value,
        [`klussen.${klusId}.materialen.savedAt`]: FieldValue.serverTimestamp(),
        [`klussen.${klusId}.updatedAt`]: FieldValue.serverTimestamp(),
      });

      return true;
    };

    // ✅ FIXED HERE: We check "typeof === string" so Typescript allows .trim()
    const naam = typeof body.materiaalnaam === 'string' ? body.materiaalnaam.trim() : null;

    const eenheid = normalizeString(body.eenheid);
    const { prijsExcl: prijsExclNum, prijsIncl: prijsInclNum } = resolveCanonicalPrices(body);

    const categorie =
      normalizeString(body.categorie) ??
      normalizeString(body.subsectie);

    const leverancier = normalizeString(body.leverancier);
    const lengte = normalizeString(body.lengte);
    const breedte = normalizeString(body.breedte);
    const dikte = normalizeString(body.dikte);
    const hoogte = normalizeString(body.hoogte);
    const safetyConfirmed = parseBooleanLike(body.safety_confirmed);
    const safetyAnswer = normalizeString(body.safety_answer);
    const rawSafetyAnswers =
      body.safety_answers && typeof body.safety_answers === 'object' && !Array.isArray(body.safety_answers)
        ? (body.safety_answers as Record<string, unknown>)
        : null;
    const safetyAnswers = normalizeSafetyAnswers(rawSafetyAnswers);
    const expectedUnit =
      normalizeString(body.expected_unit) ??
      normalizeString(body.safety_expected_unit);
    const aiExtraData = buildAiExtraData({
      safetyAnswer,
      safetyAnswers,
      expectedUnit,
    });

    let werkendeBreedteMaat: number | null | undefined;
    let werkendeHoogteMaat: number | null | undefined;
    let verbruikPerM2: number | null | undefined;
    try {
      werkendeBreedteMaat = normalizeNullableNumber(
        body.werkende_breedte_maat ?? body.werkende_breedte_mm,
        'werkende_breedte_maat'
      );
      werkendeHoogteMaat = normalizeNullableNumber(
        body.werkende_hoogte_maat ?? body.werkende_hoogte_mm,
        'werkende_hoogte_maat'
      );
      verbruikPerM2 = normalizeNullableNumber(
        body.verbruik_per_m2 ?? body.vebruik_per_m2,
        'verbruik_per_m2'
      );
    } catch (validationError: any) {
      return jsonFail(validationError?.message || 'Ongeldige numerieke waarde.', 400);
    }

    // LET OP: jouw DB heeft GEEN 'id' kolom.
    // We accepteren 'id' alleen als alias voor row_id (frontend stuurt soms payload.id).
    const incomingRowId = normalizeString(body.row_id) ?? normalizeString(body.id) ?? null;

    if (!naam) return jsonFail('Materiaalnaam is verplicht.', 400);
    if (!eenheid) return jsonFail('Eenheid is verplicht.', 400);
    if (prijsExclNum === null) return jsonFail('Prijs (excl. btw) is ongeldig.', 400);
    if (prijsExclNum < 0) return jsonFail('Prijs mag niet negatief zijn.', 400);
    const prijsInclSafe = prijsInclNum ?? roundToCents(prijsExclNum * 1.21);

    // 4) Supabase service role (server-side) using shared client
    // supabaseAdmin is already initialized

    // 5) Payload (nooit id/categorie meesturen)
    const payload: Record<string, unknown> = {
      gebruikerid: uid,
      materiaalnaam: naam, // This now contains the full string correctly
      eenheid,
      prijs_incl_btw: prijsInclSafe,
      prijs_excl_btw: prijsExclNum,
    };
    if (categorie) payload.categorie = categorie;
    if (leverancier) payload.leverancier = leverancier;
    if (lengte) payload.lengte = lengte;
    if (breedte) payload.breedte = breedte;
    if (dikte) payload.dikte = dikte;
    if (hoogte) payload.hoogte = hoogte;
    if (werkendeBreedteMaat !== undefined) {
      payload.werkende_breedte_maat = werkendeBreedteMaat;
      payload.werkende_breedte_mm = werkendeBreedteMaat;
    }
    if (werkendeHoogteMaat !== undefined) {
      payload.werkende_hoogte_maat = werkendeHoogteMaat;
      payload.werkende_hoogte_mm = werkendeHoogteMaat;
    }
    if (verbruikPerM2 !== undefined) {
      payload.verbruik_per_m2 = verbruikPerM2;
    }
    if (safetyConfirmed) payload.safety_confirmed = true;
    if (safetyAnswer) payload.safety_answer = safetyAnswer;
    if (expectedUnit) payload.expected_unit = expectedUnit;
    if (hasPendingContext) {
      payload.pending_id = pendingId!;
      payload.quote_id = quoteId!;
      payload.klus_id = klusId!;
    }
    const n8nPayload =
      Object.keys(safetyAnswers).length > 0
        ? { ...payload, safety_answers: safetyAnswers }
        : payload;
    const dbPayload = toMainMaterialListPayload(payload);
    const useN8nMaterialenUpsertRoute = process.env.USE_N8N_MATERIALEN_UPSERT_ROUTE === 'true';

    let data: any = null;
    let realRowId: string | null = null;
    let n8nResponse: any = null;

    // 6) Update of insert
    if (incomingRowId) {
      // SECURITY: update alleen eigen materiaal.
      const upd = await supabaseAdmin
        .from('main_material_list')
        .update(dbPayload)
        .eq('row_id', incomingRowId)
        .eq('gebruikerid', uid)
        .select('*')
        .maybeSingle();

      if (upd.error) return jsonFail(upd.error.message || 'Update failed', 500);
      data = upd.data;

      if (!data) {
        // Fallback: clone source row from another owned catalog (never NULL-owner),
        // then persist as this user's row.
        const source = await supabaseAdmin
          .from('main_material_list')
          .select('*')
          .eq('row_id', incomingRowId)
          .neq('gebruikerid', uid)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (source.error) return jsonFail(source.error.message || 'Lookup failed', 500);
        if (!source.data) return jsonFail('Materiaal niet gevonden voor deze gebruiker.', 404);

        const {
          created_at: _createdAt,
          gebruikerid: _sourceOwner,
          ...sourceBase
        } = source.data as Record<string, unknown>;

        const copyPayload = {
          ...sourceBase,
          ...dbPayload,
          gebruikerid: uid,
        };

        const insCopy = await supabaseAdmin
          .from('main_material_list')
          .upsert(copyPayload, { onConflict: 'gebruikerid,row_id' })
          .select('*')
          .maybeSingle();

        if (insCopy.error) return jsonFail(insCopy.error.message || 'Insert failed', 500);
        data = insCopy.data;
      }
      realRowId = data?.row_id ?? incomingRowId ?? null;
    } else {
      // Default: directe insert/update in Supabase, zonder n8n vraag-flow.
      // Bestaande n8n-flow blijft beschikbaar via USE_N8N_MATERIALEN_UPSERT_ROUTE=true.
      if (!useN8nMaterialenUpsertRoute) {
        if (hasPendingContext) {
          await writePendingState({
            status: 'saving',
            materiaalnaam: naam,
            expected_unit: expectedUnit,
            safety_confirmed: safetyConfirmed,
            draft_payload: n8nPayload,
            error: null,
          }, { setCreatedAt: true });
        }

        const existingByName = await supabaseAdmin
          .from('main_material_list')
          .select('row_id')
          .eq('gebruikerid', uid)
          .eq('materiaalnaam', naam)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingByName.error) {
          return jsonFail(existingByName.error.message || 'Lookup failed', 500);
        }

        if (existingByName.data?.row_id) {
          const updByName = await supabaseAdmin
            .from('main_material_list')
            .update(dbPayload)
            .eq('row_id', existingByName.data.row_id)
            .eq('gebruikerid', uid)
            .select('*')
            .maybeSingle();

          if (updByName.error) return jsonFail(updByName.error.message || 'Update failed', 500);
          data = updByName.data;
        } else {
          const ins = await supabaseAdmin
            .from('main_material_list')
            .insert(dbPayload)
            .select('*')
            .single();

          if (ins.error) return jsonFail(ins.error.message || 'Insert failed', 500);
          data = ins.data;
        }

        realRowId =
          normalizeString((data as any)?.row_id) ??
          normalizeString((data as any)?.id) ??
          null;

        if (!realRowId) {
          await writePendingState({
            status: 'error',
            error: 'Materiaal kon niet worden opgeslagen.',
          });
          return jsonFail('Materiaal kon niet worden opgeslagen.', 500);
        }
      } else {
        // Nieuwe materialen lopen via n8n AI-agent -> Supabase
        if (hasPendingContext) {
          await writePendingState({
            status: safetyConfirmed ? 'saving' : 'analyzing',
            materiaalnaam: naam,
            expected_unit: expectedUnit,
            safety_confirmed: safetyConfirmed,
            draft_payload: n8nPayload,
            error: null,
          }, { setCreatedAt: true });
        }
        n8nResponse = await stuurNaarN8nVoorMaterialenUpsert(n8nPayload, { safetyConfirmed });

        const n8nSafety = extractN8nSafetyPrompt(n8nResponse);
        const n8nQuestions = n8nSafety.questions || [];
        if (n8nSafety.ready === false && n8nQuestions.length > 0) {
          const firstQuestion = n8nQuestions[0];
          await writePendingState({
            status: 'needs_answer',
            question: firstQuestion?.question || n8nSafety.question,
            expected_unit: firstQuestion?.expectedUnit || n8nSafety.expectedUnit || expectedUnit,
            questions: n8nQuestions,
            draft_payload: n8nPayload,
            error: null,
          });
          return jsonOk(
            {
              ok: true,
              data: {
                ready: false,
                question: firstQuestion?.question || n8nSafety.question,
                expected_unit: firstQuestion?.expectedUnit || n8nSafety.expectedUnit || null,
                questions: n8nQuestions.map((q) => ({
                  key: q.key,
                  question: q.question,
                  expected_unit: q.expectedUnit,
                  target_field: q.targetField,
                  value_type: q.valueType,
                })),
              },
              row_id: null,
              n8n: n8nResponse,
            },
            200
          );
        }

        const n8nRow = extractN8nRow(n8nResponse);
        if (n8nRow) {
          data = n8nRow;
          realRowId =
            normalizeString((n8nRow as any).row_id) ??
            normalizeString((n8nRow as any).id) ??
            null;
        }

        // Fallback: wacht kort en haal laatste insert op als n8n geen row terugstuurt
        if (!realRowId) {
          try {
            const lookedUp = await lookupLatestInsertedMaterial(uid, naam, safetyConfirmed ? 20 : 8, 300);
            if (lookedUp) {
              data = lookedUp;
              realRowId = normalizeString((lookedUp as any).row_id) ?? null;
            }
          } catch (lookupErr: any) {
            return jsonFail(lookupErr?.message || 'Insert lookup failed', 500);
          }
        }

        if (!realRowId) {
          await writePendingState({
            status: 'error',
            error: 'Materiaal nog niet bevestigd opgeslagen. Probeer opnieuw.',
          });
          return jsonFail(
            'Materiaal nog niet bevestigd opgeslagen. Probeer opnieuw of controleer add-workflow response.',
            502
          );
        }
      }
    }

    // Defensive repair: if n8n returned/stored only incl. btw, patch row to always include excl. btw.
    const storedExcl = parsePriceToNumber((data as any)?.prijs_excl_btw ?? (data as any)?.prijs);
    const storedIncl = parsePriceToNumber((data as any)?.prijs_incl_btw);
    const resolvedStoredExcl =
      storedExcl ??
      (storedIncl !== null ? roundToCents(storedIncl / 1.21) : prijsExclNum);

    if (realRowId && resolvedStoredExcl !== null && storedExcl === null) {
      const repairPayload: Record<string, unknown> = {
        prijs_excl_btw: resolvedStoredExcl,
      };
      if (storedIncl === null) {
        repairPayload.prijs_incl_btw = roundToCents(resolvedStoredExcl * 1.21);
      }

      const repair = await supabaseAdmin
        .from('main_material_list')
        .update(repairPayload)
        .eq('row_id', realRowId)
        .eq('gebruikerid', uid)
        .select('*')
        .maybeSingle();

      if (!repair.error && repair.data) {
        data = repair.data;
      }
    }

    if (realRowId && aiExtraData) {
      const mergedAiExtraData = mergeAiExtraData((data as any)?.ai_extra_data, aiExtraData);
      const aiUpdate = await supabaseAdmin
        .from('main_material_list')
        .update({ ai_extra_data: mergedAiExtraData })
        .eq('row_id', realRowId)
        .eq('gebruikerid', uid)
        .select('*')
        .maybeSingle();

      if (aiUpdate.error) {
        if (!isAiExtraDataColumnMissing(aiUpdate.error)) {
          console.error('Kon ai_extra_data niet opslaan:', aiUpdate.error);
        }
        if (data && typeof data === 'object') {
          (data as any).ai_extra_data = mergedAiExtraData;
        }
      } else if (aiUpdate.data) {
        data = aiUpdate.data;
      } else if (data && typeof data === 'object') {
        (data as any).ai_extra_data = mergedAiExtraData;
      }
    }

    const finalExcl =
      parsePriceToNumber((data as any)?.prijs_excl_btw ?? (data as any)?.prijs) ??
      resolvedStoredExcl;
    const finalIncl =
      parsePriceToNumber((data as any)?.prijs_incl_btw) ??
      (finalExcl !== null ? roundToCents(finalExcl * 1.21) : null);

    const normalized =
      data && typeof data === 'object'
        ? {
            ...data,
            prijs:
              finalExcl ??
              null,
            prijs_excl_btw: finalExcl ?? null,
            prijs_incl_btw: finalIncl ?? null,
            subsectie:
              (data as any).subsectie ??
              (data as any).sub_categorie ??
              null,
          }
        : data;

    if (hasPendingContext && realRowId) {
      const resolvedSnapshot = buildResolvedMaterialSnapshotForQuote(
        normalized,
        realRowId,
        (normalized as any)?.materiaalnaam ?? naam
      );

      try {
        await replacePendingMaterialInQuote(resolvedSnapshot);
      } catch (quotePatchError) {
        console.error('Kon pending materiaal in quote niet vervangen:', quotePatchError);
      }

      await writePendingState(
        {
          status: 'resolved',
          row_id: realRowId,
          materiaalnaam: (normalized as any)?.materiaalnaam ?? naam,
          error: null,
          resolvedAt: FieldValue.serverTimestamp(),
        },
        { remove: true }
      );
    }

    return jsonOk({ ok: true, data: normalized, row_id: realRowId, n8n: n8nResponse }, 200);
  } catch (e: any) {
    console.error('Server error /api/materialen/upsert:', e);
    return jsonFail(e?.message || 'Server error', 500);
  }
}
