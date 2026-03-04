import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '@/firebase/admin';

export interface FeatureFlagRecord {
  key: string;
  enabled: boolean;
  description: string;
  updatedByUid: string | null;
  updatedByEmail: string | null;
  updatedAt: unknown;
}

const DEFAULT_FLAGS: Record<string, string> = {
  'ai.generate_email_enabled': 'Schakelt AI e-mailgeneratie via n8n in of uit.',
  'materials.n8n_upsert_enabled': 'Schakelt de n8n AI-flow voor materiaal upserts in of uit.',
};

function normalizeFlagDoc(
  key: string,
  data: Record<string, unknown> | undefined
): FeatureFlagRecord {
  return {
    key,
    enabled: data?.enabled === true,
    description: typeof data?.description === 'string' ? data.description : (DEFAULT_FLAGS[key] || ''),
    updatedByUid: typeof data?.updatedByUid === 'string' ? data.updatedByUid : null,
    updatedByEmail: typeof data?.updatedByEmail === 'string' ? data.updatedByEmail : null,
    updatedAt: data?.updatedAt ?? null,
  };
}

export async function ensureDefaultFeatureFlags(): Promise<void> {
  const { firestore } = initFirebaseAdmin();
  await Promise.all(
    Object.entries(DEFAULT_FLAGS).map(async ([key, description]) => {
      const ref = firestore.collection('feature_flags').doc(key);
      const snap = await ref.get();
      if (snap.exists) return;

      await ref.set({
        key,
        enabled: true,
        description,
        updatedByUid: null,
        updatedByEmail: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    })
  );
}

export async function getFeatureFlags(): Promise<FeatureFlagRecord[]> {
  await ensureDefaultFeatureFlags();
  const { firestore } = initFirebaseAdmin();
  const snap = await firestore.collection('feature_flags').get();
  const rows = snap.docs.map((doc) =>
    normalizeFlagDoc(doc.id, (doc.data() || {}) as Record<string, unknown>)
  );
  rows.sort((a, b) => a.key.localeCompare(b.key, 'nl-NL'));
  return rows;
}

export async function isFeatureEnabled(key: string, fallback = true): Promise<boolean> {
  const { firestore } = initFirebaseAdmin();
  const snap = await firestore.collection('feature_flags').doc(key).get();
  if (!snap.exists) return fallback;
  return snap.data()?.enabled === true;
}

export async function setFeatureFlag(params: {
  key: string;
  enabled: boolean;
  actorUid: string;
  actorEmail?: string | null;
}): Promise<{ before: FeatureFlagRecord | null; after: FeatureFlagRecord }> {
  const { firestore } = initFirebaseAdmin();
  const ref = firestore.collection('feature_flags').doc(params.key);
  const beforeSnap = await ref.get();
  const before = beforeSnap.exists
    ? normalizeFlagDoc(beforeSnap.id, (beforeSnap.data() || {}) as Record<string, unknown>)
    : null;

  const description = before?.description || DEFAULT_FLAGS[params.key] || '';

  await ref.set(
    {
      key: params.key,
      enabled: params.enabled,
      description,
      updatedByUid: params.actorUid,
      updatedByEmail: params.actorEmail || null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const afterSnap = await ref.get();
  const after = normalizeFlagDoc(afterSnap.id, (afterSnap.data() || {}) as Record<string, unknown>);
  return { before, after };
}
