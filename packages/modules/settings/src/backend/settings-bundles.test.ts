import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The Settings screen reads a group's heading and a setting's name from the
 * owner module's own bundle (`settingGroups.<group>.name`,
 * `settingLabels.<code>.name|description`, `admin/components/setting-label.ts`)
 * and falls back to the manifest's English. The `general` group holds the
 * reporting time zone, which the Polish Projects docs point an operator to by
 * the group's Polish name (T146 follow-up).
 */
describe('settings bundles', () => {
  const bundle = (language: string): Record<string, string> =>
    JSON.parse(readFileSync(new URL(`../../i18n/${language}.json`, import.meta.url), 'utf8')) as Record<string, string>;

  it.each([
    ['en', 'General'],
    ['pl', 'Ogólne'],
  ])('%s names the general group and the reporting time zone', (language, general) => {
    const entries = bundle(language);
    expect(entries['settingGroups.general.name']).toBe(general);
    expect(entries['settingLabels.reporting.time_zone.name']).toEqual(expect.stringMatching(/\S/));
    expect(entries['settingLabels.reporting.time_zone.description']).toEqual(expect.stringMatching(/\S/));
  });
});
