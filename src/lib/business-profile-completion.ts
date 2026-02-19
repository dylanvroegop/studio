export interface BusinessProfileLike {
  bedrijfsnaam?: unknown;
  contactNaam?: unknown;
  email?: unknown;
  telefoon?: unknown;
  kvkNummer?: unknown;
  rol?: unknown;
  offertesPerMaand?: unknown;
}

interface MergedBusinessProfile {
  bedrijfsnaam: string;
  contactNaam: string;
  email: string;
  telefoon: string;
  kvkNummer: string;
  rol: string;
  offertesPerMaand: string;
}

const asTrimmed = (value: unknown): string => String(value ?? '').trim();

export function mergeBusinessProfile(
  settings?: BusinessProfileLike | null,
  business?: BusinessProfileLike | null
): MergedBusinessProfile {
  return {
    bedrijfsnaam: asTrimmed(settings?.bedrijfsnaam || business?.bedrijfsnaam),
    contactNaam: asTrimmed(settings?.contactNaam || business?.contactNaam),
    email: asTrimmed(settings?.email || business?.email),
    telefoon: asTrimmed(settings?.telefoon || business?.telefoon),
    kvkNummer: asTrimmed(settings?.kvkNummer || business?.kvkNummer),
    rol: asTrimmed(settings?.rol || business?.rol),
    offertesPerMaand: asTrimmed(settings?.offertesPerMaand || business?.offertesPerMaand),
  };
}

export function isBusinessProfileComplete(
  settings?: BusinessProfileLike | null,
  business?: BusinessProfileLike | null
): boolean {
  const merged = mergeBusinessProfile(settings, business);

  return Boolean(
    merged.bedrijfsnaam &&
    merged.contactNaam &&
    merged.email &&
    merged.telefoon &&
    merged.kvkNummer &&
    merged.rol &&
    merged.offertesPerMaand
  );
}
