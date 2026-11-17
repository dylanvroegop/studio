interface TokenUser {
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

interface BankResponse {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: string;
  link?: string;
  reconnectRequired?: boolean;
}

export class KnabRequestError extends Error {
  constructor(message: string, public readonly reconnectRequired = false) {
    super(message);
    this.name = 'KnabRequestError';
  }
}

export function needsKnabReconnect(message: string): boolean {
  return /Koppel eerst je Knab-rekening|geen actieve Knab-koppeling|koppeling niet gevonden|Enable Banking status:\s*(CLOSED|EXPIRED|REVOKED|CANCELLED|INVALID)|SESSION_EXPIRED|SESSION_NOT_FOUND|INVALID_SESSION|session (?:has )?expired/i.test(message);
}

/** Same-origin requests work in Safari and the installed app; no popup is needed. */
export async function requestKnab<T extends BankResponse>(
  user: TokenUser,
  path: string,
  init: RequestInit = {},
  timeoutMs = 130_000,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  if (init.signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, timeoutMs);
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await user.getIdToken(attempt > 0);
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      const response = await fetch(path, { ...init, headers, cache: 'no-store', signal: controller.signal });
      if (response.status === 401 && attempt === 0) continue;
      const payload = await response.json().catch(() => null) as T | null;
      if (!response.ok || !payload?.ok || (payload.status && payload.status !== 'connected')) {
        const message = payload?.error || payload?.message
          || (payload?.status ? `Enable Banking status: ${payload.status}` : '')
          || (response.status === 401 ? 'Je sessie is verlopen. Log opnieuw in bij Studio.'
            : response.status === 504 ? 'Knab reageert te langzaam. Probeer het over een minuut opnieuw.'
              : response.status === 429 ? 'Knab is te vaak opgevraagd. Probeer het later opnieuw.'
                : `Knab kon niet worden bijgewerkt (HTTP ${response.status}). Probeer het opnieuw.`);
        throw new KnabRequestError(message, payload?.reconnectRequired === true || needsKnabReconnect(message));
      }
      return payload;
    }
    throw new KnabRequestError('Log opnieuw in bij Studio.');
  } catch (error) {
    if (init.signal?.aborted || error instanceof KnabRequestError) throw error;
    if (controller.signal.aborted) throw new KnabRequestError('Knab reageert te langzaam. Probeer het over een minuut opnieuw.');
    if (error instanceof TypeError) throw new KnabRequestError('Geen verbinding met Studio. Controleer je internet en probeer het opnieuw.');
    throw error;
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abort);
  }
}
