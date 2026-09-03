const EXCLUDED_GPS_CLIENT_NAMES = new Set(['jm boon', 'j m boon']);

function normalizeClientName(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function gpsClientNameFromInfo(info: unknown): string {
  if (!info || typeof info !== 'object' || Array.isArray(info)) return '';
  const record = info as Record<string, unknown>;
  const personalName = [record.voornaam, record.achternaam]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
  return String(
    record.bedrijfsnaam
      || record.bedrijfsNaam
      || record.naam
      || record.name
      || personalName
      || '',
  ).trim();
}

export function isExcludedGpsClientName(value: unknown): boolean {
  return EXCLUDED_GPS_CLIENT_NAMES.has(normalizeClientName(value));
}

export function isExcludedGpsSession(session: Record<string, unknown>): boolean {
  const candidates = Array.isArray(session.candidate_quotes) ? session.candidate_quotes : [];
  if (candidates.length === 0) return false;
  return candidates.every((candidate) => (
    candidate
      && typeof candidate === 'object'
      && isExcludedGpsClientName((candidate as Record<string, unknown>).clientName)
  ));
}
