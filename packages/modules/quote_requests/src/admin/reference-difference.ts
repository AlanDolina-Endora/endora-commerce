/**
 * Feature 146 (FR-003 – FR-005) — the difference between a line's price and its
 * reference price, as the admin quote request screen shows it: an amount and a
 * percentage of the reference, both signed and rounded to two decimals.
 *
 * Overview compares the customer's proposal; the Modify tab compares the agreed
 * price being typed. Both read this one rule and format at the edge, through
 * `number-format.ts` in the admin's language. Pure: no I/O, no locale.
 */

/** A reference price as the screen holds it — stored at request, or current. */
export interface ReferenceAmount {
  amount: number;
  currency: string;
}

export interface ReferenceDifference {
  /** `price − reference`, two decimals. */
  amount: number;
  /** `(price − reference) / reference × 100`, two decimals; `null` for a zero reference. */
  percent: number | null;
}

/** Two-decimal rounding that never answers `-0`. */
function round2(n: number): number {
  const rounded = Math.round(n * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

/**
 * `null` whenever the difference cannot be computed (FR-005): no price, no
 * reference, or a reference in another currency than the line. A zero
 * reference still has an amount but no percentage.
 */
export function referenceDifference(
  price: number | null,
  lineCurrency: string,
  reference: ReferenceAmount | null,
): ReferenceDifference | null {
  if (price === null || !Number.isFinite(price)) return null;
  if (reference === null || !Number.isFinite(reference.amount)) return null;
  if (reference.currency !== lineCurrency) return null;
  const amount = round2(price - reference.amount);
  const percent =
    reference.amount === 0 ? null : round2(((price - reference.amount) / reference.amount) * 100);
  return { amount, percent };
}
