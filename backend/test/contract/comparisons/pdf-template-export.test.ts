import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '@endora-commerce/contracts';
import { SalesChannel } from '@endora-commerce/platform/kernel';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { SEED_PRODUCT_101_ID, SEED_PRODUCT_102_ID, findAttributeExtensionByKey } from '../../helpers/seed-catalog.js';
import { freshCompareToken, freshShareToken } from '../../helpers/comparison-fixtures.js';
import { Comparison } from '../../helpers/package-entities.js';
import { withModuleOff } from '../../helpers/off-state.js';

/**
 * `specs/152-compare-pdf-template/` T034, T045 — `GET /api/v1/comparisons/me/pdf`
 * through the template path (`contracts/comparison-document.md` §4).
 *
 * What the PDF carries is read off the engine's document definition (a spy on
 * `buildDefinition`), because PDF bytes are compressed. The data handed to the
 * engine is asserted equal to what `GET /me` answers the same buyer — that is
 * FR-020's "exactly as their comparison page shows it" and FR-033's "nothing
 * else reaches a render", and it inherits every viewer-pricing and visibility
 * guarantee that view already has (SC-005).
 */

const CHANNEL = { 'x-sales-channel': 'pl_retail' };
const ADMIN = { b2b_session: 'stub-admin-session' };
const ADMIN_API = '/api/v1/admin/document-templates';

interface Built {
  definition: { content: unknown[]; pageOrientation?: string };
  source: string;
  language: string;
}

describe('comparison PDF through document templates (spec 152)', () => {
  let h: BackendServerHandle;
  let renderer: { buildDefinition: (input: unknown) => Promise<Built> };
  const created: string[] = [];
  let channelB = '';

  beforeAll(async () => {
    h = await setupBackendServer();
    const em = h.em();
    for (const key of ['color', 'material']) {
      const ext = await findAttributeExtensionByKey(em, key);
      if (ext) ext.isComparable = true;
    }
    await em.flush();
    renderer = h.container.resolve('documentRenderer') as typeof renderer;
    channelB = randomUUID();
    await em.getConnection().execute(
      `insert into sales_channels (id, code, name, default_language, default_currency, created_at, updated_at)
       values (?, ?, '{"en-US":"Doc channel B"}'::jsonb, 'en-US', 'PLN', now(), now())`,
      [channelB, `doc-b-${channelB.slice(0, 8)}`],
    );
  }, 60_000);

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const id of created.splice(0)) {
      await h.em().getConnection().execute(`delete from document_templates where id = ?`, [id]);
    }
  });

  afterAll(async () => {
    await h.em().getConnection().execute(`delete from sales_channels where id = ?`, [channelB]);
    await teardownBackendServer(h);
  });

  async function mint(): Promise<string> {
    const first = await h.app.inject({
      method: 'POST',
      url: '/api/v1/comparisons/me/products',
      headers: { ...CHANNEL, 'content-type': 'application/json' },
      payload: { productId: SEED_PRODUCT_101_ID },
    });
    const raw = first.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw[0] : raw)?.split(';')[0] ?? '';
    await h.app.inject({
      method: 'POST',
      url: '/api/v1/comparisons/me/products',
      headers: { ...CHANNEL, 'content-type': 'application/json', cookie },
      payload: { productId: SEED_PRODUCT_102_ID },
    });
    return cookie;
  }

  async function template(opts: { title: string; salesChannelId?: string | null; setDefault: boolean }): Promise<string> {
    const res = await h.app.inject({
      method: 'POST',
      url: ADMIN_API,
      cookies: ADMIN,
      payload: {
        documentType: 'comparisons.comparison',
        name: opts.title,
        salesChannelId: opts.salesChannelId ?? null,
        source: { kind: 'built_in' },
        setDefault: false,
      },
    });
    expect(res.statusCode).toBe(201);
    const { id, version } = (res.json() as { data: { id: string; version: number } }).data;
    created.push(id);
    let current = version;
    for (const language of ['en-US', 'pl-PL']) {
      const saved = await h.app.inject({
        method: 'PUT',
        url: `${ADMIN_API}/${id}/content/${language}`,
        cookies: ADMIN,
        payload: {
          expectedVersion: current,
          tree: {
            root: { props: {} },
            content: [
              { type: 'comparisons.ComparisonHeader', props: { id: 'h', title: `${opts.title} ${language}` } },
              { type: 'comparisons.ComparisonTable', props: { id: 't', showSku: true, showImages: false } },
            ],
          },
        },
      });
      expect(saved.statusCode).toBe(200);
      current += 1;
    }
    if (opts.setDefault) {
      const r = await h.app.inject({ method: 'POST', url: `${ADMIN_API}/${id}/set-default`, cookies: ADMIN, payload: { expectedVersion: current } });
      expect(r.statusCode).toBe(200);
    }
    return id;
  }

  async function exportPdf(cookie: string, opts: { language?: string; query?: string } = {}) {
    const spy = vi.spyOn(renderer, 'buildDefinition');
    const res = await h.app.inject({
      method: 'GET',
      url: `/api/v1/comparisons/me/pdf${opts.query ?? ''}`,
      headers: { ...CHANNEL, cookie, ...(opts.language ? { 'accept-language': opts.language } : {}) },
    });
    const call = spy.mock.calls[0]?.[0] as { data: { view: unknown; hideEmptyRows: boolean }; salesChannelId: string } | undefined;
    const built = spy.mock.results[0] ? await (spy.mock.results[0].value as Promise<Built>) : undefined;
    spy.mockRestore();
    return { res, call, built, text: JSON.stringify(built?.definition.content ?? []) };
  }

  it('no template: the built-in layout, in the buyer’s language, with the screen’s data (FR-020, FR-031, FR-032)', async () => {
    const cookie = await mint();
    const { res, call, built, text } = await exportPdf(cookie, { language: 'pl-PL,pl;q=0.9' });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="comparison-[A-Za-z0-9_-]{8}\.pdf"$/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-language']).toBe('pl-PL');
    expect(built?.source).toBe('built_in');
    expect(text).toContain('Porównanie produktów');

    const me = await h.app.inject({ method: 'GET', url: '/api/v1/comparisons/me', headers: { ...CHANNEL, cookie } });
    expect(call?.data.view).toEqual((me.json() as { data: unknown }).data);
    expect(call?.data.hideEmptyRows).toBe(false);
  });

  it('a global default template is used; a non-default template is ignored', async () => {
    const cookie = await mint();
    await template({ title: 'Draft title', setDefault: false });
    expect((await exportPdf(cookie, { language: 'en-US' })).built?.source).toBe('built_in');
    await template({ title: 'Brand A comparison', setDefault: true });
    const { built, text, res } = await exportPdf(cookie, { language: 'en-US' });
    expect(built?.source).toBe('default');
    expect(text).toContain(`Brand A comparison ${res.headers['content-language']}`);
    expect(text).not.toContain('Draft title');
  });

  it("channel B's default is never used for a channel-A export (Constitution XII)", async () => {
    const cookie = await mint();
    await template({ title: 'Only for B', salesChannelId: channelB, setDefault: true });
    const { built, text } = await exportPdf(cookie, { language: 'en-US' });
    expect(built?.source).toBe('built_in');
    expect(text).not.toContain('Only for B');
  });

  it('a template holding only English serves a Polish buyer in English', async () => {
    const cookie = await mint();
    const id = await template({ title: 'Bilingual', setDefault: true });
    // A template with one language only — written directly: the editor always
    // starts a new template from the built-in layout's languages.
    await h.em().getConnection().execute(
      `update document_templates set content = jsonb_set(content, '{languages}', (content->'languages') - 'pl-PL') where id = ?`,
      [id],
    );
    const { built, res, text } = await exportPdf(cookie, { language: 'pl-PL' });
    expect(built?.language).toBe('en-US');
    expect(res.headers['content-language']).toBe('en-US');
    expect(text).toContain('Bilingual en-US');
  });

  it('an unknown Accept-Language falls back to the channel default language', async () => {
    const cookie = await mint();
    const channel = await h.em().findOneOrFail(SalesChannel, { code: 'pl_retail' });
    const { res } = await exportPdf(cookie, { language: 'xx-YY' });
    expect(res.headers['content-language']).toBe(channel.defaultLanguage);
  });

  it('passes the hide-empty-rows switch (FR-020)', async () => {
    const cookie = await mint();
    expect((await exportPdf(cookie, { query: '?hideEmptyRows=true' })).call?.data.hideEmptyRows).toBe(true);
    const bad = await h.app.inject({ method: 'GET', url: '/api/v1/comparisons/me/pdf?hideEmptyRows=maybe', headers: { ...CHANNEL, cookie } });
    expect(bad.statusCode).toBe(400);
  });

  it('refuses an empty comparison as before (FR-036)', async () => {
    const em = h.em();
    const channel = await em.findOneOrFail(SalesChannel, { code: 'pl_retail' });
    const owner = freshCompareToken();
    em.create(Comparison, { shareToken: freshShareToken(), anonymousToken: owner, salesChannelId: channel.id, displayMode: 'all' });
    await em.flush();
    const res = await h.app.inject({ method: 'GET', url: '/api/v1/comparisons/me/pdf', headers: { ...CHANNEL, cookie: `compare_token=${owner}` } });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe(ERROR_CODES.COMPARISON_EMPTY);
  });

  it('with document templates switched off, the fixed layout still exports (R-11)', async () => {
    const cookie = await mint();
    await withModuleOff('document_templates', 'deactivated', async () => {
      const { res, built } = await exportPdf(cookie, { language: 'pl-PL' });
      expect(res.statusCode).toBe(200);
      expect(res.rawPayload.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(built).toBeUndefined();
      expect(res.headers['content-language']).toBeUndefined();
    });
  });
});
