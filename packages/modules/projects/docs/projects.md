---
title: projects
description: Projects for zero or more Organizations, run through their own Stages by Members holding Project Roles
---

# `projects`

The Projects module keeps **projects**: a piece of work for one or more
Organizations — or for none, an internal project — run through **stages** of
its own by **members** who hold **project roles** such as *Sales Rep* or
*Project Manager*.

## What it does

Every project has a number, such as `PRJ-000042`, given when it is created and
never reused, a title, an optional value with its currency, and a start date.
A project is **open** while it runs and ends **completed** or **lost**; a
closed project can be reopened.

A project is for **zero or more Organizations**. A project for none is an
**internal** project.

Each project has its own **stages** — a name, a colour and a planned duration
in days — and its own **workflow**: the moves allowed between its stages. An
open project is always in exactly one stage.

The project roles are a list the operator keeps. Two are there from the start,
*Sales Rep* and *Project Manager*, and can be renamed or archived but not
deleted. A role is a label on a member of one project: it grants no permission
anywhere. The same person can hold different roles on different projects. The
reasons a project can be lost — *Price*, *Chose a competitor*, *Cancelled by the
client*, *No decision* and *Other* — are a list the operator keeps the same way.

## In the Admin UI

Projects are in the sidebar under **Projects & tasks → Projects** (`/projects`),
for administrators who may view projects, and their templates under
**Projects & tasks → Templates** (`/projects/templates`), for administrators who
may configure projects.

**The list** shows every project you may see: its number, title,
Organizations — or *Internal* — the current stage with its deadline, marked
*Overdue* once it has passed, the value and the project managers. Filter it by
state, by Organization, to the projects you are a member of or those of any one
member, by a project role somebody holds on them, by the template they were
created from, and by the name of their current stage; search by number or
title, and sort it by creation date, value or the current stage's deadline;
projects without a value or a deadline come last either way.

**New project** (`/projects/new`) first offers the **templates**: choosing one
fills in the description and offers the template's roles first to each member,
and lists the stages the project will get from it — with their workflow, gates,
alerts and stage tasks — which are changed on the project's *Stages* tab once
it exists. Without a template the form asks for the stages, in order — a name,
a colour and a planned duration in days for each, at least one. Either way it
asks for a title and optionally the Organizations, a value with its currency, a
start date, a description and the members, each with the roles they hold;
whatever a template filled in can still be changed. With no Organization the
project is internal, and the form says who will see it. The project follows the
module's *Who sees a Project* setting; choosing it per project and custom
fields arrive with later releases.

**A project's screen** names the project, its state, value and Organizations.
Below them is the **stage bar**: every stage in order, the current one marked,
its deadline, and only what the project may do next — a button for each move
its workflow permits, *Close as completed* where the current stage permits
completion, and *Close as lost*, which asks for a loss reason and an optional
comment. A closed project says when and in which stage it ended and offers
*Reopen*. When somebody else changed the project in the meantime, or another
module refuses the change, the screen says why and shows the project as it is
now; when a completion gate refuses it, the open tasks it names are listed, each
a link to the task.

*Delete project* asks before it deletes. A project with linked records is not
deleted: the screen says so, and the records have to be unlinked first.

Its tabs:

- **Overview** — the description, the start date and the members by role.
- **Stages** — each stage's name, colour, planned duration, responsible roles,
  alert days, completion gate and whether the project may be completed from
  it, saved one stage at a time; stages are added at the end, moved up or down
  and deleted here. With the Tasks module on, each stage also lists its
  **stage tasks** — a title, the days after the stage starts that the task is
  due, and the responsible role — saved as one list per stage; a stage whose
  tasks could not be created when the project entered it says so and offers
  *Create the stage's tasks again*. Below the stages the **workflow**, drawn as
  a graph, where moves are added and removed; a stage no move reaches from the
  first one is named in a warning.
- **Tasks** — with the Tasks module on, for administrators who may view tasks:
  every stage in order with its tasks — number (a link to the task), title,
  status, assignee and due date, overdue ones marked — and, for administrators
  who may create tasks, a field under each stage that adds a task to it by its
  title.
- **Stage history** — every entry into a stage, every close and every reopen,
  newest first, with who did it and when.

Without the permission to create and run projects the screen is read-only: the
stages, the workflow and the history are shown, and nothing can be changed.

**Templates** (`/projects/templates`) lists the templates by name with their
number of stages; archived ones are listed on request, marked *Archived*. A
template's screen — or *New template* — edits its name, default description and
project roles, and its stages with the same fields, stage tasks and workflow
graph as a project's *Stages* tab; everything is saved together with *Save
template*. *Duplicate* makes an independent copy and opens it; *Archive* takes
the template out of the choices of *New project*, and *Restore* puts it back.

Roles and loss reasons have no screen yet; they arrive with a later release of
this module.

## Running a project

**Creating a project.** A project is created with a title and its stages, in
order; optionally a description, a value with its currency, a start date (today
if left out), its Organizations, its members with their roles, and who sees it.
It gets its number, is **open**, and starts in its **first stage**. Every
Organization named must be one the person creating the project can reach, and
every member and listed person an active administrator. A member may hold any
number of roles, none included.

**Stages.** Each stage has a name, a colour, a planned duration in days, the
roles responsible for it, and whether the project may be completed from it.
Completing is permitted from the last stage unless the stages say otherwise. A
stage also keeps whether it is a **completion gate** for its tasks and its own
**stage tasks** — both described under *Stage Tasks and the completion gate*
below — and the days before its deadline on which members are to be alerted,
which take effect with the later release that brings deadline alerts. Stages
can be added (at the end), renamed, recoloured, reordered and removed — except
the stage the project is in, a project's only stage, and a stage that holds
tasks.

**The workflow.** The moves a project may make between its stages are its own.
By default each stage moves to the next one, and a stage added at the end is
reached from the stage that was last before it. The workflow can be replaced
with any set of moves — back from *Delivery* to *Design*, or skipping *Pilot*.
A stage no move reaches from the first one is allowed; the project names it as
**unreachable** so that the workflow can be corrected.

**Moving.** A project moves only along a permitted move; any other move is
refused and nothing changes. Entering a stage records the day it started —
today, in the time zone of `projects.alerts_time_zone` — and its deadline: that
day plus the stage's planned duration, or the day itself for a duration of
zero. A deadline set by hand is kept. Entering a stage again starts it again.

**Closing.** A project is closed as **completed** from a stage that permits
completion, or as **lost** from any stage — with a loss reason from the list
and an optional comment; the stage it was lost in is recorded. A closed project
can be **reopened**: it returns to the stage it was closed in and its outcome
is cleared.

**Two people at once.** Every move, close, reopen and edit names the version of
the project it was made on. If somebody else changed the project in the
meantime, the change is refused and nothing is applied twice: reload the
project and try again.

**History.** Every entry into a stage, every close and every reopen is a row of
the project's stage history, with the stage names as they were, who did it and
when; every change is also in the audit log.

**Logic of other modules.** Another module, or a deployment, can register a
check that runs before a move, a close or a reopen and refuses it with a reason
of its own; a module that is switched off is not asked. What happened is
announced afterwards as an event.

The Tasks module is not needed for any of this: a project runs through its
stages with Tasks switched off.

## Stage Tasks and the completion gate

With the Tasks module switched on, a project's stages hold **tasks** — a task
of a project always belongs to one of its stages. A task in a project is a
task of the Tasks module like any other (its number, assignee, due date and
status are described on the Tasks page), and it is seen only by the people who
may see the project: by anybody else, nowhere — not in the Tasks list, not in
*My tasks*, not by its address, not even when it is assigned to them.

**The completion gate.** A stage can be a completion gate. A project does not
leave such a stage — by a move, or by being closed as completed from it —
while one of the stage's tasks is neither *done* nor *cancelled*: the move is
refused, nothing changes, and the refusal names the open tasks. A cancelled
task counts as finished. Closing a project as **lost** is never stopped by the
gate. A stage that is not a gate lets the project go with its tasks still
open; they stay under that stage.

**Stage tasks.** Each stage can carry a list of **stage tasks** — a title, a
description, the role responsible for it and a due offset in days. They
become real tasks when the project **enters** the stage: due on the day the
stage started plus the offset, and assigned to the member who holds the
responsible role, if exactly one active member does; otherwise the task is
left unassigned and its note names the role — in the language of whoever reads
the task, with the role's current name. They are created once per stage:
entering the stage again creates nothing. The tasks are created on behalf of
the person who moved the project and recorded in the Tasks module's own
history. A stage with no stage tasks creates none; stage tasks added to it
later are created the next time the project enters it.

If the Tasks module fails while creating them, the project is still in the new
stage, the stage history says *Creating the stage's tasks failed.*, and they can
be created again — once — with *Create the stage's tasks again* on the stage in
the *Stages* tab.

**With the Tasks module switched off** a project keeps working with nothing
but its own stages, and nothing is lost:

- a completion gate is not applied — the project moves on, and the stage
  history says *The completion gate was not applied: the Tasks module is off.*;
- a stage entered while Tasks is off does not create its stage tasks, then or
  later — the stage history says *The stage's tasks were not created.*;
- a stage can be deleted without its tasks being counted;
- the *Tasks* tab and the stage tasks of the *Stages* tab are not shown;
- the stage tasks and the gates are kept, and apply again to what happens
  after Tasks is switched back on.

Deleting a project deletes its tasks with it (while Tasks is on; with Tasks
off they stay, hidden, because nobody can see the project they belong to).

## Templates

A **template** is a structure a new project can start from — for example
*Showroom fit-out* or *Annual framework contract*: a default description, the
project roles involved, and its stages with everything a project's stage has —
planned duration, responsible roles, deadline alerts, completion gate, whether
the project may be completed from it, and its stage tasks — and the workflow
between them. A template has no Organizations, members, value or linked
records.

**Creating a project from a template** copies all of it into the new project:
its stages, workflow, gates, alerts, stage tasks and default description. The
copy is the project's own. The **first stage's** stage tasks become tasks as the
project is created, a later stage's when the project enters it, as for any
stage. Whatever the person creating the project typed wins over the template —
a description of their own, for one — and every part of the copy can be
changed on the project afterwards. A role of the template can be given to a
member even if it has been archived since.

**Changing a template changes no project.** Editing, archiving or deleting a
template leaves every project created from it exactly as it is; the project
names the template it came from for as long as the template exists.

**Duplicating** a template makes an independent copy, named *… (copy)*, that can
be changed without touching the original. **Archiving** a template takes it out
of the choices for new projects; it is kept, and can be restored.

## Who sees a project

Two rules decide it, always in this order.

**1. Organization reach.** An administrator who can reach every Organization —
any role other than the sales representative's — can see every project. A
sales representative sees a project only when **every** Organization of the
project is one they are assigned; a project for two Organizations, of which
they reach one, does not exist for them. An internal project is visible only to
administrators who can reach every Organization. Nothing below widens this
rule.

**2. Visibility.** Inside their reach, an administrator sees a project when
they:

- hold the permission to see every project (*See every project*), or
- are a member of the project, or
- are one of the people listed on the project, or
- the project is open to everyone.

Whether a project is open to everyone follows the module setting **Who sees a
Project** (`projects.visibility`) — *everyone* who may view projects, or only
its *members* and listed people, the default — unless the project itself is set
to *everyone* or to *members and listed people*.

A project somebody may not see does not exist for them, anywhere: not in a
list, not in its total, not by its address. An address of such a project
answers exactly as an address of one that was never created.

## Switching it on and off

Projects is an optional module. It is on by default and an operator switches it
off, and back on, on the **Modules** screen of the Admin UI
(`/platform/modules`).

While it is off:

- the *Projects* and *Templates* entries and every project and template screen
  are gone from the Admin UI;
- every `/api/v1/admin/projects…` endpoint answers `503` with the code
  `MODULE_DISABLED`;
- its permissions can no longer be granted to a role, and its settings cannot be
  changed — except the switch itself.

Nothing is deleted. Every project, its stages and its history stay in the
database, and everything is back exactly as it was when the module is switched
on again.

## Settings

| Setting | Default | What it decides |
| --- | --- | --- |
| `projects.enabled` | on | Whether the module is switched on. |
| `projects.visibility` | `members` | Who sees a project that follows the setting: `everyone` who may view projects, or its `members` and listed people. |
| `projects.alerts_time_zone` | `Europe/Warsaw` | The time zone in which "today" is counted for projects — the day a stage starts and whether its deadline has passed. It must be an IANA time zone name such as `Europe/Warsaw`; any other value is refused when it is saved. |

## Permissions

| Code | What it allows |
| --- | --- |
| `projects:read` | View projects — the list, a single project and its stage history — subject to the two rules of *Who sees a project*. |
| `projects:write` | Create, edit and delete projects; set their Organizations, members, stages and workflow; move, close and reopen them. Requires `projects:read`. |
| `projects:configure` | Create, edit, duplicate, archive and restore templates. Requires `projects:read`; anybody who may view projects can read the templates, to start a project from one. |

## Links, collaboration, deadline alerts and analytics

*Each of these arrives with a later release of this module and is described
here when it does.*

## For developers

### The API

| Method and path | Permission | What it answers |
| --- | --- | --- |
| `GET /api/v1/admin/projects` | `projects:read` | A page of projects and how many the caller may see: `{ items, nextCursor, total }`. Filters: `state` (repeatable), `organizationId`, `memberId` (an administrator's id or `me`), `roleId`, `templateId`, `stageName` (the current stage's name), `q` (number or title), `sort` (`createdAt` — the default, `value`, or `deadline` — the current stage's; projects without one come last either way), `order` (`asc` or `desc`, default `desc`), `cursor`, `limit` (at most 100). |
| `POST /api/v1/admin/projects` | `projects:write` | `201` `{ data: ProjectDetail }`. Without a `templateId`, `stages` is required; with one, the template's structure is copied and `stages` is refused (`422`), and an unknown or archived template is `422` `PROJECT_TEMPLATE_NOT_FOUND`. |
| `GET /api/v1/admin/projects/:id` | `projects:read` | `{ data: ProjectDetail }`, or `404` `PROJECT_NOT_FOUND` — for a project that does not exist and for one the caller may not see alike. |
| `PATCH /api/v1/admin/projects/:id` | `projects:write` | Title, description, value, start date, with `version`. |
| `DELETE /api/v1/admin/projects/:id` | `projects:write` | `204`; `409` `PROJECT_HAS_LINKS` while records are linked. |
| `PUT /api/v1/admin/projects/:id/organizations` | `projects:write` | The whole set; `422` `PROJECT_ORGANIZATION_OUT_OF_SCOPE`. |
| `PUT /api/v1/admin/projects/:id/members` | `projects:write` | The whole set of members and their roles; `422` `PROJECT_MEMBER_INVALID`. |
| `POST /api/v1/admin/projects/:id/stages` | `projects:write` | `201` `{ data: ProjectStage }`, added at the end. |
| `PATCH /api/v1/admin/projects/:id/stages/:stageId` | `projects:write` | Any attribute; `deadlineOn` sets the deadline by hand, `null` returns it to start + duration. |
| `DELETE /api/v1/admin/projects/:id/stages/:stageId` | `projects:write` | `204`; `409` `PROJECT_STAGE_CURRENT`, `PROJECT_STAGE_LAST` or `PROJECT_STAGE_HAS_TASKS`. |
| `PUT /api/v1/admin/projects/:id/stages/order` | `projects:write` | Every stage id, in the new order. |
| `PUT /api/v1/admin/projects/:id/moves` | `projects:write` | The whole workflow → `{ data: { moves, unreachableStageIds } }`. |
| `POST /api/v1/admin/projects/:id/move` | `projects:write` | `{ toStageId, version }` → `{ data: { project, entry, createdTaskIds, notes } }` — `createdTaskIds` are the stage tasks the move created, `notes` what the entry recorded (`gate_not_applied_tasks_off`, `stage_tasks_skipped`, `tasks_materialize_failed`); `409` `PROJECT_MOVE_NOT_PERMITTED`, `PROJECT_STAGE_GATE_OPEN_TASKS` (`details.openTasks`: `{ id, number, title }[]`), `PROJECT_CHANGED` or `PROJECT_GUARD_REFUSED`. |
| `POST /api/v1/admin/projects/:id/close` | `projects:write` | `{ outcome: 'completed', version }` or `{ outcome: 'lost', lossReasonId, comment?, version }`; `409` `PROJECT_COMPLETION_NOT_PERMITTED` or, when completing, `PROJECT_STAGE_GATE_OPEN_TASKS`; `422` `PROJECT_LOSS_REASON_INVALID`. |
| `POST /api/v1/admin/projects/:id/reopen` | `projects:write` | `{ version }` → back into the stage it was closed in. |
| `GET /api/v1/admin/projects/:id/stage-history` | `projects:read` | Every entry, close and reopen, oldest first. |
| `PUT /api/v1/admin/projects/:id/stages/:stageId/tasks` | `projects:write` | `{ tasks: StageTaskDefinition[] }` (at most 100), replacing the stage's stage tasks → `{ data: ProjectStage }`; `422` for an unknown responsible role. |
| `POST /api/v1/admin/projects/:id/stages/:stageId/materialize-tasks` | `projects:write` | Creates the stage's tasks again after a recorded failure — the stage's `tasksMaterializeFailed` — → `{ data: { created } }`; `409` `PROJECT_STAGE_TASKS_NOT_RETRYABLE` otherwise, `503` `MODULE_DISABLED` while Tasks is off. |
| `GET /api/v1/admin/projects/:id/tasks` | `projects:read` | `{ data: { tasksAvailable, stages: [{ stageId, tasks: TaskSummary[] }] } }`, in stage order; `tasksAvailable: false` and no stages while Tasks is off or for a reader without `tasks:read`. |
| `GET /api/v1/admin/projects/roles`, `…/loss-reasons` | `projects:read` | The dictionaries, with `label` in the reader's language; `active=true` leaves archived rows out. |
| `GET /api/v1/admin/projects/templates` | `projects:read` | `{ data: ProjectTemplateSummary[] }` by name; `active=true` leaves archived templates out. |
| `GET /api/v1/admin/projects/templates/:id` | `projects:read` | `{ data: ProjectTemplateDetail }`, or `404` `PROJECT_TEMPLATE_NOT_FOUND`. |
| `POST /api/v1/admin/projects/templates`, `PUT …/templates/:id` | `projects:configure` | The whole template in one body (`ProjectTemplateBody`: name, description, `roleIds`, `stages` each with a `key` and its `tasks`, `moves` naming stages by key — left out, each stage moves to the next) → `201` / `200` `{ data: ProjectTemplateDetail }`. A key that is the id of one of the template's stages keeps that stage's id. |
| `POST /api/v1/admin/projects/templates/:id/duplicate` | `projects:configure` | `201` `{ data: ProjectTemplateDetail }` — an independent copy. |
| `POST /api/v1/admin/projects/templates/:id/archive`, `…/restore` | `projects:configure` | `{ data: ProjectTemplateDetail }`. |

The request and response shapes are the Zod schemas of
`@endora-commerce/contracts` (`projects.ts`).

### Stage guards and events

A module or a deployment refuses a move, a close or a reopen by registering a
guard in `projectStageGuardRegistry` (`ProjectStageGuardRegistryPort` of
`@endora-commerce/contracts`) from a contribution-only boot hook, declaring the
edge as `contributes-to`. The guard is asked with the project, the stages and
the kind (`move`, `close_completed`, `close_lost`, `reopen`) before anything is
written, and answers `{ allow: true }` or `{ allow: false, reason }`; a refusal
is `409` `PROJECT_GUARD_REFUSED` with the reason as its message. A guard whose
module is switched off is skipped.

After each committed write the module emits, once:
`projects.project.created.v1`, `projects.stage.moved.v1` (with the stage names
as they were), `projects.project.closed.v1` (with the outcome, the stage and,
when lost, the loss reason's code) and `projects.project.reopened.v1`.

### The `project` Task context

The module owns the Task context type `project`, registered in the Tasks
module's `taskContextRegistry` from a contribution-only boot hook (see the
Tasks page, *Task contexts*). A task of a project carries
`contextType: 'project'`, the project's id as `contextId` and one of its
stages' ids as `contextGroupId`; it is labelled `<number> <title>`, linked to
`/projects/:id`, and its group is labelled with the stage's name. Every answer
goes through `ProjectAccess`, so the Tasks module shows a project's tasks to
exactly the people who may see the project. To put a task into a stage, create
it with `POST /api/v1/admin/tasks` and that context.

The module reads and writes tasks only through `taskReadPort` and
`taskWritePort`, after deciding that Tasks is present (`degrades-without`
edges). Stage tasks are created after the move's own transaction has
committed, one audited `tasks.task.create` command each. The note of a stage
task left unassigned is stored as the responsible role (`role:<id>`), not as a
sentence; the descriptor's `renderNote` words it in each reader's language.

### One read path

Every table a project owns is classified **rule-scoped**: no ORM filter narrows
it, and the module enforces both rules of *Who sees a project* itself, in one
place — the `ProjectAccess` service. Every list, count and read by id in the
module either carries its SQL predicate or starts from a project it returned,
and a test of the module's own refuses a read of a project table anywhere else.
Code added to this module reads projects through it.
