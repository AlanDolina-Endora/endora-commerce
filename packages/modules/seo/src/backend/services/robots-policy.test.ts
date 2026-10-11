import { describe, expect, it } from 'vitest';
import { storefrontRobotsPolicySchema } from '@endora-commerce/contracts';
import { manifest } from '../../manifest.js';
import {
  DEFAULT_ROBOTS_SETTING_CODE,
  DEFAULT_ROBOTS_TOKENS,
  robotsPolicyForToken,
} from './robots-policy.js';

/**
 * The stored token ↔ `{ index, follow }` mapping
 * (`specs/144-seo-search-engine-robots/contracts/crawler-policy.md` §1).
 *
 * The four tokens are written twice — as the dropdown's `enumOptions` in the
 * manifest, which is a static declaration, and as the keys of the mapping. The
 * first case below is what holds the two to each other: a choice an operator
 * can pick and the mapping does not know would be served as "no restriction".
 */
describe('robotsPolicyForToken', () => {
  const declared = manifest.settings?.settings.find(
    (setting) => setting.code === DEFAULT_ROBOTS_SETTING_CODE,
  );

  it('knows exactly the choices the manifest offers', () => {
    expect(declared?.enumOptions).toEqual([...DEFAULT_ROBOTS_TOKENS]);
  });

  it.each([
    ['INDEX, FOLLOW', { index: true, follow: true }],
    ['NOINDEX, FOLLOW', { index: false, follow: true }],
    ['INDEX, NOFOLLOW', { index: true, follow: false }],
    ['NOINDEX, NOFOLLOW', { index: false, follow: false }],
  ])('maps %s', (token, policy) => {
    expect(robotsPolicyForToken(token)).toEqual(policy);
  });

  it('is total over the declared choices and each answer fits the wire schema', () => {
    const answers = DEFAULT_ROBOTS_TOKENS.map((token) => robotsPolicyForToken(token));
    for (const answer of answers) {
      expect(storefrontRobotsPolicySchema.safeParse(answer).success).toBe(true);
    }
    // Four choices, four different policies: no two tokens collapse into one.
    expect(new Set(answers.map((answer) => JSON.stringify(answer))).size).toBe(4);
  });

  it.each([
    ['a token outside the list', 'NOINDEX'],
    ['a differently spelled token', 'noindex, nofollow'],
    ['the empty string', ''],
    ['a boolean', false],
    ['null', null],
    ['undefined', undefined],
  ])('answers no restriction for %s', (_label, token) => {
    expect(robotsPolicyForToken(token)).toEqual({ index: true, follow: true });
  });
});
