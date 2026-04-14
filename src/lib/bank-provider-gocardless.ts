const DEFAULT_BASE_URL = 'https://bankaccountdata.gocardless.com';

type TokenResponse = {
  access?: string;
};

export interface BankInstitution {
  id: string;
  name: string;
  bic?: string | null;
  logo?: string | null;
}

export interface RequisitionResult {
  id: string;
  link: string;
}

export interface RequisitionStatusResult {
  id: string;
  status: string;
  accounts: string[];
}

export interface BankAccountTransaction {
  transaction_id: string | null;
  booking_date: string | null;
  amount: number;
  currency: string;
  creditor_name: string;
  debtor_name: string;
  description: string;
  raw: Record<string, unknown>;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function parseJsonArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === 'object').map((item) => item as Record<string, unknown>)
    : [];
}

function parseAmount(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return numeric;
}

function getConfig() {
  const secretId = safeString(process.env.GOCARDLESS_SECRET_ID);
  const secretKey = safeString(process.env.GOCARDLESS_SECRET_KEY);
  const baseUrl = safeString(process.env.GOCARDLESS_BASE_URL) || DEFAULT_BASE_URL;
  if (!secretId || !secretKey) {
    throw new Error('Bank provider ontbreekt: GOCARDLESS_SECRET_ID of GOCARDLESS_SECRET_KEY niet ingesteld.');
  }

  return { secretId, secretKey, baseUrl };
}

async function getAccessToken(): Promise<{ token: string; baseUrl: string }> {
  const { secretId, secretKey, baseUrl } = getConfig();
  const response = await fetch(`${baseUrl}/api/v2/token/new/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      secret_id: secretId,
      secret_key: secretKey,
    }),
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as TokenResponse | null;
  const token = safeString(payload?.access);
  if (!response.ok || !token) {
    throw new Error('Kon geen bank provider access token ophalen.');
  }

  return { token, baseUrl };
}

async function providerRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { token, baseUrl } = await getAccessToken();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || payload == null) {
    const maybeError = asRecord(payload);
    const detail = safeString(maybeError.detail || maybeError.summary);
    throw new Error(detail || `Bank provider request mislukt (${response.status}).`);
  }

  return payload;
}

export async function listInstitutions(country: string): Promise<BankInstitution[]> {
  const normalizedCountry = safeString(country).toUpperCase() || 'NL';
  const payload = await providerRequest<unknown>(`/api/v2/institutions/?country=${encodeURIComponent(normalizedCountry)}`);
  const rows = parseJsonArray(payload);
  return rows
    .map((row) => ({
      id: safeString(row.id),
      name: safeString(row.name),
      bic: safeString(row.bic) || null,
      logo: safeString(row.logo) || null,
    }))
    .filter((row) => Boolean(row.id) && Boolean(row.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

export async function createRequisition(params: {
  institutionId: string;
  reference: string;
  redirectUrl: string;
}): Promise<RequisitionResult> {
  const payload = await providerRequest<unknown>('/api/v2/requisitions/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      institution_id: params.institutionId,
      reference: params.reference,
      redirect: params.redirectUrl,
      user_language: 'NL',
      account_selection: false,
      redirect_immediate: false,
    }),
  });
  const row = asRecord(payload);
  const id = safeString(row.id);
  const link = safeString(row.link);
  if (!id || !link) {
    throw new Error('Kon bankkoppeling niet starten (ongeldige requisition response).');
  }
  return { id, link };
}

export async function getRequisitionStatus(requisitionId: string): Promise<RequisitionStatusResult> {
  const payload = await providerRequest<unknown>(`/api/v2/requisitions/${encodeURIComponent(requisitionId)}/`);
  const row = asRecord(payload);
  const id = safeString(row.id);
  const status = safeString(row.status);
  const accounts = Array.isArray(row.accounts)
    ? row.accounts.map((item) => safeString(item)).filter(Boolean)
    : [];
  if (!id) {
    throw new Error('Kon bankkoppeling niet ophalen (requisition zonder id).');
  }
  return { id, status, accounts };
}

export async function listAccountTransactions(accountId: string): Promise<BankAccountTransaction[]> {
  const payload = await providerRequest<unknown>(`/api/v2/accounts/${encodeURIComponent(accountId)}/transactions/`);
  const root = asRecord(payload);
  const transactions = asRecord(root.transactions);
  const booked = parseJsonArray(transactions.booked);
  const pending = parseJsonArray(transactions.pending);
  const allRows = [...booked, ...pending];

  return allRows.map((row) => {
    const amountObj = asRecord(row.transactionAmount);
    return {
      transaction_id: safeString(row.transactionId || row.internalTransactionId) || null,
      booking_date: safeString(row.bookingDate || row.valueDate) || null,
      amount: parseAmount(amountObj.amount),
      currency: safeString(amountObj.currency) || 'EUR',
      creditor_name: safeString(row.creditorName),
      debtor_name: safeString(row.debtorName),
      description:
        safeString(row.remittanceInformationUnstructured)
        || safeString(row.additionalInformation)
        || safeString(row.bankTransactionCode)
        || 'Banktransactie',
      raw: row,
    };
  });
}
