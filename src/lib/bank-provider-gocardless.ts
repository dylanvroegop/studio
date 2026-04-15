const AUTH_BASE_URLS = {
  sandbox: 'https://auth.truelayer-sandbox.com',
  live: 'https://auth.truelayer.com',
} as const;

const API_BASE_URLS = {
  sandbox: 'https://api.truelayer-sandbox.com',
  live: 'https://api.truelayer.com',
} as const;

type TrueLayerEnv = 'sandbox' | 'live';

type TrueLayerProviderResponse = {
  provider_id?: unknown;
  display_name?: unknown;
  logo_uri?: unknown;
  icon_uri?: unknown;
};

type TrueLayerProviderListResponse = {
  results?: unknown;
};

type TrueLayerTokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
};

type TrueLayerAccountResponse = {
  account_id?: unknown;
  iban?: unknown;
  display_name?: unknown;
  account_type?: unknown;
  currency?: unknown;
  account_number?: {
    iban?: unknown;
  };
  provider?: {
    display_name?: unknown;
  };
  [key: string]: unknown;
};

type TrueLayerResultsResponse<T> = {
  results?: T[];
};

type TrueLayerBalanceResponse = {
  available?: unknown;
  current?: unknown;
  currency?: unknown;
  update_timestamp?: unknown;
  [key: string]: unknown;
};

type TrueLayerTransactionAmount = {
  amount?: unknown;
  currency?: unknown;
};

type TrueLayerTransactionResponse = {
  transaction_id?: unknown;
  timestamp?: unknown;
  description?: unknown;
  transaction_type?: unknown;
  amount?: unknown;
  currency?: unknown;
  merchant_name?: unknown;
  counterparty?: {
    name?: unknown;
    iban?: unknown;
  };
  normalised_provider_transaction_id?: unknown;
  status?: unknown;
  running_balance?: TrueLayerTransactionAmount;
  [key: string]: unknown;
};

export class ProviderNotConfiguredError extends Error {}
export class ProviderRequestError extends Error {}

export interface BankInstitution {
  id: string;
  name: string;
  bic: string | null;
  logo: string | null;
}

export interface BankProviderSettings {
  countryCode: string;
  redirectUri: string;
  maxTransactionDays: number;
  env: TrueLayerEnv;
}

export interface BankTokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAtIso: string;
}

export interface BankAccountDetails {
  externalAccountId: string;
  iban: string | null;
  name: string | null;
  currency: string | null;
  ownerName: string | null;
  product: string | null;
  cashAccountType: string | null;
}

export interface BankBalance {
  balanceType: string | null;
  amount: number | null;
  currency: string | null;
  referenceDate: string | null;
  raw: Record<string, unknown>;
}

export interface BankTransaction {
  externalTransactionId: string | null;
  internalTransactionId: string | null;
  bookingDate: string | null;
  valueDate: string | null;
  amount: number;
  currency: string;
  direction: 'incoming' | 'outgoing';
  counterpartyName: string | null;
  counterpartyIban: string | null;
  remittanceInformation: string | null;
  status: string | null;
  raw: Record<string, unknown>;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeIsoDate(value: unknown): string | null {
  const str = safeString(value);
  if (!str) return null;
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeDateOnly(value: unknown): string | null {
  const iso = normalizeIsoDate(value);
  if (!iso) return null;
  return iso.slice(0, 10);
}

function parseEnv(value: string): TrueLayerEnv {
  return value.toLowerCase() === 'live' ? 'live' : 'sandbox';
}

function sanitizeProviderMessage(input: unknown): string {
  const row = asRecord(input);
  const direct =
    safeString(row.error_description)
    || safeString(row.error)
    || safeString(row.message)
    || safeString(row.detail);
  if (!direct) return 'Bankprovider antwoordde met een fout.';
  return direct.length > 180 ? `${direct.slice(0, 180)}...` : direct;
}

function getConfig() {
  const clientId = safeString(process.env.TRUELAYER_CLIENT_ID);
  const clientSecret = safeString(process.env.TRUELAYER_CLIENT_SECRET);
  const redirectUri = safeString(process.env.TRUELAYER_REDIRECT_URI);
  const countryCode = safeString(process.env.TRUELAYER_COUNTRY_CODE).toUpperCase() || 'NL';
  const env = parseEnv(safeString(process.env.TRUELAYER_ENV) || 'sandbox');
  const maxTransactionDaysRaw = Number(process.env.TRUELAYER_MAX_TRANSACTION_DAYS || '90');
  const maxTransactionDays = Number.isFinite(maxTransactionDaysRaw) && maxTransactionDaysRaw > 0
    ? Math.min(Math.floor(maxTransactionDaysRaw), 365)
    : 90;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new ProviderNotConfiguredError('Bankkoppeling is nog niet geconfigureerd in de serveromgeving.');
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    countryCode,
    maxTransactionDays,
    env,
    authBaseUrl: AUTH_BASE_URLS[env],
    apiBaseUrl: API_BASE_URLS[env],
  };
}

export function getBankProviderSettings(): BankProviderSettings {
  const config = getConfig();
  return {
    countryCode: config.countryCode,
    redirectUri: config.redirectUri,
    maxTransactionDays: config.maxTransactionDays,
    env: config.env,
  };
}

export async function listInstitutions(): Promise<BankInstitution[]> {
  const config = getConfig();
  const fetchProviders = async (query: URLSearchParams): Promise<TrueLayerProviderResponse[]> => {
    const response = await fetch(`${config.authBaseUrl}/api/providers?${query.toString()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    const payload = (await response.json().catch(() => null)) as TrueLayerProviderListResponse | null;
    if (!response.ok || !payload) {
      throw new ProviderRequestError('Kon bankenlijst niet ophalen.');
    }
    return Array.isArray(payload.results) ? payload.results as TrueLayerProviderResponse[] : [];
  };

  const scopedQuery = new URLSearchParams({
    country: config.countryCode,
    country_code: config.countryCode,
    client_id: config.clientId,
  });
  let rows = await fetchProviders(scopedQuery);
  if (rows.length === 0) {
    rows = await fetchProviders(new URLSearchParams({ client_id: config.clientId }));
  }

  return rows
    .map((row) => ({
      id: safeString(row.provider_id),
      name: safeString(row.display_name),
      bic: null,
      logo: safeString(row.logo_uri) || safeString(row.icon_uri) || null,
    }))
    .filter((row) => row.id.length > 0 && row.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

export function buildAuthRedirectUrl(params: { state: string; providerId: string }): string {
  const config = getConfig();
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: 'info accounts balance transactions offline_access',
    state: params.state,
    nonce: crypto.randomUUID(),
    provider_id: params.providerId,
  });
  return `${config.authBaseUrl}/?${query.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<BankTokenSet> {
  const config = getConfig();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code,
  });

  const response = await fetch(`${config.authBaseUrl}/connect/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as TrueLayerTokenResponse | null;
  if (!response.ok || !payload) {
    throw new ProviderRequestError('Kon token niet ophalen na banktoestemming.');
  }

  const accessToken = safeString(payload.access_token);
  const refreshToken = safeString(payload.refresh_token) || null;
  const expiresIn = Number(payload.expires_in);
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new ProviderRequestError('Ontvangen banktoken is ongeldig.');
  }

  const expiresAt = new Date(Date.now() + expiresIn * 1000 - 30_000);
  return {
    accessToken,
    refreshToken,
    expiresAtIso: expiresAt.toISOString(),
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<BankTokenSet> {
  const config = getConfig();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
  });

  const response = await fetch(`${config.authBaseUrl}/connect/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as TrueLayerTokenResponse | null;
  if (!response.ok || !payload) {
    throw new ProviderRequestError('Kon banktoken niet verversen.');
  }

  const accessToken = safeString(payload.access_token);
  const nextRefreshToken = safeString(payload.refresh_token) || refreshToken;
  const expiresIn = Number(payload.expires_in);
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new ProviderRequestError('Vernieuwd banktoken is ongeldig.');
  }

  const expiresAt = new Date(Date.now() + expiresIn * 1000 - 30_000);
  return {
    accessToken,
    refreshToken: nextRefreshToken,
    expiresAtIso: expiresAt.toISOString(),
  };
}

async function providerDataGet<T>(path: string, accessToken: string): Promise<T> {
  const config = getConfig();
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || !payload) {
    const safeMessage = sanitizeProviderMessage(payload);
    throw new ProviderRequestError(safeMessage);
  }

  return payload;
}

export async function listAccountIds(accessToken: string): Promise<string[]> {
  const payload = await providerDataGet<TrueLayerResultsResponse<TrueLayerAccountResponse>>('/data/v1/accounts', accessToken);
  const rows = Array.isArray(payload.results) ? payload.results : [];
  return rows
    .map((row) => safeString(row.account_id))
    .filter(Boolean);
}

export async function getAccountDetails(accountId: string, accessToken: string): Promise<BankAccountDetails> {
  const payload = await providerDataGet<TrueLayerResultsResponse<TrueLayerAccountResponse>>(
    `/data/v1/accounts/${encodeURIComponent(accountId)}`,
    accessToken
  );
  const account = Array.isArray(payload.results) && payload.results.length > 0 ? payload.results[0] : null;
  const row = account ? asRecord(account) : {};
  const accountNumber = asRecord(row.account_number);

  return {
    externalAccountId: accountId,
    iban: safeString(accountNumber.iban) || safeString(row.iban) || null,
    name: safeString(row.display_name) || null,
    currency: safeString(row.currency) || null,
    ownerName: null,
    product: safeString(row.account_type) || null,
    cashAccountType: safeString(row.account_type) || null,
  };
}

export async function getAccountBalances(accountId: string, accessToken: string): Promise<BankBalance[]> {
  const payload = await providerDataGet<TrueLayerResultsResponse<TrueLayerBalanceResponse>>(
    `/data/v1/accounts/${encodeURIComponent(accountId)}/balance`,
    accessToken
  );

  const rows = Array.isArray(payload.results) ? payload.results : [];
  const output: BankBalance[] = [];

  for (const row of rows) {
    const current = toNumber(row.current);
    const available = toNumber(row.available);
    const currency = safeString(row.currency) || 'EUR';
    const date = normalizeDateOnly(row.update_timestamp);
    if (current !== null) {
      output.push({
        balanceType: 'closingBooked',
        amount: current,
        currency,
        referenceDate: date,
        raw: asRecord(row),
      });
    }
    if (available !== null) {
      output.push({
        balanceType: 'interimAvailable',
        amount: available,
        currency,
        referenceDate: date,
        raw: asRecord(row),
      });
    }
  }

  return output;
}

export async function getAccountTransactions(
  accountId: string,
  dateFrom: string,
  dateTo: string,
  accessToken: string
): Promise<BankTransaction[]> {
  const query = new URLSearchParams({
    from: dateFrom,
    to: dateTo,
  });

  const payload = await providerDataGet<TrueLayerResultsResponse<TrueLayerTransactionResponse>>(
    `/data/v1/accounts/${encodeURIComponent(accountId)}/transactions?${query.toString()}`,
    accessToken
  );

  const rows = Array.isArray(payload.results) ? payload.results : [];
  return rows.map((entry) => {
    const amountRaw = toNumber(entry.amount) || 0;
    const direction: 'incoming' | 'outgoing' = amountRaw < 0 ? 'outgoing' : 'incoming';
    const counterparty = asRecord(entry.counterparty);
    const bookingDate = normalizeDateOnly(entry.timestamp);

    return {
      externalTransactionId: safeString(entry.transaction_id) || null,
      internalTransactionId: safeString(entry.normalised_provider_transaction_id) || null,
      bookingDate,
      valueDate: bookingDate,
      amount: amountRaw,
      currency: safeString(entry.currency) || 'EUR',
      direction,
      counterpartyName: safeString(counterparty.name) || safeString(entry.merchant_name) || null,
      counterpartyIban: safeString(counterparty.iban) || null,
      remittanceInformation: safeString(entry.description) || null,
      status: safeString(entry.status) || safeString(entry.transaction_type) || null,
      raw: asRecord(entry),
    };
  });
}
