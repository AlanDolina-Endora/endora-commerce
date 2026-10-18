import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@endora-commerce/contracts';
import { hashPassword } from '@endora-commerce/platform/kernel';
import { AdminUser } from '../../helpers/package-entities.js';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { ADMIN_COOKIES, TEST_ADMIN_ID } from '../../helpers/test-actors.js';

/**
 * `admin_users:manage` opens the Users & Roles screens; it does not make its
 * holder a full-access administrator. Every write there is held to the acting
 * administrator's own permissions:
 *
 *  - a role may be written only with permissions the actor holds, and a role
 *    already holding more may not be changed;
 *  - a seeded role — `platform_admin` included, with its two-factor flag — is
 *    changed only by a holder of the wildcard;
 *  - a role may be assigned only if the actor holds all it grants;
 *  - an account whose role holds more than the actor is not changed, given a
 *    password, deactivated or deleted by them.
 */

const MANAGER_ID = '00000000-0000-4000-8000-0000000a12e1';
const MANAGER_COOKIE = 'stub-user-manager-session';
const PEER_ID = '00000000-0000-4000-8000-0000000a12e2';

interface ErrorBody {
  error: { code: string; details?: Record<string, unknown> };
}

describe('the Users & Roles screens are held to the actor\'s own permissions', () => {
  let h: BackendServerHandle;
  let platformAdminRoleId: string;
  let orderReaderRoleId: string;

  const as = (cookie: string) => ({ b2b_session: cookie });

  beforeAll(async () => {
    h = await setupBackendServer();

    const manager = await h.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/admin-roles/user_manager',
      cookies: as('stub-admin-session'),
      payload: {
        code: 'user_manager',
        name: 'User manager',
        permissions: ['admin_users:manage', 'orders:read'],
      },
    });
    expect(manager.statusCode).toBe(200);
    const managerRoleId = (manager.json() as { data: { id: string } }).data.id;

    const roles = await h.app.inject({
      method: 'GET',
      url: '/api/v1/admin/admin-roles',
      cookies: as('stub-admin-session'),
    });
    const all = (roles.json() as { data: Array<{ id: string; code: string }> }).data;
    platformAdminRoleId = all.find((r) => r.code === 'platform_admin')!.id;

    const passwordHash = await hashPassword('a-manager-password');
    const em = h.em();
    em.create(AdminUser, {
      id: MANAGER_ID,
      email: 'user-manager@example.com',
      passwordHash,
      firstName: 'User',
      lastName: 'Manager',
      adminRoleId: managerRoleId,
      status: 'active',
    });
    await em.flush();
    ADMIN_COOKIES[MANAGER_COOKIE] = { adminUserId: MANAGER_ID };
  });

  afterAll(async () => {
    delete ADMIN_COOKIES[MANAGER_COOKIE];
    await teardownBackendServer(h);
  });

  describe('role writes', () => {
    it('writes a role holding only permissions the actor holds', async () => {
      const res = await h.app.inject({
        method: 'PUT',
        url: '/api/v1/admin/admin-roles/order_reader',
        cookies: as(MANAGER_COOKIE),
        payload: { code: 'order_reader', name: 'Order reader', permissions: ['orders:read'] },
      });
      expect(res.statusCode).toBe(200);
      orderReaderRoleId = (res.json() as { data: { id: string } }).data.id;
    });

    it('refuses a role holding a permission the actor lacks, or full access', async () => {
      for (const permissions of [['orders:read', 'catalog:write'], ['*']]) {
        const res = await h.app.inject({
          method: 'PUT',
          url: '/api/v1/admin/admin-roles/escalated',
          cookies: as(MANAGER_COOKIE),
          payload: { code: 'escalated', name: 'Escalated', permissions },
        });
        expect(res.statusCode).toBe(403);
        expect((res.json() as ErrorBody).error.code).toBe(ERROR_CODES.ADMIN_ROLE_GRANT_EXCEEDED);
      }
    });

    it('refuses to change the platform-administrator role, its two-factor flag included', async () => {
      const res = await h.app.inject({
        method: 'PUT',
        url: '/api/v1/admin/admin-roles/platform_admin',
        cookies: as(MANAGER_COOKIE),
        payload: {
          code: 'platform_admin',
          name: 'Platform administrator',
          permissions: ['*'],
          requiresTwoFactor: false,
        },
      });
      expect(res.statusCode).toBe(409);
      const body = res.json() as ErrorBody;
      expect(body.error.code).toBe(ERROR_CODES.ADMIN_ROLE_PROTECTED);
      expect(body.error.details).toMatchObject({ role: 'platform_admin', code: 'modify' });
    });

    it('still lets a full-access administrator change the platform-administrator role', async () => {
      const res = await h.app.inject({
        method: 'PUT',
        url: '/api/v1/admin/admin-roles/platform_admin',
        cookies: as('stub-admin-session'),
        payload: { code: 'platform_admin', name: 'Platform administrator', permissions: ['*'] },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('accounts', () => {
    it('creates an account with a role the actor holds, and refuses one with full access', async () => {
      const ok = await h.app.inject({
        method: 'POST',
        url: '/api/v1/admin/admin-users',
        cookies: as(MANAGER_COOKIE),
        payload: {
          email: 'order-reader@example.com',
          password: 'an-order-reader-password',
          firstName: 'Order',
          lastName: 'Reader',
          adminRoleId: orderReaderRoleId,
        },
      });
      expect(ok.statusCode).toBe(201);

      const refused = await h.app.inject({
        method: 'POST',
        url: '/api/v1/admin/admin-users',
        cookies: as(MANAGER_COOKIE),
        payload: {
          email: 'second-root@example.com',
          password: 'a-second-root-password',
          firstName: 'Second',
          lastName: 'Root',
          adminRoleId: platformAdminRoleId,
        },
      });
      expect(refused.statusCode).toBe(403);
      expect((refused.json() as ErrorBody).error.code).toBe(ERROR_CODES.ADMIN_ROLE_GRANT_EXCEEDED);
    });

    it('refuses to give the actor\'s own account the full-access role', async () => {
      const res = await h.app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/admin-users/${MANAGER_ID}`,
        cookies: as(MANAGER_COOKIE),
        payload: { adminRoleId: platformAdminRoleId },
      });
      expect(res.statusCode).toBe(403);
      expect((res.json() as ErrorBody).error.code).toBe(ERROR_CODES.ADMIN_ROLE_GRANT_EXCEEDED);
      const me = await h.em().findOne(AdminUser, { id: MANAGER_ID });
      expect(me?.adminRoleId).not.toBe(platformAdminRoleId);
    });

    it('leaves a full-access account alone: no edit, password, deactivation or delete', async () => {
      const attempts = [
        h.app.inject({
          method: 'PATCH',
          url: `/api/v1/admin/admin-users/${TEST_ADMIN_ID}`,
          cookies: as(MANAGER_COOKIE),
          payload: { status: 'inactive' },
        }),
        h.app.inject({
          method: 'POST',
          url: `/api/v1/admin/admin-users/${TEST_ADMIN_ID}/password`,
          cookies: as(MANAGER_COOKIE),
          payload: { password: 'a-password-of-my-choosing' },
        }),
        h.app.inject({
          method: 'DELETE',
          url: `/api/v1/admin/admin-users/${TEST_ADMIN_ID}`,
          cookies: as(MANAGER_COOKIE),
        }),
      ];
      for (const res of await Promise.all(attempts)) {
        expect(res.statusCode).toBe(403);
        expect((res.json() as ErrorBody).error.code).toBe(ERROR_CODES.ADMIN_USER_OUTRANKS_ACTOR);
      }
      const root = await h.em().findOne(AdminUser, { id: TEST_ADMIN_ID });
      expect(root?.status).toBe('active');
      expect(root?.deletedAt ?? null).toBeNull();
    });

    it('still manages an account within the actor\'s permissions', async () => {
      const em = h.em();
      em.create(AdminUser, {
        id: PEER_ID,
        email: 'peer-reader@example.com',
        passwordHash: await hashPassword('a-peer-password'),
        firstName: 'Peer',
        lastName: 'Reader',
        adminRoleId: orderReaderRoleId,
        status: 'active',
      });
      await em.flush();

      const reset = await h.app.inject({
        method: 'POST',
        url: `/api/v1/admin/admin-users/${PEER_ID}/password`,
        cookies: as(MANAGER_COOKIE),
        payload: { password: 'a-fresh-peer-password' },
      });
      expect(reset.statusCode).toBe(200);
      const del = await h.app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/admin-users/${PEER_ID}`,
        cookies: as(MANAGER_COOKIE),
      });
      expect(del.statusCode).toBe(204);
    });
  });
});
