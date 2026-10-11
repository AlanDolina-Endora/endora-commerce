import { describe, expect, it } from 'vitest';
import {
  FAILURE_BACKOFF_MS,
  FRESH_FOR_MS,
  MAX_CACHED_CHANNELS,
  READ_TIMEOUT_MS,
  ROBOTS_POLICY_PATH,
  createCrawlerPolicyReader,
} from '../../lib/seo/crawler-policy';

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
  | { throws: unknown };

interface Call {
  url: string;
  headers: Headers;
  signal: AbortSignal | null | undefined;
}

function harness(initial: Answer) {
  let answer = initial;
  let now = 1_000_000;
  const calls: Call[] = [];
  const reader = createCrawlerPolicyReader({
    baseUrl: () => 'http://backend.test:3001',
    now: () => now,
    fetch: async (input, init) => {
      calls.push({
        url: String(input),
        headers: new Headers(init?.headers),
        signal: init?.signal,
      });
      if ('throws' in answer) throw answer.throws;
      const body = answer.text ?? JSON.stringify(answer.body ?? {});
      return new Response(body, {
        status: answer.status,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  return {
    reader,
    calls,
    answerWith(next: Answer) {
      answer = next;
    },
    advance(ms: number) {
      now += ms;
    },
  };
}

const ok = (index: boolean, follow: boolean): Answer => ({
  status: 200,
  body: { data: { index, follow } },
});
const MODULE_DISABLED: Answer = {
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

  it('holds a bounded number of channels, so a client inventing channel codes cannot grow it', async () => {
    // The channel code is a request header. Behind a proxy it is the proxy's;
    // reached directly it is whatever the client typed.
    const h = harness(ok(false, false));
    await h.reader.robotsPolicy('real');
    for (let i = 0; i < MAX_CACHED_CHANNELS + 10; i += 1) {
      await h.reader.robotsPolicy(`invented-${i}`);
    }
    expect(h.reader.cachedChannelCount()).toBeLessThanOrEqual(MAX_CACHED_CHANNELS);
    // A channel that was dropped is simply read again.
    const before = h.calls.length;
    expect(await h.reader.robotsPolicy('real')).toEqual(NOINDEX);
    expect(h.calls.length).toBe(before + 1);
  });
});
