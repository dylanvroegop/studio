import type { FinanceBankCostLedgerRow } from '@/lib/finance-bank-ledger';
import type { KnabBankCostRow } from '@/lib/knab-cost-list';

export function bankCategoryReviewTargets(costs: KnabBankCostRow[], ledger: FinanceBankCostLedgerRow[]): FinanceBankCostLedgerRow[] {
  const ids = new Set(costs.filter((row) => row.category === 'overig' && !row.is_internal_transfer
    && !row.is_bunq_topup && !row.is_creman_debt && !row.has_supporting_document && !row.category_override
    && row.payment_type !== 'private').map((row) => row.paid_bank_transaction_id));
  return ledger.filter((row) => ids.has(row.bank_transaction_id) && !row.category_override)
    .map((row) => ({ ...row, category: 'overig' }));
}
