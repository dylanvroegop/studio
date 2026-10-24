import type { FinanceBankCostLedgerRow, FinanceBankTransaction } from './finance-bank-ledger';
import { isSupportingProjectCostReceipt, mapProjectCostRow, roundEuro, type ProjectCostCategory, type ProjectCostRow } from './project-costs';
import { isFinalCostDocumentType } from './cost-document-policy';
import { categoryOverrideForTransaction, isCremanCounterparty, isFuelCounterparty } from './confirmed-bank-categories';

export interface KnabCostReconciliation {
  transactionCount: number;
  debitTotal: number;
  earliestBookingDate: string | null;
  latestBookingDate: string | null;
  unmatchedSourceCount: number;
}

export interface KnabBankCostRow extends ProjectCostRow {
  source_cost_ids: string[];
  is_internal_transfer: boolean;
  has_supporting_document: boolean;
  bank_category: ProjectCostCategory;
  is_bunq_topup: boolean;
  is_creman_debt: boolean;
  is_fuel_payment: boolean;
  fuel_needs_review: boolean;
  is_private_deposit?: boolean;
}

interface KnabSourceCost extends ProjectCostRow {
  document_type?: string | null;
}

interface BuildKnabCostListParams {
  userId: string;
  transactions: FinanceBankTransaction[];
  ledgerRows: FinanceBankCostLedgerRow[];
  costs: KnabSourceCost[];
  internalTransferIds: ReadonlySet<string>;
  categoryOverrides?: ReadonlyMap<string, ProjectCostCategory>;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim() || '').filter(Boolean)));
}

function hasReceipt(cost: KnabSourceCost): boolean {
  if (cost.document_type?.trim() && !isFinalCostDocumentType(cost.document_type)) return false;
  const files = cost.receipt_files || [];
  if (files.length > 0) {
    return files.some(isSupportingProjectCostReceipt);
  }
  // De oude enkelvoudige URL mag afgekeurde bijlagen niet alsnog als bon aanmerken.
  return Boolean(cost.receipt_url?.trim());
}

/** Bevestigde privéstortingen zijn plusregels in Privé, geen negatieve kosten. */
function buildPrivateCredits(params: BuildKnabCostListParams): KnabBankCostRow[] {
  const creditsById = new Map<string, FinanceBankTransaction>();
  for (const transaction of params.transactions) {
    if (!(Number(transaction.amount) > 0)
      || params.internalTransferIds.has(transaction.id)
      || categoryOverrideForTransaction(transaction, params.categoryOverrides) !== 'eigen_verbruik') continue;
    if (!transaction.id || !Number.isFinite(Number(transaction.amount))) {
      throw new Error('Privéstorting heeft geen geldig transactienummer of bedrag.');
    }
    const previous = creditsById.get(transaction.id);
    if (previous && (roundEuro(previous.amount) !== roundEuro(transaction.amount)
      || previous.booking_date !== transaction.booking_date)) {
      throw new Error('Privéstorting bevat tegenstrijdige bankgegevens.');
    }
    if (!previous) creditsById.set(transaction.id, transaction);
  }
  return Array.from(creditsById.values()).map((transaction): KnabBankCostRow => {
    const date = transaction.booking_date || '';
    const amount = roundEuro(Number(transaction.amount));
    const createdAt = date ? `${date.slice(0, 10)}T00:00:00.000Z` : new Date(0).toISOString();
    return {
      ...mapProjectCostRow({
        id: `bank-knab-credit-${transaction.id}`,
        user_id: params.userId,
        category: 'eigen_verbruik',
        supplier_name: transaction.counterparty_name || 'Privéstorting',
        description: transaction.description || 'Privé naar zakelijk',
        amount_incl_btw: amount,
        amount_excl_btw: amount,
        btw_percentage: 0,
        btw_amount: 0,
        vat_known: false,
        date,
        status: 'bank_transaction',
        payment_type: 'private',
        payment_status: 'private',
        reconciliation_status: 'not_applicable',
        paid_bank_transaction_id: transaction.id,
        paid_at: date || null,
        created_at: createdAt,
        updated_at: createdAt,
      }),
      source_cost_ids: [],
      is_internal_transfer: false,
      has_supporting_document: false,
      bank_category: 'eigen_verbruik',
      is_bunq_topup: false,
      is_creman_debt: false,
      is_fuel_payment: false,
      fuel_needs_review: false,
      is_private_deposit: true,
    };
  }).sort((left, right) => right.date.localeCompare(left.date) || left.id.localeCompare(right.id));
}

/** Eén zichtbare regel per Knab-afschrijving; documenten voegen geen bedragen toe. */
export function buildKnabCostList(params: BuildKnabCostListParams): {
  data: KnabBankCostRow[];
  privateCredits: KnabBankCostRow[];
  bankReconciliation: KnabCostReconciliation;
} {
  const debitById = new Map<string, FinanceBankTransaction>();
  for (const transaction of params.transactions) {
    if (!(Number(transaction.amount) < 0)) continue;
    if (!transaction.id || !Number.isFinite(Number(transaction.amount))) {
      throw new Error('Knab-afschrijving heeft geen geldig transactienummer of bedrag.');
    }
    const previous = debitById.get(transaction.id);
    if (previous && (roundEuro(previous.amount) !== roundEuro(transaction.amount)
      || previous.booking_date !== transaction.booking_date)) {
      throw new Error('Knab-afschrijving bevat tegenstrijdige bankgegevens.');
    }
    if (!previous) debitById.set(transaction.id, transaction);
  }

  const costById = new Map(params.costs.map((cost) => [cost.id, cost]));
  const ledgerById = new Map(params.ledgerRows.map((row) => [row.bank_transaction_id, row]));
  const matchedCostIds = new Set<string>();
  const data = Array.from(debitById.values()).map((transaction): KnabBankCostRow => {
    const ledgerRow = ledgerById.get(transaction.id);
    const sources = uniqueStrings(ledgerRow?.source_cost_ids || [])
      .map((id) => costById.get(id))
      .filter((cost): cost is KnabSourceCost => Boolean(cost));
    sources.forEach((cost) => matchedCostIds.add(cost.id));
    const amount = roundEuro(-Number(transaction.amount));
    const sourceIncl = roundEuro(sources.reduce((sum, cost) => sum + cost.amount_incl_btw, 0));
    const sourceExcl = roundEuro(sources.reduce((sum, cost) => sum + cost.amount_excl_btw, 0));
    const sourceVat = roundEuro(sources.reduce((sum, cost) => sum + cost.btw_amount, 0));
    const hasDocument = sources.some(hasReceipt);
    // Een afwijkende bron kan wel als bijlage dienen, maar bewijst geen btw over de bankbetaling.
    const vatKnown = hasDocument && sources.length > 0
      && sources.every((cost) => hasReceipt(cost) && cost.vat_known !== false)
      && Math.round(sourceIncl * 100) === Math.round(amount * 100)
      && Math.round((sourceExcl + sourceVat) * 100) === Math.round(sourceIncl * 100);
    const amountExcl = vatKnown ? sourceExcl : amount;
    const vatAmount = vatKnown ? sourceVat : 0;
    const isInternal = params.internalTransferIds.has(transaction.id);
    const isPrivate = ledgerRow?.is_private === true;
    const isBunqTopUp = /top-?up\s+via\s+bunq/i.test(`${transaction.counterparty_name || ''} ${transaction.description || ''}`);
    const isCremanDebt = isCremanCounterparty(transaction.counterparty_name);
    const isFuelPayment = !isInternal && !isPrivate && (
      isFuelCounterparty(transaction.counterparty_name, transaction.description)
      || ledgerRow?.category_override === 'brandstof'
    );
    // Oude privé-aanduidingen niet stilzwijgend door een merknaam overschrijven.
    const fuelNeedsReview = isFuelPayment && !ledgerRow?.category_override && sources.some((cost) =>
      cost.payment_type === 'private' || cost.category === 'eigen_verbruik'
      || cost.line_items.some((item) => item.category === 'eigen_verbruik'));
    const receiptFiles = Array.from(new Map(sources.flatMap((cost) => cost.receipt_files || [])
      .map((file) => [file.path || file.url || file.filename, file] as const)).values());
    const receiptUrl = receiptFiles.find((file) => file.url && isSupportingProjectCostReceipt(file))?.url
      || receiptFiles.find((file) => file.url)?.url
      || sources.find((cost) => cost.receipt_url)?.receipt_url || null;
    const quoteIds = uniqueStrings(sources.map((cost) => cost.offerte_id));
    const date = transaction.booking_date || '';
    const createdAt = date ? `${date.slice(0, 10)}T00:00:00.000Z` : new Date(0).toISOString();
    const bankCategory = isInternal ? 'profit' : isPrivate ? 'eigen_verbruik' : ledgerRow?.category || 'overig';
    const category = isBunqTopUp ? 'eigen_verbruik'
      : isCremanDebt ? 'schulden'
        : hasDocument ? bankCategory
          : isFuelPayment ? ledgerRow?.category_override || (fuelNeedsReview ? 'overig' : 'brandstof')
            : 'overig';

    return { ...mapProjectCostRow({
      id: `bank-knab-${transaction.id}`,
      user_id: params.userId,
      offerte_id: quoteIds.length === 1 ? quoteIds[0] : null,
      category,
      supplier_name: transaction.counterparty_name || 'Onbekende tegenpartij',
      description: transaction.description || 'Bankafschrijving',
      line_items: sources.flatMap((cost) => cost.line_items || []),
      amount_excl_btw: amountExcl,
      btw_percentage: vatKnown && amountExcl !== 0 ? roundEuro(vatAmount / amountExcl * 100) : 0,
      btw_amount: vatAmount,
      amount_incl_btw: amount,
      vat_known: vatKnown,
      date,
      receipt_url: receiptUrl,
      receipt_files: receiptFiles,
      status: 'bank_transaction',
      payment_type: isPrivate ? 'private' : 'unknown',
      payment_status: isPrivate ? 'private' : 'paid',
      reconciliation_status: isInternal || isPrivate ? 'not_applicable' : sources.length ? 'matched' : 'unmatched',
      paid_bank_transaction_id: transaction.id,
      paid_at: date || null,
      source_email: uniqueStrings(sources.map((cost) => cost.source_email)).join(', ') || null,
      source_filename: uniqueStrings(sources.map((cost) => cost.source_filename)).join(', ') || null,
      created_at: createdAt,
      updated_at: createdAt,
    }),
      // De bronmapper mag de documentregel of bevestigde uitzonderingen niet overschrijven.
      category,
      source_cost_ids: sources.map((cost) => cost.id),
      is_internal_transfer: isInternal,
      has_supporting_document: hasDocument,
      bank_category: isFuelPayment ? category : bankCategory,
      is_bunq_topup: isBunqTopUp,
      is_creman_debt: isCremanDebt,
      is_fuel_payment: isFuelPayment,
      fuel_needs_review: fuelNeedsReview,
    };
  }).sort((left, right) => right.date.localeCompare(left.date) || left.id.localeCompare(right.id));
  const dates = data.map((row) => row.date).filter(Boolean).sort();
  const privateCredits = buildPrivateCredits(params);
  if (privateCredits.some((row) => debitById.has(row.paid_bank_transaction_id || ''))) {
    throw new Error('Privéstorting en afschrijving bevatten tegenstrijdige bankgegevens.');
  }

  return {
    data,
    privateCredits,
    bankReconciliation: {
      transactionCount: data.length,
      debitTotal: data.reduce((sum, row) => sum + Math.round(row.amount_incl_btw * 100), 0) / 100,
      earliestBookingDate: dates[0] || null,
      latestBookingDate: dates.at(-1) || null,
      unmatchedSourceCount: params.costs.filter((cost) => !matchedCostIds.has(cost.id)).length,
    },
  };
}
