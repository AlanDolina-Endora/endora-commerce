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
 *
 * ## What is strict, and where
 *
 * The **consumer** tolerates members it does not know — the schema drops them —
 * so that a later backend can add a field without every storefront already
 * deployed reading the answer as unreadable. Strictness stays where it protects
 * something:
 *
 *  * `index` and `follow` must be present booleans (the schema; a storefront
 *    treats anything else as unreadable rather than guessing);
 *  * **this** backend sends exactly those two and nothing else — held below,
 *    because "consumers tolerate extras" is not a licence to send any, and the
 *    stored token in particular is the module's own spelling;
 *  * a value outside the four choices is refused when it is **written**
 *    (`test/integration/seo/default-robots-write.test.ts`), and a stored value
 *    the mapping does not know reads as no restriction rather than as a
 *    directive nobody chose (`robots-policy.test.ts` in the module).
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
    // The schema would drop an unknown member, so it cannot see one. The raw
    // body is what says this backend sends the two booleans and nothing else —
    // the stored spelling least of all.
    const raw = res.json() as { data: Record<string, unknown> };
    expect(Object.keys(raw)).toEqual(['data']);
    expect(Object.keys(raw.data).sort()).toEqual(['follow', 'index']);
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
