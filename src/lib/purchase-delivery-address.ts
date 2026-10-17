export interface DeliveryAddress { label?: string; postcode?: string; city?: string; street?: string; house_number?: string }
export interface DeliveryQuote { id: string; status?: string; archived?: boolean; klantinformatie?: Record<string, unknown> }
const clean = (v: unknown): string => typeof v === 'string' ? v.toLowerCase().replace(/\s+/g, '').trim() : '';
/** Alleen het expliciete afleveradres; nooit het adres van leverancier of eigen bedrijf. */
export function matchDeliveryAddress(address: DeliveryAddress, quotes: DeliveryQuote[]): DeliveryQuote | null {
  const postcode = clean(address.postcode);
  if (!/^\d{4}[a-z]{2}$/.test(postcode) || !/aflever|bezorg|delivery|shipping/i.test(address.label || '')) return null;
  const matches = quotes.filter(q => {
    if (q.archived || !['geaccepteerd', 'in_uitvoering', 'afgerond'].includes(q.status || '')) return false;
    const info = q.klantinformatie || {};
    const nested = info.projectadres && typeof info.projectadres === 'object' ? info.projectadres as Record<string, unknown> : {};
    const alternate = info.afwijkendProjectadres === true;
    const field = (name: string, flat: string) => alternate ? nested[name] || info[flat] : info[name];
    return clean(field('postcode','projectPostcode')) === postcode
      && (!address.city || clean(field('plaats','projectPlaats')) === clean(address.city))
      && (!address.house_number || clean(field('huisnummer','projectHuisnummer')) === clean(address.house_number))
      && (!address.street || clean(field('straat','projectStraat')) === clean(address.street));
  });
  return matches.length === 1 ? matches[0] : null;
}
