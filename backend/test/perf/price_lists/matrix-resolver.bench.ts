// perf-weight: fast — about 25 s locally (2026-10-16, mostly the fixture); not yet timed on the CI runner.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PriceList, PriceListMatrixEntry, Product, type ProductRow } from '../../helpers/package-entities.js';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { SalesChannel } from '@endora-commerce/platform/kernel';
import { PriceListService } from '../../../../packages/modules/price_lists/src/backend/services/price-list-service.js';
import { PricingService } from '../../../../packages/modules/price_lists/src/backend/services/pricing-service.js';
import {
  DefaultPriceListMigrator,
  DEFAULT_PRICE_LIST_ID,
} from '../../../../packages/modules/price_lists/src/backend/services/default-price-list-migration.js';
import { neighbourReadPorts } from '../../helpers/price-list-neighbour-ports.js';

/**
 * Feature 148 — what the price matrix costs a listing page (SC-003) and a
 * price-ordered listing (owner decision Q1), beside `resolver.bench.ts`.
 *
 * Fixture: `PERF_MATRIX_PRODUCTS` products (default 2 000), every one priced
 * on the Default list, half of them in one category; one organization list
 * applying to the viewer. Scenarios, each timed over `PERF_ITERATIONS` runs
 * with the LRU disabled:
 *
 *   - `resolveListingPrices` for a 50-product page with 0, 100 and 5 000
 *     entries on the organization list (the 5 000 are product entries for
 *     other products, so the prefetch filter is what keeps them out);
 *   - `orderByUnitPrice` for the first page of 50 with no entry, with a
 *     category percentage entry, and with an all-products percentage entry —
 *     the last turns the organization list into a matrix stream over every
 *     product with a reference, which is the shape research R11 says is
 *     computed rather than streamed from the partial index.
 *
 * Measured 2026-10-16 on a 16-core Linux dev box, Postgres 16 in Docker,
 * defaults, p95: listing 15.3 / 13.5 / 11.4 ms (0 / 100 / 5 000 entries —
 * the prefetch filter keeps the 5 000 out); ordered first page 3.1 ms with no
 * entry, 41.4 ms with a category percentage (most of it the category's id
 * read), 21.3 ms with an all-products percentage. An earlier shape that read
 * the percentage reference through `left join`s measured **702 ms** for the
 * last case on a freshly written, unanalysed table — a nested loop with a join
 * filter over 2 000 × 2 000 rows — which is why the reference is two scalar
 * subqueries (see `unit-price-ordering.ts`). Budgets are worst observed × 3,
 * rounded up (the `resolver.bench.ts` rule): 60 ms and 150 ms.
 *
 * Tuning knobs (env):
 *   PERF_MATRIX_PRODUCTS — catalogue size (default 2000)
 *   PERF_ITERATIONS      — runs per scenario (default 50)
 *   PERF_MATRIX_LISTING_P95_MS — budget for a listing page (default 60)
 *   PERF_MATRIX_ORDER_P95_MS   — budget for a price-ordered page (default 150)
 *   PERF_RUN             — set to 'true' to run; otherwise the suite skips.
 */

const productCount = Number(process.env['PERF_MATRIX_PRODUCTS'] ?? '2000');
const iterations = Number(process.env['PERF_ITERATIONS'] ?? '50');
const listingBudget = Number(process.env['PERF_MATRIX_LISTING_P95_MS'] ?? '60');
const orderBudget = Number(process.env['PERF_MATRIX_ORDER_P95_MS'] ?? '150');
const shouldRun = process.env['PERF_RUN'] === 'true';

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)] ?? 0;
}

describe.skipIf(!shouldRun)('price matrix — listing and ordering cost', () => {
  let h: BackendServerHandle;
  let channel: SalesChannel;
  let page: ProductRow[];
  let organizationId: string;
  let listId: string;
  let categoryId: string;

  beforeAll(async () => {
    h = await setupBackendServer();
    const em = h.em();
    await new DefaultPriceListMigrator(h.em).seedDefault();
    channel = await em.findOneOrFail(SalesChannel, { code: 'pl_retail' });
    const org = await em.getConnection().execute<Array<{ id: string }>>(`select id from organizations limit 1`);
    organizationId = org[0]!.id;
    const category = await em.getConnection().execute<Array<{ id: string }>>(`select id from categories limit 1`);
    categoryId = category[0]!.id;

    const stamp = Date.now();
    await em.getConnection().execute(
      `insert into products (id, sku, slug, type, status, name, description, visibility, attribute_values, created_at, updated_at)
       select gen_random_uuid(), 'MXB-' || ? || '-' || g, 'mxb-' || ? || '-' || g, 'simple', 'active',
              '{"en-US":"x"}'::jsonb, '{"en-US":"x"}'::jsonb, 'public', '{}'::jsonb, now(), now()
         from generate_series(1, ?) g`,
      [stamp, stamp, productCount],
    );
    const ids = (
      await em.getConnection().execute<Array<{ id: string }>>(`select id from products where sku like ?`, [`MXB-${stamp}-%`])
    ).map((r) => r.id);
    await em.getConnection().execute(
      `insert into price_list_products (price_list_id, product_id) select ?, unnest(?::uuid[])`,
      [DEFAULT_PRICE_LIST_ID, `{${ids.join(',')}}`],
    );
    await em.getConnection().execute(
      `insert into price_list_price_brackets (price_list_id, product_id, currency_code, min_quantity, max_quantity, amount, created_at, updated_at)
       select ?, p, 'PLN', 1, null, 10 + (random() * 90)::numeric(14,4), now(), now() from unnest(?::uuid[]) p`,
      [DEFAULT_PRICE_LIST_ID, `{${ids.join(',')}}`],
    );
    await em.getConnection().execute(
      `insert into product_categories (product_id, category_id) select unnest(?::uuid[]), ?`,
      [`{${ids.slice(0, Math.floor(ids.length / 2)).join(',')}}`, categoryId],
    );
    page = await em.find(Product, { id: { $in: ids.slice(0, 50) } });

    const lists = new PriceListService(h.em, undefined, undefined, undefined, neighbourReadPorts(h.em));
    const list = await lists.create({
      name: `Matrix bench ${stamp}`,
      type: 'base',
      applicationRule: { kind: 'criterion', type: 'organization', values: [organizationId] },
    });
    await lists.activate(list.id);
    listId = list.id;
    expect(await em.count(PriceList, { id: listId, status: 'active' })).toBe(1);
  }, 10 * 60_000);

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  const pricing = () => new PricingService(h.em, undefined, undefined, neighbourReadPorts(h.em));
  const context = () => ({
    organization: { id: organizationId },
    salesChannel: { id: channel.id, defaultCurrency: channel.defaultCurrency },
  });

  async function time(label: string, work: () => Promise<unknown>, budget: number): Promise<void> {
    for (let i = 0; i < 5; i += 1) await work();
    const samples: number[] = [];
    for (let i = 0; i < iterations; i += 1) {
      const start = performance.now();
      await work();
      samples.push(performance.now() - start);
    }
    const value = p95(samples);
    // eslint-disable-next-line no-console
    console.log(`[perf/matrix] ${label} products=${productCount} iterations=${iterations} p95=${value.toFixed(2)}ms budget=${budget}ms`);
    expect(value).toBeLessThan(budget);
  }

  async function replaceEntries(rows: Array<Record<string, unknown>>): Promise<void> {
    const em = h.em();
    await em.nativeDelete(PriceListMatrixEntry, { priceListId: listId });
    for (const row of rows) {
      em.create(PriceListMatrixEntry, { priceListId: listId, minQuantity: 1, priceType: 'discount_percent', ...row });
    }
    await em.flush();
  }

  it('listing page: 0, 100 and 5 000 entries', async () => {
    const engine = pricing();
    await replaceEntries([]);
    await time('listing entries=0', () => engine.resolveListingPrices({ products: page, context: context() }), listingBudget);

    const others = await h
      .em()
      .getConnection()
      .execute<Array<{ id: string }>>(`select product_id as id from price_list_products where price_list_id = ? offset 50 limit 5000`, [
        DEFAULT_PRICE_LIST_ID,
      ]);
    const productEntries = (n: number) =>
      others.slice(0, n).map((r) => ({
        productId: r.id,
        organizationId,
        priceType: 'fixed',
        amount: '1',
        currencyCode: 'PLN',
        discountPercent: null,
      }));
    await replaceEntries([{ categoryId, organizationId, discountPercent: '10' }, ...productEntries(99)]);
    await time('listing entries=100', () => engine.resolveListingPrices({ products: page, context: context() }), listingBudget);
    await replaceEntries([{ categoryId, organizationId, discountPercent: '10' }, ...productEntries(4999)]);
    await time('listing entries=5000', () => engine.resolveListingPrices({ products: page, context: context() }), listingBudget);
  }, 10 * 60_000);

  it('price-ordered first page: no entry, a category percentage, an all-products percentage', async () => {
    const engine = pricing();
    const order = () =>
      engine.orderByUnitPrice({ context: context(), direction: 'asc', after: null, limit: 51 });
    await replaceEntries([]);
    await time('order entries=none', order, orderBudget);
    await replaceEntries([{ categoryId, organizationId, discountPercent: '10' }]);
    await time('order entries=category%', order, orderBudget);
    await replaceEntries([{ organizationId, discountPercent: '10' }]);
    await time('order entries=all%', order, orderBudget);
  }, 10 * 60_000);
});
