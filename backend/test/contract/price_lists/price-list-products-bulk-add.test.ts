import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogEntry, hashPassword } from '@endora-commerce/platform/kernel';
import {
  AdminUser,
  PriceList,
  PriceListProduct,
  Product,
} from '../../helpers/package-entities.js';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { ADMIN_COOKIES } from '../../helpers/test-actors.js';
import {
  DefaultPriceListMigrator,
  DEFAULT_PRICE_LIST_ID,
} from '../../../../packages/modules/price_lists/src/backend/services/default-price-list-migration.js';
import { STUB_CUSTOMER_PASSWORD } from '../../helpers/seed-organizations.js';

/**
 * Feature 145 / US4 — `POST /api/v1/admin/price-lists-engine/:id/products/bulk-add`
 * (`specs/145-admin-product-picker/contracts/price-list-bulk-add.md`, FR-041…FR-045,
 * SC-006, SC-007).
 *
 * One request adds many products to a price list's roster and reports each
 * unique id as `added`, `unchanged` (already on the roster — checked first) or
 * `failed: product_not_found` (unknown or soft-deleted). It is one Command:
 * one `price_list.products_add` audit entry carrying counts only, and none at
 * all when nothing was added. Every refusal writes nothing and audits nothing.
 */
const ADMIN = { cookies: { b2b_session: 'stub-admin-session' } };

const PRICING_VIEWER = { cookies: { b2b_session: 'stub-pl145-pricing-viewer-session' } };
const PRICING_VIEWER_ID = '00000000-0000-4000-8000-000000145f01';

const ACTION = 'price_list.products_add';

interface BulkAddResult {
  added: string[];
  unchanged: string[];
  failed: Array<{ productId: string; reason: string }>;
}

describe('POST /api/v1/admin/price-lists-engine/:id/products/bulk-add (feature 145 US4)', () => {
  let h: BackendServerHandle;
  let skuSeq = 0;

  /** Inserts `count` live products straight through the ORM and returns their ids. */
  async function seedProducts(
    count: number,
    overrides: { status?: 'draft' | 'active' | 'inactive'; archived?: boolean } = {},
  ): Promise<string[]> {
    const em = h.em();
    const rows = Array.from({ length: count }, () => {
      skuSeq += 1;
      const sku = `PL145-BULK-${skuSeq.toString().padStart(4, '0')}`;
      return em.create(Product, {
        sku,
        slug: sku.toLowerCase(),
        type: 'simple',
        status: overrides.status ?? 'active',
        name: { 'en-US': `Bulk-add probe ${sku}` },
        description: { 'en-US': 'Price-list bulk-add fixture.' },
        visibility: 'public',
        attributeValues: {},
        ...(overrides.archived ? { archivedAt: new Date() } : {}),
      });
    });
    await em.flush();
    return rows.map((r) => r.id);
  }

  async function softDelete(ids: readonly string[]): Promise<void> {
    const em = h.em();
    const rows = await em.find(Product, { id: { $in: [...ids] } });
    for (const row of rows) row.deletedAt = new Date();
    await em.flush();
  }

  async function createList(name: string): Promise<string> {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/price-lists-engine',
      ...ADMIN,
      payload: { name, type: 'sale' },
    });
    expect(res.statusCode).toBe(201);
    return (res.json() as { data: { id: string } }).data.id;
  }

  function bulkAdd(listId: string, payload: unknown, actor = ADMIN) {
    return h.app.inject({
      method: 'POST',
      url: `/api/v1/admin/price-lists-engine/${listId}/products/bulk-add`,
      ...actor,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(payload),
    });
  }

  async function rosterIds(listId: string): Promise<string[]> {
    const rows = await h.em().find(PriceListProduct, { priceListId: listId });
    return rows.map((r) => r.productId).sort();
  }

  async function auditEntries(listId: string): Promise<AuditLogEntry[]> {
    return h.em().find(AuditLogEntry, { action: ACTION, objectId: listId });
  }

  beforeAll(async () => {
    h = await setupBackendServer();

    const role = await h.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/admin-roles/pl145_pricing_viewer',
      ...ADMIN,
      payload: {
        code: 'pl145_pricing_viewer',
        name: 'Pricing viewer (145)',
        permissions: ['price_lists:read'],
      },
    });
    expect(role.statusCode).toBe(200);
    const em = h.em();
    em.create(AdminUser, {
      id: PRICING_VIEWER_ID,
      email: 'pl145-pricing-viewer@example.com',
      passwordHash: await hashPassword(STUB_CUSTOMER_PASSWORD),
      firstName: 'Price',
      lastName: 'Viewer',
      adminRoleId: (role.json() as { data: { id: string } }).data.id,
      status: 'active',
    });
    await em.flush();
    ADMIN_COOKIES['stub-pl145-pricing-viewer-session'] = { adminUserId: PRICING_VIEWER_ID };
  });

  afterAll(async () => {
    delete ADMIN_COOKIES['stub-pl145-pricing-viewer-session'];
    await teardownBackendServer(h);
  });

  it('adds 30 new products — an inactive archived one included — with one counts-only audit entry', async () => {
    const listId = await createList('Bulk add — 30 new');
    const active = await seedProducts(29);
    const [inactive] = await seedProducts(1, { status: 'inactive', archived: true });
    const ids = [...active.slice(0, 10), inactive!, ...active.slice(10)];

    const res = await bulkAdd(listId, { productIds: ids });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: BulkAddResult };
    expect(body.data).toEqual({ added: ids, unchanged: [], failed: [] });

    expect(await rosterIds(listId)).toEqual([...ids].sort());

    const entries = await auditEntries(listId);
    expect(entries).toHaveLength(1);
    const after = (entries[0]!.stateAfter ?? {}) as Record<string, unknown>;
    expect(after).toEqual({ name: 'Bulk add — 30 new', added: 30, unchanged: 0, failed: 0 });
    expect(JSON.stringify(entries[0]!.stateAfter)).not.toContain(ids[0]!);
    expect(entries[0]!.objectType).toBe('price_list');
  });

  it('fails soft-deleted products with product_not_found and adds the rest', async () => {
    const listId = await createList('Bulk add — soft-deleted');
    const ids = await seedProducts(30);
    const gone = [ids[3]!, ids[17]!];
    await softDelete(gone);

    const res = await bulkAdd(listId, { productIds: ids });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: BulkAddResult };
    expect(body.data.added).toEqual(ids.filter((id) => !gone.includes(id)));
    expect(body.data.unchanged).toEqual([]);
    expect(body.data.failed).toEqual(gone.map((productId) => ({ productId, reason: 'product_not_found' })));

    expect(await rosterIds(listId)).toEqual(ids.filter((id) => !gone.includes(id)).sort());
    const entries = await auditEntries(listId);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.stateAfter).toMatchObject({ added: 28, unchanged: 0, failed: 2 });
  });

  it('reports a product already on the list as unchanged and leaves its brackets untouched', async () => {
    const listId = await createList('Bulk add — existing brackets');
    const [existing, ...rest] = await seedProducts(5);

    const single = await h.app.inject({
      method: 'POST',
      url: `/api/v1/admin/price-lists-engine/${listId}/products`,
      ...ADMIN,
      payload: { productId: existing },
    });
    expect(single.statusCode).toBe(201);
    const brackets = await h.app.inject({
      method: 'PUT',
      url: `/api/v1/admin/price-lists-engine/${listId}/products/${existing}/brackets`,
      ...ADMIN,
      payload: {
        bracketsByCurrency: {
          PLN: [
            { minQuantity: 1, maxQuantity: 9, amount: '100.0000' },
            { minQuantity: 10, maxQuantity: null, amount: '90.0000' },
          ],
          EUR: [{ minQuantity: 1, maxQuantity: null, amount: '24.0000' }],
        },
      },
    });
    expect(brackets.statusCode).toBe(200);

    const readBrackets = () =>
      h.app.inject({
        method: 'GET',
        url: `/api/v1/admin/price-lists-engine/${listId}/products/${existing}/brackets`,
        ...ADMIN,
      });
    const before = (await readBrackets()).body;

    const res = await bulkAdd(listId, { productIds: [rest[0]!, existing!, ...rest.slice(1)] });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: BulkAddResult };
    expect(body.data).toEqual({ added: rest, unchanged: [existing], failed: [] });

    expect((await readBrackets()).body).toBe(before);
    expect(await rosterIds(listId)).toEqual([existing!, ...rest].sort());
    const entries = await auditEntries(listId);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.stateAfter).toMatchObject({ added: 4, unchanged: 1, failed: 0 });
  });

  it('answers 200 with every id unchanged and writes no audit entry when all are present; a retry is the same', async () => {
    const listId = await createList('Bulk add — retry');
    const ids = await seedProducts(4);

    const first = await bulkAdd(listId, { productIds: ids });
    expect(first.statusCode).toBe(200);
    expect(await auditEntries(listId)).toHaveLength(1);

    const retry = await bulkAdd(listId, { productIds: ids });
    expect(retry.statusCode).toBe(200);
    expect((retry.json() as { data: BulkAddResult }).data).toEqual({
      added: [],
      unchanged: ids,
      failed: [],
    });
    expect(await auditEntries(listId)).toHaveLength(1);
    expect(await rosterIds(listId)).toEqual([...ids].sort());
  });

  it('two concurrent adds of the same new product: one adds it, the other may answer 409 VERSION_CONFLICT or unchanged; a retry reports it unchanged', async () => {
    const listId = await createList('Bulk add — concurrent');
    const [id] = await seedProducts(1);

    // Which outcome the loser gets depends on whether it read the roster before
    // or after the winner committed — both are correct, neither is deterministic.
    const [a, b] = await Promise.all([
      bulkAdd(listId, { productIds: [id!] }),
      bulkAdd(listId, { productIds: [id!] }),
    ]);
    const winners = [a, b].filter(
      (r) => r.statusCode === 200 && (r.json() as { data: BulkAddResult }).data.added.includes(id!),
    );
    expect(winners).toHaveLength(1);
    const loser = winners[0] === a ? b : a;
    if (loser.statusCode === 409) {
      expect((loser.json() as { error: { code: string } }).error.code).toBe('VERSION_CONFLICT');
    } else {
      expect(loser.statusCode).toBe(200);
      expect((loser.json() as { data: BulkAddResult }).data).toEqual({
        added: [],
        unchanged: [id],
        failed: [],
      });
    }

    const retry = await bulkAdd(listId, { productIds: [id!] });
    expect(retry.statusCode).toBe(200);
    expect((retry.json() as { data: BulkAddResult }).data).toEqual({ added: [], unchanged: [id], failed: [] });

    // One roster row and one audit entry, whichever way the race went.
    expect(await rosterIds(listId)).toEqual([id]);
    expect(await auditEntries(listId)).toHaveLength(1);
  });

  it('adds 200 products in one request with one audit entry (SC-007)', async () => {
    const listId = await createList('Bulk add — 200');
    const ids = await seedProducts(200);

    const res = await bulkAdd(listId, { productIds: ids });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: BulkAddResult }).data.added).toHaveLength(200);
    expect(await rosterIds(listId)).toHaveLength(200);
    const entries = await auditEntries(listId);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.stateAfter).toMatchObject({ added: 200, unchanged: 0, failed: 0 });
  });

  it('refuses the system Default list with 403 FORBIDDEN, writing and auditing nothing', async () => {
    if (!(await h.em().findOne(PriceList, { id: DEFAULT_PRICE_LIST_ID }))) {
      await new DefaultPriceListMigrator(h.em).seedDefault();
    }
    const defaultList = await h.em().findOne(PriceList, { id: DEFAULT_PRICE_LIST_ID });
    expect(defaultList?.isSystem).toBe(true);
    const listId = DEFAULT_PRICE_LIST_ID;
    const rosterBefore = await rosterIds(listId);
    const ids = await seedProducts(2);

    const res = await bulkAdd(listId, { productIds: ids });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    expect(await rosterIds(listId)).toEqual(rosterBefore);
    expect(await auditEntries(listId)).toHaveLength(0);
  });

  it('answers 404 NOT_FOUND for an unknown list and for a deleted one', async () => {
    const ids = await seedProducts(1);

    const unknownId = randomUUID();
    const unknown = await bulkAdd(unknownId, { productIds: ids });
    expect(unknown.statusCode).toBe(404);
    expect((unknown.json() as { error: { code: string } }).error.code).toBe('NOT_FOUND');
    expect(await rosterIds(unknownId)).toEqual([]);
    expect(await auditEntries(unknownId)).toHaveLength(0);

    const deletedId = await createList('Bulk add — deleted');
    const del = await h.app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/price-lists-engine/${deletedId}`,
      ...ADMIN,
    });
    expect(del.statusCode).toBe(204);
    const deleted = await bulkAdd(deletedId, { productIds: ids });
    expect(deleted.statusCode).toBe(404);
    expect((deleted.json() as { error: { code: string } }).error.code).toBe('NOT_FOUND');
    expect(await rosterIds(deletedId)).toEqual([]);
    expect(await auditEntries(deletedId)).toHaveLength(0);
  });

  it('answers 400 VALIDATION_FAILED for an invalid body, writing and auditing nothing', async () => {
    const listId = await createList('Bulk add — invalid');
    const ids = await seedProducts(1);
    const tooMany = Array.from({ length: 201 }, () => randomUUID());

    for (const payload of [
      { productIds: tooMany },
      { productIds: [] },
      { productIds: [ids[0]!, 'not-a-uuid'] },
      ['not', 'an', 'object'],
      {},
    ]) {
      const res = await bulkAdd(listId, payload);
      expect(res.statusCode, JSON.stringify(payload).slice(0, 80)).toBe(400);
      expect((res.json() as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
    }

    expect(await rosterIds(listId)).toEqual([]);
    expect(await auditEntries(listId)).toHaveLength(0);
  });

  it('refuses a role without price_lists:write with 403', async () => {
    const listId = await createList('Bulk add — viewer');
    const ids = await seedProducts(1);

    const res = await bulkAdd(listId, { productIds: ids }, PRICING_VIEWER);
    expect(res.statusCode).toBe(403);
    expect(await rosterIds(listId)).toEqual([]);
    expect(await auditEntries(listId)).toHaveLength(0);
  });
});
