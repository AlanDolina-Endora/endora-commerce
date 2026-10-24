import { describe, expect, it } from 'vitest';
import { orderLineMoney, orderTotalsMoney, paidAmounts } from './order-money.js';

/**
 * Issue #417 — an order's amounts in exact decimal arithmetic, under the rule
 * placement has always applied: a line's gross is its net × (1 + rate) rounded
 * half-up on its own; the order's tax is the sum of the lines' **exact** taxes,
 * rounded once; the total is subtotal + tax + delivery + surcharge − discount.
 * `specs/pricing/worked-examples.md` §10.17.
 */
describe('orderLineMoney', () => {
  it('rounds a line gross half-up on the exact product, not the binary toFixed', () => {
    // `(29.5 * 1 * 1.23).toFixed(2)` is 36.28; `(16.5 * 1.05).toFixed(2)` is 17.32.
    expect(orderLineMoney({ unitPrice: '29.50', quantity: 1, taxRate: 0.23 })).toEqual({
      net: '29.50',
      gross: '36.29',
      taxRate: '0.2300',
    });
    expect(orderLineMoney({ unitPrice: '16.50', quantity: 1, taxRate: 0.05 }).gross).toBe('17.33');
    expect(orderLineMoney({ unitPrice: '0.50', quantity: 1, taxRate: 0.23 }).gross).toBe('0.62');
  });

  it('multiplies the unit price by the quantity exactly', () => {
    expect(orderLineMoney({ unitPrice: '0.10', quantity: 3, taxRate: 0 })).toEqual({
      net: '0.30',
      gross: '0.30',
      taxRate: '0.0000',
    });
    expect(orderLineMoney({ unitPrice: '9.05', quantity: 3, taxRate: 0.08 }).gross).toBe('29.32');
  });
});

describe('orderTotalsMoney', () => {
  it('rounds the order tax half-up on the exact sum (T1: 0.70 at 5 %)', () => {
    // `Math.round(0.7 * 0.05 * 100) / 100` is 0.03; the exact tax is 0.035.
    const t = orderTotalsMoney({
      lines: [{ unitPrice: '0.70', quantity: 1, taxRate: 0.05 }],
      deliveryTotal: 0,
      paymentSurcharge: 0,
      discountTotal: 0,
    });
    expect(t).toEqual({
      subtotal: '0.70',
      taxTotal: '0.04',
      deliveryTotal: '0.00',
      paymentSurcharge: '0.00',
      discountTotal: '0.00',
      total: '0.74',
    });
  });

  it('keeps the order rule: the lines’ exact taxes are summed, then rounded once (V2)', () => {
    const t = orderTotalsMoney({
      lines: [
        { unitPrice: '29.50', quantity: 1, taxRate: 0.23 },
        { unitPrice: '4.30', quantity: 1, taxRate: 0.05 },
      ],
      deliveryTotal: '15.00',
      paymentSurcharge: 2.5,
      discountTotal: '1.10',
    });
    // 6.785 + 0.215 = 7.000 → 7.00 (each line rounded alone would be 6.79 + 0.22).
    expect(t).toEqual({
      subtotal: '33.80',
      taxTotal: '7.00',
      deliveryTotal: '15.00',
      paymentSurcharge: '2.50',
      discountTotal: '1.10',
      total: '57.20',
    });
  });

  it('adds many amounts without a binary residue', () => {
    const t = orderTotalsMoney({
      lines: Array.from({ length: 3 }, () => ({ unitPrice: '0.10', quantity: 1, taxRate: 0 })),
      deliveryTotal: '0.20',
      paymentSurcharge: 0,
      discountTotal: '0.30',
    });
    expect(t.subtotal).toBe('0.30');
    expect(t.total).toBe('0.20');
  });
});

describe('paidAmounts — what a return refunds by default', () => {
  it('rounds the paid unit gross half-up on the exact product, not the binary 20.29 (G4)', () => {
    // `Math.round((16.5 * 1.23 + Number.EPSILON) * 100) / 100` is 20.29.
    expect(paidAmounts({ unitPrice: '16.50', taxRate: '0.2300', quantity: 3 })).toEqual({
      paidUnitAmount: '20.30',
      paidLineAmount: '60.90',
    });
  });

  it('keeps the rule: the paid unit gross times the quantity', () => {
    // Not the order line's own gross (3 × 0.50 at 23 % is 1.845 → 1.85).
    expect(paidAmounts({ unitPrice: '0.50', taxRate: '0.2300', quantity: 3 })).toEqual({
      paidUnitAmount: '0.62',
      paidLineAmount: '1.86',
    });
  });
});
