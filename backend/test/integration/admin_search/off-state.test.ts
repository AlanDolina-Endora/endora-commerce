import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { expectModuleAbsent } from '../../helpers/off-state.js';

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
      ],
      adminPresence: { cookies: admin },
      settingWrite: {
        code: 'admin_search.results_per_entity',
        value: 4,
        cookies: admin,
      },
    });
  });
});
