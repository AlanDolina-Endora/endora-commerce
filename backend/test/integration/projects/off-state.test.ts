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
    // User Story 1's routes. Each write probe names a Project that does not
    // exist, or sends a body its schema refuses, so the "on" phases write
    // nothing: what is measured is only whether the route claims the module
    // is absent.
    const STAGE = '00000000-0000-4000-8000-0000000071a7';
    const write = (method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload: unknown = {}) => ({
      method,
      url,
      cookies: admin,
      payload,
    });
    await expectModuleAbsent(h, 'projects', {
      routes: [
        { url: API, cookies: admin },
        { url: `${API}/${ID}`, cookies: admin },
        { url: `${API}/${ID}/stage-history`, cookies: admin },
        { url: `${API}/roles`, cookies: admin },
        { url: `${API}/loss-reasons`, cookies: admin },
        write('POST', API),
        write('PATCH', `${API}/${ID}`, { title: 'x', version: 1 }),
        write('DELETE', `${API}/${ID}`, undefined),
        write('PUT', `${API}/${ID}/organizations`, { organizationIds: [] }),
        write('PUT', `${API}/${ID}/members`, { members: [] }),
        write('POST', `${API}/${ID}/stages`, { name: 'x', color: '#000000' }),
        write('PATCH', `${API}/${ID}/stages/${STAGE}`, { name: 'x' }),
        write('DELETE', `${API}/${ID}/stages/${STAGE}`, undefined),
        write('PUT', `${API}/${ID}/stages/order`, { stageIds: [STAGE] }),
        write('PUT', `${API}/${ID}/moves`, { moves: [] }),
        write('POST', `${API}/${ID}/move`, { toStageId: STAGE, version: 1 }),
        write('POST', `${API}/${ID}/close`, { outcome: 'completed', version: 1 }),
        write('POST', `${API}/${ID}/reopen`, { version: 1 }),
        // User Story 2's routes.
        { url: `${API}/${ID}/tasks`, cookies: admin },
        write('PUT', `${API}/${ID}/stages/${STAGE}/tasks`, { tasks: [] }),
        write('POST', `${API}/${ID}/stages/${STAGE}/materialize-tasks`),
        // User Story 3's routes — Templates; the write probes name a Template
        // that does not exist or send a body the schema refuses.
        { url: `${API}/templates`, cookies: admin },
        { url: `${API}/templates/${ID}`, cookies: admin },
        write('POST', `${API}/templates`, { name: '' }),
        write('PUT', `${API}/templates/${ID}`, { name: '' }),
        write('POST', `${API}/templates/${ID}/duplicate`),
        write('POST', `${API}/templates/${ID}/archive`),
        write('POST', `${API}/templates/${ID}/restore`),
        // User Story 4's writes — Project Roles and loss reasons. Each names an
        // entry that does not exist, or sends a body the schema refuses.
        ...(['roles', 'loss-reasons'] as const).flatMap((dictionary) => [
          write('POST', `${API}/${dictionary}`, { defaultName: '' }),
          write('PATCH', `${API}/${dictionary}/${ID}`, { defaultName: 'x' }),
          write('POST', `${API}/${dictionary}/${ID}/archive`),
          write('POST', `${API}/${dictionary}/${ID}/restore`),
          write('DELETE', `${API}/${dictionary}/${ID}`, undefined),
        ]),
        // User Story 5's routes — the pickers' lookups and the visibility setting.
        { url: `${API}/lookups/organizations`, cookies: admin },
        { url: `${API}/lookups/admin-users`, cookies: admin },
        { url: `${API}/visibility-setting`, cookies: admin },
      ],
      adminPresence: { cookies: admin },
      settingWrite: { code: 'projects.visibility', value: 'everyone', cookies: admin },
    });
  });
});
