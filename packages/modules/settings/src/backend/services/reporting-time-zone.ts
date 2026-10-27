import { ERROR_CODES, REPORTING_TIME_ZONE_SETTING, isIanaTimeZone, type SettingWriteValidator } from '@endora-commerce/contracts';
import { HttpError } from '@endora-commerce/platform/http';

/**
 * `reporting.time_zone` must be a zone the runtime knows (owner decision
 * 2026-10-27, issue #465): every report that counts days in it — Projects
 * analytics today — would otherwise fail. `settings` declares the setting and
 * so answers for it, through its own validator registry.
 */
export function createReportingTimeZoneValidator(): SettingWriteValidator {
  return {
    contributorModuleId: 'settings',
    codes: [REPORTING_TIME_ZONE_SETTING],
    validate: async (input) => {
      if (!isIanaTimeZone(input.proposedValue)) {
        throw new HttpError(
          422,
          ERROR_CODES.VALIDATION_FAILED,
          'The time zone must be an IANA time zone name, such as Europe/Warsaw, or UTC.',
        );
      }
    },
  };
}
