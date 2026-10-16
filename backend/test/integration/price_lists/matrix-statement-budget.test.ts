import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Organization,
  PriceListMatrixEntry,
  Product,
  type ProductRow,
} from '../../helpers/package-entities.js';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { findAttributeExtensionByKey } from '../../helpers/seed-catalog.js';
import { SalesChannel } from '@endora-commerce/platform/kernel';
import { PriceListService } from '../../../../packages/modules/price_lists/src/backend/services/price-list-service.js';
import { PricingService } from '../../../../packages/modules/price_lists/src/backend/services/pricing-service.js';
import {
  DefaultPriceListMigrator,
  DEFAULT_PRICE_LIST_ID,
} from '../../../../packages/modules/price_lists/src/backend/services/default-price-list-migration.js';
import { neighbourReadPorts } from '../../helpers/price-list-neighbour-ports.js';

/**
 * Feature 148 / SC-003 — what the price matrix costs a 50-product catalogue
 * page, in statements.
 *
 * A page whose lists carry no entry pays **nothing**: whether a list carries
 * one is an `exists` probe in the statement that loads the lists
 * (`PriceList.hasMatrixEntries`), so the entries are never read. A page whose
 * lists carry category, attribute and percentage entries pays **at most
 * three** more: the entries, the eligible attributes (only because an entry
 * names one) and the Default-list reference brackets (only because a
 * percentage has no own-list reference). Nothing scales with the page.
 */

async function countStatements<T>(
  h: BackendServerHandle,
  work: () => Promise<T>,
): Promise<{ result: T; total: number; matrix: number; sql: string[] }> {
  const conn = h.em().getConnection() as unknown as {
    execute: (...args: unknown[]) => Promise<unknown>;
  };
  const original = conn.execute.bind(conn);
  const sql: string[] = [];
  conn.execute = (...args: unknown[]) => {
    sql.push(String(args[0]));
    return original(...args);
  };
  try {
    const result = await work();
    return {
      result,
      total: sql.length,
      // The read of the entries themselves; the lists' own statement carries an
      // `exists` probe (`hasMatrixEntries`) that is not a statement of its own.
      matrix: sql.filter((s) => s.includes('from "price_list_matrix_entries" as')).length,
      sql,
    };
  } finally {
    conn.execute = original;
  }
}

describe('price matrix — statement budget of a listing page (SC-003)', () => {
  let h: BackendServerHandle;
  let page: ProductRow[];
  let organization: Organization;
  let channel: SalesChannel;
  let listId: string;
  let categoryId: string;

  beforeAll(async () => {
    h = await setupBackendServer();
    const em = h.em();
    channel = await em.findOneOrFail(SalesChannel, { code: 'pl_retail' });
    // `setupBackendServer` has just emptied the price tables (`price_lists` is a
    // seeded table, truncated with cascade), so this block adds and wipes nothing.
    await new DefaultPriceListMigrator(h.em).seedDefault();
    const lists = new PriceListService(h.em, undefined, undefined, undefined, neighbourReadPorts(h.em));

    organization = em.create(Organization, {
      name: 'Budget Org',
      taxId: `PL148BUD${Date.now() % 1_000_000}`,
      status: 'active',
      vatStatus: 'vat_payer',
      registeredAddress: { street: '-', city: '-', postalCode: '-', country: 'PL' },
    });
    await em.persistAndFlush(organization);

    const stamp = Date.now();
    page = [];
    for (let i = 0; i < 50; i += 1) {
      page.push(
        em.create(Product, {
          sku: `MX-BUDGET-${stamp}-${i}`,
          slug: `mx-budget-${stamp}-${i}`,
          type: 'simple',
          status: 'active',
          name: { 'en-US': `Budget ${i}` },
          description: { 'en-US': 'x' },
          visibility: 'public',
          attributeValues: { material: i % 2 === 0 ? 'steel' : 'plastic' },
        }),
      );
    }
    await em.persistAndFlush(page);
    const category = await em
      .getConnection()
      .execute<Array<{ id: string }>>(`select id from categories order by slug limit 1`);
    categoryId = category[0]!.id;
    await em
      .getConnection()
      .execute(
        `insert into product_categories (product_id, category_id) select unnest(?::uuid[]), ?`,
        [`{${page.slice(0, 25).map((p) => p.id).join(',')}}`, categoryId],
      );
    for (const product of page) {
      await lists.addProduct(DEFAULT_PRICE_LIST_ID, product.id);
      await lists.replaceBrackets(DEFAULT_PRICE_LIST_ID, product.id, {
        PLN: [{ minQuantity: 1, maxQuantity: null, amount: '100' }],
      });
    }
    const list = await lists.create({
      name: 'Budget Org List',
      type: 'base',
      applicationRule: { kind: 'criterion', type: 'organization', values: [organization.id] },
    });
    await lists.activate(list.id);
    listId = list.id;

    const material = await findAttributeExtensionByKey(em, 'material');
    material!.isPriceRule = true;
    await em.flush();
  }, 5 * 60_000);

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  const context = () => ({
    organization,
    salesChannel: { id: channel.id, defaultCurrency: channel.defaultCurrency },
  });

  it('costs no extra statement when no list carries an entry', async () => {
    const pricing = new PricingService(h.em, undefined, undefined, neighbourReadPorts(h.em, h.catalogAttributeRead));
    const run = await countStatements(h, () => pricing.resolveListingPrices({ products: page, context: context() }));
    expect(run.result.size).toBe(50);
    expect(run.matrix).toBe(0);
  });

  it('costs at most three extra statements with category, attribute and percentage entries', async () => {
    const pricing = new PricingService(h.em, undefined, undefined, neighbourReadPorts(h.em, h.catalogAttributeRead));
    const without = await countStatements(h, () => pricing.resolveListingPrices({ products: page, context: context() }));
    const baseline = without.total;

    const em = h.em();
    for (const entry of [
      { categoryId, organizationId: organization.id, discountPercent: '10' },
      { attributeKey: 'material', attributeValue: 'plastic', organizationId: organization.id, discountPercent: '20' },
      { organizationId: organization.id, minQuantity: 100, discountPercent: '5' },
    ]) {
      em.create(PriceListMatrixEntry, { priceListId: listId, minQuantity: 1, priceType: 'discount_percent', ...entry });
    }
    await em.flush();

    // The attribute port's definition half rides `custom_fields`' in-process
    // cache (pub/sub-invalidated, 5 s TTL fallback), so a steady-state page
    // pays only the `product_attributes` read. Warm it the way any earlier
    // request on the process would have; the cold read is that module's cost,
    // not the matrix's.
    await h.catalogAttributeRead.listByFlag('isPriceRule');

    const withMatrix = await countStatements(h, () => pricing.resolveListingPrices({ products: page, context: context() }));
    expect(withMatrix.matrix).toBe(1);
    expect(withMatrix.total - baseline).toBeLessThanOrEqual(3);
    // And the matrix priced the page: 25 in the category at 90, the plastic
    // half at 80 (the attribute entry is more specific).
    const amounts = new Set([...withMatrix.result.values()].map((p) => ('amount' in p ? p.amount : null)));
    expect(amounts).toEqual(new Set(['90.0000', '80.0000', '100.0000']));
  });
});
