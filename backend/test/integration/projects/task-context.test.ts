import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MyTasksResponseSchema, TaskListResponseSchema, type ProjectDetail } from '@endora-commerce/contracts';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { withModulesDeactivated } from '../../helpers/modules-deactivated.js';
import { seedCrmAdmin } from '../../helpers/seed-crm.js';
import {
  callProjects,
  callTasks,
  createProject,
  createStageTask,
  deleteProjects,
  deleteProjectTasks,
  stageNamed,
  taskRowsOf,
} from './helpers.js';

/**
 * User Story 2 — a Task in a Project is the Project's to show (spec US2
 * scenario 6, FR-020, FR-031, research R-9).
 *
 * Under the setting *Members only* a Project Task is in the Tasks list, in
 * *My Tasks* and by id only for somebody who may see the Project; everybody
 * else is answered as if it did not exist. With Projects switched off its
 * Tasks are absent from the Tasks module, and back when it is on. Deleting a
 * Project deletes its Tasks.
 */
describe('projects — the `project` Task context (US2)', () => {
  let h: BackendServerHandle;
  let member: { cookies: { b2b_session: string }; adminUserId: string; undo: () => void };
  let outsider: { cookies: { b2b_session: string }; adminUserId: string; undo: () => void };
  let project: ProjectDetail;
  let forMember: string;
  let forOutsider: string;
  let free: string;
  const created: string[] = [];

  const PERMISSIONS = ['projects:read', 'tasks:read', 'tasks:write'];

  async function listed(cookies: { b2b_session: string }): Promise<string[]> {
    const response = await callTasks(h, 'GET', '?limit=100', { cookies });
    expect(response.statusCode, response.body).toBe(200);
    return TaskListResponseSchema.parse(response.json()).items.map((t) => t.id);
  }

  async function mine(cookies: { b2b_session: string }): Promise<string[]> {
    const response = await callTasks(h, 'GET', '/mine', { cookies });
    expect(response.statusCode, response.body).toBe(200);
    return MyTasksResponseSchema.parse(response.json()).data.map((t) => t.id);
  }

  beforeAll(async () => {
    h = await setupBackendServer();
    const write = await h.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings/projects.visibility/value',
      cookies: { b2b_session: 'stub-admin-session' },
      payload: { scope: 'all', value: 'members' },
    });
    expect(write.statusCode, write.body).toBeLessThan(400);
    member = await seedCrmAdmin(h.em(), 'ctx-member', PERMISSIONS);
    outsider = await seedCrmAdmin(h.em(), 'ctx-outsider', PERMISSIONS);
    project = await createProject(h, {
      title: 'Members only',
      members: [{ adminUserId: member.adminUserId, roleIds: [] }],
    });
    created.push(project.id);
    const design = stageNamed(project, 'Design');
    forMember = (await createStageTask(h, project.id, design, { title: 'For the member', assignedAdminUserId: member.adminUserId })).id;
    // Assigned to somebody who may not see the Project: still not theirs to see.
    forOutsider = (await createStageTask(h, project.id, design, { title: 'For the outsider', assignedAdminUserId: outsider.adminUserId })).id;
    const response = await callTasks(h, 'POST', '', { payload: { title: 'Free-standing', assignedAdminUserId: outsider.adminUserId } });
    expect(response.statusCode, response.body).toBe(201);
    free = response.json().data.id;
  });

  afterAll(async () => {
    member.undo();
    outsider.undo();
    await deleteProjectTasks(h, created);
    await h.em().getConnection().execute(`delete from "tasks" where "id" = ?`, [free]);
    await deleteProjects(h, created);
    await teardownBackendServer(h);
  });

  it('a Member sees the Project’s Tasks in the list, in My Tasks and by id', async () => {
    expect(await listed(member.cookies)).toEqual(expect.arrayContaining([forMember, forOutsider]));
    expect(await mine(member.cookies)).toContain(forMember);
    const one = await callTasks(h, 'GET', `/${forMember}`, { cookies: member.cookies });
    expect(one.statusCode, one.body).toBe(200);
    expect(one.json().data.context).toMatchObject({ type: 'project', id: project.id, label: `${project.number} Members only` });
  });

  it('somebody who may not see the Project does not see its Tasks anywhere — not even one assigned to them', async () => {
    const theirs = await listed(outsider.cookies);
    expect(theirs).toContain(free);
    expect(theirs).not.toContain(forMember);
    expect(theirs).not.toContain(forOutsider);
    expect(await mine(outsider.cookies)).toEqual([free]);
    for (const id of [forMember, forOutsider]) {
      const one = await callTasks(h, 'GET', `/${id}`, { cookies: outsider.cookies });
      expect(one.statusCode).toBe(404);
      expect(one.json().error.code).toBe('TASK_NOT_FOUND');
      const edit = await callTasks(h, 'PATCH', `/${id}`, { cookies: outsider.cookies, payload: { status: 'done' } });
      expect(edit.statusCode).toBe(404);
    }
    // Nor can they put a Task into it.
    const into = await callTasks(h, 'POST', '', {
      cookies: outsider.cookies,
      payload: {
        title: 'Sneaking in',
        context: { contextType: 'project', contextId: project.id, contextGroupId: stageNamed(project, 'Design') },
      },
    });
    expect(into.statusCode, into.body).toBe(422);
    expect(into.json().error.code).toBe('TASK_CONTEXT_INVALID');
  });

  it('with Projects off its Tasks are absent from Tasks; on again, they are back', async () => {
    await withModulesDeactivated(['projects'], async () => {
      expect(await listed(member.cookies)).not.toContain(forMember);
      expect(await mine(member.cookies)).not.toContain(forMember);
      expect((await callTasks(h, 'GET', `/${forMember}`, { cookies: member.cookies })).statusCode).toBe(404);
    });
    expect(await listed(member.cookies)).toContain(forMember);
    expect((await callTasks(h, 'GET', `/${forMember}`, { cookies: member.cookies })).statusCode).toBe(200);
  });

  it('deleting a Project deletes its Tasks', async () => {
    const doomed = await createProject(h, { title: 'Doomed' });
    created.push(doomed.id);
    await createStageTask(h, doomed.id, stageNamed(doomed, 'Design'), { title: 'Goes with it' });
    await createStageTask(h, doomed.id, stageNamed(doomed, 'Build'), { title: 'Goes too' });
    expect(await taskRowsOf(h, doomed.id)).toHaveLength(2);

    const response = await callProjects(h, 'DELETE', `/${doomed.id}`);
    expect(response.statusCode, response.body).toBe(204);
    expect(await taskRowsOf(h, doomed.id)).toEqual([]);
  });

  it('a Stage that holds a Task cannot be deleted — 409 PROJECT_STAGE_HAS_TASKS', async () => {
    const response = await callProjects(h, 'DELETE', `/${project.id}/stages/${stageNamed(project, 'Design')}`);
    // Design is current too; Build holds no Task and goes.
    expect(response.statusCode).toBe(409);
    const holder = await createProject(h, { title: 'Stage holds a Task' });
    created.push(holder.id);
    await createStageTask(h, holder.id, stageNamed(holder, 'Build'), { title: 'Keeps the Stage' });
    const refused = await callProjects(h, 'DELETE', `/${holder.id}/stages/${stageNamed(holder, 'Build')}`);
    expect(refused.statusCode, refused.body).toBe(409);
    expect(refused.json().error.code).toBe('PROJECT_STAGE_HAS_TASKS');
    const free = await callProjects(h, 'DELETE', `/${holder.id}/stages/${stageNamed(holder, 'Handover')}`);
    expect(free.statusCode, free.body).toBe(204);
  });
});
