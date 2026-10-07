export interface TelegramClientIdentity {
  client_name?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
}

export class TelegramIdentityConflict extends Error {
  constructor() {
    super('Klantgegevens spreken elkaar tegen of zijn niet eenduidig. Er is niets opgeslagen. Controleer de klant en het telefoonnummer handmatig.');
    this.name = 'TelegramIdentityConflict';
  }
}

export function normalizeIdentityText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('nl-NL');
  return ['null', 'undefined'].includes(normalized) ? '' : normalized;
}

export function normalizeIdentityPhone(value: unknown): string {
  return normalizeIdentityText(value).replace(/\D/g, '').replace(/^(0031|31)/, '0');
}

export function storedClientIdentity(data: Record<string, unknown>): TelegramClientIdentity {
  return {
    client_name: [data.voornaam, data.achternaam].filter(Boolean).join(' ') || String(data.bedrijfsnaam || ''),
    phone: typeof data.telefoonnummer === 'string' ? data.telefoonnummer : null,
    email: typeof (data.emailadres || data['e-mailadres']) === 'string' ? String(data.emailadres || data['e-mailadres']) : null,
    city: typeof data.plaats === 'string' ? data.plaats : null,
  };
}

// Ook bij een herhaalde lead_key controleren; een sessiesleutel bewijst geen klantidentiteit.
export function assertSameTelegramClient(incoming: TelegramClientIdentity, existing: TelegramClientIdentity): void {
  for (const key of ['client_name', 'phone', 'email', 'city'] as const) {
    const normalize = key === 'phone' ? normalizeIdentityPhone : normalizeIdentityText;
    const left = normalize(incoming[key]);
    const right = normalize(existing[key]);
    if (left && right && left !== right) throw new TelegramIdentityConflict();
  }
  const same = (key: keyof TelegramClientIdentity): boolean => {
    const normalize = key === 'phone' ? normalizeIdentityPhone : normalizeIdentityText;
    return Boolean(normalize(incoming[key])) && normalize(incoming[key]) === normalize(existing[key]);
  };
  if (!same('client_name') || !(['phone', 'email', 'city'] as const).some(same)) {
    throw new TelegramIdentityConflict();
  }
}

export function selectTelegramClient<T extends { identity: TelegramClientIdentity }>(
  clients: T[], incoming: TelegramClientIdentity,
): T | undefined {
  const same = (existing: TelegramClientIdentity, key: keyof TelegramClientIdentity): boolean => {
    const normalize = key === 'phone' ? normalizeIdentityPhone : normalizeIdentityText;
    return Boolean(normalize(incoming[key])) && normalize(incoming[key]) === normalize(existing[key]);
  };
  const contacts = clients.filter(({ identity }) => same(identity, 'phone') || same(identity, 'email'));
  const matches = contacts.length ? contacts : clients.filter(({ identity }) => same(identity, 'client_name') && same(identity, 'city'));
  if (matches.length > 1) throw new TelegramIdentityConflict();
  if (matches[0]) assertSameTelegramClient(incoming, matches[0].identity);
  return matches[0];
}
