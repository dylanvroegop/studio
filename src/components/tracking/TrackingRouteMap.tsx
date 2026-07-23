'use client';

import { useEffect } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type RouteMapPosition = {
  id: string;
  latitude: number;
  longitude: number;
  recorded_at: string;
  speed_kmh: number | null;
  accuracy_m: number | null;
  address?: string | null;
  street?: string | null;
  city?: string | null;
};

function FitBounds({ positions }: { positions: RouteMapPosition[] }) {
  const map = useMap();

  useEffect(() => {
    if (positions.length === 0) return;
    const bounds: LatLngBoundsExpression = positions.map((position) => [position.latitude, position.longitude]);
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
  }, [map, positions]);

  return null;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

export function TrackingRouteMap({ positions }: { positions: RouteMapPosition[] }) {
  if (positions.length === 0) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
        Geen GPS-punten voor deze dag.
      </div>
    );
  }

  const route = positions.map((position) => [position.latitude, position.longitude] as [number, number]);
  const first = positions[0];
  const last = positions[positions.length - 1];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
      <MapContainer
        center={[first.latitude, first.longitude]}
        zoom={13}
        scrollWheelZoom
        className="h-[420px] w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds positions={positions} />
        <Polyline positions={route} pathOptions={{ color: '#10b981', weight: 5, opacity: 0.9 }} />
        {positions.map((position, index) => {
          const isStart = index === 0;
          const isEnd = index === positions.length - 1;
          return (
            <CircleMarker
              key={position.id}
              center={[position.latitude, position.longitude]}
              radius={isStart || isEnd ? 8 : 4}
              pathOptions={{
                color: isStart ? '#2563eb' : isEnd ? '#dc2626' : '#064e3b',
                fillColor: isStart ? '#60a5fa' : isEnd ? '#f87171' : '#34d399',
                fillOpacity: 0.95,
                weight: 2,
              }}
            >
              <Popup>
                <div className="space-y-1 text-sm">
                  <div className="font-semibold">{isStart ? 'Start' : isEnd ? 'Einde' : 'GPS-punt'}</div>
                  <div>{formatTime(position.recorded_at)}</div>
                  <div>{position.street || position.address || 'Adres nog niet gevonden'}</div>
                  <div>{position.speed_kmh == null ? '—' : `${position.speed_kmh.toFixed(1)} km/u`}</div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border bg-background/80 px-4 py-3 text-xs text-muted-foreground">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" /> Start {formatTime(first.recorded_at)}</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" /> Einde {formatTime(last.recorded_at)}</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" /> GPS-route ({positions.length} punten)</span>
      </div>
    </div>
  );
}
