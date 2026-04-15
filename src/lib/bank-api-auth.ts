import { initFirebaseAdmin } from '@/firebase/admin';
import { deriveBankUserId } from '@/lib/bank-user-id';

export function noStoreHeaders(): HeadersInit {
  return {
    'Cache-Control': 'no-store',
  };
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

export async function resolveUid(request: Request): Promise<string> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) throw new Error('Unauthorized');
  const { auth } = initFirebaseAdmin();
  const decoded = await auth.verifyIdToken(token);
  const uid = typeof decoded?.uid === 'string' ? decoded.uid : '';
  if (!uid) throw new Error('Unauthorized');
  return uid;
}

export async function resolveBankIdentity(request: Request): Promise<{ firebaseUid: string; bankUserId: string }> {
  const firebaseUid = await resolveUid(request);
  return {
    firebaseUid,
    bankUserId: deriveBankUserId(firebaseUid),
  };
}
