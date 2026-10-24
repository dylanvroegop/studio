import type { ProjectCostCategory } from './project-costs';

/** Een bevestigde keuze blijft geldig wanneer Knab opnieuw wordt gekoppeld. */
export function categoryOverrideForTransaction(
  transaction: { id: string; source_transaction_ids?: string[] },
  overrides?: ReadonlyMap<string, ProjectCostCategory>,
): ProjectCostCategory | undefined {
  const current = overrides?.get(transaction.id);
  if (current) return current;
  const historical = new Set((transaction.source_transaction_ids || [])
    .map((id) => overrides?.get(id))
    .filter((category): category is ProjectCostCategory => Boolean(category)));
  if (historical.size > 1) return 'overig';
  return historical.values().next().value;
}

/** Door de gebruiker bevestigd: Creman-betalingen horen bij de totale schuld. */
export function isCremanCounterparty(value: unknown): boolean {
  return typeof value === 'string'
    && /^stichting\s+derdengelden\s+creman(?:\s|$)/i.test(value.trim());
}

/** Herken de tankstationnaam; een losse vermelding in een andere betaling is geen bewijs. */
export function isFuelCounterparty(value: unknown, description?: unknown): boolean {
  const rawName = typeof value === 'string' ? value.trim() : '';
  const missingName = !rawName || /^[.\-\s]+$/.test(rawName);
  const name = (missingName && typeof description === 'string' ? description : rawName)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    .replace(/^(?:(?:bck|ccv|sumup|zettle)\s*[*:]\s*)+/, '')
    .replace(/^nl\d{4,}\s+/, '')
    .replace(/\s+/g, ' ');

  // Energiecontracten, laadpassen en wasstraten zijn geen tankbeurten.
  if (/\b(?:energy|energie|recharge|charging|laadpas|laadpaal|carwash|wasstraat|consulting|advies)\b/.test(name)) return false;
  if (/^(?:shell|bp|esso|texaco|tango|tinq|tamoil|avia|argos|q8|gulf|firezone|totalenergies|circle\s?k)\b/.test(name)) return true;
  if (/^tankstations?\b/.test(name) || /^stam tankstations?\b/.test(name)) return true;

  // Total en OK zijn ook gewone woorden. Alleen herkenbare stationspatronen
  // en gecontroleerde locaties uit de bankhistorie vallen onder deze regel.
  if (/^total (?:nn\d+\b|express\b|tankstation\b|beverwijk\b|vissers de ijsse(?:l)?\b)/.test(name)) return true;
  if (/^ok (?:tankstation\b|eemnes\b|rotterdam hs\b)/.test(name)) return true;
  return /^(?:gssp rijswijk|haan bergermeer|gabriels maasmechelen)\b/.test(name)
    || /^adolf roth gmbh & co\.?$/.test(name);
}
