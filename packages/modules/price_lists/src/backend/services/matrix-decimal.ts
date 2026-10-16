/**
 * Integer decimal arithmetic for matrix prices (feature 148, research R17/R18).
 *
 * Amounts are `numeric(14,4)` and percentages `numeric(5,2)`, and both travel as
 * strings. A percentage price is the one place this module *computes* an
 * amount rather than reading one, so it is computed on integers: amounts in
 * ten-thousandths, percentages in hundredths, one multiplication and one
 * half-up rounding back to four fractional digits — the precision a typed
 * bracket is stored at, so a computed price and a typed one are
 * indistinguishable to carts and orders. A double carries fifteen significant
 * digits and `numeric(14,4)` eighteen, which is why nothing here goes through
 * `Number`. No dependency: one multiplication does not justify one
 * (Constitution IV).
 */

const AMOUNT = /^(\d+)(?:\.(\d{1,4}))?$/;
const PERCENT = /^(\d{1,3})(?:\.(\d{1,2}))?$/;

/** A non-negative decimal string with up to four fractional digits, as ten-thousandths. */
export function parseUnits(value: string): bigint {
  const match = AMOUNT.exec(value);
  if (!match) throw new Error(`Not a decimal amount with up to 4 fractional digits: "${value}"`);
  return BigInt(match[1]!) * 10_000n + BigInt((match[2] ?? '').padEnd(4, '0'));
}

/** Ten-thousandths as a decimal string with exactly four fractional digits. */
export function formatUnits(units: bigint): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / 10_000n;
  const fraction = (abs % 10_000n).toString().padStart(4, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
}

/** A percentage with up to two fractional digits, as hundredths of a percent. */
export function parsePercentHundredths(value: string): bigint {
  const match = PERCENT.exec(value);
  if (!match) throw new Error(`Not a percentage with up to 2 fractional digits: "${value}"`);
  return BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
}

/**
 * `reference × (100 − percent) / 100`, rounded half-up to four fractional
 * digits. With the reference in ten-thousandths and the percentage in
 * hundredths the product is exact and the divisor is 10 000, so the rounding is
 * one integer step: add half the divisor, then truncate.
 */
export function applyDiscountPercent(reference: string, percent: string): string {
  const units = parseUnits(reference);
  const keep = 10_000n - parsePercentHundredths(percent);
  if (keep < 0n) throw new Error(`A discount above 100% is not a price: "${percent}"`);
  return formatUnits((units * keep + 5_000n) / 10_000n);
}

/** Numeric comparison of two non-negative decimal strings: −1, 0 or 1. */
export function compareDecimal(a: string, b: string): -1 | 0 | 1 {
  const x = parseUnits(a);
  const y = parseUnits(b);
  return x < y ? -1 : x > y ? 1 : 0;
}
