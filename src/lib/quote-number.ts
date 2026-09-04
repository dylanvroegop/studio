export function formatOfferteNummerLabel(offerteNummer: unknown, offerteVersie?: unknown): string {
  const base = String(offerteNummer ?? '').trim();
  if (!base) return 'CONCEPT';

  const version = Number(offerteVersie);
  if (!Number.isFinite(version) || version <= 0) return base;
  return `${base}-${Math.round(version)}`;
}
