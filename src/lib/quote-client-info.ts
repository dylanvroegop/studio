import type { KlantInformatie } from '@/lib/quote-calculations';

/** De opgeslagen klantgegevens zijn leidend; de calculatie is alleen een legacy-fallback. */
export function resolveQuoteClientInfo(current: any, fallback?: any): KlantInformatie {
  const info = current ?? fallback ?? {};
  const billing = info.factuuradres || info.factuurAdres || {};
  const project = info.projectAdres || info.projectadres || {};
  const text = (value: unknown): string => value == null ? '' : String(value);
  const houseNumber = (number: unknown, addition: unknown): string =>
    [text(number), text(addition)].filter(Boolean).join(' ').trim();
  return {
    klanttype: info.klanttype || 'Particulier',
    voornaam: text(info.voornaam), achternaam: text(info.achternaam),
    bedrijfsnaam: text(info.bedrijfsnaam),
    kvkNummer: text(info.kvkNummer), btwNummer: text(info.btwNummer),
    emailadres: text(info.emailadres ?? info['e-mailadres'] ?? info.email),
    telefoonnummer: text(info.telefoonnummer ?? info.telefoon),
    straat: text(info.straat ?? billing.straat),
    huisnummer: houseNumber(info.huisnummer ?? billing.huisnummer, info.toevoeging ?? billing.toevoeging),
    postcode: text(info.postcode ?? billing.postcode), plaats: text(info.plaats ?? billing.plaats),
    afwijkendProjectadres: !!info.afwijkendProjectadres,
    projectAdres: info.afwijkendProjectadres ? {
      straat: text(info.projectStraat ?? project.straat),
      huisnummer: houseNumber(info.projectHuisnummer ?? project.huisnummer, project.toevoeging),
      postcode: text(info.projectPostcode ?? project.postcode),
      plaats: text(info.projectPlaats ?? project.plaats),
    } : undefined,
  };
}
