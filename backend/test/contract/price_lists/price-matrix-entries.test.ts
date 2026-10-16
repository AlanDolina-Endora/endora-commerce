import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  priceMatrixEntrySchema,
  priceMatrixListResponseSchema,
  type PriceMatrixEntry,
} from '@endora-commerce/contracts';
import { AuditLogEntry } from '@endora-commerce/platform/kernel';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { SEED_PRODUCT_101_ID } from '../../helpers/seed-catalog.js';
import { TEST_ORGANIZATION_ID } from '../../helpers/test-actors.js';

/**
 * Feature 148 — the admin price matrix API
 * (`specs/148-price-list-matrix-rules/contracts/admin-price-matrix-api.md`):
 * CRUD under `/api/v1/admin/price-lists-engine/:id/matrix`, the refusals a
 * shape, an unknown target, an ineligible attribute and an overlap answer, and
 * the list's filters, paging and order.
 */
const ADMIN = { b2b_session: 'stub-admin-session' };
const UNKNOWN = '00000000-0000-4000-8000-00000000f148';

type Res = Awaited<ReturnType<BackendServerHandle['app']['inject']>>;

describe('admin price matrix API (feature 148)', () => {
  let h: BackendServerHandle;
  let listId: string;
  let otherListId: string;
  let categoryId: string;
  const stamp = Date.now();

  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown): Promise<Res> =>
    h.app.inject({ method, url, cookies: ADMIN, ...(payload !== undefined ? { payload: payload as object } : {}) });
  const matrixUrl = (id = listId) => `/api/v1/admin/price-lists-engine/${id}/matrix`;
  const errorOf = (res: Res) =>
    (res.json() as { error: { code: string; details?: Record<string, unknown> } }).error;

  async function createList(name: string): Promise<string> {
    const res = await call('POST', '/api/v1/admin/price-lists-engine', { name, type: 'base' });
    expect(res.statusCode).toBe(201);
    return (res.json() as { data: { id: string } }).data.id;
  }

  async function createAttribute(key: string, extra: Record<string, unknown>): Promise<void> {
    const res = await call('POST', '/api/v1/admin/catalog/attributes', {
      key,
      label: { 'en-US': key },
      labelDefault: key,
      isSearchable: false,
      isFilterable: false,
      isVariantAxis: false,
      ...extra,
    });
    expect(res.statusCode, res.body).toBe(201);
  }

  async function flag(key: string, isPriceRule: boolean): Promise<void> {
    const res = await call('PATCH', `/api/v1/admin/catalog/attributes/${key}`, { isPriceRule });
    expect(res.statusCode).toBe(200);
  }

  async function create(body: Record<string, unknown>, id = listId): Promise<PriceMatrixEntry> {
    const res = await call('POST', matrixUrl(id), body);
    expect(res.statusCode, res.body).toBe(201);
    return priceMatrixEntrySchema.parse((res.json() as { data: unknown }).data);
  }

  beforeAll(async () => {
    h = await setupBackendServer();
    listId = await createList(`Matrix contract ${stamp}`);
    otherListId = await createList(`Matrix contract other ${stamp}`);
    const rows = await h
      .em()
      .getConnection()
      .execute<Array<{ category_id: string }>>(
        `select category_id from product_categories where product_id = ?`,
        [SEED_PRODUCT_101_ID],
      );
    categoryId = rows[0]!.category_id;
    await flag('material', true);
  }, 120_000);

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  describe('create, read, update, delete (US1)', () => {
    let categoryEntry: PriceMatrixEntry;

    it('creates a category × organization × percentage entry', async () => {
      categoryEntry = await create({
        categoryId,
        organizationId: TEST_ORGANIZATION_ID,
        minQuantity: 500,
        price: { type: 'discount_percent', percent: '12' },
      });
      expect(categoryEntry).toMatchObject({
        priceListId: listId,
        selectionKind: 'category',
        categoryId,
        organizationId: TEST_ORGANIZATION_ID,
        minQuantity: 500,
        maxQuantity: null,
        price: { type: 'discount_percent', percent: '12' },
        active: true,
        inactiveReason: null,
        targetDeleted: false,
      });
      expect(categoryEntry.labels.category).toBeTruthy();
      expect(categoryEntry.labels.organization).toBeTruthy();
    });

    it('creates a product × organization × fixed entry and an all-products percentage entry', async () => {
      const product = await create({
        productId: SEED_PRODUCT_101_ID,
        organizationId: TEST_ORGANIZATION_ID,
        minQuantity: 1,
        maxQuantity: 99,
        price: { type: 'fixed', amount: '95.00', currencyCode: 'PLN' },
      });
      expect(product).toMatchObject({
        selectionKind: 'product',
        price: { type: 'fixed', amount: '95', currencyCode: 'PLN' },
      });
      expect(product.labels.product?.sku).toBeTruthy();
      const all = await create({
        organizationId: TEST_ORGANIZATION_ID,
        minQuantity: 1000,
        price: { type: 'discount_percent', percent: '5' },
      });
      expect(all.selectionKind).toBe('all');
    });

    it('reads one entry and the page', async () => {
      const one = await call('GET', `${matrixUrl()}/${categoryEntry.id}`);
      expect(one.statusCode).toBe(200);
      expect(priceMatrixEntrySchema.parse((one.json() as { data: unknown }).data).id).toBe(categoryEntry.id);

      const page = await call('GET', matrixUrl());
      expect(page.statusCode).toBe(200);
      const body = priceMatrixListResponseSchema.parse(page.json());
      expect(body.data.total).toBe(3);
      expect(body.data.limit).toBe(5000);
      // Organization-specific, by specificity: product, category, all.
      expect(body.data.items.map((i) => i.selectionKind)).toEqual(['product', 'category', 'all']);
    });

    it('updates an entry, and a patch that changes nothing is not audited', async () => {
      const res = await call('PATCH', `${matrixUrl()}/${categoryEntry.id}`, { minQuantity: 600 });
      expect(res.statusCode).toBe(200);
      expect((res.json() as { data: PriceMatrixEntry }).data.minQuantity).toBe(600);

      const audited = async () =>
        h.em().count(AuditLogEntry, { action: 'price_list.matrix_entry_update', objectId: listId });
      const before = await audited();
      const noop = await call('PATCH', `${matrixUrl()}/${categoryEntry.id}`, { minQuantity: 600 });
      expect(noop.statusCode).toBe(200);
      expect(await audited()).toBe(before);
    });

    it('refuses an empty patch', async () => {
      const res = await call('PATCH', `${matrixUrl()}/${categoryEntry.id}`, {});
      expect(res.statusCode).toBe(400);
    });

    it('deletes an entry', async () => {
      const entry = await create({ categoryId, minQuantity: 1, price: { type: 'discount_percent', percent: '1' } });
      expect((await call('DELETE', `${matrixUrl()}/${entry.id}`)).statusCode).toBe(204);
      const gone = await call('GET', `${matrixUrl()}/${entry.id}`);
      expect(gone.statusCode).toBe(404);
      expect(errorOf(gone).code).toBe('PRICE_MATRIX_ENTRY_NOT_FOUND');
    });
  });

  describe('refusals', () => {
    it('400 for a shape the table would refuse', async () => {
      const fixedOnAll = await call('POST', matrixUrl(), {
        minQuantity: 1,
        price: { type: 'fixed', amount: '1', currencyCode: 'PLN' },
      });
      expect(fixedOnAll.statusCode).toBe(400);
      const productWithoutOrg = await call('POST', matrixUrl(), {
        productId: SEED_PRODUCT_101_ID,
        minQuantity: 1,
        price: { type: 'fixed', amount: '1', currencyCode: 'PLN' },
      });
      expect(productWithoutOrg.statusCode).toBe(400);
    });

    it('400 VALIDATION_FAILED for an unknown product, category or organization, and an unoffered currency', async () => {
      for (const body of [
        { productId: UNKNOWN, organizationId: TEST_ORGANIZATION_ID },
        { categoryId: UNKNOWN },
        { categoryId, organizationId: UNKNOWN },
      ]) {
        const res = await call('POST', matrixUrl(), {
          ...body,
          minQuantity: 7,
          price: { type: 'discount_percent', percent: '3' },
        });
        expect(res.statusCode, JSON.stringify(body)).toBe(400);
        expect(errorOf(res).code).toBe('VALIDATION_FAILED');
      }
      const currency = await call('POST', matrixUrl(), {
        categoryId,
        minQuantity: 7,
        price: { type: 'fixed', amount: '1', currencyCode: 'XTS' },
      });
      expect(currency.statusCode).toBe(400);
      expect(errorOf(currency).code).toBe('VALIDATION_FAILED');
    });

    it('409 PRICE_MATRIX_ENTRY_OVERLAP names the conflicting entry', async () => {
      const first = await create({
        categoryId,
        minQuantity: 10,
        maxQuantity: 20,
        price: { type: 'fixed', amount: '5', currencyCode: 'PLN' },
      });
      const res = await call('POST', matrixUrl(), {
        categoryId,
        minQuantity: 15,
        price: { type: 'discount_percent', percent: '3' },
      });
      expect(res.statusCode).toBe(409);
      expect(errorOf(res)).toMatchObject({
        code: 'PRICE_MATRIX_ENTRY_OVERLAP',
        details: { conflictingEntryId: first.id },
      });
      // A fixed price in another currency does not overlap it.
      const eur = await call('POST', matrixUrl(), {
        categoryId,
        minQuantity: 10,
        maxQuantity: 20,
        price: { type: 'fixed', amount: '5', currencyCode: 'EUR' },
      });
      expect([201, 400]).toContain(eur.statusCode);
      if (eur.statusCode === 400) expect(errorOf(eur).code).toBe('VALIDATION_FAILED');
    });

    it('404 PRICE_MATRIX_ENTRY_NOT_FOUND for an entry of another list; 404 PRICE_LIST_NOT_FOUND for a missing list', async () => {
      const elsewhere = await create(
        { categoryId, minQuantity: 1, price: { type: 'discount_percent', percent: '2' } },
        otherListId,
      );
      for (const method of ['GET', 'PATCH', 'DELETE'] as const) {
        const res = await call(method, `${matrixUrl()}/${elsewhere.id}`, method === 'PATCH' ? { minQuantity: 2 } : undefined);
        expect(res.statusCode).toBe(404);
        expect(errorOf(res).code).toBe('PRICE_MATRIX_ENTRY_NOT_FOUND');
      }
      const missing = await call('GET', matrixUrl(UNKNOWN));
      expect(missing.statusCode).toBe(404);
      expect(errorOf(missing).code).toBe('PRICE_LIST_NOT_FOUND');
    });
  });

  describe('attribute eligibility (US2, FR-008/FR-009)', () => {
    const attempt = (key: string, value: string) =>
      call('POST', matrixUrl(), {
        attribute: { key, value },
        minQuantity: 3,
        price: { type: 'discount_percent', percent: '4' },
      });

    it('accepts a flagged choice attribute and one of its values', async () => {
      const res = await attempt('material', 'steel');
      expect(res.statusCode, res.body).toBe(201);
      const entry = (res.json() as { data: PriceMatrixEntry }).data;
      expect(entry).toMatchObject({ selectionKind: 'attribute', active: true });
      expect(entry.labels.attribute).toEqual({ label: 'Material', valueLabel: 'steel' });
    });

    it.each([
      ['not_found', () => attempt(`missing_${stamp}`, 'x')],
      ['not_flagged', () => attempt('color', 'red')],
      ['unknown_value', () => attempt('material', 'gold')],
    ])('400 PRICE_MATRIX_ATTRIBUTE_NOT_ELIGIBLE — %s', async (reason, run) => {
      const res = await run();
      expect(res.statusCode).toBe(400);
      expect(errorOf(res)).toMatchObject({ code: 'PRICE_MATRIX_ATTRIBUTE_NOT_ELIGIBLE', details: { reason } });
    });

    it('refuses per-language, per-channel and free-value attributes, naming why', async () => {
      const options = [
        { value: 'a', labelDefault: 'A' },
        { value: 'b', labelDefault: 'B' },
      ];
      await createAttribute(`pm_lang_${stamp}`, { type: 'select', options, languageScoped: true, isPriceRule: true });
      await createAttribute(`pm_chan_${stamp}`, { type: 'select', options, channelScoped: true, isPriceRule: true });
      await createAttribute(`pm_text_${stamp}`, { type: 'input', isPriceRule: true });
      for (const [key, reason] of [
        [`pm_lang_${stamp}`, 'language_scoped'],
        [`pm_chan_${stamp}`, 'channel_scoped'],
        [`pm_text_${stamp}`, 'value_type'],
      ] as const) {
        const res = await attempt(key, 'a');
        expect(res.statusCode, key).toBe(400);
        expect(errorOf(res)).toMatchObject({ code: 'PRICE_MATRIX_ATTRIBUTE_NOT_ELIGIBLE', details: { reason } });
      }
    });

    it('lists an entry whose attribute lost the flag as inactive, and active again when it returns', async () => {
      const list = async () =>
        priceMatrixListResponseSchema.parse((await call('GET', `${matrixUrl()}?selectionKind=attribute`)).json());
      await flag('material', false);
      expect((await list()).data.items[0]).toMatchObject({ active: false, inactiveReason: 'attribute_not_flagged' });
      await flag('material', true);
      expect((await list()).data.items[0]).toMatchObject({ active: true, inactiveReason: null });
    });
  });

  describe('filters, paging and order (US4)', () => {
    it('filters by selection kind, organization, product and category', async () => {
      const get = async (query: string) =>
        priceMatrixListResponseSchema.parse((await call('GET', `${matrixUrl()}?${query}`)).json()).data;
      expect((await get('selectionKind=product')).items.every((i) => i.selectionKind === 'product')).toBe(true);
      expect((await get('organizationId=none')).items.every((i) => i.organizationId === null)).toBe(true);
      expect((await get(`organizationId=${TEST_ORGANIZATION_ID}`)).items.every((i) => i.organizationId === TEST_ORGANIZATION_ID)).toBe(true);
      expect((await get(`productId=${SEED_PRODUCT_101_ID}`)).items.map((i) => i.productId)).toEqual([SEED_PRODUCT_101_ID]);
      expect((await get(`categoryId=${categoryId}`)).items.every((i) => i.categoryId === categoryId)).toBe(true);
    });

    it('pages, with organization-less entries first', async () => {
      const all = priceMatrixListResponseSchema.parse((await call('GET', matrixUrl())).json()).data;
      const firstOrgSpecific = all.items.findIndex((i) => i.organizationId !== null);
      expect(all.items.slice(firstOrgSpecific).every((i) => i.organizationId !== null)).toBe(true);
      const second = priceMatrixListResponseSchema.parse((await call('GET', `${matrixUrl()}?page=1&pageSize=1`)).json()).data;
      expect(second.total).toBe(all.total);
      expect(second.items.map((i) => i.id)).toEqual([all.items[1]!.id]);
    });
  });
});
