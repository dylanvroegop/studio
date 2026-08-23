import { createSign } from 'crypto';
import { readFileSync } from 'fs';

const API_BASE_URL = 'https://api.enablebanking.com';

type JsonRecord = Record<string, unknown>;

export interface EnableBankingAspsp {
  name: string;
  country: string;
  bic: string | null;
  logo: string | null;
  raw: JsonRecord;
}

export interface EnableBankingAccount {
  uid: string;
  iban: string | null;
  name: string | null;
  currency: string | null;
  product: string | null;
  cashAccountType: string | null;
  ownerName: string | null;
  raw: JsonRecord;
}

export interface EnableBankingBalance {
  balanceType: string | null;
  amount: number | null;
  currency: string | null;
  referenceDate: string | null;
  raw: JsonRecord;
}

export interface EnableBankingTransaction {
  transactionId: string | null;
  bookingDate: string | null;
  valueDate: string | null;
  amount: number;
  currency: string;
  direction: 'incoming' | 'outgoing';
  counterpartyName: string | null;
  counterpartyIban: string | null;
  description: string;
  raw: JsonRecord;
}

export interface EnableBankingSession {
  sessionId: string;
  status: string;
  accounts: string[];
  aspspName: string | null;
  aspspCountry: string | null;
  raw: JsonRecord;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? value as JsonRecord : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function base64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function requireConfig(): { applicationId: string; privateKeyPath: string } {
  const applicationId = safeString(process.env.ENABLE_BANKING_APPLICATION_ID);
  const privateKeyPath = safeString(process.env.ENABLE_BANKING_PRIVATE_KEY_PATH);
  if (!applicationId || !privateKeyPath) {
    throw new Error('Enable Banking-gegevens ontbreken. Stel application ID en private key path in.');
  }
  return { applicationId, privateKeyPath };
}

function createJwt(): string {
  const { applicationId, privateKeyPath } = requireConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: applicationId }));
  const body = base64Url(JSON.stringify({
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${body}`);
  signer.end();
  const signature = signer.sign(readFileSync(privateKeyPath)).toString('base64url');
  return `${header}.${body}.${signature}`;
}

async function parseResponse(response: Response): Promise<JsonRecord | unknown[]> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const body = asRecord(payload);
    const detail = safeString(body.detail) || safeString(body.message) || safeString(body.error_description) || `HTTP ${response.status}`;
    throw new Error(`Enable Banking API-fout: ${detail}`);
  }
  return payload && typeof payload === 'object' ? payload as JsonRecord | unknown[] : {};
}

async function apiRequest(path: string, init?: RequestInit): Promise<JsonRecord | unknown[]> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
      Authorization: `Bearer ${createJwt()}`,
    },
    cache: 'no-store',
  });
  return parseResponse(response);
}

export function getEnableBankingRedirectUri(): string {
  const redirectUri = safeString(process.env.ENABLE_BANKING_REDIRECT_URI);
  if (!redirectUri) throw new Error('ENABLE_BANKING_REDIRECT_URI ontbreekt in de serveromgeving.');
  return redirectUri;
}

export async function listAspsps(country = 'NL'): Promise<EnableBankingAspsp[]> {
  const payload = asRecord(await apiRequest(`/aspsps?country=${encodeURIComponent(country.toUpperCase())}`));
  return asArray(payload.aspsps)
    .map((item) => {
      const row = asRecord(item);
      const name = safeString(row.name);
      if (!name) return null;
      return {
        name,
        country: safeString(row.country) || country.toUpperCase(),
        bic: safeString(row.bic) || null,
        logo: safeString(row.logo) || null,
        raw: row,
      } satisfies EnableBankingAspsp;
    })
    .filter((item): item is EnableBankingAspsp => item !== null);
}

export async function startAuthorization(params: {
  aspspName: string;
  state: string;
  redirectUrl: string;
  psuType?: 'personal' | 'business';
}): Promise<{ url: string; authorizationId: string | null }> {
  const validUntil = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const payload = asRecord(await apiRequest('/auth', {
    method: 'POST',
    body: JSON.stringify({
      access: { valid_until: validUntil },
      aspsp: { name: params.aspspName, country: 'NL' },
      state: params.state,
      redirect_url: params.redirectUrl,
      psu_type: params.psuType || 'personal',
    }),
  }));
  const url = safeString(payload.url);
  if (!url) throw new Error('Enable Banking gaf geen autorisatie-URL terug.');
  return { url, authorizationId: safeString(payload.authorization_id) || null };
}

export async function createSession(code: string): Promise<EnableBankingSession> {
  const payload = asRecord(await apiRequest('/sessions', {
    method: 'POST',
    body: JSON.stringify({ code }),
  }));
  const sessionId = safeString(payload.session_id);
  if (!sessionId) throw new Error('Enable Banking gaf geen sessie-ID terug.');
  return parseSession(payload, sessionId);
}

export async function getSession(sessionId: string): Promise<EnableBankingSession> {
  const payload = asRecord(await apiRequest(`/sessions/${encodeURIComponent(sessionId)}`));
  return parseSession(payload, sessionId);
}

function parseSession(payload: JsonRecord, fallbackSessionId: string): EnableBankingSession {
  return {
    sessionId: safeString(payload.session_id) || fallbackSessionId,
    status: safeString(payload.status) || 'AUTHORIZED',
    accounts: asArray(payload.accounts).map((item) => {
      if (typeof item === 'string') return item;
      return safeString(asRecord(item).uid);
    }).filter(Boolean),
    aspspName: safeString(asRecord(payload.aspsp).name) || null,
    aspspCountry: safeString(asRecord(payload.aspsp).country) || null,
    raw: payload,
  };
}

export async function getAccountDetails(accountId: string): Promise<EnableBankingAccount> {
  const payload = asRecord(await apiRequest(`/accounts/${encodeURIComponent(accountId)}/details`));
  const accountIdData = asRecord(payload.account_id);
  const owner = asArray(payload.owner_name).map(safeString).filter(Boolean).join(', ');
  return {
    uid: safeString(payload.uid) || accountId,
    iban: safeString(accountIdData.iban) || null,
    name: safeString(payload.name) || null,
    currency: safeString(payload.currency) || null,
    product: safeString(payload.product) || null,
    cashAccountType: safeString(payload.cash_account_type) || null,
    ownerName: owner || null,
    raw: payload,
  };
}

export async function getBalances(accountId: string): Promise<EnableBankingBalance[]> {
  const payload = asRecord(await apiRequest(`/accounts/${encodeURIComponent(accountId)}/balances`));
  return asArray(payload.balances).map((item) => {
    const row = asRecord(item);
    const amountData = asRecord(row.balance_amount);
    return {
      balanceType: safeString(row.balance_type) || safeString(row.name) || null,
      amount: safeNumber(amountData.amount),
      currency: safeString(amountData.currency) || null,
      referenceDate: safeString(row.reference_date) || safeString(row.last_change_date_time) || null,
      raw: row,
    } satisfies EnableBankingBalance;
  });
}

export async function getTransactions(accountId: string): Promise<EnableBankingTransaction[]> {
  const transactions: EnableBankingTransaction[] = [];
  let continuationKey = '';
  for (let page = 0; page < 20; page += 1) {
    const query = continuationKey ? `?continuation_key=${encodeURIComponent(continuationKey)}` : '';
    const payload = asRecord(await apiRequest(`/accounts/${encodeURIComponent(accountId)}/transactions${query}`));
    transactions.push(...asArray(payload.transactions).map((item) => parseTransaction(asRecord(item))));
    continuationKey = safeString(payload.continuation_key);
    if (!continuationKey) break;
  }
  return transactions;
}

function parseTransaction(row: JsonRecord): EnableBankingTransaction {
  const amountData = asRecord(row.transaction_amount);
  const rawAmount = safeNumber(amountData.amount) ?? 0;
  const indicator = safeString(row.credit_debit_indicator).toUpperCase();
  const amount = indicator === 'DBIT' ? -Math.abs(rawAmount) : Math.abs(rawAmount);
  const incoming = amount >= 0;
  const party = asRecord(row[incoming ? 'debtor' : 'creditor']);
  const partyAccount = asRecord(row[incoming ? 'debtor_account' : 'creditor_account']);
  const remittance = asArray(row.remittance_information).map(safeString).filter(Boolean).join(' · ');
  return {
    transactionId: safeString(row.transaction_id) || safeString(row.entry_reference) || null,
    bookingDate: safeString(row.booking_date) || null,
    valueDate: safeString(row.value_date) || safeString(row.transaction_date) || null,
    amount,
    currency: safeString(amountData.currency) || 'EUR',
    direction: incoming ? 'incoming' : 'outgoing',
    counterpartyName: safeString(party.name) || null,
    counterpartyIban: safeString(partyAccount.iban) || null,
    description: remittance || safeString(row.note) || safeString(row.entry_reference) || 'Transactie',
    raw: row,
  };
}
