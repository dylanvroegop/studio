export type MeasurementOpeningIntent = 'frame-inner' | 'door';

interface MeasurementOpeningIntentContext {
  quoteId: string;
  klusId: string;
  categorySlug: string;
  jobSlug: string;
}

const STORAGE_KEY_PREFIX = 'offertehulp:auto-opening-intent';

const normalizeIntent = (value: string | null): MeasurementOpeningIntent | null => {
  if (value === 'frame-inner' || value === 'door') return value;
  return null;
};

const buildStorageKey = ({
  quoteId,
  klusId,
  categorySlug,
  jobSlug,
}: MeasurementOpeningIntentContext): string =>
  [
    STORAGE_KEY_PREFIX,
    quoteId || '',
    klusId || '',
    categorySlug || '',
    jobSlug || '',
  ].join(':');

export const setMeasurementOpeningIntent = (
  context: MeasurementOpeningIntentContext,
  intent: MeasurementOpeningIntent
): void => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(buildStorageKey(context), intent);
};

export const clearMeasurementOpeningIntent = (
  context: MeasurementOpeningIntentContext
): void => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(buildStorageKey(context));
};

export const takeMeasurementOpeningIntent = (
  context: MeasurementOpeningIntentContext
): MeasurementOpeningIntent | null => {
  if (typeof window === 'undefined') return null;
  const key = buildStorageKey(context);
  const storedValue = window.sessionStorage.getItem(key);
  return normalizeIntent(storedValue);
};
