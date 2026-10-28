import { ApiError } from '@endora-commerce/admin-kit/lib';

/** What a cell shows when there is nothing to show. */
export const NO_VALUE = '—';

/**
 * The sentence to show for a failed call.
 *
 * The backend already resolved `error.message` in the reader's language, so it
 * is shown as it arrived. `fallback` is for a failure that never produced an
 * envelope.
 */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.envelope.error.message : fallback;
}

/** A `YYYY-MM-DD` calendar date in the reader's locale, without a time-zone shift. */
export function calendarDateLabel(date: string | null | undefined, language: string): string {
  if (!date) return NO_VALUE;
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return new Date(year, month - 1, day).toLocaleDateString(language);
}

const SIZE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;

/** A file size as a person reads it — `512 B`, `2.5 MB` — in the language on screen (Projects' helper). */
export function fileSizeLabel(bytes: number, language: string): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return new Intl.NumberFormat(language, {
    style: 'unit',
    unit: SIZE_UNITS[unit] as string,
    unitDisplay: 'short',
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
}
