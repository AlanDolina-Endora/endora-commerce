import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { storefrontRobotsPolicyResponseSchema } from '@endora-commerce/contracts';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';

/**
 * `GET /api/v1/storefront/seo/robots-policy`
 * (`specs/144-seo-search-engine-robots/contracts/crawler-policy.md` §1).
 *
 * The storefront's middleware asks this on behalf of every response it serves,
 * so the three things held here are the three it depends on: the body is the
 * contract schema and nothing more, no shared cache may keep it (the storefront
 * is the cache, and an intermediary holding the answer would stretch the time a
 * saved change takes to be in force without anybody seeing why), and it needs
 * no session.
 */
describe('GET /api/v1/storefront/seo/robots-policy', () => {
  let h: BackendServerHandle;
  const admin = { b2b_session: 'stub-admin-session' };
  const URL = '/api/v1/storefront/seo/robots-policy';

  beforeAll(async () => {
    h = await setupBackendServer();
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

  const store = async (value: string): Promise<void> => {
    const res = await h.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings/seo.default_robots/value',
      cookies: admin,
      payload: { scope: 'all', value },
    });
    expect(res.statusCode, `storing ${value} must be accepted: ${res.body}`).toBe(200);
  };

  it('answers no restriction on an instance nobody configured', async () => {
    const res = await h.app.inject({ method: 'GET', url: URL });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { index: true, follow: true } });
  });

  it.each([
    ['INDEX, FOLLOW', { index: true, follow: true }],
    ['NOINDEX, FOLLOW', { index: false, follow: true }],
    ['INDEX, NOFOLLOW', { index: true, follow: false }],
    ['NOINDEX, NOFOLLOW', { index: false, follow: false }],
  ])('answers the schema for a stored %s', async (stored, policy) => {
    await store(stored);
    const res = await h.app.inject({ method: 'GET', url: URL });
    expect(res.statusCode).toBe(200);
    const body = storefrontRobotsPolicyResponseSchema.parse(res.json());
    expect(body).toEqual({ data: policy });
    // The stored spelling is the module's own and never crosses the wire.
    expect(res.body).not.toContain('INDEX');
  });

  it('forbids any cache from keeping the answer', async () => {
    const res = await h.app.inject({ method: 'GET', url: URL });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('needs no session, and answers the same with one', async () => {
    await store('NOINDEX, NOFOLLOW');
    const anonymous = await h.app.inject({ method: 'GET', url: URL });
    const signedIn = await h.app.inject({ method: 'GET', url: URL, cookies: admin });
    expect(anonymous.statusCode).toBe(200);
    expect(signedIn.statusCode).toBe(200);
    expect(anonymous.json()).toEqual(signedIn.json());
  });
});
