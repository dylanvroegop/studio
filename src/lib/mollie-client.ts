import 'server-only';

export interface MolliePaymentLink {
  id: string;
  mode: 'test' | 'live';
  paidAt?: string | null;
  expiresAt?: string | null;
  _links: { paymentLink: { href: string } };
}

export function mollieMode(): 'test' | 'live' {
  const key = process.env.MOLLIE_API_KEY?.trim();
  if (!key || !/^(test|live)_[A-Za-z0-9]+$/.test(key)) {
    throw new Error('Mollie is nog niet ingesteld op deze server.');
  }
  return key.startsWith('test_') ? 'test' : 'live';
}

export async function mollieRequest<T>(path: string, body?: unknown, idempotencyKey?: string, method?: 'PATCH'): Promise<T> {
  mollieMode();
  const response = await fetch(`https://api.mollie.com/v2${path}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: {
      Authorization: `Bearer ${process.env.MOLLIE_API_KEY!.trim()}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    // Geen providerresponse of credentials naar de browser/logs doorgeven.
    throw new Error(`Mollie kon het verzoek niet verwerken (${response.status}). Probeer opnieuw.`);
  }
  return response.json() as Promise<T>;
}
