import type { EntityManager } from '@mikro-orm/postgresql';
import { ERROR_CODES } from '@endora-commerce/contracts';
import { HttpError } from '@endora-commerce/platform/http';
import { getTenantContext } from '@endora-commerce/platform/tenancy';
import { assertMayDelete as assertContextLetsDelete } from './task-checks.js';
import type { TaskContextRegistry } from './task-context-registry.js';
import { taskNotFound } from './task-errors.js';
import type { TaskVisibility, TaskVisibilityFacts } from './task-visibility.js';

/**
 * `TaskAccess` — how a route or a service obtains **one** Task, and what the
 * caller may do with it (`specs/165-task-management/` research R-3, R-21).
 *
 * Every read of a Task by id is `findVisible` / `loadVisible`: the row, asked
 * of {@link TaskVisibility} (context, draft, private) before it is handed out,
 * so a Task the caller may not see answers 404 `TASK_NOT_FOUND` exactly as a
 * missing one does. Every write starts from `loadVisible` and asks
 * `assertMayChange` — or `assertMayDelete` for a delete.
 *
 * **The seam.** Every Task-owned table is `@RuleScoped` and no ORM filter backs
 * that class, so the guard against a forgotten read path is
 * `visibility-seam.test.ts`: it fails on any read of a rule-scoped table
 * outside `task-visibility.ts`, this file and the files of
 * {@link TASK_ACCESS_READERS}, each with why that read is safe.
 */

/**
 * Files besides this one that read a rule-scoped Task table, each with why
 * that is safe. A file belongs here only when **every** such read either
 * composes {@link TaskVisibility.condition} / `taskVisibilitySql`, or is keyed
 * by Task ids this file or such a read handed out. Paths are relative to
 * `src/backend/`.
 */
export const TASK_ACCESS_READERS: Readonly<Record<string, string>> = {
  'services/task-service.ts':
    'The list, My Tasks, the board, search, the read port and global search compose the visibility pre-filter ' +
    '(`TaskVisibility.condition` / `taskVisibilitySql`); a sub-task count composes it over the children too. ' +
    'Assignees, tags and sub-task rows are read only for the ids those queries returned; a Task just written is ' +
    're-read by the id its Command wrote.',
  'services/task-commands.ts':
    'Every Command runs after its caller loaded the Task through `TaskAccess.loadVisible` (or, for the write ' +
    'port, is the context owner acting on its own record): it locks that one id and reads its assignees by it.',
  'services/task-write-port.ts':
    '`deleteInContext` lists the ids of one context for its owner — the module that registered the context type ' +
    'and is deleting its own record — and hands each to the delete Command.',
};

/** One `tasks` row as every read selects it. */
export interface TaskRow {
  id: string;
  number: string;
  title: string;
  description: string;
  status: string;
  /** `YYYY-MM-DD`, formatted by the query so no driver date parsing is involved. */
  due_on: string | null;
  due_at: Date | string | null;
  start_on: string | null;
  priority_code: string | null;
  is_draft: boolean;
  is_private: boolean;
  parent_task_id: string | null;
  source_key: string | null;
  custom_field_values: Record<string, unknown> | null;
  published_at: Date | string | null;
  completed_at: Date | string | null;
  created_by_admin_user_id: string;
  context_type: string | null;
  context_id: string | null;
  context_group_id: string | null;
  context_note: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

/** The columns of {@link TaskRow}, over `tasks` aliased `t`. */
export const TASK_COLUMNS = `t."id", t."number", t."title", t."description", t."status",
  to_char(t."due_on", 'YYYY-MM-DD') as "due_on", t."due_at", to_char(t."start_on", 'YYYY-MM-DD') as "start_on",
  t."priority_code", t."is_draft", t."is_private", t."parent_task_id", t."source_key", t."custom_field_values",
  t."published_at", t."completed_at", t."created_by_admin_user_id",
  t."context_type", t."context_id", t."context_group_id", t."context_note", t."created_at", t."updated_at"`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** What {@link TaskVisibility.canSee} is asked about one row. */
export function visibilityFacts(row: TaskRow): TaskVisibilityFacts {
  return {
    contextType: row.context_type,
    contextId: row.context_id,
    createdByAdminUserId: row.created_by_admin_user_id,
    draft: row.is_draft,
    private: row.is_private,
  };
}

/** The administrator behind the current request, or `null` for the system. */
export function actingAdminUserId(): string | null {
  const actor = getTenantContext()?.actor;
  return actor?.kind === 'admin' && actor.id ? actor.id : null;
}

/** Someone else's private Task: readable and deletable by a `tasks:see_private` holder, nothing else. */
export function isSomeoneElsesPrivate(row: Pick<TaskRow, 'is_private' | 'created_by_admin_user_id'>): boolean {
  return row.is_private && row.created_by_admin_user_id !== actingAdminUserId();
}

export interface TaskAccessDeps {
  emFactory: () => EntityManager;
  visibility: TaskVisibility;
  contexts: TaskContextRegistry;
}

export class TaskAccess {
  constructor(private readonly deps: TaskAccessDeps) {}

  /** One Task the caller may see, or `null` — hidden and missing alike. */
  async findVisible(id: string): Promise<TaskRow | null> {
    if (!isUuid(id)) return null;
    const rows = (await this.deps.emFactory().execute(`select ${TASK_COLUMNS} from "tasks" t where t."id" = ?`, [
      id,
    ])) as TaskRow[];
    const row = rows[0];
    if (!row) return null;
    return (await this.deps.visibility.canSee(visibilityFacts(row))) ? row : null;
  }

  /** The **only** way a route or a service obtains a Task: 404 `TASK_NOT_FOUND` for one hidden or missing. */
  async loadVisible(id: string): Promise<TaskRow> {
    const row = await this.findVisible(id);
    if (!row) throw taskNotFound();
    return row;
  }

  /**
   * The Task a write has just committed, read by id **without** visibility: the
   * write may have moved it into a context the caller does not see, and
   * answering 404 for a change that committed would misreport it. Never a first
   * read — its id comes from a Command that ran after `loadVisible` or created it.
   */
  async rowAfterWrite(id: string): Promise<TaskRow> {
    const rows = (await this.deps.emFactory().execute(`select ${TASK_COLUMNS} from "tasks" t where t."id" = ?`, [
      id,
    ])) as TaskRow[];
    if (!rows[0]) throw taskNotFound();
    return rows[0];
  }

  /**
   * Any write but a delete: someone else's private Task — which only a holder
   * of `tasks:see_private` sees at all — answers 403 `TASK_PRIVATE_READ_ONLY`.
   * A context's own say (`canChangeTasks`) is asked where 163 asked it: when a
   * Task goes into or out of a record (`task-checks.ts`).
   */
  assertMayChange(row: TaskRow): void {
    if (isSomeoneElsesPrivate(row)) {
      throw new HttpError(
        403,
        ERROR_CODES.TASK_PRIVATE_READ_ONLY,
        'This private Task belongs to someone else: it may be read or deleted, not changed.',
      );
    }
  }

  /** A delete: the record owner's `canChangeTasks` for a Task in a context (163 T147). */
  async assertMayDelete(row: TaskRow): Promise<void> {
    await assertContextLetsDelete(this.deps.contexts, { contextType: row.context_type, contextId: row.context_id });
  }
}
