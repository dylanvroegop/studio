import type { ProjectCostCategory, ProjectCostCategoryAllocation, ProjectCostRow } from './project-costs';

const cents = (value: number): number => Math.round(value * 100);

/** Verdeel alleen exact onderbouwde bankbedragen; onbekende btw blijft onbekend. */
export function buildBankCostAllocations(sources: ProjectCostRow[], amount: number, vatKnown: boolean): ProjectCostCategoryAllocation[] {
  if (sources.some((source) => !Number.isFinite(source.amount_incl_btw)
    || source.category === 'profit' || source.category === 'eigen_verbruik' || source.payment_type === 'private'
    || source.line_items.some((line) => line.category === 'eigen_verbruik' || line.category === 'profit'))) return [];
  if (sources.reduce((sum, source) => sum + cents(source.amount_incl_btw), 0) !== cents(amount)) return [];
  const groups = new Map<ProjectCostCategory, ProjectCostRow[]>();
  for (const source of sources) groups.set(source.category, [...(groups.get(source.category) || []), source]);
  if (groups.size < 2) return [];
  return Array.from(groups, ([category, costs]) => {
    const sum = (field: 'amount_incl_btw' | 'amount_excl_btw' | 'btw_amount'): number =>
      costs.reduce((total, cost) => total + cents(cost[field]), 0) / 100;
    const quoteIds = new Set(costs.map((cost) => cost.offerte_id));
    const gross = sum('amount_incl_btw');
    const known = vatKnown && costs.every((cost) => cost.vat_known !== false
      && cents(cost.amount_excl_btw) + cents(cost.btw_amount) === cents(cost.amount_incl_btw));
    return {
      category,
      amount_incl_btw: gross,
      amount_excl_btw: known ? sum('amount_excl_btw') : gross,
      btw_amount: known ? sum('btw_amount') : 0,
      vat_known: known,
      source_cost_ids: costs.map((cost) => cost.id),
      offerte_id: quoteIds.size === 1 ? costs[0].offerte_id : null,
    };
  });
}

/** De filter toont een deelbedrag, met dezelfde bankidentiteit voor openen/acties. */
export function costForCategory(row: ProjectCostRow, category: ProjectCostCategory): ProjectCostRow | null {
  if (!row.category_allocations?.length) return row.category === category ? row : null;
  const allocation = row.category_allocations.find((part) => part.category === category);
  if (!allocation) return null;
  return { ...row, category, amount_incl_btw: allocation.amount_incl_btw,
    amount_excl_btw: allocation.amount_excl_btw, btw_amount: allocation.btw_amount,
    vat_known: allocation.vat_known, offerte_id: allocation.offerte_id };
}

/** Acties gelden voor de originele afschrijving, nooit voor een gefilterd deelbedrag. */
export function originalBankCost(row: ProjectCostRow, rows: ProjectCostRow[]): ProjectCostRow | null {
  return rows.find((candidate) => candidate.id === row.id) || (row.category_allocations?.length ? null : row);
}
