import { PROJECT_COST_CATEGORIES, type ProjectCostCategory, type ProjectCostRow } from './project-costs';

export type BankCostFilter = 'alle' | ProjectCostCategory;

/** Dezelfde bankregels bepalen zowel het getoonde bedrag als het aantal. */
export function summarizeBankCostRows(rows: ProjectCostRow[], privateCredits: ProjectCostRow[] = []): {
  totals: Record<BankCostFilter, number>;
  counts: Record<BankCostFilter, number>;
  privateSummary: {
    withdrawalTotal: number;
    depositTotal: number;
    netTotal: number;
    withdrawalCount: number;
    depositCount: number;
  };
} {
  const keys: BankCostFilter[] = ['alle', ...PROJECT_COST_CATEGORIES];
  const cents = Object.fromEntries(keys.map((key) => [key, 0])) as Record<BankCostFilter, number>;
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<BankCostFilter, number>;
  for (const row of rows) {
    const amount = Math.round(row.amount_incl_btw * 100);
    cents.alle += amount;
    cents[row.category] += amount;
    counts.alle += 1;
    counts[row.category] += 1;
  }
  const withdrawalCents = cents.eigen_verbruik;
  const withdrawalCount = counts.eigen_verbruik;
  const deposits = privateCredits.filter((row) => row.category === 'eigen_verbruik' && row.amount_incl_btw > 0);
  const depositCents = deposits.reduce((sum, row) => sum + Math.round(row.amount_incl_btw * 100), 0);
  // Alleen de privétab saldeert. Alle blijft het volledige Knab-afschrijvingentotaal.
  cents.eigen_verbruik -= depositCents;
  counts.eigen_verbruik += deposits.length;
  const totals = Object.fromEntries(keys.map((key) => [key, cents[key] / 100])) as Record<BankCostFilter, number>;
  return { totals, counts, privateSummary: {
    withdrawalTotal: withdrawalCents / 100,
    depositTotal: depositCents / 100,
    netTotal: cents.eigen_verbruik / 100,
    withdrawalCount,
    depositCount: deposits.length,
  } };
}
