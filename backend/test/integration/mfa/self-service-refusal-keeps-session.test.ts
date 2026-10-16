import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TOTP, Secret } from 'otpauth';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';

/**
 * Issue #244 — a wrong confirmation on the signed-in MFA self-service routes is
 * a refusal of that confirmation, not of the session.
 *
 * The routes answered `401` — `MFA_INVALID_CODE` for a wrong code,
 * `INVALID_CREDENTIALS` for a wrong password. The Admin UI treats every `401`
 * as an expired session and signs the administrator out, so a typo while
 * confirming 2FA setup, disabling it or regenerating recovery codes ended the
 * session instead of showing an error. They now answer `403` with a typed code,
 * as #215 does for the same situation on the profile screen, and the session
 * keeps working.
 *
 * The refusals before a session exists — the login challenge and enrolment
 * during sign-in — are not this file's subject and keep their `401`.
 */
const ADMIN_COOKIE = { b2b_admin_session: 'stub-admin-session' };

function totpCode(secretBase32: string): string {
  return new TOTP({
    issuer: 'B2B Platform',
    label: 'verify',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  }).generate();
}

interface ErrorBody {
  error: { code: string };
}

describe('MFA self-service — a wrong confirmation keeps the session (issue #244)', () => {
  let h: BackendServerHandle;
  let secret: string;
  // A remote address per step, so the authentication throttle never decides a case.
  let address = 0;

  const post = (path: string, payload?: Record<string, string>) =>
    h.app.inject({
      method: 'POST',
      url: `/api/v1/admin/account/mfa/${path}`,
      cookies: ADMIN_COOKIE,
      remoteAddress: `203.0.113.${(address += 1)}`,
      ...(payload ? { payload } : {}),
    });

  /** The session still works: the status read answers, and says what is true. */
  const expectSignedInWith = async (totpActive: boolean): Promise<void> => {
    const status = await h.app.inject({
      method: 'GET',
      url: '/api/v1/admin/account/mfa/status',
      cookies: ADMIN_COOKIE,
    });
    expect(status.statusCode, status.body).toBe(200);
    expect((status.json() as { data: { totpActive: boolean } }).data.totpActive).toBe(totpActive);
  };

  const expectRefused = (res: { statusCode: number; body: string; json(): unknown }, code: string): void => {
    expect(res.statusCode, res.body).toBe(403);
    expect((res.json() as ErrorBody).error.code).toBe(code);
  };

  beforeAll(async () => {
    h = await setupBackendServer();
    await h.settings.adminService.setValueForAllChannels('mfa.admin.totp_enabled', true, null, {
      actorAdminUserId: null,
    });
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  it('a wrong code while confirming setup is refused with 403, and setup can still be confirmed', async () => {
    const setup = await post('setup');
    expect(setup.statusCode, setup.body).toBe(200);
    secret = (setup.json() as { data: { secret: string } }).data.secret;

    expectRefused(await post('activate', { code: '000000' }), 'MFA_INVALID_CODE');
    await expectSignedInWith(false);

    const activated = await post('activate', { code: totpCode(secret) });
    expect(activated.statusCode, activated.body).toBe(200);
    await expectSignedInWith(true);
  });

  it('a wrong code while regenerating recovery codes is refused with 403', async () => {
    expectRefused(await post('recovery-codes/regenerate', { code: '000000' }), 'MFA_INVALID_CODE');
    await expectSignedInWith(true);
  });

  it('a wrong code while disabling is refused with 403', async () => {
    expectRefused(await post('disable', { code: '000000' }), 'MFA_INVALID_CODE');
    await expectSignedInWith(true);
  });

  it('a wrong password while disabling is refused with 403 CURRENT_PASSWORD_INVALID', async () => {
    expectRefused(await post('disable', { password: 'not-the-password' }), 'CURRENT_PASSWORD_INVALID');
    await expectSignedInWith(true);
  });
});
