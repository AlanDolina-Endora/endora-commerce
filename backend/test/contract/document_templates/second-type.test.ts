import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QUOTE_REQUEST_DOCUMENT_TYPE } from '@endora-commerce/contracts';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { withModuleOff } from '../../helpers/off-state.js';

/**
 * `specs/152-compare-pdf-template/` US6, SC-007 and
 * `specs/153-quote-request-pdf-template/` FR-050, FR-051 — the *Quote request*
 * type, the first real document type with per-document selection, served by
 * the facility: listed, its own palette (the four quote blocks, the Line items
 * table its collection brings, every core block), per-document selection — a
 * named template used, a deleted one replaced by the default and reported
 * (152 FR-039) — and hidden with its rows kept while its module is off.
 *
 * It replaced the test-only stand-in 152 registered under `quote_requests`' id
 * (153 research R-24); the "a type adopts the facility touching none of its
 * files" proof moved to the registry and renderer unit tests, under a test-only
 * module id.
 */

const ADMIN = { b2b_session: 'stub-admin-session' };
const API = '/api/v1/admin/document-templates';
const TYPE = QUOTE_REQUEST_DOCUMENT_TYPE;

interface Port {
  render(input: Record<string, unknown>): Promise<{ bytes: Uint8Array; source: string; templateId: string | null; requestedTemplateMissing: boolean }>;
}

describe('the Quote request document type, with per-document selection (152 US6, 153)', () => {
  let h: BackendServerHandle;
  let port: Port;
  let sample: unknown;

  async function create(name: string, setDefault: boolean): Promise<string> {
    const res = await h.app.inject({
      method: 'POST',
      url: API,
      cookies: ADMIN,
      payload: { documentType: TYPE, name, salesChannelId: null, source: { kind: 'built_in' }, setDefault },
    });
    expect(res.statusCode).toBe(201);
    return (res.json() as { data: { id: string } }).data.id;
  }

  beforeAll(async () => {
    h = await setupBackendServer();
    port = h.container.resolve('documentRenderPort') as Port;
    sample = ((await h.app.inject({ method: 'GET', url: `${API}/types/${TYPE}`, cookies: ADMIN })).json() as { data: { sample: unknown } }).data.sample;
    await h.em().getConnection().execute(`delete from document_templates where document_type = ?`, [TYPE]);
  });

  afterAll(async () => {
    await h.em().getConnection().execute(`delete from document_templates where document_type = ?`, [TYPE]);
    await teardownBackendServer(h);
  });

  it('is listed with its own palette: quote blocks, the Line items table, every core block', async () => {
    const types = (await h.app.inject({ method: 'GET', url: `${API}/types`, cookies: ADMIN })).json() as { data: { code: string; selection: string }[] };
    expect(types.data.find((t) => t.code === TYPE)?.selection).toBe('per_document');
    const config = (await h.app.inject({ method: 'GET', url: `${API}/types/${TYPE}/builder-config`, cookies: ADMIN })).json() as {
      data: { components: { name: string }[] };
    };
    expect(config.data.components.map((c) => c.name)).toEqual([
      'quote_requests.QuoteHeader',
      'quote_requests.QuoteParties',
      'quote_requests.QuoteNotes',
      'quote_requests.QuoteDetails',
      'document_templates.ItemsTable',
      'document_templates.Heading',
      'document_templates.Text',
      'document_templates.Image',
      'document_templates.Spacer',
      'document_templates.Divider',
      'document_templates.PageBreak',
    ]);
  });

  it('renders with its default, with a named template, and with the default when the named one is gone (FR-037, FR-039)', async () => {
    const def = await create('Default quote', true);
    const chosen = await create('Chosen quote', false);
    const base = { documentType: TYPE, salesChannelId: null, language: 'en-US', data: sample };

    const byDefault = await port.render(base);
    expect(byDefault).toMatchObject({ source: 'default', templateId: def, requestedTemplateMissing: false });
    expect(Buffer.from(byDefault.bytes.subarray(0, 5)).toString('ascii')).toBe('%PDF-');

    expect(await port.render({ ...base, templateId: chosen })).toMatchObject({ source: 'explicit', templateId: chosen });

    await h.app.inject({ method: 'DELETE', url: `${API}/${chosen}`, cookies: ADMIN, payload: { expectedVersion: 1 } });
    expect(await port.render({ ...base, templateId: chosen })).toMatchObject({
      source: 'default',
      templateId: def,
      requestedTemplateMissing: true,
    });
  });

  it('disappears while its module is off, and its rows are kept (FR-051, 153 FR-061)', async () => {
    const before = await h.em().getConnection().execute(`select id, version, content from document_templates where document_type = ? order by id`, [TYPE]);
    await withModuleOff('quote_requests', 'deactivated', async () => {
      const types = (await h.app.inject({ method: 'GET', url: `${API}/types`, cookies: ADMIN })).json() as { data: { code: string }[] };
      expect(types.data.map((t) => t.code)).not.toContain(TYPE);
      const config = await h.app.inject({ method: 'GET', url: `${API}/types/${TYPE}/builder-config`, cookies: ADMIN });
      expect((config.json() as { error: { code: string } }).error.code).toBe('DOCUMENT_TYPE_NOT_AVAILABLE');
    });
    const after = await h.em().getConnection().execute(`select id, version, content from document_templates where document_type = ? order by id`, [TYPE]);
    expect(after).toEqual(before);
    expect(before.length).toBeGreaterThan(0);
  });
});
