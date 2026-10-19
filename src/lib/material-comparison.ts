import type { MaterialItem } from '@/lib/quote-calculations';

export interface MaterialComparisonRow {
    key: string;
    product: string;
    unit: string;
    cells: (MaterialItem[] | undefined)[];
}

/** Lijn producten uit op naam én eenheid; behoud alle regels voor de uitleg. */
export function buildMaterialComparisonRows(columns: (MaterialItem[] | undefined)[]): MaterialComparisonRow[] {
    const rows = new Map<string, MaterialComparisonRow>();
    columns.forEach((items, columnIndex) => {
        items?.forEach(item => {
            const product = String(item.product || '').trim();
            const unit = String(item.eenheid || 'stuk').trim();
            const key = JSON.stringify([product.toLocaleLowerCase('nl-NL'), unit.toLocaleLowerCase('nl-NL')]);
            let row = rows.get(key);
            if (!row) {
                row = { key, product, unit, cells: Array.from({ length: columns.length }, () => undefined) };
                rows.set(key, row);
            }
            (row.cells[columnIndex] ??= []).push(item);
        });
    });
    return Array.from(rows.values());
}
