export const COST_ARCHIVE_VISIBILITY = 'linked_cost_only';

interface CostArchiveVisibilityRecord {
  metadata?: unknown;
  linked_cost_ids?: unknown;
}

/** De UI verdeelt archieven strikt op een bestaande kostenkoppeling, ook bij oude archieven. */
export function isCostArchiveLinked(record: CostArchiveVisibilityRecord): boolean {
  return Array.isArray(record.linked_cost_ids)
    && record.linked_cost_ids.some((id) => typeof id === 'string' && id.trim().length > 0);
}

/** Nieuwe bronbestanden zijn pas zichtbaar na kostenopslag; oude archieven blijven ongewijzigd. */
export function isCostArchiveVisible(record: CostArchiveVisibilityRecord, includeUnlinked = false): boolean {
  // Alleen de documentenweergave kan bronnen opvragen; dit maakt nooit een kostenboeking.
  if (includeUnlinked) return true;
  const metadata = record.metadata && typeof record.metadata === 'object'
    ? record.metadata as Record<string, unknown>
    : {};
  if (metadata.finance_visibility !== COST_ARCHIVE_VISIBILITY) return true;
  return isCostArchiveLinked(record);
}
