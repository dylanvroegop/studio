type AddressParts = {
  straat?: string | null;
  huisnummer?: string | null;
  postcode?: string | null;
  plaats?: string | null;
};

type KlantinformatieAddressSource = {
  straat?: string | null;
  huisnummer?: string | null;
  postcode?: string | null;
  plaats?: string | null;
  projectStraat?: string | null;
  projectHuisnummer?: string | null;
  projectPostcode?: string | null;
  projectPlaats?: string | null;
  projectadres?: AddressParts | null;
  projectAdres?: AddressParts | null;
  factuuradres?: AddressParts | null;
  factuurAdres?: AddressParts | null;
};

type QuoteAddressSource = {
  klantinformatie?: KlantinformatieAddressSource | null;
} | null | undefined;

function cleanPart(value: string | null | undefined): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function buildAddressString(parts: AddressParts): string {
  const straat = cleanPart(parts.straat);
  const huisnummer = cleanPart(parts.huisnummer);
  const postcode = cleanPart(parts.postcode);
  const plaats = cleanPart(parts.plaats);

  const line1 = [straat, huisnummer].filter(Boolean).join(' ').trim();
  const line2 = [postcode, plaats].filter(Boolean).join(' ').trim();

  return [line1, line2].filter(Boolean).join(', ').trim();
}

export function hasMinimalAddress(parts: AddressParts): boolean {
  const straat = cleanPart(parts.straat);
  const postcode = cleanPart(parts.postcode);
  const plaats = cleanPart(parts.plaats);
  return Boolean(postcode || (straat && plaats));
}

export function resolveQuoteProjectAddress(quote: QuoteAddressSource): string {
  const info = quote?.klantinformatie;
  if (!info) return '';

  const projectAddressCandidate = info.projectadres
    || info.projectAdres
    || {
      straat: info.projectStraat,
      huisnummer: info.projectHuisnummer,
      postcode: info.projectPostcode,
      plaats: info.projectPlaats,
    };

  const factuurAddressCandidate = info.factuuradres
    || info.factuurAdres
    || {
      straat: info.straat,
      huisnummer: info.huisnummer,
      postcode: info.postcode,
      plaats: info.plaats,
    };

  const hasProjectAddress = hasMinimalAddress(projectAddressCandidate);
  const preferredAddress = hasProjectAddress ? projectAddressCandidate : factuurAddressCandidate;

  if (!hasMinimalAddress(preferredAddress)) return '';
  return buildAddressString(preferredAddress);
}

export function buildGoogleMapsDirectionsUrl(address: string): string {
  const cleaned = String(address || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cleaned)}`;
}
