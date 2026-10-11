import { describe, expect, it } from 'vitest';
import { storefrontRobotsPolicySchema } from '@endora-commerce/contracts';
import { manifest } from '../../manifest.js';
import {
  DEFAULT_ROBOTS_SETTING_CODE,
  DEFAULT_ROBOTS_TOKENS,
  UnknownRobotsTokenError,
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

  /**
   * A stored value this build cannot read is a **failure**, not "no
   * restriction".
   *
   * The settings API refuses such a value on write, so reaching this takes a
   * row written around it. Answering `{ index: true, follow: true }` for it
   * would be a definitive answer: a storefront holding `noindex` for the
   * channel would replace it within a minute and put the shop back into search
   * on the strength of a value nobody chose. Throwing makes the endpoint answer
   * `500`, which a storefront reads as "could not ask" and keeps what it knew.
   * (`specs/144-seo-search-engine-robots/tasks.md` T007 asked for the
   * permissive answer; this is the deviation.)
   */
  it.each([
    ['a token outside the list', 'NOINDEX'],
    ['a differently spelled token', 'noindex, nofollow'],
    ['the empty string', ''],
    ['an inherited object key', 'toString'],
    ['a boolean', false],
    ['null', null],
    ['undefined', undefined],
  ])('refuses %s rather than answering no restriction', (_label, token) => {
    expect(() => robotsPolicyForToken(token)).toThrow(UnknownRobotsTokenError);
  });

  it('names the setting and the value it could not read', () => {
    try {
      robotsPolicyForToken('NOINDEX');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownRobotsTokenError);
      expect((error as UnknownRobotsTokenError).token).toBe('NOINDEX');
      expect((error as Error).message).toContain(DEFAULT_ROBOTS_SETTING_CODE);
      expect((error as Error).message).toContain('"NOINDEX"');
    }
  });
});
