import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { SEED_PRODUCT_101_ID, SEED_PRODUCT_102_ID } from '../../helpers/seed-catalog.js';

/**
 * Feature 146, FR-009 / US1 #8a–#8c — the customer list's `totalAtCustomerPrice`
 * and the admin list's follow one rule (every line carries a proposal, or
 * `null`), including after the seller's revisions. Read the two lists side by
 * side on the same request through its life.
 */
describe('146 — customer and admin list totals agree (FR-009) [integration]', () => {
  let h: BackendServerHandle;
  const customer = { b2b_session: 'stub-customer-session' };
  const admin = { b2b_session: 'stub-admin-session' };

  beforeAll(async () => {
    h = await setupBackendServer();
  });
  afterAll(async () => {
    await teardownBackendServer(h);
  });

  const totals = async (id: string) => {
    const mine = await h.app.inject({ method: 'GET', url: '/api/v1/quote-requests', cookies: customer });
    const theirs = await h.app.inject({ method: 'GET', url: '/api/v1/admin/quote-requests', cookies: admin });
    expect(mine.statusCode, mine.body).toBe(200);
    expect(theirs.statusCode, theirs.body).toBe(200);
    type Row = { id: string; totalAtCustomerPrice: number | null };
    const c = (mine.json() as { data: Row[] }).data.find((r) => r.id === id);
    const a = (theirs.json() as { data: Row[] }).data.find((r) => r.id === id);
    expect(c, 'on the customer list').toBeDefined();
    expect(a, 'on the admin list').toBeDefined();
    return { customer: c!.totalAtCustomerPrice, admin: a!.totalAtCustomerPrice };
  };

  const create = async (items: Array<Record<string, unknown>>) => {
    const res = await h.app.inject({ method: 'POST', url: '/api/v1/quote-requests', cookies: customer, payload: { items } });
    expect(res.statusCode, res.body).toBe(201);
    return (res.json() as { data: { id: string; version: number } }).data;
  };

  it('a partial proposal, no proposal and a full proposal read the same on both lists', async () => {
    const partial = await create([
      { productId: SEED_PRODUCT_101_ID, quantity: 2, desiredUnitPrice: 100 },
      { productId: SEED_PRODUCT_102_ID, quantity: 1 },
    ]);
    expect(await totals(partial.id)).toEqual({ customer: null, admin: null });

    const none = await create([{ productId: SEED_PRODUCT_101_ID, quantity: 2 }]);
    expect(await totals(none.id)).toEqual({ customer: null, admin: null });

    const full = await create([
      { productId: SEED_PRODUCT_101_ID, quantity: 2, desiredUnitPrice: 100 },
      { productId: SEED_PRODUCT_102_ID, quantity: 1, desiredUnitPrice: 50 },
    ]);
    expect(await totals(full.id)).toEqual({ customer: 250, admin: 250 });
  });

  it('survives revisions: the proposals are retained, and a line the rep adds turns both totals to null', async () => {
    const full = await create([
      { productId: SEED_PRODUCT_101_ID, quantity: 2, desiredUnitPrice: 100 },
      { productId: SEED_PRODUCT_102_ID, quantity: 1, desiredUnitPrice: 50 },
    ]);
    const first = await h.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/quote-requests/${full.id}`,
      cookies: admin,
      headers: { 'if-match': `"${full.version}"` },
      payload: {
        items: [
          { productId: SEED_PRODUCT_101_ID, quantity: 2, agreedUnitPrice: 90 },
          { productId: SEED_PRODUCT_102_ID, quantity: 1, agreedUnitPrice: 45 },
        ],
      },
    });
    expect(first.statusCode, first.body).toBe(200);
    expect(await totals(full.id)).toEqual({ customer: 250, admin: 250 });

    const v1 = (first.json() as { data: { version: number } }).data.version;
    const second = await h.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/quote-requests/${full.id}`,
      cookies: admin,
      headers: { 'if-match': `"${v1}"` },
      payload: {
        items: [
          { productId: SEED_PRODUCT_101_ID, quantity: 2, agreedUnitPrice: 90 },
          { productId: SEED_PRODUCT_102_ID, quantity: 1, agreedUnitPrice: 45 },
          { productId: '00000000-0000-4000-8000-000000000103', quantity: 1, agreedUnitPrice: 10 },
        ],
      },
    });
    expect(second.statusCode, second.body).toBe(200);
    expect(await totals(full.id)).toEqual({ customer: null, admin: null });
  });
});
