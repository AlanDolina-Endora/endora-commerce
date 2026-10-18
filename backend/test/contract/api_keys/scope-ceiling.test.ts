import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@endora-commerce/contracts';
import { hashPassword } from '@endora-commerce/platform/kernel';
import { AdminUser } from '../../helpers/package-entities.js';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { ADMIN_COOKIES } from '../../helpers/test-actors.js';

/**
 * An API key acts with the scopes it is issued, so `POST /api/v1/admin/api-keys`
 * issues a key only with scopes the issuing administrator's own role holds.
 * `integrations:manage` opens the screen; it does not by itself grant
 * `catalog:write` or `orders:*`. A holder of the wildcard may issue any scope.
 */

const ISSUER_ID = '00000000-0000-4000-8000-0000000a11e1';
const ISSUER_COOKIE = 'stub-api-key-issuer-session';

interface ErrorBody {
  error: { code: string; details?: { scopes?: string } };
}

describe('API key scopes are held to the issuer\'s own permissions', () => {
  let h: BackendServerHandle;

  beforeAll(async () => {
    h = await setupBackendServer();
    const role = await h.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/admin-roles/api_key_issuer',
      cookies: { b2b_session: 'stub-admin-session' },
      payload: {
        code: 'api_key_issuer',
        name: 'API key issuer',
        permissions: ['integrations:manage', 'catalog:read'],
      },
    });
    expect(role.statusCode).toBe(200);
    const roleId = (role.json() as { data: { id: string } }).data.id;

    const em = h.em();
    em.create(AdminUser, {
      id: ISSUER_ID,
      email: 'api-key-issuer@example.com',
      passwordHash: await hashPassword('an-issuer-password'),
      firstName: 'Key',
      lastName: 'Issuer',
      adminRoleId: roleId,
      status: 'active',
    });
    await em.flush();
    ADMIN_COOKIES[ISSUER_COOKIE] = { adminUserId: ISSUER_ID };
  });

  afterAll(async () => {
    delete ADMIN_COOKIES[ISSUER_COOKIE];
    await teardownBackendServer(h);
  });

  const issue = (cookie: string, scopes: string[]) =>
    h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/api-keys',
      cookies: { b2b_session: cookie },
      payload: { name: 'pim', scopes },
    });

  it('issues a key with a scope the administrator holds', async () => {
    const res = await issue(ISSUER_COOKIE, ['catalog:read']);
    expect(res.statusCode).toBe(201);
  });

  it('refuses a scope the administrator does not hold, and issues nothing', async () => {
    const before = await h.app.inject({
      method: 'GET',
      url: '/api/v1/admin/api-keys',
      cookies: { b2b_session: ISSUER_COOKIE },
    });
    const count = (before.json() as { data: unknown[] }).data.length;

    const res = await issue(ISSUER_COOKIE, ['catalog:read', 'catalog:write']);
    expect(res.statusCode).toBe(403);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe(ERROR_CODES.API_KEY_SCOPE_NOT_HELD);
    expect(body.error.details?.scopes).toBe('catalog:write');

    const after = await h.app.inject({
      method: 'GET',
      url: '/api/v1/admin/api-keys',
      cookies: { b2b_session: ISSUER_COOKIE },
    });
    expect((after.json() as { data: unknown[] }).data).toHaveLength(count);
  });

  it('lets a full-access administrator issue a scope beyond that role', async () => {
    const res = await issue('stub-admin-session', ['catalog:write']);
    expect(res.statusCode).toBe(201);
  });
});
