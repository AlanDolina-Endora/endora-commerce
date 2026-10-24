import { compareDecimals, lineAmountHalfUp, moneyDifference, moneySum } from '@endora-commerce/contracts';

/**
 * A cart's amounts, in the contracts' exact decimal arithmetic (issue #417).
 * A cart is net and carries no tax. Its amounts are published as numbers
 * (`Money.amount`); each is a two-place decimal, which a number holds
 * losslessly. On doubles, 3 × 9.05 was published as 27.150000000000002.
 */

/** A line's amount, `unitPrice × quantity`, at two places. */
export function cartLineAmount(unitPrice: string | number, quantity: number): number {
  return Number(lineAmountHalfUp(unitPrice, quantity));
}

/** The sum of the lines' amounts, as a two-place decimal string. */
export function cartSubtotal(lines: ReadonlyArray<{ unitPrice: string | number; quantity: number }>): string {
  return moneySum(lines.map((l) => lineAmountHalfUp(l.unitPrice, l.quantity)));
}

/** `subtotal − discount`, never below zero. */
export function cartTotalAfterDiscount(subtotal: string | number, discount: string | number): number {
  const total = moneyDifference(subtotal, discount);
  return compareDecimals(total, 0) < 0 ? 0 : Number(total);
}

/** What is missing to a minimum spend, or `null` when the subtotal meets it. */
export function cartShortfall(subtotal: string | number, minimum: string | number): number | null {
  return compareDecimals(minimum, subtotal) > 0 ? Number(moneyDifference(minimum, subtotal)) : null;
}
