import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { QUOTE_REQUEST_DOCUMENT_TYPE as DOCUMENT_TYPE } from '@endora-commerce/contracts';

/**
 * `specs/152-compare-pdf-template/` T049 — channel scoping of templates
 * (Constitution XII, FR-031, FR-037, FR-038), over the real engine and
 * database: a channel's default is used for that channel only, the global
 * default for every other, an unresolved channel never selects a channel
 * template, and a template named for a document of channel A may not be
 * channel B's.
 *
 * Over the real *Quote request* type (`specs/153-quote-request-pdf-template/`
 * research R-24), which replaced the test-only stand-in this suite used.
 */

const ADMIN = { b2b_session: 'stub-admin-session' };
const API = '/api/v1/admin/document-templates';

interface Engine {
  buildDefinition(input: Record<string, unknown>): Promise<{
    definition: { content: { text?: string; stack?: { text?: string }[] }[] };
    source: string;
    templateId: string | null;
  }>;
}

describe('document templates — channel scoping (spec 152)', () => {
  let h: BackendServerHandle;
  let engine: Engine;
  let sample: unknown;
  const A = randomUUID();
  const B = randomUUID();
  const ids: Record<string, string> = {};

  async function template(name: string, salesChannelId: string | null, setDefault: boolean): Promise<string> {
    const res = await h.app.inject({
      method: 'POST',
      url: API,
      cookies: ADMIN,
      payload: { documentType: DOCUMENT_TYPE, name, salesChannelId, source: { kind: 'built_in' }, setDefault },
    });
    expect(res.statusCode).toBe(201);
    const { id, version } = (res.json() as { data: { id: string; version: number } }).data;
    const saved = await h.app.inject({
      method: 'PUT',
      url: `${API}/${id}/content/en-US`,
      cookies: ADMIN,
      payload: { expectedVersion: version, tree: { content: [{ type: 'quote_requests.QuoteNotes', props: { label: name } }] } },
    });
    expect(saved.statusCode).toBe(200);
    return id;
  }

  const render = (salesChannelId: string | null, templateId?: string) =>
    engine.buildDefinition({
      documentType: DOCUMENT_TYPE,
      salesChannelId,
      language: 'en-US',
      data: sample,
      ...(templateId ? { templateId } : {}),
    });
  /** The first block's first line: the notes' label of a saved template, the header's title of the built-in one. */
  const caption = async (p: ReturnType<typeof render>): Promise<string | undefined> => {
    const first = (await p).definition.content[0];
    return first?.stack?.[0]?.text ?? first?.text;
  };

  beforeAll(async () => {
    h = await setupBackendServer();
    engine = h.container.resolve('documentRenderer') as Engine;
    sample = (h.container.resolve('documentTypeRegistry') as { get(code: string): { sampleData(language: string): unknown } })
      .get(DOCUMENT_TYPE)
      .sampleData('en-US');
    await h.em().getConnection().execute(`delete from document_templates where document_type = ?`, [DOCUMENT_TYPE]);
    await h.em().getConnection().execute(
      `insert into sales_channels (id, code, name, default_language, default_currency, created_at, updated_at)
       values (?, ?, '{"en-US":"A"}'::jsonb, 'en-US', 'PLN', now(), now()), (?, ?, '{"en-US":"B"}'::jsonb, 'en-US', 'PLN', now(), now())`,
      [A, `dt-a-${A.slice(0, 6)}`, B, `dt-b-${B.slice(0, 6)}`],
    );
    ids['onlyB'] = await template('Only B', B, true);
  });

  afterAll(async () => {
    await h.em().getConnection().execute(`delete from document_templates where document_type = ?`, [DOCUMENT_TYPE]);
    await h.em().getConnection().execute(`delete from sales_channels where id in (?, ?)`, [A, B]);
    await teardownBackendServer(h);
  });

  it('with only a channel-B default, a channel-A document gets the built-in layout', async () => {
    const built = await render(A);
    expect(built.source).toBe('built_in');
    expect(await caption(render(A))).toBe('Quote');
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
    const res = await h.app.inject({ method: 'GET', url: `${API}?type=${DOCUMENT_TYPE}&applicableToChannel=${A}`, cookies: ADMIN });
    const scopes = (res.json() as { data: { salesChannelId: string | null }[] }).data.map((t) => t.salesChannelId);
    expect(scopes.every((scope) => scope === null || scope === A)).toBe(true);
    expect(scopes).not.toContain(B);
  });
});
