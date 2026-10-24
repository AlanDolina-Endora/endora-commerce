import { describe, expect, it } from 'vitest';
import {
  approvedAmount,
  defaultRefunds,
  exceedsCap,
  sumApproved,
} from './refund-math.js';

describe('refund math (US5 / FR-031/032)', () => {

  it('rejects an approved amount above the paid cap', () => {
    expect(exceedsCap(100.01, 100)).toBe(true);
    expect(exceedsCap(999, 100)).toBe(true);
  });

  it('accepts an approved amount at or below the cap (within tolerance)', () => {
    expect(exceedsCap(100, 100)).toBe(false);
    expect(exceedsCap(99.99, 100)).toBe(false);
    expect(exceedsCap(100.004, 100)).toBe(false); // half-cent tolerance
  });

  it('totals the approved per-line amounts to cents', () => {
    expect(sumApproved([10.1, 20.2, 30.3])).toBe(60.6);
    expect(sumApproved([])).toBe(0);
    expect(sumApproved([0.1, 0.2])).toBe(0.3); // no float drift
  });
});

/**
 * Issue #417 — the refund amounts in exact decimal arithmetic. An approved
 * amount an operator types is rounded half-up on its decimal digits before it
 * is capped, summed and stored; `Math.round((x + EPSILON) * 100) / 100` and
 * `toFixed(2)` rounded the binary double, so 1.005 became 1.00.
 */
describe('refund math — exact decimal amounts (#417)', () => {
  it('rounds an approved amount half-up, not the binary 1.00', () => {
    expect(approvedAmount(1.005)).toBe('1.01');
    expect(sumApproved([1.005])).toBe(1.01);
    expect(sumApproved([1.005, 2.675])).toBe(3.69);
  });

  it('caps the amount it will store: 100.005 rounds to 100.01, above a 100.00 cap', () => {
    expect(exceedsCap(100.005, 100)).toBe(true);
    expect(exceedsCap('100.00', '100.00')).toBe(false);
  });

});

/**
 * Owner ruling of 2026-10-24 (issue #417): a return refunds under the one VAT
 * method — per rate, VAT on the sum of the returned nets — so a full return
 * refunds exactly what was invoiced for those lines, and a partial return
 * applies the same rule to the returned quantity.
 */
describe('defaultRefunds — the one VAT method', () => {
  it('V3 full: all of 9.05 × 3 at 8 % refunds 29.32, as invoiced (not 9.77 × 3 = 29.31)', () => {
    expect(defaultRefunds([{ unitNetPrice: '9.05', taxRate: '0.0800', quantity: 3 }])).toEqual(['29.32']);
  });

  it('V3 partial: 2 of 3 refunds 18.10 net + 1.45 VAT = 19.55', () => {
    expect(defaultRefunds([{ unitNetPrice: '9.05', taxRate: '0.0800', quantity: 2 }])).toEqual(['19.55']);
  });

  it('V2: a full return of 29.50 at 23 % and 4.30 at 5 % refunds 40.81, the invoice gross', () => {
    expect(
      defaultRefunds([
        { unitNetPrice: '29.50', taxRate: '0.2300', quantity: 1 },
        { unitNetPrice: '4.30', taxRate: '0.0500', quantity: 1 },
      ]),
    ).toEqual(['36.29', '4.52']);
  });

  it('takes the lines of one rate together: three 0.02 lines at 23 % refund 0.07', () => {
    const line = { unitNetPrice: '0.02', taxRate: '0.23', quantity: 1 };
    expect(defaultRefunds([line, line, line])).toEqual(['0.03', '0.02', '0.02']);
  });
});
