import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';

/**
 * `specs/147-saved-views/` QA — the item routes of every list answer a view id
 * that was just deleted as a 404 (the Admin UI's "gone" path).
 */
const LISTS = [
  { label: 'orders', url: '/api/v1/admin/orders/list-views', body: { sort: { field: 'placedAt', dir: 'desc' } } },
  { label: 'catalog', url: '/api/v1/admin/catalog/products/list-views', body: {} },
  { label: 'quote_requests', url: '/api/v1/admin/quote-requests/list-views', body: {} },
];

describe('saved view item routes — deleted ids (spec 147 QA)', () => {
  let h: BackendServerHandle;
  const admin = { cookies: { b2b_session: 'stub-admin-session' } };
  const run = randomUUID().slice(0, 8);

  beforeAll(async () => {
    h = await setupBackendServer();
  });
  afterAll(async () => {
    await teardownBackendServer(h);
  });

  describe.each(LISTS)('$label', ({ url, body }) => {
    it('answers DELETE of an already-deleted view with 404', async () => {
      const created = await h.app.inject({
        method: 'POST',
        url,
        ...admin,
        payload: { name: `Gone ${run}`, shared: false, filters: {}, ...body },
      });
      expect(created.statusCode).toBe(201);
      const id = (created.json() as { data: { id: string } }).data.id;
      expect((await h.app.inject({ method: 'DELETE', url: `${url}/${id}`, ...admin })).statusCode).toBe(200);
      const again = await h.app.inject({ method: 'DELETE', url: `${url}/${id}`, ...admin });
      expect(again.statusCode).toBe(404);
      const patched = await h.app.inject({ method: 'PATCH', url: `${url}/${id}`, ...admin, payload: { shared: true } });
      expect(patched.statusCode).toBe(404);
    });
  });
});
