import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CRAWLER_TEXT_MAX_BYTES } from '@endora-commerce/contracts';
import { SalesChannel } from '@endora-commerce/platform/kernel';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { systemDefaultSalesChannel } from '../../helpers/sales-channel-fixtures.js';

/**
 * Custom `robots.txt` instructions are per sales channel (Constitution XII;
 * `specs/144-seo-search-engine-robots/` FR-003, FR-005, FR-006, FR-020).
 *
 * The failure this file exists to refuse is one channel's instructions served
 * in another channel's `robots.txt`: a wholesale channel's `Disallow: /` taking
 * a retail shop out of every crawler's reach, with nothing on the retail
 * channel's own settings to explain it. So every case names more than one
 * channel and asserts on each of them.
 */
describe('custom robots.txt instructions — sales-channel scope', () => {
  let h: BackendServerHandle;
  let systemDefault: string;
  let everyChannel: string[];
  const admin = { b2b_session: 'stub-admin-session' };
  const A = 'pl_retail';
  const B = 'pl_b2b_vip';
  const SETTING = '/api/v1/admin/settings/seo.robots_txt_custom';
  const FOR_A = 'User-agent: GPTBot\nDisallow: /\n';
  const FOR_ALL = 'User-agent: *\nDisallow: /internal\n';

  beforeAll(async () => {
    h = await setupBackendServer();
    systemDefault = (await systemDefaultSalesChannel(h.em())).code;
    everyChannel = (await h.em().find(SalesChannel, {})).map((channel) => channel.code);
    // The cases below are only about isolation if the three channels are three.
    expect(new Set([A, B, systemDefault]).size).toBe(3);
    expect(everyChannel).toEqual(expect.arrayContaining([A, B, systemDefault]));
  });

  afterEach(async () => {
    for (const url of [
      `${SETTING}/values?salesChannelCodes=${everyChannel.join(',')}`,
      `${SETTING}/values`,
    ]) {
      const res = await h.app.inject({ method: 'DELETE', url, cookies: admin });
      expect(res.statusCode, res.body).toBe(200);
    }
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  const write = (channels: readonly string[] | 'all', value: string) =>
    h.app.inject({
      method: 'PUT',
      url: `${SETTING}/value`,
      cookies: admin,
      payload:
        channels === 'all'
          ? { scope: 'all', value }
          : { scope: 'subset', salesChannelCodes: channels, value },
    });

  const storeFor = async (channels: readonly string[] | 'all', value: string): Promise<void> => {
    const res = await write(channels, value);
    expect(res.statusCode, res.body).toBe(200);
  };

  const textFor = async (channel: string | null): Promise<string> => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/api/v1/storefront/seo/crawler-files',
      ...(channel !== null ? { headers: { 'x-sales-channel': channel } } : {}),
    });
    expect(res.statusCode, res.body).toBe(200);
    return (res.json() as { data: { robotsTxtCustom: string } }).data.robotsTxtCustom;
  };

  it('answers a channel its own text and never serves it for a neighbour or for no channel', async () => {
    await storeFor([A], FOR_A);

    expect(await textFor(A)).toBe(FOR_A);
    expect(await textFor(B)).toBe('');
    expect(await textFor(systemDefault)).toBe('');
    expect(await textFor(null)).toBe('');
  });

  it('answers the system-default channel when the request names none — not a concatenation', async () => {
    await storeFor([A], FOR_A);
    await storeFor([B], 'Disallow: /b-only\n');
    expect(await textFor(null)).toBe('');

    await storeFor([systemDefault], 'Disallow: /default-only\n');
    expect(await textFor(null)).toBe('Disallow: /default-only\n');
    expect(await textFor(A)).toBe(FOR_A);
    expect(await textFor(B)).toBe('Disallow: /b-only\n');
  });

  it('lets a channel inherit the all-channels text, override it, and inherit it again after a reset', async () => {
    await storeFor('all', FOR_ALL);
    expect(await textFor(A)).toBe(FOR_ALL);
    expect(await textFor(B)).toBe(FOR_ALL);

    await storeFor([A], FOR_A);
    expect(await textFor(A)).toBe(FOR_A);
    expect(await textFor(B)).toBe(FOR_ALL);

    const reset = await h.app.inject({
      method: 'DELETE',
      url: `${SETTING}/values?salesChannelCodes=${A}`,
      cookies: admin,
    });
    expect(reset.statusCode, reset.body).toBe(200);
    expect(await textFor(A)).toBe(FOR_ALL);
    expect(await textFor(B)).toBe(FOR_ALL);
  });

  it('lets a channel have no instructions while every other channel has some', async () => {
    // An empty text is a value like any other: it overrides the all-channels
    // text rather than falling through to it.
    await storeFor('all', FOR_ALL);
    await storeFor([A], '');
    expect(await textFor(A)).toBe('');
    expect(await textFor(B)).toBe(FOR_ALL);
  });

  it('removes the text entirely when everything is reset (FR-005)', async () => {
    await storeFor('all', FOR_ALL);
    await storeFor([A], FOR_A);
    for (const url of [`${SETTING}/values?salesChannelCodes=${A}`, `${SETTING}/values`]) {
      expect((await h.app.inject({ method: 'DELETE', url, cookies: admin })).statusCode).toBe(200);
    }
    expect(await textFor(A)).toBe('');
    expect(await textFor(null)).toBe('');
  });

  describe('the size limit (FR-006)', () => {
    const AT_LIMIT = 'a'.repeat(CRAWLER_TEXT_MAX_BYTES);
    const OVER_LIMIT = `${AT_LIMIT}a`;

    const expectRefused = (res: { statusCode: number; body: string }): void => {
      expect(res.statusCode, res.body.slice(0, 500)).toBe(400);
      const error = (JSON.parse(res.body) as {
        error: { code: string; message: string; details?: Record<string, unknown> };
      }).error;
      expect(error.code).toBe('SEO_CRAWLER_TEXT_TOO_LARGE');
      // The message names the limit, so the operator knows what to cut to.
      expect(error.message).toMatch(/65536/);
      expect(error.message).toMatch(/64 KiB/);
      expect(error.details).toMatchObject({ maxBytes: CRAWLER_TEXT_MAX_BYTES });
      // …and does not carry the text back.
      expect(res.body.length).toBeLessThan(2_000);
    };

    it('accepts exactly the limit', async () => {
      await storeFor([A], AT_LIMIT);
      expect(await textFor(A)).toBe(AT_LIMIT);
    });

    it('refuses one byte more for a channel, and the previous value stays', async () => {
      await storeFor([A], FOR_A);
      expectRefused(await write([A], OVER_LIMIT));
      expect(await textFor(A)).toBe(FOR_A);
      expect(await textFor(B)).toBe('');
    });

    it('refuses one byte more for all channels, and the previous value stays', async () => {
      await storeFor('all', FOR_ALL);
      expectRefused(await write('all', OVER_LIMIT));
      expect(await textFor(A)).toBe(FOR_ALL);
      expect(await textFor(null)).toBe(FOR_ALL);
    });

    it('measures bytes: a text under the limit in characters and over it in bytes is refused', async () => {
      const text = 'ż'.repeat(40_000);
      expect(text.length).toBeLessThan(CRAWLER_TEXT_MAX_BYTES);
      expectRefused(await write([A], text));
      expect(await textFor(A)).toBe('');
    });

    it('refuses an all-channels text over the limit even when every channel has a value of its own', async () => {
      // No channel would come to serve it today, which is exactly why it must
      // be refused now: the first channel reset afterwards would start serving
      // a text the limit exists to keep out.
      await storeFor(everyChannel, FOR_A);
      expectRefused(await write('all', OVER_LIMIT));

      const reset = await h.app.inject({
        method: 'DELETE',
        url: `${SETTING}/values?salesChannelCodes=${B}`,
        cookies: admin,
      });
      expect(reset.statusCode, reset.body).toBe(200);
      expect(await textFor(B)).toBe('');
      expect(await textFor(A)).toBe(FOR_A);
    });
  });
});
