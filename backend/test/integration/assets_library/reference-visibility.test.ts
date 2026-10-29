import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@endora-commerce/contracts';
import { setupBackendServer, teardownBackendServer, type BackendServerHandle } from '../../helpers/test-server.js';
import { OTHER_TEST_ORGANIZATION_ID, TEST_ADMIN_ID, TEST_ORGANIZATION_ID } from '../../helpers/test-actors.js';
import {
  createCrmOpportunity,
  removeCrmAssets,
  seedCrmAdmin,
  seedCrmAsset,
  seedCrmSalesRep,
} from '../../helpers/seed-crm.js';
import { multipartBody, TINY_PNG, useTemporaryAssetStore } from '../../helpers/crm-attachment-upload.js';
import { deleteProjects } from '../projects/helpers.js';

/**
 * Asset visibility follows the records that reference it
 * (`specs/166-asset-reference-visibility/`, quickstart §1, research R-5, R-7,
 * R-9, R-11; `contracts/admin-api.md` §1).
 *
 * **The reader matrix** (quickstart.md), built here and nowhere else:
 * - **A** — every Tasks, Projects, CRM and library permission; creates the
 *   private Task and the draft, is a Member of Project P1, reaches every
 *   Organization (O1 included);
 * - **B** — reads and writes Tasks, Projects, CRM and the library, without
 *   `tasks:see_private` or `projects:see_all`, not a Member of P1, confined
 *   to Organization O2;
 * - **S** — B's permissions plus `tasks:see_private` (reaching every
 *   Organization: S is the subject of the private-Task row only);
 * - **W** — the Platform administrator (`*`): the **control**, never the subject;
 * - **N** — `assets.read` / `assets.write` only.
 *
 * Every file lives in the library's root folder, which is where attachments
 * land; the hidden ones are attached straight in SQL so the fixture does not
 * depend on the owners' attach rules this feature also changes.
 */
describe('assets library — reference visibility (feature 166)', () => {
  let h: BackendServerHandle;
  type Person = { cookies: { b2b_session: string }; adminUserId: string; undo: () => void };
  let A: Person;
  let B: Person;
  let S: Person;
  let N: Person;
  const W = { b2b_session: 'stub-admin-session' };
  let store: Awaited<ReturnType<typeof useTemporaryAssetStore>>;

  const run = randomUUID().slice(0, 8);
  const projectP1 = randomUUID();
  const tasks = {
    private: randomUUID(),
    draft: randomUUID(),
    inProject: randomUUID(),
    open: randomUUID(),
  };
  let opportunityO1: string;

  /** The restricted kinds of quickstart §1, US1 row: one file each, plus the extras the list cases need. */
  const files = {} as Record<
    | 'privateTask'
    | 'draftTask'
    | 'projectTask'
    | 'project'
    | 'opportunity'
    | 'deletedHidden'
    | 'imageHidden'
    | 'unused'
    | 'imageUnused'
    | 'openTask',
    string
  >;
  const assetIds: string[] = [];

  type Kind = 'privateTask' | 'draftTask' | 'projectTask' | 'project' | 'opportunity';
  const KINDS: readonly Kind[] = ['privateTask', 'draftTask', 'projectTask', 'project', 'opportunity'];

  /** Which restricted readers may not see each kind — the subjects of the not-found rows. */
  const hiddenFrom = (): Record<Kind, Array<[string, Person]>> => ({
    privateTask: [['B', B], ['N', N]],
    draftTask: [['B', B], ['S', S], ['N', N]],
    projectTask: [['B', B], ['S', S], ['N', N]],
    project: [['B', B], ['S', S], ['N', N]],
    opportunity: [['B', B], ['N', N]],
  });

  const inject = (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    cookies: Record<string, string>,
    payload?: unknown,
    headers?: Record<string, string>,
  ): Promise<LightMyRequestResponse> =>
    h.app.inject({
      method,
      url,
      cookies,
      ...(headers ? { headers } : {}),
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });

  /** Every page of `GET /assets` for a query; asserts every page but the last is full. */
  async function listAll(
    cookies: Record<string, string>,
    query: Record<string, string>,
    limit: number,
  ): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 200; page += 1) {
      const params = new URLSearchParams({ ...query, limit: String(limit), ...(cursor ? { cursor } : {}) });
      const response = await inject('GET', `/api/v1/admin/assets?${params.toString()}`, cookies);
      expect(response.statusCode, response.body).toBe(200);
      const body = response.json() as { data: Array<{ id: string }>; nextCursor: string | null };
      if (body.nextCursor !== null) {
        expect(body.data, 'a page followed by another is full').toHaveLength(limit);
      }
      ids.push(...body.data.map((row) => row.id));
      cursor = body.nextCursor;
      if (cursor === null) return ids;
    }
    throw new Error('listAll: more than 200 pages');
  }

  /** What W sees, minus what the reader may not: the expected list, order kept. */
  const without = (ids: readonly string[], hidden: readonly string[]) => ids.filter((id) => !hidden.includes(id));

  async function insertTask(
    id: string,
    row: { draft?: boolean; private?: boolean; projectId?: string; createdBy: string },
  ): Promise<void> {
    await h.em().getConnection().execute(
      `insert into "tasks" ("id", "number", "title", "created_by_admin_user_id", "is_draft", "is_private", "context_type", "context_id")
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        `T-RV-${id.slice(0, 8)}`,
        `RV ${id.slice(0, 8)}`,
        row.createdBy,
        row.draft ?? false,
        row.private ?? false,
        row.projectId ? 'project' : null,
        row.projectId ?? null,
      ],
    );
  }

  async function insertMembersOnlyProject(id: string): Promise<void> {
    const stageId = randomUUID();
    const connection = h.orm.em.getConnection();
    await connection.transactional(async (trx) => {
      await connection.execute(
        `insert into "projects" ("id", "number", "title", "visibility", "created_by_admin_user_id")
         values (?, ?, ?, 'members_and_listed', ?)`,
        [id, `PRJ-RV${id.slice(0, 8)}`, `RV ${id.slice(0, 8)}`, TEST_ADMIN_ID],
        'run',
        trx,
      );
      await connection.execute(
        `insert into "project_stages" ("id", "project_id", "name", "color", "position") values (?, ?, 'Design', '#3b82f6', 1)`,
        [stageId, id],
        'run',
        trx,
      );
      await connection.execute(`update "projects" set "current_stage_id" = ? where "id" = ?`, [stageId, id], 'run', trx);
    });
  }

  async function file(
    key: keyof typeof files,
    overrides: Parameters<typeof seedCrmAsset>[1] = {},
  ): Promise<string> {
    const seeded = await seedCrmAsset(h.em(), { filename: `rv-${run}-${key}.pdf`, ...overrides });
    files[key] = seeded.id;
    assetIds.push(seeded.id);
    return seeded.id;
  }

  beforeAll(async () => {
    h = await setupBackendServer();
    store = await useTemporaryAssetStore(h);
    const B_PERMISSIONS = [
      'tasks:read',
      'tasks:write',
      'projects:read',
      'projects:write',
      'crm:read',
      'crm:write',
      'assets.read',
      'assets.write',
    ];
    A = await seedCrmAdmin(h.em(), 'rv-a', [...B_PERMISSIONS, 'tasks:see_private']);
    B = await seedCrmSalesRep(h.em(), [OTHER_TEST_ORGANIZATION_ID], B_PERMISSIONS);
    S = await seedCrmAdmin(h.em(), 'rv-s', [...B_PERMISSIONS, 'tasks:see_private']);
    N = await seedCrmAdmin(h.em(), 'rv-n', ['assets.read', 'assets.write']);

    await insertMembersOnlyProject(projectP1);
    const conn = h.em().getConnection();
    await conn.execute(`insert into "project_members" ("project_id", "admin_user_id") values (?, ?)`, [
      projectP1,
      A.adminUserId,
    ]);
    await insertTask(tasks.private, { private: true, createdBy: A.adminUserId });
    await insertTask(tasks.draft, { draft: true, createdBy: A.adminUserId });
    await insertTask(tasks.inProject, { projectId: projectP1, createdBy: A.adminUserId });
    await insertTask(tasks.open, { createdBy: A.adminUserId });
    opportunityO1 = (await createCrmOpportunity(h, { organizationId: TEST_ORGANIZATION_ID })).id;

    // Oldest first, so the newest-first list interleaves hidden and visible rows.
    await file('unused');
    await file('privateTask');
    await file('openTask');
    await file('draftTask');
    await file('imageUnused', { filename: `rv-${run}-imageUnused.png`, mimeType: 'image/png' });
    await file('projectTask');
    await file('imageHidden', { filename: `rv-${run}-imageHidden.png`, mimeType: 'image/png' });
    await file('project');
    await file('opportunity');
    await file('deletedHidden');
    await conn.execute(`update "assets" set "deleted_at" = now() where "id" = ?`, [files.deletedHidden]);

    const attachToTask = (taskId: string, assetId: string) =>
      conn.execute(`insert into "task_attachments" ("task_id", "asset_id", "added_by_admin_user_id") values (?, ?, ?)`, [
        taskId,
        assetId,
        A.adminUserId,
      ]);
    await attachToTask(tasks.private, files.privateTask);
    await attachToTask(tasks.private, files.imageHidden);
    await attachToTask(tasks.private, files.deletedHidden);
    await attachToTask(tasks.draft, files.draftTask);
    await attachToTask(tasks.inProject, files.projectTask);
    await attachToTask(tasks.open, files.openTask);
    await conn.execute(
      `insert into "project_attachments" ("project_id", "asset_id", "added_by_admin_user_id") values (?, ?, ?)`,
      [projectP1, files.project, A.adminUserId],
    );
    await conn.execute(
      `insert into "crm_opportunity_attachments" ("id", "opportunity_id", "asset_id", "file_name", "uploaded_by_admin_user_id", "created_at")
       values (?, ?, ?, ?, ?, now())`,
      [randomUUID(), opportunityO1, files.opportunity, `rv-${run}-opportunity.pdf`, A.adminUserId],
    );
  });

  afterAll(async () => {
    const conn = h.em().getConnection();
    await conn.execute(`delete from "tasks" where "id" = any(?::uuid[])`, [`{${Object.values(tasks).join(',')}}`]);
    await deleteProjects(h, [projectP1]);
    await removeCrmAssets(h.em(), assetIds);
    for (const person of [A, B, S, N]) person?.undo();
    await store.undo();
    await teardownBackendServer(h);
  });

  describe('US1 — files of records I cannot see stay hidden in the library', () => {
    /** Restricted files each reader may not see, the soft-deleted one included. */
    const hiddenListFor = (who: 'A' | 'B' | 'S' | 'N'): string[] => {
      switch (who) {
        case 'A':
          return [];
        case 'S':
          return [files.draftTask, files.projectTask, files.project];
        case 'B':
          return [
            files.privateTask,
            files.imageHidden,
            files.deletedHidden,
            files.draftTask,
            files.projectTask,
            files.project,
            files.opportunity,
          ];
        case 'N':
          return [
            files.privateTask,
            files.imageHidden,
            files.deletedHidden,
            files.draftTask,
            files.projectTask,
            files.project,
            files.opportunity,
            files.openTask,
          ];
      }
    };
    const reader = (who: 'A' | 'B' | 'S' | 'N'): Person => ({ A, B, S, N })[who];

    it('the control: W lists every seeded file in the root folder', async () => {
      const all = await listAll(W, {}, 100);
      for (const id of Object.values(files).filter((id) => id !== files.deletedHidden)) {
        expect(all).toContain(id);
      }
      expect(all).not.toContain(files.deletedHidden);
      expect(await listAll(W, { includeDeleted: 'true' }, 100)).toContain(files.deletedHidden);
    });

    it.each(['A', 'B', 'S', 'N'] as const)(
      'GET /assets, root folder: %s gets W’s list minus their hidden files, in full pages',
      async (who) => {
        const expected = without(await listAll(W, {}, 100), hiddenListFor(who));
        expect(await listAll(reader(who).cookies, {}, 2)).toEqual(expected);
        expect(await listAll(reader(who).cookies, {}, 3)).toEqual(expected);
      },
    );

    it.each(['B', 'S', 'N'] as const)('GET /assets?q=<name>: %s does not find a hidden file by its name', async (who) => {
      const expected = without(await listAll(W, { q: `rv-${run}` }, 100), hiddenListFor(who));
      expect(await listAll(reader(who).cookies, { q: `rv-${run}` }, 2)).toEqual(expected);
      for (const hidden of hiddenListFor(who)) {
        const key = (Object.keys(files) as Array<keyof typeof files>).find((k) => files[k] === hidden)!;
        expect(await listAll(reader(who).cookies, { q: `rv-${run}-${key}` }, 10)).toEqual([]);
      }
    });

    it.each(['B', 'N'] as const)('GET /assets?includeDeleted=true: %s does not see a hidden file, deleted or not', async (who) => {
      const expected = without(await listAll(W, { includeDeleted: 'true' }, 100), hiddenListFor(who));
      expect(expected).not.toContain(files.deletedHidden);
      expect(await listAll(reader(who).cookies, { includeDeleted: 'true' }, 2)).toEqual(expected);
    });

    it('the picker’s query (root, mime=image/, limit 24): B is offered the visible image only', async () => {
      const picker = { mime: 'image/' };
      const forW = await listAll(W, picker, 24);
      expect(forW).toEqual(expect.arrayContaining([files.imageHidden, files.imageUnused]));
      const forB = await listAll(B.cookies, picker, 24);
      expect(forB).toEqual(without(forW, [files.imageHidden]));
      expect(forB).toContain(files.imageUnused);
    });

    /** `contracts/admin-api.md` §1 rows 2–5, 7–11, 13: every by-id route. */
    const BY_ID_ROUTES: ReadonlyArray<{
      row: number;
      name: string;
      send: (id: string, cookies: Record<string, string>) => Promise<LightMyRequestResponse>;
    }> = [
      {
        row: 2,
        name: 'POST /assets/:id/replace',
        send: (id, cookies) => {
          const { body, contentType } = multipartBody([
            { name: 'file', filename: 'replacement.png', mime: 'image/png', value: TINY_PNG },
          ]);
          return inject('POST', `/api/v1/admin/assets/${id}/replace`, cookies, body, { 'content-type': contentType });
        },
      },
      {
        row: 3,
        name: 'POST /assets/:id/previous-version/restore',
        send: (id, cookies) =>
          inject('POST', `/api/v1/admin/assets/${id}/previous-version/restore`, cookies, {
            expectedContentVersion: 'v1',
            expectedPreviousContentVersion: 'v0',
          }),
      },
      {
        row: 4,
        name: 'PUT /assets/:id/permalink',
        send: (id, cookies) =>
          inject('PUT', `/api/v1/admin/assets/${id}/permalink`, cookies, { permalink: `rv-${run}/by-id.pdf` }),
      },
      { row: 5, name: 'DELETE /assets/:id/permalink', send: (id, cookies) => inject('DELETE', `/api/v1/admin/assets/${id}/permalink`, cookies) },
      { row: 7, name: 'GET /assets/:id', send: (id, cookies) => inject('GET', `/api/v1/admin/assets/${id}`, cookies) },
      { row: 8, name: 'GET /assets/:id/url', send: (id, cookies) => inject('GET', `/api/v1/admin/assets/${id}/url`, cookies) },
      { row: 9, name: 'DELETE /assets/:id', send: (id, cookies) => inject('DELETE', `/api/v1/admin/assets/${id}`, cookies) },
      { row: 10, name: 'POST /assets/:id/restore', send: (id, cookies) => inject('POST', `/api/v1/admin/assets/${id}/restore`, cookies) },
      {
        row: 11,
        name: 'POST /assets/:id/move',
        send: (id, cookies) => inject('POST', `/api/v1/admin/assets/${id}/move`, cookies, { folderId: null }),
      },
      {
        row: 13,
        name: 'PATCH /assets/:id',
        send: (id, cookies) => inject('PATCH', `/api/v1/admin/assets/${id}`, cookies, { label: 'renamed' }),
      },
    ];

    /** The answer with the asked id and the request id taken out: what must be equal byte for byte. */
    function normalised(response: LightMyRequestResponse, id: string): unknown {
      const body = JSON.parse(response.body.split(id).join('<id>')) as { error?: Record<string, unknown> };
      if (body.error) delete body.error.requestId;
      return { status: response.statusCode, body };
    }

    it.each(KINDS)('every by-id route answers a hidden %s file exactly as a random uuid', async (kind) => {
      for (const [who, person] of hiddenFrom()[kind]) {
        for (const route of BY_ID_ROUTES) {
          const missing = randomUUID();
          const hidden = await route.send(files[kind], person.cookies);
          const none = await route.send(missing, person.cookies);
          const label = `${who} · row ${route.row} ${route.name}`;
          expect(none.statusCode, `${label} (random uuid): ${none.body}`).toBe(404);
          expect(none.json().error.code, label).toBe(ERROR_CODES.ASSET_NOT_FOUND);
          expect(normalised(hidden, files[kind]), label).toEqual(normalised(none, missing));
        }
      }
    });

    it('replacing a hidden file stages no bytes', async () => {
      const before = await storedFiles(store.baseDir);
      const cleanupsBefore = await cleanupCount();
      const { body, contentType } = multipartBody([
        { name: 'file', filename: 'replacement.png', mime: 'image/png', value: TINY_PNG },
      ]);
      const response = await inject('POST', `/api/v1/admin/assets/${files.privateTask}/replace`, B.cookies, body, {
        'content-type': contentType,
      });
      expect(response.statusCode, response.body).toBe(404);
      expect(await storedFiles(store.baseDir)).toEqual(before);
      expect(await cleanupCount()).toBe(cleanupsBefore);
    });

    it('move-many skips a hidden id exactly like a missing one — not moved, not counted, not audited', async () => {
      const created = await inject('POST', '/api/v1/admin/assets/folders', W, { name: `rv-${run}-target`, parentId: null });
      expect(created.statusCode, created.body).toBe(201);
      const folderId = (created.json() as { data: { id: string } }).data.id;

      const moved = await inject('POST', '/api/v1/admin/assets/move-many', B.cookies, {
        assetIds: [files.privateTask, files.unused, randomUUID()],
        folderId,
      });
      expect(moved.statusCode, moved.body).toBe(200);
      expect(moved.json()).toEqual({ data: { movedCount: 1 } });
      const rows = await h
        .em()
        .getConnection()
        .execute<Array<{ id: string; folder_id: string | null }>>(
          `select id::text as id, folder_id::text as folder_id from assets where id in (?, ?)`,
          [files.privateTask, files.unused],
        );
      expect(Object.fromEntries(rows.map((r) => [r.id, r.folder_id]))).toEqual({
        [files.privateTask]: null,
        [files.unused]: folderId,
      });
      const audit = await h.auditLogService.query({ action: 'asset.move_many', objectId: folderId });
      expect(audit).toHaveLength(1);
      expect(audit[0]?.stateAfter).toMatchObject({ folderId, assetIds: [files.unused] });

      // The control: W moves the same three and only the hidden one more.
      const back = await inject('POST', '/api/v1/admin/assets/move-many', W, { assetIds: [files.unused], folderId: null });
      expect(back.json()).toEqual({ data: { movedCount: 1 } });
    });

    it('a permalink conflict does not name a hidden holder — details.assetId is null for B, the holder for W', async () => {
      const permalink = `rv-${run}/held.pdf`;
      await h.em().getConnection().execute(`update "assets" set "permalink" = ? where "id" = ?`, [permalink, files.privateTask]);
      try {
        const forB = await inject('PUT', `/api/v1/admin/assets/${files.unused}/permalink`, B.cookies, { permalink });
        expect(forB.statusCode, forB.body).toBe(409);
        expect(forB.json().error.code).toBe(ERROR_CODES.ASSET_PERMALINK_TAKEN);
        expect(forB.json().error.details).toEqual({ permalink, assetId: null });

        const forW = await inject('PUT', `/api/v1/admin/assets/${files.unused}/permalink`, W, { permalink });
        expect(forW.statusCode, forW.body).toBe(409);
        expect(forW.json().error.details).toEqual({ permalink, assetId: files.privateTask });
        expect(forW.json().error.message).toBe(forB.json().error.message);

        // A holder the caller may see is still named.
        const forA = await inject('PUT', `/api/v1/admin/assets/${files.unused}/permalink`, A.cookies, { permalink });
        expect(forA.json().error.details).toEqual({ permalink, assetId: files.privateTask });
      } finally {
        await h.em().getConnection().execute(`update "assets" set "permalink" = null where "id" = ?`, [files.privateTask]);
      }
    });

    it('A, S (private Task) and W see and use the files', async () => {
      const seeAndUse = async (cookies: Record<string, string>, id: string, label: string) => {
        const detail = await inject('GET', `/api/v1/admin/assets/${id}`, cookies);
        expect(detail.statusCode, `${label}: ${detail.body}`).toBe(200);
        const url = await inject('GET', `/api/v1/admin/assets/${id}/url`, cookies);
        expect(url.statusCode, `${label}: ${url.body}`).toBe(200);
        const patched = await inject('PATCH', `/api/v1/admin/assets/${id}`, cookies, { label: `seen by ${label}` });
        expect(patched.statusCode, `${label}: ${patched.body}`).toBe(200);
      };
      for (const kind of KINDS) {
        await seeAndUse(A.cookies, files[kind], `A ${kind}`);
        await seeAndUse(W, files[kind], `W ${kind}`);
      }
      await seeAndUse(S.cookies, files.privateTask, 'S privateTask');
      await seeAndUse(S.cookies, files.opportunity, 'S opportunity');
      expect(await listAll(S.cookies, { q: `rv-${run}-privateTask` }, 10)).toEqual([files.privateTask]);
    });
  });

  async function cleanupCount(): Promise<number> {
    const rows = await h
      .em()
      .getConnection()
      .execute<Array<{ n: string }>>(`select count(*)::text as n from asset_object_cleanups`);
    const [row] = rows;
    if (!row) throw new Error('count(*) answered no row');
    return Number(row.n);
  }
});

/** Every file under the temporary store, relative — what a staged replace would add to. */
async function storedFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (at: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(at, { withFileTypes: true })) {
      if (entry.isDirectory()) await walk(join(at, entry.name), `${prefix}${entry.name}/`);
      else out.push(`${prefix}${entry.name}`);
    }
  };
  await walk(dir, '');
  return out.sort();
}
