import { LockMode } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import {
  ERROR_CODES,
  TASKS_EVENTS,
  type TaskAssigneesChangedEvent,
  type TaskContext,
  type TaskCreatedEvent,
  type TaskDeletedEvent,
  type TaskStatusCategory,
  type TaskStatusChangedEvent,
} from '@endora-commerce/contracts';
import type { Command } from '@endora-commerce/platform/commands';
import { HttpError } from '@endora-commerce/platform/http';
import { randomUUID } from 'crypto';
import { Task } from '../entities/task.entity.js';
import { TaskAssignee } from '../entities/task-assignee.entity.js';
import { taskNotFound } from './task-errors.js';
import { nextTaskNumber } from './task-number.js';

/**
 * The Commands every write of a Task runs (`specs/165-task-management/`
 * data-model §7, Constitution XIII) — one action per kind of change, each with
 * its own audit row and, where the contract names one, its own event on commit:
 *
 * | Action | Event |
 * | --- | --- |
 * | `tasks.task.create` | `tasks.task.created.v1` |
 * | `tasks.task.update` (title, description, due date, context) | — |
 * | `tasks.task.assignees_change` | `tasks.task.assignees_changed.v1` |
 * | `tasks.task.status_change` | `tasks.task.status_changed.v1` |
 * | `tasks.task.delete` | `tasks.task.deleted.v1` |
 *
 * Shared by the HTTP service and the write port, so a Task created by another
 * module is the same Command as one created on the Tasks screen. Every
 * validation a Command depends on — the context's owner, the assignees, the
 * workflow move — is the caller's to make **before** it runs the first
 * Command; a Command re-reads under its lock only what can move meanwhile.
 *
 * Audit states carry no description text: the audit trail is not tenant-scoped
 * and a description may hold whatever its writer typed — its length is enough
 * to show that it changed (the CRM rule).
 */

/** A Task's fields as the create Command writes them. */
export interface NewTaskFields {
  title: string;
  description: string;
  assigneeIds: readonly string[];
  dueOn: string | null;
  contextNote: string | null;
  /** The workflow's initial status at the moment of the call (data-model §5). */
  status: string;
}

/** The editable fields a `tasks.task.update` changes; `undefined` leaves one as it is. */
export interface TaskFieldChanges {
  title?: string;
  description?: string;
  dueOn?: string | null;
  context?: TaskContext | null;
}

export function auditSnapshot(task: Task): Record<string, unknown> {
  return {
    number: task.number,
    title: task.title,
    descriptionLength: task.description.length,
    status: task.status,
    dueOn: task.dueOn ?? null,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    contextType: task.contextType ?? null,
    contextId: task.contextId ?? null,
    contextGroupId: task.contextGroupId ?? null,
    contextNote: task.contextNote ?? null,
  };
}

function envelope(): { eventId: string; occurredAt: string } {
  return { eventId: randomUUID(), occurredAt: new Date().toISOString() };
}

async function lockedTask(em: EntityManager, id: string): Promise<Task> {
  const task = await em.findOne(Task, { id }, { lockMode: LockMode.PESSIMISTIC_WRITE });
  if (!task) throw taskNotFound();
  return task;
}

/** The assignees of one Task, in the order they were given it. */
async function assigneesOf(em: EntityManager, taskId: string): Promise<string[]> {
  const rows = await em.find(TaskAssignee, { taskId }, { orderBy: { assignedAt: 'asc', adminUserId: 'asc' } });
  return rows.map((row) => row.adminUserId);
}

/** `tasks.task.create` — the result is the new Task's id. Published at once (drafts arrive with US8). */
export function createTaskCommand(context: TaskContext | null, input: NewTaskFields): Command<string> {
  const id = randomUUID();
  let created: Task | null = null;
  return {
    action: 'tasks.task.create',
    objectType: 'task',
    objectId: id,
    run: async ({ em, actor }) => {
      if (actor.actorAdminUserId === null) {
        // `created_by_admin_user_id` is not null: a Task is created on behalf
        // of somebody, and the caller acts for them.
        throw new Error('tasks: a Task is created by an administrator; the ambient actor is none.');
      }
      const now = new Date();
      const task = em.create(Task, {
        id,
        number: await nextTaskNumber(em as EntityManager),
        title: input.title,
        description: input.description,
        status: input.status,
        dueOn: input.dueOn,
        createdByAdminUserId: actor.actorAdminUserId,
        contextType: context?.contextType ?? null,
        contextId: context?.contextId ?? null,
        contextGroupId: context?.contextGroupId ?? null,
        contextNote: input.contextNote,
        publishedAt: now,
      });
      if (input.assigneeIds.length > 0) {
        // The assignee rows name the Task by value (no ORM relation), so the
        // unit of work cannot order them after it: the Task is written first.
        await em.flush();
        for (const adminUserId of input.assigneeIds) {
          em.create(TaskAssignee, { taskId: id, adminUserId, assignedAt: now, assignedByAdminUserId: actor.actorAdminUserId });
        }
      }
      created = task;
      return { result: id, before: null, after: { ...auditSnapshot(task), assigneeIds: [...input.assigneeIds] } };
    },
    event: () => {
      const task = created!;
      const payload: TaskCreatedEvent = {
        ...envelope(),
        taskId: task.id,
        contextType: task.contextType ?? null,
        contextId: task.contextId ?? null,
        contextGroupId: task.contextGroupId ?? null,
        assigneeIds: [...input.assigneeIds],
      };
      return { eventName: TASKS_EVENTS.CREATED, payload };
    },
  };
}

/** `tasks.task.update` — the fields that are not an assignment or a status. No event. */
export function updateTaskCommand(id: string, changes: TaskFieldChanges): Command<null> {
  return {
    action: 'tasks.task.update',
    objectType: 'task',
    objectId: id,
    run: async ({ em }) => {
      const task = await lockedTask(em as EntityManager, id);
      const before = auditSnapshot(task);
      if (changes.title !== undefined) task.title = changes.title;
      if (changes.description !== undefined) task.description = changes.description;
      if (changes.dueOn !== undefined) task.dueOn = changes.dueOn;
      if (changes.context !== undefined) {
        task.contextType = changes.context?.contextType ?? null;
        task.contextId = changes.context?.contextId ?? null;
        task.contextGroupId = changes.context?.contextGroupId ?? null;
      }
      return { result: null, before, after: auditSnapshot(task) };
    },
  };
}

/** How a `PATCH` changes the assignee set: replace it, or add and remove. */
export type AssigneeChange =
  | { readonly set: readonly string[] }
  | { readonly add: readonly string[]; readonly remove: readonly string[] };

/**
 * `tasks.task.assignees_change` (research R-2) — the result is who was added
 * and who removed, or `undefined` when the set did not change (nothing
 * written, nothing audited).
 */
export function changeTaskAssigneesCommand(
  id: string,
  change: AssigneeChange,
): Command<{ added: string[]; removed: string[] } | undefined> {
  return {
    action: 'tasks.task.assignees_change',
    objectType: 'task',
    objectId: id,
    run: async ({ em, actor }) => {
      const scoped = em as EntityManager;
      await lockedTask(scoped, id);
      const current = await assigneesOf(scoped, id);
      const next =
        'set' in change
          ? [...new Set(change.set)]
          : [...current.filter((who) => !change.remove.includes(who)), ...change.add.filter((who) => !current.includes(who))];
      const added = next.filter((who) => !current.includes(who));
      const removed = current.filter((who) => !next.includes(who));
      if (added.length === 0 && removed.length === 0) return { result: undefined, skipAudit: true };
      if (removed.length > 0) await scoped.nativeDelete(TaskAssignee, { taskId: id, adminUserId: { $in: removed } });
      const now = new Date();
      for (const adminUserId of added) {
        scoped.create(TaskAssignee, {
          taskId: id,
          adminUserId,
          assignedAt: now,
          assignedByAdminUserId: actor.actorAdminUserId ?? null,
        });
      }
      return {
        result: { added, removed },
        before: { assigneeIds: current },
        after: { assigneeIds: [...current.filter((who) => !removed.includes(who)), ...added] },
      };
    },
    event: (result) => {
      if (!result) return undefined;
      const payload: TaskAssigneesChangedEvent = { ...envelope(), taskId: id, ...result };
      return { eventName: TASKS_EVENTS.ASSIGNEES_CHANGED, payload };
    },
  };
}

export interface StatusMove {
  /** The status the caller saw; the move is refused when the Task has left it. */
  from: string;
  to: string;
  toCategory: TaskStatusCategory;
}

/**
 * `tasks.task.status_change` — the move itself, checked against the workflow
 * by the caller. Under the lock the Task must still be in `from`, else 409
 * `TASK_TRANSITION_CONFLICT`. Entering a `done`-category status stamps the
 * completion time, and leaving one clears it. `undefined` when the Task is
 * already in `to` (nothing written, nothing audited).
 */
export function changeTaskStatusCommand(
  id: string,
  move: StatusMove,
): Command<{ from: string; context: Pick<TaskStatusChangedEvent, 'contextType' | 'contextId' | 'contextGroupId'> } | undefined> {
  return {
    action: 'tasks.task.status_change',
    objectType: 'task',
    objectId: id,
    run: async ({ em }) => {
      const task = await lockedTask(em as EntityManager, id);
      const from = task.status;
      if (from === move.to) return { result: undefined, skipAudit: true };
      if (from !== move.from) {
        throw new HttpError(409, ERROR_CODES.TASK_TRANSITION_CONFLICT, 'The Task left that status in the meantime.', {
          current: from,
        });
      }
      const before = auditSnapshot(task);
      task.status = move.to;
      if (move.toCategory === 'done') task.completedAt = task.completedAt ?? new Date();
      else task.completedAt = null;
      return {
        result: {
          from,
          context: {
            contextType: task.contextType ?? null,
            contextId: task.contextId ?? null,
            contextGroupId: task.contextGroupId ?? null,
          },
        },
        before,
        after: auditSnapshot(task),
      };
    },
    event: (result) => {
      if (!result) return undefined;
      const payload: TaskStatusChangedEvent = {
        ...envelope(),
        taskId: id,
        from: result.from,
        to: move.to,
        toCategory: move.toCategory,
        ...result.context,
      };
      return { eventName: TASKS_EVENTS.STATUS_CHANGED, payload };
    },
  };
}

/** `tasks.task.delete` — `false` when the Task was already gone (nothing audited). */
export function deleteTaskCommand(id: string): Command<boolean> {
  let gone: { contextType: string | null; contextId: string | null } | null = null;
  return {
    action: 'tasks.task.delete',
    objectType: 'task',
    objectId: id,
    run: async ({ em }) => {
      const task = await em.findOne(Task, { id });
      if (!task) return { result: false, skipAudit: true };
      const before = auditSnapshot(task);
      gone = { contextType: task.contextType ?? null, contextId: task.contextId ?? null };
      em.remove(task);
      return { result: true, before, after: null };
    },
    event: (deleted) => {
      if (!deleted || !gone) return undefined;
      const payload: TaskDeletedEvent = { ...envelope(), taskId: id, ...gone };
      return { eventName: TASKS_EVENTS.DELETED, payload };
    },
  };
}
