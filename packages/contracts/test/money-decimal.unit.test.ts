import { describe, expect, it } from 'vitest';
import {
  compareDecimals,
  decimalDifference,
  decimalProduct,
  decimalSum,
  grossAmountHalfUp,
  grossFromNetHalfUp,
  lineAmountHalfUp,
  moneyDifference,
  moneySum,
  netFromGrossHalfUp,
  percentOfHalfUp,
  quotientHalfUp,
  roundAmountHalfUp,
  roundHalfUp,
  taxAmountExact,
  taxAmountHalfUp,
} from '../src/index.js';

/**
 * Issue #417 — the exact decimal money arithmetic every stored, charged or
 * displayed amount outside the price book is computed with. Each "binary"
 * expectation below is what the double arithmetic it replaces answered, so a
 * regression to `toFixed(2)` or `Math.round(x * 100) / 100` reads as a
 * difference in the vector, not as a vague mismatch
 * (`specs/pricing/worked-examples.md` §10.16 and §10.17).
 */
describe('roundHalfUp', () => {
  it('rounds the decimal digits half-up, which the binary rounding does not', () => {
    expect(roundHalfUp('9.045')).toBe('9.05');
    expect((9.045).toFixed(2)).toBe('9.04');
    expect(roundHalfUp(1.005)).toBe('1.01');
    expect(Math.round(1.005 * 100) / 100).toBe(1);
  });

  it('rounds a negative value half away from zero and never writes −0', () => {
    expect(roundHalfUp('-1.005')).toBe('-1.01');
    expect(roundHalfUp('-0.004')).toBe('0.00');
    expect(roundHalfUp('-0')).toBe('0.00');
  });

  it('pads to the places asked and rounds to four for a unit price', () => {
    expect(roundHalfUp('3')).toBe('3.00');
    expect(roundHalfUp('2.5', 4)).toBe('2.5000');
    expect(roundHalfUp('0.123450', 4)).toBe('0.1235');
    expect(roundHalfUp('12.5', 0)).toBe('13');
  });

  it('agrees with roundAmountHalfUp', () => {
    for (const v of ['9.045', '1.005', '-2.675', '0', '123.4449', '0.995', 36.285, 20.295]) {
      expect(roundHalfUp(v)).toBe(roundAmountHalfUp(v));
    }
  });

  it('refuses what is not a decimal', () => {
    expect(() => roundHalfUp('abc')).toThrow();
    expect(() => roundHalfUp('1.2.3')).toThrow();
    expect(() => roundHalfUp(Number.NaN)).toThrow();
    expect(() => roundHalfUp('1', -1)).toThrow();
  });
});

describe('exact sums, differences and products', () => {
  it('sums without the binary residue', () => {
    expect(decimalSum('0.1', '0.2')).toBe('0.3');
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(decimalSum(0.1, 0.2, '-0.3')).toBe('0.0');
    expect(decimalSum()).toBe('0');
  });

  it('subtracts and multiplies exactly', () => {
    expect(decimalDifference('100.00', '99.99')).toBe('0.01');
    expect(decimalDifference('0.3', 0.1)).toBe('0.2');
    expect(0.3 - 0.1).not.toBe(0.2);
    expect(decimalProduct('29.50', '1.23')).toBe('36.2850');
    expect(decimalProduct('-2.5', '3')).toBe('-7.5');
  });

  it('compares signed decimals of any scale', () => {
    expect(compareDecimals('0.30', 0.3)).toBe(0);
    expect(compareDecimals('0.2', decimalDifference('0.3', '0.1'))).toBe(0);
    expect(compareDecimals('-1', '0.5')).toBe(-1);
    expect(compareDecimals('10.001', '10')).toBe(1);
  });

  it('rounds a money sum and a difference once, at the end', () => {
    expect(moneySum(['6.785', '0.215'])).toBe('7.00');
    expect(moneySum([0.1, 0.2])).toBe('0.30');
    expect(moneySum([])).toBe('0.00');
    expect(moneyDifference('0.30', '0.10')).toBe('0.20');
  });
});

describe('line, tax and gross amounts', () => {
  it('multiplies a unit price by a quantity', () => {
    expect(lineAmountHalfUp('9.05', 3)).toBe('27.15');
    expect(lineAmountHalfUp('0.10', 3)).toBe('0.30');
    expect(0.1 * 3).not.toBe(0.3);
  });

  it('computes the tax on a net half-up on the exact product (§10.17)', () => {
    // T1: 0.70 at 5 % is exactly 0.035.
    expect(taxAmountHalfUp('0.70', '0.05', 'fraction')).toBe('0.04');
    expect(Math.round(0.7 * 0.05 * 100) / 100).toBe(0.03);
    expect(taxAmountHalfUp('29.50', 23, 'percent')).toBe('6.79');
    expect(taxAmountExact('29.50', '0.23', 'fraction')).toBe('6.7850');
  });

  it('computes the gross on a net half-up on the exact product (G1–G4)', () => {
    const vectors: Array<[string, string, string]> = [
      ['29.50', '0.23', '36.29'],
      ['4.30', '0.05', '4.52'],
      ['31.50', '0.23', '38.75'],
      ['16.50', '0.23', '20.30'],
    ];
    for (const [net, rate, gross] of vectors) {
      expect(grossFromNetHalfUp(net, rate, 'fraction')).toBe(gross);
      expect(grossFromNetHalfUp(net, Number(rate) * 100, 'percent')).toBe(gross);
      expect(grossAmountHalfUp(net, rate, 'fraction')).toBe(gross);
    }
    // What the invoice line builder's `Math.round((n + EPSILON) * 100) / 100` answered.
    expect(Math.round((29.5 * 1.23 + Number.EPSILON) * 100) / 100).toBe(36.28);
  });

  it('carries a negative net (a discount line) half away from zero', () => {
    expect(grossFromNetHalfUp('-100.00', 0, 'fraction')).toBe('-100.00');
    expect(grossFromNetHalfUp('-29.50', '0.23', 'fraction')).toBe('-36.29');
  });

  it('refuses a negative rate', () => {
    expect(() => taxAmountHalfUp('1', '-0.23', 'fraction')).toThrow();
    expect(() => grossFromNetHalfUp('1', '-0.23', 'fraction')).toThrow();
  });
});

describe('quotients', () => {
  it('divides half-up on the exact quotient', () => {
    expect(quotientHalfUp('10', '3')).toBe('3.33');
    expect(quotientHalfUp('20', '3')).toBe('6.67');
    expect(quotientHalfUp('0.05', '2')).toBe('0.03');
    expect(quotientHalfUp('-0.05', '2')).toBe('-0.03');
    expect(quotientHalfUp('36.29', '1', 4)).toBe('36.2900');
    expect(quotientHalfUp('1', '-4')).toBe('-0.25');
    expect(() => quotientHalfUp('1', '0')).toThrow();
  });

  it('backs a net out of a gross', () => {
    expect(netFromGrossHalfUp('36.29', '0.23', 'fraction')).toBe('29.50');
    expect(netFromGrossHalfUp('123.00', '0.23', 'fraction')).toBe('100.00');
    expect(netFromGrossHalfUp('4.52', '5', 'percent')).toBe('4.30');
    expect(netFromGrossHalfUp('10.00', '0', 'fraction')).toBe('10.00');
  });
});

describe('percentOfHalfUp', () => {
  it('takes a percentage of an amount half-up on the exact product', () => {
    expect(percentOfHalfUp('0.45', '10')).toBe('0.05');
    expect(percentOfHalfUp('1.45', '10')).toBe('0.15');
    // 1.45 × 10 / 100 on doubles is below 0.145, so the promotions' round2 gave 0.14.
    expect(Math.round(((1.45 * 10) / 100) * 100) / 100).toBe(0.14);
    expect(percentOfHalfUp('100', '12.5')).toBe('12.50');
  });
});
