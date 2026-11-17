import { normalizeProjectCostCategory, roundEuro, type ProjectCostCategory, type ProjectCostLineItem } from './project-costs';

/** Ontbrekende regel-btw valt terug op het factuurtarief; expliciet 0% blijft 0%. */
export function costLineInclusive(line: ProjectCostLineItem, invoiceRate: number): number {
  if (line.total_incl_btw != null) return roundEuro(line.total_incl_btw);
  return roundEuro(line.total_price * (1 + (line.btw_percentage ?? invoiceRate) / 100));
}

/** Boek iedere geldige factuur; onbekende producten blijven herkenbaar onder Overig. */
export function automaticCostLines(lines: ProjectCostLineItem[], uncertain: string[]): ProjectCostLineItem[] {
  const unknown = new Set(uncertain);
  return lines.map(line => ({ ...line,
    category: unknown.has(line.description) ? 'overig' : line.category,
    offerte_id: unknown.has(line.description) || line.category === 'gereedschap' ? null : line.offerte_id,
  }));
}

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
