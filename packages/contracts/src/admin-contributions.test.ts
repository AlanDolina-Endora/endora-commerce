import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  AdminZoneContributionSchema,
  AdminZoneNameSchema,
  type AdminZoneProps,
  type SettingsSettingAfterZoneProps,
} from './admin-contributions.js';

/**
 * `settings.setting.after` — the place beside one setting on the Settings
 * screen (`specs/144-seo-search-engine-robots/contracts/admin-surfaces.md`
 * §2.3).
 *
 * The props are the contract between the `settings` module, which mounts the
 * zone once per row, and whichever module contributes beside a setting it
 * declared. The type-level cases are held by `tsc` when the package is
 * type-checked; the runtime cases are what `check:admin-zones` compares
 * contributions against.
 */
describe('the settings.setting.after zone', () => {
  it('is a declared member of the closed zone enum', () => {
    expect(AdminZoneNameSchema.options).toContain('settings.setting.after');
  });

  it('carries the setting, its owner, the channel being edited and the draft', () => {
    expectTypeOf<AdminZoneProps<'settings.setting.after'>>().toEqualTypeOf<SettingsSettingAfterZoneProps>();
    expectTypeOf<SettingsSettingAfterZoneProps>().toEqualTypeOf<{
      readonly settingCode: string;
      readonly ownerModule: string;
      readonly channelCode: string | null;
      readonly draftText: string | null;
      readonly dirty: boolean;
    }>();
  });

  it('accepts a contribution narrowed to one setting code', () => {
    const parsed = AdminZoneContributionSchema.parse({
      zone: 'settings.setting.after',
      weight: 0,
      requiredPermission: 'settings:read',
      match: { settingCode: 'seo.robots_txt_custom' },
    });
    expect(parsed.match).toEqual({ settingCode: 'seo.robots_txt_custom' });
  });
});
