import type { SettingsReadPort } from '@endora-commerce/platform/kernel';
import { parseStoredConfiguration } from './configuration-resolver.js';
import type { AdminSearchSettingsReader, AdminSearchSettingsSnapshot } from './search-service.js';
import { ADMIN_SEARCH_SETTING_CODES } from './settings-validator.js';

/** The manifest defaults, used when a stored value is unreadable (it never fails a search). */
export const ADMIN_SEARCH_DEFAULTS = {
  minimumQueryLength: 3,
  resultsPerEntity: 5,
} as const;

/**
 * Reads `admin_search`'s three search settings through the kernel's settings
 * port — one batch read per request, platform-wide (`null` channel: global
 * search is not channel-scoped, research R-19). The port's cache is dropped as
 * part of every settings write, so a saved change applies from the very next
 * search (FR-023, SC-004).
 */
export class AdminSearchSettings implements AdminSearchSettingsReader {
  constructor(private readonly settings: SettingsReadPort) {}

  async read(): Promise<AdminSearchSettingsSnapshot> {
    const { raw } = await this.readWithRaw();
    return raw;
  }

  /** The snapshot and the stored `entity_fields` value as read, for the configuration's version token. */
  async readWithRaw(): Promise<{ raw: AdminSearchSettingsSnapshot; storedRaw: unknown }> {
    const codes = [
      ADMIN_SEARCH_SETTING_CODES.MINIMUM_QUERY_LENGTH,
      ADMIN_SEARCH_SETTING_CODES.RESULTS_PER_ENTITY,
      ADMIN_SEARCH_SETTING_CODES.ENTITY_FIELDS,
    ];
    const values = await this.settings.getMany(codes, null);
    const value = (code: string): unknown => {
      const read = values.get(code);
      return read?.ok ? read.value : undefined;
    };
    const storedRaw = value(ADMIN_SEARCH_SETTING_CODES.ENTITY_FIELDS);
    return {
      raw: {
        minimumQueryLength: integerIn(
          value(ADMIN_SEARCH_SETTING_CODES.MINIMUM_QUERY_LENGTH),
          2,
          10,
          ADMIN_SEARCH_DEFAULTS.minimumQueryLength,
        ),
        resultsPerEntity: integerIn(
          value(ADMIN_SEARCH_SETTING_CODES.RESULTS_PER_ENTITY),
          1,
          10,
          ADMIN_SEARCH_DEFAULTS.resultsPerEntity,
        ),
        stored: parseStoredConfiguration(storedRaw),
      },
      storedRaw,
    };
  }
}

function integerIn(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}
