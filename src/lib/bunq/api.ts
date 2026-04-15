import { bunqRequest, getBunqContext } from '@/lib/bunq/client';

export interface BunqMonetaryAccount {
  id: number;
  status: string;
  description: string;
  iban: string | null;
  currency: string;
  balance: number | null;
  raw: Record<string, unknown>;
}

export interface BunqPayment {
  id: number;
  amount: number;
  currency: string;
  description: string;
  created: string;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  raw: Record<string, unknown>;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function getResponseEntries(payload: Record<string, unknown>): Record<string, unknown>[] {
  const raw = payload.Response;
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry) => entry && typeof entry === 'object') as Record<string, unknown>[];
}

function extractPaginationOlderId(payload: Record<string, unknown>): number | null {
  const pagination = asRecord(payload.Pagination);
  const olderUrl = safeString(pagination.older_url);
  if (!olderUrl) return null;
  try {
    const parsed = new URL(olderUrl, 'https://placeholder.local');
    const id = Number(parsed.searchParams.get('older_id') || parsed.searchParams.get('id_older'));
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

export async function getUser(): Promise<{ id: number; display_name: string }> {
  const context = await getBunqContext();
  if (!context.user_id || !context.session_token) {
    throw new Error('Geen geldige bunq sessie beschikbaar.');
  }

  const payload = (await bunqRequest({
    method: 'GET',
    path: `/v1/user/${context.user_id}`,
    authToken: context.session_token,
    includeSignature: false,
  })) as unknown as Record<string, unknown>;

  const entries = getResponseEntries(payload);
  const userNode = entries
    .map((entry) => entry.UserPerson || entry.UserCompany)
    .find((node) => node && typeof node === 'object') as Record<string, unknown> | undefined;

  if (userNode) {
    return {
      id: Number(userNode.id || context.user_id),
      display_name: safeString(userNode.display_name) || 'bunq',
    };
  }

  return {
    id: context.user_id,
    display_name: 'bunq',
  };
}

export async function listMonetaryAccounts(userId: number): Promise<BunqMonetaryAccount[]> {
  const context = await getBunqContext();
  if (!context.session_token) throw new Error('Geen geldige bunq sessie beschikbaar.');

  const payload = (await bunqRequest({
    method: 'GET',
    path: `/v1/user/${userId}/monetary-account`,
    authToken: context.session_token,
    includeSignature: false,
  })) as unknown as Record<string, unknown>;

  const entries = getResponseEntries(payload);

  return entries
    .map((entry) => {
      const node = (entry.MonetaryAccountBank || entry.MonetaryAccountJoint || entry.MonetaryAccountSavings) as Record<string, unknown> | undefined;
      if (!node) return null;
      const balanceNode = asRecord(node.balance);
      const monetaryAmountNode = asRecord(node.monetary_account_profile);
      const accountId = Number(node.id);
      if (!Number.isFinite(accountId)) return null;
      return {
        id: accountId,
        status: safeString(node.status),
        description: safeString(node.description) || `Rekening ${accountId}`,
        iban: safeString(node.iban) || null,
        currency: safeString(balanceNode.currency) || safeString(monetaryAmountNode.currency) || 'EUR',
        balance: safeNumber(balanceNode.value),
        raw: node,
      };
    })
    .filter((row): row is BunqMonetaryAccount => row !== null);
}

export async function listPayments(
  userId: number,
  accountId: number,
  options?: { count?: number; olderId?: number }
): Promise<{ payments: BunqPayment[]; olderId: number | null }> {
  const context = await getBunqContext();
  if (!context.session_token) throw new Error('Geen geldige bunq sessie beschikbaar.');

  const query = new URLSearchParams();
  query.set('count', String(options?.count ?? 200));
  if (options?.olderId) query.set('older_id', String(options.olderId));

  const payload = (await bunqRequest({
    method: 'GET',
    path: `/v1/user/${userId}/monetary-account/${accountId}/payment?${query.toString()}`,
    authToken: context.session_token,
    includeSignature: false,
  })) as unknown as Record<string, unknown>;

  const entries = getResponseEntries(payload);
  const payments = entries
    .map((entry) => entry.Payment as Record<string, unknown> | undefined)
    .filter((node): node is Record<string, unknown> => Boolean(node))
    .map((node) => {
      const id = Number(node.id);
      const amountNode = asRecord(node.amount);
      const counterpartyNode = asRecord(node.counterparty_alias);
      const amount = Number.parseFloat(safeString(amountNode.value) || '0');
      return {
        id,
        amount: Number.isFinite(amount) ? amount : 0,
        currency: safeString(amountNode.currency) || 'EUR',
        description: safeString(node.description) || 'Transactie',
        created: safeString(node.created),
        counterpartyName: safeString(counterpartyNode.display_name) || null,
        counterpartyIban: safeString(counterpartyNode.iban) || null,
        raw: node,
      };
    })
    .filter((row) => Number.isFinite(row.id));

  return {
    payments,
    olderId: extractPaginationOlderId(payload),
  };
}
