/**
 * How this storefront learns a sales channel's default robots policy
 * (`specs/144-seo-search-engine-robots/contracts/crawler-policy.md` §3).
 *
 * The middleware asks on behalf of every response it serves, so the reader is a
 * cache first and a client second: one request per channel per minute, held in
 * this module's own memory. It uses neither Next's data cache nor cache tags,
 * for two reasons — the middleware cannot reach them, and the requirement is a
 * guaranteed answer when the backend cannot be asked, which a tag-invalidated
 * entry does not promise.
 *
 * ## Three answers, and why two of them must not be confused
 *
 * | The backend said | That is | Effect |
 * | --- | --- | --- |
 * | `200` and a valid body | a **value** | cached, fresh for a minute; becomes what is known |
 * | `503` `MODULE_DISABLED`, or `404` | **no policy, definitively** | cached the same way, and it *replaces* what was known |
 * | anything else — a timeout, a refused connection, any other status, a body that fails the schema | **unreadable** | what was known stands, however old; if nothing was ever known, `unknown` |
 *
 * "The module is switched off" and "the backend has no such route" are answers:
 * an operator withdrew the policy, or it never existed here, and a `noindex`
 * kept in force after that would be this storefront overruling them. A timeout
 * is not an answer, and dropping a `noindex` every time the backend hiccups
 * would put a shop that must stay out of search back into it for a minute at a
 * time. So the first replaces the last-known value and the second never does.
 *
 * ## What it never does
 *
 * **It never rejects.** No page is answered with a failure because this read
 * failed (FR-017); every failure becomes one of the three answers above.
 *
 * ## What "known" means
 *
 * Per storefront process, in memory, per runtime: the middleware's copy and a
 * route handler's are separate and each is bounded by the same minute. A
 * freshly started process knows nothing, so until its first successful read a
 * channel's documents carry no default directive — the cold-start window the
 * module's documentation names.
 */

import { storefrontRobotsPolicyResponseSchema } from '@endora-commerce/contracts/seo';
import type { StorefrontRobotsPolicy } from '@endora-commerce/contracts/seo';
import { backendBaseUrl } from '../env.mjs';

/** The backend route this reader asks. */
export const ROBOTS_POLICY_PATH = '/api/v1/storefront/seo/robots-policy';

/** How long an answer is served without asking again. */
export const FRESH_FOR_MS = 60_000;

/** While the backend cannot be read, how long before it is asked again. */
export const FAILURE_BACKOFF_MS = 5_000;

/** How long one read is given before it counts as unreadable. */
export const READ_TIMEOUT_MS = 2_000;

/**
 * How many channels are held at once.
 *
 * The channel code is a request header: behind a proxy it is the proxy's, but a
 * storefront reached directly takes whatever the client typed. Without a bound
 * a client inventing codes would grow this map for the life of the process. The
 * oldest entry goes first; a dropped channel is read again on its next request,
 * at the cost of its last-known value.
 */
export const MAX_CACHED_CHANNELS = 256;

/** What a caller is told. `unknown` is "could not ask, and nothing was ever known". */
export type CrawlerRead<T> =
  | { readonly kind: 'value'; readonly value: T }
  | { readonly kind: 'none' }
  | { readonly kind: 'unknown' };

export type RobotsPolicyRead = CrawlerRead<StorefrontRobotsPolicy>;

/** A definitive answer — the only kind that is cached and the only kind that is "known". */
type Known<T> = Exclude<CrawlerRead<T>, { kind: 'unknown' }>;

interface Entry<T> {
  /** The last definitive answer, of any age. */
  known: Known<T> | null;
  /** When `known` was read. */
  knownAt: number;
  /** When the last read failed, or `null` if the last read succeeded. */
  failedAt: number | null;
  /** The read in progress, so concurrent requests share it. */
  inFlight: Promise<CrawlerRead<T>> | null;
}

export interface CrawlerPolicyReaderDeps {
  readonly fetch: (input: string, init?: RequestInit) => Promise<Response>;
  readonly now: () => number;
  /** The backend's address, host only. Read per request, never captured. */
  readonly baseUrl: () => string;
}

export interface CrawlerPolicyReader {
  /**
   * The default robots policy of `channelCode`, or of the system-default
   * channel when the request named none.
   */
  robotsPolicy(channelCode: string | undefined): Promise<RobotsPolicyRead>;
  /** How many channels are held. For tests. */
  cachedChannelCount(): number;
}

/**
 * The cache key for a channel.
 *
 * "No channel named" is its own key and cannot collide with any code a request
 * could carry — including the empty string and the literal `undefined` — which
 * is what keeps one channel's answer from being served for another.
 */
function channelKey(channelCode: string | undefined): string {
  return channelCode === undefined ? 'default' : `code:${channelCode}`;
}

/** Whether a `503` body is the platform saying the owning module is switched off. */
function saysModuleDisabled(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return false;
  return (error as { code?: unknown }).code === 'MODULE_DISABLED';
}

async function jsonOrNull(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export function createCrawlerPolicyReader(deps: CrawlerPolicyReaderDeps): CrawlerPolicyReader {
  const entries = new Map<string, Entry<StorefrontRobotsPolicy>>();

  /** One read of the backend, classified. `null` means unreadable. */
  async function ask(
    channelCode: string | undefined,
  ): Promise<Known<StorefrontRobotsPolicy> | null> {
    let response: Response;
    try {
      response = await deps.fetch(`${deps.baseUrl()}${ROBOTS_POLICY_PATH}`, {
        headers: {
          accept: 'application/json',
          ...(channelCode !== undefined ? { 'x-sales-channel': channelCode } : {}),
        },
        // This module is the cache; nothing underneath it may be one too.
        cache: 'no-store',
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      });
    } catch {
      return null;
    }

    if (response.status === 404) return { kind: 'none' };
    if (response.status === 503) {
      return saysModuleDisabled(await jsonOrNull(response)) ? { kind: 'none' } : null;
    }
    if (response.status !== 200) return null;

    const parsed = storefrontRobotsPolicyResponseSchema.safeParse(await jsonOrNull(response));
    return parsed.success ? { kind: 'value', value: parsed.data.data } : null;
  }

  function entryFor(key: string): Entry<StorefrontRobotsPolicy> {
    const existing = entries.get(key);
    if (existing) return existing;
    if (entries.size >= MAX_CACHED_CHANNELS) {
      // A Map iterates in insertion order, so the first key is the oldest.
      const oldest = entries.keys().next();
      if (!oldest.done) entries.delete(oldest.value);
    }
    const created: Entry<StorefrontRobotsPolicy> = {
      known: null,
      knownAt: 0,
      failedAt: null,
      inFlight: null,
    };
    entries.set(key, created);
    return created;
  }

  return {
    cachedChannelCount: () => entries.size,

    async robotsPolicy(channelCode) {
      const entry = entryFor(channelKey(channelCode));
      const lastKnown = (): RobotsPolicyRead => entry.known ?? { kind: 'unknown' };

      const now = deps.now();
      if (entry.known !== null && now - entry.knownAt < FRESH_FOR_MS) return entry.known;
      if (entry.failedAt !== null && now - entry.failedAt < FAILURE_BACKOFF_MS) return lastKnown();
      if (entry.inFlight !== null) return entry.inFlight;

      entry.inFlight = ask(channelCode)
        .catch(() => null)
        .then((answer) => {
          if (answer === null) {
            entry.failedAt = deps.now();
          } else {
            entry.known = answer;
            entry.knownAt = deps.now();
            entry.failedAt = null;
          }
          entry.inFlight = null;
          return lastKnown();
        });
      return entry.inFlight;
    },
  };
}

const reader = createCrawlerPolicyReader({
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
  baseUrl: backendBaseUrl,
});

/** This process's reader. See the module doc for what it remembers and for how long. */
export function readRobotsPolicy(channelCode: string | undefined): Promise<RobotsPolicyRead> {
  return reader.robotsPolicy(channelCode);
}
