import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';

/**
 * Switching `mfa` off withdraws every second factor, and with it the platform's
 * requirement that administrators sign in with one. While that requirement is
 * on (`mfa.admin.totp_enforced`), `POST /api/v1/admin/modules/mfa/activation`
 * refuses the switch-off with 409 `MFA_DEACTIVATION_BLOCKED` and changes
 * nothing; the operator turns the requirement off first, as a separate,
 * deliberate change, and the switch-off then goes through as before.
 */
const ADMIN = { b2b_session: 'stub-admin-session' };
const ENFORCED = 'mfa.admin.totp_enforced';

describe('switching mfa off while administrators are required to use a second factor', () => {
  let h: BackendServerHandle;

  const setEnforced = async (value: boolean) => {
    const res = await h.app.inject({
      method: 'PUT',
      url: `/api/v1/admin/settings/${ENFORCED}/value`,
      cookies: ADMIN,
      payload: { scope: 'all', value },
    });
    expect(res.statusCode).toBe(200);
  };

  const flip = (active: boolean) =>
    h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/modules/mfa/activation',
      cookies: ADMIN,
      payload: { active },
    });

  const mfaPresent = async (): Promise<boolean> => {
    const res = await h.app.inject({ method: 'GET', url: '/api/v1/admin/module-presence', cookies: ADMIN });
    const entry = (res.json() as { modules: Array<{ id: string; present: boolean }> }).modules.find(
      (m) => m.id === 'mfa',
    );
    return entry?.present === true;
  };

  beforeAll(async () => {
    h = await setupBackendServer();
  });

  afterAll(async () => {
    await flip(true);
    await setEnforced(false);
    await teardownBackendServer(h);
  });

  it('is refused, and mfa stays on', async () => {
    await setEnforced(true);

    const res = await flip(false);
    expect(res.statusCode).toBe(409);
    const error = res.json().error as { code: string; details: Record<string, unknown> };
    expect(error.code).toBe('MFA_DEACTIVATION_BLOCKED');
    expect(error.details).toMatchObject({ setting: ENFORCED });
    expect(await mfaPresent()).toBe(true);
  });

  it('goes through once the requirement is turned off', async () => {
    await setEnforced(false);

    const res = await flip(false);
    expect(res.statusCode).toBe(200);
    expect(await mfaPresent()).toBe(false);

    const back = await flip(true);
    expect(back.statusCode).toBe(200);
    expect(await mfaPresent()).toBe(true);
  });
});
