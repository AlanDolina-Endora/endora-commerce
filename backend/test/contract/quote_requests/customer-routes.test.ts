import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { SEED_PRODUCT_101_ID } from '../../helpers/seed-catalog.js';
import { seedCustomFieldAudienceCases } from '../../helpers/custom-field-audience.js';
import { adminUserIdKeys, deepStrict, disagreements, keyPaths } from '../../helpers/strict-schema.js';
import { quoteRequestSchema } from '@endora-commerce/contracts';
import { TEST_ADMIN_ID } from '../../helpers/test-actors.js';

/**
 * T026 — Customer-facing Quote Requests routes.
 *
 * Covers create + submit, list, get, resubmit. The accept-revision /
 * reject-revision paths are exercised by the negotiation-loop
 * integration test (T046, US3).
 */
describe('Customer Quote Requests routes (US1)', () => {
  let h: BackendServerHandle;
  let createdRfqId: string;

  beforeAll(async () => {
    h = await setupBackendServer();
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  it('creates a Pending Quote Request with one line item', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/quote-requests',
      cookies: { b2b_session: 'stub-customer-session' },
      payload: {
        headerNote: 'Could you match the X price?',
        items: [
          { productId: SEED_PRODUCT_101_ID, quantity: 50, desiredUnitPrice: 8.0 },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      data: {
        id: string;
        status: string;
        items: Array<{ productId: string; quantity: number; desiredUnitPrice: number | null }>;
        events: Array<{ eventType: string }>;
      };
    };
    expect(body.data.status).toBe('Pending');
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]?.productId).toBe(SEED_PRODUCT_101_ID);
    expect(body.data.items[0]?.quantity).toBe(50);
    expect(body.data.items[0]?.desiredUnitPrice).toBe(8);
    expect(body.data.events.map((e) => e.eventType)).toEqual(['created', 'submitted']);
    createdRfqId = body.data.id;
    expect(adminUserIdKeys(body)).toEqual([]);
    expect(disagreements(deepStrict(quoteRequestSchema), body.data)).toEqual([]);
  });

  it('lists the Quote Request in the customer view', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/api/v1/quote-requests',
      cookies: { b2b_session: 'stub-customer-session' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: Array<{ id: string; status: string; lineCount: number }>;
    };
    expect(body.data.find((r) => r.id === createdRfqId)).toBeTruthy();
  });

  it('returns the detail with no comparison block while Pending without revisions', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/api/v1/quote-requests/${createdRfqId}`,
      cookies: { b2b_session: 'stub-customer-session' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: {
        id: string;
        status: string;
        awaitingCustomerRevisionAcceptance: boolean;
        comparisonAgainstLastSeen: unknown;
      };
    };
    expect(body.data.id).toBe(createdRfqId);
    expect(body.data.awaitingCustomerRevisionAcceptance).toBe(false);
    expect(body.data.comparisonAgainstLastSeen).toBeNull();
  });

  it('answers the customer only customer-visible custom-field values; the administrator reads all', async () => {
    const audience = await seedCustomFieldAudienceCases(h, 'quote_request', createdRfqId);

    const res = await h.app.inject({
      method: 'GET',
      url: `/api/v1/quote-requests/${createdRfqId}`,
      cookies: { b2b_session: 'stub-customer-session' },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: { customFieldValues: unknown } }).data.customFieldValues).toEqual(
      audience.customerVisible,
    );
    for (const key of [audience.internalKey, audience.implicitKey, audience.orphanKey]) {
      expect(res.body).not.toContain(key);
    }

    // The customer list is a summary and carries no custom-field values at all.
    const list = await h.app.inject({
      method: 'GET',
      url: '/api/v1/quote-requests',
      cookies: { b2b_session: 'stub-customer-session' },
    });
    expect(list.statusCode).toBe(200);
    expect(list.body).not.toContain(audience.visibleKey);
    expect(list.body).not.toContain(audience.internalKey);

    const admin = await h.app.inject({
      method: 'GET',
      url: `/api/v1/admin/quote-requests/${createdRfqId}`,
      cookies: { b2b_session: 'stub-admin-session' },
    });
    expect(admin.statusCode).toBe(200);
    expect((admin.json() as { data: { customFieldValues: unknown } }).data.customFieldValues).toEqual(
      audience.stored,
    );
  });

  it('answers the customer no administrator identifier; the administrator reads them', async () => {
    // A quote an administrator created, is assigned to, and has acted on.
    const conn = h.em().getConnection();
    await conn.execute(
      `update "quote_requests" set created_by_admin_user_id = ?, assigned_admin_user_id = ? where id = ?`,
      [TEST_ADMIN_ID, TEST_ADMIN_ID, createdRfqId],
    );
    await conn.execute(
      `update "quote_request_events" set actor_admin_user_id = ?, actor_customer_account_id = null where quote_request_id = ?`,
      [TEST_ADMIN_ID, createdRfqId],
    );

    const res = await h.app.inject({
      method: 'GET',
      url: `/api/v1/quote-requests/${createdRfqId}`,
      cookies: { b2b_session: 'stub-customer-session' },
    });
    expect(res.statusCode).toBe(200);
    const detail = (res.json() as { data: unknown }).data;
    expect(adminUserIdKeys(detail)).toEqual([]);
    expect(res.body).not.toContain(TEST_ADMIN_ID);
    expect(disagreements(deepStrict(quoteRequestSchema), detail)).toEqual([]);

    const list = await h.app.inject({
      method: 'GET',
      url: '/api/v1/quote-requests',
      cookies: { b2b_session: 'stub-customer-session' },
    });
    expect(adminUserIdKeys(list.json())).toEqual([]);
    expect(list.body).not.toContain(TEST_ADMIN_ID);

    const admin = await h.app.inject({
      method: 'GET',
      url: `/api/v1/admin/quote-requests/${createdRfqId}`,
      cookies: { b2b_session: 'stub-admin-session' },
    });
    expect(admin.statusCode).toBe(200);
    const adminDetail = (
      admin.json() as {
        data: {
          createdByAdminUserId: string | null;
          assignedAdminUserId: string | null;
          events: Array<{ actorAdminUserId: string | null }>;
        };
      }
    ).data;
    expect(adminDetail.createdByAdminUserId).toBe(TEST_ADMIN_ID);
    expect(adminDetail.assignedAdminUserId).toBe(TEST_ADMIN_ID);
    expect(adminDetail.events.every((e) => e.actorAdminUserId === TEST_ADMIN_ID)).toBe(true);
  });

  it('rejects a draft body without items (FR-021)', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/quote-requests',
      cookies: { b2b_session: 'stub-customer-session' },
      payload: { items: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('resubmits an existing RFQ as a fresh Pending RFQ', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/api/v1/quote-requests/${createdRfqId}/resubmit`,
      cookies: { b2b_session: 'stub-customer-session' },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      data: {
        id: string;
        status: string;
        items: Array<{ productId: string; desiredUnitPrice: number | null }>;
        events: Array<{ eventType: string; payload: Record<string, unknown> }>;
      };
    };
    expect(body.data.id).not.toBe(createdRfqId);
    expect(body.data.status).toBe('Pending');
    expect(body.data.items[0]?.productId).toBe(SEED_PRODUCT_101_ID);
    // Resubmit pre-fills at the customer's current price list — desiredUnitPrice
    // is intentionally cleared, not carried over from the source.
    expect(body.data.items[0]?.desiredUnitPrice).toBeNull();
    const types = body.data.events.map((e) => e.eventType);
    expect(types).toContain('re-submitted');
    // The source quote carries administrator ids by now; the reply to the customer names none.
    expect(adminUserIdKeys(body)).toEqual([]);
    expect(res.body).not.toContain(TEST_ADMIN_ID);
  });

  it('returns 404 for a Quote Request belonging to a different customer', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/api/v1/quote-requests/00000000-0000-4000-8000-00000000ffff',
      cookies: { b2b_session: 'stub-customer-session' },
    });
    expect(res.statusCode).toBe(404);
  });
  /**
   * Feature 146, T042 / threat model T7 / FR-019 — the customer surface carries
   * none of the admin-only keys anywhere: not on items, not on `events[]`, not
   * inside any `events[].payload` (a key that reaches a stored payload is
   * dropped by the allow-list, not passed through), and not in what create and
   * modify emit towards the customer's notifications and e-mail.
   */
  it('146 — answers the customer no referencePrice, customerProposedUnitPrice or actorAdminUserId anywhere', async () => {
    const FORBIDDEN = ['referencePrice', 'customerProposedUnitPrice', 'actorAdminUserId', 'salesChannelId'];
    const emitted: unknown[] = [];
    const offs = ['rfq.created.v1', 'rfq.modified.v1'].map((name) =>
      h.eventBus.on(name as never, (event: unknown) => {
        emitted.push(event);
      }),
    );
    try {
      const created = await h.app.inject({
        method: 'POST',
        url: '/api/v1/quote-requests',
        cookies: { b2b_session: 'stub-customer-session' },
        payload: { items: [{ productId: SEED_PRODUCT_101_ID, quantity: 3, desiredUnitPrice: 7 }] },
      });
      expect(created.statusCode, created.body).toBe(201);
      const { id, version } = (created.json() as { data: { id: string; version: number } }).data;
      expect(keyPaths(created.json(), FORBIDDEN)).toEqual([]);

      const conn = h.em().getConnection();
      await conn.execute(
        `update "quote_request_items" set reference_unit_price = ?, reference_currency = ?, ` +
          `reference_captured_at = now() where quote_request_id = ?`,
        ['10.00', 'PLN', id],
      );

      const modified = await h.app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/quote-requests/${id}`,
        cookies: { b2b_session: 'stub-admin-session' },
        headers: { 'if-match': `"${version}"` },
        payload: { items: [{ productId: SEED_PRODUCT_101_ID, quantity: 3, agreedUnitPrice: 9 }] },
      });
      expect(modified.statusCode, modified.body).toBe(200);
      // The admin reply carries them — the customer one below must not.
      expect(keyPaths(modified.json(), ['referencePrice', 'customerProposedUnitPrice']).length).toBeGreaterThan(0);

      // A stored payload that somehow holds admin-only keys — top level and
      // inside a diff entry — is not passed through to the customer.
      await conn.execute(
        `update "quote_request_events" set payload = payload || ?::jsonb where quote_request_id = ?`,
        [
          JSON.stringify({ referencePrice: 10, customerProposedUnitPrice: 7, actorAdminUserId: TEST_ADMIN_ID }),
          id,
        ],
      );
      await conn.execute(
        `update "quote_request_events" set payload = jsonb_set(payload, '{diff,0,referencePrice}', '10'::jsonb) ` +
          `where quote_request_id = ? and event_type = 'modified' and jsonb_array_length(payload->'diff') > 0`,
        [id],
      );

      const detail = await h.app.inject({
        method: 'GET',
        url: `/api/v1/quote-requests/${id}`,
        cookies: { b2b_session: 'stub-customer-session' },
      });
      expect(detail.statusCode, detail.body).toBe(200);
      const body = detail.json() as {
        data: { events: Array<{ eventType: string; payload: Record<string, unknown> }> };
      };
      expect(keyPaths(body, FORBIDDEN)).toEqual([]);
      expect(detail.body).not.toContain(TEST_ADMIN_ID);
      // What the storefront branches on survives the allow-list.
      const modifiedEvent = body.data.events.find((e) => e.eventType === 'modified');
      expect(modifiedEvent?.payload['type']).toBe('modified');
      expect(Array.isArray(modifiedEvent?.payload['diff'])).toBe(true);
      expect(disagreements(deepStrict(quoteRequestSchema), body.data)).toEqual([]);

      const list = await h.app.inject({
        method: 'GET',
        url: '/api/v1/quote-requests',
        cookies: { b2b_session: 'stub-customer-session' },
      });
      expect(list.statusCode).toBe(200);
      expect(keyPaths(list.json(), FORBIDDEN)).toEqual([]);

      // Notifications and e-mail: the bus announcements of create and modify,
      // and the customer's notification rows, name none of the keys.
      await vi.waitFor(() => expect(emitted.length).toBeGreaterThanOrEqual(2), { timeout: 10_000, interval: 20 });
      expect(keyPaths(emitted, FORBIDDEN)).toEqual([]);
      const rows = (await conn.execute(
        `select * from "quote_request_notification_events" where quote_request_id = ?`,
        [id],
      )) as Array<Record<string, unknown>>;
      expect(rows.length).toBeGreaterThan(0);
      expect(keyPaths(rows, FORBIDDEN)).toEqual([]);
      expect(JSON.stringify(rows)).not.toMatch(/reference_?price|customer_?proposed/i);
    } finally {
      for (const off of offs) off();
    }
  });
});
