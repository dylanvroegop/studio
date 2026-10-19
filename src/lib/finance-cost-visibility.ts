import type { ProjectCostRow } from './project-costs';

/** Contant is alleen vastgelegd na bevestiging; 'Contant Factuur' kan ook pin zijn. */
export function isConfirmedCashCost(cost: ProjectCostRow): boolean {
  return cost.status === 'paid_cash';
}

export function isReviewSourceCost(cost: ProjectCostRow): boolean {
  return cost.status === 'unmatched_source_cost';
}

export function visibleUnmatchedSources(costs: ProjectCostRow[], matchedIds: ReadonlySet<string>): ProjectCostRow[] {
  return costs.filter((cost) => !matchedIds.has(cost.id)).map((cost) => (
    isConfirmedCashCost(cost) ? cost : { ...cost, status: 'unmatched_source_cost' }
  ));
}
