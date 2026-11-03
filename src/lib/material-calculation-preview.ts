import type { ProjectCostRow } from '@/lib/project-costs';

export interface PreviewMaterial {
    product: string;
    eenheid: string;
    aantal: number | null;
    prijs_per_stuk: number | null;
    hoe_berekend: string;
}
export interface PreviewPurchase {
    id: string;
    supplier: string;
    invoice: string;
    date: string;
    product: string;
    quantity: number | null;
    unit: string;
    amount: number | null;
}
export interface MaterialCalculationPreview {
    model: string;
    materials: PreviewMaterial[];
    smallMaterials: number | null;
    smallExplanation: string;
    purchases: PreviewPurchase[];
    purchaseError: string | null;
}
export function finitePreviewNumber(value: unknown): number | null {
    if (value == null || value === '' || typeof value === 'boolean') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
/** Een expliciete regelkoppeling gaat voor de koppeling van de factuur. */
export function linkedMaterialPurchases(costs: ProjectCostRow[], quoteId: string): PreviewPurchase[] {
    return costs.flatMap(cost => {
        const source = { supplier: cost.supplier_name, invoice: cost.supplier_invoice_number || cost.supplier_order_number || 'Nummer onbekend', date: cost.date };
        const lines = cost.line_items.filter(line => line && typeof line === 'object');
        if (!lines.length) {
            if (cost.offerte_id !== quoteId || cost.category !== 'materiaal') return [];
            return [{ ...source, id: cost.id, product: `${cost.description || 'Materiaalinkoop'} (geen factuurregels beschikbaar)`, quantity: null, unit: '', amount: cost.vat_known === false ? null : finitePreviewNumber(cost.amount_excl_btw) }];
        }
        return lines.flatMap((line, index) => {
            if ((line.offerte_id || cost.offerte_id) !== quoteId || (line.category || cost.category) !== 'materiaal') return [];
            return [{ ...source, id: `${cost.id}:${index}`, product: line.description, quantity: finitePreviewNumber(line.quantity), unit: line.unit || '', amount: cost.vat_known === false ? null : finitePreviewNumber(line.total_price) }];
        });
    });
}
