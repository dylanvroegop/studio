import { detectStableStops, distanceMeters, type GpsSite, type SupplierVisit } from './gps-work-sessions';
import type { TrackingPoint } from './tracking-analysis';

export interface GpsPurchaseEvidence {
  method: 'gps_previous_client' | 'gps_next_client' | 'delivery_address';
  quoteId: string;
  workDate: string;
  clientAddress: string;
  clientStartAt: string;
  clientEndAt: string;
  supplierName: string;
  supplierAddress: string;
  supplierStartAt: string;
  supplierEndAt: string;
}
export interface GpsPurchaseContext {
  points: TrackingPoint[];
  sites: GpsSite[];
  suppliers: SupplierVisit[];
}
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const normalize = (value: string): string => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\b(b\.?v\.?|xl)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export function purchaseDate(input: Record<string, unknown>): string | null {
  // Een verzamelfactuurdatum is geen bewijs van een winkelbezoek.
  const isReceipt = input.payment_type === 'bon' || /contant\s*factuur|kassabon|aankoopbon|^bon\b/i.test(text(input.description));
  if (!isReceipt || input.payment_type === 'private' || input.payment_status === 'private') return null;
  const value = text(input.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}
export function canGpsLinkPurchase(input: Record<string, unknown>): boolean {
  const lines = Array.isArray(input.line_items) ? input.line_items : [];
  return Boolean(purchaseDate(input)) && !text(input.offerte_id) && !text(input.offerte_reference)
    && !(Array.isArray(input.reference_candidates) && input.reference_candidates.length)
    && lines.length > 0 && lines.every(line => line && typeof line === 'object' && !text(line.offerte_id))
    && lines.some(line => line.category === 'materiaal');
}
function localDate(value: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date(value));
}
/** Alleen direct klant -> winkel. Alle passende bezoeken op de bondatum moeten dezelfde klant bewijzen. */
export function matchGpsPurchase(input: Record<string, unknown>, context: GpsPurchaseContext): GpsPurchaseEvidence | null {
  if (!canGpsLinkPurchase(input)) return null;
  const workDate = purchaseDate(input)!;
  const supplier = normalize(text(input.supplier_name));
  if (!supplier || /credit|verzamel|online|webshop|bezorg|levering aan huis/i.test(text(input.description))) return null;
  const visits = context.suppliers.filter(visit => {
    if (!Number.isFinite(Date.parse(visit.startAt)) || !Number.isFinite(Date.parse(visit.endAt))) return false;
    const name = normalize(visit.name);
    return localDate(visit.startAt) === workDate && visit.minutes >= 5
      && (supplier === name || name.startsWith(`${supplier} `) || supplier.startsWith(`${name} `));
  });
  if (!visits.length) return null;
  const points = context.points.filter(p => Number.isFinite(Date.parse(p.recorded_at)) && localDate(p.recorded_at) === workDate)
    .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
  const stops = detectStableStops(points);
  const evidence: GpsPurchaseEvidence[] = [];
  for (const visit of visits) {
    const from = Date.parse(visit.startAt), to = Date.parse(visit.endAt);
    if (to <= from) return null;
    const previous = stops.filter(stop => Date.parse(stop.endAt) < from).at(-1);
    const previousSites = previous ? context.sites.filter(site => distanceMeters(previous.point, site) <= 150) : [];
    let client = previous;
    let sites = previousSites;
    let method: GpsPurchaseEvidence['method'] = 'gps_previous_client';
    if (previousSites.length === 0) {
      const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', hour12: false }).format(new Date(from)));
      const earlierClient = stops.some(stop => Date.parse(stop.endAt) < from && context.sites.some(site => distanceMeters(stop.point, site) <= 150));
      if (hour >= 12 || earlierClient) return null;
      client = stops.find(stop => Date.parse(stop.startAt) > to);
      sites = client ? context.sites.filter(site => distanceMeters(client!.point, site) <= 150) : [];
      method = 'gps_next_client';
    }
    if (!client || client.minutes < 8 || sites.length !== 1 || sites[0].quotes.length !== 1) return null;
    const gap = method === 'gps_previous_client' ? from - Date.parse(client.endAt) : Date.parse(client.startAt) - to;
    if (gap < 0 || gap > 90 * 60_000) return null;
    const quote = sites[0].quotes[0];
    if (!['geaccepteerd', 'in_uitvoering', 'afgerond'].includes(quote.status || '')) return null;
    const tripStart = Math.min(Date.parse(client.startAt), from);
    const tripEnd = Math.max(Date.parse(client.endAt), to);
    const trip = points.filter(p => Date.parse(p.recorded_at) >= tripStart && Date.parse(p.recorded_at) <= tripEnd);
    if (trip.length < 3 || trip.some((p, i) => i > 0 && Date.parse(p.recorded_at) - Date.parse(trip[i - 1].recorded_at) > 20 * 60_000)) return null;
    const atClient = trip.filter(p => Date.parse(p.recorded_at) >= Date.parse(client.startAt) && Date.parse(p.recorded_at) <= Date.parse(client.endAt));
    const stationary = atClient.filter(p => p.speed_kmh != null && p.speed_kmh <= 5);
    if (stationary.length < 2 || Date.parse(stationary.at(-1)!.recorded_at) - Date.parse(stationary[0].recorded_at) < 8 * 60_000) return null;
    if (!trip.some(p => Date.parse(p.recorded_at) >= from && Date.parse(p.recorded_at) <= to && distanceMeters(p, visit) <= 180)) return null;
    evidence.push({ method, quoteId: quote.id, workDate,
      clientAddress: sites[0].address, clientStartAt: stationary[0].recorded_at, clientEndAt: stationary.at(-1)!.recorded_at,
      supplierName: visit.name, supplierAddress: visit.address, supplierStartAt: visit.startAt, supplierEndAt: visit.endAt });
  }
  return new Set(evidence.map(row => row.quoteId)).size === 1 ? evidence[0] : null;
}
export function applyGpsPurchaseLink(input: Record<string, unknown>, evidence: GpsPurchaseEvidence): Record<string, unknown> {
  return { ...input, line_items: (input.line_items as Record<string, unknown>[]).map(line =>
    line.category === 'materiaal' && (!text(line.offerte_id) || line.offerte_id === evidence.quoteId)
      ? { ...line, offerte_id: evidence.quoteId, gps_link_evidence: evidence } : line) };
}
