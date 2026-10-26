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

The project screens — the project list, a project's own screen with its stage
bar, and the configuration of roles, templates and loss reasons — arrive in the
next releases of this module. Until then projects are read through the API
below.

## Running a project

*Creating a project, editing its stages and workflow, moving it from stage to
stage and closing it as completed or lost arrive in the next release of this
module.*

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
| `projects.alerts_time_zone` | `Europe/Warsaw` | The time zone in which "today" is counted for projects — the day a stage starts and whether its deadline has passed. |

## Permissions

| Code | What it allows |
| --- | --- |
| `projects:read` | View projects — the list and a single project — subject to the two rules of *Who sees a project*. |

## Tasks, templates, links, collaboration, deadline alerts and analytics

*Each of these arrives with a later release of this module and is described
here when it does.*

## For developers

### The API

| Method and path | Permission | What it answers |
| --- | --- | --- |
| `GET /api/v1/admin/projects` | `projects:read` | A page of projects, newest first, and how many the caller may see: `{ items, nextCursor, total }`. Filters: `state` (repeatable), `organizationId`, `memberId` (an administrator's id or `me`), `roleId`, `templateId`, `stageName` (the current stage's name), `q` (number or title), `order` (`asc` or `desc`), `cursor`, `limit` (at most 100). |
| `GET /api/v1/admin/projects/:id` | `projects:read` | `{ data: ProjectSummary }`, or `404` `PROJECT_NOT_FOUND` — for a project that does not exist and for one the caller may not see alike. |

The request and response shapes are the Zod schemas of
`@endora-commerce/contracts` (`projects.ts`).

### One read path

Every table a project owns is classified **rule-scoped**: no ORM filter narrows
it, and the module enforces both rules of *Who sees a project* itself, in one
place — the `ProjectAccess` service. Every list, count and read by id in the
module either carries its SQL predicate or starts from a project it returned,
and a test of the module's own refuses a read of a project table anywhere else.
Code added to this module reads projects through it.
