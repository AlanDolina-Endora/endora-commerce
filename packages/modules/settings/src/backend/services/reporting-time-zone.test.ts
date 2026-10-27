import { REPORTING_TIME_ZONE_SETTING, type SettingWriteValidationInput } from '@endora-commerce/contracts';
import { describe, expect, it } from 'vitest';
import { createReportingTimeZoneValidator } from './reporting-time-zone.js';

/**
 * `reporting.time_zone` — the calendar reports count days in (owner decision
 * 2026-10-27, issue #465). Owned by `settings`, so no reporting module owns
 * it; it must be a zone the runtime knows, or every report would fail.
 */
describe('the reporting time zone validator', () => {
  const validator = createReportingTimeZoneValidator();
  const input = (proposedValue: unknown): SettingWriteValidationInput => ({
    code: REPORTING_TIME_ZONE_SETTING,
    ownerModuleId: 'settings',
    proposedValue,
    projection: [],
    targetedChannelIds: [],
  });

  it('answers for reporting.time_zone, as settings', () => {
    expect(REPORTING_TIME_ZONE_SETTING).toBe('reporting.time_zone');
    expect(validator).toMatchObject({ contributorModuleId: 'settings', codes: ['reporting.time_zone'] });
  });

  it('accepts UTC and IANA zones', async () => {
    for (const zone of ['UTC', 'Europe/Warsaw', 'America/New_York']) {
      await expect(validator.validate(input(zone))).resolves.toBeUndefined();
    }
  });

  it('refuses anything else with 422 VALIDATION_FAILED', async () => {
    for (const value of ['Mars/Olympus_Mons', '', 'europe/warsaw ', 42, null]) {
      await expect(validator.validate(input(value))).rejects.toMatchObject({
        statusCode: 422,
        code: 'VALIDATION_FAILED',
      });
    }
  });
});
