import { isSupportingProjectCostReceipt, type ProjectCostRow } from './project-costs';

/** Een controlefilter op bestaande regels, geen extra kostencategorie. */
export function isCostWithoutDocument(cost: ProjectCostRow & { has_supporting_document?: boolean }): boolean {
  if (typeof cost.has_supporting_document === 'boolean') return !cost.has_supporting_document;
  if (cost.receipt_files?.length) return !cost.receipt_files.some(isSupportingProjectCostReceipt);
  return !cost.receipt_url?.trim();
}
