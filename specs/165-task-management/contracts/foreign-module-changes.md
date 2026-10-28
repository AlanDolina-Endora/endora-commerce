# Contract: changes outside the `tasks` module

This lists every file outside `packages/modules/tasks/` that the feature changes. It is grouped by
owner and carries the reason for each change. A change not on this list needs a line here first.

## A. `packages/contracts/src/`

| File | Change | Why |
| --- | --- | --- |
| `tasks.ts` | Statuses become codes (`taskStatusCodeSchema`). `TASK_STATUSES` → `TASK_DEFAULT_STATUS_CODES`, kept for the seed and tests. `TASK_CLOSED_STATUSES` is removed in favour of `TASK_STATUS_CATEGORIES` and `closed`. Adds every §1–§5 schema of `admin-api.md`. `NewContextTask.assigneeIds` and `sourceKey`. Optional `TaskContextDescriptor.existingContexts`. Events per `data-model.md` §8. | R-1, R-2, R-19 |
| `record-references.ts` | `RECORD_REFERENCE_TYPES` and `RECORD_DOCUMENT_KINDS` gain `opportunity` and `project`. | R-5 |
| `crm.ts` | `OpportunityReadPort` gains `findByIds` and `search`. | R-5, R-16 |
| `projects.ts` | `ProjectReadPort` gains `findByIds` and `search`. The reused `TaskSummarySchema` follows the new shape. | R-5 |
| `custom-fields.ts` | `supportedEntityTypeSchema` gains `'task'`. | R-8 |
| `saved-list-views.ts` | Task create and update view schemas. | R-13 |
| `admin-preferences.ts` | Key `listViewModes` (keys, patch, read, defaults). | R-14 |
| `*.test.ts` beside each | Updated for the above. | — |

Each change gets a changeset. The `tasks.ts` event and status changes are breaking; the rest
are additive (`release-intent.md`).

## B. `packages/admin-kit/`

| Path | Change |
| --- | --- |
| `src/components/tags/` (new) | `TagChips`, `TagMultiSelect` and `useTagOptions`, promoted from CRM with the options source injected (R-10). |
| `src/components/kanban/MoveToMenu.tsx` (new) | Promoted from CRM (R-11). |
| `src/components/references/` | Document groups and link targets for `opportunity` and `project`. |
| `src/lib/admin-preferences/{store,use-admin-preference}.ts` | `listViewModes` and `useListViewModePreference(listId)`. |
| Tests beside each | — |

## C. `packages/modules/crm/`

| Path | Change |
| --- | --- |
| `src/admin/components/{TagPicker,MoveToMenu}.tsx` | Replaced by kit imports. Callers updated, with no behaviour change. CRM's admin tests run before and after. |
| `src/backend/services/opportunity-read-port.ts` | `findByIds` and `search`. |
| `src/backend/services/reference-service.ts`, document lookup service | Resolvers and lookup groups for `opportunity` (through its own service) and `project` (through `projectReadPort`, `degrades-without`; an edge already exists or is added with a `whenAbsent` sentence). |
| `src/migrations/<stamp>_crm_opportunity_reference_kinds.ts` (new) | Widens `crm_opportunity_references_target_type_check`. |
| `src/manifest.ts` | Edge on `projects`, if not already declared. |
| `i18n/{en,pl}.json` | Group labels. |

## D. `packages/modules/projects/`

| Path | Change |
| --- | --- |
| `src/backend/services/stage-task-service.ts` | Its `CLOSED` set becomes `summary.closed`. The assignee becomes `assigneeIds: [holder]`. `sourceKey = stageTaskDefinition.id`, which makes `retry()` safe (#450). |
| `src/backend/services/task-context-descriptor.ts` | `existingContexts` (#450). |
| `src/backend/services/project-access.ts` | System-mode existence query. `PROJECT_ACCESS_READERS` gains the new reader files. |
| `src/backend/services/project-read-port.ts` | `findByIds` and `search`. |
| `src/backend/services/reference-service.ts`, document lookup service | Resolvers and groups for `opportunity` and `project`. |
| `src/migrations/<stamp>_projects_reference_kinds.ts` (new) | Widens `project_references_target_type_check`. |
| `src/admin/pages/project-detail/tabs/TasksTab.tsx` | Status chip from `status.name` and `status.color`, and assignees as a list. The `tasks.status.*` keys are removed from `i18n/{en,pl}.json`. |

## E. `packages/modules/custom_fields/`

`custom-field-registry.ts` (`SUPPORTED_ENTITIES.task`), `host-storage-binding.ts`,
`i18n/{en,pl}.json`, and the three tests that enumerate the types (R-8).

## F. `packages/modules/admin_users/`

No code change. The service ignores unknown keys and merges by key, so `listViewModes` needs only the contract. If the per-list merge needs special logic, as `listPageSizes` does, `admin-preference-document.ts` gets one case.

## G. Demo, tests, generated files

- **Demo:** `packages/demo-composition/src/projects.ts` writes `task_assignees`. The `tasks` module's demo step is new (R-23). The count in `backend/test/integration/demo/demo-shop.test.ts` moves.
- **Tests found by the planning sweep.** They pin `assignedAdminUserId`, the four literal statuses or `TASK_STATUSES` and are updated in the phase that changes them:
  - `backend/test/integration/tasks/{tasks-crud,write-port,migration,off-state}.test.ts`
  - `backend/test/contract/tasks/tasks.contract.test.ts`
  - `backend/test/perf/tasks/context-visibility.perf.test.ts`
  - `backend/test/integration/projects/{task-context,templates,visibility,stage-tasks,completion-gate}.test.ts`, `helpers.ts`
  - `admin/test/modules/tasks/*`, `admin/test/modules/projects/ProjectDetail.tasks-tab.test.tsx`
- **The derived-ledger rule** (AGENTS.md *traps*): before closing each phase, grep `backend/test/**` and `admin/test/**` for every moved path, which includes the two CRM component files.
- **Generated files**, committed in the same merge request: `composer:generate`, `manifests:generate` and `pnpm install --lockfile-only` (the tasks package gains peers: `bullmq`, `ioredis`, `@endora-commerce/email-components`).
- **Ledgers that 163 also had to touch**, each in the change that needs it:
  - `packages/contracts/src/errors.ts` (`ERROR_CODES`);
  - `backend/test/fixtures/error-code-routing/reference-ledgers.ts`;
  - `backend/test/helpers/package-entities.ts`;
  - `backend/test/fixtures/openapi-baseline.json` (regenerated);
  - `packages/demo-composition/src/composition.ts` (the Tasks demo step).
- **The scheduled-work probe copy test** (`backend/test/unit/tenancy/scheduled-work-probes.test.ts`) gains the `tasks` copy.

## H. If `tasks` were deleted

What it leaves behind:
- the inert `existingContexts` method in Projects' descriptor;
- the reference kinds `opportunity` and `project`, which are platform-wide and not Tasks concepts;
- the promoted kit components, which are used by CRM.

No other module would name a Tasks table.
