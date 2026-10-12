import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import {
  CRAWLER_FILES_CAPABILITY_HEADER,
  CRAWLER_TEXT_MAX_BYTES,
  adminCrawlerFilePreviewSchema,
} from '@endora-commerce/contracts';
import {
  CrawlerFilePreviewService,
  PREVIEW_MAX_BYTES,
  PREVIEW_TIMEOUT_MS,
  UnknownSalesChannelError,
  crawlerFileTarget,
  isPreviewableCrawlerFile,
  type CrawlerFilePreviewStore,
  type CrawlerTextProvenance,
} from './crawler-file-preview.service.js';
import { StoredCrawlerTextTooLargeError } from './crawler-files.service.js';
import { UnknownRobotsTokenError } from './robots-policy.js';
import type { StorefrontAddress } from './storefront-address.service.js';

/**
 * The preview of a sales channel's `robots.txt`
 * (`specs/144-seo-search-engine-robots/contracts/admin-surfaces.md` §3).
 *
 * No socket is opened here: `fetch` is a stub, and what it was called with is
 * half of what is asserted — the request is the part of this feature that
 * reaches out of the instance, to an address an operator configured.
 */

const SYSTEM_RULES = 'User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://shop.example/sitemap.xml\n';

const CHANNELS: Record<string, { id: string; code: string }> = {
  pl: { id: '00000000-0000-4000-8000-0000000000a1', code: 'pl' },
  de: { id: '00000000-0000-4000-8000-0000000000a2', code: 'de' },
};

interface World {
  /** Stored values by setting code, then by channel id. */
  readonly values?: Record<string, Record<string, unknown>>;
  readonly provenance?: Record<string, CrawlerTextProvenance>;
  readonly address?: StorefrontAddress | Record<string, StorefrontAddress>;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
}

function plainText(
  body: string | ReadableStream<Uint8Array>,
  init: { status?: number; capable?: boolean; contentType?: string | null; headers?: Record<string, string> } = {},
): Response {
  const headers = new Headers(init.headers);
  if (init.contentType !== null) headers.set('content-type', init.contentType ?? 'text/plain; charset=utf-8');
  if (init.capable !== false) headers.set(CRAWLER_FILES_CAPABILITY_HEADER, '1');
  // A string body makes `Response` add a content type of its own; bytes do not.
  const payload = typeof body === 'string' && init.contentType === null ? new TextEncoder().encode(body) : body;
  return new Response(payload, { status: init.status ?? 200, headers });
}

function world(options: World = {}) {
  const fetchFn = vi.fn<typeof fetch>(options.fetch ?? (async () => plainText(SYSTEM_RULES)));
  const reads: Array<[string, string]> = [];
  const settings = {
    async get<T>(code: string, salesChannelId: string, schema: z.ZodType<T>): Promise<T> {
      reads.push([code, salesChannelId]);
      const byChannel = options.values?.[code] ?? {};
      const fallback = code === 'seo.default_robots' ? 'INDEX, FOLLOW' : '';
      return schema.parse(Object.hasOwn(byChannel, salesChannelId) ? byChannel[salesChannelId] : fallback);
    },
  };
  const store: CrawlerFilePreviewStore = {
    findChannel: async (code) => CHANNELS[code] ?? null,
    findDefaultChannel: async () => CHANNELS['de'] ?? null,
    provenance: async (_settingCode, salesChannelId) =>
      options.provenance?.[salesChannelId] ?? { source: 'default', channelsWithOwnValue: [] },
  };
  const resolved: string[] = [];
  const address = options.address ?? { url: 'https://shop.example', source: 'setting' as const };
  const storefrontAddress = {
    resolve: async (salesChannelId: string): Promise<StorefrontAddress> => {
      resolved.push(salesChannelId);
      return 'url' in address ? (address as StorefrontAddress) : address[salesChannelId]!;
    },
  };
  const service = new CrawlerFilePreviewService(settings, store, storefrontAddress, {
    fetchFn,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
  });
  return { service, fetchFn, reads, resolved };
}

/** The one request `fetch` was called with. */
function theRequest(fetchFn: ReturnType<typeof vi.fn<typeof fetch>>): { url: string; init: RequestInit } {
  expect(fetchFn).toHaveBeenCalledTimes(1);
  const [input, init] = fetchFn.mock.calls[0]!;
  return { url: String(input), init: init ?? {} };
}

describe('CrawlerFilePreviewService — the states', () => {
  it('ok: the storefront’s own part, as it answered it, beside the saved text', async () => {
    const { service } = world({
      values: { 'seo.robots_txt_custom': { [CHANNELS.pl!.id]: 'User-agent: GPTBot\nDisallow: /\n' } },
      provenance: { [CHANNELS.pl!.id]: { source: 'channel', channelsWithOwnValue: ['pl'] } },
    });
    const { preview, reason } = await service.preview('robots', 'pl');
    expect(preview).toEqual({
      file: 'robots',
      salesChannelCode: 'pl',
      state: 'ok',
      base: SYSTEM_RULES,
      savedExtra: 'User-agent: GPTBot\nDisallow: /\n',
      savedExtraSource: 'channel',
      channelsWithOwnValue: ['pl'],
      policy: { index: true, follow: true },
      storefront: { url: 'https://shop.example', source: 'setting' },
    });
    expect(reason).toBe('ok');
    expect(adminCrawlerFilePreviewSchema.safeParse(preview).success).toBe(true);
  });

  it('storefront-outdated: a 2xx without the capability header, with the rules it does serve', async () => {
    const { service } = world({ fetch: async () => plainText(SYSTEM_RULES, { capable: false }) });
    const { preview } = await service.preview('robots', 'pl');
    expect(preview.state).toBe('storefront-outdated');
    expect(preview.base).toBe(SYSTEM_RULES);
    expect(adminCrawlerFilePreviewSchema.safeParse(preview).success).toBe(true);
  });

  it.each([
    ['a refused connection', async () => Promise.reject(new TypeError('fetch failed'))],
    ['a 500', async () => plainText('boom', { status: 500 })],
    ['a 404', async () => plainText('not found', { status: 404 })],
    ['a 503 that carries the capability header', async () => plainText('', { status: 503 })],
    ['an answer that is a web page', async () => plainText('<html>', { contentType: 'text/html' })],
    ['an answer with no content type', async () => plainText(SYSTEM_RULES, { contentType: null })],
    ['a content type that merely starts like text/plain', async () => plainText('x', { contentType: 'text/plainly' })],
    [
      'a redirect to another host',
      async () => plainText('', { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }),
    ],
    [
      'a redirect on the same host',
      async () => plainText('', { status: 301, headers: { location: 'https://shop.example/robots.txt' } }),
    ],
    ['a 304', async () => plainText('', { status: 304 })],
  ] as Array<[string, typeof fetch]>)(
    'storefront-unreachable: %s — and no part of the answer travels',
    async (_label, fetchImpl) => {
      const { service, fetchFn } = world({ fetch: fetchImpl });
      const { preview, reason } = await service.preview('robots', 'pl');
      expect(preview.state).toBe('storefront-unreachable');
      expect(preview.base).toBeNull();
      expect(reason).not.toBe('ok');
      // Asked once: nothing was followed and nothing retried.
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(adminCrawlerFilePreviewSchema.safeParse(preview).success).toBe(true);
    },
  );

  it('storefront-unreachable: no answer within the timeout, and the request is aborted', async () => {
    let signal: AbortSignal | undefined;
    const { service } = world({
      timeoutMs: 20,
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal ?? undefined;
          signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    });
    const { preview, reason } = await service.preview('robots', 'pl');
    expect(preview.state).toBe('storefront-unreachable');
    expect(signal?.aborted).toBe(true);
    expect(reason).toContain('20 ms');
  });

  it('storefront-unreachable: headers at once and a body that never finishes', async () => {
    const encoder = new TextEncoder();
    let cancelled = false;
    const { service } = world({
      timeoutMs: 30,
      fetch: async (_input, init) =>
        plainText(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encoder.encode('User-agent: *\n'));
              init?.signal?.addEventListener('abort', () =>
                controller.error(new DOMException('aborted', 'AbortError')),
              );
            },
            cancel() {
              cancelled = true;
            },
          }),
        ),
    });
    const { preview } = await service.preview('robots', 'pl');
    expect(preview.state).toBe('storefront-unreachable');
    expect(preview.base).toBeNull();
    expect(cancelled).toBe(false); // errored by the abort, not left open
  });

  it('storefront-unreachable: a body over the cap — counted as it is read, not from Content-Length', async () => {
    const chunk = new Uint8Array(64 * 1024).fill(0x61);
    let pulled = 0;
    let cancelled = false;
    const { service } = world({
      fetch: async () =>
        plainText(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              pulled += 1;
              controller.enqueue(chunk);
            },
            cancel() {
              cancelled = true;
            },
          }),
          // A lie: the cap must not believe it.
          { headers: { 'content-length': '10' } },
        ),
    });
    const { preview } = await service.preview('robots', 'pl');
    expect(preview.state).toBe('storefront-unreachable');
    expect(preview.base).toBeNull();
    expect(cancelled).toBe(true);
    // 512 KiB is eight chunks; the ninth passes the cap and the read stops there.
    expect(pulled).toBeLessThanOrEqual(PREVIEW_MAX_BYTES / chunk.byteLength + 2);
  });

  it('accepts a body of exactly the cap', async () => {
    const { service } = world({ maxBytes: 8, fetch: async () => plainText('12345678') });
    expect((await service.preview('robots', 'pl')).preview.base).toBe('12345678');
    const over = world({ maxBytes: 8, fetch: async () => plainText('123456789') });
    expect((await over.service.preview('robots', 'pl')).preview.state).toBe('storefront-unreachable');
  });

  it('address-unknown: the address is a fallback, and no request is made', async () => {
    const { service, fetchFn } = world({ address: { url: 'http://localhost:3000', source: 'fallback' } });
    const { preview } = await service.preview('robots', 'pl');
    expect(preview.state).toBe('address-unknown');
    expect(preview.base).toBeNull();
    expect(preview.storefront).toEqual({ url: 'http://localhost:3000', source: 'fallback' });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(adminCrawlerFilePreviewSchema.safeParse(preview).success).toBe(true);
  });

  it('says when the address is the one every channel shares', async () => {
    const { service } = world({ address: { url: 'https://env.example', source: 'env' } });
    const { preview } = await service.preview('robots', 'pl');
    expect(preview.state).toBe('ok');
    expect(preview.storefront).toEqual({ url: 'https://env.example', source: 'env' });
  });

  it('holds the bounds the contract names', () => {
    expect(PREVIEW_TIMEOUT_MS).toBe(3_000);
    expect(PREVIEW_MAX_BYTES).toBe(512 * 1024);
  });
});

describe('CrawlerFilePreviewService — the request it makes', () => {
  it('is a GET to exactly <origin>/robots.txt?part=system, naming the channel', async () => {
    const { service, fetchFn } = world();
    await service.preview('robots', 'pl');
    const { url, init } = theRequest(fetchFn);
    expect(url).toBe('https://shop.example/robots.txt?part=system');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    const headers = new Headers(init.headers);
    expect(headers.get('x-sales-channel')).toBe('pl');
    expect(headers.get('accept')).toBe('text/plain');
  });

  it('follows no redirect, sends no credentials and carries nothing that authenticates', async () => {
    const { service, fetchFn } = world();
    await service.preview('robots', 'pl');
    const { init } = theRequest(fetchFn);
    expect(init.redirect).toBe('manual');
    expect(init.credentials).toBe('omit');
    const names = [...new Headers(init.headers).keys()].sort();
    expect(names).toEqual(['accept', 'user-agent', 'x-sales-channel']);
  });

  it.each([
    ['a trailing slash', 'https://shop.example/', 'https://shop.example/robots.txt?part=system'],
    ['a port', 'http://storefront:3000', 'http://storefront:3000/robots.txt?part=system'],
    ['a path', 'https://shop.example/pl/store', 'https://shop.example/robots.txt?part=system'],
    [
      'a path ending in a query, which would turn the fixed path into a query',
      'http://169.254.169.254/latest/meta-data/?',
      'http://169.254.169.254/robots.txt?part=system',
    ],
    ['a query of its own', 'https://shop.example/?part=all&x=1', 'https://shop.example/robots.txt?part=system'],
    ['a fragment', 'https://shop.example/#/admin', 'https://shop.example/robots.txt?part=system'],
    ['dot segments', 'https://shop.example/a/../../etc/', 'https://shop.example/robots.txt?part=system'],
    ['surrounding whitespace', '  https://shop.example  ', 'https://shop.example/robots.txt?part=system'],
  ])('asks the origin only when the configured address carries %s', async (_label, configured, expected) => {
    const { service, fetchFn } = world({ address: { url: configured, source: 'setting' } });
    await service.preview('robots', 'pl');
    expect(theRequest(fetchFn).url).toBe(expected);
  });

  it.each([
    ['is not a URL', 'shop.example'],
    ['is empty', ''],
    ['is a file address', 'file:///etc/passwd'],
    ['is an ftp address', 'ftp://shop.example'],
    ['is a javascript address', 'javascript:alert(1)'],
    ['is a data address', 'data:text/plain,hi'],
    ['is a gopher address', 'gopher://127.0.0.1:6379/_INFO'],
    ['carries credentials', 'https://user:secret@shop.example'],
    ['carries a user name only', 'https://user@shop.example'],
  ])('makes no request when the configured address %s', async (_label, configured) => {
    const { service, fetchFn } = world({ address: { url: configured, source: 'setting' } });
    const { preview } = await service.preview('robots', 'pl');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(preview.state).toBe('storefront-unreachable');
    expect(preview.base).toBeNull();
    expect(crawlerFileTarget(configured, '/robots.txt?part=system')).toBeNull();
  });

  it('sends the code of the channel that was found, never the caller’s spelling of it', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => plainText(SYSTEM_RULES));
    const service = new CrawlerFilePreviewService(
      { get: async (_code, _id, schema) => schema.parse(_code === 'seo.default_robots' ? 'INDEX, FOLLOW' : '') },
      {
        // A store that finds a row for whatever it is asked.
        findChannel: async () => ({ id: CHANNELS.pl!.id, code: 'pl' }),
        findDefaultChannel: async () => null,
        provenance: async () => ({ source: 'default', channelsWithOwnValue: [] }),
      },
      { resolve: async () => ({ url: 'https://shop.example', source: 'setting' }) },
      { fetchFn },
    );
    await service.preview('robots', 'PL\r\nHost: evil');
    expect(new Headers(theRequest(fetchFn).init.headers).get('x-sales-channel')).toBe('pl');
  });

  it('refuses a channel that does not exist, before anything is read or asked', async () => {
    const { service, fetchFn, reads, resolved } = world();
    await expect(service.preview('robots', 'nope')).rejects.toBeInstanceOf(UnknownSalesChannelError);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(reads).toEqual([]);
    expect(resolved).toEqual([]);
  });

  it('with no channel named, asks about the system default channel and says which it is', async () => {
    const { service, fetchFn, reads } = world({
      values: { 'seo.robots_txt_custom': { [CHANNELS.de!.id]: 'Disallow: /de-only/\n' } },
    });
    const { preview } = await service.preview('robots', undefined);
    expect(preview.salesChannelCode).toBe('de');
    expect(preview.savedExtra).toBe('Disallow: /de-only/\n');
    expect(new Headers(theRequest(fetchFn).init.headers).get('x-sales-channel')).toBe('de');
    expect(new Set(reads.map(([, channelId]) => channelId))).toEqual(new Set([CHANNELS.de!.id]));
  });

  it('shares one request between previews of one channel asked for at the same moment', async () => {
    let release: ((response: Response) => void) | null = null;
    const { service, fetchFn } = world({
      // The first request waits to be released; any later one answers at once.
      fetch: () =>
        release === null
          ? new Promise<Response>((resolve) => (release = resolve))
          : Promise.resolve(plainText(SYSTEM_RULES)),
    });
    const first = service.preview('robots', 'pl');
    const second = service.preview('robots', 'pl');
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    release!(plainText(SYSTEM_RULES));
    expect((await first).preview.base).toBe(SYSTEM_RULES);
    expect((await second).preview.base).toBe(SYSTEM_RULES);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    // Not a cache: once it has answered, the next preview asks again.
    await service.preview('robots', 'pl');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('does not share a request between two channels', async () => {
    const { service, fetchFn } = world();
    await Promise.all([service.preview('robots', 'pl'), service.preview('robots', 'de')]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const channels = fetchFn.mock.calls.map(([, init]) => new Headers(init?.headers).get('x-sales-channel'));
    expect(channels.sort()).toEqual(['de', 'pl']);
  });
});

describe('CrawlerFilePreviewService — the operator’s part', () => {
  const OWN = 'User-agent: GPTBot\nDisallow: /\n';
  const SHARED = 'User-agent: *\nDisallow: /tmp/\n';

  it('a channel with its own value: that text, source "channel"', async () => {
    const { service } = world({
      values: { 'seo.robots_txt_custom': { [CHANNELS.pl!.id]: OWN, [CHANNELS.de!.id]: SHARED } },
      provenance: {
        [CHANNELS.pl!.id]: { source: 'channel', channelsWithOwnValue: ['pl'] },
        [CHANNELS.de!.id]: { source: 'global', channelsWithOwnValue: ['pl'] },
      },
    });
    const { preview } = await service.preview('robots', 'pl');
    expect(preview.savedExtra).toBe(OWN);
    expect(preview.savedExtraSource).toBe('channel');
    expect(preview.channelsWithOwnValue).toEqual(['pl']);
  });

  it('a channel that inherits: the all-channels text, source "global", and who has their own', async () => {
    const { service } = world({
      values: { 'seo.robots_txt_custom': { [CHANNELS.pl!.id]: OWN, [CHANNELS.de!.id]: SHARED } },
      provenance: {
        [CHANNELS.pl!.id]: { source: 'channel', channelsWithOwnValue: ['pl'] },
        [CHANNELS.de!.id]: { source: 'global', channelsWithOwnValue: ['pl'] },
      },
    });
    const { preview } = await service.preview('robots', 'de');
    expect(preview.savedExtra).toBe(SHARED);
    expect(preview.savedExtraSource).toBe('global');
    expect(preview.channelsWithOwnValue).toEqual(['pl']);
  });

  it('nothing saved anywhere: empty text, source "default"', async () => {
    const { service } = world();
    const { preview } = await service.preview('robots', 'pl');
    expect(preview.savedExtra).toBe('');
    expect(preview.savedExtraSource).toBe('default');
    expect(preview.channelsWithOwnValue).toEqual([]);
  });

  it('leaves the stored text exactly as stored — CRLF, blank lines, trailing spaces', async () => {
    const stored = '﻿  User-agent: X  \r\n\r\nDisallow: /a\r\n\n\n';
    const { service } = world({ values: { 'seo.robots_txt_custom': { [CHANNELS.pl!.id]: stored } } });
    expect((await service.preview('robots', 'pl')).preview.savedExtra).toBe(stored);
  });

  it('reads every value for the channel asked about and for no other', async () => {
    const { service, reads, resolved } = world();
    await service.preview('robots', 'de');
    expect(reads.length).toBeGreaterThan(0);
    expect(new Set(reads.map(([, channelId]) => channelId))).toEqual(new Set([CHANNELS.de!.id]));
    expect(resolved).toEqual([CHANNELS.de!.id]);
  });

  it('reports the channel’s saved default robots as two booleans', async () => {
    const { service } = world({
      values: { 'seo.default_robots': { [CHANNELS.pl!.id]: 'NOINDEX, NOFOLLOW' } },
    });
    expect((await service.preview('robots', 'pl')).preview.policy).toEqual({ index: false, follow: false });
    expect((await service.preview('robots', 'de')).preview.policy).toEqual({ index: true, follow: true });
  });

  it('throws, as the storefront’s read does, for a stored value it cannot stand behind', async () => {
    const badToken = world({ values: { 'seo.default_robots': { [CHANNELS.pl!.id]: 'NEVER' } } });
    await expect(badToken.service.preview('robots', 'pl')).rejects.toBeInstanceOf(UnknownRobotsTokenError);
    expect(badToken.fetchFn).not.toHaveBeenCalled();

    const tooLarge = world({
      values: { 'seo.robots_txt_custom': { [CHANNELS.pl!.id]: 'x'.repeat(CRAWLER_TEXT_MAX_BYTES + 1) } },
    });
    await expect(tooLarge.service.preview('robots', 'pl')).rejects.toBeInstanceOf(
      StoredCrawlerTextTooLargeError,
    );
    expect(tooLarge.fetchFn).not.toHaveBeenCalled();
  });
});

describe('isPreviewableCrawlerFile', () => {
  it('knows robots, and not yet llms', () => {
    expect(isPreviewableCrawlerFile('robots')).toBe(true);
    expect(isPreviewableCrawlerFile('llms')).toBe(false);
  });
});

/**
 * The two bounds that are otherwise asserted on what a stubbed `fetch` was
 * handed, proved here against real sockets: the platform's own `fetch`, two
 * `node:http` servers on loopback ports the system picks.
 */
describe('CrawlerFilePreviewService — against a real server', () => {
  interface Seen {
    readonly url: string;
    readonly headers: IncomingHttpHeaders;
  }
  const servers: Server[] = [];

  async function listen(
    handler: (request: IncomingMessage, response: ServerResponse, seen: Seen[]) => void,
  ): Promise<{ origin: string; seen: Seen[] }> {
    const seen: Seen[] = [];
    const server = createServer((request, response) => {
      seen.push({ url: request.url ?? '', headers: request.headers });
      handler(request, response, seen);
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
  }

  function serviceAt(origin: string): CrawlerFilePreviewService {
    return new CrawlerFilePreviewService(
      { get: async (code, _id, schema) => schema.parse(code === 'seo.default_robots' ? 'INDEX, FOLLOW' : '') },
      {
        findChannel: async (code) => CHANNELS[code] ?? null,
        findDefaultChannel: async () => null,
        provenance: async () => ({ source: 'default', channelsWithOwnValue: [] }),
      },
      { resolve: async () => ({ url: origin, source: 'setting' }) },
    );
  }

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map((server) => new Promise((resolve) => server.close(() => resolve(undefined)))),
    );
  });

  it('does not follow a redirect: the server it points at is never asked', async () => {
    const elsewhere = await listen((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain', [CRAWLER_FILES_CAPABILITY_HEADER]: '1' });
      response.end('User-agent: *\nDisallow: /from-elsewhere/\n');
    });
    const storefront = await listen((_request, response) => {
      response.writeHead(302, { location: `${elsewhere.origin}/robots.txt?part=system` });
      response.end();
    });
    const { preview } = await serviceAt(storefront.origin).preview('robots', 'pl');
    expect(preview.state).toBe('storefront-unreachable');
    expect(preview.base).toBeNull();
    expect(storefront.seen.map((request) => request.url)).toEqual(['/robots.txt?part=system']);
    expect(elsewhere.seen).toEqual([]);
  });

  it('does not follow a redirect to a path on the same server either', async () => {
    const storefront = await listen((request, response) => {
      if (request.url === '/robots.txt?part=system') {
        response.writeHead(301, { location: '/elsewhere.txt' });
        response.end();
        return;
      }
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('secret');
    });
    const { preview } = await serviceAt(storefront.origin).preview('robots', 'pl');
    expect(preview.state).toBe('storefront-unreachable');
    expect(storefront.seen.map((request) => request.url)).toEqual(['/robots.txt?part=system']);
  });

  it('arrives with no cookie and nothing that authenticates, and reads the answer', async () => {
    const storefront = await listen((_request, response) => {
      response.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        [CRAWLER_FILES_CAPABILITY_HEADER]: '1',
        // A storefront that tries to set a cookie on the backend.
        'set-cookie': 'session=planted; Path=/',
      });
      response.end(SYSTEM_RULES);
    });
    const service = serviceAt(storefront.origin);
    const first = await service.preview('robots', 'pl');
    expect(first.preview.state).toBe('ok');
    expect(first.preview.base).toBe(SYSTEM_RULES);
    // A second request: a cookie the first answer set must not come back.
    await service.preview('robots', 'pl');
    expect(storefront.seen).toHaveLength(2);
    for (const request of storefront.seen) {
      expect(request.url).toBe('/robots.txt?part=system');
      expect(request.headers.cookie).toBeUndefined();
      expect(request.headers.authorization).toBeUndefined();
      expect(request.headers['proxy-authorization']).toBeUndefined();
      expect(request.headers['x-sales-channel']).toBe('pl');
    }
  });

  it('gives up on a server that accepts the connection and never answers', async () => {
    const storefront = await listen(() => {
      /* never answers */
    });
    const service = new CrawlerFilePreviewService(
      { get: async (code, _id, schema) => schema.parse(code === 'seo.default_robots' ? 'INDEX, FOLLOW' : '') },
      {
        findChannel: async (code) => CHANNELS[code] ?? null,
        findDefaultChannel: async () => null,
        provenance: async () => ({ source: 'default', channelsWithOwnValue: [] }),
      },
      { resolve: async () => ({ url: storefront.origin, source: 'setting' }) },
      { timeoutMs: 150 },
    );
    const started = Date.now();
    const { preview } = await service.preview('robots', 'pl');
    expect(preview.state).toBe('storefront-unreachable');
    expect(Date.now() - started).toBeLessThan(2_000);
    // Release the hanging socket so the server can close.
    for (const server of servers) server.closeAllConnections();
  });
});
