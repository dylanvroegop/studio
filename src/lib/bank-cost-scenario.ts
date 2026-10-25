import type { BankCostFilter } from './bank-cost-summary';
import type { ProjectCostCategory } from './project-costs';

/** Nederlandse bedragen, met optioneel euroteken en duizendtalscheiding. */
export function parseScenarioAmount(raw: string): number | null {
  const value = raw.replace(/[€\s]/g, '');
  if (!value) return null;
  if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value) && !/^-?\d+\.\d{1,2}$/.test(value)) return null;
  const normalized = value.includes(',') || /^-?\d{1,3}(?:\.\d{3})+$/.test(value)
    ? value.replace(/\./g, '').replace(',', '.') : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function calculateBankCostScenario(
  totals: Record<BankCostFilter, number>,
  reductions: Partial<Record<ProjectCostCategory, number>>,
  balance: number | null,
  extraFixedCosts = 0,
): { saved: number; balanceWithoutCosts: number | null } {
  const reductionCents = (Object.entries(reductions) as Array<[ProjectCostCategory, number]>).reduce((sum, [category, amount]) => {
    const maximum = Math.max(0, Math.round(totals[category] * 100));
    const requested = Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
    return sum + Math.min(maximum, requested);
  }, 0);
  const extraCents = Number.isFinite(extraFixedCosts) ? Math.max(0, Math.round(extraFixedCosts * 100)) : 0;
  const savedCents = reductionCents - extraCents;
  return {
    saved: savedCents / 100,
    balanceWithoutCosts: balance === null ? null : (Math.round(balance * 100) + savedCents) / 100,
  };
}

/** Telefoon, privé en storage blijven per kalendermaand gelijk in het scenario. */
export function remainingFixedCosts(
  totals: Record<BankCostFilter, number>,
  reductions: Partial<Record<ProjectCostCategory, number>>,
): number {
  const fixedCategories: ProjectCostCategory[] = ['telefoon', 'eigen_verbruik', 'storage'];
  return fixedCategories.reduce((sum, category) => {
    const total = Math.max(0, Math.round(totals[category] * 100));
    const amount = reductions[category] ?? 0;
    const reduction = Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
    return sum + Math.max(0, total - reduction);
  }, 0) / 100;
}
