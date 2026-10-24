import type { GpsHealth } from '@/lib/gps-health';

export interface GpsAlertState { outageSince: number | null; eventId: string | null }

/** Eén extra herinnering per Amsterdamse dag, vanaf 19:00 zolang de storing aanhoudt. */
export function gpsDailyReminderId(state: GpsAlertState, now: number): string | null {
  if (!state.eventId) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)?.value;
  if (Number(value('hour')) < 19) return null;
  return `gps-herinnering:${value('year')}-${value('month')}-${value('day')}`;
}
export function nextGpsAlert(previous: GpsAlertState | undefined, health: GpsHealth, now: number): GpsAlertState {
  if (health.state === 'ok' || health.state === 'stationary') return { outageSince: null, eventId: null };
  const outageSince = previous?.outageSince ?? (health.state === 'stale' && health.lastFixAt ? Date.parse(health.lastFixAt) : now);
  return {
    outageSince,
    eventId: previous?.eventId || (now - outageSince >= 20 * 60_000 ? `gps-storing:${outageSince}` : null),
  };
}
