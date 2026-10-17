import {
  AdminSearchStoredConfigurationSchema,
  ERROR_CODES,
  type SettingWriteValidator,
} from '@endora-commerce/contracts';
import { HttpError } from '@endora-commerce/platform/http';
import { validateStoredEntries } from './configuration-resolver.js';
import type { AdminSearchProviderRegistry } from './provider-registry.js';

/** The settings `admin_search` declares, by code. */
export const ADMIN_SEARCH_SETTING_CODES = {
  ENABLED: 'admin_search.enabled',
  MINIMUM_QUERY_LENGTH: 'admin_search.minimum_query_length',
  RESULTS_PER_ENTITY: 'admin_search.results_per_entity',
  ENTITY_FIELDS: 'admin_search.entity_fields',
} as const;

const RANGES: Record<string, { min: number; max: number; label: string }> = {
  [ADMIN_SEARCH_SETTING_CODES.MINIMUM_QUERY_LENGTH]: { min: 2, max: 10, label: 'Minimum search length' },
  [ADMIN_SEARCH_SETTING_CODES.RESULTS_PER_ENTITY]: { min: 1, max: 10, label: 'Results per record type' },
};

/**
 * The write rules of `admin_search`'s settings, contributed to the `settings`
 * module's validator registry (research R-6, point 2): whatever path a write
 * takes — this module's own configuration route or the generic Settings API —
 * a stored field is one a present provider offers, and the two numbers stay in
 * range (FR-002, FR-004, FR-020, FR-021, FR-028).
 */
export function createAdminSearchSettingsValidator(
  registry: Pick<AdminSearchProviderRegistry, 'listPresent'>,
): SettingWriteValidator {
  return {
    contributorModuleId: 'admin_search',
    codes: [
      ADMIN_SEARCH_SETTING_CODES.MINIMUM_QUERY_LENGTH,
      ADMIN_SEARCH_SETTING_CODES.RESULTS_PER_ENTITY,
      ADMIN_SEARCH_SETTING_CODES.ENTITY_FIELDS,
    ],
    async validate({ code, proposedValue }) {
      const range = RANGES[code];
      if (range !== undefined) {
        if (
          typeof proposedValue !== 'number' ||
          !Number.isInteger(proposedValue) ||
          proposedValue < range.min ||
          proposedValue > range.max
        ) {
          throw new HttpError(
            422,
            ERROR_CODES.VALIDATION_FAILED,
            `${range.label} must be a whole number from ${range.min} to ${range.max}.`,
            [{ path: 'value', issue: `Expected an integer from ${range.min} to ${range.max}` }],
          );
        }
        return;
      }
      if (code !== ADMIN_SEARCH_SETTING_CODES.ENTITY_FIELDS) return;
      const parsed = AdminSearchStoredConfigurationSchema.safeParse(proposedValue);
      if (!parsed.success) {
        throw new HttpError(
          422,
          ERROR_CODES.VALIDATION_FAILED,
          'The global search configuration is malformed.',
          parsed.error.issues.map((issue) => ({
            path: ['value', ...issue.path.map(String)].join('.'),
            issue: issue.message,
          })),
        );
      }
      const issues = validateStoredEntries(parsed.data.entities, registry.listPresent());
      if (issues.length > 0) {
        throw new HttpError(
          422,
          ERROR_CODES.VALIDATION_FAILED,
          'The global search configuration names a field a record type does not offer.',
          issues.map((i) => ({ path: i.path, issue: i.issue })),
        );
      }
    },
  };
}
