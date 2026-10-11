import { describe, expect, it } from 'vitest';
import {
  storefrontRobotsPolicyResponseSchema,
  storefrontRobotsPolicySchema,
} from './seo.js';

/**
 * `specs/144-seo-search-engine-robots/contracts/crawler-policy.md` §1 — what
 * `GET /api/v1/storefront/seo/robots-policy` answers.
 *
 * The wire carries two booleans and nothing else. The token an operator picks
 * on the Settings screen (`NOINDEX, FOLLOW` …) is the `seo` module's stored
 * vocabulary and never crosses it, so a consumer branches on `index` and
 * `follow` and cannot come to depend on a spelling.
 */
describe('storefrontRobotsPolicySchema', () => {
  it.each([
    { index: true, follow: true },
    { index: false, follow: true },
    { index: true, follow: false },
    { index: false, follow: false },
  ])('accepts %o', (policy) => {
    expect(storefrontRobotsPolicySchema.parse(policy)).toEqual(policy);
  });

  it('rejects a missing key', () => {
    expect(storefrontRobotsPolicySchema.safeParse({ index: false }).success).toBe(false);
    expect(storefrontRobotsPolicySchema.safeParse({ follow: false }).success).toBe(false);
    expect(storefrontRobotsPolicySchema.safeParse({}).success).toBe(false);
  });

  it('rejects a value that is not a boolean', () => {
    expect(storefrontRobotsPolicySchema.safeParse({ index: 'false', follow: true }).success).toBe(
      false,
    );
    expect(storefrontRobotsPolicySchema.safeParse({ index: true, follow: 0 }).success).toBe(false);
    expect(storefrontRobotsPolicySchema.safeParse({ index: null, follow: true }).success).toBe(
      false,
    );
  });

  it('rejects the stored token riding along with the booleans', () => {
    expect(
      storefrontRobotsPolicySchema.safeParse({
        index: false,
        follow: false,
        defaultRobots: 'NOINDEX, NOFOLLOW',
      }).success,
    ).toBe(false);
  });
});

describe('storefrontRobotsPolicyResponseSchema', () => {
  it('accepts the envelope', () => {
    const body = { data: { index: false, follow: true } };
    expect(storefrontRobotsPolicyResponseSchema.parse(body)).toEqual(body);
  });

  it('rejects a bare policy, an empty envelope and the stored token as data', () => {
    expect(
      storefrontRobotsPolicyResponseSchema.safeParse({ index: false, follow: true }).success,
    ).toBe(false);
    expect(storefrontRobotsPolicyResponseSchema.safeParse({ data: {} }).success).toBe(false);
    expect(
      storefrontRobotsPolicyResponseSchema.safeParse({ data: 'NOINDEX, FOLLOW' }).success,
    ).toBe(false);
  });
});
