import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REGISTERED_MANIFESTS } from '../../../src/lifecycle/registered-manifests.js';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { withModuleOff } from '../../helpers/off-state.js';

/**
 * `pwa`'s **server-side** off-state, for the surface feature 091's Phase 4
 * batch six moved into its package.
 *
 * The admin half is `admin/test/modules/pwa.module-owned-surface.test.tsx`,
 * which drives the sidebar entry across the four cases. What that file cannot
 * see is the **palette**: Principle XVII item 5 lists a palette action among
 * the surfaces a switched-off module must not contribute, and the Actions group
 * is resolved *here* — by the server, from the manifests, against the effective
 * enabled-set.
 *
 * **`pwa` declared no action until `specs/149-pwa-order-status-push/`**, and
 * this file used to derive that absence from the manifest and require the
 * registry to agree in both states — with a message asking whoever gave the
 * module an action to assert its off-state here rather than delete the file.
 * That is what this is now: the manifest declares exactly one action,
 * `open-settings` (Principle XVI), the registry advertises it while `pwa` is
 * on, and withdraws it while `pwa` is off.
 *
 * The positive control comes first and is about a **different** module: an
 * absent answer for `pwa` while it is off proves nothing until the registry has
 * been seen answering somebody in that same state.
 *
 * `pwa` is switchable — `activation: { settingCode: 'pwa.enabled', default: true }`
 * — so the operator axis is driven here for real rather than asserted to be
 * inert.
 */
describe('pwa contributes its palette action only while on (Principle XVII item 5)', () => {
  let h: BackendServerHandle;
  const admin = { b2b_session: 'stub-admin-session' };

  beforeAll(async () => {
    h = await setupBackendServer();
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  /** Every action the palette registry advertises, grouped by owner. */
  const actionsByModule = async (): Promise<Map<string, string[]>> => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/api/v1/admin/admin-actions?language=en',
      cookies: admin,
    });
    expect(res.statusCode, 'the palette registry must answer').toBe(200);
    // The envelope wraps the paged payload, so the rows are one level deeper
    // than an ordinary list route's.
    const body = res.json() as { data: { data: { actionId: string; moduleId: string }[] } };
    const grouped = new Map<string, string[]>();
    for (const action of body.data.data) {
      grouped.set(action.moduleId, [...(grouped.get(action.moduleId) ?? []), action.actionId]);
    }
    return grouped;
  };

  it('declares exactly one action in its manifest — the screen, under ⌘K', () => {
    // Read from the manifest, not written down twice: this is the fact the
    // assertions below rest on.
    const manifest = REGISTERED_MANIFESTS.find((entry) => entry.manifest.id === 'pwa')?.manifest;
    expect(manifest, 'pwa is not a registered module').toBeDefined();
    expect((manifest?.actions ?? []).map((action) => action.id)).toEqual(['open-settings']);
  });

  it('advertises it while on', async () => {
    const grouped = await actionsByModule();
    expect(grouped.get('pwa') ?? []).toContain('open-settings');
  });

  it('withdraws it while deactivated, and the flip really took', async () => {
    // The operator axis — the one an operator actually creates, and the one a
    // platform-availability flip would hide. `withModuleOff` asserts the module
    // is genuinely absent before the body observes anything (issue #141).
    await withModuleOff('pwa', 'deactivated', async () => {
      const grouped = await actionsByModule();
      // Still a live registry while `pwa` is off, so the empty answer is about
      // this module and not about the endpoint. `analytics` declares one action.
      expect(grouped.get('analytics'), 'the palette advertises nothing at all').toBeDefined();
      expect(grouped.get('pwa') ?? []).toEqual([]);
    });
  });

  it('advertises it again once restored', async () => {
    const grouped = await actionsByModule();
    expect(grouped.get('pwa') ?? []).toContain('open-settings');
  });
});
