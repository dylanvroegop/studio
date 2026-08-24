import { createHash } from 'crypto';

import {
  getAccountDetails,
  getBalances,
  getSession,
  getTransactions,
  type EnableBankingTransaction,
} from '@/lib/enable-banking/client';
import { mapAccountUpsert, mapBalancesInsert, mapTransactionsUpsert } from '@/lib/bank-sync';
import { supabaseAdmin } from '@/lib/supabase-admin';

const PROVIDER = 'enablebanking';

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseDateOnly(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function bookedAt(date: string | null): string {
  return date ? `${date}T00:00:00.000Z` : new Date().toISOString();
}

function fallbackTransactionId(accountId: string, tx: EnableBankingTransaction): string {
  const raw = [accountId, tx.bookingDate || '', tx.valueDate || '', tx.amount.toFixed(2), tx.description, tx.counterpartyName || ''].join('|');
  return createHash('sha256').update(raw).digest('hex');
}

async function findConnection(params: { bankUserId: string; sessionId: string }): Promise<{ id: string; institutionName: string | null }> {
  const result = await supabaseAdmin
    .from('bank_connections')
    .select('id,institution_name')
    .eq('provider', PROVIDER)
    .eq('user_id', params.bankUserId)
    .eq('requisition_id', params.sessionId)
    .maybeSingle();
  if (result.error) throw new Error(`Kon Enable Banking-koppeling niet laden: ${result.error.message}`);
  if (!result.data?.id) throw new Error('Enable Banking-koppeling niet gevonden. Start de koppeling opnieuw.');
  return { id: String(result.data.id), institutionName: safeString(result.data.institution_name) || null };
}

async function upsertTransactions(rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  const result = await supabaseAdmin.from('bank_transactions').upsert(rows, { onConflict: 'user_id,external_id' });
  if (result.error) throw new Error(`Kon Knab-transacties niet opslaan: ${result.error.message}`);
}

export async function syncEnableBankingConnection(params: {
  bankUserId: string;
  sessionId: string;
}): Promise<{ newCount: number; accountsSynced: number; status: string }> {
  const connection = await findConnection(params);
  const session = await getSession(params.sessionId);
  if (session.status !== 'AUTHORIZED' && session.status !== 'RETURNED_FROM_BANK') {
    await supabaseAdmin.from('bank_connections').update({
      status: session.status === 'REVOKED' || session.status === 'EXPIRED' ? 'revoked' : 'pending',
      last_error: `Enable Banking status: ${session.status || 'onbekend'}`,
      updated_at: new Date().toISOString(),
    }).eq('id', connection.id);
    return { newCount: 0, accountsSynced: 0, status: session.status || 'pending' };
  }

  await supabaseAdmin.from('bank_accounts').update({ status: 'inactive', updated_at: new Date().toISOString() }).eq('connection_id', connection.id);
  let newCount = 0;
  const linkedAccountIds: string[] = [];

  for (const providerAccountId of session.accounts) {
    const [details, balances, transactions] = await Promise.all([
      getAccountDetails(providerAccountId),
      getBalances(providerAccountId),
      getTransactions(providerAccountId),
    ]);
    const externalAccountId = `${PROVIDER}:${providerAccountId}`;
    const accountResult = await supabaseAdmin.from('bank_accounts').upsert(mapAccountUpsert({
      connectionId: connection.id,
      externalAccountId,
      iban: details.iban,
      name: details.name || 'Knab rekening',
      currency: details.currency || 'EUR',
      ownerName: details.ownerName,
      product: details.product,
      cashAccountType: details.cashAccountType,
    }) as unknown as Record<string, unknown>, { onConflict: 'external_account_id' }).select('id').single();
    if (accountResult.error || !accountResult.data?.id) throw new Error(`Kon Knab rekening niet opslaan: ${accountResult.error?.message || 'onbekende fout'}`);
    const bankAccountId = String(accountResult.data.id);
    linkedAccountIds.push(bankAccountId);

    const clearBalances = await supabaseAdmin.from('bank_balances').delete().eq('bank_account_id', bankAccountId);
    if (clearBalances.error) throw new Error('Kon bestaand Knab-saldo niet verversen.');
    if (balances.length > 0) {
      const balanceResult = await supabaseAdmin.from('bank_balances').insert(mapBalancesInsert(bankAccountId, balances) as unknown as Record<string, unknown>[]);
      if (balanceResult.error) throw new Error(`Kon Knab-saldo niet opslaan: ${balanceResult.error.message}`);
    }

    const transactionsWithIds = transactions.map((tx) => ({
      tx,
      providerTransactionId: safeString(tx.transactionId) || fallbackTransactionId(providerAccountId, tx),
    }));
    const normalized = mapTransactionsUpsert(bankAccountId, transactionsWithIds.map(({ tx, providerTransactionId }) => ({
      externalTransactionId: providerTransactionId,
      internalTransactionId: providerTransactionId,
      bookingDate: parseDateOnly(tx.bookingDate),
      valueDate: parseDateOnly(tx.valueDate),
      amount: tx.amount,
      currency: tx.currency,
      direction: tx.direction,
      counterpartyName: tx.counterpartyName,
      counterpartyIban: tx.counterpartyIban,
      remittanceInformation: tx.description,
      status: 'BOOKED',
      raw: tx.raw,
    })));
    const rows = normalized.map((item, index) => {
      const { tx, providerTransactionId } = transactionsWithIds[index];
      return {
        ...item,
        user_id: params.bankUserId,
        external_id: `${PROVIDER}:${providerAccountId}:${providerTransactionId}`,
        source: PROVIDER,
        connection_id: connection.id,
        account_id: providerAccountId,
        description: tx.description || 'Transactie',
        booked_at: bookedAt(tx.bookingDate || tx.valueDate),
        category: 'overig',
        direction: tx.amount < 0 ? 'debit' : 'credit',
        status: 'new',
      };
    });
    await upsertTransactions(rows);
    newCount += rows.length;
    await supabaseAdmin.from('bank_accounts').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', bankAccountId);
  }

  const updateResult = await supabaseAdmin.from('bank_connections').update({
    status: 'connected',
    accounts: session.accounts,
    linked_account_ids: linkedAccountIds,
    last_error: null,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', connection.id);
  if (updateResult.error) throw new Error(`Kon Knab-koppeling niet bijwerken: ${updateResult.error.message}`);
  return { newCount, accountsSynced: session.accounts.length, status: 'connected' };
}
