import {
  normalizeProjectCostPaymentStatus,
  normalizeProjectCostPaymentType,
  roundEuro,
  type ProjectCostPaymentStatus,
  type ProjectCostPaymentType,
  type ProjectCostRow,
} from '@/lib/project-costs';

export type BouwmaatGroupStatus = 'betaald' | 'openstaand' | 'gedeeltelijk' | 'onbekend';

export interface BouwmaatBankTransaction {
  id: string;
  amount: number;
  booking_date: string | null;
  counterparty_name: string | null;
  description: string | null;
  reconciliation_group_id?: string | null;
}

export interface BouwmaatReconciliationGroup {
  id: string;
  supplierInvoiceNumber: string | null;
  date: string | null;
  dueDate: string | null;
  paymentType: ProjectCostPaymentType;
  paymentStatus: ProjectCostPaymentStatus;
  status: BouwmaatGroupStatus;
  costAmount: number;
  bankAmount: number;
  outstandingAmount: number;
  splitRowCount: number;
  costRows: Array<{
    id: string;
    category: string;
    description: string;
    amount: number;
    offerteId: string | null;
  }>;
  bankTransactions: Array<{
    id: string;
    date: string | null;
    amount: number;
    description: string;
    counterparty: string;
  }>;
}

export interface BouwmaatReconciliationResult {
  summary: {
    registeredAmount: number;
    registeredInvoiceAmount: number;
    registeredReceiptAmount: number;
    paidBankAmount: number;
    bankDebitAmount: number;
    openAmount: number;
    partialAmount: number;
    unmatchedBankAmount: number;
    invoiceCount: number;
    receiptCount: number;
    splitInvoiceCount: number;
    openInvoiceCount: number;
    matchedGroupCount: number;
    unmatchedGroupCount: number;
    unknownAmount: number;
    unknownGroupCount: number;
  };
  groups: BouwmaatReconciliationGroup[];
  unmatchedBankTransactions: BouwmaatBankTransaction[];
}

function cents(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100);
}

function euros(value: number): number {
  return roundEuro(value);
}

function lower(value: unknown): string {
  return String(value || '').toLowerCase();
}

function isBouwmaat(value: unknown): boolean {
  return /bouwmaat|dsg bouwmaten/i.test(String(value || ''));
}

function dateValue(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  const time = new Date(`${value.slice(0, 10)}T00:00:00Z`).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
}

function withinPaymentWindow(group: { date: string | null; dueDate: string | null }, bankDate: string | null): boolean {
  if (!bankDate) return true;
  const bankTime = dateValue(bankDate);
  if (!Number.isFinite(bankTime)) return true;
  const start = Number.isFinite(dateValue(group.date)) ? dateValue(group.date) - 3 * 86400000 : Number.NEGATIVE_INFINITY;
  const endDate = group.dueDate || group.date;
  const end = Number.isFinite(dateValue(endDate)) ? dateValue(endDate) + 45 * 86400000 : Number.POSITIVE_INFINITY;
  return bankTime >= start && bankTime <= end;
}

function findExactSubset(target: number, candidates: Array<{ index: number; amount: number }>, maxItems = 8): number[] | null {
  if (target <= 0 || candidates.length === 0) return null;
  const usable = candidates.filter((candidate) => candidate.amount > 0).slice(0, 20);
  const result: number[] = [];
  const visit = (start: number, remaining: number): boolean => {
    if (remaining === 0) return true;
    if (remaining < 0 || result.length >= maxItems) return false;
    for (let index = start; index < usable.length; index += 1) {
      const candidate = usable[index];
      if (candidate.amount > remaining) continue;
      result.push(candidate.index);
      if (visit(index + 1, remaining - candidate.amount)) return true;
      result.pop();
    }
    return false;
  };
  return visit(0, target) ? [...result] : null;
}

export function buildBouwmaatReconciliation(params: {
  costs: ProjectCostRow[];
  bankTransactions: BouwmaatBankTransaction[];
}): BouwmaatReconciliationResult {
  const costs = params.costs.filter((cost) => isBouwmaat(cost.supplier_name));
  const bankTransactions = params.bankTransactions
    .filter((transaction) => isBouwmaat(`${transaction.counterparty_name || ''} ${transaction.description || ''}`))
    .filter((transaction) => Number(transaction.amount) < 0)
    .map((transaction) => ({ ...transaction, amount: Math.abs(Number(transaction.amount) || 0) }));

  const groupsMap = new Map<string, {
    id: string;
    rows: ProjectCostRow[];
    costAmount: number;
    date: string | null;
    dueDate: string | null;
    invoiceNumber: string | null;
    paymentType: ProjectCostPaymentType;
    paymentStatus: ProjectCostPaymentStatus;
  }>();

  costs.forEach((cost) => {
    const groupId = cost.reconciliation_group_id || `cost:${cost.id}`;
    const existing = groupsMap.get(groupId);
    if (existing) {
      existing.rows.push(cost);
      existing.costAmount = euros(existing.costAmount + cost.amount_incl_btw);
      if (!existing.dueDate && cost.due_date) existing.dueDate = cost.due_date;
      return;
    }
    groupsMap.set(groupId, {
      id: groupId,
      rows: [cost],
      costAmount: euros(cost.amount_incl_btw),
      date: cost.date || null,
      dueDate: cost.due_date || null,
      invoiceNumber: cost.supplier_invoice_number || null,
      paymentType: normalizeProjectCostPaymentType(cost.payment_type),
      paymentStatus: normalizeProjectCostPaymentStatus(cost.payment_status),
    });
  });

  const groups = Array.from(groupsMap.values());
  const assignments = new Map<string, number[]>();
  const usedBank = new Set<string>();

  // New imports carry a stable group id. This is the most reliable path for
  // one invoice split over several categories or offertes.
  groups.forEach((group) => {
    const matching = bankTransactions.filter((transaction) =>
      !usedBank.has(transaction.id)
      && transaction.reconciliation_group_id === group.id
      && withinPaymentWindow(group, transaction.booking_date)
    );
    if (matching.length > 0) {
      assignments.set(group.id, matching.map((transaction) => {
        usedBank.add(transaction.id);
        return bankTransactions.findIndex((candidate) => candidate.id === transaction.id);
      }));
    }
  });

  // Historical rows often predate the metadata. Match exact cents and date
  // window before attempting a combined payment. Never use a fuzzy amount.
  groups.forEach((group) => {
    if (assignments.has(group.id) || group.paymentType === 'bon' || group.paymentType === 'private') return;
    const target = cents(group.costAmount);
    const candidates = bankTransactions
      .map((transaction, index) => ({ transaction, index }))
      .filter(({ transaction }) => !usedBank.has(transaction.id) && withinPaymentWindow(group, transaction.booking_date))
      .sort((left, right) => Math.abs(dateValue(left.transaction.booking_date) - dateValue(group.date)) - Math.abs(dateValue(right.transaction.booking_date) - dateValue(group.date)));
    const exact = candidates.find(({ transaction }) => cents(transaction.amount) === target);
    if (exact) {
      usedBank.add(exact.transaction.id);
      assignments.set(group.id, [exact.index]);
    }
  });

  // A supplier can collect several on-account invoices in one debit. Resolve
  // only exact cent combinations, capped to keep reconciliation predictable.
  const unresolvedGroups = groups.filter((group) => !assignments.has(group.id) && group.paymentType === 'factuur');
  bankTransactions.forEach((transaction, bankIndex) => {
    if (usedBank.has(transaction.id)) return;
    const candidates = unresolvedGroups
      .filter((group) => !assignments.has(group.id) && withinPaymentWindow(group, transaction.booking_date))
      .map((group) => ({ index: groups.indexOf(group), amount: cents(group.costAmount) }));
    const subset = findExactSubset(cents(transaction.amount), candidates);
    if (!subset || subset.length === 0) return;
    subset.forEach((groupIndex) => {
      const group = groups[groupIndex];
      if (!group || assignments.has(group.id)) return;
      assignments.set(group.id, [bankIndex]);
    });
    usedBank.add(transaction.id);
  });

  const mappedGroups: BouwmaatReconciliationGroup[] = groups.map((group) => {
    const bankIndexes = assignments.get(group.id) || [];
    const bankRows = bankIndexes.map((index) => bankTransactions[index]).filter(Boolean);
    const bankAmount = euros(bankRows.reduce((sum, row) => sum + row.amount, 0));
    const outstandingAmount = euros(Math.max(0, group.costAmount - bankAmount));
    let status: BouwmaatGroupStatus = 'onbekend';
    if (group.paymentType === 'bon' || group.paymentStatus === 'paid') status = 'betaald';
    else if (bankAmount === 0 && group.paymentType === 'factuur') status = 'openstaand';
    else if (bankAmount > 0 && outstandingAmount === 0) status = 'betaald';
    else if (bankAmount > 0) status = 'gedeeltelijk';

    return {
      id: group.id,
      supplierInvoiceNumber: group.invoiceNumber,
      date: group.date,
      dueDate: group.dueDate,
      paymentType: group.paymentType,
      paymentStatus: group.paymentStatus,
      status,
      costAmount: group.costAmount,
      bankAmount,
      outstandingAmount,
      splitRowCount: group.rows.length,
      costRows: group.rows.map((row) => ({
        id: row.id,
        category: row.category,
        description: row.description,
        amount: row.amount_incl_btw,
        offerteId: row.offerte_id,
      })),
      bankTransactions: bankRows.map((row) => ({
        id: row.id,
        date: row.booking_date,
        amount: row.amount,
        description: row.description || '',
        counterparty: row.counterparty_name || '',
      })),
    };
  }).sort((left, right) => dateValue(right.date) - dateValue(left.date));

  const unmatchedBankTransactions = bankTransactions.filter((transaction) => !usedBank.has(transaction.id));
  const invoiceGroups = mappedGroups.filter((group) => group.paymentType === 'factuur');
  const receiptGroups = mappedGroups.filter((group) => group.paymentType === 'bon');
  const partialAmount = euros(mappedGroups.filter((group) => group.status === 'gedeeltelijk').reduce((sum, group) => sum + group.outstandingAmount, 0));
  const openAmount = euros(invoiceGroups.filter((group) => group.status === 'openstaand').reduce((sum, group) => sum + group.outstandingAmount, 0));
  const matchedGroupCount = mappedGroups.filter((group) => group.status === 'betaald').length;
  const unknownGroups = mappedGroups.filter((group) => group.paymentType === 'unknown');

  return {
    summary: {
      registeredAmount: euros(mappedGroups.reduce((sum, group) => sum + group.costAmount, 0)),
      registeredInvoiceAmount: euros(invoiceGroups.reduce((sum, group) => sum + group.costAmount, 0)),
      registeredReceiptAmount: euros(receiptGroups.reduce((sum, group) => sum + group.costAmount, 0)),
      paidBankAmount: euros(mappedGroups.reduce((sum, group) => sum + group.bankAmount, 0)),
      bankDebitAmount: euros(bankTransactions.reduce((sum, transaction) => sum + transaction.amount, 0)),
      openAmount,
      partialAmount,
      unmatchedBankAmount: euros(unmatchedBankTransactions.reduce((sum, transaction) => sum + transaction.amount, 0)),
      invoiceCount: invoiceGroups.length,
      receiptCount: receiptGroups.length,
      splitInvoiceCount: mappedGroups.filter((group) => group.splitRowCount > 1).length,
      openInvoiceCount: invoiceGroups.filter((group) => group.status === 'openstaand' || group.status === 'gedeeltelijk').length,
      matchedGroupCount,
      unmatchedGroupCount: mappedGroups.filter((group) => group.status === 'openstaand' || group.status === 'onbekend').length,
      unknownAmount: euros(unknownGroups.reduce((sum, group) => sum + group.costAmount, 0)),
      unknownGroupCount: unknownGroups.length,
    },
    groups: mappedGroups,
    unmatchedBankTransactions,
  };
}
