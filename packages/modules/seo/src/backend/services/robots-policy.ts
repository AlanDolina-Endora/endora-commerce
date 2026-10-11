import type { StorefrontRobotsPolicy } from '@endora-commerce/contracts';

/**
 * *Default robots* — the stored token and what it means
 * (`specs/144-seo-search-engine-robots/contracts/crawler-policy.md` §1).
 *
 * **This file is the one place the stored spelling is interpreted.** An
 * operator picks one of four tokens on the Settings screen and that token is
 * what the settings store keeps; everything downstream of this module — the
 * public endpoint, the storefront, a search engine — sees two booleans. So if
 * the stored values ever have to change (translated choices would need machine
 * tokens rather than the directive pairs), the change is this map, the
 * manifest's `enumOptions`, and a migration of the stored rows, and no
 * consumer notices.
 *
 * The manifest states the same four tokens as its `enumOptions`. It is a static
 * declaration that imports nothing from the module's backend, so the list is
 * written there a second time; `robots-policy.test.ts` holds the two to each
 * other.
 */

/** The setting an operator edits, per sales channel. */
export const DEFAULT_ROBOTS_SETTING_CODE = 'seo.default_robots';

const POLICY_BY_TOKEN = {
  'INDEX, FOLLOW': { index: true, follow: true },
  'NOINDEX, FOLLOW': { index: false, follow: true },
  'INDEX, NOFOLLOW': { index: true, follow: false },
  'NOINDEX, NOFOLLOW': { index: false, follow: false },
} as const satisfies Record<string, StorefrontRobotsPolicy>;

export type DefaultRobotsToken = keyof typeof POLICY_BY_TOKEN;

/** The four choices, in the order the Settings screen offers them. */
export const DEFAULT_ROBOTS_TOKENS = Object.keys(POLICY_BY_TOKEN) as readonly DefaultRobotsToken[];

/** No restriction: what an instance nobody configured has always served. */
const UNRESTRICTED: StorefrontRobotsPolicy = { index: true, follow: true };

/**
 * The policy a stored value stands for.
 *
 * A value outside the list answers **no restriction**. The settings API
 * refuses such a value on write, so reaching this branch takes a row written
 * around it; the default never adds a restriction an operator did not choose,
 * and a token this build does not know is not a choice it can read.
 */
export function robotsPolicyForToken(token: unknown): StorefrontRobotsPolicy {
  if (typeof token === 'string' && Object.hasOwn(POLICY_BY_TOKEN, token)) {
    return { ...POLICY_BY_TOKEN[token as DefaultRobotsToken] };
  }
  return { ...UNRESTRICTED };
}
