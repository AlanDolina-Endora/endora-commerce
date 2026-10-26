import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  TaskContextDescriptor,
  TaskContextRegistryPort,
  TaskReadPort,
  TaskSummary,
} from '@endora-commerce/contracts';
import {
  setupBackendServer,
  teardownBackendServer,
  type BackendServerHandle,
} from '../../helpers/test-server.js';
import { withModuleOff } from '../../helpers/off-state.js';
import { TEST_ADMIN_ID } from '../../helpers/test-actors.js';
import { runWithTenantContext } from '../../../src/tenancy/tenant-context.js';

/**
 * Who sees a Task that belongs to a context (FR-031, research R-9).
 *
 * `tasks` names no context owner. A probe contributor registers the context
 * type `probe` — owned, for the length of this file, by `crm`, a toggleable
 * module whose switch the last case flips — and answers which of its context
 * ids the caller may see from a set the cases change. Everything else is
 * fail-closed: an unregistered type, or a type whose owner is off, hides its
 * Tasks from the list, from the read port's count and by id, where a hidden
 * Task answers exactly as a missing one.
 */
describe('tasks — context visibility (R-9)', () => {
  let h: BackendServerHandle;
  const admin = { b2b_session: 'stub-admin-session' };
  const API = '/api/v1/admin/tasks';

  /** The probe's visible set — every context id the caller may see. */
  const visible = new Set<string>();
  const shown = randomUUID();
  const hidden = randomUUID();
  const created: string[] = [];

  async function seedTask(context: { type: string; id: string } | null): Promise<string> {
    const id = randomUUID();
    await h.orm.em.getConnection().execute(
      `insert into "tasks" ("id", "number", "title", "created_by_admin_user_id", "context_type", "context_id", "created_at", "updated_at")
       values (?, ?, ?, ?, ?, ?, now(), now())`,
      [id, `TSK-V${id.slice(0, 8)}`, `visibility ${id}`, TEST_ADMIN_ID, context?.type ?? null, context?.id ?? null],
    );
    created.push(id);
    return id;
  }

  async function listedIds(): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const response = await h.app.inject({
        method: 'GET',
        url: `${API}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        cookies: admin,
      });
      expect(response.statusCode, response.body).toBe(200);
      const page = response.json() as { items: TaskSummary[]; nextCursor: string | null };
      ids.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    return ids;
  }

  async function detail(id: string) {
    return h.app.inject({ method: 'GET', url: `${API}/${id}`, cookies: admin });
  }

  /** The body of a 404 without its request id, which differs per request by design. */
  function notFoundShape(body: string) {
    const parsed = JSON.parse(body) as { error: Record<string, unknown> };
    const { requestId: _requestId, ...rest } = parsed.error;
    return rest;
  }

  /** The read port's count, asked as the administrator — under the context a request of theirs would carry. */
  async function countAsAdmin(contextType: string, contextId: string): Promise<number> {
    const port = h.container.resolve<TaskReadPort>('taskReadPort');
    return runWithTenantContext({ mode: 'all', actor: { kind: 'admin', id: TEST_ADMIN_ID } }, () =>
      port.countInContext({ contextType, contextId }),
    );
  }

  let free: string;
  let ofShown: string;
  let ofHidden: string;
  let ofUnregistered: string;

  beforeAll(async () => {
    h = await setupBackendServer();
    const probe: TaskContextDescriptor = {
      contextType: 'probe',
      ownerModuleId: 'crm',
      allVisibleContextIds: async () => [...visible],
      visibleContextIds: async (ids) => new Set(ids.filter((id) => visible.has(id))),
      describe: async (ids) =>
        new Map(ids.map((id) => [id, { label: `Probe ${id.slice(0, 4)}`, href: `/probe/${id}`, groups: new Map() }])),
    };
    h.container.resolve<TaskContextRegistryPort>('taskContextRegistry').register(probe);
    visible.add(shown);

    free = await seedTask(null);
    ofShown = await seedTask({ type: 'probe', id: shown });
    ofHidden = await seedTask({ type: 'probe', id: hidden });
    ofUnregistered = await seedTask({ type: 'unregistered_probe', id: randomUUID() });
  });

  afterAll(async () => {
    if (created.length > 0) {
      await h.orm.em.getConnection().execute(`delete from "tasks" where "id" = any(?::uuid[])`, [`{${created.join(',')}}`]);
    }
    await teardownBackendServer(h);
  });

  it('shows a Task without a context to a holder of tasks:read', async () => {
    expect(await listedIds()).toContain(free);
    const response = await detail(free);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({ id: free, context: null });
  });

  it('shows a Task whose context the contributor lists, with the context it describes', async () => {
    expect(await listedIds()).toContain(ofShown);
    const response = await detail(ofShown);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.context).toMatchObject({
      type: 'probe',
      id: shown,
      label: `Probe ${shown.slice(0, 4)}`,
      href: `/probe/${shown}`,
    });
    expect(await countAsAdmin('probe', shown)).toBe(1);
  });

  it('hides a Task whose context id the contributor hides — from the list, the count and by id', async () => {
    expect(await listedIds()).not.toContain(ofHidden);
    expect(await countAsAdmin('probe', hidden)).toBe(0);

    const response = await detail(ofHidden);
    const missing = await detail(randomUUID());
    expect(response.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(notFoundShape(response.body)).toEqual(notFoundShape(missing.body));
    expect(notFoundShape(response.body)).toMatchObject({ code: 'TASK_NOT_FOUND' });
  });

  it('does not narrow the system: the same count asked without an administrator sees the hidden Task', async () => {
    const port = h.container.resolve<TaskReadPort>('taskReadPort');
    const count = await runWithTenantContext({ mode: 'system', actor: { kind: 'system' }, reason: 'test' }, () =>
      port.countInContext({ contextType: 'probe', contextId: hidden }),
    );
    expect(count).toBe(1);
  });

  it('hides every Task of a context type nobody registered — fail-closed', async () => {
    expect(await listedIds()).not.toContain(ofUnregistered);
    expect((await detail(ofUnregistered)).statusCode).toBe(404);
  });

  it('hides the contributor’s Tasks while its module is off, and shows them again when it is back', async () => {
    await withModuleOff('crm', 'deactivated', async () => {
      const ids = await listedIds();
      expect(ids).toContain(free);
      expect(ids).not.toContain(ofShown);
      expect((await detail(ofShown)).statusCode).toBe(404);
      expect(await countAsAdmin('probe', shown)).toBe(0);
    });
    expect(await listedIds()).toContain(ofShown);
    expect((await detail(ofShown)).statusCode).toBe(200);
    expect(await countAsAdmin('probe', shown)).toBe(1);
  });
});
