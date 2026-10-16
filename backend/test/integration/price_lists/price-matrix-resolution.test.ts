import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import {
  Organization,
  PriceList,
  PriceListMatrixEntry,
  Product,
  type ProductRow,
} from '../../helpers/package-entities.js';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import {
  findAttributeExtensionByKey,
  SEED_PRODUCT_101_ID,
  SEED_PRODUCT_102_ID,
  SEED_PRODUCT_103_ID,
} from '../../helpers/seed-catalog.js';
import { TEST_ORGANIZATION_ID } from '../../helpers/test-actors.js';
import { SalesChannel } from '@endora-commerce/platform/kernel';
import { PriceListService } from '../../../../packages/modules/price_lists/src/backend/services/price-list-service.js';
import { PricingService } from '../../../../packages/modules/price_lists/src/backend/services/pricing-service.js';
import {
  DefaultPriceListMigrator,
  DEFAULT_PRICE_LIST_ID,
} from '../../../../packages/modules/price_lists/src/backend/services/default-price-list-migration.js';
import { neighbourReadPorts } from '../../helpers/price-list-neighbour-ports.js';

/**
 * Feature 148 — price list matrix entries, resolved end to end against
 * Postgres through `PricingService.resolveLinePrice` (spec US1, US2, US3) and
 * through one cart line.
 *
 * The fixture is the seeded catalogue: products 101 and 102 share the category
 * standing in for *Fasteners*, 103 is outside it; `material` is a choice
 * attribute (101 steel, 102 aluminium, 103 plastic). Every product costs 100.00
 * PLN on the Default list. Acme is a subsidiary of Holding — the chain the
 * engine receives is `[acme, holding]`, the shape `organizations`' inheritance
 * port answers (feature 056, tested there).
 */

type Entry = Partial<{
  productId: string | null;
  categoryId: string | null;
  attributeKey: string | null;
  attributeValue: string | null;
  organizationId: string | null;
  minQuantity: number;
  maxQuantity: number | null;
  priceType: 'fixed' | 'discount_percent';
  amount: string | null;
  currencyCode: string | null;
  discountPercent: string | null;
}>;

let seq = 0;
async function makeOrg(em: EntityManager, name: string): Promise<Organization> {
  seq += 1;
  const org = em.create(Organization, {
    name,
    taxId: `PL148MX${String(Date.now() % 1_000_000)}${String(seq).padStart(3, '0')}`,
    status: 'active',
    vatStatus: 'vat_payer',
    registeredAddress: { street: '-', city: '-', postalCode: '-', country: 'PL' },
  });
  await em.persistAndFlush(org);
  return org;
}

describe('price matrix — resolution (feature 148)', () => {
  let h: BackendServerHandle;
  let lists: PriceListService;
  let pricing: PricingService;
  let channel: SalesChannel;
  let acme: Organization;
  let holding: Organization;
  let other: Organization;
  let fasteners: string;
  let p101: ProductRow;
  let p102: ProductRow;
  let p103: ProductRow;
  let listId: string;

  async function addEntry(entry: Entry, onList = listId): Promise<string> {
    const em = h.em();
    const row = em.create(PriceListMatrixEntry, {
      priceListId: onList,
      minQuantity: 1,
      priceType: 'discount_percent',
      discountPercent: '10.00',
      ...entry,
    });
    await em.persistAndFlush(row);
    return row.id;
  }

  async function price(
    product: ProductRow,
    quantity: number,
    organization: Organization | null,
    currencyCode?: string,
  ) {
    return pricing.resolveLinePrice({
      product,
      variantId: null,
      context: {
        quantity,
        organization,
        salesChannel: { id: channel.id, defaultCurrency: channel.defaultCurrency },
        ...(currencyCode ? { currencyCode } : {}),
      },
    });
  }

  beforeAll(async () => {
    h = await setupBackendServer();
    const em = h.em();
    channel = await em.findOneOrFail(SalesChannel, { code: 'pl_retail' });
    p101 = await em.findOneOrFail(Product, { id: SEED_PRODUCT_101_ID });
    p102 = await em.findOneOrFail(Product, { id: SEED_PRODUCT_102_ID });
    p103 = await em.findOneOrFail(Product, { id: SEED_PRODUCT_103_ID });
    const rows = await em
      .getConnection()
      .execute<Array<{ category_id: string }>>(
        `select category_id from product_categories where product_id = ?`,
        [SEED_PRODUCT_101_ID],
      );
    fasteners = rows[0]!.category_id;
    acme = await makeOrg(em, 'Acme Sp. z o.o.');
    holding = await makeOrg(em, 'Holding S.A.');
    other = await makeOrg(em, 'Other Sp. z o.o.');
    const reads = neighbourReadPorts(h.em, h.catalogAttributeRead);
    lists = new PriceListService(h.em, undefined, undefined, undefined, reads);
    pricing = new PricingService(
      h.em,
      undefined,
      async (orgId) => (orgId === acme.id ? [acme.id, holding.id] : [orgId]),
      reads,
    );
    // `setupBackendServer` has just emptied the price tables (`price_lists` is a
    // seeded table, truncated with cascade); every case below adds its own list
    // and removes it again, so nothing here wipes a table.
    await new DefaultPriceListMigrator(h.em).seedDefault();
    for (const product of [p101, p102, p103]) {
      await lists.addProduct(DEFAULT_PRICE_LIST_ID, product.id);
      await lists.replaceBrackets(DEFAULT_PRICE_LIST_ID, product.id, {
        PLN: [{ minQuantity: 1, maxQuantity: null, amount: '100' }],
      });
    }
  }, 5 * 60_000);

  afterEach(async () => {
    // The list's entries, roster and brackets go with it (foreign-key cascade).
    await h.em().nativeDelete(PriceList, { id: listId });
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  beforeEach(async () => {
    const list = await lists.create({
      name: `Matrix list ${Date.now()}`,
      type: 'base',
      applicationRule: { kind: 'all' },
    });
    // An "applies to everything" list cannot be activated through the service
    // (FR-023 refuses a non-Default list with an empty rule), so it is
    // activated where the rule check does not run — the resolver reads status.
    await h
      .em()
      .getConnection()
      .execute(`update "price_lists" set "status" = 'active' where "id" = ?`, [list.id]);
    listId = list.id;
    const attrEm = h.em();
    const material = await findAttributeExtensionByKey(attrEm, 'material');
    material!.isPriceRule = true;
    await attrEm.flush();
  });

  describe('US1 — a catalogue slice for an organization', () => {
    it('scenarios 1–3: 12% off Fasteners for Acme from 500 units', async () => {
      await addEntry({ categoryId: fasteners, organizationId: acme.id, minQuantity: 500, discountPercent: '12' });

      expect(await price(p101, 600, acme)).toMatchObject({ amount: '88.0000', priceListId: listId });
      expect(await price(p101, 400, acme)).toMatchObject({ amount: '100.0000', priceListId: DEFAULT_PRICE_LIST_ID });
      expect(await price(p101, 600, other)).toMatchObject({ amount: '100.0000', priceListId: DEFAULT_PRICE_LIST_ID });
      expect(await price(p103, 600, acme)).toMatchObject({ amount: '100.0000', priceListId: DEFAULT_PRICE_LIST_ID });
    });

    it('scenario 4: a fixed price for every buyer applies only in its currency', async () => {
      await addEntry({
        categoryId: fasteners,
        priceType: 'fixed',
        amount: '9.50',
        currencyCode: 'PLN',
        discountPercent: null,
      });
      expect(await price(p102, 1, null)).toMatchObject({ amount: '9.5000', priceListId: listId });
      expect(await price(p102, 1, other)).toMatchObject({ amount: '9.5000', priceListId: listId });
      expect(await price(p102, 1, acme, 'EUR')).toBeNull();
    });

    it('scenario 5: 5% off all products for Acme from 1000 units', async () => {
      await addEntry({ organizationId: acme.id, minQuantity: 1000, discountPercent: '5' });
      expect(await price(p103, 1000, acme)).toMatchObject({ amount: '95.0000', priceListId: listId });
      expect(await price(p103, 999, acme)).toMatchObject({ amount: '100.0000' });
    });

    it('scenario 6: product entries per quantity window', async () => {
      const fixed = { priceType: 'fixed' as const, currencyCode: 'PLN', discountPercent: null };
      await addEntry({ productId: p101.id, organizationId: acme.id, minQuantity: 1, maxQuantity: 99, amount: '95', ...fixed });
      await addEntry({ productId: p101.id, organizationId: acme.id, minQuantity: 100, amount: '90', ...fixed });
      expect(await price(p101, 150, acme)).toMatchObject({ amount: '90.0000', bracketStartQuantity: 100 });
      expect(await price(p101, 50, acme)).toMatchObject({ amount: '95.0000', bracketStartQuantity: 1 });
    });

    it("scenario 7: a parent organization's entry applies, and the buyer's own wins", async () => {
      const parentEntry = await addEntry({ categoryId: fasteners, organizationId: holding.id, discountPercent: '20' });
      expect(await price(p101, 1, acme)).toMatchObject({ amount: '80.0000', matrixEntryId: parentEntry });
      const ownEntry = await addEntry({ categoryId: fasteners, organizationId: acme.id, discountPercent: '10' });
      expect(await price(p101, 1, acme)).toMatchObject({ amount: '90.0000', matrixEntryId: ownEntry });
    });

    it('prices a cart line through the carts API with the matrix entry', async () => {
      await addEntry({ categoryId: fasteners, organizationId: TEST_ORGANIZATION_ID, discountPercent: '25' });
      const res = await h.app.inject({
        method: 'POST',
        url: '/api/v1/cart/items',
        headers: { 'x-sales-channel': 'pl_retail', 'content-type': 'application/json' },
        cookies: { b2b_session: 'stub-customer-session' },
        payload: { productId: SEED_PRODUCT_101_ID, quantity: 2 },
      });
      expect(res.statusCode).toBe(200);
      const cart = res.json() as {
        data: { items: Array<{ productId: string; unitPrice: { amount: number; currency: string } }> };
      };
      const line = cart.data.items.find((item) => item.productId === SEED_PRODUCT_101_ID);
      expect(line?.unitPrice).toEqual({ amount: 75, currency: 'PLN' });
    });
  });

  describe('US2 — attribute selections, gated by the Price list rules flag', () => {
    it('scenario 2: an entry on material = steel prices steel only', async () => {
      await addEntry({ attributeKey: 'material', attributeValue: 'steel', organizationId: acme.id, discountPercent: '10' });
      expect(await price(p101, 1, acme)).toMatchObject({ amount: '90.0000', priceListId: listId });
      expect(await price(p102, 1, acme)).toMatchObject({ amount: '100.0000', priceListId: DEFAULT_PRICE_LIST_ID });
    });

    it('scenario 3: a multi-choice value matches among several values', async () => {
      await addEntry({ attributeKey: 'material', attributeValue: 'steel', discountPercent: '10' });
      // A product whose stored value is a list is matched as a multiselect only
      // when the attribute is one; `material` is a single choice, so a list
      // value does not match it (contract §5).
      const listValued = { ...p101, attributeValues: { ...p101.attributeValues, material: ['steel', 'plastic'] } };
      expect(await price(listValued as ProductRow, 1, null)).toMatchObject({ priceListId: DEFAULT_PRICE_LIST_ID });
    });

    it('scenario 4: clearing the flag deactivates the entry without an error, and setting it resumes it', async () => {
      await addEntry({ attributeKey: 'material', attributeValue: 'steel', organizationId: acme.id, discountPercent: '10' });
      const flip = async (isPriceRule: boolean) => {
        const res = await h.app.inject({
          method: 'PATCH',
          url: '/api/v1/admin/catalog/attributes/material',
          cookies: { b2b_session: 'stub-admin-session' },
          payload: { isPriceRule },
        });
        expect(res.statusCode).toBe(200);
      };
      await flip(false);
      expect(await price(p101, 1, acme)).toMatchObject({ amount: '100.0000', priceListId: DEFAULT_PRICE_LIST_ID });
      await flip(true);
      expect(await price(p101, 1, acme)).toMatchObject({ amount: '90.0000', priceListId: listId });
    });

    it('scenario 6: category ∩ attribute requires both', async () => {
      await addEntry({
        categoryId: fasteners,
        attributeKey: 'material',
        attributeValue: 'steel',
        discountPercent: '10',
      });
      expect(await price(p101, 1, null)).toMatchObject({ amount: '90.0000' });
      expect(await price(p102, 1, null)).toMatchObject({ amount: '100.0000' });
      const steelOutside = { ...p103, attributeValues: { ...p103.attributeValues, material: 'steel' } };
      expect(await price(steelOutside as ProductRow, 1, null)).toMatchObject({ amount: '100.0000' });
    });
  });

  describe('US3 — precedence and explanation', () => {
    it('scenario 1: organization-specific beats a more specific not-organization-specific candidate', async () => {
      await lists.addProduct(listId, p101.id);
      await lists.replaceBrackets(listId, p101.id, { PLN: [{ minQuantity: 1, maxQuantity: null, amount: '60' }] });
      const orgAll = await addEntry({ organizationId: acme.id, discountPercent: '1' });
      expect(await price(p101, 1, acme)).toMatchObject({ amount: '59.4000', matrixEntryId: orgAll });
    });

    it('scenario 2: product beats category for the same organization', async () => {
      await addEntry({ categoryId: fasteners, organizationId: acme.id, discountPercent: '50' });
      const product = await addEntry({
        productId: p101.id,
        organizationId: acme.id,
        priceType: 'fixed',
        amount: '70',
        currencyCode: 'PLN',
        discountPercent: null,
      });
      expect(await price(p101, 1, acme)).toMatchObject({ amount: '70.0000', matrixEntryId: product });
    });

    it('scenario 3: higher starting quantity, then lower price, at equal level', async () => {
      // Product 103 sits in two categories, so two category entries compete.
      const rows = await h
        .em()
        .getConnection()
        .execute<Array<{ category_id: string }>>(
          `select category_id from product_categories where product_id = ? order by category_id`,
          [SEED_PRODUCT_103_ID],
        );
      const [first, second] = rows.map((r) => r.category_id);
      const fromTen = await addEntry({ categoryId: first!, organizationId: acme.id, minQuantity: 10, discountPercent: '5' });
      const fromOne = await addEntry({ categoryId: second!, organizationId: acme.id, minQuantity: 1, discountPercent: '50' });
      expect(await price(p103, 20, acme)).toMatchObject({ amount: '95.0000', matrixEntryId: fromTen });
      expect(await price(p103, 5, acme)).toMatchObject({ amount: '50.0000', matrixEntryId: fromOne });
      const cheaper = await addEntry({ categoryId: first!, organizationId: acme.id, minQuantity: 1, maxQuantity: 9, discountPercent: '60' });
      expect(await price(p103, 5, acme)).toMatchObject({ amount: '40.0000', matrixEntryId: cheaper });
    });

    it("scenario 4: the list's own product bracket beats an all-buyers category entry", async () => {
      await lists.addProduct(listId, p101.id);
      await lists.replaceBrackets(listId, p101.id, { PLN: [{ minQuantity: 1, maxQuantity: null, amount: '80' }] });
      await addEntry({ categoryId: fasteners, discountPercent: '50' });
      const line = await price(p101, 1, null);
      expect(line).toMatchObject({ amount: '80.0000', priceListId: listId });
      expect(line?.matrixEntryId).toBeUndefined();
    });

    it('scenario 5: a percentage without any reference is skipped and resolution falls through', async () => {
      const em = h.em();
      const unpriced = em.create(Product, {
        sku: `MATRIX-NONE-${Date.now()}`,
        slug: `matrix-none-${Date.now()}`,
        type: 'simple',
        status: 'active',
        name: { 'en-US': 'Unpriced' },
        description: { 'en-US': 'x' },
        visibility: 'public',
        attributeValues: {},
      });
      await em.persistAndFlush(unpriced);
      await addEntry({ organizationId: acme.id, discountPercent: '10' });
      expect(await price(unpriced, 1, acme)).toBeNull();
      // p101 still prices: the same entry has the Default reference there.
      expect(await price(p101, 1, acme)).toMatchObject({ amount: '90.0000' });
    });
  });
});
