import { listMonetaryAccounts, listPayments } from '@/lib/bunq/api';
import { getBunqContext } from '@/lib/bunq/client';
import { mapAccountUpsert, mapBalancesInsert, mapTransactionsUpsert } from '@/lib/bank-sync';
import { supabaseAdmin } from '@/lib/supabase-admin';

const PAYMENT_PAGE_SIZE = 200;
const UPSERT_BATCH_SIZE = 100;

function parseDateOnly(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

async function ensureBunqConnection(bankUserId: string): Promise<{ id: string }> {
  const existing = await supabaseAdmin
    .from('bank_connections')
    .select('id')
    .eq('user_id', bankUserId)
    .eq('provider', 'bunq')
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    throw new Error(`Kon bunq bankkoppeling niet laden: ${existing.error.message}`);
  }

  const existingId =
    existing.data && typeof existing.data.id === 'string'
      ? existing.data.id
      : '';
  if (existingId) {
    return { id: existingId };
  }

  const inserted = await supabaseAdmin
    .from('bank_connections')
    .insert({
      user_id: bankUserId,
      provider: 'bunq',
      link_ref: `bunq:${bankUserId}`,
      requisition_id: `bunq:${bankUserId}`,
      institution_id: 'bunq',
      institution_name: 'bunq',
      status: 'connected',
      accounts: [],
      linked_account_ids: [],
      metadata: { source: 'bunq' },
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  const insertedId =
    inserted.data && typeof inserted.data.id === 'string'
      ? inserted.data.id
      : '';

  if (inserted.error || !insertedId) {
    const reason = inserted.error?.message || inserted.error?.details || inserted.error?.hint || 'onbekende databasefout';
    throw new Error(`Kon bunq bankkoppeling niet aanmaken: ${reason}`);
  }

  return { id: insertedId };
}

async function findExistingPaymentIds(paymentIds: number[]): Promise<Set<number>> {
  if (paymentIds.length === 0) return new Set();

  const { data, error } = await supabaseAdmin
    .from('bank_transactions')
    .select('bunq_payment_id')
    .in('bunq_payment_id', paymentIds);

  if (error) {
    throw new Error('Kon bestaande bunq transacties niet lezen.');
  }

  const set = new Set<number>();
  for (const row of data || []) {
    const value = Number(row.bunq_payment_id);
    if (Number.isFinite(value)) set.add(value);
  }
  return set;
}

async function upsertTransactionBatches(rows: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_BATCH_SIZE);
    const result = await supabaseAdmin
      .from('bank_transactions')
      .upsert(chunk, { onConflict: 'bunq_payment_id' });

    if (result.error) {
      throw new Error('Kon bunq transacties niet opslaan.');
    }
  }
}

export async function syncAllTransactions(bankUserId: string): Promise<{ newCount: number; accountsSynced: number }> {
  const context = await getBunqContext();
  if (!context.user_id) {
    throw new Error('Kon bunq gebruiker niet bepalen.');
  }

  const connection = await ensureBunqConnection(bankUserId);
  const accounts = await listMonetaryAccounts(context.user_id);
  const activeAccounts = accounts.filter((account) => account.status.toUpperCase() === 'ACTIVE');

  const deactivateResult = await supabaseAdmin
    .from('bank_accounts')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('connection_id', connection.id)
    .like('external_account_id', 'bunq:%');
  if (deactivateResult.error) {
    throw new Error('Kon bestaande bunq rekeningen niet bijwerken.');
  }

  let totalNewCount = 0;

  for (const account of activeAccounts) {
    const externalAccountId = `bunq:${account.id}`;
    const accountUpsert = mapAccountUpsert({
      connectionId: connection.id,
      externalAccountId,
      iban: account.iban,
      name: account.description,
      currency: account.currency,
      ownerName: null,
      product: 'bunq',
      cashAccountType: 'CURRENT',
    });

    const accountResult = await supabaseAdmin
      .from('bank_accounts')
      .upsert(accountUpsert as unknown as Record<string, unknown>, { onConflict: 'external_account_id' })
      .select('id')
      .single();

    const bankAccountId = typeof accountResult.data?.id === 'string' ? accountResult.data.id : '';
    if (accountResult.error || !bankAccountId) {
      throw new Error('Kon bunq rekening niet opslaan.');
    }

    const balanceRows = mapBalancesInsert(bankAccountId, [{
      balanceType: 'interimAvailable',
      amount: account.balance,
      currency: account.currency,
      referenceDate: new Date().toISOString().slice(0, 10),
      raw: account.raw,
    }]);

    const deleteBalance = await supabaseAdmin
      .from('bank_balances')
      .delete()
      .eq('bank_account_id', bankAccountId);

    if (deleteBalance.error) {
      throw new Error('Kon bunq saldo niet verversen.');
    }

    const insertBalance = await supabaseAdmin
      .from('bank_balances')
      .insert(balanceRows as unknown as Record<string, unknown>[]);

    if (insertBalance.error) {
      throw new Error('Kon bunq saldo niet opslaan.');
    }

    const allNewRows: Record<string, unknown>[] = [];
    let olderId: number | undefined;
    let stop = false;

    while (!stop) {
      const page = await listPayments(context.user_id, account.id, {
        count: PAYMENT_PAGE_SIZE,
        olderId,
      });

      if (page.payments.length === 0) {
        break;
      }

      const pageIds = page.payments.map((payment) => payment.id);
      const existingIds = await findExistingPaymentIds(pageIds);

      const orderedRows: typeof page.payments = [];
      for (const payment of page.payments) {
        if (existingIds.has(payment.id)) {
          stop = true;
          break;
        }
        orderedRows.push(payment);
      }

      if (orderedRows.length > 0) {
        const txRows = orderedRows.map((payment) => {
          const sign = payment.amount >= 0 ? 1 : -1;
          const normalized = mapTransactionsUpsert(bankAccountId, [{
            externalTransactionId: String(payment.id),
            internalTransactionId: String(payment.id),
            bookingDate: parseDateOnly(payment.created),
            valueDate: parseDateOnly(payment.created),
            amount: payment.amount,
            currency: payment.currency,
            direction: sign < 0 ? 'outgoing' : 'incoming',
            counterpartyName: payment.counterpartyName,
            counterpartyIban: payment.counterpartyIban,
            remittanceInformation: payment.description,
            status: 'BOOKED',
            raw: payment.raw,
          }])[0];

          return {
            ...normalized,
            bunq_payment_id: payment.id,
            bunq_account_id: account.id,
          };
        });

        allNewRows.push(...txRows);
      }

      if (stop || page.olderId == null) {
        break;
      }

      olderId = page.olderId;
    }

    if (allNewRows.length > 0) {
      await upsertTransactionBatches(allNewRows);
      totalNewCount += allNewRows.length;
    }
  }

  await supabaseAdmin
    .from('bank_connections')
    .update({
      status: 'connected',
      institution_name: 'bunq',
      accounts: activeAccounts.map((account) => ({ id: account.id, status: account.status })),
      linked_account_ids: activeAccounts.map((account) => String(account.id)),
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id);

  return {
    newCount: totalNewCount,
    accountsSynced: activeAccounts.length,
  };
}
