import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AMOUNT_PRECISION_EXCEEDED,
  ERROR_CODES,
  hasAtMostTwoDecimals,
  twoDecimalAmount,
  twoDecimalAmountString,
} from '../src/index.js';

/**
 * Owner ruling of 2026-10-24 (issue #417) — a money amount a person or an
 * integration types has at most two decimal places; more is refused, never
 * rounded. One refinement, one issue code, one error code.
 */
describe('hasAtMostTwoDecimals', () => {
  it('reads a number as the decimal it is written as', () => {
    for (const ok of [0, 1, 1.5, 1.05, 12345.67, '9.99', '10', '0.50']) expect(hasAtMostTwoDecimals(ok)).toBe(true);
    for (const bad of [1.005, 2.675, 0.001, '9.999', '1.000']) expect(hasAtMostTwoDecimals(bad)).toBe(false);
  });
});

describe('twoDecimalAmount', () => {
  const schema = z.object({ cost: twoDecimalAmount(z.number().finite().nonnegative()) });

  it('accepts two places and refuses three with the precision issue', () => {
    expect(schema.safeParse({ cost: 1.05 }).success).toBe(true);
    const refused = schema.safeParse({ cost: 1.005 });
    expect(refused.success).toBe(false);
    const issue = refused.error!.issues[0]!;
    expect(issue.path).toEqual(['cost']);
    expect(issue.message).toBe(AMOUNT_PRECISION_EXCEEDED);
    expect((issue as { params?: { code?: string } }).params?.code).toBe(AMOUNT_PRECISION_EXCEEDED);
  });

  it('keeps the schema’s own checks and composes with optional and nullable', () => {
    const optional = z.object({ cost: twoDecimalAmount(z.number().nonnegative()).nullable().optional() });
    expect(optional.safeParse({}).success).toBe(true);
    expect(optional.safeParse({ cost: null }).success).toBe(true);
    expect(optional.safeParse({ cost: -1 }).success).toBe(false);
  });

  it('is the error code the envelope answers with', () => {
    expect(ERROR_CODES.AMOUNT_PRECISION_EXCEEDED).toBe(AMOUNT_PRECISION_EXCEEDED);
  });
});

describe('twoDecimalAmountString', () => {
  it('refuses a decimal string with more than two places', () => {
    const schema = twoDecimalAmountString(z.string());
    expect(schema.safeParse('123.45').success).toBe(true);
    expect(schema.safeParse('123.456').error?.issues[0]?.message).toBe(AMOUNT_PRECISION_EXCEEDED);
  });
});
