import type { KnabCostAccount } from '@/lib/finance-bank-ledger';

interface KostenListUser {
  uid: string;
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

export function kostenAccountStorageKey(uid: string): string {
  return `kosten-knab-rekening:${uid}`;
}

export function readKostenAccount(uid: string): string {
  try {
    return localStorage.getItem(kostenAccountStorageKey(uid)) || '';
  } catch {
    return '';
  }
}

export class KostenListError extends Error {
  constructor(message: string, public readonly accounts?: KnabCostAccount[]) {
    super(message);
  }
}

export async function requestKostenList<T>(user: KostenListUser, iban: string): Promise<{
  data: T[];
  sourceCosts?: T[];
  privateCredits?: T[];
  bankHistory?: { iban: string };
  accounts?: KnabCostAccount[];
}> {
  const signal = AbortSignal.timeout(125_000);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await user.getIdToken(attempt > 0).catch(() => {
      throw new KostenListError('Je Studio-sessie kon niet worden gecontroleerd. Controleer je verbinding of log opnieuw in.');
    });
    let response: Response;
    try {
      const headers = new Headers({ Authorization: `Bearer ${token}` });
      if (iban) headers.set('X-Knab-Kosten-Iban', iban);
      response = await fetch('/api/kosten/list', { headers, cache: 'no-store', signal });
    } catch {
      throw new KostenListError(signal.aborted
        ? 'Het kostenoverzicht reageert te langzaam. Probeer het opnieuw.'
        : 'Geen verbinding met Studio. Controleer je internet en probeer het opnieuw.');
    }
    if (response.status === 401) {
      if (attempt === 0) continue;
      break;
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      const message = typeof payload?.message === 'string' && payload.message
        ? payload.message
        : response.status === 504 || signal.aborted
          ? 'Het kostenoverzicht reageert te langzaam. Probeer het opnieuw.'
          : `Studio kon het kostenoverzicht niet ophalen (HTTP ${response.status}). Probeer het opnieuw.`;
      throw new KostenListError(message, Array.isArray(payload?.accounts) ? payload.accounts : undefined);
    }
    if (!Array.isArray(payload.data)) {
      throw new KostenListError('Studio gaf een onvolledig kostenoverzicht terug. Probeer het opnieuw.');
    }
    return payload;
  }
  throw new KostenListError('Je Studio-sessie is verlopen. Log opnieuw in en open de kosten opnieuw.');
}
