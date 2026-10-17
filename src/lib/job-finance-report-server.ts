import { initFirebaseAdmin } from '@/firebase/admin';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { deriveBankUserId } from '@/lib/bank-user-id';
import { buildFinanceBankLedger, type FinanceBankTransaction } from '@/lib/finance-bank-ledger';
import { mapProjectCostRow, normalizeProjectCostCategory } from '@/lib/project-costs';
import { buildJobFinanceReports, type ReportRow } from '@/lib/job-finance-report';

export async function loadJobFinanceReports(uid: string, now = new Date()) {
  const { firestore } = initFirebaseAdmin();
  const [invoices, quotes] = await Promise.all([
    firestore.collection('invoices').where('userId', '==', uid).get(),
    firestore.collection('quotes').where('userId', '==', uid).get(),
  ]);
  async function rows(table: string): Promise<ReportRow[]> {
    const output: ReportRow[] = [];
    for (let offset = 0; ; offset += 500) {
      const result = await supabaseAdmin.from(table).select('*').eq('user_id', uid)
        .order(table === 'bank_transaction_category_overrides' ? 'bank_transaction_id' : 'id').range(offset, offset + 499);
      if (result.error) throw result.error;
      output.push(...(result.data || []));
      if ((result.data || []).length < 500) return output;
    }
  }
  const [costs, hours, overrides] = await Promise.all([rows('project_costs'), rows('time_entries'), rows('bank_transaction_category_overrides')]);
  const warnings: string[] = [];
  const categories = new Map(overrides.map(row => [String(row.bank_transaction_id), normalizeProjectCostCategory(row.category)]));
  const categoryByCost = new Map<string, string>();
  // Gebruik dezelfde bank-/bronkoppeling en categorie-override als Kosten, zonder de bronbedragen dubbel te tellen.
  try {
    const connection = await supabaseAdmin.from('bank_connections').select('id,last_synced_at')
      .eq('user_id', deriveBankUserId(uid)).eq('provider', 'enablebanking').eq('status', 'connected')
      .order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (connection.error || !connection.data) throw new Error('Geen actieve Knab-koppeling');
    const accounts = await supabaseAdmin.from('bank_accounts').select('id').eq('connection_id', String(connection.data.id));
    if (accounts.error || !accounts.data?.length) throw new Error('Geen rekeningen');
    const transactions: FinanceBankTransaction[] = [];
    for (let offset = 0; ; offset += 500) {
      const result = await supabaseAdmin.from('bank_transactions')
        .select('id,amount,booking_date,counterparty_name,description,remittance_information,category,reconciliation_group_id,raw')
        .in('bank_account_id', accounts.data.map(row => row.id)).order('id').range(offset, offset + 499);
      if (result.error) throw result.error;
      transactions.push(...(result.data || []).map(row => ({ ...row, description: row.description || row.remittance_information } as FinanceBankTransaction)));
      if ((result.data || []).length < 500) break;
    }
    const ledger = buildFinanceBankLedger({ userId: uid, transactions, costs: costs.map(mapProjectCostRow), categoryOverrides: categories });
    for (const row of ledger) {
      if (categories.has(row.bank_transaction_id)) row.source_cost_ids.forEach(id => categoryByCost.set(id, row.category));
      if (!row.source_cost_ids.length && row.category === 'gereedschap' && !row.is_private) {
        costs.push({ id: `bank:${row.bank_transaction_id}`, date: row.booking_date, category: 'gereedschap',
          supplier_name: row.supplier_name, description: `${row.description} (bankafschrijving, aankoopdatum/productregels onbekend)`,
          status: 'bank_transaction', amount_incl_btw: row.amount, amount_excl_btw: null });
      }
    }
    const sync = Date.parse(String(connection.data.last_synced_at || ''));
    if (!Number.isFinite(sync) || now.getTime() - sync > 36 * 3600000) warnings.push('Bankgegevens zijn niet recent gesynchroniseerd.');
    if (ledger.some(row => row.match_status === 'unmatched')) warnings.push('Er zijn bankafschrijvingen zonder bronbon/factuur; niet alle kosten zijn aan klussen toewijsbaar.');
  } catch {
    warnings.push('Bankcontrole niet beschikbaar. Bronbonnen/facturen worden gebruikt; niet alle categorie-aanpassingen of ontbrekende aankopen zijn controleerbaar.');
  }
  const enrichedCosts = costs.map(row => ({ ...row,
    reportCategoryOverride: categoryByCost.get(String(row.id)) || categories.get(String(row.paid_bank_transaction_id)) || null }));
  return buildJobFinanceReports({ now, invoices: invoices.docs.map(doc => ({ ...doc.data(), id: doc.id })),
    quotes: quotes.docs.map(doc => ({ ...doc.data(), id: doc.id })), costs: enrichedCosts, hours, warnings });
}
