import { z } from 'zod';
import { decimalText } from './price-book-decimal.js';

/**
 * A typed money amount has at most two decimal places — owner ruling of
 * 2026-10-24, issue #417. Every money field a person or an integration enters
 * (a delivery cost, a payment surcharge, a quote's agreed or desired unit
 * price, a refund, a credit limit, a promotion's fixed amount) refuses more
 * with `400 AMOUNT_PRECISION_EXCEEDED`, and nothing rounds it: an amount the
 * platform stores is the amount that was typed. Price-book prices have their
 * own four-place grammar and do not use this.
 *
 * The refusal is a Zod issue tagged with the code, so a schema states it once
 * and the error envelope (`@endora-commerce/platform/http`) turns a request
 * whose only failures are this one into the error code.
 */
export const AMOUNT_PRECISION_EXCEEDED = 'AMOUNT_PRECISION_EXCEEDED' as const;

const DECIMAL = /^-?\d+(?:\.(\d+))?$/;

/** Whether a number (read as its shortest decimal) or a decimal string has at most two decimal places. */
export function hasAtMostTwoDecimals(value: number | string): boolean {
  if (typeof value === 'number' && !Number.isFinite(value)) return false;
  const match = DECIMAL.exec(decimalText(value));
  if (!match) return false;
  const fraction = match[1] ?? '';
  // A string keeps its trailing zeros: `1.000` was typed with three places.
  return (typeof value === 'number' ? fraction.replace(/0+$/, '') : fraction).length <= 2;
}

const PRECISION_ISSUE = { message: AMOUNT_PRECISION_EXCEEDED, params: { code: AMOUNT_PRECISION_EXCEEDED } };

/** A number schema refusing more than two decimal places with the precision issue. */
export function twoDecimalAmount<T extends z.ZodNumber>(schema: T): T {
  return schema.refine((value) => hasAtMostTwoDecimals(value), PRECISION_ISSUE) as T;
}

/** A decimal-string schema refusing more than two decimal places with the precision issue. */
export function twoDecimalAmountString<T extends z.ZodString>(schema: T): T {
  return schema.refine((value) => hasAtMostTwoDecimals(value), PRECISION_ISSUE) as T;
}

/** The precision issue, for a `superRefine` that decides per field (a promotion's value is money only for `amount_off`). */
export function addAmountPrecisionIssue(ctx: z.RefinementCtx, path: PropertyKey[]): void {
  ctx.addIssue({ code: 'custom', path, ...PRECISION_ISSUE });
}

/** Whether a Zod issue (or a Fastify-wrapped one, whose `params` carry the issue's) is the precision issue. */
export function isAmountPrecisionIssue(issue: unknown): boolean {
  if (!issue || typeof issue !== 'object') return false;
  const params = (issue as { params?: { code?: unknown; params?: { code?: unknown } } }).params;
  return params?.code === AMOUNT_PRECISION_EXCEEDED || params?.params?.code === AMOUNT_PRECISION_EXCEEDED;
}
