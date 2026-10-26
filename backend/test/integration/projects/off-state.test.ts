import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { expectModuleAbsent } from '../../helpers/off-state.js';

/**
 * `projects` off-state — Constitution XVII item 6
 * (`specs/163-projects-and-tasks/contracts/admin-surfaces.md`).
 *
 * Every route of the module is registered through `ctx.routes`, so the gate is
 * applied at the registration seam; this file measures it on both axes —
 * deactivated while platform-available, and platform-unavailable — with full
 * restoration after each. Each story that adds a route adds it below.
 *
 * **Storefront absence** is answered here rather than probed: the module has no
 * storefront route and contributes no storefront element (FR-043).
 *
 * The configuration half is driven over `projects.visibility`, an ordinary
 * module setting, because the activation control itself is the one setting
 * that must stay writable while the module is off.
 */
describe('projects off-state (Constitution XVII)', () => {
  let h: BackendServerHandle;
  const admin = { b2b_session: 'stub-admin-session' };
  const API = '/api/v1/admin/projects';
  const ID = '00000000-0000-4000-8000-0000000071a6';

  beforeAll(async () => {
    h = await setupBackendServer();
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  it('positive control: the Projects list answers while the module is on', async () => {
    const response = await h.app.inject({ method: 'GET', url: API, cookies: admin });
    expect(response.statusCode, response.body).toBe(200);
  });

  it('positive control: the visibility setting is writable while the module is on', async () => {
    const response = await h.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings/projects.visibility/value',
      cookies: admin,
      payload: { scope: 'all', value: 'members' },
    });
    expect(response.statusCode, response.body).toBeLessThan(400);
  });

  it('is absent from every surface while off, and restored after', async () => {
    await expectModuleAbsent(h, 'projects', {
      routes: [
        { url: API, cookies: admin },
        { url: `${API}/${ID}`, cookies: admin },
      ],
      adminPresence: { cookies: admin },
      settingWrite: { code: 'projects.visibility', value: 'everyone', cookies: admin },
    });
  });
});
