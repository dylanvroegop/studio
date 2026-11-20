import { parseScenarioAmount } from './bank-cost-scenario';
import { isValidReportStart } from './kosten-report-period';
import { MANUAL_CASH_PREFIX, PROJECT_COST_CATEGORIES, type ProjectCostCategory, type ProjectCostRow } from './project-costs';

const PRIVATE_CASH_PREFIX = `${MANUAL_CASH_PREFIX}private-`;
export const CASH_PURCHASE_CATEGORIES = PROJECT_COST_CATEGORIES.filter((category) => category !== 'profit' && category !== 'eigen_verbruik');
export const CASH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CashDeposit {
  id: string;
  date: string;
  amountCents: number;
  description: string;
}

export type CashEntry = CashDeposit & (
  | { kind: 'deposit'; editing: boolean }
  | { kind: 'private-purchase' | 'business-purchase'; supplier: string; category: ProjectCostCategory }
);

export function parseCashEntry(input: Record<string, unknown>, today: string): CashEntry | string {
  if (typeof input.id !== 'string' || !CASH_ID.test(input.id)) return 'Ongeldig boekingskenmerk. Open het invoerscherm opnieuw.';
  if (!isValidReportStart(input.date, today)) return 'Kies een geldige datum tot en met vandaag.';
  const amount = typeof input.amount === 'string' ? parseScenarioAmount(input.amount) : null;
  const amountCents = amount === null ? 0 : Math.round(amount * 100);
  if (amountCents < 1 || amountCents > 9_999_999_999) return 'Vul een positief bedrag in tot € 99.999.999,99.';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (description.length > 500) return 'Gebruik maximaal 500 tekens voor de omschrijving.';
  const base = { id: input.id, date: input.date, amountCents, description };
  if (input.kind === 'deposit') return { ...base, kind: 'deposit', editing: input.editing === true };
  if (input.kind !== 'private-purchase' && input.kind !== 'business-purchase') return 'Kies wat je wilt boeken.';
  if (!description) return 'Vul in wat je hebt gekocht.';
  const category = CASH_PURCHASE_CATEGORIES.find((category) => category === input.category);
  if (!category) return 'Kies een geldige kostencategorie.';
  const supplier = typeof input.supplier === 'string' ? input.supplier.trim() : '';
  if (supplier.length > 160) return 'Gebruik maximaal 160 tekens voor de leverancier.';
  return { ...base, kind: input.kind, category, supplier };
}

export function cashPurchaseReference(id: string, fromPrivate: boolean): string {
  return `${fromPrivate ? PRIVATE_CASH_PREFIX : MANUAL_CASH_PREFIX}${id}`;
}

export function isPrivateCashPurchase(cost: Pick<ProjectCostRow, 'status' | 'supplier_order_number'>): boolean {
  return cost.status === 'paid_cash' && Boolean(cost.supplier_order_number?.startsWith(PRIVATE_CASH_PREFIX));
}
