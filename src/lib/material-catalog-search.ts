export interface CatalogMaterial {
  materiaalnaam?: string | null;
  categorie?: string | null;
  sub_categorie?: string | null;
  subsectie?: string | null;
  leverancier?: string | null;
  eenheid?: string | null;
}

export function materialCategoryPath(material: CatalogMaterial): string {
  return [material.categorie, material.sub_categorie || material.subsectie].filter(Boolean).join(' → ');
}

function searchKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/,/g, '.').replace(/×/g, 'x').replace(/\s*x\s*/g, 'x');
}

export function matchesMaterialSearch(material: CatalogMaterial, query: string): boolean {
  const text = searchKey([material.materiaalnaam, materialCategoryPath(material), material.leverancier, material.eenheid].filter(Boolean).join(' '));
  return searchKey(query).trim().split(/\s+/).every((term) => text.includes(term));
}

export interface PurchasePriceSource {
  price_date?: string;
  unit_price_excl?: number;
  purchase_count?: number;
  evidence?: Array<{ date?: string; supplier?: string; invoice_number?: string | null }>;
}

export function materialPriceSourceLabel(source: PurchasePriceSource | undefined, price: number | null): string {
  if (!source?.price_date || price == null || source.unit_price_excl == null || Math.abs(source.unit_price_excl - price) > 0.011) return 'Prijsdatum onbekend';
  const [year, month, day] = source.price_date.split('-');
  return `Factuur ${day}-${month}-${year}`;
}
