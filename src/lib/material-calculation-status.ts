interface CalculationRow { aantal?: number | null; berekening_status?: string; hoe_berekend?: string; voorstel?: string }
export function materialNeedsCalculation(item: CalculationRow): boolean {
  if (item.berekening_status === 'manual') return false;
  return item.berekening_status === 'requires_manual_input'
    || item.aantal == null
    || (item.aantal === 0 && /(?:kon niet|niet berekend|ontbreekt|ontbreken|requires_manual_input)/i.test(`${item.hoe_berekend || ''} ${item.voorstel || ''}`));
}
