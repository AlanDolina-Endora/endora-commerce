import {
  decimalProduct,
  lineAmountHalfUp,
  moneySum,
  percentOfHalfUp,
  roundHalfUp,
  type CartLine,
} from '@endora-commerce/contracts';

/**
 * Round to 2 decimal places (money), half-up on the value's decimal digits
 * (issue #417). A number is read as its shortest decimal, so a sum or a
 * difference of two-place amounts rounds to the two places it stands for;
 * `Math.round(value * 100) / 100` rounded the binary double.
 */
export function round2(value: number | string): number {
  return Number(roundHalfUp(value));
}

/** `percent` % of an amount, half-up on the exact decimal product (10 % of 1.45 is 0.15). */
export function percentOf(amount: number | string, percent: number | string): number {
  return Number(percentOfHalfUp(amount, percent));
}

/** `count × amount`, exactly, at two places. */
export function times(count: number, amount: number | string): number {
  return Number(roundHalfUp(decimalProduct(count, amount)));
}

export function cartSubtotal(lines: readonly CartLine[]): number {
  return Number(moneySum(lines.map((l) => lineAmountHalfUp(l.unitPrice.amount, l.quantity))));
}

/** A single purchasable unit expanded from a cart line (one per quantity). */
export interface CartUnit {
  productId: string;
  variantId: string | null;
  price: number;
}

/** Expand cart lines into individual units (one entry per quantity). */
export function expandUnits(lines: readonly CartLine[]): CartUnit[] {
  const units: CartUnit[] = [];
  for (const line of lines) {
    for (let i = 0; i < line.quantity; i += 1) {
      units.push({ productId: line.productId, variantId: line.variantId, price: line.unitPrice.amount });
    }
  }
  return units;
}
