import { describe, expect, it } from 'vitest';
import { MFA_SETTING_CODES } from '@endora-commerce/contracts';
import { MfaDeactivationGuardService } from './mfa-deactivation-guard.service.js';
import type { SettingsReader } from './mfa-policy-resolver.js';

/**
 * The answer `/platform/modules` asks before switching `mfa` off: is a second
 * factor currently required of administrators? Read platform-wide, as the
 * login policy reads it — and, unlike the login policy, a read that fails is
 * not taken as "no".
 */
function readerOf(values: Record<string, unknown>, reads: Array<[string, string | null]> = []): SettingsReader {
  return {
    get: async <T>(code: string, salesChannelId: string | null) => {
      reads.push([code, salesChannelId]);
      if (!(code in values)) throw new Error(`setting ${code} is not registered`);
      return values[code] as T;
    },
  };
}

describe('MfaDeactivationGuardService', () => {
  it('answers the administrator requirement, read platform-wide', async () => {
    const reads: Array<[string, string | null]> = [];
    const required = new MfaDeactivationGuardService(
      readerOf({ [MFA_SETTING_CODES.ADMIN_TOTP_ENFORCED]: true }, reads),
    );
    expect(await required.isAdminSecondFactorRequired()).toBe(true);
    expect(reads).toEqual([[MFA_SETTING_CODES.ADMIN_TOTP_ENFORCED, null]]);

    const optional = new MfaDeactivationGuardService(
      readerOf({ [MFA_SETTING_CODES.ADMIN_TOTP_ENFORCED]: false }),
    );
    expect(await optional.isAdminSecondFactorRequired()).toBe(false);
  });

  it('lets a failed read surface instead of answering "not required"', async () => {
    const guard = new MfaDeactivationGuardService(readerOf({}));
    await expect(guard.isAdminSecondFactorRequired()).rejects.toThrow('is not registered');
  });
});
