import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@endora-commerce/contracts';
import { registerErrorEnvelope } from './error-envelope.js';

/**
 * A request the rate limiter refuses is answered `429 RATE_LIMITED`, in the
 * envelope, with the limiter's headers intact.
 *
 * ## The defect this file was written from
 *
 * `@fastify/rate-limit` refuses by **throwing** a plain `Error` carrying
 * `statusCode: 429` (its default `errorResponseBuilder`). The handler had a
 * branch for `HttpError`, for Zod, for the tenant write guard and for a unique
 * constraint, and none for that — so the refusal reached the fallback, was
 * answered `500 INTERNAL` and logged as an "unhandled error". The platform's
 * global per-client limit had always answered that way; feature 146's
 * per-request draft-edit limit was the first one a buyer could reach.
 *
 * ## Where the line is drawn
 *
 * Only `429` is mapped. Other throwers carry a `statusCode` too — Fastify's own
 * content-type-parser errors among them — and turning every such error into a
 * client error would be a decision about each of them, not this one. A thrown
 * error with a 5xx `statusCode`, or none, keeps answering `500 INTERNAL` and is
 * still logged.
 *
 * And only the **limiter's** 429 (security review W4). A handler that lets an
 * upstream client's 429 escape is a fault of this server, not the caller
 * exceeding a budget; mapping it silently would hide it. The limiter's refusal
 * is recognised by the `Retry-After` it set on the reply — a header it writes
 * on the exceeded path only, where the `x-ratelimit-*` headers are written on
 * every request it counts.
 */

interface CapturedLine {
  readonly level: number;
}

function buildProbe(): { app: ReturnType<typeof Fastify>; lines: CapturedLine[] } {
  const lines: CapturedLine[] = [];
  const app = Fastify({
    logger: {
      level: 'error',
      stream: {
        write(chunk: string) {
          lines.push(JSON.parse(chunk) as CapturedLine);
        },
      },
    },
  });
  registerErrorEnvelope(app);
  return { app, lines };
}

describe('the error envelope answers a rate-limited request 429', () => {
  it('answers the refused request 429 RATE_LIMITED, keeps Retry-After, and logs nothing', async () => {
    const { app, lines } = buildProbe();
    await app.register(rateLimit, { max: 1, timeWindow: '1 minute' });
    app.get('/limited', async () => ({ ok: true }));

    const first = await app.inject({ method: 'GET', url: '/limited' });
    expect(first.statusCode).toBe(200);

    const refused = await app.inject({ method: 'GET', url: '/limited' });
    expect(refused.statusCode, refused.body).toBe(429);
    expect(refused.json()).toEqual({
      error: {
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Too many requests.',
        requestId: expect.any(String),
      },
    });
    expect(refused.headers['retry-after']).toBeDefined();
    expect(refused.headers['x-ratelimit-limit']).toBe('1');
    expect(refused.headers['x-ratelimit-remaining']).toBe('0');
    expect(
      lines.filter((line) => line.level >= 50),
      'a refused request is the client exceeding a budget, not a server fault',
    ).toHaveLength(0);
  });

  it("answers a route's own config.rateLimit refusal the same way", async () => {
    const { app, lines } = buildProbe();
    await app.register(rateLimit, { global: false });
    app.get('/route-limited', { config: { rateLimit: { max: 1, timeWindow: '1 minute' } } }, async () => ({
      ok: true,
    }));

    expect((await app.inject({ method: 'GET', url: '/route-limited' })).statusCode).toBe(200);
    const refused = await app.inject({ method: 'GET', url: '/route-limited' });
    expect(refused.statusCode, refused.body).toBe(429);
    expect(refused.json()).toMatchObject({ error: { code: ERROR_CODES.RATE_LIMITED } });
    expect(lines.filter((line) => line.level >= 50)).toHaveLength(0);
  });

  it('does not silently map a foreign 429 thrown on a route the limiter counts', async () => {
    // An upstream client's 429 escaping a handler: the reply already carries
    // the limiter's `x-ratelimit-*` headers for this (allowed) request, and no
    // `Retry-After`. It is this server's fault, so it stays a logged 500.
    const { app, lines } = buildProbe();
    await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
    app.get('/upstream-429', async () => {
      throw Object.assign(new Error('upstream said too many requests'), { statusCode: 429 });
    });

    const response = await app.inject({ method: 'GET', url: '/upstream-429' });
    expect(response.headers['x-ratelimit-limit']).toBe('100');
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ error: { code: ERROR_CODES.INTERNAL } });
    expect(lines.filter((line) => line.level >= 50)).toHaveLength(1);
  });

  it('does not silently map a foreign 429 thrown where no limiter runs', async () => {
    const { app, lines } = buildProbe();
    app.get('/upstream-429', async () => {
      throw Object.assign(new Error('upstream said too many requests'), { statusCode: 429 });
    });

    const response = await app.inject({ method: 'GET', url: '/upstream-429' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ error: { code: ERROR_CODES.INTERNAL } });
    expect(lines.filter((line) => line.level >= 50)).toHaveLength(1);
  });

  it('keeps a thrown error with a 5xx statusCode a logged 500 INTERNAL', async () => {
    const { app, lines } = buildProbe();
    app.get('/upstream', async () => {
      throw Object.assign(new Error('upstream gave up'), { statusCode: 503 });
    });

    const response = await app.inject({ method: 'GET', url: '/upstream' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ error: { code: ERROR_CODES.INTERNAL } });
    expect(lines.filter((line) => line.level >= 50)).toHaveLength(1);
  });

  it('does not map a client statusCode other than 429', async () => {
    const { app, lines } = buildProbe();
    app.get('/teapot', async () => {
      throw Object.assign(new Error('not a rate limit'), { statusCode: 418 });
    });

    const response = await app.inject({ method: 'GET', url: '/teapot' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ error: { code: ERROR_CODES.INTERNAL } });
    expect(lines.filter((line) => line.level >= 50)).toHaveLength(1);
  });
});
