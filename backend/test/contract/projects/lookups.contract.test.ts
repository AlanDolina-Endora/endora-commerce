import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ProjectAdminUserLookupResponseSchema,
  ProjectOrganizationLookupResponseSchema,
  ProjectVisibilitySettingResponseSchema,
} from '@endora-commerce/contracts';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { seedCrmAdmin, seedCrmOrganization, seedCrmSalesRep } from '../../helpers/seed-crm.js';
import { PROJECTS_ADMIN, callProjects } from '../../integration/projects/helpers.js';

/**
 * What the Projects screens' pickers choose from — Organizations and
 * administrators — and the module visibility setting the visibility control
 * explains (`specs/163-projects-and-tasks/contracts/admin-api.md` §2.1a).
 *
 * The kit's pickers read `/organizations` and `/admin-users`, each behind its
 * owner's code; a role holding only `projects:*` got empty pickers. These are
 * the module's own, gated by its own codes, modelled on `/crm/lookups/*`:
 * Organizations only within the caller's reach, administrators only active.
 */
describe('projects (contract) — lookups for the pickers', () => {
  let h: BackendServerHandle;
  let orgA: string;
  let orgB: string;
  let writer: { cookies: { b2b_session: string }; adminUserId: string; undo: () => void };
  let reader: { cookies: { b2b_session: string }; adminUserId: string; undo: () => void };
  let rep: { cookies: { b2b_session: string }; adminUserId: string; undo: () => void };
  let inactiveId: string;
  const token = `lk${randomUUID().slice(0, 6)}`;

  beforeAll(async () => {
    h = await setupBackendServer();
    orgA = await seedCrmOrganization(h.em(), `${token} Alpha`);
    orgB = await seedCrmOrganization(h.em(), `${token} Beta`);
    // Only Projects' codes — no `organizations:*`, no `admin_users:*`.
    writer = await seedCrmAdmin(h.em(), `${token}-writer`, ['projects:read', 'projects:write']);
    reader = await seedCrmAdmin(h.em(), `${token}-reader`, ['projects:read']);
    rep = await seedCrmSalesRep(h.em(), [orgA], ['projects:read', 'projects:write']);
    const inactive = await seedCrmAdmin(h.em(), `${token}-gone`, ['projects:read']);
    inactive.undo();
    inactiveId = inactive.adminUserId;
    await h.em().getConnection().execute(`update "admin_users" set "status" = 'inactive' where "id" = ?`, [inactiveId]);
  });

  afterAll(async () => {
    writer?.undo();
    reader?.undo();
    rep?.undo();
    await teardownBackendServer(h);
  });

  describe('GET /projects/lookups/organizations', () => {
    it('401 without a session, 403 to a reader without projects:write', async () => {
      expect((await callProjects(h, 'GET', '/lookups/organizations', { cookies: null })).statusCode).toBe(401);
      const forbidden = await callProjects(h, 'GET', '/lookups/organizations', { cookies: reader.cookies });
      expect(forbidden.statusCode, forbidden.body).toBe(403);
    });

    it('answers a projects:write holder by name, without any Organizations permission', async () => {
      const response = await callProjects(h, 'GET', `/lookups/organizations?q=${token}`, { cookies: writer.cookies });
      expect(response.statusCode, response.body).toBe(200);
      const { data } = ProjectOrganizationLookupResponseSchema.parse(response.json());
      expect(data.map((o) => o.id).sort()).toEqual([orgA, orgB].sort());
      const one = await callProjects(h, 'GET', `/lookups/organizations?q=${token}%20alp`, { cookies: writer.cookies });
      expect(ProjectOrganizationLookupResponseSchema.parse(one.json()).data.map((o) => o.id)).toEqual([orgA]);
    });

    it('a confined administrator is offered, and labelled, only the Organizations they reach', async () => {
      const response = await callProjects(h, 'GET', `/lookups/organizations?q=${token}`, { cookies: rep.cookies });
      expect(response.statusCode, response.body).toBe(200);
      expect(ProjectOrganizationLookupResponseSchema.parse(response.json()).data.map((o) => o.id)).toEqual([orgA]);
      const outOfReach = await callProjects(h, 'GET', `/lookups/organizations?id=${orgB}`, { cookies: rep.cookies });
      expect(ProjectOrganizationLookupResponseSchema.parse(outOfReach.json()).data).toEqual([]);
      const inReach = await callProjects(h, 'GET', `/lookups/organizations?id=${orgA}`, { cookies: rep.cookies });
      expect(ProjectOrganizationLookupResponseSchema.parse(inReach.json()).data.map((o) => o.id)).toEqual([orgA]);
    });

    it('refuses a malformed query — 400', async () => {
      const response = await callProjects(h, 'GET', '/lookups/organizations?limit=500', { cookies: writer.cookies });
      expect(response.statusCode, response.body).toBe(400);
    });
  });

  describe('GET /projects/lookups/admin-users', () => {
    it('401 without a session, 403 to a reader without projects:write', async () => {
      expect((await callProjects(h, 'GET', '/lookups/admin-users', { cookies: null })).statusCode).toBe(401);
      const forbidden = await callProjects(h, 'GET', '/lookups/admin-users', { cookies: reader.cookies });
      expect(forbidden.statusCode, forbidden.body).toBe(403);
    });

    it('answers active administrators by name or e-mail, without any administrators permission', async () => {
      const response = await callProjects(h, 'GET', `/lookups/admin-users?q=${token}`, { cookies: writer.cookies });
      expect(response.statusCode, response.body).toBe(200);
      const { data } = ProjectAdminUserLookupResponseSchema.parse(response.json());
      const ids = data.map((a) => a.id);
      expect(ids).toEqual(expect.arrayContaining([writer.adminUserId, reader.adminUserId]));
      expect(ids).not.toContain(inactiveId);
      const writerRow = data.find((a) => a.id === writer.adminUserId)!;
      expect(writerRow.email).toContain(`${token}-writer`);
      expect(writerRow.name).toContain(`${token}-writer`);
    });

    it('one administrator by id — the label of a value chosen earlier', async () => {
      const response = await callProjects(h, 'GET', `/lookups/admin-users?id=${reader.adminUserId}`, {
        cookies: writer.cookies,
      });
      expect(ProjectAdminUserLookupResponseSchema.parse(response.json()).data.map((a) => a.id)).toEqual([
        reader.adminUserId,
      ]);
      const none = await callProjects(h, 'GET', `/lookups/admin-users?id=${randomUUID()}`, { cookies: writer.cookies });
      expect(ProjectAdminUserLookupResponseSchema.parse(none.json()).data).toEqual([]);
    });

    it('caps the answer at `limit`', async () => {
      const response = await callProjects(h, 'GET', `/lookups/admin-users?q=${token}&limit=1`, { cookies: writer.cookies });
      expect(ProjectAdminUserLookupResponseSchema.parse(response.json()).data).toHaveLength(1);
    });
  });

  describe('GET /projects/visibility-setting', () => {
    it('401 without a session; any projects:read holder reads the setting as it stands', async () => {
      expect((await callProjects(h, 'GET', '/visibility-setting', { cookies: null })).statusCode).toBe(401);
      const fresh = await callProjects(h, 'GET', '/visibility-setting', { cookies: reader.cookies });
      expect(fresh.statusCode, fresh.body).toBe(200);
      expect(ProjectVisibilitySettingResponseSchema.parse(fresh.json()).data).toEqual({ setting: 'members' });

      const write = await h.app.inject({
        method: 'PUT',
        url: '/api/v1/admin/settings/projects.visibility/value',
        cookies: PROJECTS_ADMIN,
        payload: { scope: 'all', value: 'everyone' },
      });
      expect(write.statusCode, write.body).toBeLessThan(400);
      const changed = await callProjects(h, 'GET', '/visibility-setting', { cookies: reader.cookies });
      expect(ProjectVisibilitySettingResponseSchema.parse(changed.json()).data).toEqual({ setting: 'everyone' });
    });

    it('403 without projects:read', async () => {
      const nobody = await seedCrmAdmin(h.em(), `${token}-nobody`, ['crm:read']);
      try {
        const response = await callProjects(h, 'GET', '/visibility-setting', { cookies: nobody.cookies });
        expect(response.statusCode, response.body).toBe(403);
      } finally {
        nobody.undo();
      }
    });
  });
});
