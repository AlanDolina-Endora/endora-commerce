import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { AdminRole } from '../../helpers/package-entities.js';

/**
 * `specs/152-compare-pdf-template/` T057 (owner answers N3, P2) — on a
 * composed platform the one-time grant has run at boot: it recorded itself in
 * `invoices`' hidden setting, and no role that can read invoices is left
 * without `document_templates:read`. The grant's own rules (once, idempotent,
 * wildcard roles untouched, no write on failure) are the module's unit test.
 */
describe('invoices — the one-time document template access grant (spec 152)', () => {
  let h: BackendServerHandle;

  beforeAll(async () => {
    h = await setupBackendServer();
  });

  afterAll(async () => {
    await teardownBackendServer(h);
  });

  it('ran at boot and recorded itself', async () => {
    const done = await h.settings.settingsService.get('invoices.document_templates_grant_done', null, z.boolean());
    expect(done).toBe(true);
  });

  it('left no invoice reader without the document template read code', async () => {
    const roles = await h.em().find(AdminRole, {});
    const missing = roles.filter(
      (role) =>
        !role.permissions.includes('*') &&
        (role.permissions.includes('invoices:read') || role.permissions.includes('invoices:write')) &&
        !role.permissions.includes('document_templates:read'),
    );
    expect(missing.map((role) => role.code)).toEqual([]);
  });
});
