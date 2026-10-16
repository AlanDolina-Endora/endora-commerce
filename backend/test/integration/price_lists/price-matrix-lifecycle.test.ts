import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogEntry } from '@endora-commerce/platform/kernel';
import {
  Category,
  Organization,
  PriceListMatrixEntry,
  Product,
} from '../../helpers/package-entities.js';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { TEST_ORGANIZATION_ID } from '../../helpers/test-actors.js';

/**
 * Feature 148 / FR-025, FR-007 — what happens to matrix entries around them:
 * a duplicated list carries its matrix; a deleted list, a purged product,
 * category or organization takes the entries naming it; a soft-deleted
 * category leaves its entries listed and marked; the 5 001st entry is refused.
 */
describe('price matrix — lifecycle (feature 148)', () => {
  let h: BackendServerHandle;
  const ADMIN = { b2b_session: 'stub-admin-session' };
  const stamp = Date.now();

  const call = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
    h.app.inject({ method, url, cookies: ADMIN, ...(payload ? { payload } : {}) });

  async function createList(name: string): Promise<string> {
    const res = await call('POST', '/api/v1/admin/price-lists-engine', { name, type: 'base' });
    expect(res.statusCode).toBe(201);
    return (res.json() as { data: { id: string } }).data.id;
  }

  async function addEntry(listId: string, body: object): Promise<string> {
    const res = await call('POST', `/api/v1/admin/price-lists-engine/${listId}/matrix`, body);
    expect(res.statusCode, res.body).toBe(201);
    return (res.json() as { data: { id: string } }).data.id;
  }

  beforeAll(async () => {
    h = await setupBackendServer();
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  it('copies the matrix when a list is duplicated, and records the count', async () => {
    const source = await createList(`Matrix dup ${stamp}`);
    await addEntry(source, { organizationId: TEST_ORGANIZATION_ID, minQuantity: 1, maxQuantity: 99, price: { type: 'discount_percent', percent: '5' } });
    await addEntry(source, { organizationId: TEST_ORGANIZATION_ID, minQuantity: 100, price: { type: 'discount_percent', percent: '8' } });

    const dup = await call('POST', `/api/v1/admin/price-lists-engine/${source}/duplicate`);
    expect(dup.statusCode).toBe(201);
    const copyId = (dup.json() as { data: { id: string } }).data.id;

    const em = h.em();
    const original = await em.find(PriceListMatrixEntry, { priceListId: source }, { orderBy: { minQuantity: 'asc' } });
    const copied = await em.find(PriceListMatrixEntry, { priceListId: copyId }, { orderBy: { minQuantity: 'asc' } });
    expect(copied.map((e) => [e.minQuantity, e.discountPercent, e.organizationId])).toEqual(
      original.map((e) => [e.minQuantity, e.discountPercent, e.organizationId]),
    );
    expect(new Set(copied.map((e) => e.id)).size).toBe(2);
    expect(copied.some((c) => original.some((o) => o.id === c.id))).toBe(false);

    const audit = await em.find(AuditLogEntry, { action: 'price_list.duplicate', objectId: copyId });
    expect(audit[0]?.stateAfter).toMatchObject({ matrixEntryCount: 2 });
  });

  it('removes the entries with their list', async () => {
    const list = await createList(`Matrix delete ${stamp}`);
    await addEntry(list, { minQuantity: 1, price: { type: 'discount_percent', percent: '5' } });
    expect((await call('DELETE', `/api/v1/admin/price-lists-engine/${list}`)).statusCode).toBe(204);
    expect(await h.em().count(PriceListMatrixEntry, { priceListId: list })).toBe(0);
  });

  it('removes the entries naming a purged product, category or organization', async () => {
    const em = h.em();
    const list = await createList(`Matrix purge ${stamp}`);
    const product = em.create(Product, {
      sku: `MX-PURGE-${stamp}`,
      slug: `mx-purge-${stamp}`,
      type: 'simple',
      status: 'active',
      name: { 'en-US': 'Purged' },
      description: { 'en-US': 'x' },
      visibility: 'public',
      attributeValues: {},
    });
    const category = em.create(Category, { name: { 'en-US': 'Purged' }, slug: `mx-purge-${stamp}` });
    const organization = em.create(Organization, {
      name: 'Purged Org',
      taxId: `PL148P${String(stamp).slice(-7)}`,
      status: 'active',
      vatStatus: 'vat_payer',
      registeredAddress: { street: '-', city: '-', postalCode: '-', country: 'PL' },
    });
    await em.persistAndFlush([product, category, organization]);

    const onProduct = await addEntry(list, {
      productId: product.id,
      organizationId: TEST_ORGANIZATION_ID,
      minQuantity: 1,
      price: { type: 'fixed', amount: '1', currencyCode: 'PLN' },
    });
    const onCategory = await addEntry(list, { categoryId: category.id, minQuantity: 1, price: { type: 'discount_percent', percent: '1' } });
    const onOrganization = await addEntry(list, {
      organizationId: organization.id,
      minQuantity: 1,
      price: { type: 'discount_percent', percent: '1' },
    });

    const conn = em.getConnection();
    await conn.execute(`delete from "products" where "id" = ?`, [product.id]);
    await conn.execute(`delete from "categories" where "id" = ?`, [category.id]);
    await conn.execute(`delete from "organizations" where "id" = ?`, [organization.id]);

    expect(await h.em().count(PriceListMatrixEntry, { id: { $in: [onProduct, onCategory, onOrganization] } })).toBe(0);
  });

  it('keeps an entry naming a soft-deleted category and marks it', async () => {
    const em = h.em();
    const list = await createList(`Matrix soft ${stamp}`);
    const category = em.create(Category, { name: { 'en-US': 'Soft' }, slug: `mx-soft-${stamp}` });
    await em.persistAndFlush(category);
    const entry = await addEntry(list, { categoryId: category.id, minQuantity: 1, price: { type: 'discount_percent', percent: '1' } });
    await em.getConnection().execute(`update "categories" set "deleted_at" = now() where "id" = ?`, [category.id]);

    const res = await call('GET', `/api/v1/admin/price-lists-engine/${list}/matrix`);
    expect(res.statusCode).toBe(200);
    const items = (res.json() as { data: { items: Array<{ id: string; targetDeleted: boolean; labels: { category: string | null } }> } }).data.items;
    expect(items).toEqual([expect.objectContaining({ id: entry, targetDeleted: true })]);
    expect(items[0]!.labels.category).toBeNull();
  });

  it('refuses the 5 001st entry with PRICE_MATRIX_ENTRY_LIMIT', async () => {
    const list = await createList(`Matrix limit ${stamp}`);
    // 5 000 non-overlapping windows in one statement.
    await h
      .em()
      .getConnection()
      .execute(
        `insert into "price_list_matrix_entries"
           ("id", "price_list_id", "min_quantity", "max_quantity", "price_type", "discount_percent", "created_at", "updated_at")
         select gen_random_uuid(), ?, g, g, 'discount_percent', 1, now(), now()
           from generate_series(1, 5000) as g`,
        [list],
      );
    const res = await call('POST', `/api/v1/admin/price-lists-engine/${list}/matrix`, {
      minQuantity: 9000,
      price: { type: 'discount_percent', percent: '1' },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string; details: { limit: number } } }).error).toMatchObject({
      code: 'PRICE_MATRIX_ENTRY_LIMIT',
      details: { limit: 5000 },
    });
  });
});
