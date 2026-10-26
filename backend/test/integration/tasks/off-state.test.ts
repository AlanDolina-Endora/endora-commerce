import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { expectModuleAbsent } from '../../helpers/off-state.js';

/**
 * `tasks` off-state — Constitution XVII item 6
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
 * `tasks` owns exactly one setting, `tasks.enabled`, which *is* its activation
 * control — the one setting that must stay writable while the module is off —
 * so no `settingWrite` is declared.
 */
describe('tasks off-state (Constitution XVII)', () => {
  let h: BackendServerHandle;
  const admin = { b2b_session: 'stub-admin-session' };
  const API = '/api/v1/admin/tasks';
  const ID = '00000000-0000-4000-8000-0000000071a5';

  beforeAll(async () => {
    h = await setupBackendServer();
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  it('positive control: the Tasks list answers while the module is on', async () => {
    const response = await h.app.inject({ method: 'GET', url: API, cookies: admin });
    expect(response.statusCode, response.body).toBe(200);
  });

  it('is absent from every surface while off, and restored after', async () => {
    // Each write probe names a Task that does not exist, or sends a body its
    // schema refuses, so the "on" phases write nothing: what is measured is
    // only whether the route claims the module is absent.
    const write = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload: unknown = {}) => ({
      method,
      url,
      cookies: admin,
      payload,
    });
    await expectModuleAbsent(h, 'tasks', {
      routes: [
        { url: API, cookies: admin },
        { url: `${API}/mine`, cookies: admin },
        { url: `${API}/lookups/assignees`, cookies: admin },
        { url: `${API}/${ID}`, cookies: admin },
        { url: `${API}/${ID}/history`, cookies: admin },
        write('POST', API),
        write('PATCH', `${API}/${ID}`, { title: 'x' }),
        write('DELETE', `${API}/${ID}`, undefined),
      ],
      adminPresence: { cookies: admin },
    });
  });
});
