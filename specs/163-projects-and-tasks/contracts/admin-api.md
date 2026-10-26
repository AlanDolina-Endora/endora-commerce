# Contract: Admin HTTP API

All endpoints are under `/api/v1/admin`, JSON, camelCase, Zod schemas in
`packages/contracts/src/tasks.ts` and `packages/contracts/src/projects.ts` (written before any
route — Principle II). Every route is gated with `requireAdmin('<code>')` as a literal. Errors use
the platform envelope `{ code, message, details? }`. A Project that is out of reach or invisible
answers **404 `PROJECT_NOT_FOUND`**, identical to a non-existent one (Principle XI). While a
module is off, its routes answer 503 `MODULE_DISABLED` through the platform gate.

## 1. Tasks (`tasks`)

| Method & path | Permission | Request → Response | Notes |
| --- | --- | --- | --- |
| `GET /tasks` | `tasks:read` | `TaskListQuery` (`status[]`, `assignee` = id \| `me` \| `none`, `dueFrom`, `dueTo`, `overdue`, `contextType`, `contextId`, `q`, `cursor`, `limit ≤ 100`) → `TaskListResponse { items: TaskSummary[], nextCursor }` | hidden contexts pre-filtered (R-9) |
| `GET /tasks/mine` | `tasks:read` | → `TaskSummary[]` open Tasks of the caller, by `dueOn` nulls last | *My Tasks* |
| `POST /tasks` | `tasks:write` | `CreateTaskBody { title, description?, assignedAdminUserId?, dueOn?, context? }` → `TaskDetail` | `context` accepted only for a registered + present type whose `visibleContextIds` contains it (else 422 `TASK_CONTEXT_INVALID`) |
| `GET /tasks/:id` | `tasks:read` | → `TaskDetail` (incl. `context: { type, id, groupId, label, href, groupLabel } \| null`) | 404 `TASK_NOT_FOUND` if hidden |
| `PATCH /tasks/:id` | `tasks:write` | `UpdateTaskBody` (title, description, dueOn, assignedAdminUserId, status, context) → `TaskDetail` | assignment to another person notifies (FR-032) |
| `DELETE /tasks/:id` | `tasks:write` | → 204 | |
| `GET /tasks/lookups/assignees?q=` | `tasks:write` | → `{ id, name, email }[]` active admins | |
| `GET /tasks/:id/history` | `tasks:read` | → `RecordHistoryPage` | audit read, `objectType: 'task'` |

`GET /tasks` orders newest first, keyset-paged by `(createdAt, id)`; it returns no total.

`TaskSummary { id, number, title, status, dueOn, overdue, assignee: { id, name, active } | null,
context: { type, label, href, groupLabel } | null }`.

## 2. Projects (`projects`)

### 2.1 Projects

| Method & path | Permission | Request → Response |
| --- | --- | --- |
| `GET /projects` | `projects:read` | `ProjectListQuery` (`state[]`, `organizationId`, `memberId` \| `me`, `roleId`, `templateId`, `stageName`, `q` (number/title), `cursor`, `limit ≤ 100`, `sort` ∈ createdAt\|value\|deadline) → `{ items: ProjectSummary[], nextCursor, total }` |
| `POST /projects` | `projects:write` | `CreateProjectBody { title, description?, value?: { amount, currency }, startOn?, organizationIds[], templateId?, members?: { adminUserId, roleIds[] }[], visibility?, viewerIds?, customFieldValues? }` → `ProjectDetail` |
| `GET /projects/:id` | `projects:read` | → `ProjectDetail` (incl. stages, moves, members, organizations, links count, unread messages, `permissions: { canWrite, canConfigure }`) |
| `PATCH /projects/:id` | `projects:write` | `UpdateProjectBody` (title, description, value, startOn, visibility, viewerIds, customFieldValues, `version`) → `ProjectDetail` |
| `DELETE /projects/:id` | `projects:write` | → 204; 409 `PROJECT_HAS_LINKS` while links exist |
| `PUT /projects/:id/organizations` | `projects:write` | `{ organizationIds[] }` → `ProjectDetail`; 409 `PROJECT_ORGANIZATION_IN_USE`; 422 `PROJECT_ORGANIZATION_OUT_OF_SCOPE` |
| `PUT /projects/:id/members` | `projects:write` | `{ members: { adminUserId, roleIds[] }[] }` → `ProjectDetail` |

`ProjectSummary { id, number, title, state, currentStage: { id, name, color, deadlineOn,
overdue } | null, organizations: { id, name }[], value, projectManagers: { id, name }[],
createdAt, closedAt }`.

### 2.2 Stages and moves

| Method & path | Permission | Request → Response |
| --- | --- | --- |
| `POST /projects/:id/stages` | `projects:write` | `StageBody` → `ProjectStage` |
| `PATCH /projects/:id/stages/:stageId` | `projects:write` | `StageBody` partial (name, color, plannedDurationDays, responsibleRoleIds, alertOffsetsDays, completionGate, completionPermitted, deadlineOn \| null to recompute) → `ProjectStage` |
| `DELETE /projects/:id/stages/:stageId` | `projects:write` | → 204; 409 `PROJECT_STAGE_CURRENT` \| `PROJECT_STAGE_HAS_TASKS` \| `PROJECT_STAGE_LAST` |
| `PUT /projects/:id/stages/order` | `projects:write` | `{ stageIds[] }` |
| `PUT /projects/:id/moves` | `projects:write` | `{ moves: { fromStageId, toStageId }[] }` → `{ moves, unreachableStageIds[] }` |
| `PUT /projects/:id/stages/:stageId/tasks` | `projects:write` | `{ tasks: StageTaskDefinition[] }` (Stage Task definitions, R-7) |
| `POST /projects/:id/stages/:stageId/materialize-tasks` | `projects:write` | retry after `tasks_materialize_failed` only → `{ created }`; 409 otherwise |
| `POST /projects/:id/move` | `projects:write` | `{ toStageId, version }` → `MoveResult { project, entry, createdTaskIds[], notes[] }`; 409 `PROJECT_MOVE_NOT_PERMITTED` \| `PROJECT_STAGE_GATE_OPEN_TASKS { openTasks[] }` \| `PROJECT_CHANGED` \| `PROJECT_GUARD_REFUSED { reason }` |
| `POST /projects/:id/close` | `projects:write` | `{ outcome: 'completed' } \| { outcome: 'lost', lossReasonId, comment? }` + `version` → `ProjectDetail`; 409 `PROJECT_COMPLETION_NOT_PERMITTED` \| gate as above |
| `POST /projects/:id/reopen` | `projects:write` | `{ version }` → `ProjectDetail` |
| `GET /projects/:id/stage-history` | `projects:read` | → `StageEntry[]` |

### 2.3 Links and the record panel

| Method & path | Permission | Request → Response |
| --- | --- | --- |
| `GET /projects/:id/links` | `projects:read` | → `ProjectLink[] { id, kind, recordId, available, number?, status?, amount?, currency?, href? }` |
| `POST /projects/:id/links` | `projects:write` | `{ kind, recordId }` → `ProjectLink`; 404 `PROJECT_RECORD_NOT_FOUND`; 409 `PROJECT_RECORD_ALREADY_LINKED { project? }`; 422 `PROJECT_LINK_ORGANIZATION_MISMATCH`; 503 `MODULE_DISABLED` (crm / quote_requests off) |
| `DELETE /projects/:id/links/:linkId` | `projects:write` | → 204 |
| `GET /projects/records/:kind/:recordId/project` | `projects:read` (+ owner's read permission for the kind) | → `ProjectSummary` \| 404 (R-11) |
| `GET /projects/:id/tasks` | `projects:read` | → `{ stageId, tasks: TaskSummary[] }[]` via `taskReadPort`; 200 with `tasksAvailable: false` when `tasks` is off |

### 2.4 Collaboration

| Method & path | Permission | Notes |
| --- | --- | --- |
| `GET /projects/:id/comments?kind=` | `projects:read` | resolved references (R-14) |
| `POST /projects/:id/comments` | `projects:write` | `{ kind, body }` |
| `PATCH` / `DELETE /projects/:id/comments/:commentId` | `projects:write` | notes, author only (403 `PROJECT_NOTE_NOT_AUTHOR`) |
| `POST /projects/:id/messages/read` | `projects:read` | `{ throughMessageId }` |
| `GET /projects/:id/attachments` | `projects:read` | |
| `POST /projects/:id/attachments` | `projects:write` | `{ assetId }` (private, live, not active content) |
| `POST /projects/:id/attachments/upload` | `projects:write` | multipart; upload-then-attach with compensation |
| `DELETE /projects/:id/attachments/:attachmentId` | `projects:write` | |
| `GET /projects/:id/history?cursor=` | `projects:read` | `RecordHistoryPage`, cap 500 |
| `GET /projects/lookups/mentionable?projectId=&q=` | `projects:write` | active admins with `projects:read` who could see the Project (R-4) |
| `GET /projects/lookups/documents?projectId=&q=` | `projects:write` | `@@` list → `RecordDocumentLookupResponse { groups: { kind: 'order' \| 'quote_request' \| 'task', items: { id, label, sublabel? }[] }[] }`, each group only with its read permission and present owner; the same schema CRM serves at `GET /crm/lookups/documents` (FR-044) |

### 2.5 Configuration

| Method & path | Permission |
| --- | --- |
| `GET /projects/roles` | `projects:read` |
| `POST`/`PATCH /projects/roles[/:id]`, `POST /projects/roles/:id/archive` \| `/restore` | `projects:configure` |
| `GET /projects/loss-reasons`; `POST`/`PATCH`/archive/restore | `projects:read`; `projects:configure` |
| `GET /projects/templates`, `GET /projects/templates/:id` | `projects:read` |
| `POST /projects/templates`, `PUT /projects/templates/:id` (whole Template graph in one body, one Command), `POST …/:id/duplicate`, `…/archive`, `…/restore` | `projects:configure` |

Settings are edited on the generic `/settings?group=projects` screen (no module route).

### 2.6 Analytics (`projects:analytics`)

`GET /projects/analytics/{summary|durations|time-in-stage|losses|value|top-open|managers}` with
`AnalyticsQuery { from, to, templateId?, organizationId?, projectManagerId? }`; every response
`{ from, to, projectCount, excluded: { noValue }, data }`. Money is `{ currency, amount }[]`.
