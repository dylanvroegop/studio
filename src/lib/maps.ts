type AddressParts = {
  straat?: string | null;
  huisnummer?: string | null;
  postcode?: string | null;
  plaats?: string | null;
};

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

export function buildGoogleMapsDirectionsUrl(address: string): string {
  const cleaned = String(address || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cleaned)}`;
}

