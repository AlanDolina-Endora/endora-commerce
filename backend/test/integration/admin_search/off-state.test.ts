import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { expectModuleAbsent, withModuleOff } from '../../helpers/off-state.js';

/**
 * `admin_search` off-state — Constitution XVII item 6
 * (`specs/150-admin-global-search/` FR-031, SC-005, T014).
 *
 * The positive control comes first inside `expectModuleAbsent`: every route
 * answers before the module is switched off, so an always-broken route cannot
 * read as a successful absence. Then both axes — deactivated while the
 * platform still offers the module, and platform-unavailable — and full
 * restoration after each.
 */
describe('admin_search off-state (Constitution XVII)', () => {
  let h: BackendServerHandle;
  const admin = { b2b_session: 'stub-admin-session' };

  beforeAll(async () => {
    h = await setupBackendServer();
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  it('is absent from every surface while off, and restored after', async () => {
    await expectModuleAbsent(h, 'admin_search', {
      routes: [
        { url: '/api/v1/admin/global-search/capability?language=en', cookies: admin },
        { url: '/api/v1/admin/global-search?q=acme&language=en', cookies: admin },
        { url: '/api/v1/admin/global-search/configuration?language=en', cookies: admin },
        {
          method: 'PUT',
          url: '/api/v1/admin/global-search/configuration?language=en',
          cookies: admin,
          payload: { expectedVersion: null, entities: [] },
        },
      ],
      adminPresence: { cookies: admin },
      settingWrite: {
        code: 'admin_search.results_per_entity',
        value: 4,
        cookies: admin,
      },
    });
  });

  /**
   * The admin surfaces: both palette actions leave ⌘K with the module (the
   * routes and the sidebar entry go with its presence in the projection
   * `expectModuleAbsent` asserts above), and come back with it.
   */
  it("withdraws both palette actions while off, and restores them", async () => {
    const actionIds = async (): Promise<string[]> => {
      const res = await h.app.inject({ method: 'GET', url: '/api/v1/admin/admin-actions?language=en', cookies: admin });
      expect(res.statusCode).toBe(200);
      return (res.json() as { data: { data: Array<{ moduleId: string; actionId: string }> } }).data.data.map(
        (a) => `${a.moduleId}.${a.actionId}`,
      );
    };
    const ours = ['admin_search.open-global-search', 'admin_search.open-global-search-configuration'];
    expect(await actionIds()).toEqual(expect.arrayContaining(ours));
    await withModuleOff('admin_search', 'deactivated', async () => {
      const listed = await actionIds();
      for (const id of ours) expect(listed).not.toContain(id);
    });
    expect(await actionIds()).toEqual(expect.arrayContaining(ours));
  });
});
