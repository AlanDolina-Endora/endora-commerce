import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  CRAWLER_TEXT_MAX_BYTES,
  storefrontCrawlerFilesResponseSchema,
} from '@endora-commerce/contracts';
import { SalesChannel, Setting, SettingValue } from '@endora-commerce/platform/kernel';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';

/**
 * `GET /api/v1/storefront/seo/crawler-files`
 * (`specs/144-seo-search-engine-robots/contracts/crawler-policy.md` §2).
 *
 * What the storefront builds a sales channel's `robots.txt` from. Three things
 * are held, and they are the three the storefront depends on:
 *
 *  * the body is the contract schema, and the operator's text in it is **what
 *    was stored, character for character** — the backend rewrites no line
 *    break and trims nothing; what a served file does with the text is the
 *    storefront's, in one function both sides share;
 *  * no shared cache may keep the answer — the storefront is the cache;
 *  * it needs no session.
 *
 * And one thing it must never do: answer `200` with a text it could not read.
 * An empty text at `200` is definitive — the storefront would serve the file
 * without the operator's instructions and call it current — so a stored value
 * this module cannot stand behind is a `500`, which a storefront reads as
 * "could not ask" and answers with what it last knew, or with a temporary
 * failure.
 */
describe('GET /api/v1/storefront/seo/crawler-files', () => {
  let h: BackendServerHandle;
  const admin = { b2b_session: 'stub-admin-session' };
  const URL = '/api/v1/storefront/seo/crawler-files';
  const CODES = ['seo.robots_txt_custom', 'seo.default_robots', 'shop.name'];

  beforeAll(async () => {
    h = await setupBackendServer();
  });

  afterEach(async () => {
    for (const code of CODES) {
      await h.app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/settings/${code}/values`,
        cookies: admin,
      });
    }
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  const store = async (code: string, value: string): Promise<void> => {
    const res = await h.app.inject({
      method: 'PUT',
      url: `/api/v1/admin/settings/${code}/value`,
      cookies: admin,
      payload: { scope: 'all', value },
    });
    expect(res.statusCode, `storing ${code} must be accepted: ${res.body}`).toBe(200);
  };

  it('answers no custom text and no restriction on an instance nobody configured', async () => {
    const res = await h.app.inject({ method: 'GET', url: URL });
    expect(res.statusCode).toBe(200);
    const body = storefrontCrawlerFilesResponseSchema.parse(res.json());
    expect(body.data).toMatchObject({
      index: true,
      follow: true,
      robotsTxtCustom: '',
      llmsTxtAdditional: '',
    });
    expect(typeof body.data.shop.name).toBe('string');
  });

  it('answers the schema, and sends exactly the members it names', async () => {
    await store('seo.robots_txt_custom', 'User-agent: GPTBot\nDisallow: /\n');
    await store('seo.default_robots', 'NOINDEX, FOLLOW');
    await store('shop.name', 'Endora Demo');

    const res = await h.app.inject({ method: 'GET', url: URL });
    expect(res.statusCode).toBe(200);
    expect(storefrontCrawlerFilesResponseSchema.parse(res.json())).toEqual({
      data: {
        index: false,
        follow: true,
        robotsTxtCustom: 'User-agent: GPTBot\nDisallow: /\n',
        llmsTxtAdditional: '',
        shop: { name: 'Endora Demo' },
      },
    });
    // The schema drops what it does not know, so it cannot see an extra member.
    const raw = res.json() as { data: Record<string, unknown> & { shop: Record<string, unknown> } };
    expect(Object.keys(raw)).toEqual(['data']);
    expect(Object.keys(raw.data).sort()).toEqual([
      'follow',
      'index',
      'llmsTxtAdditional',
      'robotsTxtCustom',
      'shop',
    ]);
    expect(Object.keys(raw.data.shop)).toEqual(['name']);
    // The stored spelling of the robots choice stays the module's own.
    expect(res.body).not.toContain('NOINDEX');
  });

  it.each([
    ['line feeds', 'User-agent: a\nDisallow: /x\n\nUser-agent: b\nDisallow: /y\n'],
    ['CRLF, as an API client may send it', 'User-agent: a\r\nDisallow: /x\r\n\r\nUser-agent: b\r\n'],
    ['leading and trailing whitespace', '\n\n  \t# indented comment   \n\n\n'],
    ['text outside ASCII', '# Zażółć gęślą jaźń 🤖\nDisallow: /zażółć\n'],
    ['what would be markup or a header anywhere else', '<script>alert(1)</script>\r\nSet-Cookie: a=b\r\n\r\n{"json":true}'],
  ])('returns the text exactly as stored: %s', async (_label, text) => {
    await store('seo.robots_txt_custom', text);
    const res = await h.app.inject({ method: 'GET', url: URL });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: { robotsTxtCustom: string } }).data.robotsTxtCustom).toBe(text);
    // It travels as a JSON string and as nothing else.
    expect(String(res.headers['content-type'])).toContain('application/json');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('forbids any cache from keeping the answer', async () => {
    const res = await h.app.inject({ method: 'GET', url: URL });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('needs no session, and answers the same with one', async () => {
    await store('seo.robots_txt_custom', 'Disallow: /private');
    const anonymous = await h.app.inject({ method: 'GET', url: URL });
    const signedIn = await h.app.inject({ method: 'GET', url: URL, cookies: admin });
    expect(anonymous.statusCode).toBe(200);
    expect(signedIn.statusCode).toBe(200);
    expect(anonymous.json()).toEqual(signedIn.json());
  });

  /**
   * Rows written around the settings API, which refuses both: straight into a
   * channel's own row. Each case uses a channel nothing in this file has read
   * before it — a write around the API drops no cache, so a channel already
   * read would answer from before the row existed.
   */
  describe('a stored value this module cannot stand behind', () => {
    const plant = async (code: string, channel: string, value: string): Promise<void> => {
      const em = h.em();
      const setting = await em.findOneOrFail(Setting, { code });
      const salesChannel = await em.findOneOrFail(SalesChannel, { code: channel });
      em.create(SettingValue, { setting, salesChannel, value });
      await em.flush();
    };
    // Through the API, so the settings cache is dropped with the row.
    const unplant = async (code: string, channel: string): Promise<void> => {
      const reset = await h.app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/settings/${code}/values?salesChannelCodes=${channel}`,
        cookies: admin,
      });
      expect(reset.statusCode, reset.body).toBe(200);
    };

    it('answers 500, not a truncated or empty text, for a stored text over the limit', async () => {
      const CHANNEL = 'pl_retail';
      await plant('seo.robots_txt_custom', CHANNEL, 'a'.repeat(CRAWLER_TEXT_MAX_BYTES + 1));
      try {
        const res = await h.app.inject({
          method: 'GET',
          url: URL,
          headers: { 'x-sales-channel': CHANNEL },
        });
        expect(res.statusCode).toBe(500);
        expect(res.body).not.toContain('robotsTxtCustom');
        expect(res.body.length).toBeLessThan(2_000);
        // The neighbours are untouched: the failure is that channel's.
        expect((await h.app.inject({ method: 'GET', url: URL })).statusCode).toBe(200);
      } finally {
        await unplant('seo.robots_txt_custom', CHANNEL);
      }
    });

    it('answers 500, not "no restriction", for a stored robots value outside the four choices', async () => {
      const CHANNEL = 'pl_b2b_vip';
      await plant('seo.default_robots', CHANNEL, 'NOINDEX');
      try {
        const res = await h.app.inject({
          method: 'GET',
          url: URL,
          headers: { 'x-sales-channel': CHANNEL },
        });
        expect(res.statusCode).toBe(500);
        expect(res.body).not.toContain('"index"');
        expect((await h.app.inject({ method: 'GET', url: URL })).statusCode).toBe(200);
      } finally {
        await unplant('seo.default_robots', CHANNEL);
      }
    });
  });
});
