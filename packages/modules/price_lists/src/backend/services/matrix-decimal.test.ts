import { describe, expect, it } from 'vitest';
import {
  applyDiscountPercent,
  compareDecimal,
  formatUnits,
  parsePercentHundredths,
  parseUnits,
} from './matrix-decimal.js';

/**
 * Feature 148 — the integer decimal helpers behind percentage matrix prices
 * (research R17/R18). Amounts are `numeric(14,4)`, percentages
 * `numeric(5,2)`; both are carried as integers so a computed price is exact to
 * the four digits a typed bracket is stored at, and never drifts through a
 * float.
 */
describe('parseUnits / formatUnits', () => {
  it('parses a decimal string to integer ten-thousandths', () => {
    expect(parseUnits('100')).toBe(1_000_000n);
    expect(parseUnits('100.0000')).toBe(1_000_000n);
    expect(parseUnits('0.0525')).toBe(525n);
    expect(parseUnits('12.5')).toBe(125_000n);
    expect(parseUnits('0')).toBe(0n);
  });

  it('refuses what is not a non-negative decimal with up to four fractional digits', () => {
    expect(() => parseUnits('1.00001')).toThrow();
    expect(() => parseUnits('-1')).toThrow();
    expect(() => parseUnits('abc')).toThrow();
    expect(() => parseUnits('')).toThrow();
  });

  it('formats ten-thousandths with exactly four fractional digits', () => {
    expect(formatUnits(880_000n)).toBe('88.0000');
    expect(formatUnits(350n)).toBe('0.0350');
    expect(formatUnits(0n)).toBe('0.0000');
  });
});

describe('parsePercentHundredths', () => {
  it('parses a percentage to integer hundredths', () => {
    expect(parsePercentHundredths('12')).toBe(1200n);
    expect(parsePercentHundredths('33.33')).toBe(3333n);
    expect(parsePercentHundredths('12.5')).toBe(1250n);
    expect(parsePercentHundredths('100.00')).toBe(10_000n);
  });

  it('refuses more than two fractional digits', () => {
    expect(() => parsePercentHundredths('1.234')).toThrow();
  });
});

describe('applyDiscountPercent', () => {
  it('takes the percentage off the reference amount', () => {
    expect(applyDiscountPercent('100.0000', '12')).toBe('88.0000');
    expect(applyDiscountPercent('100', '5')).toBe('95.0000');
  });

  it('rounds half-up at the fifth fractional digit', () => {
    // 0.0525 × 66.67% = 0.035001… → 0.0350
    expect(applyDiscountPercent('0.0525', '33.33')).toBe('0.0350');
    // 0.0001 × 50% = 0.00005 → half rounds up → 0.0001
    expect(applyDiscountPercent('0.0001', '50')).toBe('0.0001');
    // 0.0003 × 50% = 0.00015 → 0.0002
    expect(applyDiscountPercent('0.0003', '50')).toBe('0.0002');
    // 9.9999 × 87.5% = 8.7499125 → 8.7499
    expect(applyDiscountPercent('9.9999', '12.5')).toBe('8.7499');
  });

  it('yields zero for a 100% discount', () => {
    expect(applyDiscountPercent('123.4567', '100')).toBe('0.0000');
  });

  it('does not drift on amounts a float cannot hold exactly', () => {
    // 9 999 999 999.9999 × 0.99 — beyond a double's 15 significant digits.
    expect(applyDiscountPercent('9999999999.9999', '1')).toBe('9899999999.9999');
    expect(applyDiscountPercent('1234567890.1234', '0.01')).toBe('1234444433.3344');
  });
});

describe('compareDecimal', () => {
  it('orders decimal strings numerically regardless of scale', () => {
    expect(compareDecimal('88', '88.0000')).toBe(0);
    expect(compareDecimal('9.5', '10')).toBe(-1);
    expect(compareDecimal('100.0001', '100')).toBe(1);
  });
});
