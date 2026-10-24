import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CorrectiveInvoicePort, OrderReturnContextPort } from '@endora-commerce/contracts';
import { EventBus } from '@endora-commerce/platform/events';
import { InMemoryMailer } from '../../../../../packages/modules/email/src/backend/services/mailer.js';
import { OrderService, type OrderEventBus } from '../../../../../packages/modules/orders/dist/backend/services/order-service.js';
import { PaymentAdapterRegistry } from '../../../../../packages/modules/payment_methods/src/backend/services/payment-adapter-registry.js';
import { EnumOrderStatusRegistry } from '../../../../../packages/modules/payment_methods/src/backend/services/order-status-registry.port.js';
import { builtInPaymentAdapters } from '../../../../../packages/modules/payments/src/backend/adapters/built-in-adapters.js';
import { orderServiceNeighbours } from '../../../helpers/orders-neighbour-ports.js';
import { PaymentMethod, StockLevel } from '../../../helpers/package-entities.js';
import { seedBasePriceSql } from '../../../helpers/price-book-sql.js';
import { SEED_DELIVERY_METHOD_ID, SEED_PAYMENT_METHOD_ID } from '../../../helpers/seed-commerce.js';
import { SEED_PRODUCT_101_ID, SEED_PRODUCT_102_ID, SEED_PRODUCT_103_ID } from '../../../helpers/seed-catalog.js';
import { systemDefaultSalesChannelId } from '../../../helpers/sales-channel-fixtures.js';
import { CUSTOMER_COOKIES, TEST_CUSTOMER_ID, TEST_ORGANIZATION_ID } from '../../../helpers/test-actors.js';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../../helpers/test-server.js';
import { ADMIN_COOKIE, setSellerSettings } from '../../invoices/helpers.js';

/**
 * `specs/pricing/worked-examples.md` §10.17 (issue #417) — an x.xx50 resolver
 * amount at 23 %, 8 % and 5 % VAT gives the same figures on every document an
 * order produces: the cart, the checkout preview, the placed order (its lines
 * and totals), the order-confirmation e-mail, the VAT invoice (lines, the
 * per-rate summary and the totals), a correction crediting the whole order and
 * the admin CSV export. One order per rate: the tax rate is resolved per
 * product tax class, so this rig states it per order.
 *
 * The payment method carries a 2.50 surcharge, which every document adds
 * without tax: the order on its gross, the invoice as a 0 % line.
 */
const SESSION = { b2b_session: 'stub-customer-session' };
const SURCHARGE = '2.50';

interface Vector {
  id: string;
  productId: string;
  resolver: string;
  rate: number;
  quantity: number;
  /** Expected figures, two places. */
  unitPrice: string;
  net: string;
  tax: string;
  lineGross: string;
  total: string;
  /** What a full return credits by default: the paid unit gross × quantity. */
  credited: string;
  creditedNet: string;
  creditedTax: string;
}

const VECTORS: Vector[] = [
  {
    id: 'A1',
    productId: SEED_PRODUCT_101_ID,
    resolver: '29.4950',
    rate: 0.23,
    quantity: 1,
    unitPrice: '29.50',
    net: '29.50',
    tax: '6.79',
    lineGross: '36.29',
    total: '38.79',
    credited: '36.29',
    creditedNet: '29.50',
    creditedTax: '6.79',
  },
  {
    id: 'A2',
    productId: SEED_PRODUCT_103_ID,
    resolver: '9.0450',
    rate: 0.08,
    quantity: 3,
    unitPrice: '9.05',
    net: '27.15',
    tax: '2.17',
    lineGross: '29.32',
    total: '31.82',
    // V3: 9.05 at 8 % is 9.774 → 9.77 a unit, × 3 = 29.31 — a cent below the line's own gross.
    credited: '29.31',
    creditedNet: '27.14',
    creditedTax: '2.17',
  },
  {
    id: 'A3',
    productId: SEED_PRODUCT_102_ID,
    resolver: '0.6950',
    rate: 0.05,
    quantity: 1,
    unitPrice: '0.70',
    net: '0.70',
    tax: '0.04',
    lineGross: '0.74',
    total: '3.24',
    credited: '0.74',
    creditedNet: '0.70',
    creditedTax: '0.04',
  },
];

const two = (n: number | string) => Number(n).toFixed(2);

describe('worked examples — §10.17 the cart, the order, the e-mail, the invoice, the correction and the export agree', () => {
  let h: BackendServerHandle;

  beforeAll(async () => {
    h = await setupBackendServer();
    const em = h.em();
    for (const v of VECTORS) await seedBasePriceSql(em, v.productId, v.resolver);
    // The seed stocks 101 only.
    for (const productId of [SEED_PRODUCT_102_ID, SEED_PRODUCT_103_ID]) {
      em.create(StockLevel, { productId, warehouseId: '00000000-0000-4000-8000-00000000d017', onHand: 100, reserved: 0 });
    }
    await em.flush();
    const method = await em.findOneOrFail(PaymentMethod, { id: SEED_PAYMENT_METHOD_ID });
    method.additionalPrice = SURCHARGE;
    await em.persistAndFlush(method);
    await setSellerSettings(h);
  }, 5 * 60_000);

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  for (const v of VECTORS) {
    it(`${v.id} — ${v.resolver} at ${v.rate * 100} % × ${v.quantity}`, async () => {
      const mailer = new InMemoryMailer();
      const registry = new PaymentAdapterRegistry();
      for (const a of builtInPaymentAdapters()) registry.register(a, 'payments');
      const service = new OrderService(h.em, new EventBus() as OrderEventBus, undefined, undefined, undefined, {
        neighbours: orderServiceNeighbours(h.em),
        resolveTaxRate: async () => v.rate,
        paymentAdapters: () => registry,
        orderStatusRegistry: () => new EnumOrderStatusRegistry(),
        mailer,
      });
      const ctx = { customerAccountId: TEST_CUSTOMER_ID, organizationId: TEST_ORGANIZATION_ID };
      const methods = { deliveryMethodId: SEED_DELIVERY_METHOD_ID, paymentMethodId: SEED_PAYMENT_METHOD_ID };

      // The cart, empty: a vector that failed before placement leaves its line behind.
      await h.cartService()?.clearForCustomer({
        ...CUSTOMER_COOKIES[SESSION.b2b_session]!,
        salesChannelId: await systemDefaultSalesChannelId(h.em()),
      });
      const added = await h.app.inject({
        method: 'POST',
        url: '/api/v1/cart/items',
        cookies: SESSION,
        payload: { productId: v.productId, quantity: v.quantity },
      });
      expect(added.statusCode, added.body).toBe(200);
      const cart = await h.app.inject({ method: 'GET', url: '/api/v1/cart', cookies: SESSION });
      const cartData = (cart.json() as {
        data: {
          items: Array<{ unitPrice: { amount: number }; lineTotal: { amount: number } }>;
          subtotal: { amount: number };
        };
      }).data;
      expect(cartData.items).toHaveLength(1);
      expect(two(cartData.items[0]!.unitPrice.amount)).toBe(v.unitPrice);
      expect(String(cartData.items[0]!.lineTotal.amount)).toBe(String(Number(v.net)));
      expect(String(cartData.subtotal.amount)).toBe(String(Number(v.net)));

      // The checkout preview.
      const preview = await service.previewTotal(ctx, methods);
      expect([preview.subtotal, preview.taxTotal, preview.total].map(two)).toEqual([v.net, v.tax, v.total]);

      // The placed order.
      const placed = await service.placeOrder(ctx, {
        ...methods,
        deliveryAddressId: '00000000-0000-4000-8000-0000000000d1',
        billingAddressId: '00000000-0000-4000-8000-0000000000d2',
      });
      const orderId = (placed as { order?: { id: string }; id?: string }).order?.id ?? (placed as { id: string }).id;
      const order = await h.app.inject({ method: 'GET', url: `/api/v1/admin/orders/${orderId}`, cookies: ADMIN_COOKIE });
      expect(order.statusCode, order.body).toBe(200);
      const o = (order.json() as {
        data: {
          businessId: string;
          subtotal: number;
          taxTotal: number;
          total: number;
          items: Array<{ unitPrice: number; lineTotal: number }>;
        };
      }).data;
      expect([o.subtotal, o.taxTotal, o.total].map(two)).toEqual([v.net, v.tax, v.total]);
      expect(two(o.items[0]!.unitPrice)).toBe(v.unitPrice);
      expect(two(o.items[0]!.lineTotal)).toBe(v.lineGross);

      // The order-confirmation e-mail.
      expect(mailer.sent).toHaveLength(1);
      const mail = mailer.sent[0]!.text ?? '';
      expect(mail).toContain(`— ${v.lineGross} PLN`);
      expect(mail).toContain(`: ${v.net} PLN`);
      expect(mail).toContain(`: ${v.tax} PLN`);
      expect(mail).toMatch(new RegExp(`: ${v.total.replace('.', '\\.')} PLN`));

      // The VAT invoice.
      const issued = await h.app.inject({
        method: 'POST',
        url: `/api/v1/admin/orders/${orderId}/invoices`,
        cookies: ADMIN_COOKIE,
        payload: { kind: 'invoice' },
      });
      expect(issued.statusCode, issued.body).toBe(201);
      const inv = (issued.json() as {
        data: {
          netTotal: number;
          taxTotal: number;
          grossTotal: number;
          lines: Array<{ name: string; quantity: number; unitNetPrice: number; netValue: number; grossValue: number }>;
          vatSummary: Array<{ taxRate: number; netTotal: number; vatAmount: number; grossTotal: number }>;
        };
      }).data;
      const productLine = inv.lines[0]!;
      expect([productLine.quantity, two(productLine.unitNetPrice), two(productLine.netValue), two(productLine.grossValue)]).toEqual([
        v.quantity,
        v.unitPrice,
        v.net,
        v.lineGross,
      ]);
      const rateRow = inv.vatSummary.find((r) => r.taxRate === v.rate)!;
      expect([rateRow.netTotal, rateRow.vatAmount, rateRow.grossTotal].map(two)).toEqual([v.net, v.tax, v.lineGross]);
      // Net + the 0 % surcharge line; VAT; gross = the order's total.
      expect([inv.netTotal, inv.taxTotal, inv.grossTotal].map(two)).toEqual([
        two(Number(v.net) + Number(SURCHARGE)),
        v.tax,
        v.total,
      ]);

      // A correction crediting the whole order, at what a return refunds by default.
      const cradle = h.container.cradle as unknown as {
        orderReturnContextPort: OrderReturnContextPort;
        correctiveInvoicePort: CorrectiveInvoicePort;
      };
      const context = (await cradle.orderReturnContextPort.getReturnContext(orderId))!;
      const line = context.lines[0]!;
      expect(two(line.paidLineAmount)).toBe(v.credited);
      const correction = await cradle.correctiveInvoicePort.createCorrection({
        orderId,
        lines: [{ orderItemId: line.orderItemId, productName: line.name, quantity: v.quantity, amount: line.paidLineAmount }],
        total: line.paidLineAmount,
        currency: 'PLN',
        idempotencyKey: `money-agreement-${v.id}-${orderId}`,
      });
      expect(correction.issued).toBe(true);
      const corrected = await h.app.inject({
        method: 'GET',
        url: `/api/v1/admin/invoices/${(correction as { invoiceId: string }).invoiceId}`,
        cookies: ADMIN_COOKIE,
      });
      expect(corrected.statusCode, corrected.body).toBe(200);
      const c = (corrected.json() as { data: { netTotal: number; taxTotal: number; grossTotal: number } }).data;
      expect([c.netTotal, c.taxTotal, c.grossTotal].map(two)).toEqual([v.creditedNet, v.creditedTax, v.credited]);

      // The admin CSV export.
      const csv = await h.app.inject({ method: 'GET', url: '/api/v1/admin/orders/export', cookies: ADMIN_COOKIE });
      expect(csv.statusCode, csv.body).toBe(200);
      const [header, ...rows] = csv.body.split('\r\n');
      const columns = header!.split(',');
      const row = rows.map((r) => r.split(',')).find((cells) => cells[columns.indexOf('businessId')] === o.businessId);
      expect(row?.[columns.indexOf('total')]).toBe(v.total);
    });
  }
});
