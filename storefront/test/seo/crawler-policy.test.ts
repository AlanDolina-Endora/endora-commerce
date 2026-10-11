import { describe, expect, it } from 'vitest';
import {
  FAILURE_BACKOFF_MS,
  FRESH_FOR_MS,
  MAX_CACHED_CHANNELS,
  READ_TIMEOUT_MS,
  ROBOTS_POLICY_PATH,
  STALE_REFRESH_BUDGET_MS,
  createCrawlerPolicyReader,
  isRobotsPolicyResponse,
} from '../../lib/seo/crawler-policy';
import { storefrontRobotsPolicyResponseSchema } from '@endora-commerce/contracts/seo';

/**
 * How the storefront reads a channel's default robots policy
 * (`specs/144-seo-search-engine-robots/contracts/crawler-policy.md` §3).
 *
 * The reader runs in the middleware, in front of every response, so the two
 * things it must never do are the two this file is mostly about:
 *
 *  * **fail a page.** Whatever the backend does — refuse, hang, answer
 *    nonsense — the reader answers, and the page is served (FR-017);
 *  * **confuse "there is no policy" with "I could not ask".** A switched-off
 *    module and a backend without the feature are *answers* and replace what
 *    was known; a timeout is not, and what was known stands. Treating the
 *    first as the second keeps a `noindex` in force after an operator withdrew
 *    it; treating the second as the first drops a `noindex` every time the
 *    backend hiccups.
 *
 * `fetch` and the clock are injected, so every case below is deterministic and
 * none of them waits.
 */

type Answer =
  | { status: number; body?: unknown; text?: string }
  | { throws: unknown }
  /** The request stays open until the test settles it with `settle()`. */
  | { hangs: true };

interface Call {
  url: string;
  headers: Headers;
  signal: AbortSignal | null | undefined;
}

function respond(answer: Exclude<Answer, { hangs: true }>): Response {
  if ('throws' in answer) throw answer.throws;
  const body = answer.text ?? JSON.stringify(answer.body ?? {});
  return new Response(body, {
    status: answer.status,
    headers: { 'content-type': 'application/json' },
  });
}

function harness(initial: Answer) {
  let answer = initial;
  let now = 1_000_000;
  const calls: Call[] = [];
  const hanging: ((settled: Exclude<Answer, { hangs: true }>) => void)[] = [];
  const timers: { at: number; fire: () => void }[] = [];
  const reader = createCrawlerPolicyReader({
    baseUrl: () => 'http://backend.test:3001',
    now: () => now,
    delay: (ms) =>
      new Promise<void>((resolve) => {
        timers.push({ at: now + ms, fire: resolve });
      }),
    fetch: async (input, init) => {
      calls.push({
        url: String(input),
        headers: new Headers(init?.headers),
        signal: init?.signal,
      });
      if ('hangs' in answer) {
        return new Promise<Response>((resolve, reject) => {
          hanging.push((settled) => {
            try {
              resolve(respond(settled));
            } catch (error) {
              reject(error);
            }
          });
        });
      }
      return respond(answer);
    },
  });
  /** Let every promise that can settle, settle. */
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  };
  return {
    reader,
    calls,
    flush,
    answerWith(next: Answer) {
      answer = next;
    },
    /** Move the clock without firing any timer — for the freshness and back-off cases. */
    advance(ms: number) {
      now += ms;
    },
    /** Move the clock and fire the timers that fall due. */
    async elapse(ms: number) {
      now += ms;
      for (const timer of timers.splice(0).filter((t) => {
        if (t.at <= now) return true;
        timers.push(t);
        return false;
      })) {
        timer.fire();
      }
      await flush();
    },
    /** Settle every request that is hanging. */
    async settle(settled: Exclude<Answer, { hangs: true }>) {
      for (const finish of hanging.splice(0)) finish(settled);
      await flush();
    },
    pendingTimers: () => timers.length,
  };
}

const ok = (index: boolean, follow: boolean): Exclude<Answer, { hangs: true }> => ({
  status: 200,
  body: { data: { index, follow } },
});
const MODULE_DISABLED: Exclude<Answer, { hangs: true }> = {
  status: 503,
  body: { error: { code: 'MODULE_DISABLED', message: "Module 'seo' is currently disabled." } },
};
const NOINDEX = { kind: 'value', value: { index: false, follow: false } } as const;

describe('a readable policy', () => {
  it('is the value the backend answered', async () => {
    const h = harness(ok(false, true));
    expect(await h.reader.robotsPolicy('pl')).toEqual({
      kind: 'value',
      value: { index: false, follow: true },
    });
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]!.url).toBe(`http://backend.test:3001${ROBOTS_POLICY_PATH}`);
    expect(ROBOTS_POLICY_PATH).toBe('/api/v1/storefront/seo/robots-policy');
  });

  it('is fresh for a minute: no second request inside the window', async () => {
    const h = harness(ok(false, false));
    await h.reader.robotsPolicy('pl');
    h.answerWith(ok(true, true));
    h.advance(FRESH_FOR_MS - 1);
    expect(await h.reader.robotsPolicy('pl')).toEqual(NOINDEX);
    expect(h.calls).toHaveLength(1);
    expect(FRESH_FOR_MS).toBe(60_000);
  });

  it('is refetched once when stale, and the new value replaces the old', async () => {
    const h = harness(ok(false, false));
    await h.reader.robotsPolicy('pl');
    h.answerWith(ok(true, true));
    h.advance(FRESH_FOR_MS);
    expect(await h.reader.robotsPolicy('pl')).toEqual({
      kind: 'value',
      value: { index: true, follow: true },
    });
    expect(h.calls).toHaveLength(2);
    // …and that answer is fresh in its turn.
    expect(await h.reader.robotsPolicy('pl')).toEqual({
      kind: 'value',
      value: { index: true, follow: true },
    });
    expect(h.calls).toHaveLength(2);
  });

  it('is asked for once when several requests arrive together', async () => {
    const h = harness(ok(false, false));
    const answers = await Promise.all([
      h.reader.robotsPolicy('pl'),
      h.reader.robotsPolicy('pl'),
      h.reader.robotsPolicy('pl'),
    ]);
    expect(answers).toEqual([NOINDEX, NOINDEX, NOINDEX]);
    expect(h.calls).toHaveLength(1);
  });

  it('is read from an answer carrying fields this storefront does not know', async () => {
    // A storefront is deployed apart from its backend and is usually the older
    // one. A backend that later adds a field must not turn this read into
    // "unreadable": on a freshly started storefront that would serve a noindex
    // channel with no directive at all.
    const h = harness({
      status: 200,
      body: {
        data: { index: false, follow: false, maxSnippet: 0, somethingNewer: { nested: true } },
        meta: { generatedAt: '2026-10-11T00:00:00.000Z' },
      },
    });
    expect(await h.reader.robotsPolicy('pl')).toEqual(NOINDEX);
  });

  it('is asked for with a two-second budget', async () => {
    const h = harness(ok(true, true));
    await h.reader.robotsPolicy('pl');
    expect(h.calls[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(READ_TIMEOUT_MS).toBe(2_000);
  });
});

describe('a definitive "there is no policy"', () => {
  it('is what a switched-off module means', async () => {
    const h = harness(MODULE_DISABLED);
    expect(await h.reader.robotsPolicy('pl')).toEqual({ kind: 'none' });
  });

  it('is what a backend without the route means', async () => {
    const h = harness({ status: 404, body: { error: { code: 'NOT_FOUND' } } });
    expect(await h.reader.robotsPolicy('pl')).toEqual({ kind: 'none' });
  });

  it('is cached like a value', async () => {
    const h = harness(MODULE_DISABLED);
    await h.reader.robotsPolicy('pl');
    h.advance(FRESH_FOR_MS - 1);
    expect(await h.reader.robotsPolicy('pl')).toEqual({ kind: 'none' });
    expect(h.calls).toHaveLength(1);
  });

  it('replaces an earlier value — the module was switched off, so the noindex is withdrawn', async () => {
    const h = harness(ok(false, false));
    expect(await h.reader.robotsPolicy('pl')).toEqual(NOINDEX);

    h.answerWith(MODULE_DISABLED);
    h.advance(FRESH_FOR_MS);
    expect(await h.reader.robotsPolicy('pl')).toEqual({ kind: 'none' });

    // And it stays withdrawn when the backend then becomes unreadable: the
    // last thing known is that there is no policy, not the value before it.
    h.answerWith({ throws: new TypeError('fetch failed') });
    h.advance(FRESH_FOR_MS);
    expect(await h.reader.robotsPolicy('pl')).toEqual({ kind: 'none' });
  });

  it('is replaced in its turn when the module comes back', async () => {
    const h = harness(MODULE_DISABLED);
    await h.reader.robotsPolicy('pl');
    h.answerWith(ok(false, false));
    h.advance(FRESH_FOR_MS);
    expect(await h.reader.robotsPolicy('pl')).toEqual(NOINDEX);
  });

  it('is not what a 503 without the module code means', async () => {
    // A proxy in front of a restarting backend answers 503 too. That is "could
    // not ask", and it must not withdraw a noindex.
    const h = harness(ok(false, false));
    await h.reader.robotsPolicy('pl');
    for (const unreadable of [
      { status: 503, text: '<html>Service Unavailable</html>' },
      { status: 503, body: { error: { code: 'SERVICE_UNAVAILABLE' } } },
      { status: 503, body: {} },
    ] satisfies Answer[]) {
      h.answerWith(unreadable);
      h.advance(FRESH_FOR_MS);
      expect(await h.reader.robotsPolicy('pl')).toEqual(NOINDEX);
    }
  });
});

describe('an unreadable policy', () => {
  const UNREADABLE: [string, Answer][] = [
    ['a timeout', { throws: new DOMException('The operation timed out.', 'TimeoutError') }],
    [
      'a refused connection',
      {
        throws: new TypeError('fetch failed', {
          cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
        }),
      },
    ],
    ['a 500', { status: 500, body: { error: { code: 'INTERNAL_ERROR' } } }],
    ['a 502', { status: 502, text: 'Bad Gateway' }],
    ['a 401', { status: 401, body: { error: { code: 'UNAUTHENTICATED' } } }],
    ['a body that is not JSON', { status: 200, text: '<!doctype html><title>Login</title>' }],
    ['a body with a key missing', { status: 200, body: { data: { index: false } } }],
    ['a body with a string for a boolean', { status: 200, body: { data: { index: 'false', follow: true } } }],
    ['a body with no envelope', { status: 200, body: { index: false, follow: false } }],
    [
      'a body whose unknown fields come with a known one missing',
      { status: 200, body: { data: { follow: false, somethingNewer: true } } },
    ],
  ];

  it.each(UNREADABLE)('answers "unknown" for %s when nothing was ever known', async (_label, answer) => {
    const h = harness(answer);
    expect(await h.reader.robotsPolicy('pl')).toEqual({ kind: 'unknown' });
  });

  it.each(UNREADABLE)('answers the last-known value for %s', async (_label, answer) => {
    const h = harness(ok(false, false));
    await h.reader.robotsPolicy('pl');
    h.answerWith(answer);
    h.advance(FRESH_FOR_MS);
    expect(await h.reader.robotsPolicy('pl')).toEqual(NOINDEX);
  });

  it('answers the last-known value however old it is', async () => {
    const h = harness(ok(false, false));
    await h.reader.robotsPolicy('pl');
    h.answerWith({ throws: new TypeError('fetch failed') });
    h.advance(7 * 24 * 60 * 60 * 1000);
    expect(await h.reader.robotsPolicy('pl')).toEqual(NOINDEX);
  });

  it('never rejects, whatever the failure', async () => {
    for (const [, answer] of UNREADABLE) {
      await expect(harness(answer).reader.robotsPolicy('pl')).resolves.toBeDefined();
    }
    await expect(
      harness({ throws: 'a thrown string, not an Error' }).reader.robotsPolicy('pl'),
    ).resolves.toEqual({ kind: 'unknown' });
  });

  it('is retried at most once every five seconds while it keeps failing', async () => {
    const h = harness({ throws: new TypeError('fetch failed') });
    await h.reader.robotsPolicy('pl');
    expect(h.calls).toHaveLength(1);

    h.advance(FAILURE_BACKOFF_MS - 1);
    expect(await h.reader.robotsPolicy('pl')).toEqual({ kind: 'unknown' });
    expect(h.calls).toHaveLength(1);

    h.advance(1);
    await h.reader.robotsPolicy('pl');
    expect(h.calls).toHaveLength(2);
    expect(FAILURE_BACKOFF_MS).toBe(5_000);
  });

  it('holds the same back-off when a stale value is being served', async () => {
    const h = harness(ok(false, false));
    await h.reader.robotsPolicy('pl');
    h.answerWith({ status: 500 });
    h.advance(FRESH_FOR_MS);
    await h.reader.robotsPolicy('pl');
    await h.reader.robotsPolicy('pl');
    h.advance(FAILURE_BACKOFF_MS - 1);
    expect(await h.reader.robotsPolicy('pl')).toEqual(NOINDEX);
    expect(h.calls).toHaveLength(2);
    h.advance(1);
    await h.reader.robotsPolicy('pl');
    expect(h.calls).toHaveLength(3);
  });

  it('recovers on the first successful read after the back-off', async () => {
    const h = harness({ throws: new TypeError('fetch failed') });
    expect(await h.reader.robotsPolicy('pl')).toEqual({ kind: 'unknown' });
    h.answerWith(ok(false, true));
    h.advance(FAILURE_BACKOFF_MS);
    expect(await h.reader.robotsPolicy('pl')).toEqual({
      kind: 'value',
      value: { index: false, follow: true },
    });
  });
});

describe('sales-channel isolation', () => {
  it('names the channel to the backend, and names none when the request had none', async () => {
    const h = harness(ok(true, true));
    await h.reader.robotsPolicy('pl_retail');
    await h.reader.robotsPolicy(undefined);
    expect(h.calls[0]!.headers.get('x-sales-channel')).toBe('pl_retail');
    expect(h.calls[1]!.headers.has('x-sales-channel')).toBe(false);
  });

  it('never answers one channel with another channel’s value', async () => {
    const h = harness(ok(false, false));
    expect(await h.reader.robotsPolicy('a')).toEqual(NOINDEX);

    // Channel B is asked for inside A's freshness window. It is a different
    // channel, so A's cached answer is not an answer to it.
    h.answerWith(ok(true, true));
    expect(await h.reader.robotsPolicy('b')).toEqual({
      kind: 'value',
      value: { index: true, follow: true },
    });
    expect(h.calls.map((call) => call.headers.get('x-sales-channel'))).toEqual(['a', 'b']);

    // And both keep their own.
    expect(await h.reader.robotsPolicy('a')).toEqual(NOINDEX);
    expect(await h.reader.robotsPolicy('b')).toEqual({
      kind: 'value',
      value: { index: true, follow: true },
    });
    expect(h.calls).toHaveLength(2);
  });

  it('never answers a request naming no channel with a named channel’s value, nor the reverse', async () => {
    const h = harness(ok(false, false));
    await h.reader.robotsPolicy('a');

    h.answerWith(ok(true, true));
    expect(await h.reader.robotsPolicy(undefined)).toEqual({
      kind: 'value',
      value: { index: true, follow: true },
    });

    h.answerWith(ok(true, false));
    expect(await h.reader.robotsPolicy('c')).toEqual({
      kind: 'value',
      value: { index: true, follow: false },
    });
    expect(h.calls).toHaveLength(3);
  });

  it('keeps "no channel" apart from a channel whose code is the empty string or "undefined"', async () => {
    const h = harness(ok(false, false));
    await h.reader.robotsPolicy(undefined);
    h.answerWith(ok(true, true));
    for (const code of ['', 'undefined', 'null']) {
      expect(await h.reader.robotsPolicy(code)).toEqual({
        kind: 'value',
        value: { index: true, follow: true },
      });
    }
    expect(h.calls).toHaveLength(4);
  });

  it('does not fall back to another channel’s last-known value when its own read fails', async () => {
    const h = harness(ok(false, false));
    await h.reader.robotsPolicy('a');
    h.answerWith({ throws: new TypeError('fetch failed') });
    expect(await h.reader.robotsPolicy('b')).toEqual({ kind: 'unknown' });
    expect(await h.reader.robotsPolicy(undefined)).toEqual({ kind: 'unknown' });
  });

  it('keeps "no channel" apart from a channel whose code is literally "default"', async () => {
    // The seeded system channel is called exactly that. A request naming it and
    // a request naming nothing are the same channel to the backend today, and
    // still two questions here: the backend is what resolves "none named".
    const h = harness(ok(false, false));
    await h.reader.robotsPolicy(undefined);
    h.answerWith(ok(true, true));
    expect(await h.reader.robotsPolicy('default')).toEqual({
      kind: 'value',
      value: { index: true, follow: true },
    });
    expect(await h.reader.robotsPolicy(undefined)).toEqual(NOINDEX);
    expect(h.calls).toHaveLength(2);
  });
});

/**
 * The channel code is a request header. Behind a proxy it is the proxy's;
 * reached directly it is whatever the client typed. So the cache is bounded —
 * and the bound must not become a way to make this storefront forget a real
 * channel's `noindex`: a forgotten value plus a backend outage is that
 * channel's files and its outage notice served with no directive.
 */
describe('a client inventing channel codes', () => {
  const UNKNOWN_CHANNEL: Answer = {
    status: 400,
    body: { error: { code: 'UNKNOWN_SALES_CHANNEL' } },
  };

  it('cannot grow the cache past its bound', async () => {
    const h = harness(ok(false, false));
    for (let i = 0; i < MAX_CACHED_CHANNELS + 50; i += 1) {
      await h.reader.robotsPolicy(`invented-${i}`);
    }
    expect(h.reader.cachedChannelCount()).toBeLessThanOrEqual(MAX_CACHED_CHANNELS);
  });

  it.each([
    ['refuses with 400', UNKNOWN_CHANNEL],
    ['answers 404', { status: 404, body: { error: { code: 'UNKNOWN_SALES_CHANNEL' } } }],
    ['cannot be read at all', { throws: new TypeError('fetch failed') }],
  ] satisfies [string, Answer][])(
    'cannot evict a real channel’s last-known value when the backend %s for the invented ones',
    async (_label, forInvented) => {
      const h = harness(ok(false, false));
      expect(await h.reader.robotsPolicy('real')).toEqual(NOINDEX);
      expect(await h.reader.robotsPolicy(undefined)).toEqual(NOINDEX);

      h.answerWith(forInvented);
      for (let i = 0; i < 300; i += 1) await h.reader.robotsPolicy(`inv_${i}`);
      expect(h.reader.cachedChannelCount()).toBeLessThanOrEqual(MAX_CACHED_CHANNELS);

      // Then the backend goes away, after the real channel's value went stale.
      h.answerWith({ throws: new TypeError('fetch failed') });
      h.advance(FRESH_FOR_MS);
      expect(await h.reader.robotsPolicy('real')).toEqual(NOINDEX);
      expect(await h.reader.robotsPolicy(undefined)).toEqual(NOINDEX);
    },
  );

  it('evicts the channel read longest ago when every entry holds a value', async () => {
    const h = harness(ok(false, false));
    await h.reader.robotsPolicy('first');
    await h.reader.robotsPolicy('second');
    for (let i = 0; i < MAX_CACHED_CHANNELS - 2; i += 1) await h.reader.robotsPolicy(`c-${i}`);
    expect(h.reader.cachedChannelCount()).toBe(MAX_CACHED_CHANNELS);

    // "first" is read again successfully, which makes it the most recent.
    h.advance(FRESH_FOR_MS);
    await h.reader.robotsPolicy('first');
    const before = h.calls.length;

    // One more channel: "second" is now the oldest and is the one that goes.
    await h.reader.robotsPolicy('one-more');
    h.answerWith({ throws: new TypeError('fetch failed') });
    h.advance(FRESH_FOR_MS);
    expect(await h.reader.robotsPolicy('first')).toEqual(NOINDEX);
    expect(await h.reader.robotsPolicy('second')).toEqual({ kind: 'unknown' });
    expect(h.calls.length).toBeGreaterThan(before);
  });
});

/**
 * FR-017: no response is *delayed* because the policy could not be read.
 *
 * Once a value is known there is something to serve, so a refresh is given a
 * short budget and no more: a healthy backend answers inside it and the fresh
 * value is served on the same request; a hanging one is left to finish in the
 * background while the known value is served. Only a process that knows nothing
 * waits for its first read — the alternative is serving a `noindex` channel
 * bare — and it waits once, then backs off.
 */
describe('a refresh that does not answer', () => {
  async function warm(): Promise<ReturnType<typeof harness>> {
    const h = harness(ok(false, false));
    expect(await h.reader.robotsPolicy('pl')).toEqual(NOINDEX);
    h.advance(FRESH_FOR_MS);
    return h;
  }

  it('costs a request with a known value no more than the budget', async () => {
    const h = await warm();
    h.answerWith({ hangs: true });

    let answered: unknown = 'pending';
    void h.reader.robotsPolicy('pl').then((read) => {
      answered = read;
    });
    await h.flush();
    expect(answered).toBe('pending');

    await h.elapse(STALE_REFRESH_BUDGET_MS);
    expect(answered).toEqual(NOINDEX);
    expect(STALE_REFRESH_BUDGET_MS).toBeLessThanOrEqual(250);
    expect(STALE_REFRESH_BUDGET_MS).toBeLessThan(READ_TIMEOUT_MS);
  });

  it('costs the requests that arrive while it is still hanging nothing at all', async () => {
    const h = await warm();
    h.answerWith({ hangs: true });
    void h.reader.robotsPolicy('pl');
    await h.elapse(STALE_REFRESH_BUDGET_MS);

    // The budget is the refresh's, not each request's: it is already spent.
    const timersBefore = h.pendingTimers();
    expect(await h.reader.robotsPolicy('pl')).toEqual(NOINDEX);
    expect(await h.reader.robotsPolicy('pl')).toEqual(NOINDEX);
    expect(h.pendingTimers()).toBe(timersBefore);
    expect(h.calls).toHaveLength(2);
  });

  it('shares one budget between requests that arrive together', async () => {
    const h = await warm();
    h.answerWith({ hangs: true });
    const all = Promise.all(Array.from({ length: 20 }, () => h.reader.robotsPolicy('pl')));
    await h.elapse(STALE_REFRESH_BUDGET_MS);
    expect(await all).toEqual(Array.from({ length: 20 }, () => NOINDEX));
    expect(h.calls).toHaveLength(2);
  });

  it('still serves the fresh value on the same request when the backend answers in time', async () => {
    const h = await warm();
    h.answerWith({ hangs: true });
    const read = h.reader.robotsPolicy('pl');
    await h.elapse(STALE_REFRESH_BUDGET_MS - 1);
    await h.settle(ok(true, true));
    expect(await read).toEqual({ kind: 'value', value: { index: true, follow: true } });
  });

  it('replaces the value when the refresh finishes in the background', async () => {
    const h = await warm();
    h.answerWith({ hangs: true });
    const read = h.reader.robotsPolicy('pl');
    await h.elapse(STALE_REFRESH_BUDGET_MS);
    expect(await read).toEqual(NOINDEX);

    await h.settle(ok(true, true));
    h.answerWith({ throws: new Error('must not be asked: the background answer is fresh') });
    expect(await h.reader.robotsPolicy('pl')).toEqual({
      kind: 'value',
      value: { index: true, follow: true },
    });
    expect(h.calls).toHaveLength(2);
  });

  it('withdraws the value when the background refresh says the module is off', async () => {
    const h = await warm();
    h.answerWith({ hangs: true });
    void h.reader.robotsPolicy('pl');
    await h.elapse(STALE_REFRESH_BUDGET_MS);
    await h.settle(MODULE_DISABLED);
    expect(await h.reader.robotsPolicy('pl')).toEqual({ kind: 'none' });
  });

  it('keeps the value, backs off and raises nothing when the background refresh fails', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const h = await warm();
      h.answerWith({ hangs: true });
      void h.reader.robotsPolicy('pl');
      await h.elapse(STALE_REFRESH_BUDGET_MS);

      await h.settle({ throws: new DOMException('The operation timed out.', 'TimeoutError') });
      // A macrotask, so that Node has had its chance to report a rejection.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);

      // Known value served, and no new request inside the back-off.
      expect(await h.reader.robotsPolicy('pl')).toEqual(NOINDEX);
      expect(h.calls).toHaveLength(2);
      h.advance(FAILURE_BACKOFF_MS);
      h.answerWith(ok(false, true));
      expect(await h.reader.robotsPolicy('pl')).toEqual({
        kind: 'value',
        value: { index: false, follow: true },
      });
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('is waited for by a process that knows nothing — once', async () => {
    // Cold start: there is nothing to serve in the meantime, and serving a
    // noindex channel bare is the worse answer. The read has its own two-second
    // limit, and the back-off keeps the next requests from waiting again.
    const h = harness({ hangs: true });
    let answered: unknown = 'pending';
    void h.reader.robotsPolicy('pl').then((read) => {
      answered = read;
    });
    await h.elapse(STALE_REFRESH_BUDGET_MS * 4);
    expect(answered).toBe('pending');

    await h.settle({ throws: new DOMException('The operation timed out.', 'TimeoutError') });
    expect(answered).toEqual({ kind: 'unknown' });
    expect(await h.reader.robotsPolicy('pl')).toEqual({ kind: 'unknown' });
    expect(h.calls).toHaveLength(1);
  });
});

/**
 * The reader checks the answer with a small guard of its own rather than with
 * the contract's Zod schema, so that the middleware bundle does not carry a
 * validation library for two booleans. The schema in `@endora-commerce/contracts`
 * stays the statement of what the answer is; this holds the guard to it.
 */
describe('isRobotsPolicyResponse agrees with the contract schema', () => {
  const FIXTURES: unknown[] = [
    { data: { index: true, follow: true } },
    { data: { index: false, follow: true } },
    { data: { index: true, follow: false } },
    { data: { index: false, follow: false } },
    { data: { index: false, follow: false, maxSnippet: 0 }, meta: { a: 1 } },
    { data: { index: false } },
    { data: { follow: false, somethingNewer: true } },
    { data: { index: 'false', follow: true } },
    { data: { index: 0, follow: 1 } },
    { data: { index: null, follow: true } },
    { data: null },
    { data: 'NOINDEX, FOLLOW' },
    { data: [true, true] },
    { data: {} },
    { index: false, follow: false },
    {},
    null,
    undefined,
    'a string',
    42,
    [],
    [{ data: { index: true, follow: true } }],
  ];

  it.each(FIXTURES.map((fixture) => [JSON.stringify(fixture) ?? 'undefined', fixture]))(
    'on %s',
    (_label, fixture) => {
      expect(isRobotsPolicyResponse(fixture)).toBe(
        storefrontRobotsPolicyResponseSchema.safeParse(fixture).success,
      );
    },
  );

  it('accepts some fixtures and refuses others — the comparison is not vacuous', () => {
    const verdicts = FIXTURES.map((fixture) => isRobotsPolicyResponse(fixture));
    expect(verdicts.filter(Boolean)).toHaveLength(5);
    expect(verdicts.filter((verdict) => !verdict).length).toBeGreaterThan(10);
  });
});
