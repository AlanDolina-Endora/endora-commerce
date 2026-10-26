---
title: tasks
description: Tasks assigned to administrators, with a due date and a status, which other modules can own through a Task context
---

# `tasks`

The Tasks module keeps **tasks**: a piece of work for an administrator, with a
title, a description, an assignee, a due date and a status. It is a deliberately
small first version, meant as the base other modules build on.

## What it does

Every task has a number, such as `TSK-000042`, given when it is created and
never reused. Its status is one of four, and any status can follow any other:

| Status | Meaning |
| --- | --- |
| `todo` | Not started — every new task starts here. |
| `in_progress` | Being worked on. |
| `done` | Finished. The moment it became done is recorded, and cleared again if it leaves `done`. |
| `cancelled` | Will not be done. |

A task whose due date has passed while it is still `todo` or `in_progress` is
**overdue**.

A task can stand on its own, or belong to a record another module owns — a
project, for example. That record is the task's **context**. A task with no
context is visible to everybody allowed to see tasks. A task with a context is
visible only to the people the context's own module says may see that record:
someone who may not see a project does not see its tasks either, anywhere — not
in a list, not by its address. To them such a task does not exist.

If the module that owns a context is switched off, the tasks of that context
disappear from the Tasks module until it is switched back on; nothing is
deleted.

## In the Admin UI

The Tasks screens — the task list, *My tasks* and a task's own screen — arrive
in the next release of this module. Until then tasks are read through the API
below and created by the modules that own a context.

## Switching it on and off

Tasks is an optional module. It is on by default and an operator switches it
off, and back on, on the **Modules** screen of the Admin UI
(`/platform/modules`).

While it is off:

- every `/api/v1/admin/tasks…` endpoint answers `503` with the code
  `MODULE_DISABLED`;
- its permissions can no longer be granted to a role;
- other modules can neither read nor create tasks: a module that offers tasks
  as part of its own screens shows them as unavailable.

Nothing is deleted. Every task stays in the database, and everything is back
exactly as it was when the module is switched on again.

## Permissions

| Code | What it allows |
| --- | --- |
| `tasks:read` | View tasks — the list and a single task — subject to the visibility of each task's context. |

## For developers

### The API

| Method and path | Permission | What it answers |
| --- | --- | --- |
| `GET /api/v1/admin/tasks` | `tasks:read` | A page of tasks, newest first: `{ items, nextCursor }`. Filters: `status` (repeatable), `assignee` (an administrator's id, `me` or `none`), `dueFrom`, `dueTo`, `overdue`, `contextType`, `contextId`, `q` (number or title), `cursor`, `limit` (at most 100). |
| `GET /api/v1/admin/tasks/:id` | `tasks:read` | `{ data: TaskDetail }`, or `404` `TASK_NOT_FOUND` — for a task that does not exist and for one whose context you may not see alike. |

The request and response shapes are the Zod schemas of
`@endora-commerce/contracts` (`tasks.ts`).

### Task contexts

The Tasks module names no other module. A module that wants tasks of its own
registers a **Task context** — a context type it owns, such as `project` —
and from then on tasks can carry that type, the id of one of its records and,
optionally, the id of a group inside the record (a project's stage).

The registry is the container entry `taskContextRegistry`
(`TaskContextRegistryPort`). It is registered ungated, so push into it from a
**contribution-only boot hook with no presence probe**, and declare the edge in
your manifest's `nonBindingDependencies` as `contributes-to`:

```ts
ctx.onBoot(() => {
  lazyPort<TaskContextRegistryPort>(ctx, 'taskContextRegistry').register({
    contextType: 'project',
    ownerModuleId: 'projects',
    allVisibleContextIds: () => /* every record id the caller may see */,
    visibleContextIds: (ids) => /* which of these ids the caller may see */,
    describe: (ids) => /* id → { label, href, groups: groupId → label } */,
  });
});
```

The contract a descriptor keeps:

- **Every method runs under the caller's own tenant context.** Answer for the
  caller, exactly as your own screens would.
- `allVisibleContextIds()` is the list pre-filter: the Tasks list asks it once
  per request and narrows its query to those ids, so pages stay exact. Keep it
  cheap.
- `visibleContextIds(ids)` answers for a single task, or a few.
- `describe(ids)` is how a task shows its context: a label, an address in the
  Admin UI, and the labels of the record's groups.
- One context type has one owner; registering a second, different descriptor
  for a type already taken stops the backend at boot.
- **The policy is fail-closed.** A task whose context type nobody registered,
  or whose owner is switched off, is hidden from lists, counts and by id, and
  reappears when the owner is back. The system — a background job with no
  administrator behind it — is never narrowed.

### Reading and writing tasks from another module

Two ports, both gated — resolving either while Tasks is off throws, and the
call answers `503` `MODULE_DISABLED`. Resolve them with `lazyPort` and declare
them `degrades-without` with a `whenAbsent` sentence.

| Port | Methods |
| --- | --- |
| `taskReadPort` (`TaskReadPort`) | `findById`, `listInContext`, `listOpenInContext` (neither `done` nor `cancelled`), `countInContext` — narrowed by context visibility for an administrator, not for the system. |
| `taskWritePort` (`TaskWritePort`) | `createMany({ context, tasks })` — at most 100 tasks, one audited `tasks.task.create` command and one `tasks.task.created.v1` event per task; refused with `TASK_CONTEXT_INVALID` when no switched-on module owns the context type and with `TASK_ASSIGNEE_INVALID` when an assignee is not an active administrator, before anything is written. `deleteInContext({ contextType, contextId })` — every task of one record, one audited `tasks.task.delete` command each. |

Call `createMany` **after your own transaction has committed**: each task is
written in a transaction of its own.

### Events

| Event | Payload |
| --- | --- |
| `tasks.task.created.v1` | `{ taskId, contextType, contextId, contextGroupId, assignedAdminUserId }` |
| `tasks.task.status_changed.v1` | `{ taskId, from, to, contextType, contextId, contextGroupId }` |
| `tasks.task.assigned.v1` | `{ taskId, from, to }` |
| `tasks.task.deleted.v1` | `{ taskId, contextType, contextId }` |

Each is emitted once per command, after it commits. In this release only
`tasks.task.created.v1` and `tasks.task.deleted.v1` occur, through the write
port; the other two arrive with editing tasks in the Admin UI.
