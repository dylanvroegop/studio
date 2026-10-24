const round = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const NET_PATHS = ['subtotal_excl_btw', 'amount_excl_btw', 'subtotal_excl_vat', 'subtotal_excl', 'total_excl_btw', 'total_excl_vat', 'net_amount', 'totals.subtotal_excl_btw', 'totals.amount_excl_btw', 'totals.subtotal_excl', 'totals.net_amount'];
const VAT_PATHS = ['btw_amount', 'vat_amount', 'tax_amount', 'totals.btw_amount', 'totals.vat_amount', 'totals.tax_amount', 'btw_specification.total.btw', 'btw_specification.btw'];
const GROSS_PATHS = ['total_incl_btw', 'amount_incl_btw', 'total_incl_vat', 'gross_amount', 'grand_total', 'amount_total', 'total', 'totaal', 'te_betalen', 'totals.total_incl_btw', 'totals.amount_incl_btw', 'totals.total', 'totals.gross_amount', 'btw_specification.total.incl', 'btw_specification.incl'];

function printedNumber(source: Record<string, unknown>, paths: string[]): number | null {
  for (const path of paths) {
    let value: unknown = source;
    for (const part of path.split('.')) value = value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined;
    if (typeof value !== 'number' && typeof value !== 'string') continue;
    if (typeof value === 'string' && !value.trim()) continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return round(numeric);
  }
  return null;
}

interface CostExtractionTotalsBase {
  amount_excl_btw: number | null;
  btw_amount: number | null;
  amount_incl_btw: number | null;
  btw_percentage: number | null;
}

export type CostExtractionTotals = (CostExtractionTotalsBase & { complete: false; warning: string }) | {
  complete: true;
  warning: null;
  amount_excl_btw: number;
  btw_amount: number;
  amount_incl_btw: number;
  btw_percentage: number;
};

/** Twee documentbedragen bepalen het derde. Een tarief of regelsom bewijst geen btw. */
export function costExtractionTotals(source: Record<string, unknown>): CostExtractionTotals {
  let net = printedNumber(source, NET_PATHS);
  let vat = printedNumber(source, VAT_PATHS);
  let gross = printedNumber(source, GROSS_PATHS);
  const printedRate = printedNumber(source, ['btw_percentage', 'vat_percentage']);
  const rate = printedRate !== null && printedRate >= 0 && printedRate <= 100 ? printedRate : null;
  if (net === null && gross !== null && vat !== null) net = round(gross - vat);
  if (vat === null && gross !== null && net !== null) vat = round(gross - net);
  if (gross === null && net !== null && vat !== null) gross = round(net + vat);

  const amounts = { amount_excl_btw: net, btw_amount: vat, amount_incl_btw: gross, btw_percentage: rate };
  if (net === null || vat === null || gross === null) {
    return { ...amounts, complete: false, warning: 'Netto- of btw-bedrag ontbreekt in het document. Controleer de originele factuur; er is geen btw-tarief aangenomen.' };
  }
  if (Math.abs(round(net + vat - gross)) > 0.02) {
    return { ...amounts, complete: false, warning: 'De uitgelezen documentbedragen sluiten niet aan: netto plus btw wijkt af van bruto. Controleer het origineel.' };
  }
  // Bij gemengde tarieven is dit alleen het gewogen tarief; de bedragen blijven leidend.
  const effectiveRate = net !== 0 ? round(vat / net * 100) : 0;
  return { complete: true, warning: null, amount_excl_btw: net, btw_amount: vat, amount_incl_btw: gross,
    btw_percentage: rate !== null && Math.abs(round(net * rate / 100) - vat) <= 0.02 ? rate : effectiveRate };
}

export const COST_DOCUMENT_TOTALS_PROMPT = ' Return null for any net, VAT or gross total that cannot be read or derived from two explicit document totals. Unknown VAT is not zero. Never assume 21% merely because this is a Dutch invoice. Preserve explicitly printed zero VAT and zero-percent rates.';
