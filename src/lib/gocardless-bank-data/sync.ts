import { createHash } from 'crypto';

import {
  getAccountDetails,
  getBalances,
  getRequisition,
  getTransactions,
  type GoCardlessTransaction,
} from '@/lib/gocardless-bank-data/client';
import { mapAccountUpsert, mapBalancesInsert, mapTransactionsUpsert } from '@/lib/bank-sync';
import { supabaseAdmin } from '@/lib/supabase-admin';

const PROVIDER = 'gocardless';

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

function fallbackTransactionId(accountId: string, tx: GoCardlessTransaction): string {
  const raw = [accountId, tx.bookingDate || '', tx.valueDate || '', tx.amount.toFixed(2), tx.description, tx.counterpartyName || ''].join('|');
  return createHash('sha256').update(raw).digest('hex');
}

async function findOrCreateConnection(params: {
  bankUserId: string;
  requisitionId: string;
}): Promise<{ id: string; institutionId: string; institutionName: string | null }> {
  const result = await supabaseAdmin
    .from('bank_connections')
    .select('id,institution_id,institution_name,status')
    .eq('provider', PROVIDER)
    .eq('requisition_id', params.requisitionId)
    .eq('user_id', params.bankUserId)
    .maybeSingle();
  if (result.error) throw new Error(`Kon GoCardless-koppeling niet laden: ${result.error.message}`);
  const id = safeString(result.data?.id);
  if (!id) throw new Error('GoCardless-koppeling niet gevonden. Start de koppeling opnieuw.');
  return {
    id,
    institutionId: safeString(result.data?.institution_id),
    institutionName: safeString(result.data?.institution_name) || null,
  };
}

async function upsertTransactions(rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  const result = await supabaseAdmin
    .from('bank_transactions')
    .upsert(rows, { onConflict: 'user_id,external_id' });
  if (result.error) {
    throw new Error(`Kon Knab-transacties niet opslaan: ${result.error.message}`);
  }
}

export async function syncGoCardlessConnection(params: {
  bankUserId: string;
  requisitionId: string;
}): Promise<{ newCount: number; accountsSynced: number; status: string }> {
  const connection = await findOrCreateConnection(params);
  const requisition = await getRequisition(params.requisitionId);
  const accountIds = requisition.accounts;

  if (accountIds.length === 0 || requisition.status !== 'LN') {
    await supabaseAdmin
      .from('bank_connections')
      .update({
        status: requisition.status === 'EX' ? 'revoked' : 'pending',
        last_error: `GoCardless status: ${requisition.status || 'onbekend'}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);
    return { newCount: 0, accountsSynced: 0, status: requisition.status || 'pending' };
  }

  await supabaseAdmin
    .from('bank_accounts')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('connection_id', connection.id);

  let newCount = 0;
  const linkedAccountIds: string[] = [];

  for (const providerAccountId of accountIds) {
    const [details, balances, transactions] = await Promise.all([
      getAccountDetails(providerAccountId),
      getBalances(providerAccountId),
      getTransactions(providerAccountId),
    ]);
    const externalAccountId = `${PROVIDER}:${providerAccountId}`;
    const accountResult = await supabaseAdmin
      .from('bank_accounts')
      .upsert(mapAccountUpsert({
        connectionId: connection.id,
        externalAccountId,
        iban: details.iban,
        name: details.displayName || details.name || 'Knab rekening',
        currency: details.currency,
        ownerName: details.ownerName,
        product: details.product,
        cashAccountType: details.cashAccountType,
      }) as unknown as Record<string, unknown>, { onConflict: 'external_account_id' })
      .select('id')
      .single();
    if (accountResult.error || !accountResult.data?.id) {
      throw new Error(`Kon Knab rekening niet opslaan: ${accountResult.error?.message || 'onbekende fout'}`);
    }
    const bankAccountId = String(accountResult.data.id);
    linkedAccountIds.push(bankAccountId);

    const clearBalances = await supabaseAdmin.from('bank_balances').delete().eq('bank_account_id', bankAccountId);
    if (clearBalances.error) throw new Error('Kon bestaand Knab-saldo niet verversen.');
    if (balances.length > 0) {
      const balanceResult = await supabaseAdmin
        .from('bank_balances')
        .insert(mapBalancesInsert(bankAccountId, balances) as unknown as Record<string, unknown>[]);
      if (balanceResult.error) throw new Error(`Kon Knab-saldo niet opslaan: ${balanceResult.error.message}`);
    }

    const normalized = mapTransactionsUpsert(bankAccountId, transactions.map((tx) => ({
      externalTransactionId: tx.transactionId,
      internalTransactionId: tx.transactionId,
      bookingDate: parseDateOnly(tx.bookingDate),
      valueDate: parseDateOnly(tx.valueDate),
      amount: tx.amount,
      currency: tx.currency,
      direction: tx.amount < 0 ? 'outgoing' : 'incoming',
      counterpartyName: tx.counterpartyName,
      counterpartyIban: tx.counterpartyIban,
      remittanceInformation: tx.description,
      status: 'BOOKED',
      raw: tx.raw,
    })));

    const rows = normalized.map((item, index) => {
      const tx = transactions[index];
      const providerTransactionId = safeString(tx.transactionId) || fallbackTransactionId(providerAccountId, tx);
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

    await supabaseAdmin
      .from('bank_accounts')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', bankAccountId);
  }

  const updateResult = await supabaseAdmin
    .from('bank_connections')
    .update({
      status: 'connected',
      accounts: accountIds,
      linked_account_ids: linkedAccountIds,
      last_error: null,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id);
  if (updateResult.error) throw new Error(`Kon Knab-koppeling niet bijwerken: ${updateResult.error.message}`);

  return { newCount, accountsSynced: accountIds.length, status: 'connected' };
}
