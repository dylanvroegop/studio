const encoder = new TextEncoder();

export const ADMIN_GUARD_COOKIE_NAME = 'calvora_admin_guard';

const DEFAULT_MAX_AGE_SECONDS = 15 * 60;

export interface AdminGuardPayload {
  uid: string;
  email: string | null;
  isAdmin: boolean;
  exp: number;
}

function toBase64Url(input: Uint8Array): string {
  let binary = '';
  for (const byte of input) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + padding);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function getSecret(): string {
  const secret = process.env.ADMIN_GUARD_SECRET?.trim();
  if (!secret) {
    throw new Error('ADMIN_GUARD_SECRET ontbreekt.');
  }
  return secret;
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await importSigningKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

export async function createAdminGuardCookieValue(input: {
  uid: string;
  email?: string | null;
  isAdmin: boolean;
  nowMs?: number;
  maxAgeSeconds?: number;
}): Promise<string> {
  const nowMs = input.nowMs ?? Date.now();
  const maxAgeSeconds = input.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  const payload: AdminGuardPayload = {
    uid: input.uid,
    email: input.email?.trim() || null,
    isAdmin: input.isAdmin === true,
    exp: Math.floor(nowMs / 1000) + maxAgeSeconds,
  };
  const payloadPart = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await sign(payloadPart, getSecret());
  return `${payloadPart}.${signature}`;
}

export async function verifyAdminGuardCookieValue(
  cookieValue: string | null | undefined
): Promise<AdminGuardPayload | null> {
  if (!cookieValue) return null;

  const [payloadPart, signaturePart] = cookieValue.split('.');
  if (!payloadPart || !signaturePart) return null;

  const secret = getSecret();
  const expectedSignature = await sign(payloadPart, secret);
  if (expectedSignature !== signaturePart) return null;

  try {
    const payloadText = new TextDecoder().decode(fromBase64Url(payloadPart));
    const payload = JSON.parse(payloadText) as Partial<AdminGuardPayload>;
    if (!payload || typeof payload !== 'object') return null;
    if (payload.isAdmin !== true) return null;
    if (typeof payload.uid !== 'string' || !payload.uid.trim()) return null;
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) return null;

    return {
      uid: payload.uid.trim(),
      email: typeof payload.email === 'string' && payload.email.trim() ? payload.email.trim() : null,
      isAdmin: true,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export function getAdminGuardCookieMaxAgeSeconds(): number {
  return DEFAULT_MAX_AGE_SECONDS;
}
