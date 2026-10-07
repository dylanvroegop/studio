import { NextResponse } from 'next/server';
import { zipSync, strToU8 } from 'fflate';
import { noStoreHeaders, resolveBankIdentity } from '@/lib/bank-api-auth';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { initFirebaseAdmin } from '@/firebase/admin';
import { financialCsv, financialDate, normalizeFinancialTransactions, type FinancialRow } from '@/lib/financial-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { firebaseUid, bankUserId } = await resolveBankIdentity(request);
    const blocked = await ensureDemoTrialActiveByUid(firebaseUid);
    if (blocked) return blocked;
    const connectionsResult = await supabaseAdmin.from('bank_connections')
      .select('id,provider,institution_name,status,last_synced_at,link_ref,updated_at').eq('user_id', bankUserId);
    if (connectionsResult.error) throw connectionsResult.error;
    const connections = connectionsResult.data || [];
    const connectionIds = connections.map(row => row.id);
    const accountsResult = connectionIds.length ? await supabaseAdmin.from('bank_accounts')
      .select('id,connection_id,external_account_id,iban,name,currency,status').in('connection_id', connectionIds)
      : { data: [], error: null };
    if (accountsResult.error) throw accountsResult.error;
    const accounts = (accountsResult.data || []).map(row => {
      const connection = connections.find(item => item.id === row.connection_id);
      return { ...row, id: String(row.id), account_type: String(connection?.link_ref || '').startsWith('bunq:personal:') ? 'private' : 'unknown',
        last_synced_at: connection?.last_synced_at || null, connection_status: connection?.status || 'unknown' };
    });
    // Stabiele paginering per rekening; geen globale 50/1000-recordlimiet.
    const transactions: FinancialRow[] = [];
    const balances: FinancialRow[] = [];
    for (const account of accounts) {
      for (let from = 0; ; from += 500) {
        const page = await supabaseAdmin.from('bank_transactions').select('*').eq('bank_account_id', account.id)
          .order('id', { ascending: true }).range(from, from + 499);
        if (page.error) throw page.error;
        transactions.push(...(page.data || []));
        if ((page.data || []).length < 500) break;
      }
      // Bewaar verschillende saldosoorten; de gebruiker bevestigt het geboekte saldo.
      const result = await supabaseAdmin.from('bank_balances').select('bank_account_id,balance_type,amount,currency,reference_date,created_at')
        .eq('bank_account_id', account.id).order('created_at', { ascending: false }).limit(20);
      if (result.error) throw result.error;
      balances.push(...(result.data || []));
    }
    const { firestore } = initFirebaseAdmin();
    const invoicesSnapshot = await firestore.collection('invoices').where('userId', '==', firebaseUid).get();
    const invoices = invoicesSnapshot.docs.map(doc => {
      const row = doc.data();
      return { id: doc.id, date: financialDate(row.issueDate), due_date: financialDate(row.dueDate),
        number: row.invoiceNumberLabel || '', status: row.status, project_id: row.quoteId || '',
        customer: row.sourceQuote?.klantSnapshot?.naam || '', amount_excl: row.totalsSnapshot?.totaalExclBtw ?? null,
        vat: row.totalsSnapshot?.btw ?? null, amount_incl: row.totalsSnapshot?.totaalInclBtw ?? null,
        paid: row.paymentSummary?.paidAmount ?? null, open: row.paymentSummary?.openAmount ?? null };
    });
    const costs: FinancialRow[] = [];
    for (let from = 0; ; from += 500) {
      const page = await supabaseAdmin.from('project_costs')
        .select('id,date,supplier_name,offerte_id,category,amount_excl_btw,btw_amount,amount_incl_btw,payment_status,due_date,status,paid_bank_transaction_id')
        .eq('user_id', firebaseUid).order('id', { ascending: true }).range(from, from + 499);
      if (page.error) throw page.error;
      costs.push(...(page.data || []));
      if ((page.data || []).length < 500) break;
    }
    const normalized = normalizeFinancialTransactions(transactions, accounts);
    const exportedAt = new Date().toISOString();
    const payload = { version: 1, exportedAt, coverageVerified: false,
      coverageNote: 'Opgeslagen historie; volledigheid en openingssaldo moeten per rekening worden bevestigd. Export synchroniseert niet met de bank.',
      connections, accounts, balances, transactions: normalized, invoices, costs, rawTransactions: transactions };
    if (new URL(request.url).searchParams.get('format') === 'json') {
      return NextResponse.json(payload, { headers: noStoreHeaders() });
    }
    const files: Record<string, Uint8Array> = { 'snapshot.json': strToU8(JSON.stringify(payload, null, 2)) };
    for (const [name, rows] of Object.entries({ transactions: normalized, accounts, balances, invoices, costs, connections })) {
      files[`${name}.csv`] = strToU8(financialCsv(rows, rows.length ? Object.keys(rows[0]) : ['id']));
    }
    return new Response(zipSync(files) as unknown as BodyInit, { headers: {
      ...noStoreHeaders(), 'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="financieel-${exportedAt.slice(0, 10)}.zip"`,
    } });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === 'Unauthorized';
    console.error('[financial-export]', unauthorized ? 'Unauthorized' : 'Export mislukt');
    return NextResponse.json({ error: unauthorized ? 'Log opnieuw in.' : 'Export mislukt; er is geen gedeeltelijk bestand gemaakt.' },
      { status: unauthorized ? 401 : 500, headers: noStoreHeaders() });
  }
}
