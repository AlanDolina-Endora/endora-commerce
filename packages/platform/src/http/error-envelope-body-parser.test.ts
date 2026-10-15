import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@endora-commerce/contracts';
import { registerErrorEnvelope } from './error-envelope.js';

/**
 * A request body Fastify refuses to parse is the **client's** fault, and the
 * envelope says so with Fastify's own status.
 *
 * ## The measurement this file was written from
 *
 * `DELETE /api/v1/admin/settings/seo.default_robots/values` sent with
 * `Content-Type: application/json` and no body answered `500 INTERNAL`; the
 * same request without the header answered 200. Found while working on
 * `specs/144-seo-search-engine-robots/` and confirmed by a reviewer.
 *
 * Fastify's content-type parser throws `FST_ERR_CTP_EMPTY_JSON_BODY` with
 * `statusCode: 400` before any route hook runs. The handler recognised Zod
 * failures, `HttpError`, the tenant write guard and unique violations — and
 * nothing Fastify itself raises — so the error reached the 500 fallback and was
 * logged as an unhandled fault. The same path took a malformed JSON body (400),
 * a body over the limit (413) and an unsupported media type (415): an operator
 * read four kinds of client typo as server incidents.
 *
 * Because the parse happens before the route's guard, none of this depends on
 * being signed in, and the probe below has no guard either.
 */

interface CapturedLine {
  readonly level: number;
}

function buildProbe(): { app: ReturnType<typeof Fastify>; lines: CapturedLine[] } {
  const lines: CapturedLine[] = [];
  const app = Fastify({
    bodyLimit: 32,
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
  app.delete('/values', async () => ({ ok: true }));
  app.post('/values', async () => ({ ok: true }));
  return { app, lines };
}

describe('the error envelope answers a refused request body as a client error', () => {
  it('answers 400 VALIDATION_FAILED to an empty body declared as JSON, not 500', async () => {
    const { app, lines } = buildProbe();
    const response = await app.inject({
      method: 'DELETE',
      url: '/values',
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: expect.stringContaining('application/json'),
        requestId: expect.any(String),
      },
    });
    expect(
      lines.filter((line) => line.level >= 50),
      'a client sending a header without a body is not a server fault',
    ).toHaveLength(0);
  });

  it('still accepts the same request without the content type', async () => {
    const { app } = buildProbe();
    const response = await app.inject({ method: 'DELETE', url: '/values' });

    expect(response.statusCode).toBe(200);
  });

  it.each([
    ['a malformed JSON body', 'application/json', '{not json', 400],
    ['a body over the limit', 'application/json', JSON.stringify({ padding: 'x'.repeat(64) }), 413],
    ['an unsupported media type', 'text/x-unknown', 'anything', 415],
    // Issue #245 — the case it was reported with: a form post to a JSON route.
    // The platform registers no `application/x-www-form-urlencoded` parser.
    ['a form-encoded body on a JSON route', 'application/x-www-form-urlencoded', 'a=1', 415],
  ])('answers %s with Fastify\'s own status and the envelope', async (_label, contentType, payload, status) => {
    const { app, lines } = buildProbe();
    const response = await app.inject({
      method: 'POST',
      url: '/values',
      headers: { 'content-type': contentType },
      payload,
    });

    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({
      error: { code: ERROR_CODES.VALIDATION_FAILED, requestId: expect.any(String) },
    });
    expect(lines.filter((line) => line.level >= 50)).toHaveLength(0);
  });
});
