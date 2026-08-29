import type { TrackingPoint } from '@/lib/tracking-analysis';

export const CLIENT_RADIUS_M = 150;
const MAX_POINT_GAP_MINUTES = 20;
const GPS_BRIDGE_MINUTES = 30;
const SUPPLIER_EXCURSION_MAX_MINUTES = 240;

export interface GpsQuoteCandidate {
  id: string;
  quoteNumber: string;
  clientName: string;
  projectTitle: string;
  quoteAmount?: number;
  quoteDate?: string;
  status?: string;
}

export interface GpsSite {
  key: string;
  address: string;
  latitude: number;
  longitude: number;
  quotes: GpsQuoteCandidate[];
}

export interface SupplierVisit {
  name: string;
  address: string;
  startAt: string;
  endAt: string;
  minutes: number;
  latitude: number;
  longitude: number;
}

export interface StableStop {
  startAt: string;
  endAt: string;
  minutes: number;
  point: TrackingPoint;
}

export interface GpsSessionDraft {
  site: GpsSite;
  startAt: string;
  endAt: string;
  onsiteMinutes: number;
  outboundTravelMinutes: number;
  returnTravelMinutes: number;
  supplierTravelMinutes: number;
  supplierStopMinutes: number;
  supplierVisits: SupplierVisit[];
}

function at(value: string): number {
  return new Date(value).getTime();
}

export function distanceMeters(
  left: Pick<TrackingPoint, 'latitude' | 'longitude'>,
  right: Pick<TrackingPoint, 'latitude' | 'longitude'>,
): number {
  const radius = 6_371_000;
  const lat1 = left.latitude * Math.PI / 180;
  const lat2 = right.latitude * Math.PI / 180;
  const deltaLat = (right.latitude - left.latitude) * Math.PI / 180;
  const deltaLon = (right.longitude - left.longitude) * Math.PI / 180;
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function detectStableStops(points: TrackingPoint[]): StableStop[] {
  const sorted = [...points].sort((a, b) => at(a.recorded_at) - at(b.recorded_at));
  const output: StableStop[] = [];
  let start = 0;

  const flush = (end: number) => {
    const first = sorted[start];
    const last = sorted[end];
    if (!first || !last) return;
    const minutes = Math.round((at(last.recorded_at) - at(first.recorded_at)) / 60_000);
    if (minutes >= 5) {
      output.push({
        startAt: first.recorded_at,
        endAt: last.recorded_at,
        minutes,
        point: sorted[Math.floor((start + end) / 2)],
      });
    }
  };

  for (let index = 1; index < sorted.length; index += 1) {
    const gap = (at(sorted[index].recorded_at) - at(sorted[index - 1].recorded_at)) / 60_000;
    const moved = distanceMeters(sorted[start], sorted[index]);
    if (gap > MAX_POINT_GAP_MINUTES || moved > 160) {
      flush(index - 1);
      start = index;
    }
  }
  flush(sorted.length - 1);
  return output;
}

function matchedSite(point: TrackingPoint, sites: GpsSite[]): GpsSite | null {
  let best: { site: GpsSite; distance: number } | null = null;
  for (const site of sites) {
    const distance = distanceMeters(point, site);
    if (distance <= CLIENT_RADIUS_M && (!best || distance < best.distance)) best = { site, distance };
  }
  return best?.site || null;
}

interface SiteVisit {
  site: GpsSite;
  startAt: string;
  endAt: string;
  minutes: number;
}

function siteVisits(points: TrackingPoint[], sites: GpsSite[]): SiteVisit[] {
  const sorted = [...points].sort((a, b) => at(a.recorded_at) - at(b.recorded_at));
  const hits = sorted
    .map((point) => ({ point, site: matchedSite(point, sites) }))
    .filter((item): item is { point: TrackingPoint; site: GpsSite } => Boolean(item.site));
  const visits: SiteVisit[] = [];
  for (const hit of hits) {
    const previous = visits.at(-1);
    const gapMinutes = previous ? (at(hit.point.recorded_at) - at(previous.endAt)) / 60_000 : Infinity;
    if (previous && previous.site.key === hit.site.key && gapMinutes <= GPS_BRIDGE_MINUTES) {
      previous.endAt = hit.point.recorded_at;
      previous.minutes = Math.max(1, Math.round((at(previous.endAt) - at(previous.startAt)) / 60_000));
    } else {
      visits.push({ site: hit.site, startAt: hit.point.recorded_at, endAt: hit.point.recorded_at, minutes: 0 });
    }
  }
  return visits.filter((visit) => visit.minutes >= 5);
}

function overlapSupplierVisits(visits: SupplierVisit[], from: string, to: string): SupplierVisit[] {
  const start = at(from);
  const end = at(to);
  return visits.filter((visit) => at(visit.endAt) >= start && at(visit.startAt) <= end);
}

export function buildGpsSessionDrafts(
  points: TrackingPoint[],
  sites: GpsSite[],
  supplierVisits: SupplierVisit[],
): GpsSessionDraft[] {
  const visits = siteVisits(points, sites);
  const stableStops = detectStableStops(points);
  const drafts: GpsSessionDraft[] = [];

  for (let index = 0; index < visits.length; index += 1) {
    const visit = visits[index];
    const existing = drafts.at(-1);
    const gapStart = existing?.endAt;
    const gapMinutes = gapStart ? (at(visit.startAt) - at(gapStart)) / 60_000 : Infinity;
    const suppliers = gapStart ? overlapSupplierVisits(supplierVisits, gapStart, visit.startAt) : [];
    const canMerge = existing
      && existing.site.key === visit.site.key
      && (gapMinutes <= GPS_BRIDGE_MINUTES || (suppliers.length > 0 && gapMinutes <= SUPPLIER_EXCURSION_MAX_MINUTES));

    if (canMerge) {
      const supplierStopMinutes = suppliers.reduce((sum, supplier) => sum + supplier.minutes, 0);
      existing.onsiteMinutes += visit.minutes;
      existing.supplierStopMinutes += supplierStopMinutes;
      existing.supplierTravelMinutes += Math.max(0, Math.round(gapMinutes) - supplierStopMinutes);
      existing.supplierVisits.push(...suppliers);
      existing.endAt = visit.endAt;
      continue;
    }

    drafts.push({
      site: visit.site,
      startAt: visit.startAt,
      endAt: visit.endAt,
      onsiteMinutes: visit.minutes,
      outboundTravelMinutes: 0,
      returnTravelMinutes: 0,
      supplierTravelMinutes: 0,
      supplierStopMinutes: 0,
      supplierVisits: [],
    });
  }

  if (drafts.length > 0) {
    const first = drafts[0];
    const supplierBefore = [...supplierVisits].reverse().find((supplier) => {
      const gap = (at(first.startAt) - at(supplier.endAt)) / 60_000;
      return gap >= 0 && gap <= 180;
    });
    if (supplierBefore) {
      first.supplierVisits.push(supplierBefore);
      first.supplierStopMinutes += supplierBefore.minutes;
      first.supplierTravelMinutes += Math.max(0, Math.round((at(first.startAt) - at(supplierBefore.endAt)) / 60_000));
    }
    const outboundBoundary = supplierBefore?.startAt || first.startAt;
    const previousStop = [...stableStops].reverse().find((stop) => at(stop.endAt) < at(outboundBoundary));
    if (previousStop) {
      first.outboundTravelMinutes = Math.min(180, Math.max(0, Math.round((at(outboundBoundary) - at(previousStop.endAt)) / 60_000)));
    }

    const last = drafts[drafts.length - 1];
    const supplierAfter = supplierVisits.find((supplier) => {
      const gap = (at(supplier.startAt) - at(last.endAt)) / 60_000;
      return gap >= 0 && gap <= 180;
    });
    if (supplierAfter) {
      last.supplierVisits.push(supplierAfter);
      last.supplierStopMinutes += supplierAfter.minutes;
      last.supplierTravelMinutes += Math.max(0, Math.round((at(supplierAfter.startAt) - at(last.endAt)) / 60_000));
    }
    const returnBoundary = supplierAfter?.endAt || last.endAt;
    const nextStop = stableStops.find((stop) => at(stop.startAt) > at(returnBoundary));
    if (nextStop) {
      last.returnTravelMinutes = Math.min(180, Math.max(0, Math.round((at(nextStop.startAt) - at(returnBoundary)) / 60_000)));
    }

    for (let index = 0; index < drafts.length - 1; index += 1) {
      const current = drafts[index];
      const next = drafts[index + 1];
      const suppliers = overlapSupplierVisits(supplierVisits, current.endAt, next.startAt);
      if (suppliers.length === 0) continue;
      const lastSupplier = suppliers[suppliers.length - 1];
      const stopMinutes = suppliers.reduce((sum, supplier) => sum + supplier.minutes, 0);
      if (current.site.key === next.site.key) {
        current.supplierVisits.push(...suppliers);
        current.supplierStopMinutes += stopMinutes;
        current.supplierTravelMinutes += Math.max(0, Math.round((at(lastSupplier.endAt) - at(current.endAt)) / 60_000) - stopMinutes);
        next.outboundTravelMinutes = Math.max(0, Math.round((at(next.startAt) - at(lastSupplier.endAt)) / 60_000));
      } else {
        // A supplier stop between two different clients normally prepares the next job.
        // Assign the complete detour to that next quote instead of the job just left.
        next.supplierVisits.push(...suppliers);
        next.supplierStopMinutes += stopMinutes;
        next.supplierTravelMinutes += Math.max(0, Math.round((at(next.startAt) - at(current.endAt)) / 60_000) - stopMinutes);
        next.outboundTravelMinutes = 0;
      }
    }
  }

  return drafts.filter((draft) => draft.onsiteMinutes >= 5);
}
