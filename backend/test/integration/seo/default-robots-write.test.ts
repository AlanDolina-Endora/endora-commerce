import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@endora-commerce/contracts';
import { AuditLogEntry, Setting, hashPassword } from '@endora-commerce/platform/kernel';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { AdminUser } from '../../helpers/package-entities.js';
import { STUB_CUSTOMER_PASSWORD } from '../../helpers/seed-organizations.js';
import { TEST_ADMIN_ID } from '../../helpers/test-actors.js';

/**
 * Who may change *Default robots*, to what, and what is recorded
 * (`specs/144-seo-search-engine-robots/` FR-003, FR-007).
 *
 * `seo` adds no write of its own: the value is written through the settings
 * API every setting is written through. What this file holds is that the
 * declaration `seo` made is enough for that API to refuse the three things an
 * indexing switch must refuse — a reader changing it, a value outside the
 * list, and a change nobody can be asked about afterwards.
 */
describe('seo.default_robots — writes', () => {
  let h: BackendServerHandle;
  const admin = { b2b_session: 'stub-admin-session' };
  /** Holds `settings:read` and nothing else — seeded below. */
  const reader = { b2b_session: 'stub-settings-viewer-session' };
  const SETTINGS_VIEWER_ID = '00000000-0000-4000-8000-0000000000d1';
  const VALUE_URL = '/api/v1/admin/settings/seo.default_robots/value';

  beforeAll(async () => {
    h = await setupBackendServer();
    const role = await h.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/admin-roles/robots_settings_reader',
      cookies: admin,
      payload: {
        code: 'robots_settings_reader',
        name: 'Settings reader',
        permissions: ['settings:read'],
      },
    });
    expect(role.statusCode, role.body).toBe(200);
    const adminRoleId = (role.json() as { data: { id: string } }).data.id;
    const em = h.em();
    // The stub session is bound to this id, and another file may have seeded
    // the same administrator with a different role.
    const existing = await em.findOne(AdminUser, { id: SETTINGS_VIEWER_ID });
    if (existing) {
      existing.adminRoleId = adminRoleId;
    } else {
      em.create(AdminUser, {
        id: SETTINGS_VIEWER_ID,
        email: 'robots-settings-reader@example.com',
        passwordHash: await hashPassword(STUB_CUSTOMER_PASSWORD),
        firstName: 'Settings',
        lastName: 'Reader',
        adminRoleId,
        status: 'active',
      });
    }
    await em.flush();
  });

  afterEach(async () => {
    await h.app.inject({
      method: 'DELETE',
      url: '/api/v1/admin/settings/seo.default_robots/values',
      cookies: admin,
    });
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  const storedGlobalValue = async (): Promise<unknown> =>
    (await h.em().findOneOrFail(Setting, { code: 'seo.default_robots' })).globalValue ?? null;

  const policy = async (): Promise<unknown> =>
    (
      (await h.app.inject({ method: 'GET', url: '/api/v1/storefront/seo/robots-policy' }).then(
        (res) => res.json(),
      )) as { data: unknown }
    ).data;

  it('lets a settings reader see the setting, its choices and its default', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/api/v1/admin/settings/seo.default_robots',
      cookies: reader,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      code: 'seo.default_robots',
      ownerModule: 'seo',
      valueType: 'string',
      defaultValue: 'INDEX, FOLLOW',
      enumOptions: ['INDEX, FOLLOW', 'NOINDEX, FOLLOW', 'INDEX, NOFOLLOW', 'NOINDEX, NOFOLLOW'],
      editable: true,
    });
  });

  it('refuses a write by an administrator who may only read settings', async () => {
    const res = await h.app.inject({
      method: 'PUT',
      url: VALUE_URL,
      cookies: reader,
      payload: { scope: 'all', value: 'NOINDEX, NOFOLLOW' },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: { code: string } }).error.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(await storedGlobalValue()).toBeNull();
    expect(await policy()).toEqual({ index: true, follow: true });
  });

  it('refuses a write with no session at all', async () => {
    const res = await h.app.inject({
      method: 'PUT',
      url: VALUE_URL,
      payload: { scope: 'all', value: 'NOINDEX, NOFOLLOW' },
    });
    expect(res.statusCode).toBe(401);
    expect(await storedGlobalValue()).toBeNull();
  });

  it.each([
    ['a directive that is not on the list', 'NOINDEX'],
    ['a listed directive in another spelling', 'noindex, nofollow'],
    ['free text', 'please do not index this shop'],
    ['the empty string', ''],
  ])('refuses %s', async (_label, value) => {
    const res = await h.app.inject({
      method: 'PUT',
      url: VALUE_URL,
      cookies: admin,
      payload: { scope: 'all', value },
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(await storedGlobalValue()).toBeNull();
    expect(await policy()).toEqual({ index: true, follow: true });
  });

  /**
   * FR-007 asks for "who changed it, when, and the value before and after".
   *
   * The settings write path records who, when and the value **after**; it does
   * not record `stateBefore` for a value write, for any setting of any module.
   * This case holds what is recorded and holds it exactly, so that the missing
   * half is a stated gap of the settings store and not something this file
   * appears to cover. The value before is recoverable from the trail only as
   * the previous entry's value after — which the last assertion pins — and not
   * at all for the first change away from the declared default.
   */
  it('records one audit entry per accepted write: who, when, and the value written', async () => {
    const settingId = (await h.em().findOneOrFail(Setting, { code: 'seo.default_robots' })).id;
    const entries = async (): Promise<AuditLogEntry[]> =>
      h.em().find(
        AuditLogEntry,
        { action: 'setting.global_value_set', objectType: 'setting', objectId: settingId },
        { orderBy: { actedAt: 'asc' } },
      );
    const baseline = (await entries()).length;
    const startedAt = Date.now();

    for (const value of ['NOINDEX, FOLLOW', 'NOINDEX, NOFOLLOW']) {
      const res = await h.app.inject({
        method: 'PUT',
        url: VALUE_URL,
        cookies: admin,
        payload: { scope: 'all', value },
      });
      expect(res.statusCode, res.body).toBe(200);
    }

    const written = (await entries()).slice(baseline);
    expect(written).toHaveLength(2);
    expect(written.map((entry) => (entry.stateAfter as { value?: unknown }).value)).toEqual([
      'NOINDEX, FOLLOW',
      'NOINDEX, NOFOLLOW',
    ]);
    for (const entry of written) {
      expect(entry.actorAdminUserId).toBe(TEST_ADMIN_ID);
      expect(entry.actedAt.getTime()).toBeGreaterThanOrEqual(startedAt - 1_000);
      expect((entry.stateAfter as { settingCode?: unknown }).settingCode).toBe(
        'seo.default_robots',
      );
    }
  });

  it('records nothing for a refused write', async () => {
    const settingId = (await h.em().findOneOrFail(Setting, { code: 'seo.default_robots' })).id;
    const count = async (): Promise<number> =>
      h.em().count(AuditLogEntry, { objectType: 'setting', objectId: settingId });
    const before = await count();

    await h.app.inject({
      method: 'PUT',
      url: VALUE_URL,
      cookies: reader,
      payload: { scope: 'all', value: 'NOINDEX, NOFOLLOW' },
    });
    await h.app.inject({
      method: 'PUT',
      url: VALUE_URL,
      cookies: admin,
      payload: { scope: 'all', value: 'NOINDEX' },
    });

    expect(await count()).toBe(before);
  });
});
