export interface QuotePdfTextSettings {
  voorwaardenVastePrijs: string[];
  voorwaardenOnderVoorbehoud: string[];
  voorwaardenVastePrijsRodeRegels: number[];
  voorwaardenOnderVoorbehoudRodeRegels: number[];
  afsluitingTekst: string;
  groetTekst: string;
  ondertekeningNaam: string;
}

export const defaultQuotePdfTextSettings: QuotePdfTextSettings = {
  voorwaardenVastePrijs: [
    'Deze offerte is 30 dagen geldig vanaf offertedatum',
    'Prijzen zijn exclusief BTW tenzij anders vermeld',
    'Meerwerk wordt in overleg uitgevoerd en separaat gefactureerd',
    'Betaling: 50% bij opdracht, 50% bij oplevering',
    'Op al onze werkzaamheden zijn onze algemene voorwaarden van toepassing',
  ],
  voorwaardenOnderVoorbehoud: [
    'Deze offerte is 30 dagen geldig vanaf offertedatum',
    'Deze offerte betreft een richtprijs op basis van huidige inzichten',
    'Definitieve verrekening gebeurt op basis van werkelijk uitgevoerde werkzaamheden',
    'Betaling: achteraf op factuur na uitvoering, tenzij schriftelijk anders afgesproken',
    'Onder voorbehoud van prijs- en typewijzigingen',
    'Op al onze werkzaamheden zijn onze algemene voorwaarden van toepassing',
  ],
  voorwaardenVastePrijsRodeRegels: [],
  voorwaardenOnderVoorbehoudRodeRegels: [],
  afsluitingTekst:
    'Wij vertrouwen erop u hiermee een passende aanbieding te hebben gedaan en zien uw reactie graag tegemoet.',
  groetTekst: 'Met vriendelijke groet,',
  ondertekeningNaam: '',
};

function sanitizeRegels(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const regels = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
  return regels.length > 0 ? regels : [...fallback];
}

function sanitizeRegelIndexes(value: unknown, maxLength: number): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  value.forEach((item) => {
    const parsed = Number(item);
    if (!Number.isInteger(parsed)) return;
    if (parsed < 0 || parsed >= maxLength) return;
    seen.add(parsed);
  });
  return Array.from(seen).sort((a, b) => a - b);
}

export function sanitizeQuotePdfTextSettings(value: unknown): QuotePdfTextSettings {
  if (!value || typeof value !== 'object') return { ...defaultQuotePdfTextSettings };
  const raw = value as Record<string, unknown>;

  const afsluitingTekst =
    typeof raw.afsluitingTekst === 'string' && raw.afsluitingTekst.trim().length > 0
      ? raw.afsluitingTekst.trim()
      : defaultQuotePdfTextSettings.afsluitingTekst;

  const groetTekst =
    typeof raw.groetTekst === 'string' && raw.groetTekst.trim().length > 0
      ? raw.groetTekst.trim()
      : defaultQuotePdfTextSettings.groetTekst;

  const ondertekeningNaam =
    typeof raw.ondertekeningNaam === 'string' ? raw.ondertekeningNaam.trim() : '';

  const voorwaardenVastePrijs = sanitizeRegels(
    raw.voorwaardenVastePrijs,
    defaultQuotePdfTextSettings.voorwaardenVastePrijs,
  );

  const voorwaardenOnderVoorbehoud = sanitizeRegels(
    raw.voorwaardenOnderVoorbehoud,
    defaultQuotePdfTextSettings.voorwaardenOnderVoorbehoud,
  );

  const legacyAllRed =
    typeof raw.vastePrijsVoorwaardenRood === 'boolean' ? raw.vastePrijsVoorwaardenRood : false;

  const voorwaardenVastePrijsRodeRegels = legacyAllRed
    ? voorwaardenVastePrijs.map((_, index) => index)
    : sanitizeRegelIndexes(raw.voorwaardenVastePrijsRodeRegels, voorwaardenVastePrijs.length);

  const voorwaardenOnderVoorbehoudRodeRegels = sanitizeRegelIndexes(
    raw.voorwaardenOnderVoorbehoudRodeRegels,
    voorwaardenOnderVoorbehoud.length,
  );

  return {
    voorwaardenVastePrijs,
    voorwaardenOnderVoorbehoud,
    voorwaardenVastePrijsRodeRegels,
    voorwaardenOnderVoorbehoudRodeRegels,
    afsluitingTekst,
    groetTekst,
    ondertekeningNaam,
  };
}
