import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { AMOUNT_PRECISION_EXCEEDED, promotionActionSchema, upsertPromotionRequestSchema } from '../src/index.js';

/**
 * Owner ruling of 2026-10-24 (issue #417) — every money field a person or an
 * integration types refuses more than two decimal places with the precision
 * issue (`money-input.ts`), which the error envelope answers as
 * `400 AMOUNT_PRECISION_EXCEEDED`. Price-book prices keep their own four-place
 * grammar and are not here.
 */
function refusedPaths(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value);
  if (result.success) return [];
  return result.error.issues.filter((i) => i.message === AMOUNT_PRECISION_EXCEEDED).map((i) => i.path.join('.'));
}

describe('promotions', () => {
  const base = { name: 'P', currency: 'PLN' };

  it('refuses a fixed amount, a minimum spend and an action amount with three places', () => {
    expect(refusedPaths(upsertPromotionRequestSchema, { ...base, kind: 'amount_off', value: 1.005 })).toEqual(['value']);
    expect(refusedPaths(upsertPromotionRequestSchema, { ...base, kind: 'amount_off', value: 1, minCartSubtotal: 9.999 })).toEqual([
      'minCartSubtotal',
    ]);
    expect(refusedPaths(promotionActionSchema, { type: 'amount_off_cart', amount: 1.005, currency: 'PLN' })).toEqual(['amount']);
    expect(
      refusedPaths(promotionActionSchema, { type: 'spend_x_amount_off', spendStep: 100.001, amount: 5, currency: 'PLN' }),
    ).toEqual(['spendStep']);
  });

  it('leaves a percentage alone and accepts two places', () => {
    expect(refusedPaths(upsertPromotionRequestSchema, { ...base, kind: 'percentage_off', value: 12.345 })).toEqual([]);
    expect(upsertPromotionRequestSchema.safeParse({ ...base, kind: 'amount_off', value: 1.05 }).success).toBe(true);
  });
});
