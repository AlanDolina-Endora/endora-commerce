import { LockMode } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { isDeepStrictEqual } from 'node:util';
import {
  ERROR_CODES,
  TASK_ASSIGNEES_MAX,
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
import { TaskReference } from '../entities/task-reference.entity.js';
import { TaskTagAssignment } from '../entities/task-tag-assignment.entity.js';
import { newlyMentioned } from './mention-service.js';
import { referenceRowsFor } from './reference-service.js';
import { taskAssigneeInvalid, taskNotFound } from './task-errors.js';
import { nextTaskNumber } from './task-number.js';

/**
 * The Commands every write of a Task runs (`specs/165-task-management/`
 * data-model §7, Constitution XIII) — one action per kind of change, each with
 * its own audit row and, where the contract names one, its own event on commit:
 *
 * | Action | Event |
 * | --- | --- |
 * | `tasks.task.create` | `tasks.task.created.v1` |
 * | `tasks.task.update` (title, description, due date and time, start date, context) | — |
 * | `tasks.task.priority_change` | — |
 * | `tasks.task.tags_change` | — |
 * | `tasks.task.custom_fields_change` | — |
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
 *
 * The Command that saves a description also rewrites its `task_references`
 * rows (research R-5) — an index of the tokens, never part of the audited
 * state — and answers who the text newly mentions, for the caller to tell
 * after the commit.
 */

/** A Task's fields as the create Command writes them. */
export interface NewTaskFields {
  title: string;
  description: string;
  assigneeIds: readonly string[];
  dueOn: string | null;
  /** A due moment; the caller derives `dueOn` from it in `tasks.time_zone`. */
  dueAt?: Date | null;
  startOn?: string | null;
  /** Checked against the priority list by the caller. */
  priorityCode?: string | null;
  /** Checked to exist by the caller. */
  tagIds?: readonly string[];
  /** Validated and merged by `custom_fields` before the Command runs (R-8). */
  customFieldValues?: Record<string, unknown>;
  contextNote: string | null;
  /** The workflow's initial status at the moment of the call (data-model §5). */
  status: string;
}

/** The editable fields a `tasks.task.update` changes; `undefined` leaves one as it is. */
export interface TaskFieldChanges {
  title?: string;
  description?: string;
  dueOn?: string | null;
  dueAt?: Date | null;
  startOn?: string | null;
  context?: TaskContext | null;
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function auditSnapshot(task: Task): Record<string, unknown> {
  return {
    number: task.number,
    title: task.title,
    descriptionLength: task.description.length,
    status: task.status,
    dueOn: task.dueOn ?? null,
    dueAt: isoOrNull(task.dueAt),
    startOn: task.startOn ?? null,
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

/** Replace the description's `task_references` rows with what `description` holds now. */
async function rewriteDescriptionReferences(em: EntityManager, taskId: string, description: string): Promise<void> {
  await em.nativeDelete(TaskReference, { taskId, sourceKind: 'description' });
  for (const row of referenceRowsFor({ taskId, kind: 'description', sourceId: null }, description)) {
    em.create(TaskReference, row);
  }
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
      const scoped = em as EntityManager;
      const now = new Date();
      const tagIds = [...new Set(input.tagIds ?? [])];
      const task = scoped.create(Task, {
        id,
        number: await nextTaskNumber(scoped),
        title: input.title,
        description: input.description,
        status: input.status,
        dueOn: input.dueOn,
        dueAt: input.dueAt ?? null,
        startOn: input.startOn ?? null,
        priorityCode: input.priorityCode ?? null,
        customFieldValues: input.customFieldValues ?? {},
        createdByAdminUserId: actor.actorAdminUserId,
        contextType: context?.contextType ?? null,
        contextId: context?.contextId ?? null,
        contextGroupId: context?.contextGroupId ?? null,
        contextNote: input.contextNote,
        publishedAt: now,
      });
      const references = referenceRowsFor({ taskId: id, kind: 'description', sourceId: null }, input.description);
      if (input.assigneeIds.length > 0 || tagIds.length > 0 || references.length > 0) {
        // The child rows name the Task by value (no ORM relation), so the unit
        // of work cannot order them after it: the Task is written first.
        await scoped.flush();
        for (const adminUserId of input.assigneeIds) {
          scoped.create(TaskAssignee, { taskId: id, adminUserId, assignedAt: now, assignedByAdminUserId: actor.actorAdminUserId });
        }
        for (const tagId of tagIds) scoped.create(TaskTagAssignment, { taskId: id, tagId });
        for (const row of references) scoped.create(TaskReference, row);
      }
      created = task;
      return {
        result: id,
        before: null,
        after: {
          ...auditSnapshot(task),
          priorityCode: task.priorityCode ?? null,
          assigneeIds: [...input.assigneeIds],
          tagIds,
          ...(Object.keys(task.customFieldValues).length > 0 ? { customFieldValues: task.customFieldValues } : {}),
        },
      };
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

/**
 * `tasks.task.update` — the fields that are not an assignment, a status, a
 * priority, tags or custom fields. No event. The result is who a changed
 * description newly mentions (none when the description did not change).
 */
export function updateTaskCommand(id: string, changes: TaskFieldChanges): Command<{ mentioned: string[] }> {
  return {
    action: 'tasks.task.update',
    objectType: 'task',
    objectId: id,
    run: async ({ em }) => {
      const scoped = em as EntityManager;
      const task = await lockedTask(scoped, id);
      const before = auditSnapshot(task);
      let mentioned: string[] = [];
      if (changes.title !== undefined) task.title = changes.title;
      if (changes.description !== undefined && changes.description !== task.description) {
        mentioned = newlyMentioned(task.description, changes.description);
        task.description = changes.description;
        await rewriteDescriptionReferences(scoped, task.id, task.description);
      }
      if (changes.dueOn !== undefined) task.dueOn = changes.dueOn;
      if (changes.dueAt !== undefined) task.dueAt = changes.dueAt;
      if (changes.startOn !== undefined) task.startOn = changes.startOn;
      if (changes.context !== undefined) {
        task.contextType = changes.context?.contextType ?? null;
        task.contextId = changes.context?.contextId ?? null;
        task.contextGroupId = changes.context?.contextGroupId ?? null;
      }
      return { result: { mentioned }, before, after: auditSnapshot(task) };
    },
  };
}

/** `tasks.task.priority_change` — `false` when the Task already has it (nothing written, nothing audited). */
export function changeTaskPriorityCommand(id: string, priorityCode: string | null): Command<boolean> {
  return {
    action: 'tasks.task.priority_change',
    objectType: 'task',
    objectId: id,
    run: async ({ em }) => {
      const task = await lockedTask(em as EntityManager, id);
      const current = task.priorityCode ?? null;
      if (current === priorityCode) return { result: false, skipAudit: true };
      task.priorityCode = priorityCode;
      return { result: true, before: { priorityCode: current }, after: { priorityCode } };
    },
  };
}

/** `tasks.task.tags_change` — the whole set replaced; `false` when it did not change. */
export function changeTaskTagsCommand(id: string, tagIds: readonly string[]): Command<boolean> {
  return {
    action: 'tasks.task.tags_change',
    objectType: 'task',
    objectId: id,
    run: async ({ em }) => {
      const scoped = em as EntityManager;
      await lockedTask(scoped, id);
      const current = (await scoped.find(TaskTagAssignment, { taskId: id })).map((row) => row.tagId).sort();
      const next = [...new Set(tagIds)].sort();
      const added = next.filter((tagId) => !current.includes(tagId));
      const removed = current.filter((tagId) => !next.includes(tagId));
      if (added.length === 0 && removed.length === 0) return { result: false, skipAudit: true };
      if (removed.length > 0) await scoped.nativeDelete(TaskTagAssignment, { taskId: id, tagId: { $in: removed } });
      for (const tagId of added) scoped.create(TaskTagAssignment, { taskId: id, tagId });
      return { result: true, before: { tagIds: current }, after: { tagIds: next } };
    },
  };
}

/**
 * `tasks.task.custom_fields_change` — the bag `custom_fields` validated and
 * merged; the audit row holds the keys that changed, before and after.
 * `false` when nothing changed.
 */
export function changeTaskCustomFieldsCommand(id: string, merged: Record<string, unknown>): Command<boolean> {
  return {
    action: 'tasks.task.custom_fields_change',
    objectType: 'task',
    objectId: id,
    run: async ({ em }) => {
      const task = await lockedTask(em as EntityManager, id);
      const current = task.customFieldValues ?? {};
      const keys = [...new Set([...Object.keys(current), ...Object.keys(merged)])].filter(
        (key) => !isDeepStrictEqual(current[key], merged[key]),
      );
      if (keys.length === 0) return { result: false, skipAudit: true };
      const side = (bag: Record<string, unknown>) => Object.fromEntries(keys.map((key) => [key, bag[key] ?? null]));
      task.customFieldValues = merged;
      return { result: true, before: { customFieldValues: side(current) }, after: { customFieldValues: side(merged) } };
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
      // FR-001: at most this many, counted under the lock, whichever form changed the set.
      if (next.length > TASK_ASSIGNEES_MAX) throw taskAssigneeInvalid();
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
