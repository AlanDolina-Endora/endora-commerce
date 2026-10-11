import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { expectModuleAbsent, withModuleOff, type OffStateAxis } from '../../helpers/off-state.js';

/**
 * `seo` off-state — Constitution XVII item 6.
 *
 * The module's prior off-state coverage is
 * `_admin_surfaces/batch-eight-palette-off-state.test.ts`, which asserts that a
 * module declaring no palette action advertises none while off. That is
 * feature 091's question; item 6's are here, and the palette assertion is not
 * repeated.
 *
 * The four surfaces item 6 asks for map onto this module as follows:
 *
 *  * **API rejection** — the admin per-channel sitemap listing and a
 *    regeneration write. Both halves are named because a listing that keeps
 *    answering renders a screen an operator can believe is live, while a write
 *    that lands republishes a document for a capability they withdrew;
 *  * **storefront absence** — `GET /api/v1/catalog/sitemap.xml`, asserted in
 *    the second test below rather than through the harness, for a reason given
 *    there;
 *  * **admin absence** — the presence projection both frontends gate on, plus
 *    the `/admin-roles` permission catalogue the harness sweeps unasked;
 *  * **restoration** — asserted by the harness after both axes. Off is
 *    non-destructive: generated sitemaps and every per-entity meta override
 *    stay, and the restored probes hold the routes to it;
 *  * **non-editable configuration** — `seo.default_robots`
 *    (`specs/144-seo-search-engine-robots/`, FR-032), in the third test below
 *    and not through the harness's `settingWrite`: that probe sends a body the
 *    settings API refuses for its shape whatever the module's state, so a
 *    refusal there would not be the off state's. The third test sends a write
 *    the API accepts while the module is on and names the code it is refused
 *    with while off. `seo.enabled` is the module's activation control — the
 *    single exception — and is driven by nothing here.
 *
 * The **deactivated-while-platform-available** case is the first axis the
 * harness drives, and it is the one an operator creates: withdrawing sitemap
 * publication from `/platform/modules` never touches the lifecycle registry.
 */
describe('seo off-state (Constitution XVII)', () => {
  let h: BackendServerHandle;
  const admin = { b2b_session: 'stub-admin-session' };
  const channel = { 'x-sales-channel': 'default' };

  beforeAll(async () => {
    h = await setupBackendServer();
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  it('is absent from every admin surface while off, on both axes, and restored after', async () => {
    await expectModuleAbsent(h, 'seo', {
      routes: [
        { url: '/api/v1/admin/seo/sitemap', cookies: admin },
        // The storefront's question about a channel's default robots. Refused
        // like any other route of an absent module: the storefront reads
        // `MODULE_DISABLED` as "this feature does not exist" and applies no
        // policy, which is a different answer from "no restriction" at `200`.
        { url: '/api/v1/storefront/seo/robots-policy', headers: channel },
        {
          method: 'POST',
          url: '/api/v1/admin/seo/sitemap/default/regenerate',
          cookies: admin,
          payload: {},
        },
      ],
      adminPresence: { cookies: admin },
    });
  });

  /**
   * The storefront surface, asserted here rather than in the harness's `routes`
   * list — and the reason is a property of the route, not a preference.
   *
   * `GET /api/v1/catalog/sitemap.xml` answers `application/xml` on **every**
   * path it takes, including its own no-channel path, which is a 503 carrying
   * an empty `<urlset/>`. The harness reads `res.json()` on each probe in every
   * phase, so an XML body would throw a parse error before any assertion ran,
   * and a 503 that means "no channel resolved" is indistinguishable by status
   * code from the 503 that means "the module is off". So this asserts on the
   * **body**: XML while the module is on, the JSON `MODULE_DISABLED` envelope
   * the platform's error handler produces while it is off.
   *
   * Both axes are driven, and the operator one first — the same order and the
   * same reason as the harness's.
   */
  it.each<OffStateAxis>(['deactivated', 'platform-unavailable'])(
    'stops serving the storefront sitemap while off (%s), and serves it again after',
    async (axis) => {
      const sitemap = async () =>
        h.app.inject({ method: 'GET', url: '/api/v1/catalog/sitemap.xml', headers: channel });

      // Positive control: without it an always-broken route would read as a
      // successful absence.
      const before = await sitemap();
      expect(String(before.headers['content-type'])).toContain('xml');
      expect(before.body.startsWith('<?xml')).toBe(true);

      await withModuleOff('seo', axis, async () => {
        const off = await sitemap();
        expect(off.statusCode, 'the sitemap must refuse while seo is off').toBe(503);
        expect(
          (JSON.parse(off.body) as { error?: { code?: string } }).error?.code,
          'the sitemap must carry the MODULE_DISABLED envelope, not an empty urlset',
        ).toBe('MODULE_DISABLED');
        expect(off.headers['retry-after']).toBe('60');
      });

      const after = await sitemap();
      expect(String(after.headers['content-type'])).toContain('xml');
      expect(after.body.startsWith('<?xml')).toBe(true);
    },
  );

  /**
   * *Default robots* while the module is off, and after
   * (`specs/144-seo-search-engine-robots/`, FR-030, FR-032, FR-034).
   *
   * The deactivated-while-platform-available case, because it is the one an
   * operator creates. Four things are held, and the order matters: the value is
   * stored and served first, so that every later assertion is about a module
   * that had something to withdraw.
   *
   *  1. the storefront's endpoint stops answering the policy — a `503`
   *     `MODULE_DISABLED`, not a `200` saying "no restriction";
   *  2. the setting is reported `editable: false`, and a write and a reset are
   *     both refused with the code that says why;
   *  3. the stored value survives all of that untouched;
   *  4. switching the module back on serves the stored value again, with no
   *     write in between.
   */
  it('withdraws the default robots policy while off, keeps the stored value, and serves it again after', async () => {
    const SETTING = '/api/v1/admin/settings/seo.default_robots';
    const policy = async () =>
      h.app.inject({ method: 'GET', url: '/api/v1/storefront/seo/robots-policy', headers: channel });
    /** The setting as the Settings screen reads it: editability, and what is stored. */
    const detail = async () => {
      const body = (await h.app.inject({ method: 'GET', url: SETTING, cookies: admin })).json() as {
        editable: boolean;
        globalValue: unknown;
        valuesByChannel: { salesChannelCode: string; value: unknown; updatedAt: string }[];
      };
      return {
        editable: body.editable,
        values: { global: body.globalValue, byChannel: body.valuesByChannel },
      };
    };

    const stored = await h.app.inject({
      method: 'PUT',
      url: `${SETTING}/value`,
      cookies: admin,
      payload: { scope: 'subset', salesChannelCodes: ['default'], value: 'NOINDEX, NOFOLLOW' },
    });
    expect(stored.statusCode, stored.body).toBe(200);

    try {
      // Positive control.
      const on = await policy();
      expect(on.statusCode).toBe(200);
      expect(on.json()).toEqual({ data: { index: false, follow: false } });
      expect((await detail()).editable).toBe(true);
      const valuesWhileOn = (await detail()).values;
      expect(valuesWhileOn.global).toBeNull();
      expect(valuesWhileOn.byChannel).toEqual([
        expect.objectContaining({ salesChannelCode: 'default', value: 'NOINDEX, NOFOLLOW' }),
      ]);

      await withModuleOff('seo', 'deactivated', async () => {
        const off = await policy();
        expect(off.statusCode, 'the policy endpoint must refuse while seo is off').toBe(503);
        expect((off.json() as { error?: { code?: string } }).error?.code).toBe('MODULE_DISABLED');

        const whileOff = await detail();
        expect(whileOff.editable, 'the setting must be read-only while seo is off').toBe(false);
        expect(whileOff.values, 'the stored value must still be shown').toEqual(valuesWhileOn);

        const write = await h.app.inject({
          method: 'PUT',
          url: `${SETTING}/value`,
          cookies: admin,
          payload: { scope: 'subset', salesChannelCodes: ['default'], value: 'INDEX, FOLLOW' },
        });
        expect(write.statusCode).toBe(400);
        expect((write.json() as { error: { code: string } }).error.code).toBe(
          'MODULE_SETTING_READ_ONLY',
        );

        const reset = await h.app.inject({
          method: 'DELETE',
          url: `${SETTING}/values?salesChannelCodes=default`,
          cookies: admin,
        });
        expect(reset.statusCode).toBe(400);
        expect((reset.json() as { error: { code: string } }).error.code).toBe(
          'MODULE_SETTING_READ_ONLY',
        );

        expect((await detail()).values, 'a refused write must change nothing').toEqual(
          valuesWhileOn,
        );
      });

      const back = await policy();
      expect(back.statusCode).toBe(200);
      expect(back.json(), 'the stored value must be served again, unchanged').toEqual({
        data: { index: false, follow: false },
      });
      expect((await detail()).editable).toBe(true);
    } finally {
      await h.app.inject({
        method: 'DELETE',
        url: `${SETTING}/values?salesChannelCodes=default`,
        cookies: admin,
      });
    }
  });
});
