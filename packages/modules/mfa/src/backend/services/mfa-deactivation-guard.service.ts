import { z } from 'zod';
import { MFA_SETTING_CODES, type MfaDeactivationGuardPort } from '@endora-commerce/contracts';
import type { SettingsReader } from './mfa-policy-resolver.js';

/**
 * Whether switching this module off would withdraw a second factor the platform
 * requires of administrators — the question `/platform/modules` asks before an
 * operator switches `mfa` off.
 *
 * The requirement is `mfa.admin.totp_enforced`, read platform-wide (`null`),
 * exactly as `MfaPolicyResolver` reads it at sign-in. The resolver answers
 * `false` for a read that throws, which suits a login that must not fail on a
 * missing setting; here the same `false` would let the switch-off through on a
 * question nobody answered, so the error is left to surface and the flip is
 * refused with it.
 */
export class MfaDeactivationGuardService implements MfaDeactivationGuardPort {
  constructor(private readonly settings: SettingsReader) {}

  async isAdminSecondFactorRequired(): Promise<boolean> {
    return this.settings.get(MFA_SETTING_CODES.ADMIN_TOTP_ENFORCED, null, z.boolean());
  }
}
