import { buildRequestId, generateRsaKeyPair, signBodyWithPrivateKey } from '@/lib/bunq/crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';

const DEFAULT_BASE_URL = 'https://api.bunq.com';
const SESSION_TTL_MS = 55 * 60 * 1000;
const SESSION_REFRESH_WINDOW_MS = 5 * 60 * 1000;

export type BunqProfile = 'personal' | 'business';

export type BunqContextRow = {
  id: number;
  profile: BunqProfile;
  client_private_key: string;
  client_public_key: string;
  server_public_key: string | null;
  installation_token: string | null;
  device_id: number | null;
  session_token: string | null;
  session_expires_at: string | null;
  user_id: number | null;
  created_at?: string;
  updated_at?: string;
};

type BunqEntry = Record<string, unknown>;

type BunqEnvelope = {
  Response?: BunqEntry[];
  Pagination?: Record<string, unknown>;
  Error?: Array<{ error_description?: string }>;
};

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeBunqProfile(value: unknown): BunqProfile {
  return value === 'business' ? 'business' : 'personal';
}

function getProfileApiKey(profile: BunqProfile): string {
  const personal = safeString(process.env.BUNQ_API_KEY);
  const business =
    safeString(process.env.BUNQ_API_KEY_BUSINESS)
    || safeString(process.env.BUNQ_BUSINESS_API_KEY)
    || safeString(process.env.BUNQ_API_KEY_BUSINESS_ACCOUNT);

  if (profile === 'business') {
    return business || personal;
  }

  return personal;
}

function getConfig(profile: BunqProfile) {
  const apiKey = getProfileApiKey(profile);
  const configuredBaseUrl = safeString(process.env.BUNQ_API_BASE_URL) || DEFAULT_BASE_URL;
  const deviceDescription = safeString(process.env.BUNQ_DEVICE_DESCRIPTION) || 'calvora-server';

  if (!apiKey) {
    throw new Error(profile === 'business'
      ? 'BUNQ_API_KEY_BUSINESS ontbreekt in de serveromgeving.'
      : 'BUNQ_API_KEY ontbreekt in de serveromgeving.');
  }

  let baseUrl = configuredBaseUrl;
  if (/^https?:\/\/public-api\.bunq\.com\/?$/i.test(baseUrl)) {
    baseUrl = 'https://api.bunq.com';
  }
  baseUrl = baseUrl.replace(/\/+$/, '');

  return {
    apiKey,
    baseUrl,
    deviceDescription,
  };
}

function nowPlusSessionTtl(): string {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString();
}

function shouldRefreshSession(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  const ms = new Date(expiresAt).getTime();
  if (Number.isNaN(ms)) return true;
  return ms - Date.now() <= SESSION_REFRESH_WINDOW_MS;
}

function findResponseNode(envelope: BunqEnvelope, key: string): Record<string, unknown> | null {
  const entries = Array.isArray(envelope.Response) ? envelope.Response : [];
  for (const entry of entries) {
    const node = entry[key];
    if (node && typeof node === 'object') {
      return node as Record<string, unknown>;
    }
  }
  return null;
}

function parseBunqError(payload: unknown): string {
  const env = payload && typeof payload === 'object' ? (payload as BunqEnvelope) : null;
  const first = env?.Error?.[0];
  const msg = safeString(first?.error_description);
  return msg || 'Onbekende bunq API fout.';
}

export async function bunqRequest(params: {
  profile: BunqProfile;
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
  authToken?: string;
  privateKeyPem?: string;
  includeSignature?: boolean;
}): Promise<BunqEnvelope> {
  const config = getConfig(params.profile);
  const bodyString = params.body ? JSON.stringify(params.body) : '';
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'User-Agent': `calvora-server/1.0 (${params.profile})`,
    'X-Bunq-Client-Request-Id': buildRequestId(),
  };

  if (params.authToken) {
    headers['X-Bunq-Client-Authentication'] = params.authToken;
  }

  const shouldSign = params.includeSignature ?? params.method !== 'GET';
  if (shouldSign && params.privateKeyPem) {
    headers['X-Bunq-Client-Signature'] = signBodyWithPrivateKey(bodyString, params.privateKeyPem);
  }

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${params.path}`, {
      method: params.method,
      headers,
      body: params.method === 'GET' ? undefined : bodyString,
      cache: 'no-store',
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'onbekende netwerkfout';
    throw new Error(`Kon bunq API niet bereiken (${reason}). Controleer BUNQ_API_BASE_URL en DNS/connectiviteit.`);
  }

  const payload = (await response.json().catch(() => null)) as BunqEnvelope | null;
  if (!response.ok || !payload) {
    throw new Error(parseBunqError(payload));
  }

  return payload;
}

async function createInstallation(current: BunqContextRow): Promise<BunqContextRow> {
  const payload = await bunqRequest({
    profile: current.profile,
    method: 'POST',
    path: '/v1/installation',
    body: {
      client_public_key: current.client_public_key,
    },
    includeSignature: false,
  });

  const tokenNode = findResponseNode(payload, 'Token');
  const keyNode = findResponseNode(payload, 'ServerPublicKey');
  const installationToken = safeString(tokenNode?.token);
  const serverPublicKey = safeString(keyNode?.server_public_key);

  if (!installationToken || !serverPublicKey) {
    throw new Error('Kon bunq installatie niet initialiseren.');
  }

  return {
    ...current,
    installation_token: installationToken,
    server_public_key: serverPublicKey,
  };
}

async function registerDevice(current: BunqContextRow): Promise<BunqContextRow> {
  if (!current.installation_token) {
    throw new Error('Installation token ontbreekt voor bunq device registratie.');
  }

  const config = getConfig(current.profile);
  const payload = await bunqRequest({
    profile: current.profile,
    method: 'POST',
    path: '/v1/device-server',
    body: {
      description: config.deviceDescription,
      secret: config.apiKey,
      permitted_ips: ['*'],
    },
    authToken: current.installation_token,
    privateKeyPem: current.client_private_key,
    includeSignature: true,
  });

  const idNode = findResponseNode(payload, 'Id');
  const deviceId = safeNumber(idNode?.id);
  if (!deviceId) {
    throw new Error('Kon bunq device niet registreren.');
  }

  return {
    ...current,
    device_id: deviceId,
  };
}

async function createSession(current: BunqContextRow): Promise<BunqContextRow> {
  if (!current.installation_token) {
    throw new Error('Installation token ontbreekt voor bunq sessie.');
  }

  const config = getConfig(current.profile);
  const payload = await bunqRequest({
    profile: current.profile,
    method: 'POST',
    path: '/v1/session-server',
    body: {
      secret: config.apiKey,
    },
    authToken: current.installation_token,
    privateKeyPem: current.client_private_key,
    includeSignature: true,
  });

  const tokenNode = findResponseNode(payload, 'Token');
  const userPersonNode = findResponseNode(payload, 'UserPerson');
  const userCompanyNode = findResponseNode(payload, 'UserCompany');

  const sessionToken = safeString(tokenNode?.token);
  const userId = safeNumber(userPersonNode?.id ?? userCompanyNode?.id);

  if (!sessionToken || !userId) {
    throw new Error('Kon bunq sessie niet opzetten.');
  }

  return {
    ...current,
    session_token: sessionToken,
    session_expires_at: nowPlusSessionTtl(),
    user_id: userId,
  };
}

async function upsertContext(row: BunqContextRow): Promise<BunqContextRow> {
  const result = await supabaseAdmin
    .from('bunq_context')
    .upsert({
      profile: row.profile,
      client_private_key: row.client_private_key,
      client_public_key: row.client_public_key,
      server_public_key: row.server_public_key,
      installation_token: row.installation_token,
      device_id: row.device_id,
      session_token: row.session_token,
      session_expires_at: row.session_expires_at,
      user_id: row.user_id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'profile' })
    .select('*')
    .single();

  if (result.error || !result.data) {
    throw new Error('Kon bunq context niet opslaan.');
  }

  return result.data as BunqContextRow;
}

export async function getBunqContext(profileInput: BunqProfile): Promise<BunqContextRow> {
  const profile = normalizeBunqProfile(profileInput);
  const existingResult = await supabaseAdmin
    .from('bunq_context')
    .select('*')
    .eq('profile', profile)
    .maybeSingle();

  if (existingResult.error) {
    throw new Error('Kon bunq context niet lezen.');
  }

  if (!existingResult.data) {
    const keyPair = generateRsaKeyPair();
    let context: BunqContextRow = {
      id: 1,
      profile,
      client_private_key: keyPair.privateKeyPem,
      client_public_key: keyPair.publicKeyPem,
      server_public_key: null,
      installation_token: null,
      device_id: null,
      session_token: null,
      session_expires_at: null,
      user_id: null,
    };

    context = await createInstallation(context);
    context = await registerDevice(context);
    context = await createSession(context);
    return upsertContext(context);
  }

  let context = {
    ...(existingResult.data as BunqContextRow),
    profile,
  };

  if (!context.installation_token || !context.server_public_key) {
    context = await createInstallation(context);
    context = await registerDevice(context);
    context = await createSession(context);
    return upsertContext(context);
  }

  if (!context.device_id) {
    context = await registerDevice(context);
    context = await createSession(context);
    return upsertContext(context);
  }

  if (!context.session_token || shouldRefreshSession(context.session_expires_at)) {
    context = await createSession(context);
    return upsertContext(context);
  }

  return context;
}
