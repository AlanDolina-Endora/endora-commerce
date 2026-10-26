import { ERROR_CODES, type SettingWriteValidator } from '@endora-commerce/contracts';
import { HttpError } from '@endora-commerce/platform/http';
import { PROJECTS_ALERTS_TIME_ZONE_SETTING } from './project-read-service.js';

/**
 * `projects.alerts_time_zone` must be a time zone the runtime knows
 * (`Intl.supportedValuesOf('timeZone')`, plus `UTC`): "today" for every Stage
 * entry, deadline and list read is counted in it, and an unknown zone would
 * make each of them fail (`todayIn` throws a `RangeError`). Pulled forward
 * from T118 into User Story 2.
 */
export function isKnownTimeZone(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (value === 'UTC') return true;
  return supportedZones().has(value);
}

let zones: Set<string> | null = null;
function supportedZones(): Set<string> {
  zones ??= new Set(Intl.supportedValuesOf('timeZone'));
  return zones;
}

export function createAlertsTimeZoneValidator(): SettingWriteValidator {
  return {
    contributorModuleId: 'projects',
    codes: [PROJECTS_ALERTS_TIME_ZONE_SETTING],
    validate: async (input) => {
      if (!isKnownTimeZone(input.proposedValue)) {
        throw new HttpError(
          422,
          ERROR_CODES.VALIDATION_FAILED,
          'The time zone must be an IANA time zone name, such as Europe/Warsaw.',
        );
      }
    },
  };
}
