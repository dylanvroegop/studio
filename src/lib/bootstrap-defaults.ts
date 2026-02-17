import { FieldValue } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';

const DEFAULT_MARKER_KEY = 'defaultPackV1';
const MATERIAL_CHUNK_SIZE = 500;
const MATERIAL_FETCH_PAGE_SIZE = 1000;
const PRESET_BATCH_SIZE = 400;

type BootstrapMarker = {
  completedAt?: unknown;
  presetPackVersion?: unknown;
  materialPackVersion?: unknown;
};

export type BootstrapDefaultsResult = {
  ok: true;
  uid: string;
  templateUid: string;
  markerKey: string;
  alreadyCompleted: boolean;
  markerVersionMatches: boolean;
  copiedPresetCount: number;
  copiedMaterialCount: number;
  skippedPresetCopy: boolean;
  skippedMaterialCopy: boolean;
  skippedBecauseTemplateOwner: boolean;
  presetPackVersion: string;
  materialPackVersion: string;
};

type BootstrapDefaultsOptions = {
  ignoreCompletionMarker?: boolean;
};

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function getDefaultTemplateUidOrThrow(): string {
  const templateUid =
    nonEmptyString(process.env.DEFAULT_TEMPLATE_UID)
    || nonEmptyString(process.env.TEMPLATE_UID);

  if (!templateUid) {
    throw new Error('Missing DEFAULT_TEMPLATE_UID environment variable.');
  }
  return templateUid;
}

export function getDefaultPresetPackVersion(): string {
  return nonEmptyString(process.env.DEFAULT_PRESET_PACK_VERSION) || 'v1';
}

export function getDefaultMaterialPackVersion(): string {
  return nonEmptyString(process.env.DEFAULT_MATERIAL_PACK_VERSION) || 'v1';
}

function sanitizeVersionForId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_') || 'v1';
}

function sanitizeDocIdFragment(value: string): string {
  return value.replace(/[\/\s]/g, '_').replace(/[^a-zA-Z0-9_-]/g, '_') || 'x';
}

async function countUserMaterials(uid: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('main_material_list')
    .select('row_id', { count: 'exact', head: true })
    .eq('gebruikerid', uid);

  if (error) throw error;
  return Number(count || 0);
}

async function fetchTemplateMaterialRows(templateUid: string): Promise<Record<string, unknown>[]> {
  const allRows: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    const to = from + MATERIAL_FETCH_PAGE_SIZE - 1;
    const { data, error } = await supabaseAdmin
      .from('main_material_list')
      .select('*')
      .eq('gebruikerid', templateUid)
      .order('order_id', { ascending: true })
      .range(from, to);

    if (error) throw error;

    const chunk = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    if (chunk.length === 0) break;
    allRows.push(...chunk);
    if (chunk.length < MATERIAL_FETCH_PAGE_SIZE) break;
    from += MATERIAL_FETCH_PAGE_SIZE;
  }

  return allRows;
}

async function copyTemplateMaterialsToUser(uid: string, templateUid: string): Promise<number> {
  const templateRows = await fetchTemplateMaterialRows(templateUid);
  if (templateRows.length === 0) return 0;

  const dedupedByRowId = new Map<string, Record<string, unknown>>();
  for (const row of templateRows) {
    const rowMap = row as Record<string, unknown>;
    const rowId = nonEmptyString(rowMap.row_id) || nonEmptyString(rowMap.id);
    if (!rowId) continue;
    if (!dedupedByRowId.has(rowId)) {
      dedupedByRowId.set(rowId, row);
    }
  }

  const sourceRows = Array.from(dedupedByRowId.values());
  if (sourceRows.length === 0) return 0;

  const rowsToInsert = sourceRows.map((row) => {
    const {
      created_at: _createdAt,
      gebruikerid: _owner,
      ...rest
    } = row as Record<string, unknown>;
    return {
      ...rest,
      gebruikerid: uid,
    };
  });

  for (let i = 0; i < rowsToInsert.length; i += MATERIAL_CHUNK_SIZE) {
    const chunk = rowsToInsert.slice(i, i + MATERIAL_CHUNK_SIZE);
    const { error } = await supabaseAdmin
      .from('main_material_list')
      .upsert(chunk, { onConflict: 'gebruikerid,row_id' });
    if (error) throw error;
  }

  return rowsToInsert.length;
}

async function copyTemplatePresetsToUser(params: {
  uid: string;
  templateUid: string;
  presetPackVersion: string;
}): Promise<{ copiedPresetCount: number; userPresetCount: number; userSeededPresetCount: number; skippedPresetCopy: boolean }> {
  const { uid, templateUid, presetPackVersion } = params;
  const { firestore } = initFirebaseAdmin();

  const userPresetSnap = await firestore
    .collection('presets')
    .where('userId', '==', uid)
    .get();

  const userPresetCount = userPresetSnap.size;
  const userSeededPresetCount = userPresetSnap.docs.filter((d) => {
    const data = d.data() as Record<string, unknown>;
    return nonEmptyString(data.seedOrigin) === templateUid;
  }).length;

  // Keep existing custom-only users untouched.
  const shouldSeed = userPresetCount === 0 || userSeededPresetCount > 0;
  if (!shouldSeed) {
    return {
      copiedPresetCount: 0,
      userPresetCount,
      userSeededPresetCount,
      skippedPresetCopy: true,
    };
  }

  const templatePresetSnap = await firestore
    .collection('presets')
    .where('userId', '==', templateUid)
    .get();

  if (templatePresetSnap.empty) {
    return {
      copiedPresetCount: 0,
      userPresetCount,
      userSeededPresetCount,
      skippedPresetCopy: false,
    };
  }

  const versionForId = sanitizeVersionForId(presetPackVersion);
  const uidForId = sanitizeDocIdFragment(uid);
  let copiedPresetCount = 0;
  let operationCount = 0;
  let batch = firestore.batch();

  for (const templateDoc of templatePresetSnap.docs) {
    const sourceData = templateDoc.data() as Record<string, unknown>;
    const {
      userId: _userId,
      seedOrigin: _seedOrigin,
      seedVersion: _seedVersion,
      seedSourcePresetId: _seedSourcePresetId,
      seededAt: _seededAt,
      ...rest
    } = sourceData;

    // Use user-scoped deterministic IDs to avoid cross-user collisions in
    // the shared top-level `presets` collection.
    const targetId = `seed_${uidForId}_${versionForId}_${templateDoc.id}`;
    const targetRef = firestore.collection('presets').doc(targetId);

    batch.set(
      targetRef,
      {
        ...rest,
        userId: uid,
        seedOrigin: templateUid,
        seedVersion: presetPackVersion,
        seedSourcePresetId: templateDoc.id,
        seededAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    copiedPresetCount += 1;
    operationCount += 1;

    if (operationCount >= PRESET_BATCH_SIZE) {
      await batch.commit();
      batch = firestore.batch();
      operationCount = 0;
    }
  }

  if (operationCount > 0) {
    await batch.commit();
  }

  return {
    copiedPresetCount,
    userPresetCount,
    userSeededPresetCount,
    skippedPresetCopy: false,
  };
}

export async function bootstrapDefaultCatalogForUser(
  uid: string,
  options?: BootstrapDefaultsOptions
): Promise<BootstrapDefaultsResult> {
  const safeUid = nonEmptyString(uid);
  if (!safeUid) {
    throw new Error('Invalid uid for default bootstrap.');
  }

  const templateUid = getDefaultTemplateUidOrThrow();
  const presetPackVersion = getDefaultPresetPackVersion();
  const materialPackVersion = getDefaultMaterialPackVersion();
  const markerKey = DEFAULT_MARKER_KEY;

  const { firestore } = initFirebaseAdmin();
  const userRef = firestore.collection('users').doc(safeUid);
  const userSnap = await userRef.get();
  const marker = (userSnap.data()?.systemBootstrap?.[markerKey] || null) as BootstrapMarker | null;

  const markerHasCompletedAt = Boolean(marker?.completedAt);
  const markerVersionMatches =
    nonEmptyString(marker?.presetPackVersion) === presetPackVersion
    && nonEmptyString(marker?.materialPackVersion) === materialPackVersion;

  if (markerHasCompletedAt && !options?.ignoreCompletionMarker) {
    return {
      ok: true,
      uid: safeUid,
      templateUid,
      markerKey,
      alreadyCompleted: true,
      markerVersionMatches,
      copiedPresetCount: 0,
      copiedMaterialCount: 0,
      skippedPresetCopy: true,
      skippedMaterialCopy: true,
      skippedBecauseTemplateOwner: false,
      presetPackVersion,
      materialPackVersion,
    };
  }

  if (safeUid === templateUid) {
    await userRef.set(
      {
        systemBootstrap: {
          [markerKey]: {
            completedAt: FieldValue.serverTimestamp(),
            presetCount: 0,
            materialCount: 0,
            copiedPresetCount: 0,
            copiedMaterialCount: 0,
            presetPackVersion,
            materialPackVersion,
            templateUid,
            skippedBecauseTemplateOwner: true,
          },
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      ok: true,
      uid: safeUid,
      templateUid,
      markerKey,
      alreadyCompleted: false,
      markerVersionMatches,
      copiedPresetCount: 0,
      copiedMaterialCount: 0,
      skippedPresetCopy: true,
      skippedMaterialCopy: true,
      skippedBecauseTemplateOwner: true,
      presetPackVersion,
      materialPackVersion,
    };
  }

  const ownMaterialCount = await countUserMaterials(safeUid);
  const skippedMaterialCopy = ownMaterialCount > 0;
  const copiedMaterialCount = skippedMaterialCopy
    ? 0
    : await copyTemplateMaterialsToUser(safeUid, templateUid);

  const presetResult = await copyTemplatePresetsToUser({
    uid: safeUid,
    templateUid,
    presetPackVersion,
  });

  await userRef.set(
    {
      systemBootstrap: {
        [markerKey]: {
          completedAt: FieldValue.serverTimestamp(),
          presetCount: presetResult.copiedPresetCount,
          materialCount: copiedMaterialCount,
          copiedPresetCount: presetResult.copiedPresetCount,
          copiedMaterialCount,
          presetPackVersion,
          materialPackVersion,
          templateUid,
          skippedPresetCopy: presetResult.skippedPresetCopy,
          skippedMaterialCopy,
        },
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    ok: true,
    uid: safeUid,
    templateUid,
    markerKey,
    alreadyCompleted: false,
    markerVersionMatches,
    copiedPresetCount: presetResult.copiedPresetCount,
    copiedMaterialCount,
    skippedPresetCopy: presetResult.skippedPresetCopy,
    skippedMaterialCopy,
    skippedBecauseTemplateOwner: false,
    presetPackVersion,
    materialPackVersion,
  };
}
