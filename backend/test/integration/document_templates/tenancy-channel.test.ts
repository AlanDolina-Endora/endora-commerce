import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { FIXTURE_DOCUMENT_TYPE, registerFixtureDocumentType } from '../../fixtures/document-types/fixture-document-type.js';

/**
 * `specs/152-compare-pdf-template/` T049 — channel scoping of templates
 * (Constitution XII, FR-031, FR-037, FR-038), over the real engine and
 * database: a channel's default is used for that channel only, the global
 * default for every other, an unresolved channel never selects a channel
 * template, and a template named for a document of channel A may not be
 * channel B's.
 */

const ADMIN = { b2b_session: 'stub-admin-session' };
const API = '/api/v1/admin/document-templates';

interface Engine {
  buildDefinition(input: Record<string, unknown>): Promise<{ definition: { content: { text?: string }[] }; source: string; templateId: string | null }>;
}

describe('document templates — channel scoping (spec 152)', () => {
  let h: BackendServerHandle;
  let engine: Engine;
  const A = randomUUID();
  const B = randomUUID();
  const ids: Record<string, string> = {};

  async function template(name: string, salesChannelId: string | null, setDefault: boolean): Promise<string> {
    const res = await h.app.inject({
      method: 'POST',
      url: API,
      cookies: ADMIN,
      payload: { documentType: FIXTURE_DOCUMENT_TYPE, name, salesChannelId, source: { kind: 'built_in' }, setDefault },
    });
    expect(res.statusCode).toBe(201);
    const { id, version } = (res.json() as { data: { id: string; version: number } }).data;
    const saved = await h.app.inject({
      method: 'PUT',
      url: `${API}/${id}/content/en-US`,
      cookies: ADMIN,
      payload: { expectedVersion: version, tree: { content: [{ type: 'quote_requests.FixtureNote', props: { caption: name } }] } },
    });
    expect(saved.statusCode).toBe(200);
    return id;
  }

  const render = (salesChannelId: string | null, templateId?: string) =>
    engine.buildDefinition({
      documentType: FIXTURE_DOCUMENT_TYPE,
      salesChannelId,
      language: 'en-US',
      data: { title: 'T' },
      ...(templateId ? { templateId } : {}),
    });
  const caption = async (p: ReturnType<typeof render>): Promise<string | undefined> =>
    (await p).definition.content[0]?.text?.split(':')[0];

  beforeAll(async () => {
    h = await setupBackendServer();
    registerFixtureDocumentType(h);
    engine = h.container.resolve('documentRenderer') as Engine;
    await h.em().getConnection().execute(
      `insert into sales_channels (id, code, name, default_language, default_currency, created_at, updated_at)
       values (?, ?, '{"en-US":"A"}'::jsonb, 'en-US', 'PLN', now(), now()), (?, ?, '{"en-US":"B"}'::jsonb, 'en-US', 'PLN', now(), now())`,
      [A, `dt-a-${A.slice(0, 6)}`, B, `dt-b-${B.slice(0, 6)}`],
    );
    ids['onlyB'] = await template('Only B', B, true);
  });

  afterAll(async () => {
    await h.em().getConnection().execute(`delete from document_templates where document_type = ?`, [FIXTURE_DOCUMENT_TYPE]);
    await h.em().getConnection().execute(`delete from sales_channels where id in (?, ?)`, [A, B]);
    await teardownBackendServer(h);
  });

  it('with only a channel-B default, a channel-A document gets the built-in layout', async () => {
    const built = await render(A);
    expect(built.source).toBe('built_in');
    expect(await caption(render(A))).toBe('Built-in note');
  });

  it('a global default serves A; B keeps its own; an unresolved channel never selects B', async () => {
    ids['global'] = await template('Global', null, true);
    expect(await caption(render(A))).toBe('Global');
    expect(await caption(render(B))).toBe('Only B');
    expect(await caption(render(null))).toBe('Global');
  });

  it("refuses channel B's template named for a channel-A document, and uses a global one (FR-038)", async () => {
    await expect(render(A, ids['onlyB'])).rejects.toMatchObject({ code: 'DOCUMENT_TEMPLATE_NOT_SELECTABLE' });
    const draft = await template('Pickable', null, false);
    const built = await render(A, draft);
    expect(built.source).toBe('explicit');
    expect(built.templateId).toBe(draft);
  });

  it('lists global ∪ one channel for a picker (applicableToChannel)', async () => {
    const res = await h.app.inject({ method: 'GET', url: `${API}?type=${FIXTURE_DOCUMENT_TYPE}&applicableToChannel=${A}`, cookies: ADMIN });
    const scopes = (res.json() as { data: { salesChannelId: string | null }[] }).data.map((t) => t.salesChannelId);
    expect(scopes.every((scope) => scope === null || scope === A)).toBe(true);
    expect(scopes).not.toContain(B);
  });
});
