const API_BASE_URL = 'https://bankaccountdata.gocardless.com/api/v2';

type JsonRecord = Record<string, unknown>;

export interface GoCardlessInstitution {
  id: string;
  name: string;
  bic: string | null;
  logo: string | null;
  countries: string[];
  transactionTotalDays: number | null;
  maxAccessValidForDays: number | null;
}

export interface GoCardlessRequisition {
  id: string;
  status: string;
  institutionId: string;
  agreementId: string | null;
  reference: string | null;
  accounts: string[];
  link: string | null;
}

export interface GoCardlessAccountDetails {
  resourceId: string;
  iban: string | null;
  name: string | null;
  displayName: string | null;
  currency: string;
  ownerName: string | null;
  product: string | null;
  cashAccountType: string | null;
  raw: JsonRecord;
}

export interface GoCardlessBalance {
  balanceType: string | null;
  amount: number | null;
  currency: string | null;
  referenceDate: string | null;
  raw: JsonRecord;
}

export interface GoCardlessTransaction {
  transactionId: string | null;
  bookingDate: string | null;
  valueDate: string | null;
  amount: number;
  currency: string;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  description: string;
  raw: JsonRecord;
}

interface CachedAccessToken {
  token: string;
  expiresAt: number;
}

let cachedAccessToken: CachedAccessToken | null = null;

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

function requireRedirectUri(): string {
  const redirectUri = safeString(process.env.GOCARDLESS_BANK_ACCOUNT_DATA_REDIRECT_URI);
  if (!redirectUri) {
    throw new Error('GOCARDLESS_BANK_ACCOUNT_DATA_REDIRECT_URI ontbreekt in de serveromgeving.');
  }
  return redirectUri;
}

async function parseResponse(response: Response): Promise<JsonRecord | unknown[]> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const body = asRecord(payload);
    const detail = safeString(body.detail) || safeString(body.summary) || `HTTP ${response.status}`;
    throw new Error(`GoCardless API-fout: ${detail}`);
  }
  return payload && typeof payload === 'object' ? payload as JsonRecord | unknown[] : {};
}

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  let refreshToken = safeString(process.env.GOCARDLESS_BANK_ACCOUNT_DATA_REFRESH_TOKEN);
  if (!refreshToken) {
    const secretId = safeString(process.env.GOCARDLESS_BANK_ACCOUNT_DATA_SECRET_ID);
    const secretKey = safeString(process.env.GOCARDLESS_BANK_ACCOUNT_DATA_SECRET_KEY);
    if (!secretId || !secretKey) {
      throw new Error('GoCardless Bank Account Data-gegevens ontbreken. Stel een refresh token of secret ID/secret key in.');
    }

    const tokenResponse = await fetch(`${API_BASE_URL}/token/new/`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret_id: secretId, secret_key: secretKey }),
      cache: 'no-store',
    });
    const tokenPayload = asRecord(await parseResponse(tokenResponse));
    refreshToken = safeString(tokenPayload.refresh);
    if (!refreshToken) throw new Error('GoCardless gaf geen refresh token terug.');
  }

  const accessResponse = await fetch(`${API_BASE_URL}/token/refresh/`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: refreshToken }),
    cache: 'no-store',
  });
  const accessPayload = asRecord(await parseResponse(accessResponse));
  const accessToken = safeString(accessPayload.access);
  const expiresIn = safeNumber(accessPayload.access_expires) ?? 86_400;
  if (!accessToken) throw new Error('GoCardless gaf geen access token terug.');

  cachedAccessToken = {
    token: accessToken,
    expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
  };
  return accessToken;
}

async function apiRequest(path: string, init?: RequestInit): Promise<JsonRecord | unknown[]> {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });
  return parseResponse(response);
}

export function getGoCardlessRedirectUri(): string {
  return requireRedirectUri();
}

export async function listInstitutions(country = 'nl'): Promise<GoCardlessInstitution[]> {
  const payload = await apiRequest(`/institutions/?country=${encodeURIComponent(country.toLowerCase())}`);
  return asArray(payload)
    .map((item) => {
      const row = asRecord(item);
      const id = safeString(row.id);
      if (!id) return null;
      return {
        id,
        name: safeString(row.name) || id,
        bic: safeString(row.bic) || null,
        logo: safeString(row.logo) || null,
        countries: asArray(row.countries).map(safeString).filter(Boolean),
        transactionTotalDays: safeNumber(row.transaction_total_days),
        maxAccessValidForDays: safeNumber(row.max_access_valid_for_days),
      } satisfies GoCardlessInstitution;
    })
    .filter((item): item is GoCardlessInstitution => item !== null);
}

export async function createEndUserAgreement(params: {
  institutionId: string;
  maxHistoricalDays?: number;
  accessValidForDays?: number;
}): Promise<{ id: string }> {
  const payload = await apiRequest('/agreements/enduser/', {
    method: 'POST',
    body: JSON.stringify({
      institution_id: params.institutionId,
      max_historical_days: params.maxHistoricalDays ?? 90,
      access_valid_for_days: params.accessValidForDays ?? 90,
      access_scope: ['balances', 'details', 'transactions'],
    }),
  });
  const row = asRecord(payload);
  const id = safeString(row.id);
  if (!id) throw new Error('GoCardless gaf geen agreement ID terug.');
  return { id };
}

export async function createRequisition(params: {
  institutionId: string;
  agreementId: string;
  reference: string;
  redirectUri: string;
}): Promise<GoCardlessRequisition> {
  const payload = await apiRequest('/requisitions/', {
    method: 'POST',
    body: JSON.stringify({
      institution_id: params.institutionId,
      agreement: params.agreementId,
      reference: params.reference,
      redirect: params.redirectUri,
      user_language: 'NL',
      account_selection: true,
    }),
  });
  return parseRequisition(payload);
}

function parseRequisition(payload: JsonRecord | unknown[]): GoCardlessRequisition {
  const row = asRecord(payload);
  const id = safeString(row.id);
  if (!id) throw new Error('GoCardless gaf geen requisition ID terug.');
  return {
    id,
    status: safeString(row.status) || 'CR',
    institutionId: safeString(row.institution_id),
    agreementId: safeString(row.agreement) || null,
    reference: safeString(row.reference) || null,
    accounts: asArray(row.accounts).map(safeString).filter(Boolean),
    link: safeString(row.link) || null,
  };
}

export async function getRequisition(requisitionId: string): Promise<GoCardlessRequisition> {
  return parseRequisition(await apiRequest(`/requisitions/${encodeURIComponent(requisitionId)}/`));
}

export async function getAccountDetails(accountId: string): Promise<GoCardlessAccountDetails> {
  const payload = await apiRequest(`/accounts/${encodeURIComponent(accountId)}/details/`);
  const root = asRecord(payload);
  const row = asRecord(root.account || root);
  const resourceId = safeString(row.resourceId) || safeString(row.resource_id) || accountId;
  return {
    resourceId,
    iban: safeString(row.iban) || null,
    name: safeString(row.name) || null,
    displayName: safeString(row.displayName) || safeString(row.display_name) || null,
    currency: safeString(row.currency) || 'EUR',
    ownerName: safeString(row.ownerName) || safeString(row.owner_name) || null,
    product: safeString(row.product) || null,
    cashAccountType: safeString(row.cashAccountType) || safeString(row.cash_account_type) || null,
    raw: row,
  };
}

export async function getBalances(accountId: string): Promise<GoCardlessBalance[]> {
  const payload = await apiRequest(`/accounts/${encodeURIComponent(accountId)}/balances/`);
  const root = asRecord(payload);
  return asArray(root.balances).map((item) => {
    const row = asRecord(item);
    const amountNode = asRecord(row.balanceAmount || row.balance_amount);
    return {
      balanceType: safeString(row.balanceType) || safeString(row.balance_type) || null,
      amount: safeNumber(amountNode.amount),
      currency: safeString(amountNode.currency) || null,
      referenceDate: safeString(row.referenceDate) || safeString(row.reference_date) || null,
      raw: row,
    } satisfies GoCardlessBalance;
  });
}

export async function getTransactions(accountId: string): Promise<GoCardlessTransaction[]> {
  const payload = await apiRequest(`/accounts/${encodeURIComponent(accountId)}/transactions/`);
  const root = asRecord(payload);
  const transactions = asRecord(root.transactions);
  return asArray(transactions.booked).map((item) => {
    const row = asRecord(item);
    const amountNode = asRecord(row.transactionAmount || row.transaction_amount);
    const debtorAccount = asRecord(row.debtorAccount || row.debtor_account);
    const creditorAccount = asRecord(row.creditorAccount || row.creditor_account);
    const counterpartyAccount = Object.keys(debtorAccount).length > 0 ? debtorAccount : creditorAccount;
    const amount = safeNumber(amountNode.amount) ?? 0;
    return {
      transactionId: safeString(row.transactionId) || safeString(row.transaction_id) || null,
      bookingDate: safeString(row.bookingDate) || safeString(row.booking_date) || null,
      valueDate: safeString(row.valueDate) || safeString(row.value_date) || null,
      amount,
      currency: safeString(amountNode.currency) || 'EUR',
      counterpartyName: safeString(row.debtorName) || safeString(row.creditorName) || null,
      counterpartyIban: safeString(counterpartyAccount.iban) || null,
      description: safeString(row.remittanceInformationUnstructured)
        || safeString(row.remittance_information_unstructured)
        || safeString(row.remittanceInformationStructured)
        || safeString(row.additionalInformation)
        || 'Transactie',
      raw: row,
    } satisfies GoCardlessTransaction;
  });
}
