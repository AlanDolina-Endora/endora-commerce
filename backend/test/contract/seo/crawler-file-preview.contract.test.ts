import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CRAWLER_FILES_CAPABILITY_HEADER,
  adminCrawlerFilePreviewResponseSchema,
  type AdminCrawlerFilePreview,
} from '@endora-commerce/contracts';
import { hashPassword } from '@endora-commerce/platform/kernel';
import { AdminUser } from '../../helpers/package-entities.js';
import { STUB_CUSTOMER_PASSWORD } from '../../helpers/seed-organizations.js';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';

/**
 * `GET /api/v1/admin/seo/crawler-files/preview`
 * (`specs/144-seo-search-engine-robots/contracts/admin-surfaces.md` §3).
 *
 * The endpoint makes the backend ask a sales channel's storefront for the
 * rules it generates. So beside the usual four — who may call it, what it
 * refuses, what it answers, that one channel never sees another's text — this
 * file holds what the request to the storefront is made of: it is asserted on
 * what `fetch` was called with, and `fetch` is a stub, so nothing here opens a
 * socket to anywhere.
 */

const SYSTEM_RULES = 'User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://shop.example/sitemap.xml\n';
const PREVIEW = '/api/v1/admin/seo/crawler-files/preview';
const RETAIL = 'pl_retail';
const VIP = 'pl_b2b_vip';
/** Seeded with `settings:read` and nothing else, below. */
const SETTINGS_VIEWER_ID = '00000000-0000-4000-8000-0000000000d1';

describe('GET /api/v1/admin/seo/crawler-files/preview', () => {
  let h: BackendServerHandle;
  const admin = { b2b_session: 'stub-admin-session' };
  /** Holds `blog.*` and nothing of settings. */
  const withoutSettingsRead = { b2b_session: 'stub-blog-manager-session' };
  const settingsReader = { b2b_session: 'stub-settings-viewer-session' };

  const fetchSpy = vi.fn<typeof fetch>();

  const storefrontAnswers = (
    body: string = SYSTEM_RULES,
    init: { status?: number; capable?: boolean; headers?: Record<string, string> } = {},
  ): void => {
    fetchSpy.mockImplementation(async () => {
      const headers = new Headers({ 'content-type': 'text/plain; charset=utf-8', ...init.headers });
      if (init.capable !== false) headers.set(CRAWLER_FILES_CAPABILITY_HEADER, '1');
      return new Response(body, { status: init.status ?? 200, headers });
    });
  };

  const put = async (
    code: string,
    payload: Record<string, unknown>,
  ): Promise<void> => {
    const res = await h.app.inject({
      method: 'PUT',
      url: `/api/v1/admin/settings/${code}/value`,
      cookies: admin,
      payload,
    });
    expect(res.statusCode, `storing ${code} must be accepted: ${res.body}`).toBe(200);
  };
  const forChannel = (code: string, channel: string, value: string): Promise<void> =>
    put(code, { scope: 'subset', salesChannelCodes: [channel], value });
  const forAll = (code: string, value: string): Promise<void> => put(code, { scope: 'all', value });

  const preview = async (
    query: string,
    options: { cookies?: Record<string, string>; headers?: Record<string, string> } = {},
  ) =>
    h.app.inject({
      method: 'GET',
      url: `${PREVIEW}${query}`,
      cookies: options.cookies ?? admin,
      ...(options.headers === undefined ? {} : { headers: options.headers }),
    });

  const previewOf = async (channel: string): Promise<AdminCrawlerFilePreview> => {
    const res = await preview(`?file=robots&salesChannelCode=${channel}`);
    expect(res.statusCode, res.body).toBe(200);
    return adminCrawlerFilePreviewResponseSchema.parse(res.json()).data;
  };

  beforeAll(async () => {
    h = await setupBackendServer();
    const role = await h.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/admin-roles/settings_viewer',
      cookies: admin,
      payload: { code: 'settings_viewer', name: 'Settings viewer', permissions: ['settings:read'] },
    });
    expect(role.statusCode, role.body).toBe(200);
    const em = h.em();
    if ((await em.findOne(AdminUser, { id: SETTINGS_VIEWER_ID })) === null) {
      em.create(AdminUser, {
        id: SETTINGS_VIEWER_ID,
        email: 'settings-viewer@example.com',
        passwordHash: await hashPassword(STUB_CUSTOMER_PASSWORD),
        firstName: 'Settings',
        lastName: 'Viewer',
        adminRoleId: (role.json() as { data: { id: string } }).data.id,
        status: 'active',
      });
      await em.flush();
    }
  });

  beforeEach(async () => {
    fetchSpy.mockReset();
    storefrontAnswers();
    vi.stubGlobal('fetch', fetchSpy);
    // The harness loads `backend/.env`, whose `STOREFRONT_BASE_URL` would make
    // every channel's address the `env` rung. Emptied, a channel has the
    // address this file gives it and no other.
    vi.stubEnv('STOREFRONT_BASE_URL', '');
    await forChannel('sales_channels.storefront_url', RETAIL, 'https://retail.example');
    await forChannel('sales_channels.storefront_url', VIP, 'https://vip.example/');
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    for (const code of [
      'seo.robots_txt_custom',
      'seo.llms_txt_additional',
      'seo.default_robots',
      'sales_channels.storefront_url',
    ]) {
      await h.app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/settings/${code}/values`,
        cookies: admin,
      });
      await h.app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/settings/${code}/values?salesChannelCodes=${RETAIL},${VIP}`,
        cookies: admin,
      });
    }
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  describe('who may ask', () => {
    it('401 without a session, and the storefront is not asked', async () => {
      const res = await h.app.inject({
        method: 'GET',
        url: `${PREVIEW}?file=robots&salesChannelCode=${RETAIL}`,
      });
      expect(res.statusCode).toBe(401);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('403 without settings:read, and the storefront is not asked', async () => {
      const res = await preview(`?file=robots&salesChannelCode=${RETAIL}`, {
        cookies: withoutSettingsRead,
      });
      expect(res.statusCode).toBe(403);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('refuses on permission before it says anything about the query', async () => {
      const res = await preview('?file=sitemap', { cookies: withoutSettingsRead });
      expect(res.statusCode).toBe(403);
    });

    it('answers an administrator who may read settings and change nothing (FR-045)', async () => {
      const res = await preview(`?file=robots&salesChannelCode=${RETAIL}`, {
        cookies: settingsReader,
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(adminCrawlerFilePreviewResponseSchema.parse(res.json()).data.state).toBe('ok');
      // The control: that administrator really cannot write the setting.
      const write = await h.app.inject({
        method: 'PUT',
        url: '/api/v1/admin/settings/seo.robots_txt_custom/value',
        cookies: settingsReader,
        payload: { scope: 'all', value: 'Disallow: /' },
      });
      expect(write.statusCode).toBe(403);
    });
  });

  describe('with no sales channel named', () => {
    it('answers for the system default channel, and says which channel that is', async () => {
      await forChannel('sales_channels.storefront_url', 'default', 'https://default.example');
      await forChannel('seo.robots_txt_custom', 'default', 'Disallow: /default-only/\n');
      await forChannel('seo.robots_txt_custom', RETAIL, 'Disallow: /retail-only/\n');
      try {
        const res = await preview('?file=robots');
        expect(res.statusCode, res.body).toBe(200);
        const data = adminCrawlerFilePreviewResponseSchema.parse(res.json()).data;
        expect(data.salesChannelCode).toBe('default');
        expect(data.savedExtra).toBe('Disallow: /default-only/\n');
        expect(res.body).not.toContain('retail-only');
        const [input, init] = fetchSpy.mock.calls[0]!;
        expect(String(input)).toBe('https://default.example/robots.txt?part=system');
        expect(new Headers(init?.headers).get('x-sales-channel')).toBe('default');
      } finally {
        await h.app.inject({
          method: 'DELETE',
          url: '/api/v1/admin/settings/seo.robots_txt_custom/values?salesChannelCodes=default',
          cookies: admin,
        });
        await h.app.inject({
          method: 'DELETE',
          url: '/api/v1/admin/settings/sales_channels.storefront_url/values?salesChannelCodes=default',
          cookies: admin,
        });
      }
    });

    it('is what lets an administrator who may not list sales channels see a preview (FR-045)', async () => {
      // The premise: that administrator cannot learn a channel code to ask with.
      const list = await h.app.inject({
        method: 'GET',
        url: '/api/v1/admin/sales-channels?activeOnly=false&pageSize=100',
        cookies: settingsReader,
      });
      expect(list.statusCode).toBe(403);
      const res = await preview('?file=robots', { cookies: settingsReader });
      expect(res.statusCode, res.body).toBe(200);
      expect(adminCrawlerFilePreviewResponseSchema.parse(res.json()).data.salesChannelCode).toBe('default');
    });

    it('still refuses an empty code: absent and empty are not the same request', async () => {
      const res = await preview('?file=robots&salesChannelCode=');
      expect(res.statusCode).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('what it refuses', () => {
    it.each([
      ['an unknown file', '?file=sitemap&salesChannelCode=pl_retail'],
      ['no file', '?salesChannelCode=pl_retail'],
      ['an empty sales channel', '?file=robots&salesChannelCode='],
      ['a sales channel that is not a code', `?file=robots&salesChannelCode=${encodeURIComponent('pl_retail\r\nX-Evil: 1')}`],
      ['an address of the caller’s', `?file=robots&salesChannelCode=pl_retail&url=${encodeURIComponent('http://169.254.169.254/')}`],
      ['a path of the caller’s', '?file=robots&salesChannelCode=pl_retail&path=/admin'],
      ['a part of the caller’s', '?file=robots&salesChannelCode=pl_retail&part=all'],
    ])('400 for %s, and the storefront is not asked', async (_label, query) => {
      const res = await preview(query);
      expect(res.statusCode, res.body).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('404 for a sales channel that does not exist, and the storefront is not asked', async () => {
      const res = await preview('?file=robots&salesChannelCode=no_such_channel');
      expect(res.statusCode, res.body).toBe(404);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('what it answers', () => {
    it('200 and the schema, with exactly the members it names, and no cache may keep it', async () => {
      await forChannel('seo.robots_txt_custom', RETAIL, 'User-agent: GPTBot\nDisallow: /\n');
      await forChannel('seo.default_robots', RETAIL, 'NOINDEX, NOFOLLOW');
      const res = await preview(`?file=robots&salesChannelCode=${RETAIL}`);
      expect(res.statusCode, res.body).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(adminCrawlerFilePreviewResponseSchema.parse(res.json())).toEqual({
        data: {
          file: 'robots',
          salesChannelCode: RETAIL,
          state: 'ok',
          base: SYSTEM_RULES,
          savedExtra: 'User-agent: GPTBot\nDisallow: /\n',
          savedExtraSource: 'channel',
          channelsWithOwnValue: [RETAIL],
          policy: { index: false, follow: false },
          storefront: { url: 'https://retail.example', source: 'setting' },
        },
      });
      const raw = res.json() as { data: Record<string, unknown> };
      expect(Object.keys(raw)).toEqual(['data']);
      expect(Object.keys(raw.data).sort()).toEqual([
        'base',
        'channelsWithOwnValue',
        'file',
        'policy',
        'salesChannelCode',
        'savedExtra',
        'savedExtraSource',
        'state',
        'storefront',
      ]);
      // The stored spelling of the robots choice stays the module's own.
      expect(res.body).not.toContain('NOINDEX');
    });

    it('asks the channel’s storefront for exactly /robots.txt?part=system, and follows nothing', async () => {
      await previewOf(VIP);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [input, init] = fetchSpy.mock.calls[0]!;
      // The configured address ends in a slash; the request does not double it.
      expect(String(input)).toBe('https://vip.example/robots.txt?part=system');
      expect(init?.method).toBe('GET');
      expect(init?.redirect).toBe('manual');
      expect(init?.body).toBeUndefined();
      expect(new Headers(init?.headers).get('x-sales-channel')).toBe(VIP);
    });

    it('puts nothing of the caller’s request into the one it makes', async () => {
      const res = await preview(`?file=robots&salesChannelCode=${RETAIL}`, {
        headers: {
          'x-sales-channel': VIP,
          authorization: 'Bearer caller-token',
          'x-forwarded-host': 'evil.example',
          host: 'evil.example',
          referer: 'https://evil.example/',
        },
      });
      expect(res.statusCode, res.body).toBe(200);
      const [input, init] = fetchSpy.mock.calls[0]!;
      expect(String(input)).toBe('https://retail.example/robots.txt?part=system');
      const sent = new Headers(init?.headers);
      // The channel that was asked for by the query, not the caller's header.
      expect(sent.get('x-sales-channel')).toBe(RETAIL);
      const names: string[] = [];
      const values: string[] = [];
      sent.forEach((value, name) => {
        names.push(name);
        values.push(value);
      });
      expect(names.sort()).toEqual(['accept', 'user-agent', 'x-sales-channel']);
      expect(values.join('\n')).not.toMatch(/caller-token|stub-admin-session|evil/);
      expect((res.json() as { data: { salesChannelCode: string } }).data.salesChannelCode).toBe(RETAIL);
    });

    it('asks only the origin of an address that carries a path and a query', async () => {
      await forChannel('sales_channels.storefront_url', RETAIL, 'http://10.0.0.5:8080/latest/meta-data/?');
      await previewOf(RETAIL);
      expect(String(fetchSpy.mock.calls[0]![0])).toBe('http://10.0.0.5:8080/robots.txt?part=system');
    });

    it('stores nothing: the storefront is asked again for every preview', async () => {
      await previewOf(RETAIL);
      storefrontAnswers('User-agent: *\nDisallow: /changed/\n');
      expect((await previewOf(RETAIL)).base).toBe('User-agent: *\nDisallow: /changed/\n');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('storefront-outdated: an answer without the capability header, with the rules it serves', async () => {
      storefrontAnswers(SYSTEM_RULES, { capable: false });
      const data = await previewOf(RETAIL);
      expect(data.state).toBe('storefront-outdated');
      expect(data.base).toBe(SYSTEM_RULES);
    });

    it.each([
      ['a refused connection', (): void => void fetchSpy.mockRejectedValue(new TypeError('fetch failed: ECONNREFUSED 10.0.0.5:6379'))],
      ['an error status', (): void => storefrontAnswers('internal detail: db password is hunter2', { status: 500 })],
      [
        'a redirect to another host',
        (): void => storefrontAnswers('', { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }),
      ],
      ['a web page', (): void => storefrontAnswers('<html>intranet</html>', { headers: { 'content-type': 'text/html' } })],
    ])(
      'storefront-unreachable for %s — one state, and nothing of what happened in the answer',
      async (_label, arrange) => {
        arrange();
        const res = await preview(`?file=robots&salesChannelCode=${RETAIL}`);
        expect(res.statusCode, res.body).toBe(200);
        const data = adminCrawlerFilePreviewResponseSchema.parse(res.json()).data;
        expect(data.state).toBe('storefront-unreachable');
        expect(data.base).toBeNull();
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(res.body).not.toMatch(/ECONNREFUSED|6379|hunter2|169\.254|intranet|redirect|500/);
      },
    );

    it('address-unknown: a channel with no configured address is not asked at all', async () => {
      const data = await previewOf('default');
      expect(data.state).toBe('address-unknown');
      expect(data.base).toBeNull();
      expect(data.storefront.source).toBe('fallback');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('says when the address is the one every channel shares', async () => {
      vi.stubEnv('STOREFRONT_BASE_URL', 'https://shared.example');
      const data = await previewOf('default');
      expect(data.state).toBe('ok');
      expect(data.storefront).toEqual({ url: 'https://shared.example', source: 'env' });
      expect(String(fetchSpy.mock.calls[0]![0])).toBe('https://shared.example/robots.txt?part=system');
    });
  });

  /**
   * `llms.txt` — the same endpoint, the same bounds, the other file
   * (`contracts/admin-surfaces.md` §3). What differs is held here: where the
   * storefront is asked, whose text travels, and the state a storefront uses
   * to say it serves no such file for the channel.
   */
  describe('file=llms', () => {
    const BASE = '# Endora Demo\n\n## Pages\n\n- [Home](https://retail.example/)\n';
    const llmsOf = async (channel: string): Promise<AdminCrawlerFilePreview> => {
      const res = await preview(`?file=llms&salesChannelCode=${channel}`);
      expect(res.statusCode, res.body).toBe(200);
      return adminCrawlerFilePreviewResponseSchema.parse(res.json()).data;
    };

    it('asks the channel’s storefront for exactly /llms.txt?part=base, and follows nothing', async () => {
      storefrontAnswers(BASE);
      await llmsOf(VIP);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [input, init] = fetchSpy.mock.calls[0]!;
      expect(String(input)).toBe('https://vip.example/llms.txt?part=base');
      expect(init?.method).toBe('GET');
      expect(init?.redirect).toBe('manual');
      const sent = new Headers(init?.headers);
      expect(sent.get('x-sales-channel')).toBe(VIP);
      const names: string[] = [];
      sent.forEach((_value, name) => names.push(name));
      expect(names.sort()).toEqual(['accept', 'user-agent', 'x-sales-channel']);
    });

    it('ok: the generated base and the channel’s saved content — not its robots.txt text', async () => {
      storefrontAnswers(BASE);
      await forChannel('seo.llms_txt_additional', RETAIL, '## About\n\nRetail only.\n');
      await forChannel('seo.robots_txt_custom', RETAIL, 'User-agent: RobotsOnlyBot\nDisallow: /\n');
      await forChannel('seo.llms_txt_additional', VIP, '## About\n\nVip only.\n');
      const res = await preview(`?file=llms&salesChannelCode=${RETAIL}`);
      expect(res.statusCode, res.body).toBe(200);
      expect(adminCrawlerFilePreviewResponseSchema.parse(res.json()).data).toEqual({
        file: 'llms',
        salesChannelCode: RETAIL,
        state: 'ok',
        base: BASE,
        savedExtra: '## About\n\nRetail only.\n',
        savedExtraSource: 'channel',
        channelsWithOwnValue: [VIP, RETAIL].sort(),
        policy: { index: true, follow: true },
        storefront: { url: 'https://retail.example', source: 'setting' },
      });
      // Channel isolation, and the two settings are two settings.
      expect(res.body).not.toContain('Vip only');
      expect(res.body).not.toContain('RobotsOnlyBot');
    });

    it('a channel without its own content shows the all-channels content', async () => {
      storefrontAnswers(BASE);
      await forAll('seo.llms_txt_additional', '## Shared\n');
      await forChannel('seo.llms_txt_additional', VIP, '## Vip\n');
      const retail = await llmsOf(RETAIL);
      expect(retail.savedExtra).toBe('## Shared\n');
      expect(retail.savedExtraSource).toBe('global');
      expect(retail.channelsWithOwnValue).toEqual([VIP]);
    });

    it('not-served: the storefront answers 404 and says it supports the feature', async () => {
      await forChannel('seo.default_robots', RETAIL, 'NOINDEX, FOLLOW');
      await forChannel('seo.llms_txt_additional', RETAIL, '## About\n');
      storefrontAnswers('Not found.\n', { status: 404 });
      const data = await llmsOf(RETAIL);
      expect(data.state).toBe('not-served');
      expect(data.base).toBeNull();
      expect(data.policy).toEqual({ index: false, follow: true });
      // What the operator saved is still theirs to see.
      expect(data.savedExtra).toBe('## About\n');
    });

    it('storefront-outdated: a 404 from a storefront that has no such file, with no base', async () => {
      storefrontAnswers('<html>404</html>', {
        status: 404,
        capable: false,
        headers: { 'content-type': 'text/html' },
      });
      const res = await preview(`?file=llms&salesChannelCode=${RETAIL}`);
      const data = adminCrawlerFilePreviewResponseSchema.parse(res.json()).data;
      expect(data.state).toBe('storefront-outdated');
      expect(data.base).toBeNull();
      expect(res.body).not.toContain('html');
    });

    it('storefront-unreachable: a temporary failure is not "no such file"', async () => {
      storefrontAnswers('llms.txt is temporarily unavailable.\n', { status: 503 });
      const data = await llmsOf(RETAIL);
      expect(data.state).toBe('storefront-unreachable');
      expect(data.base).toBeNull();
    });

    it('answers an administrator who may read settings and change nothing (FR-045)', async () => {
      storefrontAnswers(BASE);
      const res = await preview(`?file=llms&salesChannelCode=${RETAIL}`, { cookies: settingsReader });
      expect(res.statusCode, res.body).toBe(200);
      const write = await h.app.inject({
        method: 'PUT',
        url: '/api/v1/admin/settings/seo.llms_txt_additional/value',
        cookies: settingsReader,
        payload: { scope: 'all', value: '## About' },
      });
      expect(write.statusCode).toBe(403);
    });

    it('403 without settings:read, and the storefront is not asked', async () => {
      const res = await preview(`?file=llms&salesChannelCode=${RETAIL}`, {
        cookies: withoutSettingsRead,
      });
      expect(res.statusCode).toBe(403);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('channel isolation', () => {
    const RETAIL_TEXT = 'User-agent: RetailOnlyBot\nDisallow: /retail-secret/\n';
    const VIP_TEXT = 'User-agent: VipOnlyBot\nDisallow: /vip-secret/\n';
    const SHARED_TEXT = 'User-agent: *\nDisallow: /shared/\n';

    it('previewing a channel returns that channel’s saved text and never another’s', async () => {
      await forChannel('seo.robots_txt_custom', RETAIL, RETAIL_TEXT);
      await forChannel('seo.robots_txt_custom', VIP, VIP_TEXT);

      const retail = await preview(`?file=robots&salesChannelCode=${RETAIL}`);
      const vip = await preview(`?file=robots&salesChannelCode=${VIP}`);
      const retailData = adminCrawlerFilePreviewResponseSchema.parse(retail.json()).data;
      const vipData = adminCrawlerFilePreviewResponseSchema.parse(vip.json()).data;

      expect(retailData.savedExtra).toBe(RETAIL_TEXT);
      expect(retailData.savedExtraSource).toBe('channel');
      expect(retail.body).not.toContain('VipOnlyBot');
      expect(retail.body).not.toContain('vip-secret');

      expect(vipData.savedExtra).toBe(VIP_TEXT);
      expect(vip.body).not.toContain('RetailOnlyBot');
      expect(vip.body).not.toContain('retail-secret');

      // Each channel's storefront was asked for itself and no other.
      const asked = fetchSpy.mock.calls.map(([input, init]) => [
        String(input),
        new Headers(init?.headers).get('x-sales-channel'),
      ]);
      expect(asked).toEqual([
        ['https://retail.example/robots.txt?part=system', RETAIL],
        ['https://vip.example/robots.txt?part=system', VIP],
      ]);
    });

    it('the caller’s own sales-channel header does not move the preview to another channel', async () => {
      await forChannel('seo.robots_txt_custom', RETAIL, RETAIL_TEXT);
      await forChannel('seo.robots_txt_custom', VIP, VIP_TEXT);
      const res = await preview(`?file=robots&salesChannelCode=${RETAIL}`, {
        headers: { 'x-sales-channel': VIP },
      });
      expect(adminCrawlerFilePreviewResponseSchema.parse(res.json()).data.savedExtra).toBe(RETAIL_TEXT);
      expect(res.body).not.toContain('VipOnlyBot');
    });

    it('a channel without its own value shows the all-channels text and names who has their own', async () => {
      await forAll('seo.robots_txt_custom', SHARED_TEXT);
      await forChannel('seo.robots_txt_custom', VIP, VIP_TEXT);

      const retail = await previewOf(RETAIL);
      expect(retail.savedExtra).toBe(SHARED_TEXT);
      expect(retail.savedExtraSource).toBe('global');
      expect(retail.channelsWithOwnValue).toEqual([VIP]);

      const vip = await previewOf(VIP);
      expect(vip.savedExtra).toBe(VIP_TEXT);
      expect(vip.savedExtraSource).toBe('channel');
      expect(vip.channelsWithOwnValue).toEqual([VIP]);
    });

    it('nothing saved anywhere: empty text from the default', async () => {
      const data = await previewOf(RETAIL);
      expect(data.savedExtra).toBe('');
      expect(data.savedExtraSource).toBe('default');
      expect(data.channelsWithOwnValue).toEqual([]);
    });

    it('reports each channel’s own default robots', async () => {
      await forChannel('seo.default_robots', VIP, 'NOINDEX, FOLLOW');
      expect((await previewOf(VIP)).policy).toEqual({ index: false, follow: true });
      expect((await previewOf(RETAIL)).policy).toEqual({ index: true, follow: true });
    });
  });
});
