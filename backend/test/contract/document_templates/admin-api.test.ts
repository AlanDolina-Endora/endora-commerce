import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  documentBuilderConfigSchema,
  documentTemplateDetailSchema,
  documentTemplateSummarySchema,
  documentTypeDetailSchema,
  documentTypeSummarySchema,
} from '@endora-commerce/contracts';
import { AuditLogEntry } from '@endora-commerce/platform/kernel';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { withModuleOff } from '../../helpers/off-state.js';
import { ensureAdminWithRole } from '../../helpers/admin-search-fixtures.js';
import {
  FIXTURE_BLOCK,
  FIXTURE_DOCUMENT_TYPE,
  registerFixtureDocumentType,
} from '../../fixtures/document-types/fixture-document-type.js';

/**
 * `specs/152-compare-pdf-template/` T030 — the twelve admin routes of
 * `contracts/document-templates-api.md`, against a test-only document type
 * (US6's fixture): shapes, the permission gate ahead of validation, the
 * error table, FR-019, the preview writing nothing, one audit row per write
 * and none for a refusal, and a switched-off host hiding its type while its
 * rows stay.
 */

const BASE = '/api/v1/admin/document-templates';
const ADMIN = { b2b_session: 'stub-admin-session' };
const READER = { b2b_session: 'stub-document-templates-reader-session' };
const NONE = { b2b_session: 'stub-document-templates-none-session' };
const READER_ID = '00000000-0000-4000-8000-0000000152a1';
const NONE_ID = '00000000-0000-4000-8000-0000000152a2';

const tree = (content: unknown[]) => ({ root: { props: {} }, content });

describe('document templates — admin API (spec 152)', () => {
  let h: BackendServerHandle;

  beforeAll(async () => {
    h = await setupBackendServer();
    registerFixtureDocumentType(h);
    await ensureAdminWithRole(h, READER_ID, 'document_templates_reader', ['document_templates:read']);
    await ensureAdminWithRole(h, NONE_ID, 'document_templates_none', ['orders:read']);
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  const auditRows = async (objectId: string): Promise<AuditLogEntry[]> =>
    h.em().find(AuditLogEntry, { objectType: 'document_template', objectId });

  async function create(over: Record<string, unknown> = {}, cookies = ADMIN) {
    return h.app.inject({
      method: 'POST',
      url: BASE,
      cookies,
      payload: {
        documentType: FIXTURE_DOCUMENT_TYPE,
        name: `Note ${randomUUID().slice(0, 6)}`,
        salesChannelId: null,
        source: { kind: 'built_in' },
        ...over,
      },
    });
  }

  describe('permissions — answered before the input is validated', () => {
    it('401 without a session, 403 without the read code', async () => {
      expect((await h.app.inject({ method: 'GET', url: `${BASE}/types` })).statusCode).toBe(401);
      expect((await h.app.inject({ method: 'GET', url: `${BASE}/types`, cookies: NONE })).statusCode).toBe(403);
      expect(
        (await h.app.inject({ method: 'POST', url: `${BASE}/preview`, cookies: NONE, payload: { nonsense: 1 } })).statusCode,
      ).toBe(403);
    });

    it('a reader reads and previews but every write is 403, even with an invalid body', async () => {
      expect((await h.app.inject({ method: 'GET', url: `${BASE}/types`, cookies: READER })).statusCode).toBe(200);
      const preview = await h.app.inject({
        method: 'POST',
        url: `${BASE}/preview`,
        cookies: READER,
        payload: { documentType: FIXTURE_DOCUMENT_TYPE, language: 'en-US', tree: tree([]) },
      });
      expect(preview.statusCode).toBe(200);
      const id = randomUUID();
      for (const [method, url] of [
        ['POST', BASE],
        ['PATCH', `${BASE}/${id}`],
        ['PUT', `${BASE}/${id}/content/en-US`],
        ['POST', `${BASE}/${id}/set-default`],
        ['POST', `${BASE}/${id}/clear-default`],
        ['DELETE', `${BASE}/${id}`],
      ] as const) {
        const res = await h.app.inject({ method, url, cookies: READER, payload: { nonsense: true } });
        expect(res.statusCode, `${method} ${url}`).toBe(403);
      }
    });
  });

  describe('types (routes 1–3)', () => {
    it('lists the available types', async () => {
      const res = await h.app.inject({ method: 'GET', url: `${BASE}/types`, cookies: ADMIN });
      const types = (res.json() as { data: unknown[] }).data.map((t) => documentTypeSummarySchema.parse(t));
      expect(types.map((t) => t.code)).toContain(FIXTURE_DOCUMENT_TYPE);
      expect(types.find((t) => t.code === FIXTURE_DOCUMENT_TYPE)?.selection).toBe('per_document');
    });

    it('describes one type: languages, merge fields, sample, built-in layout, page defaults', async () => {
      const res = await h.app.inject({ method: 'GET', url: `${BASE}/types/${FIXTURE_DOCUMENT_TYPE}`, cookies: ADMIN });
      expect(res.statusCode).toBe(200);
      const detail = documentTypeDetailSchema.parse((res.json() as { data: unknown }).data);
      expect(detail.languages).toEqual(['en-US', 'pl-PL']);
      expect(detail.variables.map((v) => `${v.key}:${v.scope}`)).toEqual([
        'date:body',
        'title:body',
        'page:headerFooter',
        'pages:headerFooter',
      ]);
      expect(detail.sample).toEqual({ title: 'Sample note' });
      expect(Object.keys(detail.builtInContent.languages)).toEqual(['en-US']);
      expect(detail.pageDefaults).toMatchObject({ pageSize: 'A4', orientation: 'auto' });
    });

    it("serves the type's palette and nothing else", async () => {
      const res = await h.app.inject({
        method: 'GET',
        url: `${BASE}/types/${FIXTURE_DOCUMENT_TYPE}/builder-config`,
        cookies: ADMIN,
      });
      const config = documentBuilderConfigSchema.parse((res.json() as { data: unknown }).data);
      expect(config.components.map((c) => c.name)).toEqual([FIXTURE_BLOCK, 'document_templates.Text']);
      expect(config.categories.map((c) => c.key)).toEqual(['layout']);
    });

    it('answers DOCUMENT_TYPE_NOT_AVAILABLE for an unknown type', async () => {
      const res = await h.app.inject({ method: 'GET', url: `${BASE}/types/nobody.nothing`, cookies: ADMIN });
      expect(res.statusCode).toBe(404);
      expect((res.json() as { error: { code: string } }).error.code).toBe('DOCUMENT_TYPE_NOT_AVAILABLE');
    });
  });

  describe('templates (routes 4–11)', () => {
    it('creates from the built-in layout, not default, with one audit row', async () => {
      const res = await create();
      expect(res.statusCode).toBe(201);
      const summary = documentTemplateSummarySchema.parse((res.json() as { data: unknown }).data);
      expect(summary).toMatchObject({ isDefault: false, version: 1, languages: ['en-US'], salesChannelId: null });
      const rows = await auditRows(summary.id);
      expect(rows.map((r) => r.action)).toEqual(['document_template.create']);
      const detail = documentTemplateDetailSchema.parse(
        ((await h.app.inject({ method: 'GET', url: `${BASE}/${summary.id}`, cookies: ADMIN })).json() as { data: unknown }).data,
      );
      expect((detail.content.languages['en-US'] as { content: { type: string }[] }).content[0]!.type).toBe(FIXTURE_BLOCK);
    });

    it('duplicates a template, and refuses a source of another type or an unknown channel', async () => {
      const source = (await create()).json() as { data: { id: string } };
      const copy = await create({ source: { kind: 'template', templateId: source.data.id } });
      expect(copy.statusCode).toBe(201);
      const bad = await create({ source: { kind: 'template', templateId: randomUUID() } });
      expect(bad.statusCode).toBe(422);
      expect((bad.json() as { error: { code: string } }).error.code).toBe('DOCUMENT_TEMPLATE_INVALID');
      const channel = await create({ salesChannelId: randomUUID() });
      expect(channel.statusCode).toBe(422);
    });

    it('saves a language; refuses a stale version, a block of another type, a language the type does not print, an oversize tree', async () => {
      const { data } = (await create()).json() as { data: { id: string; version: number } };
      const put = (language: string, payload: unknown) =>
        h.app.inject({ method: 'PUT', url: `${BASE}/${data.id}/content/${language}`, cookies: ADMIN, payload: payload as Record<string, unknown> });

      const saved = await put('pl-PL', {
        expectedVersion: 1,
        tree: tree([
          { type: FIXTURE_BLOCK, props: { id: 'a', caption: 'Notatka' } },
          { type: 'gone.Block', props: { id: 'g', keep: { deep: true } } },
        ]),
      });
      expect(saved.statusCode).toBe(200);
      expect((saved.json() as { data: { version: number; languages: string[] } }).data).toMatchObject({
        version: 2,
        languages: ['en-US', 'pl-PL'],
      });
      const stored = documentTemplateDetailSchema.parse(
        ((await h.app.inject({ method: 'GET', url: `${BASE}/${data.id}`, cookies: ADMIN })).json() as { data: unknown }).data,
      );
      expect((stored.content.languages['pl-PL'] as { content: unknown[] }).content[1]).toEqual({
        type: 'gone.Block',
        props: { id: 'g', keep: { deep: true } },
      });

      const before = (await auditRows(data.id)).length;
      const stale = await put('pl-PL', { expectedVersion: 1, tree: tree([]) });
      expect(stale.statusCode).toBe(409);
      expect((stale.json() as { error: { code: string } }).error.code).toBe('VERSION_CONFLICT');

      const foreign = await put('pl-PL', { expectedVersion: 2, tree: tree([{ type: 'document_templates.Heading', props: {} }]) });
      expect(foreign.statusCode).toBe(422);
      expect((foreign.json() as { error: { details: { blockName: string } } }).error.details.blockName).toBe(
        'document_templates.Heading',
      );

      const language = await put('de-DE', { expectedVersion: 2, tree: tree([]) });
      expect(language.statusCode).toBe(422);

      const oversize = await put('en-US', {
        expectedVersion: 2,
        tree: tree(Array.from({ length: 201 }, (_, i) => ({ type: FIXTURE_BLOCK, props: { id: String(i) } }))),
      });
      expect(oversize.statusCode).toBe(422);
      expect((oversize.json() as { error: { details: { limit?: string } } }).error.details.limit).toBe('maxNodesPerLanguage');

      expect((await auditRows(data.id)).length).toBe(before);
    });

    it('renames, sets and clears the default, and refuses deleting a default without confirmation', async () => {
      const first = ((await create()).json() as { data: { id: string } }).data;
      const second = ((await create()).json() as { data: { id: string } }).data;
      const post = (id: string, action: string, payload: Record<string, unknown>) =>
        h.app.inject({ method: 'POST', url: `${BASE}/${id}/${action}`, cookies: ADMIN, payload });

      const renamed = await h.app.inject({
        method: 'PATCH',
        url: `${BASE}/${first.id}`,
        cookies: ADMIN,
        payload: { name: 'Renamed', expectedVersion: 1 },
      });
      expect((renamed.json() as { data: { name: string; version: number } }).data).toMatchObject({ name: 'Renamed', version: 2 });

      expect((await post(first.id, 'set-default', { expectedVersion: 2 })).statusCode).toBe(200);
      const switched = await post(second.id, 'set-default', { expectedVersion: 1 });
      expect((switched.json() as { data: { isDefault: boolean } }).data.isDefault).toBe(true);
      const firstNow = documentTemplateDetailSchema.parse(
        ((await h.app.inject({ method: 'GET', url: `${BASE}/${first.id}`, cookies: ADMIN })).json() as { data: unknown }).data,
      );
      expect(firstNow.isDefault).toBe(false);
      const defaults = (
        (await h.app.inject({ method: 'GET', url: `${BASE}?type=${FIXTURE_DOCUMENT_TYPE}&salesChannelId=global`, cookies: ADMIN })).json() as {
          data: { isDefault: boolean }[];
        }
      ).data.filter((t) => t.isDefault);
      expect(defaults).toHaveLength(1);

      const refused = await h.app.inject({ method: 'DELETE', url: `${BASE}/${second.id}`, cookies: ADMIN, payload: { expectedVersion: 2 } });
      expect(refused.statusCode).toBe(409);
      expect((refused.json() as { error: { code: string } }).error.code).toBe('DOCUMENT_TEMPLATE_IS_DEFAULT');

      expect((await post(second.id, 'clear-default', { expectedVersion: 2 })).statusCode).toBe(200);
      const deleted = await h.app.inject({ method: 'DELETE', url: `${BASE}/${second.id}`, cookies: ADMIN, payload: { expectedVersion: 3 } });
      expect(deleted.statusCode).toBe(204);
      expect((await h.app.inject({ method: 'GET', url: `${BASE}/${second.id}`, cookies: ADMIN })).statusCode).toBe(404);
      expect((await auditRows(second.id)).map((r) => r.action)).toEqual([
        'document_template.create',
        'document_template.set_default',
        'document_template.clear_default',
        'document_template.delete',
      ]);
    });
  });

  describe('preview (route 12)', () => {
    it('renders the unsaved canvas with the sample and writes nothing', async () => {
      const count = await h.em().count(AuditLogEntry, { objectType: 'document_template' });
      const res = await h.app.inject({
        method: 'POST',
        url: `${BASE}/preview`,
        cookies: ADMIN,
        payload: {
          documentType: FIXTURE_DOCUMENT_TYPE,
          language: 'en-US',
          tree: tree([{ type: 'document_templates.Text', props: { text: 'Hello {{title}}' } }]),
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.rawPayload.subarray(0, 5).toString('utf8')).toBe('%PDF-');
      expect(await h.em().count(AuditLogEntry, { objectType: 'document_template' })).toBe(count);
    });

    it('refuses a block the type does not offer', async () => {
      const res = await h.app.inject({
        method: 'POST',
        url: `${BASE}/preview`,
        cookies: ADMIN,
        payload: { documentType: FIXTURE_DOCUMENT_TYPE, language: 'en-US', tree: tree([{ type: 'document_templates.Image', props: {} }]) },
      });
      expect(res.statusCode).toBe(422);
    });
  });

  describe('a switched-off host (FR-051)', () => {
    it('hides its type and templates, refuses its writes, and deletes nothing', async () => {
      const { data } = (await create()).json() as { data: { id: string } };
      await withModuleOff('quote_requests', 'deactivated', async () => {
        const types = (await h.app.inject({ method: 'GET', url: `${BASE}/types`, cookies: ADMIN })).json() as { data: { code: string }[] };
        expect(types.data.map((t) => t.code)).not.toContain(FIXTURE_DOCUMENT_TYPE);
        for (const url of [`${BASE}/types/${FIXTURE_DOCUMENT_TYPE}`, `${BASE}/types/${FIXTURE_DOCUMENT_TYPE}/builder-config`]) {
          const res = await h.app.inject({ method: 'GET', url, cookies: ADMIN });
          expect((res.json() as { error: { code: string } }).error.code).toBe('DOCUMENT_TYPE_NOT_AVAILABLE');
        }
        expect((await create()).statusCode).toBe(404);
        const read = await h.app.inject({ method: 'GET', url: `${BASE}/${data.id}`, cookies: ADMIN });
        expect((read.json() as { error: { code: string } }).error.code).toBe('DOCUMENT_TEMPLATE_NOT_FOUND');
      });
      expect((await h.app.inject({ method: 'GET', url: `${BASE}/${data.id}`, cookies: ADMIN })).statusCode).toBe(200);
    });
  });
});
