import { roundEuro, type ProjectCostLineItem } from './project-costs';

/** Controleer bedragen vóór opsplitsen; een verschil is geen btw-correctie. */
export function validateCostVat(input: {
  lines: ProjectCostLineItem[];
  rate: number;
  amountIncl: number;
  manualOverride: boolean;
}): string | null {
  for (const line of input.lines) {
    if (line.total_incl_btw === undefined) continue;
    const expected = roundEuro(line.total_price * (1 + (line.btw_percentage ?? input.rate) / 100));
    if (Math.abs(expected - line.total_incl_btw) > 0.05) {
      return `BTW-bedragen kloppen niet bij “${line.description}”. Controleer of de regelprijs inclusief of exclusief btw is. Er is niets opgeslagen.`;
    }
  }
  if (!input.manualOverride && input.lines.length > 0 && input.amountIncl !== 0) {
    const total = roundEuro(input.lines.reduce((sum, line) => sum + (line.total_incl_btw
      ?? roundEuro(line.total_price * (1 + (line.btw_percentage ?? input.rate) / 100))), 0));
    if (Math.abs(total - input.amountIncl) > 0.05) {
      return 'De som van de regels wijkt af van het factuurtotaal. Controleer korting, toeslagen en btw. Er is niets opgeslagen.';
    }
  }
  return null;
}
