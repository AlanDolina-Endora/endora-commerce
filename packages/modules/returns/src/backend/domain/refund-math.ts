import { compareDecimals, lineAmountHalfUp, moneySum, roundHalfUp, vatByRate } from '@endora-commerce/contracts';

/**
 * Refund math — pure domain (feature 046, US5 / FR-031/032).
 *
 * The default refund for a returned quantity is what was paid for it, under the
 * platform's one VAT method over the returned lines ({@link defaultRefunds}). The approved amount
 * an admin settles per line may never exceed that default; the case total is the
 * sum of the approved per-line amounts.
 *
 * Exact decimal arithmetic (issue #417): an amount is read as the decimal it is
 * written as and rounded half-up on its decimal digits, where the binary
 * rounding made a typed 1.005 the refund 1.00. Results that cross into the
 * contract are numbers holding a two-place decimal, losslessly.
 */

/** An approved amount as it is capped, summed and stored: two places, half-up. */
export function approvedAmount(value: string | number): string {
  return roundHalfUp(value);
}

/**
 * The default refund of each returned line, under **the one VAT method**
 * (`vatByRate`, owner ruling of 2026-10-24, issue #417): the returned nets
 * (net unit price × returned quantity), per rate VAT on their sum rounded
 * once, and each line its net plus its share of that VAT. A full return
 * refunds exactly what the invoice charged for those lines (9.05 × 3 at 8 % is
 * 29.32); a partial return applies the same rule to the returned quantity. Two-
 * place decimal strings, in the order given.
 */
export function defaultRefunds(
  lines: ReadonlyArray<{ unitNetPrice: string | number; taxRate: string | number; quantity: number }>,
): string[] {
  return vatByRate(
    lines.map((l) => ({ net: lineAmountHalfUp(l.unitNetPrice, l.quantity), rate: l.taxRate })),
    'fraction',
  ).lines.map((l) => l.gross);
}


/**
 * True when an approved amount, at the two places it would be stored at,
 * exceeds the line's paid cap. This replaced a half-cent tolerance on doubles,
 * which let 100.005 through against a 100.00 cap.
 */
export function exceedsCap(approved: string | number, cap: string | number): boolean {
  return compareDecimals(approvedAmount(approved), cap) > 0;
}

/** Case total = sum of the approved per-line amounts, each at two places. */
export function sumApproved(amounts: ReadonlyArray<string | number>): number {
  return Number(moneySum(amounts.map(approvedAmount)));
}
