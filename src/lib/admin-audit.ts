import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '@/firebase/admin';

export interface AdminAuditInput {
  actorUserId: string;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  requestPath?: string | null;
  supportMode?: boolean;
}

function sanitizeValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  try {
    const raw = JSON.stringify(value);
    if (!raw) return null;
    if (raw.length <= 8000) {
      return JSON.parse(raw);
    }
    return {
      truncated: true,
      preview: raw.slice(0, 8000),
    };
  } catch {
    return String(value).slice(0, 8000);
  }
}

export async function writeAdminAuditLog(input: AdminAuditInput): Promise<void> {
  const { firestore } = initFirebaseAdmin();
  await firestore.collection('admin_audit_logs').add({
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail || null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId || null,
    before: sanitizeValue(input.before),
    after: sanitizeValue(input.after),
    ip: input.ip || null,
    userAgent: input.userAgent || null,
    requestPath: input.requestPath || null,
    supportMode: input.supportMode === true,
    createdAt: FieldValue.serverTimestamp(),
  });
}
