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
 * **It never makes a response wait for a backend that is not answering, once it
 * knows something.** A stale value is refreshed on the request that finds it
 * stale, and that request waits for the refresh for at most
 * {@link STALE_REFRESH_BUDGET_MS}: a healthy backend answers well inside it, so
 * the fresh value is served on the same request and a saved change is in force
 * as soon as the minute is up. A backend that does not answer in time is left
 * to finish in the background — its answer replaces the value when it arrives —
 * and the known value is served meanwhile. The budget belongs to the refresh,
 * not to each request: requests arriving while it is still running wait only
 * for what is left of it, which after the first is nothing.
 *
 * **The one wait that remains is a cold start.** A process that knows nothing
 * has nothing to serve in the meantime, and serving a `noindex` channel with no
 * directive is the worse answer, so the first read of a channel is waited for —
 * up to {@link READ_TIMEOUT_MS}, once, after which the back-off keeps later
 * requests from waiting again.
 *
 * The background refresh relies on this process outliving the response, which
 * is true of the standalone server this storefront is built as.
 *
 * ## What "known" means
 *
 * Per storefront process, in memory, per runtime: the middleware's copy and a
 * route handler's are separate and each is bounded by the same minute. A
 * freshly started process knows nothing, so until its first successful read a
 * channel's documents carry no default directive — the cold-start window the
 * module's documentation names.
 */

import { backendBaseUrl } from '../env.mjs';

/**
 * A sales channel's default robots policy, as the backend answers it.
 *
 * The contract is `storefrontRobotsPolicySchema` in `@endora-commerce/contracts`.
 * It is restated here as a type and checked by {@link isRobotsPolicyResponse}
 * rather than imported, so that the middleware bundle carries no validation
 * library for two booleans and this file needs nothing from a package to run.
 * `test/seo/crawler-policy.test.ts` holds the guard to the schema.
 */
export interface RobotsPolicy {
  /** `false` asks search engines not to index the channel's storefront. */
  readonly index: boolean;
  /** `false` asks search engines not to follow the links on its pages. */
  readonly follow: boolean;
}

/**
 * Whether `body` is `{ data: { index: boolean, follow: boolean } }`.
 *
 * Strict about the two members it reads and tolerant of any it does not know,
 * exactly as the schema is: a backend that later adds a field must not make
 * this storefront read the answer as unreadable.
 */
export function isRobotsPolicyResponse(body: unknown): body is { data: RobotsPolicy } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
  const data = (body as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  const { index, follow } = data as { index?: unknown; follow?: unknown };
  return typeof index === 'boolean' && typeof follow === 'boolean';
}

/** The backend route this reader asks. */
export const ROBOTS_POLICY_PATH = '/api/v1/storefront/seo/robots-policy';

/** How long an answer is served without asking again. */
export const FRESH_FOR_MS = 60_000;

/** While the backend cannot be read, how long before it is asked again. */
export const FAILURE_BACKOFF_MS = 5_000;

/** How long one read is given before it counts as unreadable. */
export const READ_TIMEOUT_MS = 2_000;

/**
 * How long a request holding a known value waits for its refresh.
 *
 * Long enough that a healthy backend on the same network always answers inside
 * it, short enough that a backend which does not is not felt.
 */
export const STALE_REFRESH_BUDGET_MS = 150;

/**
 * How many channels are held at once.
 *
 * The channel code is a request header: behind a proxy it is the proxy's, but a
 * storefront reached directly takes whatever the client typed. Without a bound
 * a client inventing codes would grow this map for the life of the process.
 *
 * What is dropped to make room is chosen so that inventing codes cannot make
 * this process forget a real channel's policy: an entry that holds nothing goes
 * first, then one that holds "no policy", and only when every entry holds a
 * value does the value read longest ago go. A code the backend refuses never
 * comes to hold a value, so it can only ever displace its own kind.
 */
export const MAX_CACHED_CHANNELS = 256;

/** What a caller is told. `unknown` is "could not ask, and nothing was ever known". */
export type CrawlerRead<T> =
  | { readonly kind: 'value'; readonly value: T }
  | { readonly kind: 'none' }
  | { readonly kind: 'unknown' };

export type RobotsPolicyRead = CrawlerRead<RobotsPolicy>;

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
  /** When `inFlight` started. */
  inFlightSince: number;
}

export interface CrawlerPolicyReaderDeps {
  readonly fetch: (input: string, init?: RequestInit) => Promise<Response>;
  readonly now: () => number;
  /** The backend's address, host only. Read per request, never captured. */
  readonly baseUrl: () => string;
  /** Resolves after `ms`. The budget a stale value's refresh is raced against. */
  readonly delay: (ms: number) => Promise<void>;
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
  const entries = new Map<string, Entry<RobotsPolicy>>();

  /** One read of the backend, classified. `null` means unreadable. */
  async function ask(
    channelCode: string | undefined,
  ): Promise<Known<RobotsPolicy> | null> {
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

    const body = await jsonOrNull(response);
    if (!isRobotsPolicyResponse(body)) return null;
    // Only the two members this storefront was written for leave this function.
    return { kind: 'value', value: { index: body.data.index, follow: body.data.follow } };
  }

  /** Drop one entry to make room. See {@link MAX_CACHED_CHANNELS} for the order. */
  function evictOne(): void {
    let holdsNoPolicy: string | undefined;
    let oldest: string | undefined;
    // A Map iterates in insertion order, and a successful read re-inserts its
    // entry, so the first key of each kind is the one read longest ago.
    for (const [key, entry] of entries) {
      if (entry.known === null) {
        entries.delete(key);
        return;
      }
      if (entry.known.kind === 'none') holdsNoPolicy ??= key;
      oldest ??= key;
    }
    const victim = holdsNoPolicy ?? oldest;
    if (victim !== undefined) entries.delete(victim);
  }

  function entryFor(key: string): Entry<RobotsPolicy> {
    const existing = entries.get(key);
    if (existing) return existing;
    if (entries.size >= MAX_CACHED_CHANNELS) evictOne();
    const created: Entry<RobotsPolicy> = {
      known: null,
      knownAt: 0,
      failedAt: null,
      inFlight: null,
      inFlightSince: 0,
    };
    entries.set(key, created);
    return created;
  }

  return {
    cachedChannelCount: () => entries.size,

    async robotsPolicy(channelCode) {
      const key = channelKey(channelCode);
      const entry = entryFor(key);
      const lastKnown = (): RobotsPolicyRead => entry.known ?? { kind: 'unknown' };

      const now = deps.now();
      if (entry.known !== null && now - entry.knownAt < FRESH_FOR_MS) return entry.known;
      if (entry.failedAt !== null && now - entry.failedAt < FAILURE_BACKOFF_MS) return lastKnown();

      if (entry.inFlight === null) {
        entry.inFlightSince = now;
        // `ask` turns every failure into `null`; the `catch` is for whatever it
        // did not foresee. This promise never rejects, which is what makes it
        // safe to leave running after the request that started it has answered.
        entry.inFlight = ask(channelCode)
          .catch(() => null)
          .then((answer) => {
            if (answer === null) {
              entry.failedAt = deps.now();
            } else {
              entry.known = answer;
              entry.knownAt = deps.now();
              entry.failedAt = null;
              // Most recently read goes last, so it is the last to be evicted —
              // and an entry evicted while its read was running comes back.
              entries.delete(key);
              entries.set(key, entry);
            }
            entry.inFlight = null;
            return lastKnown();
          });
      }
      const refresh = entry.inFlight;

      // Nothing is known: there is nothing to serve meanwhile, so wait (the
      // read has its own limit, and the back-off spares the requests after it).
      const stale = entry.known;
      if (stale === null) return refresh;

      // Something is known: the refresh gets what is left of its budget.
      const left = STALE_REFRESH_BUDGET_MS - (now - entry.inFlightSince);
      if (left <= 0) return stale;
      return Promise.race([refresh, deps.delay(left).then(() => stale)]);
    },
  };
}

const reader = createCrawlerPolicyReader({
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
  baseUrl: backendBaseUrl,
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});

/** This process's reader. See the module doc for what it remembers and for how long. */
export function readRobotsPolicy(channelCode: string | undefined): Promise<RobotsPolicyRead> {
  return reader.robotsPolicy(channelCode);
}
