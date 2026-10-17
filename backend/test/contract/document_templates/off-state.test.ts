import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Setting } from '@endora-commerce/platform/kernel';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { expectModuleAbsent } from '../../helpers/off-state.js';
import { registryCache } from '../../../src/kernel/lifecycle/registry-cache.js';
import { REGISTERED_MANIFESTS } from '../../../src/lifecycle/registered-manifests.js';
import { registerFixtureDocumentType, FIXTURE_DOCUMENT_TYPE } from '../../fixtures/document-types/fixture-document-type.js';

/**
 * `specs/152-compare-pdf-template/` T066 — the facility's off-state
 * (Constitution XVII, FR-050, owner answer N2):
 *
 *  - every one of its twelve routes refuses with `MODULE_DISABLED` while it is
 *    off, on both axes, and answers again after; it leaves the presence
 *    projection; its permission codes leave `/admin-roles`;
 *  - **while invoicing is on, the operator cannot switch it off** — the
 *    activation endpoint refuses, naming `invoices`, because every invoice PDF
 *    is produced by it; with invoicing off first, it switches off and back on;
 *  - templates are kept through all of it.
 *
 * The comparison PDF's fallback to its fixed layout is asserted in
 * `test/contract/comparisons/pdf-template-export.test.ts`; a switched-off host
 * hiding its type in `admin-api.test.ts`.
 */

const ADMIN = { b2b_session: 'stub-admin-session' };
const BASE = '/api/v1/admin/document-templates';
const ALL_IDS = REGISTERED_MANIFESTS.map((entry) => entry.manifest.id);
const ACTIVATION_CODES = ['document_templates.enabled', 'invoices.enabled'];

describe('document_templates off-state (spec 152)', () => {
  let h: BackendServerHandle;
  const id = randomUUID();

  beforeAll(async () => {
    h = await setupBackendServer();
    registerFixtureDocumentType(h);
    const res = await h.app.inject({
      method: 'POST',
      url: BASE,
      cookies: ADMIN,
      payload: { documentType: FIXTURE_DOCUMENT_TYPE, name: `Kept ${id.slice(0, 6)}`, salesChannelId: null, source: { kind: 'built_in' }, setDefault: true },
    });
    expect(res.statusCode).toBe(201);
  });

  afterEach(async () => {
    await h.em().nativeUpdate(Setting, { code: { $in: ACTIVATION_CODES } }, { globalValue: null });
    registryCache.__setEnabledForTesting(ALL_IDS);
  });

  afterAll(async () => {
    registryCache.__setEnabledForTesting(ALL_IDS);
    await teardownBackendServer(h);
  });

  const templateCount = async (): Promise<number> =>
    h.em().getConnection().execute(`select count(*)::int as n from document_templates`).then((rows) => (rows[0] as { n: number }).n);

  it('is absent from every surface while off, on both axes, and restored after', async () => {
    const before = await templateCount();
    const anyId = randomUUID();
    await expectModuleAbsent(h, 'document_templates', {
      routes: [
        { url: `${BASE}/types`, cookies: ADMIN },
        { url: `${BASE}/types/${FIXTURE_DOCUMENT_TYPE}`, cookies: ADMIN },
        { url: `${BASE}/types/${FIXTURE_DOCUMENT_TYPE}/builder-config`, cookies: ADMIN },
        { url: `${BASE}?type=${FIXTURE_DOCUMENT_TYPE}`, cookies: ADMIN },
        { url: `${BASE}/${anyId}`, cookies: ADMIN },
        { method: 'POST', url: BASE, cookies: ADMIN, payload: {} },
        { method: 'PATCH', url: `${BASE}/${anyId}`, cookies: ADMIN, payload: {} },
        { method: 'PUT', url: `${BASE}/${anyId}/content/en-US`, cookies: ADMIN, payload: {} },
        { method: 'POST', url: `${BASE}/${anyId}/set-default`, cookies: ADMIN, payload: {} },
        { method: 'POST', url: `${BASE}/${anyId}/clear-default`, cookies: ADMIN, payload: {} },
        { method: 'DELETE', url: `${BASE}/${anyId}`, cookies: ADMIN },
        { method: 'POST', url: `${BASE}/preview`, cookies: ADMIN, payload: {} },
      ],
      adminPresence: { cookies: ADMIN },
    });
    expect(await templateCount()).toBe(before);
  });

  async function flip(moduleId: string, active: boolean) {
    return h.app.inject({ method: 'POST', url: `/api/v1/admin/modules/${moduleId}/activation`, cookies: ADMIN, payload: { active } });
  }

  it('refuses to be switched off while invoicing is on, naming invoices (N2)', async () => {
    const res = await flip('document_templates', false);
    expect(res.statusCode).toBe(409);
    expect(JSON.stringify(res.json())).toContain('invoices');
  });

  it('switches off once invoicing is off, keeps every template, and comes back unchanged (FR-050, SC-006)', async () => {
    const before = await h.em().getConnection().execute(`select id, version, is_default, content from document_templates order by id`);
    expect((await flip('invoices', false)).statusCode).toBe(200);
    expect((await flip('document_templates', false)).statusCode).toBe(200);
    const off = await h.app.inject({ method: 'GET', url: `${BASE}/types`, cookies: ADMIN });
    expect(off.statusCode).toBe(503);
    expect((await flip('document_templates', true)).statusCode).toBe(200);
    expect((await flip('invoices', true)).statusCode).toBe(200);
    expect((await h.app.inject({ method: 'GET', url: `${BASE}/types`, cookies: ADMIN })).statusCode).toBe(200);
    const after = await h.em().getConnection().execute(`select id, version, is_default, content from document_templates order by id`);
    expect(after).toEqual(before);
  });
});
