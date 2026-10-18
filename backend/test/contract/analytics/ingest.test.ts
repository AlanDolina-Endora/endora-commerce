import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { SalesChannel } from '@endora-commerce/platform/kernel';
import { AnalyticsEvent } from '../../helpers/package-entities.js';

/**
 * T237 — public ingest endpoint accepts a batch from storefront/admin
 * (no auth gate by design) and writes one row per accepted event.
 * Unknown event types are rejected per-row, not for the whole batch.
 */

describe('POST /api/v1/analytics/events', () => {
  let h: BackendServerHandle;

  beforeAll(async () => {
    h = await setupBackendServer();
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  it('accepts a valid batch and persists one row per event', async () => {
    const before = await h.em().count(AnalyticsEvent, {});
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/analytics/events',
      payload: {
        events: [
          {
            type: 'product.viewed',
            properties: { productId: 'p-1' },
          },
          {
            type: 'search.performed',
            properties: { query: 'widgets' },
          },
        ],
      },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json() as { data: { accepted: number; rejected: unknown[] } };
    expect(body.data.accepted).toBe(2);
    expect(body.data.rejected).toEqual([]);

    const after = await h.em().count(AnalyticsEvent, {});
    expect(after).toBe(before + 2);
  });

  it('rejects unknown event types at the boundary', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/analytics/events',
      payload: {
        events: [{ type: 'totally-fake.event' }],
      },
    });
    // Boundary Zod schema rejects the whole payload — the type union is
    // strict by design so storefront cannot quietly pollute the table.
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
  });

  it('stores the resolved channel and no identity for an anonymous batch, whatever the body names', async () => {
    const named = '11111111-1111-4111-8111-111111111111';
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/analytics/events',
      payload: {
        events: [
          {
            type: 'product.viewed',
            salesChannelId: named,
            customerAccountId: named,
            organizationId: named,
          },
        ],
      },
    });
    expect(res.statusCode).toBe(202);
    const requestId = res.headers['x-request-id'] as string;
    const resolvedCode = res.headers['x-sales-channel'] as string;
    const stored = await h.em().findOneOrFail(AnalyticsEvent, { requestId });
    const channel = await h.em().findOneOrFail(SalesChannel, { code: resolvedCode });
    expect(stored.salesChannelId).toBe(channel.id);
    expect(stored.customerAccountId ?? null).toBeNull();
    expect(stored.organizationId ?? null).toBeNull();
  });

  it('stores requestId for cross-log correlation', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/analytics/events',
      payload: { events: [{ type: 'cart.abandoned' }] },
    });
    expect(res.statusCode).toBe(202);
    const requestId = res.headers['x-request-id'] as string;
    const stored = await h.em().findOneOrFail(AnalyticsEvent, { requestId });
    expect(stored.type).toBe('cart.abandoned');
  });
});
