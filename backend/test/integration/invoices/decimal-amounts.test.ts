import { randomUUID } from 'crypto';
import type { EntityManager } from '@mikro-orm/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureSalesChannelId } from '../../helpers/sales-channel-fixtures.js';
import { Order, OrderItem } from '../../helpers/package-entities.js';
import { TEST_CUSTOMER_ID, TEST_ORGANIZATION_ID } from '../../helpers/test-actors.js';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { ADMIN_COOKIE, setSellerSettings } from './helpers.js';

interface IssueResponse {
  data: {
    id: string;
    netTotal: number;
    taxTotal: number;
    grossTotal: number;
    lines: Array<{ name: string; quantity: number; unitNetPrice: number; netValue: number; grossValue: number }>;
    vatSummary: Array<{ taxRate: number; netTotal: number; vatAmount: number; grossTotal: number }>;
  };
}

/**
 * Seed an order the way `OrderService.placeOrder` writes one: `lineTotal` is
 * the line's **gross** (`unitPrice × quantity × (1 + taxRate)`, half-up), and
 * the order's tax is the sum of the lines' exact taxes, rounded once.
 */
async function seedPlacedOrder(
  em: EntityManager,
  salesChannelId: string,
  lines: Array<{ unitPrice: string; quantity: number; taxRate: string; lineTotal: string }>,
  totals: { subtotal: string; taxTotal: string; total: string },
): Promise<string> {
  const order = em.create(Order, {
    organizationId: TEST_ORGANIZATION_ID,
    placedByCustomerAccountId: TEST_CUSTOMER_ID,
    salesChannelId,
    status: 'paid',
    paymentStatus: 'paid',
    deliveryAddress: { recipientName: 'Example Buyer', street: 'ul. Testowa 1', city: 'Warszawa', postalCode: '00-002', country: 'PL' },
    billingAddress: {
      recipientName: 'Jan Kowalski',
      street: 'ul. Testowa 1',
      city: 'Warszawa',
      postalCode: '00-002',
      country: 'PL',
      companyName: 'Example Buyer Sp. z o.o.',
      taxId: '1231231230',
    },
    deliveryMethodId: randomUUID(),
    deliveryMethodSnapshot: { code: 'dm', name: 'Kurier', cost: 0 },
    paymentMethodId: randomUUID(),
    paymentMethodSnapshot: { code: 'pm', name: 'Przelew', kind: 'bank_transfer' },
    subtotal: totals.subtotal,
    taxTotal: totals.taxTotal,
    deliveryTotal: '0.00',
    discountTotal: '0.00',
    total: totals.total,
    currency: 'PLN',
    placedAt: new Date(),
  });
  await em.persistAndFlush(order);
  await em.persistAndFlush(
    lines.map((l, i) =>
      em.create(OrderItem, {
        orderId: order.id,
        productId: randomUUID(),
        productSnapshot: { sku: `DEC-${i}`, name: `Line ${i + 1}`, primaryAssetUrl: null },
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate,
        lineTotal: l.lineTotal,
      }),
    ),
  );
  return order.id;
}

let CH: string;

describe('invoices — exact decimal amounts (#417)', () => {
  let h: BackendServerHandle;

  beforeAll(async () => {
    h = await setupBackendServer();
    CH = await ensureSalesChannelId(h.em(), 'inv-decimal');
    await setSellerSettings(h);
    await h.settings.adminService.setValueForSubset(
      'invoices.numbering.invoice.pattern',
      ['inv-decimal'],
      'FVDEC {seq}/{YYYY}',
      null,
      { actorAdminUserId: '00000000-0000-0000-0000-000000000000' },
    );
  });
  afterAll(async () => {
    await teardownBackendServer(h);
  });

  it('invoices a line at its net (unit price × quantity), not at the order line gross', async () => {
    // 100.00 net at 23 %: the order line's `lineTotal` is the gross 123.00.
    const orderId = await seedPlacedOrder(
      h.em(),
      CH,
      [{ unitPrice: '50.00', quantity: 2, taxRate: '0.2300', lineTotal: '123.00' }],
      { subtotal: '100.00', taxTotal: '23.00', total: '123.00' },
    );
    const res = await h.app.inject({
      method: 'POST',
      url: `/api/v1/admin/orders/${orderId}/invoices`,
      cookies: ADMIN_COOKIE,
      payload: { kind: 'invoice' },
    });
    expect(res.statusCode).toBe(201);
    const { data } = res.json() as IssueResponse;
    expect(data.lines[0]).toMatchObject({ quantity: 2, unitNetPrice: 50, netValue: 100, grossValue: 123 });
    expect([data.netTotal, data.taxTotal, data.grossTotal]).toEqual([100, 23, 123]);
  });

  it('rounds each line gross half-up on the exact decimal product (G1 at 23 %, G2 at 5 %)', async () => {
    const orderId = await seedPlacedOrder(
      h.em(),
      CH,
      [
        { unitPrice: '29.50', quantity: 1, taxRate: '0.2300', lineTotal: '36.29' },
        { unitPrice: '4.30', quantity: 1, taxRate: '0.0500', lineTotal: '4.52' },
      ],
      { subtotal: '33.80', taxTotal: '7.00', total: '40.80' },
    );
    const res = await h.app.inject({
      method: 'POST',
      url: `/api/v1/admin/orders/${orderId}/invoices`,
      cookies: ADMIN_COOKIE,
      payload: { kind: 'invoice' },
    });
    expect(res.statusCode).toBe(201);
    const { data } = res.json() as IssueResponse;
    expect(data.lines.map((l) => [l.netValue, l.grossValue])).toEqual([
      [29.5, 36.29],
      [4.3, 4.52],
    ]);
    expect(data.vatSummary).toEqual([
      { taxRate: 0.05, netTotal: 4.3, vatAmount: 0.22, grossTotal: 4.52 },
      { taxRate: 0.23, netTotal: 29.5, vatAmount: 6.79, grossTotal: 36.29 },
    ]);
    // The invoice's per-line rule gives 7.01 VAT where the order's rule (the
    // lines' exact taxes summed, rounded once) gives 7.00 — vector V2 of
    // `specs/pricing/worked-examples.md` §10.17, an open owner question.
    expect([data.netTotal, data.taxTotal, data.grossTotal]).toEqual([33.8, 7.01, 40.81]);
  });
});
