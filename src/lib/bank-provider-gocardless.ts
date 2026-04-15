const DEFAULT_BASE_URL = 'https://bankaccountdata.gocardless.com';
const ACCESS_TOKEN_TTL_MS = 55 * 60 * 1000;

type GoCardlessTokenResponse = {
  access?: unknown;
};

type GoCardlessInstitutionResponse = {
  id?: unknown;
  name?: unknown;
  bic?: unknown;
  logo?: unknown;
};

type GoCardlessAgreementResponse = {
  id?: unknown;
};

type GoCardlessRequisitionResponse = {
  id?: unknown;
  link?: unknown;
  status?: unknown;
  accounts?: unknown;
  reference?: unknown;
};

type GoCardlessAccountDetailsResponse = {
  account?: unknown;
};

type GoCardlessAccountBalancesResponse = {
  balances?: unknown;
};

type GoCardlessAccountTransactionsResponse = {
  transactions?: unknown;
};

type GoCardlessTransactionAmount = {
  amount?: unknown;
  currency?: unknown;
};

type GoCardlessRawTransaction = {
  transactionId?: unknown;
  internalTransactionId?: unknown;
  bookingDate?: unknown;
  valueDate?: unknown;
  transactionAmount?: GoCardlessTransactionAmount;
  creditorName?: unknown;
  debtorName?: unknown;
  creditorAccount?: unknown;
  debtorAccount?: unknown;
  remittanceInformationUnstructured?: unknown;
  additionalInformation?: unknown;
  bankTransactionCode?: unknown;
  status?: unknown;
  [key: string]: unknown;
};

type GoCardlessRawBalance = {
  balanceType?: unknown;
  balanceAmount?: {
    amount?: unknown;
    currency?: unknown;
  };
  referenceDate?: unknown;
  [key: string]: unknown;
};

type TokenCache = {
  token: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

export class ProviderNotConfiguredError extends Error {}
export class ProviderRequestError extends Error {}

export interface BankInstitution {
  id: string;
  name: string;
  bic: string | null;
  logo: string | null;
}

export interface BankRequisition {
  id: string;
  link: string;
  status: string;
  accounts: string[];
  reference: string;
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
  const str = safeString(value);
  if (!str) return null;
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function sanitizeProviderMessage(input: unknown): string {
  const record = asRecord(input);
  const direct =
    safeString(record.summary)
    || safeString(record.detail)
    || safeString(record.message)
    || safeString(record.error);
  if (!direct) return 'Bankprovider antwoordde met een fout.';
  if (direct.length > 180) return `${direct.slice(0, 180)}...`;
  return direct;
}

function getConfig() {
  const secretId = safeString(process.env.GOCARDLESS_SECRET_ID);
  const secretKey = safeString(process.env.GOCARDLESS_SECRET_KEY);
  const redirectUri = safeString(process.env.GOCARDLESS_REDIRECT_URI);
  const countryCode = safeString(process.env.GOCARDLESS_COUNTRY_CODE).toUpperCase() || 'NL';
  const maxTransactionDaysRaw = Number(process.env.GOCARDLESS_MAX_TRANSACTION_DAYS || '90');
  const maxTransactionDays = Number.isFinite(maxTransactionDaysRaw) && maxTransactionDaysRaw > 0
    ? Math.min(Math.floor(maxTransactionDaysRaw), 365)
    : 90;
  const baseUrl = safeString(process.env.GOCARDLESS_BASE_URL) || DEFAULT_BASE_URL;

  if (!secretId || !secretKey || !redirectUri) {
    throw new ProviderNotConfiguredError('Bankkoppeling is nog niet geconfigureerd in de serveromgeving.');
  }

  return {
    secretId,
    secretKey,
    redirectUri,
    countryCode,
    maxTransactionDays,
    baseUrl,
  };
}

async function fetchAccessToken(forceRefresh = false): Promise<{ token: string; baseUrl: string }> {
  const config = getConfig();
  const now = Date.now();
  if (!forceRefresh && tokenCache && tokenCache.expiresAt > now) {
    return {
      token: tokenCache.token,
      baseUrl: config.baseUrl,
    };
  }

  const response = await fetch(`${config.baseUrl}/api/v2/token/new/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      secret_id: config.secretId,
      secret_key: config.secretKey,
    }),
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as GoCardlessTokenResponse | null;
  const token = safeString(payload?.access);
  if (!response.ok || !token) {
    throw new ProviderRequestError('Kon geen toegang krijgen tot bankprovider.');
  }

  tokenCache = {
    token,
    expiresAt: now + ACCESS_TOKEN_TTL_MS,
  };

  return {
    token,
    baseUrl: config.baseUrl,
  };
}

async function providerRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const execute = async (forceRefresh: boolean) => {
    const { token, baseUrl } = await fetchAccessToken(forceRefresh);
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => null)) as T | null;
    return { response, payload };
  };

  let result = await execute(false);
  if (result.response.status === 401) {
    tokenCache = null;
    result = await execute(true);
  }

  if (!result.response.ok || result.payload == null) {
    const errorPayload = asRecord(result.payload);
    const message = sanitizeProviderMessage(errorPayload);
    throw new ProviderRequestError(message);
  }

  return result.payload;
}

export function getBankProviderSettings(): { countryCode: string; redirectUri: string; maxTransactionDays: number } {
  const config = getConfig();
  return {
    countryCode: config.countryCode,
    redirectUri: config.redirectUri,
    maxTransactionDays: config.maxTransactionDays,
  };
}

export async function listInstitutions(): Promise<BankInstitution[]> {
  const { countryCode } = getBankProviderSettings();
  const payload = await providerRequest<unknown>('GET', `/api/v2/institutions/?country=${encodeURIComponent(countryCode)}`);
  const rows = Array.isArray(payload) ? payload as GoCardlessInstitutionResponse[] : [];
  return rows
    .map((row) => ({
      id: safeString(row.id),
      name: safeString(row.name),
      bic: safeString(row.bic) || null,
      logo: safeString(row.logo) || null,
    }))
    .filter((row) => row.id.length > 0 && row.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

export async function createAgreement(params: { institutionId: string; maxHistoricalDays: number }): Promise<string | null> {
  const payload = await providerRequest<GoCardlessAgreementResponse>('POST', '/api/v2/agreements/enduser/', {
    institution_id: params.institutionId,
    max_historical_days: params.maxHistoricalDays,
    access_valid_for_days: 90,
    access_scope: ['balances', 'details', 'transactions'],
  });
  const agreementId = safeString(payload.id);
  return agreementId || null;
}

export async function createRequisition(params: {
  institutionId: string;
  reference: string;
  agreementId: string | null;
  redirectUrl: string;
}): Promise<BankRequisition> {
  const payload = await providerRequest<GoCardlessRequisitionResponse>('POST', '/api/v2/requisitions/', {
    institution_id: params.institutionId,
    redirect: params.redirectUrl,
    reference: params.reference,
    user_language: 'NL',
    account_selection: false,
    redirect_immediate: false,
    ...(params.agreementId ? { agreement: params.agreementId } : {}),
  });

  const id = safeString(payload.id);
  const link = safeString(payload.link);
  const status = safeString(payload.status) || 'CR';
  const reference = safeString(payload.reference) || params.reference;
  const accounts = Array.isArray(payload.accounts) ? payload.accounts.map((item) => safeString(item)).filter(Boolean) : [];

  if (!id || !link) {
    throw new ProviderRequestError('Bankkoppeling kon niet worden gestart.');
  }

  return { id, link, status, accounts, reference };
}

export async function getRequisition(requisitionId: string): Promise<BankRequisition> {
  const payload = await providerRequest<GoCardlessRequisitionResponse>('GET', `/api/v2/requisitions/${encodeURIComponent(requisitionId)}/`);
  const id = safeString(payload.id);
  if (!id) throw new ProviderRequestError('Bankkoppeling kon niet worden opgehaald.');
  const link = safeString(payload.link);
  const status = safeString(payload.status) || 'CR';
  const reference = safeString(payload.reference);
  const accounts = Array.isArray(payload.accounts) ? payload.accounts.map((item) => safeString(item)).filter(Boolean) : [];
  return { id, link, status, accounts, reference };
}

export async function getAccountDetails(accountId: string): Promise<BankAccountDetails> {
  const payload = await providerRequest<GoCardlessAccountDetailsResponse>('GET', `/api/v2/accounts/${encodeURIComponent(accountId)}/details/`);
  const account = asRecord(payload.account);
  return {
    externalAccountId: accountId,
    iban: safeString(account.iban) || null,
    name: safeString(account.name) || null,
    currency: safeString(account.currency) || null,
    ownerName: safeString(account.ownerName) || null,
    product: safeString(account.product) || null,
    cashAccountType: safeString(account.cashAccountType) || null,
  };
}

export async function getAccountBalances(accountId: string): Promise<BankBalance[]> {
  const payload = await providerRequest<GoCardlessAccountBalancesResponse>('GET', `/api/v2/accounts/${encodeURIComponent(accountId)}/balances/`);
  const balances = Array.isArray(payload.balances) ? payload.balances as GoCardlessRawBalance[] : [];
  return balances.map((item) => {
    const amountRecord = asRecord(item.balanceAmount);
    return {
      balanceType: safeString(item.balanceType) || null,
      amount: toNumber(amountRecord.amount),
      currency: safeString(amountRecord.currency) || null,
      referenceDate: normalizeDateOnly(item.referenceDate),
      raw: asRecord(item),
    };
  });
}

function parseCounterpartyIban(entry: GoCardlessRawTransaction): string | null {
  const creditor = asRecord(entry.creditorAccount);
  const debtor = asRecord(entry.debtorAccount);
  return safeString(creditor.iban) || safeString(debtor.iban) || null;
}

function mapProviderTransaction(entry: GoCardlessRawTransaction): BankTransaction {
  const amountRecord = asRecord(entry.transactionAmount);
  const amountNumeric = toNumber(amountRecord.amount) || 0;
  const signedAmount = amountNumeric;
  const direction: 'incoming' | 'outgoing' = signedAmount < 0 ? 'outgoing' : 'incoming';
  return {
    externalTransactionId: safeString(entry.transactionId) || null,
    internalTransactionId: safeString(entry.internalTransactionId) || null,
    bookingDate: normalizeDateOnly(entry.bookingDate),
    valueDate: normalizeDateOnly(entry.valueDate),
    amount: signedAmount,
    currency: safeString(amountRecord.currency) || 'EUR',
    direction,
    counterpartyName: safeString(entry.creditorName) || safeString(entry.debtorName) || null,
    counterpartyIban: parseCounterpartyIban(entry),
    remittanceInformation:
      safeString(entry.remittanceInformationUnstructured)
      || safeString(entry.additionalInformation)
      || null,
    status: safeString(entry.status) || null,
    raw: asRecord(entry),
  };
}

export async function getAccountTransactions(accountId: string, dateFrom: string, dateTo: string): Promise<BankTransaction[]> {
  const query = new URLSearchParams({
    date_from: dateFrom,
    date_to: dateTo,
  });
  const payload = await providerRequest<GoCardlessAccountTransactionsResponse>(
    'GET',
    `/api/v2/accounts/${encodeURIComponent(accountId)}/transactions/?${query.toString()}`
  );
  const root = asRecord(payload.transactions);
  const booked = Array.isArray(root.booked) ? root.booked as GoCardlessRawTransaction[] : [];
  return booked.map((entry) => mapProviderTransaction(entry));
}

