import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { SEED_PRODUCT_101_ID } from '../../helpers/seed-catalog.js';

/**
 * Feature 146, research R16 / threat model T11 — the customer draft-edit
 * `PATCH /api/v1/quote-requests/:id` is limited to 30 edits per request per
 * minute (`config.rateLimit` on the route). The shared harness boots with the
 * rate limiter off, so this file is the one that turns it on
 * (`enableRateLimit`) and proves the declaration is live: the 31st edit of one
 * request answers 429, and the bucket is per request, not per client.
 */
describe('146 — customer draft-edit rate limit [integration]', () => {
  let h: BackendServerHandle;
  const COOKIES = { b2b_session: 'stub-customer-session' };

  beforeAll(async () => {
    h = await setupBackendServer({ enableRateLimit: true });
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  const create = async (): Promise<{ id: string; version: number }> => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/quote-requests',
      cookies: COOKIES,
      payload: { items: [{ productId: SEED_PRODUCT_101_ID, quantity: 5 }] },
    });
    expect(res.statusCode, res.body).toBe(201);
    return (res.json() as { data: { id: string; version: number } }).data;
  };

  const edit = (id: string, version: number, quantity: number) =>
    h.app.inject({
      method: 'PATCH',
      url: `/api/v1/quote-requests/${id}`,
      cookies: COOKIES,
      headers: { 'if-match': `"${version}"` },
      payload: { items: [{ productId: SEED_PRODUCT_101_ID, quantity }] },
    });

  /** Thirty edits are served, the thirty-first is refused, and another request is untouched. */
  const exhaust = async (): Promise<{ refusal: Awaited<ReturnType<typeof edit>>; otherServed: number }> => {
    const first = await create();
    let version = first.version;
    for (let i = 1; i <= 30; i += 1) {
      const res = await edit(first.id, version, 5 + i);
      expect(res.statusCode, `edit ${i}: ${res.body}`).toBe(200);
      version = (res.json() as { data: { version: number } }).data.version;
    }
    const refusal = await edit(first.id, version, 99);
    // The bucket is keyed on the request id: a second request of the same
    // customer, from the same client, is not throttled by the first.
    const second = await create();
    const other = await edit(second.id, second.version, 7);
    return { refusal, otherServed: other.statusCode };
  };

  it('refuses the 31st edit of one request within a minute, and serves another request', async () => {
    const { refusal, otherServed } = await exhaust();
    expect(refusal.statusCode, refusal.body).not.toBe(200);
    expect(otherServed).toBe(200);
  });

  /**
   * QA finding (feature 146): the limiter works, but its refusal is answered
   * `500 INTERNAL` — the platform's `setErrorHandler` has no branch for a
   * Fastify error that carries `statusCode: 429`, so `@fastify/rate-limit`'s
   * thrown error reaches the fallback ("unhandled error"; `Retry-After` is still set).
   * `it.fails` pins the defect: this file goes red the day the handler answers
   * 429, which is the signal to turn it into a plain `it`.
   */
  it.fails('answers the refused edit 429 with Retry-After (currently 500 INTERNAL)', async () => {
    const { refusal } = await exhaust();
    expect(refusal.statusCode, refusal.body).toBe(429);
    expect(refusal.headers['retry-after']).toBeDefined();
  });

  /**
   * QA finding (feature 146): the bucket key is the request id alone and
   * `@fastify/rate-limit` counts at `onRequest`, before `requireCustomer` runs.
   * So 31 *unauthenticated* PATCHes naming a request's id (each answered 401)
   * lock its owner out for the rest of the minute. Ids are random UUIDs, which
   * bounds the abuse to someone who already holds one — hence minor — but the
   * key should carry the caller (session or ip) as well. `it.fails` pins it.
   */
  it.fails('an anonymous caller cannot exhaust the owner\'s bucket for a request', async () => {
    const mine = await create();
    for (let i = 0; i < 31; i += 1) {
      const res = await h.app.inject({
        method: 'PATCH',
        url: `/api/v1/quote-requests/${mine.id}`,
        headers: { 'if-match': `"${mine.version}"` },
        payload: { items: [{ productId: SEED_PRODUCT_101_ID, quantity: 9 }] },
      });
      expect(res.statusCode).toBe(401);
    }
    const owner = await edit(mine.id, mine.version, 11);
    expect(owner.statusCode, owner.body).toBe(200);
  });
});
