import type { EntityManager } from '@mikro-orm/postgresql';
import {
  ERROR_CODES,
  TASK_CLOSED_STATUSES,
  type AdminUserReadPort,
  type AdminUserRecord,
  type TaskContextDescription,
  type TaskContextQuery,
  type TaskDetail,
  type TaskListQuery,
  type TaskListResponse,
  type TaskStatus,
  type TaskSummary,
} from '@endora-commerce/contracts';
import { HttpError } from '@endora-commerce/platform/http';
import { getTenantContext } from '@endora-commerce/platform/tenancy';
import type { TaskContextRegistry } from './task-context-registry.js';
import type { SqlFragment, TaskVisibility } from './task-visibility.js';

/**
 * Tasks — the read side (`specs/163-projects-and-tasks/contracts/admin-api.md`
 * §1). Writes arrive with User Story 2; the read port and the write port read
 * through the methods here.
 *
 * **Every read of the `tasks` table in this module is in this file** and asks
 * {@link TaskVisibility} first (`Task` is `@RuleScoped`, so no ORM filter
 * would). A Task the caller may not see answers 404 `TASK_NOT_FOUND`, exactly
 * as a missing one does, and is absent from every list.
 *
 * The reads are SQL rather than `em.find`, because the visibility pre-filter is
 * one SQL predicate built before the query runs, and the keyset cursor is a row
 * comparison.
 */

/** One `tasks` row as the reads select it. */
export interface TaskRow {
  id: string;
  number: string;
  title: string;
  description: string;
  status: TaskStatus;
  assigned_admin_user_id: string | null;
  /** `YYYY-MM-DD`, formatted by the query so no driver date parsing is involved. */
  due_on: string | null;
  completed_at: Date | null;
  created_by_admin_user_id: string;
  context_type: string | null;
  context_id: string | null;
  context_group_id: string | null;
  context_note: string | null;
  created_at: Date;
  updated_at: Date;
  /** `created_at` as Postgres prints it, at full precision — the keyset cursor's key. */
  cursor_at: string;
  /** Open and past its due date, by the database's calendar day. */
  overdue: boolean;
}

const CLOSED = TASK_CLOSED_STATUSES.map((status) => `'${status}'`).join(', ');

const COLUMNS = `t."id", t."number", t."title", t."description", t."status", t."assigned_admin_user_id",
  to_char(t."due_on", 'YYYY-MM-DD') as "due_on", t."completed_at", t."created_by_admin_user_id",
  t."context_type", t."context_id", t."context_group_id", t."context_note", t."created_at", t."updated_at",
  t."created_at"::text as "cursor_at",
  (t."status" not in (${CLOSED}) and t."due_on" is not null and t."due_on" < current_date) as "overdue"`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TaskServiceDeps {
  emFactory: () => EntityManager;
  visibility: TaskVisibility;
  contexts: TaskContextRegistry;
  /** `admin_users`' read port — lazy, resolved per call. */
  adminUsers: AdminUserReadPort;
}

export function taskNotFound(): HttpError {
  return new HttpError(404, ERROR_CODES.TASK_NOT_FOUND, 'Task not found.');
}

/** The administrator behind the current request, or `null` for the system. */
export function actingAdminUserId(): string | null {
  const actor = getTenantContext()?.actor;
  return actor?.kind === 'admin' && actor.id ? actor.id : null;
}

function personName(person: Pick<AdminUserRecord, 'firstName' | 'lastName' | 'email'>): string {
  return `${person.firstName} ${person.lastName}`.trim() || person.email;
}

function isActive(admin: AdminUserRecord): boolean {
  return admin.status === 'active' && admin.deletedAt === null;
}

interface Cursor {
  at: string;
  id: string;
}

function encodeCursor(row: TaskRow): string {
  return Buffer.from(JSON.stringify({ a: row.cursor_at, i: row.id }), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): Cursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { a?: unknown; i?: unknown };
    if (typeof parsed.a === 'string' && typeof parsed.i === 'string' && UUID.test(parsed.i)) {
      return { at: parsed.a, id: parsed.i };
    }
  } catch {
    // Falls through to the refusal below: a cursor is opaque, and one this
    // service did not issue is a malformed request rather than "page one".
  }
  throw new HttpError(400, ERROR_CODES.VALIDATION_FAILED, 'The cursor is not one this list issued.');
}

export class TaskService {
  constructor(private readonly deps: TaskServiceDeps) {}

  /** One Task the caller may see, or `null` — hidden and missing alike. */
  async findVisibleRow(id: string): Promise<TaskRow | null> {
    if (!UUID.test(id)) return null;
    const rows = (await this.deps.emFactory().execute(`select ${COLUMNS} from "tasks" t where t."id" = ?`, [
      id,
    ])) as TaskRow[];
    const row = rows[0];
    if (!row) return null;
    const visible = await this.deps.visibility.canSee({ contextType: row.context_type, contextId: row.context_id });
    return visible ? row : null;
  }

  /** `GET /tasks/:id`. */
  async get(id: string): Promise<TaskDetail> {
    const row = await this.findVisibleRow(id);
    if (!row) throw taskNotFound();
    const [summary] = await this.#summaries([row]);
    const people = await this.#people([row.created_by_admin_user_id]);
    const creator = people.get(row.created_by_admin_user_id);
    const descriptions = await this.#describe([row]);
    const description = row.context_type && row.context_id ? descriptions.get(row.context_type)?.get(row.context_id) : undefined;
    return {
      ...summary!,
      description: row.description,
      // Reference resolution for a Task's description is not part of the read
      // side of this phase; the field is empty until it is.
      references: [],
      context:
        row.context_type && row.context_id
          ? {
              type: row.context_type,
              id: row.context_id,
              groupId: row.context_group_id,
              label: description?.label ?? '',
              href: description?.href ?? '',
              groupLabel: (row.context_group_id && description?.groups.get(row.context_group_id)) || null,
            }
          : null,
      contextNote: row.context_note,
      createdBy: creator ? { id: creator.id, name: personName(creator) } : null,
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  /**
   * `GET /tasks` — newest first, a keyset page. Hidden contexts are excluded
   * by the visibility pre-filter, so a page and the next one are exact.
   */
  async list(query: TaskListQuery): Promise<TaskListResponse> {
    const where: string[] = [];
    const params: unknown[] = [];
    const visible = await this.deps.visibility.condition('t');
    if (visible) {
      where.push(visible.sql);
      params.push(...visible.params);
    }
    if (query.status && query.status.length > 0) {
      where.push(`t."status" = any(?::text[])`);
      params.push(`{${query.status.join(',')}}`);
    }
    if (query.assignee === 'none') {
      where.push(`t."assigned_admin_user_id" is null`);
    } else if (query.assignee === 'me') {
      // "Mine" is whoever asks; with no administrator behind the request
      // nobody is, and the answer is none.
      const me = actingAdminUserId();
      if (me === null) return { items: [], nextCursor: null };
      where.push(`t."assigned_admin_user_id" = ?`);
      params.push(me);
    } else if (query.assignee) {
      where.push(`t."assigned_admin_user_id" = ?`);
      params.push(query.assignee);
    }
    if (query.dueFrom) {
      where.push(`t."due_on" >= ?::date`);
      params.push(query.dueFrom);
    }
    if (query.dueTo) {
      where.push(`t."due_on" <= ?::date`);
      params.push(query.dueTo);
    }
    if (query.overdue === true) {
      where.push(`(t."status" not in (${CLOSED}) and t."due_on" < current_date)`);
    } else if (query.overdue === false) {
      where.push(`not (t."status" not in (${CLOSED}) and t."due_on" is not null and t."due_on" < current_date)`);
    }
    if (query.contextType) {
      where.push(`t."context_type" = ?`);
      params.push(query.contextType);
    }
    if (query.contextId) {
      where.push(`t."context_id" = ?`);
      params.push(query.contextId);
    }
    if (query.q) {
      const like = `%${query.q.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
      where.push(`(t."title" ilike ? or t."number" ilike ?)`);
      params.push(like, like);
    }
    const after = decodeCursor(query.cursor);
    if (after) {
      where.push(`(t."created_at", t."id") < (?::timestamptz, ?::uuid)`);
      params.push(after.at, after.id);
    }

    const rows = (await this.deps.emFactory().execute(
      `select ${COLUMNS} from "tasks" t
        ${where.length > 0 ? `where ${where.join(' and ')}` : ''}
        order by t."created_at" desc, t."id" desc
        limit ?`,
      [...params, query.limit + 1],
    )) as TaskRow[];
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: await this.#summaries(page),
      nextCursor: hasMore ? encodeCursor(page[page.length - 1]!) : null,
    };
  }

  /**
   * The Tasks of one context (or one group inside it), oldest first — what the
   * read port answers. The context's own owner is asked once whether the
   * caller may see it; the system is not narrowed.
   */
  async rowsInContext(q: TaskContextQuery, options: { openOnly: boolean }): Promise<TaskRow[]> {
    const filter = await this.#inContext(q);
    if (!filter) return [];
    return (await this.deps.emFactory().execute(
      `select ${COLUMNS} from "tasks" t where ${filter.sql}
         ${options.openOnly ? `and t."status" not in (${CLOSED})` : ''}
        order by t."created_at" asc, t."id" asc`,
      filter.params,
    )) as TaskRow[];
  }

  async countInContext(q: TaskContextQuery): Promise<number> {
    const filter = await this.#inContext(q);
    if (!filter) return 0;
    const rows = (await this.deps.emFactory().execute(
      `select count(*)::int as "n" from "tasks" t where ${filter.sql}`,
      filter.params,
    )) as Array<{ n: number }>;
    return Number(rows[0]?.n ?? 0);
  }

  /** The predicate selecting one context's Tasks, or `null` when the caller may not see the context. */
  async #inContext(q: TaskContextQuery): Promise<SqlFragment | null> {
    if (!UUID.test(q.contextId) || (q.contextGroupId !== undefined && !UUID.test(q.contextGroupId))) return null;
    const visible = await this.deps.visibility.canSee({ contextType: q.contextType, contextId: q.contextId });
    if (!visible) return null;
    const sql = [`t."context_type" = ?`, `t."context_id" = ?`];
    const params: unknown[] = [q.contextType, q.contextId];
    if (q.contextGroupId !== undefined) {
      sql.push(`t."context_group_id" = ?`);
      params.push(q.contextGroupId);
    }
    return { sql: sql.join(' and '), params };
  }

  async #summaries(rows: readonly TaskRow[]): Promise<TaskSummary[]> {
    if (rows.length === 0) return [];
    const [people, descriptions] = await Promise.all([
      this.#people(rows.map((row) => row.assigned_admin_user_id).filter((id): id is string => id !== null)),
      this.#describe(rows),
    ]);
    return rows.map((row) => {
      const assignee = row.assigned_admin_user_id ? people.get(row.assigned_admin_user_id) : undefined;
      const description =
        row.context_type && row.context_id ? descriptions.get(row.context_type)?.get(row.context_id) : undefined;
      return {
        id: row.id,
        number: row.number,
        title: row.title,
        status: row.status,
        dueOn: row.due_on,
        overdue: row.overdue,
        assignee: assignee ? { id: assignee.id, name: personName(assignee), active: isActive(assignee) } : null,
        context:
          row.context_type && row.context_id
            ? {
                type: row.context_type,
                label: description?.label ?? '',
                href: description?.href ?? '',
                groupLabel: (row.context_group_id && description?.groups.get(row.context_group_id)) || null,
              }
            : null,
      };
    });
  }

  async #people(ids: readonly string[]): Promise<Map<string, AdminUserRecord>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const found = await this.deps.adminUsers.findByIds(unique);
    return new Map(found.map((admin) => [admin.id, admin]));
  }

  /**
   * What each context's owner says about the contexts of `rows`, asked once
   * per type, under the caller's context. Only a present owner is asked; a
   * row reaching here has passed visibility, so its owner is present.
   */
  async #describe(rows: readonly TaskRow[]): Promise<Map<string, Map<string, TaskContextDescription>>> {
    const byType = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!row.context_type || !row.context_id) continue;
      const ids = byType.get(row.context_type) ?? new Set<string>();
      ids.add(row.context_id);
      byType.set(row.context_type, ids);
    }
    const out = new Map<string, Map<string, TaskContextDescription>>();
    for (const [contextType, ids] of byType) {
      const descriptor = this.deps.contexts.presentFor(contextType);
      if (!descriptor) continue;
      out.set(contextType, await descriptor.describe([...ids]));
    }
    return out;
  }
}
