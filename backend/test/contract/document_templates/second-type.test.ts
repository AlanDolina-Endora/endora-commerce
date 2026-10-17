import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { withModuleOff } from '../../helpers/off-state.js';
import { FIXTURE_BLOCK, FIXTURE_DOCUMENT_TYPE, registerFixtureDocumentType } from '../../fixtures/document-types/fixture-document-type.js';

/**
 * `specs/152-compare-pdf-template/` US6, T064, SC-007 — a further document type,
 * the shape the quote-request PDF will take, served by the facility with no
 * change to it: listed, its own palette, per-document selection — a named
 * template used, a deleted one replaced by the default and reported (FR-039) —
 * and hidden with its rows kept while its module is off.
 */

const ADMIN = { b2b_session: 'stub-admin-session' };
const API = '/api/v1/admin/document-templates';

interface Port {
  render(input: Record<string, unknown>): Promise<{ bytes: Uint8Array; source: string; templateId: string | null; requestedTemplateMissing: boolean }>;
}

describe('a second document type with per-document selection (spec 152 US6)', () => {
  let h: BackendServerHandle;
  let port: Port;

  async function create(name: string, setDefault: boolean): Promise<string> {
    const res = await h.app.inject({
      method: 'POST',
      url: API,
      cookies: ADMIN,
      payload: { documentType: FIXTURE_DOCUMENT_TYPE, name, salesChannelId: null, source: { kind: 'built_in' }, setDefault },
    });
    expect(res.statusCode).toBe(201);
    return (res.json() as { data: { id: string } }).data.id;
  }

  beforeAll(async () => {
    h = await setupBackendServer();
    registerFixtureDocumentType(h);
    port = h.container.resolve('documentRenderPort') as Port;
    await h.em().getConnection().execute(`delete from document_templates where document_type = ?`, [FIXTURE_DOCUMENT_TYPE]);
  });

  afterAll(async () => {
    await h.em().getConnection().execute(`delete from document_templates where document_type = ?`, [FIXTURE_DOCUMENT_TYPE]);
    await teardownBackendServer(h);
  });

  it('is listed with its own palette: its block and the one core block it opts into', async () => {
    const types = (await h.app.inject({ method: 'GET', url: `${API}/types`, cookies: ADMIN })).json() as { data: { code: string; selection: string }[] };
    expect(types.data.find((t) => t.code === FIXTURE_DOCUMENT_TYPE)?.selection).toBe('per_document');
    const config = (await h.app.inject({ method: 'GET', url: `${API}/types/${FIXTURE_DOCUMENT_TYPE}/builder-config`, cookies: ADMIN })).json() as {
      data: { components: { name: string }[] };
    };
    expect(config.data.components.map((c) => c.name)).toEqual([FIXTURE_BLOCK, 'document_templates.Text']);
  });

  it('renders with its default, with a named template, and with the default when the named one is gone (FR-037, FR-039)', async () => {
    const def = await create('Default note', true);
    const chosen = await create('Chosen note', false);
    const base = { documentType: FIXTURE_DOCUMENT_TYPE, salesChannelId: null, language: 'en-US', data: { title: 'Q-1' } };

    const byDefault = await port.render(base);
    expect(byDefault).toMatchObject({ source: 'default', templateId: def, requestedTemplateMissing: false });
    expect(Buffer.from(byDefault.bytes.subarray(0, 5)).toString('ascii')).toBe('%PDF-');

    expect(await port.render({ ...base, templateId: chosen })).toMatchObject({ source: 'explicit', templateId: chosen });

    await h.app.inject({ method: 'DELETE', url: `${API}/${chosen}?expectedVersion=1`, cookies: ADMIN });
    expect(await port.render({ ...base, templateId: chosen })).toMatchObject({
      source: 'default',
      templateId: def,
      requestedTemplateMissing: true,
    });
  });

  it('disappears while its module is off, and its rows are kept (FR-051)', async () => {
    const before = await h.em().getConnection().execute(`select id from document_templates where document_type = ? order by id`, [FIXTURE_DOCUMENT_TYPE]);
    await withModuleOff('quote_requests', 'deactivated', async () => {
      const types = (await h.app.inject({ method: 'GET', url: `${API}/types`, cookies: ADMIN })).json() as { data: { code: string }[] };
      expect(types.data.map((t) => t.code)).not.toContain(FIXTURE_DOCUMENT_TYPE);
    });
    const after = await h.em().getConnection().execute(`select id from document_templates where document_type = ? order by id`, [FIXTURE_DOCUMENT_TYPE]);
    expect(after).toEqual(before);
    expect(before.length).toBeGreaterThan(0);
  });
});
