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
 *
 * The schema is strict about the two members it reads and tolerant of members
 * it does not know — the second half is what lets a backend add a field
 * without every storefront already deployed reading the answer as unreadable.
 * (`specs/144-seo-search-engine-robots/tasks.md` T005 asked for an extra member
 * to be *rejected*; forward compatibility won, and the member is dropped
 * instead.)
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

  it('accepts a member it does not know, and drops it', () => {
    // A later backend adding a field must not make this answer unreadable.
    const parsed = storefrontRobotsPolicySchema.parse({
      index: false,
      follow: false,
      maxSnippet: 0,
      defaultRobots: 'NOINDEX, NOFOLLOW',
    });
    // …and the consumer never sees what it was not written for — the stored
    // token included, should a backend ever send it.
    expect(parsed).toEqual({ index: false, follow: false });
    expect(Object.keys(parsed)).toEqual(['index', 'follow']);
  });

  it('is not made valid by an unknown member when a known one is missing or mistyped', () => {
    expect(
      storefrontRobotsPolicySchema.safeParse({ index: false, defaultRobots: 'NOINDEX, NOFOLLOW' })
        .success,
    ).toBe(false);
    expect(
      storefrontRobotsPolicySchema.safeParse({ index: 'false', follow: true, extra: true }).success,
    ).toBe(false);
  });
});

describe('storefrontRobotsPolicyResponseSchema', () => {
  it('accepts the envelope', () => {
    const body = { data: { index: false, follow: true } };
    expect(storefrontRobotsPolicyResponseSchema.parse(body)).toEqual(body);
  });

  it('accepts an envelope and a policy carrying members it does not know', () => {
    expect(
      storefrontRobotsPolicyResponseSchema.parse({
        data: { index: true, follow: false, maxSnippet: 0 },
        meta: { generatedAt: '2026-10-11T00:00:00.000Z' },
      }),
    ).toEqual({ data: { index: true, follow: false } });
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
