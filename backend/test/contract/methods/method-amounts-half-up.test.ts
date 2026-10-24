import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';

/**
 * Issue #417 — a delivery cost and a payment surcharge an operator types are
 * stored at two places **half-up on their decimal digits**. `toFixed(2)`
 * rounded the binary double: 1.005 was stored as 1.00 and 2.675 as 2.67.
 */
describe('method amounts are stored half-up (#417)', () => {
  let h: BackendServerHandle;
  const cookies = { b2b_session: 'stub-admin-session' };

  beforeAll(async () => {
    h = await setupBackendServer();
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  it('stores a delivery cost of 1.005 as 1.01', async () => {
    const res = await h.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/delivery-methods/half_up_courier',
      cookies,
      payload: { code: 'half_up_courier', name: { 'en-US': 'Half-up courier' }, cost: 1.005, currency: 'PLN' },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as { data: { cost: { amount: number } } }).data.cost.amount).toBe(1.01);
  });

  it('stores a payment surcharge of 2.675 as 2.68', async () => {
    const res = await h.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/payment-methods/half_up_transfer',
      cookies,
      payload: { code: 'half_up_transfer', name: { 'en-US': 'Half-up transfer' }, kind: 'bank_transfer', additionalPrice: 2.675 },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(Number((res.json() as { data: { additionalPrice: number | string } }).data.additionalPrice)).toBe(2.68);
  });
});
