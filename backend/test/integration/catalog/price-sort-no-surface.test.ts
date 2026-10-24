import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { settlePriceSurface } from '../../helpers/price-surface.js';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import {
  ALPHA,
  BETA,
  DELTA,
  GAMMA,
  PRICE_SORT_CHANNEL,
  PRICE_SORT_ORG_A,
  seedPriceSortFixture,
} from '../../helpers/price-sort-fixture.js';

/**
 * Review finding 3 (release 0.108.0) — a price-sorted listing with no price
 * surface built yet (right after the upgrade, on a new channel, before the
 * worker has run) is served in the default order (`contracts/price-surface.md`
 * §3). It used to drop the cursor as well, so every page was page 1 with
 * `hasMore: true`, forever. The fallback now issues a cursor of its own and
 * honours it, so a walk terminates and meets every product exactly once —
 * also when the surface is built in the middle of the walk.
 */
describe('a price-sorted listing with no price surface pages to the end', () => {
  let h: BackendServerHandle;

  beforeAll(async () => {
    h = await setupBackendServer();
    await seedPriceSortFixture(h.em());
    await dropRetailProfiles();
  }, 60_000);

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  /** No price order for the listing's channel: its profiles, and only those, go. */
  const dropRetailProfiles = () =>
    h
      .em()
      .getConnection()
      .execute(`delete from "price_profiles" where "sales_channel_id" = (select "id" from "sales_channels" where "code" = 'pl_retail')`);

  async function walk(
    limit: number,
    options: { cookies?: Record<string, string>; between?: (page: number) => Promise<void> } = {},
  ): Promise<{ skus: string[]; pages: number; ended: boolean }> {
    const skus: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      const res = await h.app.inject({
        method: 'GET',
        url: `/api/v1/catalog/products?q=PRICE-SORT&limit=${limit}&sort=price${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        headers: PRICE_SORT_CHANNEL,
        ...(options.cookies ? { cookies: options.cookies } : {}),
      });
      expect(res.statusCode, res.body).toBe(200);
      const body = res.json() as { data: Array<{ sku: string }>; pagination: { cursor: string | null; hasMore: boolean } };
      skus.push(...body.data.map((d) => d.sku));
      if (!body.pagination.hasMore) return { skus, pages: page + 1, ended: true };
      expect(body.pagination.cursor, 'a page with more after it names where to continue').not.toBeNull();
      cursor = body.pagination.cursor!;
      await options.between?.(page);
    }
    return { skus, pages: 20, ended: false };
  }

  it('a guest walk ends and meets every visible product once', async () => {
    for (const limit of [1, 2]) {
      const { skus, ended } = await walk(limit);
      expect(ended, `limit ${limit}`).toBe(true);
      expect([...skus].sort(), `limit ${limit}`).toEqual([ALPHA.sku, BETA.sku, GAMMA.sku].sort());
    }
  });

  it('an organization walk ends and meets every product it may see once', async () => {
    const { skus, ended } = await walk(1, { cookies: PRICE_SORT_ORG_A });
    expect(ended).toBe(true);
    expect([...skus].sort()).toEqual([ALPHA.sku, BETA.sku, DELTA.sku, GAMMA.sku].sort());
  });

  it('a walk begun without a surface keeps its own order when the surface is built midway', async () => {
    await dropRetailProfiles();
    const { skus, ended } = await walk(1, {
      between: async (page) => {
        if (page === 0) await settlePriceSurface(h);
      },
    });
    expect(ended).toBe(true);
    expect([...skus].sort()).toEqual([ALPHA.sku, BETA.sku, GAMMA.sku].sort());
  });
});
