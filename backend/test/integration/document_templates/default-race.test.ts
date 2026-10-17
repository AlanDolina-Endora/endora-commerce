import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { FIXTURE_DOCUMENT_TYPE, registerFixtureDocumentType } from '../../fixtures/document-types/fixture-document-type.js';

/**
 * `specs/152-compare-pdf-template/` T051 — FR-005: concurrent *Set as default*
 * calls in one scope end with exactly one default, and neither is refused by
 * the unique index — the second waits for the first and replaces it.
 */

const ADMIN = { b2b_session: 'stub-admin-session' };
const API = '/api/v1/admin/document-templates';

describe('document templates — set-default race (spec 152)', () => {
  let h: BackendServerHandle;

  beforeAll(async () => {
    h = await setupBackendServer();
    registerFixtureDocumentType(h);
    await h.em().getConnection().execute(`delete from document_templates where document_type = ?`, [FIXTURE_DOCUMENT_TYPE]);
  });

  afterAll(async () => {
    await h.em().getConnection().execute(`delete from document_templates where document_type = ?`, [FIXTURE_DOCUMENT_TYPE]);
    await teardownBackendServer(h);
  });

  it('ends with exactly one default for concurrent set-default calls', async () => {
    const created = await Promise.all(
      [1, 2, 3, 4].map(async (n) => {
        const res = await h.app.inject({
          method: 'POST',
          url: API,
          cookies: ADMIN,
          payload: { documentType: FIXTURE_DOCUMENT_TYPE, name: `Race ${n}`, salesChannelId: null, source: { kind: 'built_in' } },
        });
        return (res.json() as { data: { id: string } }).data.id;
      }),
    );
    const results = await Promise.all(
      created.map((id) => h.app.inject({ method: 'POST', url: `${API}/${id}/set-default`, cookies: ADMIN, payload: { expectedVersion: 1 } })),
    );
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200, 200]);
    const rows = (await h.em().getConnection().execute(
      `select count(*)::int as n from document_templates where document_type = ? and is_default and sales_channel_id is null`,
      [FIXTURE_DOCUMENT_TYPE],
    )) as { n: number }[];
    expect(rows[0]!.n).toBe(1);
  });
});
