import { describe, expect, it } from 'vitest';
import { cartLineAmount, cartSubtotal, cartTotalAfterDiscount, cartShortfall } from './cart-money.js';

/**
 * Issue #417 — a cart's amounts in exact decimal arithmetic. A cart is net and
 * carries no tax; its amounts are published as numbers (`Money.amount`), each a
 * two-place decimal read losslessly. On doubles, 3 × 9.05 published
 * 27.150000000000002 and 0.10 + 0.20 0.30000000000000004.
 */
describe('cart money', () => {
  it('publishes a line amount at two places, not the binary 27.150000000000002', () => {
    expect(9.05 * 3).toBe(27.150000000000002);
    expect(cartLineAmount('9.05', 3)).toBe(27.15);
  });

  it('sums a subtotal exactly', () => {
    expect(cartSubtotal([
      { unitPrice: '0.10', quantity: 1 },
      { unitPrice: '0.20', quantity: 1 },
    ])).toBe('0.30');
    expect(cartSubtotal([])).toBe('0.00');
  });

  it('subtracts a discount and never goes below zero', () => {
    expect(cartTotalAfterDiscount('0.30', 0.1)).toBe(0.2);
    expect(cartTotalAfterDiscount('5.00', 7.5)).toBe(0);
  });

  it('answers what is missing to a minimum, exactly, or null when the minimum is met', () => {
    expect(cartShortfall('0.30', '0.30')).toBeNull();
    expect(cartShortfall('0.30', '0.31')).toBe(0.01);
    expect(cartShortfall('100.00', '99.99')).toBeNull();
  });
});
