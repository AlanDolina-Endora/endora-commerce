import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { quoteRequestSchema, type QuoteRequestReadPort } from '@endora-commerce/contracts';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import {
  SEED_PRODUCT_101_ID,
  SEED_PRODUCT_102_ID,
  SEED_PRODUCT_103_ID,
} from '../../helpers/seed-catalog.js';
import { deepStrict, disagreements } from '../../helpers/strict-schema.js';

/**
 * Feature 159 — named, ordered line groups on quote requests
 * (`specs/159-quote-request-item-groups/contracts/quote-requests-api.md`).
 *
 * § ordering (T013): every reading of a quote's lines presents them in the
 * saved order (FR-011) — groups by position, each group's lines by position,
 * then the ungrouped lines — and a quote stored before the feature (every
 * `position = 0`) keeps its `(created_at, id)` order.
 */

const ADMIN = { b2b_session: 'stub-admin-session' };
const CUSTOMER = { b2b_session: 'stub-customer-session' };
const PRODUCTS = [SEED_PRODUCT_101_ID, SEED_PRODUCT_102_ID, SEED_PRODUCT_103_ID] as const;

interface ReplyItem {
  id: string;
  productId: string;
  groupId: string | null;
  position: number;
}
interface Reply {
  id: string;
  version: number;
  status: string;
  itemGroups: { id: string; name: string; position: number }[];
  items: ReplyItem[];
}

describe('159 — quote request line groups [contract]', () => {
  let h: BackendServerHandle;

  const sql = async <T extends object>(query: string, params: unknown[] = []): Promise<T[]> =>
    h.em().getConnection().execute<T[]>(query, params);

  const readPort = (): QuoteRequestReadPort => h.container.resolve('quoteRequestReadPort') as QuoteRequestReadPort;

  async function raise(): Promise<Reply> {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/quote-requests',
      cookies: CUSTOMER,
      payload: { items: PRODUCTS.map((productId) => ({ productId, quantity: 1 })) },
    });
    expect(res.statusCode, res.body).toBe(201);
    return (res.json() as { data: Reply }).data;
  }

  const adminRead = async (id: string): Promise<Reply> => {
    const res = await h.app.inject({ method: 'GET', url: `/api/v1/admin/quote-requests/${id}`, cookies: ADMIN });
    expect(res.statusCode, res.body).toBe(200);
    return (res.json() as { data: Reply }).data;
  };

  const customerRead = async (id: string): Promise<Reply> => {
    const res = await h.app.inject({ method: 'GET', url: `/api/v1/quote-requests/${id}`, cookies: CUSTOMER });
    expect(res.statusCode, res.body).toBe(200);
    return (res.json() as { data: Reply }).data;
  };

  /** The line ids of a quote, by product, as stored. */
  async function lineIdsByProduct(quoteId: string): Promise<Map<string, string>> {
    const rows = await sql<{ id: string; product_id: string }>(
      `select "id", "product_id" from "quote_request_items" where "quote_request_id" = ?`,
      [quoteId],
    );
    return new Map(rows.map((row) => [row.product_id, row.id]));
  }

  beforeAll(async () => {
    h = await setupBackendServer();
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  describe('ordering (T013, FR-011)', () => {
    it('answers ungrouped lines by position on the admin reply, the customer reply and the read port', async () => {
      const quote = await raise();
      const ids = await lineIdsByProduct(quote.id);
      // 101 at position 2, 102 at 0, 103 at 1.
      await sql(`update "quote_request_items" set "position" = 2 where "id" = ?`, [ids.get(SEED_PRODUCT_101_ID)]);
      await sql(`update "quote_request_items" set "position" = 0 where "id" = ?`, [ids.get(SEED_PRODUCT_102_ID)]);
      await sql(`update "quote_request_items" set "position" = 1 where "id" = ?`, [ids.get(SEED_PRODUCT_103_ID)]);
      const expected = [SEED_PRODUCT_102_ID, SEED_PRODUCT_103_ID, SEED_PRODUCT_101_ID];

      const admin = await adminRead(quote.id);
      expect(admin.items.map((item) => item.productId)).toEqual(expected);
      expect(admin.items.map((item) => item.position)).toEqual([0, 1, 2]);
      expect(admin.itemGroups).toEqual([]);

      const customer = await customerRead(quote.id);
      expect(customer.items.map((item) => item.productId)).toEqual(expected);
      expect(customer.items.map((item) => item.groupId)).toEqual([null, null, null]);
      expect(customer.itemGroups).toEqual([]);
      expect(disagreements(deepStrict(quoteRequestSchema), customer)).toEqual([]);

      const records = await readPort().listItems(quote.id);
      expect(records.map((record) => record.productId)).toEqual(expected);
      expect(records.map((record) => record.position)).toEqual([0, 1, 2]);
      expect(records.map((record) => record.group)).toEqual([null, null, null]);
    });

    it('keeps the (created_at, id) order of a quote whose lines all read position 0', async () => {
      const quote = await raise();
      const ids = await lineIdsByProduct(quote.id);
      const base = Date.parse('2026-01-01T00:00:00.000Z');
      const at = (offset: number) => new Date(base + offset * 1000).toISOString();
      await sql(`update "quote_request_items" set "created_at" = ? where "id" = ?`, [at(2), ids.get(SEED_PRODUCT_101_ID)]);
      await sql(`update "quote_request_items" set "created_at" = ? where "id" = ?`, [at(0), ids.get(SEED_PRODUCT_102_ID)]);
      await sql(`update "quote_request_items" set "created_at" = ? where "id" = ?`, [at(1), ids.get(SEED_PRODUCT_103_ID)]);
      const expected = [SEED_PRODUCT_102_ID, SEED_PRODUCT_103_ID, SEED_PRODUCT_101_ID];

      expect((await adminRead(quote.id)).items.map((item) => item.productId)).toEqual(expected);
      expect((await customerRead(quote.id)).items.map((item) => item.productId)).toEqual(expected);
      expect((await readPort().listItems(quote.id)).map((record) => record.productId)).toEqual(expected);
    });

    it('answers groups in order with their lines first; the admin reply keeps an empty group, the customer reply drops it', async () => {
      const quote = await raise();
      const ids = await lineIdsByProduct(quote.id);
      const later = randomUUID();
      const first = randomUUID();
      const empty = randomUUID();
      for (const [id, name, position] of [
        [later, 'Later', 1],
        [first, 'First', 0],
        [empty, 'Empty', 2],
      ] as const) {
        await sql(
          `insert into "quote_request_item_groups" ("id", "quote_request_id", "name", "position", "created_at", "updated_at")
           values (?, ?, ?, ?, now(), now())`,
          [id, quote.id, name, position],
        );
      }
      // 101 ungrouped; 102 in Later; 103 in First.
      await sql(`update "quote_request_items" set "group_id" = ? where "id" = ?`, [later, ids.get(SEED_PRODUCT_102_ID)]);
      await sql(`update "quote_request_items" set "group_id" = ? where "id" = ?`, [first, ids.get(SEED_PRODUCT_103_ID)]);
      const expected = [SEED_PRODUCT_103_ID, SEED_PRODUCT_102_ID, SEED_PRODUCT_101_ID];

      const admin = await adminRead(quote.id);
      expect(admin.itemGroups).toEqual([
        { id: first, name: 'First', position: 0 },
        { id: later, name: 'Later', position: 1 },
        { id: empty, name: 'Empty', position: 2 },
      ]);
      expect(admin.items.map((item) => item.productId)).toEqual(expected);
      expect(admin.items.map((item) => item.groupId)).toEqual([first, later, null]);

      const customer = await customerRead(quote.id);
      expect(customer.itemGroups).toEqual([
        { id: first, name: 'First', position: 0 },
        { id: later, name: 'Later', position: 1 },
      ]);
      expect(customer.items.map((item) => item.productId)).toEqual(expected);
      expect(JSON.stringify(customer)).not.toContain(empty);

      const records = await readPort().listItems(quote.id);
      expect(records.map((record) => record.productId)).toEqual(expected);
      expect(records.map((record) => record.group)).toEqual([
        { id: first, name: 'First', position: 0 },
        { id: later, name: 'Later', position: 1 },
        null,
      ]);
    });
  });
});
