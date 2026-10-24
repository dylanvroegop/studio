import type { ProjectCostReceiptFile } from './project-costs';

export type CostImportClaimDecision = { state: 'new' } | { state: 'booked'; costIds: string[] } | { state: 'blocked' };

/** Alleen volledig geboekte claims zijn veilig herhaalbaar. Een gedeeltelijke boeking blijft geblokkeerd. */
export function costImportClaimDecision(uid: string, claims: Array<Record<string, unknown>>): CostImportClaimDecision {
  if (!claims.length) return { state: 'new' };
  let costIds: string[] | null = null;
  for (const claim of claims) {
    if (claim.userId !== uid || claim.status !== 'booked' || !Array.isArray(claim.costIds) || !claim.costIds.length) return { state: 'blocked' };
    if (!claim.costIds.every(id => typeof id === 'string' && id.trim())) return { state: 'blocked' };
    const ids = [...new Set(claim.costIds as string[])].sort();
    if (costIds && JSON.stringify(costIds) !== JSON.stringify(ids)) return { state: 'blocked' };
    costIds = ids;
  }
  return { state: 'booked', costIds: costIds! };
}

/** Geen successmelding voor verwijderde, gedeeltelijke of afwijkende bronkosten. */
export function bookedCostRowsMatch(uid: string, costIds: string[], rows: Array<Record<string, unknown>>, input: Record<string, unknown>): boolean {
  if (rows.length !== costIds.length || new Set(rows.map(row => row.id)).size !== costIds.length) return false;
  if (rows.some(row => row.user_id !== uid || !costIds.includes(String(row.id)))) return false;
  for (const field of ['amount_excl_btw', 'btw_amount', 'amount_incl_btw']) {
    if (input[field] == null || input[field] === '' || !Number.isFinite(Number(input[field]))) return false;
    if (rows.some(row => row[field] == null || row[field] === '' || !Number.isFinite(Number(row[field])))) return false;
    const sumCents = rows.reduce((sum, row) => sum + Math.round(Number(row[field]) * 100), 0);
    if (Math.abs(sumCents - Math.round(Number(input[field]) * 100)) > 2) return false;
  }
  return true;
}

/** Een vastgestelde classificatie van een afzonderlijke bijlage gaat vóór het importtype. */
export function receiptFilesWithDocumentType(files: ProjectCostReceiptFile[], documentType: unknown): ProjectCostReceiptFile[] {
  const type = typeof documentType === 'string' ? documentType.trim().toLowerCase() : '';
  return files.map(file => file.document_type?.trim() || !type ? file : { ...file, document_type: type });
}
