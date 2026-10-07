import { normalizeProjectCostCategory, type ProjectCostCategory } from './project-costs';

export function costImportHasTools(payload: Record<string, unknown>): boolean {
  if (normalizeProjectCostCategory(payload.suggested_category || payload.category) === 'gereedschap') return true;
  return Array.isArray(payload.line_items) && payload.line_items.some((item) =>
    item && typeof item === 'object'
    && normalizeProjectCostCategory((item as Record<string, unknown>).category) === 'gereedschap'
  );
}

// Gereedschap blijft een bedrijfskost, maar drukt niet op één klantofferte.
export function costQuoteId(category: ProjectCostCategory, quoteId: string | null): string | null {
  return category === 'gereedschap' ? null : quoteId;
}
