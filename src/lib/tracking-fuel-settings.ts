export const TRACKING_FUEL_SETTINGS_STORAGE_KEY = 'calvora_tracking_fuel_settings';
export const DEFAULT_KM_PER_LITRE = 13;
export const DEFAULT_FUEL_PRICE = 2.1;
export const NEW_VAN_EFFECTIVE_FROM = '2026-09-07';

export interface FuelSetting {
  effectiveFrom: string;
  kmPerLitre: number;
  fuelPrice: number;
}

export const DEFAULT_FUEL_SETTINGS: FuelSetting[] = [
  { effectiveFrom: '0000-01-01', kmPerLitre: DEFAULT_KM_PER_LITRE, fuelPrice: DEFAULT_FUEL_PRICE },
  { effectiveFrom: NEW_VAN_EFFECTIVE_FROM, kmPerLitre: 10, fuelPrice: DEFAULT_FUEL_PRICE },
];

function normalizeFuelSettings(value: unknown): FuelSetting[] | null {
  if (!Array.isArray(value)) return null;
  const settings = value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      effectiveFrom: typeof item.effectiveFrom === 'string' ? item.effectiveFrom : '',
      kmPerLitre: Number(item.kmPerLitre),
      fuelPrice: Number(item.fuelPrice),
    }))
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.effectiveFrom) && item.kmPerLitre > 0 && item.fuelPrice > 0)
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
  return settings.length > 0 ? settings : null;
}

function ensureFuelSettingHistory(settings: FuelSetting[]): FuelSetting[] {
  const baseline = settings.find((setting) => setting.effectiveFrom === '0000-01-01')
    || { effectiveFrom: '0000-01-01', kmPerLitre: DEFAULT_KM_PER_LITRE, fuelPrice: settings[0]?.fuelPrice || DEFAULT_FUEL_PRICE };
  const withBaseline = settings.some((setting) => setting.effectiveFrom === '0000-01-01')
    ? settings
    : [baseline, ...settings];
  if (withBaseline.some((setting) => setting.effectiveFrom === NEW_VAN_EFFECTIVE_FROM)) {
    return withBaseline.sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
  }
  return [
    ...withBaseline,
    { effectiveFrom: NEW_VAN_EFFECTIVE_FROM, kmPerLitre: 10, fuelPrice: baseline.fuelPrice },
  ].sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
}

export function migrateFuelSettings(value: unknown): FuelSetting[] {
  const normalized = normalizeFuelSettings(value);
  if (normalized) return ensureFuelSettingHistory(normalized);
  if (typeof value === 'object' && value !== null) {
    const legacy = value as { kmPerLitre?: unknown; fuelPrice?: unknown };
    const kmPerLitre = Number(legacy.kmPerLitre);
    const fuelPrice = Number(legacy.fuelPrice);
    if (kmPerLitre > 0 && fuelPrice > 0) {
      return ensureFuelSettingHistory([
        { effectiveFrom: '0000-01-01', kmPerLitre, fuelPrice },
      ]);
    }
  }
  return DEFAULT_FUEL_SETTINGS;
}

export function fuelSettingForDate(settings: FuelSetting[], dateValue: string): FuelSetting {
  return settings.reduce(
    (current, setting) => setting.effectiveFrom <= dateValue ? setting : current,
    settings[0] || DEFAULT_FUEL_SETTINGS[0],
  );
}

export function formatFuelSettingDate(dateValue: string): string {
  if (dateValue === '0000-01-01') return 'altijd';
  return new Date(`${dateValue}T00:00:00`).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
