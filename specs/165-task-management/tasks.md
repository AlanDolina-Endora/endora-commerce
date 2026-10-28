---
description: "Task list for Task management — growing the Tasks module"
---

# Tasks: Task management — growing the Tasks module

**Input**: Design documents from `specs/165-task-management/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED. Constitution III is non-negotiable.
- In every phase the test tasks come first.
- Run each test and see it fail *for the stated reason* before starting the implementation task that turns it green.
- Report which tests were seen red, under the task, as 163 did.

**Organization**: by user story. Phases 3–5 (US1–US3, all P1) together are the MVP. Phase 2 carries the two shape changes every story stands on: statuses become codes and assignees become a list. It also carries the draft/private visibility predicate, because every later read must be born honouring it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: the task can run in parallel with its neighbours **inside its own phase**: it touches a different file and depends on no unfinished task of that phase.
- **[US#]**: the user story of `spec.md` the task serves. Setup, Foundational and Polish tasks carry none.

## Path conventions

- **Module:** `packages/modules/tasks/` (written `T/` below):
  - `src/manifest.ts`;
  - `src/backend/`, with all composition in the **single** `src/backend/index.ts`, one delimited section per area (`check:port-dependencies` reads only that file);
  - `src/migrations/`, `src/admin/`;
  - `i18n/` and `docs/` at the package root.
- **Other modules:** `C/` = `packages/modules/crm/`, `P/` = `packages/modules/projects/`, `K/` = `packages/admin-kit/src/`, `X/` = `packages/contracts/src/`.
- **Tests:**
  - Unit tests sit beside their subject as `*.test.ts`.
  - Backend tests: `backend/test/{contract,integration,perf}/tasks/`.
  - Admin tests: `admin/test/modules/tasks/`.
- **Targeted runs:**
  - `pnpm --filter backend exec vitest run <path>`
  - `pnpm --filter @endora-commerce/mod-tasks run test`
  - `pnpm --filter admin exec vitest run <path>`
  - `pnpm --filter @endora-commerce/admin-kit run test`
  - `pnpm --filter @endora-commerce/contracts run test`

## Standing rules for every task

1. **Read before writing.**
   - Read the routed convention for what you are about to do (`AGENTS.md` § *Where the rest of it lives*). In particular:
     - `module-migrations.md` before T009;
     - `module-activation.md` before any gate, worker or zone;
     - `module-admin-surfaces.md` before permissions and palette actions;
     - `module-i18n.md` before strings;
     - `release-intent.md` before changesets.
   - Read the prior art the task names: CRM for workflow, tags and board; Projects for comments, references, attachments, mentions and sweeps; quote_requests for saved views.
2. **Re-derive a premise marked "checked first" or "verify"** in `research.md` from the tree, at the task that names it. Record the finding under the task.
3. **Rebuild a package you edited** (`pnpm --filter <pkg> run build`) before running tests against it.
4. **Regenerate generated files, never edit them.** Run `pnpm install --lockfile-only` beside `manifests:generate`.
5. **Touch a file outside `packages/modules/tasks/` only if `contracts/foreign-module-changes.md` lists it**, or it is one of the ledgers in rule 9. Otherwise stop and report.
6. **Every read of a Task-owned table goes through `TaskVisibility` / `TaskAccess`** (R-3, R-21). The seam test (T017) enforces it.
7. **Never run `db:fresh`, `db:reset`, `setup` or `module:*`** against the development database unprefixed.
8. **Commit** in conventional style with `git commit -s` (DCO). Add no `Co-Authored-By` or AI trailer.
9. **Ledgers that 163 had to touch outside the list.** Update each in the change that needs it:
   - `X/errors.ts` `ERROR_CODES`, plus the manifest `errorCodes`, each in the change that adds a code's first raise site;
   - `backend/test/fixtures/error-code-routing/reference-ledgers.ts` (`MINTED_ERROR_CODES`);
   - `backend/test/helpers/package-entities.ts` (new entities);
   - `backend/test/fixtures/openapi-baseline.json` (regenerate it with `UPDATE_OPENAPI_BASELINE=1` and check that only Tasks routes changed);
   - `backend/scripts/check-command-coverage.ts` (only if a new command-coverage ignore needs it).
10. **Admin tests on Node 26:** if `window.localStorage` is undefined, run with `NODE_OPTIONS=--no-experimental-webstorage` (163 T012).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the contract shapes, the manifest declarations and two measured facts the design depends on. Nothing is user-visible yet.

- [X] T001 Measure the two premises the plan defers to implementation and record both answers under this task. Do not proceed past Phase 2 if (a) or (b) is answered "no" without picking the planned fallback.
  - (a) Can one Command write extra audit rows? Read `packages/platform/src/` for the `CommandBus` and the audit writer API.
  - (b) Does `adminNotificationRecordPort.record` share the caller's EntityManager or transaction? Read `packages/modules/admin_notifications/src/backend/`.
  - **(a) Measured 2026-10-28: yes.** `CommandBus.run` (`packages/platform/src/commands/command-bus.ts:46-78`) opens one `scoped.transactional(em => …)` and writes exactly **one** row itself (`:57-69`, `audit.recordWithin(em, …)`); nothing stops `run` from adding more. A Command's `run` receives that transactional em as `ctx.em` (`command.ts:39-43`). The published writer `recordAuditFromContext(auditLog, em, input)` (`commands/audit-from-context.ts:27-42`, exported from `@endora-commerce/platform/commands`, `index.ts:59`) calls `AuditPort.recordWithin(em, …)` (`kernel/ports/audit.ts:64`), whose implementation is `em.create` + `em.persist` with **no fork and no flush** (`kernel/audit/audit-log-service.ts:46-50`) — so the extra rows commit or roll back with the Command. `tasks` already has `auditLogService: AuditPort` in its cradle (`T/backend/index.ts:46`, used at `:109-116`). Precedent for a batch of rows in one unit of work: `CartAuditService` (comment at `audit-log-service.ts:39-43`). `check:command-coverage` does not inspect `recordWithin`/`recordAuditFromContext` calls (no match in `backend/scripts/check-command-coverage.ts`). Two things the reassignment Command must do itself: `recordAuditFromContext` fills only the actor, not `ipAddress`/`userAgent`/`requestId` (the bus fills those from `getRequestMeta`, `command-bus.ts:49,66-68`), and each row is a managed entity, so 5 000 rows are 5 000 entities in the identity map of one flush — inside the R-1 bound, but worth the perf test. **R-1's planned path stands; the batched-Commands fallback is not needed.**
  - **(b) Measured 2026-10-28: no.** `adminNotificationRecordPort.record(input)` takes no EntityManager (`packages/contracts/src/admin-notifications.ts:94-96`; adapter `admin_notifications/src/backend/services/admin-notification-port.ts:23-25`). `AdminNotificationService.record` calls `this.emFactory()` (`admin-notification-service.ts:108`) and `persistAndFlush` (`:121`), then `pruneStale` on another fresh fork (`:122`, `:330`). `emFactory` is `() => forkScopedEm(orm)` (`packages/platform/src/kernel/container.ts:80`), i.e. `orm.em.fork()` (`tenancy/scoped-em.ts:10-12`); MikroORM 6.6.16's `fork` copies the transaction context only under `keepTransactionContext` (`@mikro-orm/core/EntityManager.js:1436-1438`), which is not passed — so the bell row is written on its own connection in autocommit, never inside the caller's transaction. **Planned fallback chosen: delivery row first (its unique `(reminder_id, admin_user_id)` is the claim), bell after commit.** One premise of that fallback is false: `admin_notifications` has **no** de-duplication on `subjectId + kind + recipient` — the table has a plain `@Index()` only (`admin-notification.entity.ts:41`) and `record` inserts unconditionally. The fallback does not need it (the delivery row is the claim), but the consequence must be written into the spec before Phase 7: the bell becomes **at most once** too (a crash between the delivery commit and `record` loses it), which contradicts SC-004 "exactly once" for the bell and FR-035 "at least once". The only way to keep exactly-once is a co-transactional variant of the port (`recordWithin(em, …)`) in `admin_notifications`, which `contracts/foreign-module-changes.md` does not list — an owner/architect decision for Phase 7, not taken here.
  - **Decided 2026-10-28 (orchestrator ruling 3):** add the co-transactional `recordWithin(em, …)` to the `admin_notifications` record port (additive; `foreign-module-changes.md` §E2). Implemented at T072, not before.
- [X] T002 [P] Write failing schema tests in `X/tasks.test.ts`. Cover one accept case and one reject case for every request schema of `contracts/admin-api.md` §1–§5:
  - `assigneeIds` ≤ 20, unique;
  - `tagIds` ≤ 50;
  - `dueOn` and `dueAt` mutually exclusive;
  - `links` kinds;
  - status `{to, from}`;
  - reminder absolute xor relative, recipients 1–21;
  - status code snake_case;
  - colour `#rrggbb`;
  - list query `sort` and `dir`, repeatable filters normalised to arrays;
  - `NewContextTask.sourceKey` ≤ 100;
  - the `UpdateTaskBody` refusal of `status`.
  - The 163 file was rewritten on the new shape; its still-valid cases (context all-or-nothing, title bounds, list page shape, batch max) were kept. Beyond the list above it also pins the vocabulary and limits, the absence of `TASK_STATUSES` / `TASK_CLOSED_STATUSES`, the board query (`perColumn` 1–50, no cursor or sort), every §2–§5 body, the summary and board response shapes, the four event names and R-20's codes.
  - Seen red 2026-10-28: 41 of 47 failed for the stated reason — every new export was `undefined` (`Cannot read properties of undefined (reading 'safeParse')`), `TASKS_EVENTS` still had `ASSIGNED`, `TASKS_ERROR_CODES` lacked `TASK_STATUS_UNKNOWN`. The 6 that passed are 163 cases whose shape did not change. Green after T004 (47/47).
- [X] T003 [P] Write failing tests in `X/record-references.test.ts` for the grammar with `opportunity` and `project`:
  - format, extract and split;
  - `RECORD_DOCUMENT_KINDS` order: order, quote_request, task, opportunity, project;
  - an unknown type is left as text.

  Also write failing tests in `X/admin-preferences.test.ts` for `listViewModes`:
  - kebab-case list id;
  - values `list` / `board`;
  - `null` deletes the entry;
  - the tolerant read falls back to `{}`.
  - The 163 cases that used `project` or `opportunity` as the *unknown* type (extract, split, `RecordReferenceSchema`, the document-kind refusal) now use `campaign`; `[[project:42]]` (not a uuid) is still left as text.
  - Seen red 2026-10-28: 10 failed — `record-references.test.ts` 5 (`opportunity` / `project` not in the enum, not extracted or split, `RECORD_DOCUMENT_KINDS` the three of 163), `admin-preferences.test.ts` 5 (`listViewModes` absent from the keys and the defaults, refused by the strict patch, missing on read). The four `listViewModes` refusal cases passed red only because the strict patch refuses any unknown key; they stay meaningful once the key exists. Green after T005.
- [X] T004 Implement `X/tasks.ts` per `contracts/admin-api.md`, `contracts/ports-and-events.md` and `data-model.md` §8. Every later story adds no contract.
  - Status codes: `TASK_DEFAULT_STATUS_CODES`, `TASK_STATUS_CATEGORIES`, `taskStatusCodeSchema`.
  - Limits: `TASK_ASSIGNEES_MAX`, `TASK_TAGS_MAX`, `TASK_HIERARCHY_DEPTH_MAX`, `TASK_STATUS_REASSIGN_MAX`, `TASK_ATTACHMENT_MAX_BYTES`, `TASK_REMINDER_GRACE_MS`, `TASK_REMINDERS_MAX`.
  - Every request and response schema.
  - `TaskRecord` and `NewContextTask` in the new shape.
  - Optional `TaskContextDescriptor.existingContexts`.
  - The event schemas in the new shape.
  - `TASKS_ERROR_CODES`, extended with R-20's codes.
  - Remove `TASK_CLOSED_STATUSES` and `tasks.task.assigned.v1`.
  - T002 green.
  - Then run `pnpm -r run typecheck` and paste the list of consumer errors under this task: it is Phase 2's worklist, and it must match `foreign-module-changes.md` §G.
  - **Deviations from `contracts/admin-api.md`, each a judgement call Phase 2 may revisit:**
    - `GET /tasks` keeps 163's `{items, nextCursor}` (admin-api §1 writes `{data, nextCursor, prevCursor?}`); renaming `items` is a breaking change no requirement asks for. `prevCursor` is added as optional.
    - Custom-field values are `customFieldValues`, not `customFields` — the Projects precedent (`X/projects.ts:268,285,706`) and the name `CustomFieldValuesPanel` reads.
    - `TaskDetail` lists its sub-tasks as `subtaskItems`: `subtasks` is already the summary's `{closed, total}`, which the detail extends — admin-api §1 uses one name for both.
    - `TaskDetail.createdBy` keeps 163's name for admin-api's `creator`.
    - A link is `{id, kind, recordId, available, label, url}`, `id` being the link's own id that `DELETE /tasks/:id/links/:linkId` takes; admin-api's `{kind, id, …}` cannot carry both.
    - `DELETE /tasks/:id` is written as "204" **and** "reports `{subtasksDetached}`"; `TaskDeleteResponseSchema` (`{data: {subtasksDetached}}`) exists, and US5 decides between a 200 with that body and a bare 204.
    - `UpdateTaskBody` also refuses `draft` (publishing is `POST /publish`, one-way). `CreateTaskBody` refuses `private` together with a `context` in the schema as well as in the database check (FR-038). A priority may not be created with the code `none`, the filter token.
    - Bounds the contract did not name: `TASK_LINKS_MAX` 20 (from admin-api §1), `TASK_REMINDER_RECIPIENTS_MAX` 21, `TASK_REMINDER_OFFSET_MAX_MINUTES` 30 days, `TASK_MINE_MAX` 500, `TASK_BOARD_PER_COLUMN_{DEFAULT,MAX}` 25/50.
    - `NewContextTask` is now `z.input<typeof NewContextTaskSchema>` (T002 tests `sourceKey` ≤ 100, which needs a schema); it gains `contextGroupId?` per `ports-and-events.md` §2. `TaskRecord` also gains `dueAt`.
    - The R-20 codes are **not** added to `ERROR_CODES` (`X/errors.ts`): each joins it with its first raise site (standing rule 9, 163 T008 precedent).
  - **Consumer worklist, measured 2026-10-28** with `pnpm -r --no-bail run typecheck` after rebuilding every package but `mod-tasks` and `mod-projects` (both fail to build until Phase 2): **55 errors in 17 files**. Every one is the old shape — `TaskStatus` / `TASK_STATUSES` / `TASK_CLOSED_STATUSES` / `TaskAssignedEvent` / `TASKS_EVENTS.ASSIGNED` no longer exported, `assignedAdminUserId` / `assignee` gone, `status` a string where an object is expected, `toCategory` missing, `status` no longer in `UpdateTaskBody`:
    - `packages/modules/tasks/src/backend/admin-search-provider.ts`: :6 TS2724
    - `packages/modules/tasks/src/backend/entities/task.entity.ts`: :2 TS2724; :2 TS2724
    - `packages/modules/tasks/src/backend/services/task-commands.ts`: :5 TS2724; :9 TS2724; :122 TS2353; :171 TS2339; :211 TS2741
    - `packages/modules/tasks/src/backend/services/task-read-port.ts`: :50 TS2353
    - `packages/modules/tasks/src/backend/services/task-service.ts`: :5 TS2305; :17 TS2724; :87 TS7006; :205 TS2367; :207 TS2367; :387 TS2339; :421 TS2339; :431 TS2339; :432 TS2339; :433 TS2339; :435 TS2339; :482 TS2740; :614 TS2322
    - `packages/modules/tasks/src/backend/services/task-write-port.ts`: :71 TS2339
    - `packages/modules/projects/src/backend/services/stage-task-service.ts`: :4 TS2305; :258 TS2339; :263 TS2339; :268 TS2322
    - `admin/test/modules/projects/ProjectDetail.tasks-tab.test.tsx`: :79 TS2322
    - `admin/test/modules/tasks/TaskDetail.test.tsx`: :142 TS2322; :164 TS2561; :165 TS2561; :180 TS2561
    - `admin/test/modules/tasks/TasksList.test.tsx`: :44 TS2322
    - `admin/test/modules/tasks/tasks-fixtures.tsx`: :98 TS2322; :115 TS2719
    - `packages/modules/projects/src/admin/pages/project-detail/tabs/TasksTab.tsx`: :164 TS2551
    - `packages/modules/tasks/src/admin/api.ts`: :8 TS2724
    - `packages/modules/tasks/src/admin/components/StatusBadge.tsx`: :2 TS2724
    - `packages/modules/tasks/src/admin/components/task-columns.tsx`: :63 TS2551; :64 TS2551
    - `packages/modules/tasks/src/admin/pages/TaskDetail.tsx`: :6 TS2724; :10 TS2724; :148 TS2353; :151 TS2353; :219 TS2322; :223 TS7006; :272 TS2551; :274 TS2551; :275 TS2551; :282 TS2551; :401 TS2551; :414 TS2551
    - `packages/modules/tasks/src/admin/pages/TasksList.tsx`: :4 TS2724; :4 TS2724; :185 TS7006
  - **Against `foreign-module-changes.md` §G/§D:** every file outside `packages/modules/tasks/` is listed — `stage-task-service.ts` and `TasksTab.tsx` (§D), the admin tests (§G `admin/test/modules/tasks/*`, `ProjectDetail.tasks-tab.test.tsx`). **No consumer missing from the list.** The converse does not hold, and Phase 2 must not read the typecheck as the whole worklist: §G's backend tests (`backend/test/integration/tasks/*`, `contract/tasks/*`, `perf/tasks/*`, `integration/projects/*` + `helpers.ts`) and `packages/demo-composition/src/projects.ts` produce **no** type error — they pin the old shape through raw SQL and untyped JSON, so they fail only at run time.
  - Before the rebuild the same run reported 22 more errors (`useAdminPreference` not exported from `@endora-commerce/admin-kit/lib`, `AdminMe.preferences`, a missing `admin_users` migration export): stale `dist`s from #478, gone after `build:packages`, unrelated to this change.
- [X] T005 [P] Extend the reference grammar and the read ports.
  - `X/record-references.ts`: add `opportunity` and `project` to both arrays.
  - `X/crm.ts`: `OpportunityReadPort.findByIds` and `search`.
  - `X/projects.ts`: `ProjectReadPort.findByIds` and `search`.
  - `X/custom-fields.ts`: add `'task'`.
  - `X/saved-list-views.ts`: Task view create and update schemas.
  - `X/admin-preferences.ts`: `listViewModes` in keys, patch, read and defaults.
  - T003 green. Rebuild `contracts`.
  - Done 2026-10-28: the contracts suite is 71 files / 1 542 tests green, `tsc` and `eslint` clean, `contracts` rebuilt. Added beside the methods: `OpportunitySearchQuery` / `OPPORTUNITY_READ_PORT_SEARCH_MAX` and `ProjectSearchQuery` / `PROJECT_READ_PORT_SEARCH_MAX` (20); `ADMIN_LIST_VIEW_MODES`, `adminListViewModeSchema` and `ADMIN_LIST_VIEW_MODES_MAX` (128, as `listPageSizes`). The read side is `z.record(z.string(), z.string()).catch({})`, so a document stored before 165 parses.
  - **Sequencing note.** `plan.md` *Risks* says the grammar widening lands "in the same commit" as CRM's and Projects' check migrations; this task puts it in Phase 1 and the migrations in T032. Between the two, on this branch only, pasting `[[opportunity:…]]` or `[[project:…]]` into a CRM or Project text would be extracted and then refused by `crm_opportunity_references_target_type_check` / `project_references_target_type_check`. Nothing merges before Phase 10, so this was followed as written; the window closes at T032. Likewise `OpportunityReadPort` / `ProjectReadPort` gain required methods here that are implemented at T033, so the CRM and Projects read-port classes are red in typecheck until then (T008 counts them).
- [X] T006 Extend `T/manifest.ts`:
  - **Permissions:** `tasks:configure` and `tasks:see_private`, both `requires: ['tasks:read']`, with labels in `T/../i18n/{en,pl}.json` (`packages/modules/tasks/i18n/`).
  - **Settings:** `tasks.board_card_fields` (json, default from `data-model.md` §4) and `tasks.time_zone` (string, `Europe/Warsaw`).
  - **`dependencies`:** add `custom_fields`, `assets_library`, `transactional_emails`, `orders` and `catalog`.
  - **`nonBindingDependencies`:**
    - `degrades-without` on `crm` / `opportunityReadPort`, `quote_requests` / `quoteRequestReadPort` and `projects` / `projectReadPort`, with the `whenAbsent` sentences of `contracts/ports-and-events.md` §4;
    - `contributes-to` on the asset-reference registry (read `P/manifest.ts` for its exact name).
  - **`transactionalEmails`:** `tasks_task_reminder` and `tasks_daily_digest`, with variables.
  - Run `pnpm --filter backend exec vitest run test/unit/db/module-graph.test.ts` and confirm no cycle.
  - **Deviation — no `contributes-to` edge on the asset-reference registry.** The premise is false: `assetReferenceRegistry` is owned by `assets_library`, which this task also puts in `dependencies`, and `defineModuleManifest` refuses a non-binding edge on a module already in `dependencies` ("one edge, one claim", `packages/contracts/src/modules.ts:1143-1152`). `P/manifest.ts:99-103` covers the same registry by its `dependencies` entry alone, with no `contributes-to`; Tasks does the same, and the manifest comment says why.
  - Also added: `settingLabels.tasks.{board_card_fields,time_zone}.{name,description}` in both bundles (Projects' precedent; `tasks.enabled` has none, left as it is), and five cases in `T/backend/manifest.test.ts` (permissions, settings defaults, the three `degrades-without` edges with sentences, the two e-mails) — written after the manifest, not red first. 6/6 green.
  - **Cycle check, 2026-10-28:** `module-graph.test.ts` **cannot run** before Phase 2. Every backend vitest run loads `entities-registry.generated.ts`, which imports the `tasks` backend from source, and `task-service.ts:87` reads the removed `TASK_CLOSED_STATUSES` at module load (`TypeError: Cannot read properties of undefined (reading 'map')`) — so the whole backend suite is down from T004 until T016. Measured instead with the same input the test reads: a `tsx` script over `DISCOVERED_MANIFESTS` (after emitting `mod-tasks/dist` with `--noEmitOnError false`, since the package does not type-check until Phase 2) — 67 modules, `defineModuleManifest` accepted the manifest, **no cycle**. Re-run the real test at T008/T025 once the backend loads.
- [X] T007 [P] Write the changesets:
  - `.changeset/contracts-task-management.md`: breaking (event and status shapes), a minor version in `0.x` per `release-intent.md`;
  - `.changeset/tasks-task-management.md`;
  - `.changeset/admin-kit-tags-move-menu-view-modes.md`;
  - `.changeset/crm-reference-kinds.md`;
  - `.changeset/projects-reference-kinds-stage-task-keys.md`;
  - `.changeset/custom-fields-task-host.md`.

  Verify with `pnpm --filter backend exec tsx scripts/check-release-intent.ts --since origin/master`.
  - Every bump is `minor` (D-225 refuses `major` in `0.x`; `plan.md`'s "mod-tasks (major)" is written as a breaking `minor`). Each body is written for the consumer of the whole feature, old call and new call for the contracts break, so the later phases add no changeset unless they change something these do not say. `check-release-intent --since origin/master` green 2026-10-28: `changesets-added=6 violations=0`.
- [X] T008 Phase gate. Run:
  - `pnpm run build:packages`
  - `pnpm --filter backend run manifests:generate && pnpm install --lockfile-only && pnpm --filter backend run composer:generate`
  - `pnpm -r run typecheck`

  Typecheck is **expected red** in Phase 2's worklist files only (T004). Record the count.
  - Measured 2026-10-28.
    - **`build:packages`: red in five packages**, `mod-tasks`, `mod-projects` (the T004 worklist) and `admin-kit`, `mod-custom-fields`, `mod-crm` (T005's additions: the exhaustive reference-kind maps, `SUPPORTED_ENTITIES` / the storage binding without `task`, and the read-port classes without `findByIds`/`search`). With `noEmitOnError` their `dist`s stay at the last good build, so until each is fixed `admin`, `backend` and the other packages compile and run against the **old** `admin-kit`, `mod-crm` and `mod-custom-fields`.
    - `manifests:generate` changed nothing; `pnpm install --lockfile-only` changed nothing (no new peer yet — `bullmq`, `ioredis`, `@endora-commerce/email-components` arrive with their first import); `composer:generate` reordered `backend/src/composition.generated.ts` (the new `dependencies` move `tasks` later in the topological order) and regenerated `docs/docs/module-reference/tasks.md` (the new permissions, settings and e-mails). Both committed.
    - **`pnpm -r run typecheck`: 72 errors.** The 55 of T004's worklist, unchanged, plus 17 from T005, every one in a file `foreign-module-changes.md` lists: `K/components/references/{ReferenceText.tsx:35,reference-node.ts:28}` (§B; reported three times, through `admin-kit`, `admin-shell` and `page-builder-admin`), `packages/modules/custom_fields/src/backend/services/{custom-field-registry.ts:68,host-storage-binding.ts:18}` (§E; twice, also through `backend`), `C/backend/services/opportunity-read-port.ts:28` and the registration it breaks at `C/backend/index.ts:1009`, `C/backend/services/reference-service.ts:65,139` (§C), `P/backend/services/project-read-port.ts:23` and `P/backend/index.ts:428`, `P/backend/services/reference-service.ts:66` (§D). The two `index.ts` lines are the port registrations failing because the class no longer satisfies the port; they clear with T033.
    - `check:naming`, `check:language`, `check-release-intent` green. **`check:port-dependencies` red**: the three new `degrades-without` edges (`crm:opportunityReadPort`, `quote_requests:quoteRequestReadPort`, `projects:projectReadPort`) resolve nothing in `T/backend/index.ts` yet ("A declaration with no resolution under it … Delete it."). They clear when the reference/link services first resolve each port (US1, US6); kept, as T006 asks.
  - **What Phase 2 must know.** (1) The **whole backend vitest suite cannot load** until T016: global setup imports the `tasks` backend from source and `task-service.ts:87` maps the removed `TASK_CLOSED_STATUSES` at module load. (2) T025's gate (`build:packages`, `pnpm -r run typecheck`) **cannot go green within Phase 2 as tasks are ordered**: the T005 failures above belong to T033 (read ports), the CRM/Projects reference work of US1 and the custom-fields host (US1), all Phase 3. Either Phase 2 takes the minimal part of each (the two `findByIds`/`search` pairs, the two reference maps and the resolvers' `opportunity`/`project` arms answering unavailable, the `task` registry and binding rows) or T025 records them as expected red. Not decided here.

**Checkpoint**: the contracts say what the feature is, and the consumers that must change are enumerated.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**:
- the whole new schema;
- statuses as codes everywhere;
- assignees as a list everywhere;
- the draft/private visibility predicate and `TaskAccess`;
- the seam test;
- generalised list sorting.

Every existing tasks, Projects and demo test must be green on the new shape before any story starts.

**⚠️ CRITICAL**: no user story starts before T030 is green.

### Tests first

- [X] T009 [P] Extend `backend/test/integration/tasks/migration.test.ts` and see it fail. It covers:
  - from a database at the 163 schema with Tasks holding each status and some assignees, `up` gives every table, column, check and index of `data-model.md` §1–§3;
  - the seeds: four statuses with categories, twelve transitions, four priorities with en and pl names;
  - `task_assignees` holds exactly the former assignees, and `assigned_admin_user_id` is gone;
  - `published_at` equals `created_at` for existing rows;
  - `down` restores the 163 shape, including the single assignee (the first by `assigned_at`).
  - Seen red 2026-10-28: 14 of 16 failed for the stated reason — no table, column, check, index or seed of 165, and `the task_management migration is not exported from ./migrations`. Green after T013/T014 (16/16, then 17/17 with the registration case below).
  - The file now takes `setupMigratorTestDb` (a database of its own) and is listed in `backend/test/migrator-driving-tests.ts` (line added to `foreign-module-changes.md` §G). It asks the migrator which migrations it executed (the task_management class is among them) and then runs the migration **class** directly for `down`/`up`/`down`: `migrator.down()` would revert every module ordered after `tasks`. Because it no longer boots a server, `check-test-ownership` read it as a misplaced single-module test: a **retained** entry in the new shard `backend/scripts/ledgers/test-ownership/tasks.ts` says why it stays (it needs the host's template and registries; §G line added at T025).
  - The `down` maps a status outside the four seeded codes to the seeded code of its category (`todo` for an open one) before restoring the check; the 163 single assignee is the first by `assigned_at`, ties by admin id.
- [X] T010 [P] Write failing unit tests:
  - `T/backend/domain/task-status-graph.test.ts`: the R-1 rules, one per refusal, plus `allowedTargets` and `canTransition`;
  - `T/backend/domain/list-cursor.test.ts`: round-trip for every sort key, nulls last, and a tampered cursor refused;
  - `T/backend/domain/due-moment.test.ts`: overdue for `due_at` versus date-only in `Europe/Warsaw`, across a DST change.
  - Seen red 2026-10-28: all three files failed to load (`Cannot find module './task-status-graph.js'` / `list-cursor.js` / `due-moment.js`). Green after T015 (43/43).
  - DST cases: date-only overdue across 2026-10-25 (CEST→CET) and 2026-03-29 (CET→CEST) in `Europe/Warsaw`; the 09:00 base of a date-only reminder on both sides of each change.
- [X] T011 [P] Extend `T/backend/services/task-visibility.test.ts` with the draft/private conjunct of R-3:
  - the Creator sees their own draft and their own private Task;
  - another admin sees neither;
  - a `tasks:see_private` holder sees the private Task and not the draft;
  - the system actor sees everything.
  - Seen red 2026-10-28: 13 of 21 failed — the 163 SQL expectations gained the conjunct, and the new draft/private cases saw no rule. Green after T018 (21/21). Also covered: a hidden draft is refused before its context is asked; a caller with no administrator behind it sees no draft and no private Task.
- [X] T012 [P] Write failing `backend/test/integration/tasks/draft-private-baseline.test.ts`, seeded directly in the database because the UI and the writes come in US8. A private Task and a draft of admin A are absent for admin B from:
  - `GET /tasks`, `/tasks/mine` and `/tasks/:id` (404 identical to non-existent);
  - `taskReadPort.findById`, `findByIds` and `search`;
  - the global search provider.
  - Not seen red for the stated reason: before T013 the seed itself failed (no `is_draft` column), and the file was first run after T018. The predicate it exercises was seen red in T011. Green 2026-10-28 (5/5). *My Tasks* implies "no draft" for everyone (admin-api §1), so the Creator's own draft is absent from their `/mine` too — the control asserts that.

### Schema and entities

- [X] T013 Scaffold `pnpm --filter backend run migration:new -- --module tasks --name task_management` and write `up` and `down` in `T/migrations/<stamp>_tasks_task_management.ts` per `data-model.md` §1–§3.
  - **Order inside `up`:** create the tables → seed → copy assignees → drop the column → add the checks.
  - Export it from `T/migrations/index.ts`.
  - `20261028T140002_tasks_task_management.ts`, exported from `T/migrations/index.ts`; `composer:generate` registered it. Order inside `up` as written. Index names: `tasks_parent_task_id_index`, `tasks_priority_code_index`, `tasks_context_source_key_unique`, `tasks_created_by_hidden_index`, `tasks_due_at_index`. Additions the data model implied: `tasks_source_key_length_check` (≤ 100), `task_statuses_code_check` / `task_priorities_code_check` (snake_case; a priority may not be `none`), `task_list_saved_views_filters_size_check` (8 KB), an index on `task_reminders(task_id)`. Assignees copied with `assigned_at = updated_at` (163 recorded no assignment time). Seed colours: todo `#64748b`, in_progress `#f59e0b`, done `#10b981`, cancelled `#94a3b8`; priorities urgent `#dc2626`, high `#f97316`, normal `#3b82f6`, low `#94a3b8`.
- [X] T014 Create the entities in `T/backend/entities/`:
  - `@RuleScoped`: `task-assignee`, `task-tag-assignment`, `task-comment`, `task-reference`, `task-attachment`, `task-record-link`, `task-relation`, `task-reminder`, `task-reminder-delivery`;
  - `@GlobalEntity`: `task-status`, `task-status-transition`, `task-priority`, `task-tag`, `task-list-saved-view`, `task-digest-subscription`.

  Then:
  - alter `task.entity.ts` per §1 and drop `assignedAdminUserId`;
  - export all of them from `T/backend/index.ts`;
  - add them to `backend/test/helpers/package-entities.ts`;
  - run `composer:generate`, `manifests:generate` and `pnpm install --lockfile-only`.

  T009 green. `check-entity-tenant-classification` green.
  - Fifteen classes; the join tables hold their ids by value (no ORM relation), so the create Command flushes the Task before writing its assignee rows (the unit of work cannot order them otherwise — seen as an FK violation). `check-entity-tenant-classification`: 266 entities, 266 classified. `manifests:generate` and `pnpm install --lockfile-only` changed nothing (no new peer: the time-zone setting is read with `TaskTimeZoneSchema.shape.timeZone`, not a module-local `zod` import).

### Shape changes: statuses and assignees

- [X] T015 Implement the pure domain code:
  - `T/backend/domain/task-status-graph.ts`, copied from `C/backend/domain/opportunity-status-graph.ts` with categories;
  - `T/backend/domain/list-cursor.ts`;
  - `T/backend/domain/due-moment.ts`.

  T010 green.
  - `TaskStatusGraph` rules: `exactly_one_initial`, `initial_must_be_open`, `done_status_required`, `cancelled_status_required`, `transition_unknown_status`; `isClosed` treats a code the workflow no longer holds as open. `list-cursor`: one key per sort (`due` = the date then the UTC time, a date-only Task after the timed ones of its day; `priority`/`status` = the joined weight), nulls last in both directions, cursor `{s,d,k,i}` refused (400) under another sort or direction. `due-moment`: `todayIn`, `dueOnFor`, `isOverdue`, `dateOnlyMoment`.
- [X] T016 Rework the existing services onto the new shape. No new behaviour yet.
  - `T/backend/services/task-commands.ts`:
    - status codes, with `completedAt` set on entering a `done`-category status;
    - `assignees_change` replaces `assign`;
    - the events use the new payloads.
  - `task-service.ts`:
    - the summary carries `status {code, name, color, category}`, `closed` and `assignees[]`;
    - the closed SQL uses categories;
    - `assignee[]` filter;
    - `/mine` reads through `task_assignees`.
  - `task-read-port.ts`, `task-write-port.ts` (`assigneeIds`), `task-checks.ts`, `admin-search-provider.ts`, `task-history-service.ts`.
  - **Fix the F-14 gap:** `#assigneeMaySee` requires the recipient to hold `tasks:read` (`permissionService.listPermissions`) before `canSeeAs`. Add a case to `backend/test/integration/tasks/tasks-crud.test.ts` and see it red first.
  - **Status changes** now go through the graph. The `TaskTransitionService` arrives in US2. Until then, `PATCH` with `status` is removed per the contract, and `POST /tasks/:id/status` is implemented with the graph check only. This keeps `tasks-crud.test.ts` meaningful.
  - **Unblocking first** (orchestrator ruling 1): `task-service.ts` read the removed `TASK_CLOSED_STATUSES` at load; a two-code constant replaced it in a separate commit, and the `mod-tasks` `dist` was re-emitted (`--noEmitOnError false`, as Phase 1 did) until the package type-checked again, because every package resolves at its `dist` (D-164). After that the backend suites loaded.
  - Done 2026-10-28 as written, with: summaries also carry `dueAt`, `priority`, `tags`, `parent`, visible `subtasks`, `draft`, `private`; overdue is computed per row in `tasks.time_zone` (date only) or at `due_at`; a code the workflow no longer holds is shown as itself, open. `POST /tasks/:id/status` checks: 422 `TASK_STATUS_UNKNOWN`, 409 `TASK_TRANSITION_CONFLICT` (also re-checked under the Command's lock), 409 `TASK_TRANSITION_FORBIDDEN {allowedTargets}`; a move to the current status is a no-op. Four error codes joined `ERROR_CODES`, the manifest, both bundles and `reference-ledgers.ts` with their first raise site (`TASK_STATUS_UNKNOWN`, `TASK_TRANSITION_FORBIDDEN`, `TASK_TRANSITION_CONFLICT`, `TASK_PRIVATE_READ_ONLY`). The manifest gained `admin_roles` in `dependencies` (`permissionService`).
  - **F-14:** seen red 2026-10-28 with the check removed — `tells nobody who may not read Tasks at all` failed (`expected [ …(1) ] to deeply equal []`, the outsider was rung); green with it. `TaskRecord` gained `statusName`/`statusDefaultName`/`statusColor`/`updatedAt` (contract line in `foreign-module-changes.md` §A, changeset updated) so Projects can label a status; see T019.
  - **Not done here (later stories, per "no new behaviour"):** `CreateTaskBody`/`UpdateTaskBody` fields `dueAt`, `startOn`, `priorityCode`, `tagIds`, `customFieldValues`, `parentTaskId`, `links`, `draft`, `private` are accepted by the schema and **ignored** by the service until US1/US5/US6/US8; the write port ignores `sourceKey` until US10; the list ignores `customFieldFilters` until T038; `DELETE` keeps the `tasks:write` gate (the `see_private` delete is US8).
- [X] T017 Write and implement `backend/test/integration/tasks/visibility-seam.test.ts`.
  - It fails if any file under `T/backend/` other than `task-visibility.ts`, `task-access.ts` and the listed sweep services (`reminder-service`, `digest-service`, `maintenance-service`) issues SQL naming `tasks` or a `task_*` child table.
  - It reads the sources the way `project-access-seam.test.ts` does (read that test first).
  - The allow-list is a two-way ledger in the test.
  - **Deviations.** (1) Co-located as `T/backend/task-visibility-seam.test.ts`, not `backend/test/integration/tasks/visibility-seam.test.ts`: it reads module sources only, and `project-access-seam.test.ts` — the precedent the task names — is co-located (module-test-ownership contract §2). (2) The allow-list is `TASK_ACCESS_READERS` in `task-access.ts` (Projects' `PROJECT_ACCESS_READERS` shape), not the literal three files: the list's SQL, the summaries' child reads and the Commands' locked re-reads live in `task-service.ts`, `task-commands.ts` and `task-write-port.ts`, each listed with why every read composes the predicate or is keyed by an id `TaskAccess` handed out. The sweeps join it when they exist. Two-way ledger plus a per-file read count (access 2, commands 4, service 20, visibility 0, write-port 1); `task-number.ts` is the one SQL file reading no rule-scoped table.
  - Written alongside T018, so not seen red against the 163 tree; seen red 2026-10-28 by removing `task-service.ts` from the allow-list (3 cases red, naming `services/task-service.ts:207: SQL reads "tasks"` …). Green 11/11.
- [X] T018 Implement draft/private in `T/backend/services/task-visibility.ts`: the conjunct of R-3, using the caller's id and `tasks:see_private`.

  Create `T/backend/services/task-access.ts` with:
  - `loadVisible(id)`;
  - `assertMayChange(task)`: `TASK_PRIVATE_READ_ONLY`, plus 163's `canChangeTasks`;
  - `assertMayDelete(task)`.

  Route every existing read and write through them. T011, T012 and T017 green.
  - `TaskVisibility` takes `viewer()` (the caller's id and `permissionService.hasPermission(id, 'tasks:see_private')` — the capability-check shape the permission inventory reads); the conjunct is `created_by = :me or (not is_draft and not is_private)`, or `… or not is_draft` for a `see_private` holder; the system is not narrowed and not asked. `canSeeContext` serves the history's context-only question. `TaskAccess`: `findVisible`, `loadVisible`, `rowAfterWrite`, `assertMayChange` (403 `TASK_PRIVATE_READ_ONLY`), `assertMayDelete` (163's `canChangeTasks`). **Deviation:** 163's `canChangeTasks` stays asked where 163 asked it (into/out of a record, delete), not on every write — asking it on an in-place edit would be new behaviour; `TaskDetail.permissions.canChange` is `tasks:write` and not someone else's private Task. T011, T012, T017 green.
- [X] T019 Adapt Projects to the new shape (`foreign-module-changes.md` §D).
  - `P/backend/services/stage-task-service.ts`: the local `CLOSED` set becomes `summary.closed`, and it uses `assigneeIds: [holder]`.
  - `P/admin/pages/project-detail/tabs/TasksTab.tsx`: status from `status.name` and `status.color`, assignees as a list.
  - Remove `tasks.status.*` from `P/../i18n/{en,pl}.json` (`packages/modules/projects/i18n/`) after grepping that no other key reader remains.

  Run `backend/test/integration/projects/{stage-tasks,completion-gate,task-context,templates,visibility}.test.ts` and update only the assertions that pin the old shape, listing each one under this task.
  - Done 2026-10-28. `tasksByStage(projectId, language)` — the route passes `request.responseLanguage()` (`routes.stage-tasks.ts`, line added to §D) — names each status from `TaskRecord.statusName[language] || statusDefaultName` with its colour; overdue is `!closed` and past `dueAt`, or `dueOn` before today in the Projects time zone; priority/tags/parent/sub-tasks are neutral (the tab shows none). `tasks.status.*` removed from both Projects bundles (the one other reader was the admin test, updated).
  - Assertions updated, shape only (commit `1e4f0e63b` body): `helpers.setTaskStatus` (PATCH → `POST /status`), `completion-gate` (`status: 'todo'` → `{code}`), `stage-tasks` (`assignee` → `assignees`), `task-context` (`assignedAdminUserId` → `assigneeIds`; the outsider's PATCH status → `POST /status`, still 404), `templates` (column → `task_assignees` row), `visibility` (`assignedAdminUserId` → `assigneeIds`). All 46 Projects/custom-fields/demo files green.
- [X] T020 Adapt the demo.
  - `packages/demo-composition/src/projects.ts`: insert assignees into `task_assignees` and set `published_at`.
  - Run `backend/test/integration/demo/demo-shop.test.ts` and `demo-reset-after-use.test.ts` (whose `tasks` count is unchanged here).
  - Done 2026-10-28: the demo writes `published_at = created_at` and one `task_assignees` row per Task whose Role one Member holds. `demo-shop.test.ts`'s ledger gains `task_assignees: 10` (`tasks: 12` unchanged); `demo-reset-after-use` green. `check:demo-data-budget` and `check:module-boundary` clean.
- [X] T021 Update the existing tests that pin the old shape, listed in `foreign-module-changes.md` §G, one by one:
  - `backend/test/integration/tasks/{tasks-crud,write-port,off-state}.test.ts`
  - `backend/test/contract/tasks/tasks.contract.test.ts`
  - `backend/test/perf/tasks/context-visibility.perf.test.ts`
  - `admin/test/modules/tasks/*`
  - `admin/test/modules/projects/ProjectDetail.tasks-tab.test.tsx`

  Change shape, never intent. Write each changed assertion's before and after into the commit body.
  - Done 2026-10-28; each changed assertion's before/after is in the bodies of commits `4b5b4b59b` (backend) and `55738aff6` / `1e4f0e63b` (admin). `off-state.test.ts` and `context-visibility.test.ts` needed no change. Two more tests pinned Phase 1's contract changes and were red on arrival, found by the T025 gate: `packages/modules/admin_users/…/admin-preference-document.test.ts` (`listViewModes: {}` default) and `admin/test/kit/kit-collaboration-bundle.test.ts` (the core bundle lacked `references.{kind,group,inserted,unavailable}.{opportunity,project}` — added to `_i18n` en/pl); both lines added to `foreign-module-changes.md`.
- [X] T022 Rework the admin pages onto the new shape. No new controls yet.
  - `T/admin/api.ts`, `components/StatusBadge.tsx` (colour from the status), `components/task-columns.tsx` (assignee list) and `components/AssigneePicker.tsx`: multi-select over `TagMultiSelect`-like chips, or kit `MultiSelect` if one exists (grep `K/components` first).
  - `pages/TasksList.tsx`, `MyTasks.tsx`, `TaskCreate.tsx` and `TaskDetail.tsx`: the status picker shows the workflow's statuses from `GET /tasks/workflow` (served read-only from now).

  Implement `GET /tasks/workflow` in `T/backend/routes/routes.workflow.ts` (`tasks:read`).
  - Done 2026-10-28. `AssigneePicker` is multi-select on the kit's `MultiCombobox` (no `MultiSelect` fits: that one is a filter-bar checkbox panel); options are the lookup's ≤ 50 active admins, narrowed client-side, and a chosen admin the lookup no longer offers keeps their name. `StatusBadge` = the served name with the colour as a dot. TaskDetail's status control offers the current status and the workflow's moves from it (`POST /status` with `from`); TasksList's filter lists the workflow's statuses; the tasks bundles lost `status.*`. `GET /tasks/workflow` (`routes.workflow.ts`, `tasks:read`) answers statuses with the visible `inUseCount` and the moves.
- [X] T023 Implement the generalised list in `T/backend/services/task-service.ts`:
  - `sort` / `dir` with the keyset cursor (T015);
  - the filters `statusCategory[]`, `creator`, `priority[]` and `tagId[]` (AND), `parentId` / `isSubtask` / `hasSubtasks`, and `linkedKind` / `linkedId`;
  - the `subtasks {closed, total}` lateral count under the visibility predicate.

  Unknown codes and ids match nothing. Write a failing case per filter and per sort first in `backend/test/contract/tasks/tasks-list.contract.test.ts`.
  - Seen red: not run before implementation — `tasks-list.contract.test.ts` was written first but executed after `task-service.ts` was rewritten (it could not run red for its own reason earlier: the schema it seeds did not exist until T013). First run: 30/31, the one red being my own premise (a status the workflow does not hold is **open**, consistent with `isClosed` and the completion gate, not "in no category") — the test was corrected. Green 31/31: 14 sort/direction cases across pages, the cross-sort cursor refusal, every filter, the sub-task count leaving out a hidden draft. `hasSubtasks` and the counts compose the visibility predicate over the children.
- [X] T024 [P] Extend `backend/test/perf/tasks/context-visibility.perf.test.ts` to 5 000 Tasks with 2 assignees and 3 tags each:
  - list first page under 2 s for each sort;
  - *My Tasks* under 2 s.

  Record the measurements under this task.
  - Measured 2026-10-28 on the local test Postgres (`PERF_RUN=true`), 5 000 Projects × 4 Tasks plus 5 000 context-less Tasks × 2 assignees × 3 tags, members-only viewer of everything: 163's `GET /tasks` p95 282 ms (budget 500); first page p95 per sort — created asc 231 / desc 269, number 258 / 247, title 251 / 282, due 278 / 286, priority 254 / 227, status 271 / 198, updated 172 / 350 ms; `GET /tasks/mine` p95 835 ms (it returns up to 500 rows). All under SC-002's 2 s.
- [X] T025 Phase gate. Run:
  - `pnpm run build:packages`, `pnpm -r run typecheck`, `pnpm -r run lint`
  - `pnpm --filter backend run test:unit:fast`
  - `pnpm --filter backend exec vitest run test/integration/tasks test/contract/tasks test/integration/projects test/integration/crm test/integration/demo`
  - `pnpm --filter admin exec vitest run test/modules/tasks test/modules/projects`
  - `pnpm --filter '!backend' run test`
  - `check:off-state-coverage`, `check:naming`, `check:language`

  Regenerate the OpenAPI baseline.
  - Run 2026-10-28 on the final tree:
    - `build:packages`: **green** (all packages, `mod-tasks`, `mod-projects`, `admin-kit`, `mod-crm`, `mod-custom-fields` included).
    - `pnpm -r run typecheck`: **green** (0 errors; Phase 1 recorded 72).
    - `pnpm -r run lint`: **green** (0 errors; pre-existing warnings only).
    - `pnpm --filter backend run test:unit:fast`: 359/361 files, 7 759/7 761 tests; **two expected reds**: (1) `test/unit/scripts/moved-module-tree.test.ts › check-port-dependencies.ts reads both roots and passes` — the three `degrades-without` edges resolve nothing yet (orchestrator ruling 4: expected until US1/US6 resolve `opportunityReadPort`, `quoteRequestReadPort`, `projectReadPort`); (2) `test/contract/admin_users/permission-inventory.test.ts › every assignable code is enforced somewhere` — `tasks:configure` is grantable and gates nothing until US2's configuration routes (it was declared in T006; T008 could not run the backend suite to see it). `tasks:see_private` is enforced by `TaskVisibility`'s `hasPermission`.
    - `vitest run test/integration/tasks test/contract/tasks test/integration/projects test/integration/crm test/integration/demo`: **85 files, 1 082 passed, 1 expected fail** (pre-existing `it.fails`). The migration test and the seam test green.
    - `pnpm --filter admin exec vitest run test/modules/tasks test/modules/projects` (Node 26, `--no-experimental-webstorage`): **27 files, 220 passed**.
    - `pnpm --filter '!backend' run test`: green after fixing the two Phase-1 reds named under T021 (`mod-admin-users` 151/151; `admin` 433 files).
    - `check:off-state-coverage` (41/41), `check:naming`, `check:language`: **green**. Also green: `check:error-translations`, `check:command-coverage`, `check:bundle-pairing`, `check:module-boundary`, `check:demo-data-budget`, `check:test-ownership`, `check:port-shape`, `check:entry-presence`, `check:admin-zones`, `check:admin-surface`, `check:action-route-permissions`, `check:module-docs`, `check:shared-table-wipes`, `check:release-intent` (`--since origin/master`: 0 violations), `check-entity-tenant-classification`. **`check:port-dependencies` red**, as ruling 4 expects (same three edges).
    - OpenAPI baseline regenerated (`UPDATE_OPENAPI_BASELINE=1`): only `/api/v1/admin/tasks/{id}/status` and `/api/v1/admin/tasks/workflow` added.
    - Generated artefacts current: `composer:generate` (migration registry, `docs/docs/module-reference/tasks.md`), `manifests:generate` and `pnpm install --lockfile-only` (no change).
  - **Orchestrator rulings applied here:** (1) the minimal Phase 3 slice pulled forward so the build and typecheck are green — see the notes under T032, T033, T035, T038; (2) the CRM and Projects check-widening migrations landed in this phase (T032); (3) `recordWithin(em, …)` for `admin_notifications` recorded in `foreign-module-changes.md` §E2 and under T001/T072, not implemented; (4) `check:port-dependencies` recorded as expected red.

**Checkpoint**: 163's behaviour holds on the new shape. Drafts and private Tasks are already invisible to everyone else on every read path.

---

## Phase 3: User Story 1 — A Task as a full work item (Priority: P1) 🎯 MVP part 1

**Goal**: several assignees, due time and start date, priority, tags, custom fields, attachments, a rich description with references resolved per reader (#446), and mention notifications.

**Independent Test**: `quickstart.md` §1, US1 row.

### Tests first

- [ ] T026 [P] [US1] Write failing `backend/test/integration/tasks/task-fields.test.ts`:
  - add 2 assignees: each is notified once, the actor never;
  - an assignee without `tasks:read` is refused (`TASK_ASSIGNEE_INVALID`);
  - more than 20 refused;
  - `dueAt` sets `due_on` in `tasks.time_zone`, and overdue is checked at time and at date only;
  - `startOn`;
  - `priorityCode`, with an unknown code giving 422 `TASK_PRIORITY_UNKNOWN`;
  - `tagIds` set and replace, with an unknown tag giving 422;
  - custom field values validated (422 `CUSTOM_FIELD_VALUE_INVALID`);
  - history shows each change.
- [ ] T027 [P] [US1] Write failing `backend/test/integration/tasks/references.test.ts` (#446):
  - a description with tokens of all seven kinds resolves per reader;
  - a reader without `orders:read` sees the Order as unavailable;
  - with `crm` off, the Opportunity is unavailable;
  - a deleted Task is unavailable;
  - a private Task of someone else is unavailable;
  - the `task_references` rows are refreshed on edit;
  - a newly mentioned admin is notified once naming `TSK-…`, not on a re-save, never the author, never someone who may not see the Task.
- [ ] T028 [P] [US1] Write failing tests for the reference kinds in the other modules:
  - `backend/test/integration/crm/references.test.ts`: save `[[opportunity:…]]` and `[[project:…]]` in an Opportunity's description, with no 500 and both resolved;
  - `backend/test/integration/projects/references.test.ts`: the same in a Project note;
  - the document lookups of both modules offer the two new groups only when the owner is present and the caller holds the permission.
- [ ] T029 [P] [US1] Write failing `backend/test/integration/tasks/attachments.test.ts`:
  - upload as private, listed with name, size, uploader and time;
  - an HTML file or an SVG gives 415 `TASK_ATTACHMENT_REFUSED`;
  - more than 25 MB is refused;
  - deleting the asset in the asset library is refused while it is attached, also with `tasks` off;
  - removing the attachment unprotects the asset.
- [ ] T030 [P] [US1] Write failing `backend/test/integration/tasks/custom-fields-host.test.ts`:
  - a `task` definition is creatable;
  - values persist;
  - a `listFilter` definition filters `GET /tasks`;
  - with `tasks` off, the `task` entity type is hidden from the custom-fields definitions API (registry `ownerModuleId`).
- [ ] T031 [P] [US1] Write failing admin tests:
  - `admin/test/modules/tasks/TaskDetail.fields.test.tsx`: the multi-assignee control, the due-time input, the priority and tag pickers, the custom-fields panel, rich description rendering with reference links, and the attachments section;
  - `K/components/tags/TagMultiSelect.test.tsx`: the promoted component, its options injected.

### Implementation

- [ ] T032 [US1] Run the CRM and Projects reference-kind migrations:
  - `pnpm --filter backend run migration:new -- --module crm --name opportunity_reference_kinds`
  - `… --module projects --name projects_reference_kinds`

  Write `up` and `down` per `data-model.md` §6, then run `composer:generate`.
  - **Pulled forward into Phase 2** (orchestrator ruling 2, 2026-10-28): `C/migrations/20261028T143444_crm_opportunity_reference_kinds.ts` and `P/migrations/20261028T143448_projects_reference_kinds.ts`, `up`/`down` per data-model §6 (`down` deletes the two kinds' rows, as the 163 precedent did, then restores the five), registered. `CrmReferenceTargetType` widened in `C/backend/entities/crm-opportunity-reference.entity.ts` (line added to §C). Run by every backend suite's template build; no dedicated up/down test yet — T028 or this task may add one. What remains: nothing but that test.
- [ ] T033 [US1] Add `findByIds` and `search` to the read ports.
  - `C/backend/services/opportunity-read-port.ts`: number and title, ≤ 20.
  - `P/backend/services/project-read-port.ts`: through `ProjectAccess`. Add the file to `PROJECT_ACCESS_READERS` in `P/backend/services/project-access.ts` if the method lives in a new file.
  - **Pulled forward into Phase 2** (ruling 1): both methods exist. CRM: `findByIds` (scoped `em.find`) and `search` (number/title `ilike`, newest first, ≤ 20). Projects: `ProjectAccess.findVisibleMany` and `searchVisible` (both compose `visibleProjectSql`; seam ledger `project-access.ts` 12 → 14), so no new file joined `PROJECT_ACCESS_READERS`. Not yet tested by an integration case — T028 covers them through the lookups.
- [ ] T034 [US1] Teach CRM and Projects the two new kinds.
  - Resolvers in `C/backend/services/reference-service.ts` and `P/backend/services/reference-service.ts`. Projects resolves Opportunities through its existing `linked-records.ts` owner. CRM resolves Projects through `projectReadPort`, and if `C/manifest.ts` lacks a `degrades-without` edge on `projects`, add it with a `whenAbsent` sentence.
  - The lookup groups in their document-lookup services.
  - The `owner-read-permissions.ts` entries.
  - The i18n group labels in `C/../i18n` and `P/../i18n`.

  T028 green.
  - Partly pulled forward (ruling 1): each reference service's URL map has the two arms (`/crm/opportunities/:id`, `/projects/:id`); the resolvers still answer both kinds **unavailable** (no port is asked). Resolvers, lookup groups, `owner-read-permissions` entries and i18n group labels remain here.
- [ ] T035 [US1] Extend the admin-kit reference editor (`K/components/references/{reference-kinds,ReferenceField,ReferenceText,reference-node}.ts(x)`):
  - document groups and chip classes for `opportunity` and `project`;
  - link targets `/crm/opportunities/:id` and `/projects/:id`.

  Write its kit test first. Rebuild admin-kit.
  - Partly pulled forward (ruling 1): `ReferenceText`'s icon map (`Handshake`, `FolderKanban`) and `reference-node`'s chip classes have the two kinds, and the `_i18n` core bundle carries `references.{kind,group,inserted,unavailable}.{opportunity,project}` (en, pl; required by `kit-collaboration-bundle.test.ts`). Document groups in the editor and the kit test remain here.
- [ ] T036 [US1] Implement the reference and mention services in Tasks:
  - `T/backend/services/owner-read-permissions.ts`, copied from Projects;
  - `reference-service.ts`: `rowsFor` and `resolveMany` across seven kinds through `orderReadPort`, `catalogProductReadPort`, `adminUserReadPort`, `quoteRequestReadPort`, `opportunityReadPort`, `projectReadPort` and `taskReadPort` (self), each gated by presence and permission;
  - `mention-service.ts`: `newlyMentioned`, the mentionable lookup per `admin-api.md` §3, and `tell` after commit, with kind `tasks.task.mention`.

  Wire them in the *References* section of `T/backend/index.ts` with `lazyPort` for each `degrades-without` owner. Make `TaskDetail.references` and the history resolve. T027 green.
- [ ] T037 [US1] Implement the remaining Task fields in `T/backend/services/task-service.ts` and `task-commands.ts`:
  - `due_at` and `start_on`;
  - `priority_code`, validated against `task_priorities`;
  - tags, set and replace (≤ 50), validated;
  - `assigneeIds`, `addAssigneeIds` and `removeAssigneeIds`;
  - `custom_field_values` through `customFieldValueService.validateAndMerge('task', …)`.

  Write each one in its Command with an audit diff. Add `GET /tasks/priorities` and `GET /tasks/tags` (`tasks:read`) and `POST /tasks/tags` (`tasks:configure`) in `T/backend/routes/routes.{priorities,tags}.ts`, backed by `priority-service.ts` and `tag-service.ts`. Model the tag service on `C/backend/services/tag-service.ts`. The rest of the configuration comes in US9.

  T026 green.
- [ ] T038 [US1] Make `task` a custom-field host (`foreign-module-changes.md` §E).
  - `packages/modules/custom_fields/src/backend/services/custom-field-registry.ts`: `SUPPORTED_ENTITIES.task = {labelKey, orgOwned: false, ownerModuleId: 'tasks', listFilter: true}`.
  - `host-storage-binding.ts`.
  - The custom_fields i18n.
  - The three enumerating tests.
  - The Tasks side: the list filter through `customFieldListFilterPort.condition('task', …)` and `GET /tasks/custom-field-filters`.

  T030 green.
  - Partly pulled forward (ruling 1): `SUPPORTED_ENTITIES.task` (`orgOwned: false`, `ownerModuleId: 'tasks'`, `listFilter: true`), `host-storage-binding` (`tasks.custom_field_values`), `customFields.entity.task` (en, pl), and the four enumerating tests (`custom-field-registry.test.ts`, `value-probe-binding.test.ts`, `integration/custom_fields/{entity-owner-presence,list-filter-option}.test.ts`). The Tasks side — validation in the Commands, the list filter, `GET /tasks/custom-field-filters` — remains here.
- [ ] T039 [US1] Implement the attachments:
  - `T/backend/services/attachment-active-content.ts` (copy);
  - `attachment-service.ts`, modelled on `P/backend/services/attachment-service.ts`;
  - `task-asset-references.ts`, registered ungated from a contribution-only boot hook;
  - the routes in `T/backend/routes/routes.collaboration.ts`.

  T029 green.
- [ ] T040 [US1] Promote CRM's `TagChips`, `TagMultiSelect` and `useTagOptions` to `K/components/tags/`, with the options loader as a prop or hook argument. Export them from the kit's components barrel.
  - Move `C/admin/components/TagsSection.tsx` and its other callers onto the kit, then delete `C/admin/components/TagPicker.tsx`.
  - Grep `admin/test/**` and `backend/test/**` for `TagPicker` and fix the paths.
  - Run `admin/test/modules/crm` before and after, with an identical pass count.
- [ ] T041 [US1] Rework the Task screens.
  - `T/admin/pages/TaskDetail.tsx` per `contracts/admin-surfaces.md` §2, US1 parts:
    - the description with `ReferenceField` and `ReferenceText` (`T/admin/lib/references.ts`, modelled on Projects');
    - assignees, due with time, start date, priority and tags;
    - `CustomFieldValuesPanel entityType="task"`;
    - the attachments section with `AttachmentUploader`;
    - the history field list extended.
  - `TaskCreate.tsx`: the same fields.
  - New strings in `packages/modules/tasks/i18n/{en,pl}.json`.

  T031 green.

**Checkpoint**: a Task carries everything US1 lists, and references work in Tasks, CRM and Projects alike.

---

## Phase 4: User Story 2 — Operator-defined statuses and transitions (Priority: P1) 🎯 MVP part 2

**Goal**: configure the workflow, enforce it everywhere, reassign Tasks when a status is removed, and keep the Projects gate correct.

**Independent Test**: `quickstart.md` §1, US2 row.

### Tests first

- [ ] T042 [P] [US2] Write failing `backend/test/integration/tasks/workflow.test.ts`:
  - create, rename (en/pl), recolour and reorder a status;
  - each FR-013 rule refused with 422 `TASK_WORKFLOW_INVALID {rule}`;
  - add and remove transitions as a delta;
  - a forbidden move gives 409 `TASK_TRANSITION_FORBIDDEN` with `allowedTargets`;
  - a stale `from` gives 409 `TASK_TRANSITION_CONFLICT`;
  - removing a status with 3 Tasks requires `replacement` and moves the 3, each with a history row whose `reason` is `status_removed`;
  - 5 001 Tasks give 409 `TASK_STATUS_IN_USE_TOO_MANY`;
  - `tasks:write` without `tasks:configure` gives 403 on every configuration write;
  - every configuration write is audited.
- [ ] T043 [P] [US2] Extend `backend/test/integration/projects/completion-gate.test.ts`:
  - with a custom `done`-category status *Accepted* and the default *Done* removed (Tasks moved to *Accepted*), the gate passes once every Task is in *Accepted* or *Cancelled*, and blocks while one is in a new open status *In review*;
  - a draft in the Stage does not block.
- [ ] T044 [P] [US2] Write failing `admin/test/modules/tasks/TaskWorkflowPage.test.tsx`:
  - the statuses table, the dialog with category and initial;
  - the graph's `onAdd` / `onRemove` call `PUT /tasks/transitions`;
  - the removal dialog asks for a replacement when `inUseCount > 0`;
  - the page is hidden without `tasks:configure`.

### Implementation

- [ ] T045 [US2] Implement `T/backend/services/workflow-config-service.ts`, modelled on `C/backend/services/workflow-config-service.ts`:
  - `createStatus`, `updateStatus`, the initial-flag move with two flushes, and `setTransitions` with add/remove;
  - `deleteStatus(code, replacement)`, which writes per-Task audit rows by T001's finding (a) or uses the batched fallback;
  - `assertValid` at the end of each Command;
  - the in-use counts for the screen.

  Add the routes in `T/backend/routes/routes.workflow.ts` per `admin-api.md` §4. T042's configuration cases green.
- [ ] T046 [US2] Implement `T/backend/services/task-transition-service.ts`:
  - the graph check;
  - a pessimistic re-read and the `from` comparison;
  - `completed_at`;
  - the `openSubtasks` count.

  Route `POST /tasks/:id/status` through it, replacing T016's interim check. Make `taskWritePort.createMany` start Tasks at the *current* initial status. T042 and T043 green.
- [ ] T047 [US2] Build `T/admin/pages/settings/TaskWorkflowPage.tsx`:
  - a statuses table and a status dialog (localized names, category, colour, weight, initial);
  - kit `StatusTransitionGraph` with `isTerminal = category !== 'open'` and `isSystem = false`;
  - a delete dialog with a replacement select.

  Register the route `/tasks/settings/workflow` and the sidebar entry *Task settings* in `T/admin/index.ts`, gated `tasks:configure`. Make the status picker in `TaskDetail.tsx` offer only `allowedTargets` and show the server's refusal. T044 green.

**Checkpoint**: statuses are the operator's, and every move honours them.

---

## Phase 5: User Story 3 — List and board, filtered and saved (Priority: P1) 🎯 MVP part 3

**Goal**: one Tasks screen with a list/board toggle remembered per user, shared filters, saved views, and the same for *My Tasks*.

**Independent Test**: `quickstart.md` §1, US3 row.

### Tests first

- [ ] T048 [P] [US3] Write failing `backend/test/contract/tasks/board.contract.test.ts`:
  - columns in weight order;
  - `count` equals the list total under the same filters, for every filter of US3 scenario 4 including custom fields;
  - `perColumn` and `hasMore`;
  - drafts and private Tasks are counted only for their Creator;
  - card fields carry the configured values.
- [ ] T049 [P] [US3] Write failing `backend/test/integration/tasks/saved-views.test.ts`:
  - create, apply (the list returns its filters), share;
  - another admin sees a shared view and cannot modify it (403);
  - a platform administrator can;
  - 409 on a duplicate name, case-insensitive;
  - filters over 8 KB give 422.
- [ ] T050 [P] [US3] Write failing admin tests:
  - `admin/test/modules/tasks/TasksPage.test.tsx`: the toggle persists through `PATCH /me/preferences` with `listViewModes.tasks`, and filters carry over between list and board;
  - `admin/test/modules/tasks/TaskBoard.test.tsx`:
    - a drop that is allowed calls `/status`;
    - a refused drop reverts and announces;
    - `canDrop` follows the transitions;
    - the *Move to…* menu works by keyboard;
    - *Load more* fetches the list page for one status;
  - `admin/test/modules/tasks/MyTasksPage.test.tsx`: the same toggle under `tasks-mine`;
  - `K/components/kanban/MoveToMenu.test.tsx`;
  - `K/lib/admin-preferences/store.test.ts` for `listViewModes`.

### Implementation

- [ ] T051 [US3] Implement `T/backend/services/board-service.ts`:
  - visibility scope computed once per request;
  - one grouped count;
  - sequential per-column first pages, as CRM does.

  Implement `T/backend/domain/board-card-fields.ts` and `services/board-card-field-service.ts`, modelled on CRM (`builtin:number|assignees|due|priority|tags|creator|start`, `custom:<key>`, ≤ 6). Add the routes `GET /tasks/board` and `GET` / `PUT /tasks/board/card-fields` in `T/backend/routes/routes.board.ts`. T048 green.
- [ ] T052 [US3] Implement the saved views:
  - `T/backend/services/saved-view-service.ts`, modelled on `packages/modules/quote_requests/src/backend/services/quote-request-list-view-service.ts`;
  - the routes `/tasks/list-views` in `T/backend/routes/routes.views.ts`.

  T049 green.
- [ ] T053 [US3] Add `listViewModes` to the admin preferences in admin-kit.
  - `K/lib/admin-preferences/store.ts` (`KEYS` and the switch case).
  - `use-admin-preference.ts`: widen the key union, add `useListViewModePreference(listId)`.
  - If the server's per-list merge needs it, add one case in `packages/modules/admin_users/src/backend/services/admin-preference-document.ts` (read `listPageSizes` handling first).

  Its kit test green.
- [ ] T054 [US3] Promote `C/admin/components/MoveToMenu.tsx` to `K/components/kanban/MoveToMenu.tsx` with generic targets `{code, name, color}`.
  - Move `C/admin/components/OpportunityBoard.tsx` onto it and delete the CRM file.
  - Grep the tests for the old path.
  - Run `admin/test/modules/crm` with an identical pass count.
- [ ] T055 [US3] Build the screens.
  - `T/admin/pages/TasksPage.tsx`, replacing `TasksList.tsx`:
    - filters in the URL, shared by both views, in `components/TaskFilters.tsx`: every US3 scenario 4 filter plus `CustomFieldListFilters`;
    - kit `SavedViewsControl` on `/api/v1/admin/tasks/list-views`;
    - the list with sortable columns;
    - the board in `components/TaskBoard.tsx` + `TaskCard.tsx` over kit `KanbanBoard` and `MoveToMenu`, with lane *Load more* through the list endpoint and the open-sub-task warning from `/status`.
  - `MyTasksPage.tsx`, replacing `MyTasks.tsx`, with the same toggle.
  - The card-fields editor on `TaskWorkflowPage.tsx`.
  - Update the routes in `T/admin/index.ts`.

  Delete the replaced files and grep the tests for them. T050 green.

**Checkpoint (MVP)**: US1 + US2 + US3 are a usable ClickUp-like Task module. Demo it here.

---

## Phase 6: User Story 4 — Comments with references (Priority: P2)

**Goal**: a comment thread with references and mentions, with notifications de-duplicated.

**Independent Test**: `quickstart.md` §1, US4 row.

- [ ] T056 [P] [US4] Write failing `backend/test/integration/tasks/comments.test.ts`:
  - add, edit and delete by the author; 403 for others;
  - a soft delete shown as deleted;
  - history rows;
  - references to an Opportunity and a Project resolved;
  - assignees and the Creator notified as `tasks.task.comment`, except the author;
  - a mentioned assignee gets the mention only, once;
  - a reader who may not see the Task cannot post (404).
- [ ] T057 [P] [US4] Write failing `admin/test/modules/tasks/TaskDetail.comments.test.tsx`: kit `CommentThread` with `kind: 'note'`, the composer with the reference triggers, and edit/delete controls shown only to the author.
- [ ] T058 [US4] Implement `T/backend/services/comment-service.ts`, modelled on `P/backend/services/comment-service.ts`, notes only:
  - references refreshed inside the Command;
  - notification de-duplication.

  Add the routes in `routes.collaboration.ts`. T056 green.
- [ ] T059 [US4] Add the comments section to `T/admin/pages/TaskDetail.tsx`, with its strings. T057 green.

---

## Phase 7: User Story 5 — Sub-tasks and related Tasks (Priority: P2)

**Goal**: a hierarchy without cycles and at most 5 deep, progress on the parent, related links on both sides.

**Independent Test**: `quickstart.md` §1, US5 row.

- [ ] T060 [P] [US5] Write failing `backend/test/integration/tasks/hierarchy.test.ts`:
  - create a sub-task, and make an existing Task a child;
  - self and descendant refused (`TASK_PARENT_CYCLE`);
  - depth 6 refused (`TASK_HIERARCHY_TOO_DEEP`);
  - two concurrent re-parentings that would form a cycle: one wins and one is refused;
  - deleting a parent detaches its children, and `DELETE` reports `subtasksDetached`;
  - `subtasks {closed, total}` counts only visible children;
  - a hidden parent shows `available: false`;
  - closing a parent with open children succeeds with `openSubtasks`;
  - relate and unrelate, visible on both sides, idempotent.
- [ ] T061 [P] [US5] Write failing `admin/test/modules/tasks/TaskDetail.subtasks.test.tsx`: progress line, list, *Add sub-task* (opens create with `?parent=`), *Make sub-task of…* picker, related Tasks section, and the warning on closing.
- [ ] T062 [US5] Implement:
  - `T/backend/domain/hierarchy.ts`: depth and cycle CTE builders, unit-tested beside it;
  - `services/hierarchy-service.ts`: advisory lock, Command `tasks.task.parent_change`;
  - `services/relation-service.ts`;
  - `parentTaskId` on create and update;
  - the relation routes.

  T060 green.
- [ ] T063 [US5] Build `T/admin/components/{SubtasksSection,RelatedTasksSection}.tsx` and mount them in `TaskDetail.tsx`. Make `TaskCreate.tsx` honour `?parent=`. T061 green.

---

## Phase 8: User Story 6 — Links to Opportunities, Orders and Quote Requests (Priority: P2)

**Goal**: link records to Tasks, with no effect on visibility (Q2 = A), and show the Tasks from each record's screen.

**Independent Test**: `quickstart.md` §1, US6 row.

- [ ] T064 [P] [US6] Write failing `backend/test/integration/tasks/record-links.test.ts`:
  - link to an Opportunity, an Order and a Quote Request;
  - a record the caller cannot read, an absent owner or an unknown id give 422 `TASK_LINK_INVALID`;
  - a duplicate is refused or idempotent (choose and assert);
  - a reader without `crm:read` still sees the Task, with the link unavailable (Q2 = A);
  - `GET /tasks?linkedKind=&linkedId=`;
  - with `crm` off, the link is unavailable and kept, and reappears when CRM is on;
  - history rows.
- [ ] T065 [P] [US6] Write failing `admin/test/modules/tasks/TasksPanel.test.tsx`:
  - the panel lists the linked visible Tasks;
  - *Add task* links to `/tasks/new?link=order:<id>`;
  - it is hidden without `tasks:read`.

  Extend `admin/test/modules/tasks/off-state.test.tsx` with the three zones.
- [ ] T066 [US6] Implement `T/backend/services/record-link-service.ts`:
  - validate through the owner ports with the owner's read permission;
  - resolve labels per reader, sharing the resolver with `reference-service.ts`;
  - the `links` field on create;
  - the routes and `GET /tasks/lookups/records`.

  T064 green.
- [ ] T067 [US6] Build the UI.
  - `T/admin/components/LinkedRecordsSection.tsx` in `TaskDetail.tsx`, and the context card's Project/Stage picker over `GET /tasks/lookups/contexts`.
  - `T/admin/zones/{TasksPanel,OrderTasksPanel,QuoteRequestTasksPanel,OpportunityTasksPanel}.tsx`, contributed through `zoneComponent(...)` in `T/admin/index.ts` (weight 660, `tasks:read`).
  - `TaskCreate.tsx` honours `?link=` and `?context=`.

  T065 green.

---

## Phase 9: User Story 7 — Reminders and the daily digest (Priority: P2)

**Goal**: reminders (bell exactly once, e-mail at most once, 24 h grace) and an opt-in daily digest. One worker runs both, and the US10 pass joins it later.

**Independent Test**: `quickstart.md` §1, US7 rows.

- [ ] T068 [P] [US7] Write failing `backend/test/integration/tasks/reminders.test.ts`. It is clock-controlled and calls the pass function directly, as Projects' stage-alert tests do (read them first). It covers:
  - absolute and relative reminders;
  - recipients limited to the caller and the assignees;
  - more than 10 refused;
  - changing the due moment moves a relative reminder;
  - removing the due date deletes it, with a history row;
  - a due reminder gives one bell per recipient and an e-mail through a fake sender;
  - two concurrent passes give still one bell (unique delivery);
  - a recipient who lost visibility, a closed Task or a draft gets a `skipped` row;
  - a reminder overdue by 25 h gets `expired` and nothing is sent;
  - one overdue by 2 h is delivered;
  - with `tasks` off nothing is sent, and on return only the < 24 h ones go;
  - a tick with nothing due enters no system scope (no `tenant.escape_hatch` row).
- [ ] T069 [P] [US7] Write failing `backend/test/integration/tasks/digest.test.ts`:
  - subscribe at hour 8;
  - passes at 07:55, 08:05 and 08:20 local time send exactly one;
  - the next day, one more;
  - across the 2026-10-25 and 2027-03-28 DST changes in `Europe/Warsaw`, one per day;
  - an empty day sends nothing and does not consume the claim wrongly (assert the chosen semantics);
  - Tasks with a context the recipient cannot see are excluded;
  - drafts are excluded;
  - an unsubscribe stops it.
- [ ] T070 [P] [US7] Write failing admin tests:
  - `admin/test/modules/tasks/TaskDetail.reminders.test.tsx`: add absolute and relative reminders, pick recipients, remove;
  - `admin/test/modules/tasks/DigestControl.test.tsx`: on/off and hour.
- [ ] T071 [US7] Copy the shared helpers:
  - `T/backend/services/scheduled-work-probe.ts`;
  - `time-zone-validator.ts`.

  Add the Tasks copy to `backend/test/unit/tenancy/scheduled-work-probes.test.ts`. Add `GET` / `PUT /tasks/settings/time-zone` (`tasks:configure`), and build `T/admin/pages/settings/TaskGeneralSettingsPage.tsx`.
- [ ] T072 [US7] Implement the reminders in `T/backend/services/reminder-service.ts`:
  - CRUD, with relative recomputation called from the due-change paths of `task-commands.ts`;
  - the pass, per R-17: claim, visibility check, delivery row plus bell, then e-mail after commit.

  Write the bell and the delivery row in one transaction if T001 (b) said yes. Otherwise use the plan's fallback, de-duplicating on `kind` + `subjectId` + recipient. The e-mail goes through `T/backend/services/task-email.ts`, modelled on `P/backend/services/stage-alert-email.ts`, with `T/backend/email-templates/reminder-defaults.ts`.
  - **Orchestrator ruling 3 (2026-10-28):** the bell is written co-transactionally through a new, additive `adminNotificationRecordPort.recordWithin(em, input)` in `admin_notifications` (`foreign-module-changes.md` §E2), so the delivery row and the bell commit together and the bell is exactly once (SC-004). Implement that port method in this task (test first), and use it instead of the fallback above.
- [ ] T073 [US7] Implement the digest:
  - `T/backend/services/digest-service.ts`: the claim `update … returning` under `skip locked`, the per-recipient list, the bell and the e-mail;
  - `email-templates/digest-defaults.ts`;
  - first check whether the template engine supports a repeated block, and record the finding; otherwise use the preformatted `taskList` variable;
  - the routes `/tasks/me/digest`.
- [ ] T074 [US7] Implement `T/backend/workers/tasks-reminders-worker.ts`, modelled on `P/backend/workers/stage-alert-worker.ts`:
  - Job Scheduler `tasks-reminders` every 60 s, `concurrency: 1`;
  - for each pass, presence, then the probe, then `enterSystemScope`;
  - digest cadence at most every 15 min;
  - started from `T/backend/index.ts` only where `processRunsWorkers && moduleQueueRedis`, attached with `ctx.worker`, closed `onClose`;
  - register the e-mail defaults in an ungated `ctx.onBoot`.

  Run `manifests:generate` (new peers `bullmq`, `ioredis`, `@endora-commerce/email-components`) and `pnpm install --lockfile-only`. Run `check:subscribe-seam`. T068 and T069 green.
- [ ] T075 [US7] Build `T/admin/components/{RemindersSection,DigestControl}.tsx`, mounted in `TaskDetail.tsx` and `MyTasksPage.tsx`. T070 green.

---

## Phase 10: User Story 8 — Drafts and private Tasks (Priority: P3)

**Goal**: the write paths and the UI on top of the Phase 2 predicate, and `tasks:see_private`.

**Independent Test**: `quickstart.md` §1, US8 row.

- [ ] T076 [P] [US8] Write failing `backend/test/integration/tasks/draft-private.test.ts`, extending T012 with the write side and every surface added since:
  - **Drafts:**
    - create as a draft: no notification, no reminder fires, the completion gate ignores it;
    - publish by the Creator notifies assignees and mentions, emits `tasks.task.created.v1`, sets `published_at`;
    - publish by another admin gives 403;
    - re-drafting is impossible.
  - **Private Tasks:**
    - with an assignee other than the Creator, 422 `TASK_PRIVATE_ASSIGNEE`;
    - placing one in a Project is refused (check constraint mapped to 422);
    - a holder of `tasks:see_private` may read and delete one, and gets 403 `TASK_PRIVATE_READ_ONLY` on every other write route (loop over the route table);
    - it is absent for others from the board, saved-view results, `TasksPanel` lists, `@@` lookups (tasks, CRM, Projects), reference resolution in CRM and Projects, comment and attachment routes, and the digest.
- [ ] T077 [P] [US8] Write failing `admin/test/modules/tasks/TaskCreate.draft-private.test.tsx`:
  - *Save as draft* and the *Private* switch, which limits the assignee picker to self and hides the context picker;
  - the detail's *Draft* badge with *Publish*;
  - the read-only rendering for a `tasks:see_private` reader.
- [ ] T078 [US8] Implement the write paths in `T/backend/services/task-service.ts` and `task-commands.ts`:
  - `draft` and `private` on create;
  - `private` on update (Creator only);
  - the `publish` Command and route;
  - delete allowed for `tasks:see_private` on a private Task;
  - suppress notifications for drafts in the notifier, mention and comment services;
  - map the check constraints to 422s.

  T076 green.
- [ ] T079 [US8] Build the UI in `T/admin/pages/{TaskCreate,TaskDetail}.tsx` and its strings. T077 green.

---

## Phase 11: User Story 9 — Tags and Priorities configured by the operator (Priority: P3)

**Goal**: the two configuration screens, and priority removal with replacement.

**Independent Test**: `quickstart.md` §1, US9 row.

- [ ] T080 [P] [US9] Write failing `backend/test/integration/tasks/tags-priorities.test.ts`:
  - **Tags:**
    - rename and recolour;
    - a duplicate name ignoring case gives 409 `TASK_TAG_NAME_TAKEN`;
    - delete cascades from Tasks, with `usageCount` in the audit row;
    - `tasks:write` cannot create, rename or delete (403).
  - **Priorities:**
    - create, rename en/pl, reorder;
    - sorting by priority follows the new order;
    - remove with replacement `high` moves Tasks with history rows;
    - remove with `none` clears them.
- [ ] T081 [P] [US9] Write failing `admin/test/modules/tasks/TaskTagsPage.test.tsx` and `TaskPrioritiesPage.test.tsx`: tables, dialogs, the delete confirmation showing the usage count, and the replacement select.
- [ ] T082 [US9] Complete the configuration services:
  - `T/backend/services/tag-service.ts`: update and delete;
  - `priority-service.ts`: create, update, reorder, and delete with replacement, sharing the reassignment helper with T045.

  Add the routes per `admin-api.md` §4. T080 green.
- [ ] T083 [US9] Build `T/admin/pages/settings/{TaskTagsPage,TaskPrioritiesPage}.tsx` and their routes. Add the palette actions `open-task-workflow`, `open-task-tags` and `open-task-priorities` to `T/manifest.ts` with en/pl labels, then run `backend/test/contract/tasks/palette-actions.test.ts`, extended first. T081 green.

---

## Phase 12: User Story 10 — Stage Tasks stay consistent (Priority: P3) — issue #450

**Goal**: idempotent Stage Task creation, and a sweep that removes Tasks orphaned while Tasks was off.

**Independent Test**: `quickstart.md` §1, US10 row.

- [ ] T084 [P] [US10] Extend `backend/test/integration/projects/stage-tasks.test.ts`. Force `taskWritePort.createMany` to fail after 2 of 5 Tasks: inject a failing Command on the third via the test seam the existing failure test uses (read it first). Then call `POST …/materialize-tasks` three times, including two concurrently. Assert exactly 5 Tasks, each with a distinct `source_key`.
- [ ] T085 [P] [US10] Write failing `backend/test/integration/tasks/maintenance.test.ts`:
  - with Tasks off, delete a Project with 3 Tasks and a Stage with 2 Tasks of another Project;
  - with Tasks on, run the maintenance pass: the 3 Tasks are deleted (audit `reason: context_gone`) and the 2 lose `context_group_id`;
  - with Projects **off**, a pass deletes nothing;
  - a contributor without `existingContexts` is never cleaned;
  - a pass with nothing to do enters no scope.
- [ ] T086 [US10] Implement the source key.
  - `T/backend/services/task-write-port.ts`: skip a `sourceKey` that already exists, return its existing id in order, and treat a unique violation as "already created".
  - `P/backend/services/stage-task-service.ts`: pass `sourceKey = definition.id`. Simplify `retry()` only where the docblock explains why the guard is no longer needed. Otherwise keep it.

  T084 green.
- [ ] T087 [US10] Implement the clean-up.
  - `P/backend/services/task-context-descriptor.ts`: `existingContexts`.
  - `P/backend/services/project-access.ts`: a system-mode existence query. Update the ledger.
  - `T/backend/services/maintenance-service.ts`: the batched pass of R-19.
  - Add it as the third pass of `tasks-reminders-worker.ts`.
  - Add the service to the allow-list of T017's seam test.

  T085 green.

---

## Phase 13: Polish & Cross-Cutting Concerns

- [ ] T088 [P] Add the demo data.
  - Create `T/backend/demo/{rows,seed,reset}.ts` with 10 Tasks per R-23. Set `manifest.demo` per the demo convention: read `P/backend/demo/` and the composition step registration in `packages/demo-composition/src/composition.ts` first.
  - Update the `tasks` counts in `backend/test/integration/demo/{demo-shop,demo-reset-after-use}.test.ts`.
- [ ] T089 [P] Write the documentation.
  - `packages/modules/tasks/docs/tasks.md` (users and developers): every story, the new permissions and settings, the descriptor's `existingContexts` contract, the events' new shape, and the upgrade note (statuses are now configurable; existing assignees are kept).
  - Its Polish copy.
  - CRM and Projects docs: the two new reference kinds.

  Run `check:module-docs` and `check:docs-translations`.
- [ ] T090 [P] Extend the off-state coverage in `backend/test/integration/tasks/off-state.test.ts`:
  - every new route answers 503;
  - the worker probe stays idle;
  - the asset protection still holds;
  - the `task` custom-field type is hidden;
  - the Opportunity, Order and Quote Request detail APIs are unaffected.

  Run `check:off-state-coverage`.
- [ ] T091 Run the performance tests: the T024 suite plus the board under 2 s with 5 000 Tasks (SC-002). Record the figures under this task.
- [ ] T092 Have `endora-commerce-designer` review `TasksPage` (board and list), `TaskDetail` and the three settings pages against `.claude/skills/ux-laws/SKILL.md`. Fix every finding marked must, and record the others as follow-up issues.
- [ ] T093 Have an independent reviewer go over the visibility path:
  - every file reading a Task-owned table;
  - the seam test's allow-list;
  - the `tasks:see_private` write refusals;
  - the sweeps' recipient checks.

  Record the result in the PR description.
- [ ] T094 Run the full verification set of `quickstart.md` §3.
  - Regenerate `composer:generate`, `manifests:generate`, `pnpm install --lockfile-only` and the OpenAPI baseline.
  - Grep `backend/test/**` and `admin/test/**` for `TagPicker`, `MoveToMenu` (the CRM path), `TasksList`, `MyTasks.tsx`, `assignedAdminUserId` (task) and `TASK_STATUSES`.
  - Run `check:naming`, `check:language`, `check:command-coverage -- --strict --module tasks` and `check:port-dependencies`.
- [ ] T095 Do the manual browser walk of `quickstart.md` §2 on the demo shop. Record any deviation as a defect under the task that owns it.
- [ ] T096 Apply the planning amendments to `spec.md`: SC-004, US7 scenarios 2 and 6, the time zone, FR-011 and FR-005, per `plan.md` *Amendments from planning*, each marked as a planning amendment. Update issue #480's checklist.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1):** T001 first. Its findings steer T045 and T072.
- **Foundational (Phase 2):** needs Phase 1 and blocks every story. T013 → T014 → (T015, T016) → T017 → T018 → (T019, T020, T021, T022, T023) → T024 → T025.
- **US1 (Phase 3):** needs Phase 2. Its reference work (T032–T036) is needed by US4 and US6.
- **US2 (Phase 4):** needs Phase 2. It must precede US3, because the board's columns are the workflow.
- **US3 (Phase 5):** needs US2, and US1's tag and priority reads (for filters and cards).
- **US4 (Phase 6):** needs US1 (T036).
- **US5 (Phase 7):** needs Phase 2 only.
- **US6 (Phase 8):** needs US1 (T033, T036).
- **US7 (Phase 9):** needs Phase 2 and US1's due time (T037).
- **US8 (Phase 10):** needs Phase 2. Its matrix (T076) also covers surfaces from US3, US4 and US6, so run it after those.
- **US9 (Phase 11):** needs US1 (T037, T040) and US2 (T045's reassignment helper).
- **US10 (Phase 12):** needs Phase 2. T087 needs T074 (the worker).
- **Polish (Phase 13):** needs every story it documents or measures.

### Parallel opportunities

These assume separate worktrees per `AGENTS.md`, branched off this feature branch after T025.
- **Track A:** US1 → US4 → US6.
- **Track B:** US2 → US3.
- **Track C:** US5, then US10's T084/T086.
- **Track D:** US7 after T037 lands, then T087.
- **Inside a phase:** every task marked [P] (tests, separate files) runs in parallel.
- **Hot files** are rebased by adding lines: `T/backend/index.ts`, `T/manifest.ts`, `T/admin/index.ts`, `T/admin/api.ts`, `T/admin/pages/TaskDetail.tsx`, the i18n bundles and `X/tasks.ts` (frozen after T004).

### Parallel example: User Story 1

```text
Together, red first:
  T026 task-fields.test.ts · T027 references.test.ts · T028 crm/projects references
  T029 attachments.test.ts · T030 custom-fields-host.test.ts · T031 admin + kit tests
Then: T032 → T033 → T034 ∥ T035 → T036; T037 ∥ T038 ∥ T039 ∥ T040 → T041
```

---

## Implementation Strategy

1. **MVP = Phases 1–5:** the Foundational shape, US1, US2 and US3. At that point a team can plan, track and board Tasks with their own workflow. Ship it to the demo for the owner's look before the P2 stories.
2. **Then the P2 stories:** US4, US5, US6 and US7, each merged when its tests are green.
3. **Then the P3 stories:** US8, US9 and US10, followed by Polish.
4. **One merge request** delivers the feature, from `165-task-management` to `master`. If the owner wants the MVP earlier, split at the Phase 5 checkpoint. Every phase is green on its own, and the migration is single.

---

## Requirement traceability

| Requirement | Tasks |
| --- | --- |
| FR-001 assignees | T016, T026, T037 |
| FR-002 due/start | T015, T026, T037 |
| FR-003 rich description | T041 |
| FR-004 references (#446) | T027, T036 |
| FR-005 reference kinds | T003, T005, T028, T032–T036 |
| FR-006 mentions | T027, T036 |
| FR-007 custom fields | T030, T038 |
| FR-008 attachments | T029, T039 |
| FR-009 / FR-024 priorities | T026, T037, T080, T082 |
| FR-010 / FR-023 tags | T026, T037, T040, T080, T082 |
| FR-011 history | T016, T026, T041 |
| FR-012–FR-016 workflow | T042, T045–T047 |
| FR-017 closed = category | T016, T019, T043 |
| FR-018 list/board remembered | T050, T053, T055 |
| FR-019 board | T048, T051, T054, T055 |
| FR-020 filters/sorts | T023, T048 |
| FR-021 saved filters | T049, T052 |
| FR-022 card fields | T051, T055 |
| FR-025 / FR-026 comments | T056, T058 |
| FR-027–FR-030 hierarchy/relations | T060, T062 |
| FR-031–FR-033 links/panels | T064–T067 |
| FR-034 / FR-035 reminders | T068, T072, T074 |
| FR-036 digest | T069, T073 |
| FR-037 / FR-038 draft/private | T011, T012, T018, T076, T078 |
| FR-039 / FR-040 #450 | T084–T087 |
| FR-041 permissions | T006, T042, T076, T080 |
| FR-042 palette/off-state | T083, T090 |
| FR-043 i18n/docs | T041, T089 |
| FR-044 no storefront | T090 (no storefront route registered) |
| FR-045 ports unchanged in behaviour | T019, T021, T043 |
| SC-002 performance | T024, T091 |
| SC-005 no leak | T012, T076, T093 |
| SC-006 #450 | T084, T085 |
| SC-008 upgrade identical | T009, T019, T021 |
