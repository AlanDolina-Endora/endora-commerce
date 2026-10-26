---
description: "Task list for Projects, with a first version of Tasks"
---

# Tasks: Projects, with a first version of Tasks

**Input**: Design documents from `specs/163-projects-and-tasks/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED. Constitution III is non-negotiable: in every phase the test tasks come
first, are run, and must fail *for the stated reason* before the implementation task that turns
them green is started. Report which tests were seen red.

**Organization**: by user story. Phase 3 (User Story 1) is the MVP — a Project run through its
Stages **with the Tasks module switched off**, the owner's "a Project without Tasks".

## Format: `[ID] [P?] [Story] Description`

- **[P]** — can run in parallel with its neighbours **inside its own phase**: a different file,
  no dependency on an unfinished task of that phase.
- **[US#]** — the user story of `spec.md` the task serves. Setup, Foundational and Polish tasks
  carry none.
- Parallelism **between stories** (separate worktrees) is in *Dependencies & Execution Order*.

## Path conventions

- Modules: `packages/modules/tasks/` and `packages/modules/projects/` — `src/manifest.ts`,
  `src/backend/` (composition in the **single** `src/backend/index.ts`, one delimited section
  per area — `check:port-dependencies` reads only that file, CRM `research.md` N-6),
  `src/migrations/`, `src/admin/`; `i18n/` and `docs/` at the package root.
- Unit tests beside their subject as `*.test.ts`. Contract / integration / perf tests:
  `backend/test/{contract,integration,perf}/{tasks,projects}/`. Admin screen tests:
  `admin/test/modules/{tasks,projects}/`.
- Targeted runs: `pnpm --filter backend exec vitest run <path>`;
  `pnpm --filter @endora-commerce/mod-projects run test`; `pnpm --filter admin exec vitest run
  <path>`; `pnpm --filter @endora-commerce/admin-kit run test`.

## Standing rules for every task

1. **Read before writing**: the routed convention for what you are about to do (`AGENTS.md`
   § *Where the rest of it lives*), and the CRM prior art the task names
   (`packages/modules/crm/`, `specs/143-crm-sales-opportunities/`).
2. **A premise tagged [unverified] in `research.md` or the contracts is re-derived by reading the
   tree** at the task that names it; record the finding in the pull-request description.
3. **Rebuild a package you edited before running tests against it** (`dist` vs `paths`).
4. **Regenerate, never edit**, generated files; run `pnpm install --lockfile-only` beside
   `manifests:generate`.
5. A file outside the two modules may be touched **only** if `contracts/foreign-module-changes.md`
   lists it. Otherwise stop and report.
6. **Every Project read goes through `ProjectAccess`** (research R-2). No route, service, worker
   or port implementation reads a `@RuleScoped` projects entity by id or lists one without it.
7. Never run `db:fresh`, `db:reset`, `setup` or `module:*` against the development database
   unprefixed.
8. Commits: conventional style, `git commit -s` (DCO), no `Co-Authored-By` or AI trailer.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: two registered, empty, buildable modules; the host's `work` navigation group; the
contracts files. Nothing user-visible yet.

- [x] T001 Create the package skeleton `packages/modules/tasks/` from the non-source scaffolding of `packages/modules/crm/` (`tsconfig.json`, `tsconfig.build.json`, `tsconfig.ui.json`, `vitest.config.ts` with name `mod-tasks`, `tailwind.css`, `LICENSE`, `README.md`, empty `CHANGELOG.md`), a hand-seeded `package.json` (`name: "@endora-commerce/mod-tasks"`, the workspace's lockstep `version`, `endora: { type: "module", id: "tasks" }`), `src/manifest.ts` (`defineModuleManifest({ id: 'tasks', name: 'Tasks', version, dependencies: ['auth', 'settings'], activation: { settingCode: 'tasks.enabled', default: true }, settings: <group 'tasks' + boolean 'tasks.enabled'>, docs: false, demo: false })`), `src/backend/index.ts` (`registerModule(ctx)` empty, `export const entities = []`), `src/migrations/index.ts` (`export const migrations = []`)
  - Each package also carries `src/backend/manifest.test.ts` (activation and its setting, CRM's skeleton test): the package's `vitest run` has no `--passWithNoTests`, so a package with zero test files would fail `pnpm --filter '!backend' run test`.
- [x] T002 Create the package skeleton `packages/modules/projects/` the same way (`@endora-commerce/mod-projects`, id `projects`, activation `projects.enabled`, settings group `projects` with the boolean only for now)
- [x] T003 Run `pnpm --filter backend run manifests:generate`, `pnpm install --lockfile-only`, `pnpm --filter backend run composer:generate`; commit exactly the artefacts reported; prove with `composer:check`, `manifests:check`, `overlay:check`, `pnpm install --frozen-lockfile`
  - **Deviation (2026-10-26):** `backend/package.json` gains `@endora-commerce/mod-tasks` and `@endora-commerce/mod-projects` as `workspace:*` dependencies — not listed in `contracts/foreign-module-changes.md`, and no generator writes it, but the generated `manifest-index`/`composition` import both packages by bare specifier and `overlay:check` fails `ERR_MODULE_NOT_FOUND` without it. CRM's skeleton commit `fc2a92e2d` made the same edit. `manifests:generate` refuses to run (*emitted-declarations 64 of 66*) until both packages have a `dist`, so they are built first.
- [x] T004 Measure, do not assume: `pnpm run check:naming`, `pnpm run check:language`, `typecheck` + `build` of both packages, `pnpm --filter backend exec vitest run test/unit/db/module-graph.test.ts test/unit/kernel/` against the skeletons. If `check:naming` refuses an id or the table names planned in `data-model.md` (`tasks`, `projects`, `project_*`), **stop and report** — do not rename, do not add an exemption
  - Measured 2026-10-26: `check:naming` and `check:language` green with the ids `tasks` and `projects` (the table-name rule is snake_case only, so `tasks`, `projects`, `project_*` pass); both packages type-check, build, lint and run their own tests; `module-graph.test.ts` + `test/unit/kernel/` 29 files / 676 tests green — after `build:packages`: against stale `dist`s the run died in global setup (`parseEntries` reading `entry.cls.name` of `undefined`).
- [x] T005 [P] Write failing schema tests `packages/contracts/src/tasks.test.ts` and `packages/contracts/src/projects.test.ts`: one accept and one reject case per request schema of `contracts/admin-api.md` §1 and §2.1–§2.6 (title bounds, value with two decimals and currency together, alert offsets 1–365 distinct, `close` body discriminated on `outcome`, `visibility` enum, `TaskContext` all-or-nothing)
  - Seen red 2026-10-26: all three files failed to load, `Cannot find module './tasks.js'` / `'./projects.js'` (no contract existed). Green after T008.
- [x] T006 [P] Write failing `packages/contracts/src/record-references.test.ts`: the five-type grammar (`admin_user`, `order`, `product`, `quote_request`, `task`) — format, extract (deduplicated, first-appearance order), split, `mentionedAdminUserIds`, an unknown type left as text; and `RecordDocumentLookupResponse` shape
  - Seen red 2026-10-26: `Cannot find module './record-references.js'`. The file also covers `record-rich-text.ts` reading the two new types, the shared `RecordHistoryQuerySchema`, and that every CRM name is the **same** function/schema (`toBe`) as the shared one. Green after T009.
- [x] T007 [P] Write a failing admin test `admin/test/modules/projects/nav-section.test.tsx`: a contribution with `section: 'work'` renders under a heading "Projects & tasks" placed after *CRM*; with no visible item the heading is absent. First `grep -rn "AdminNavSectionNameSchema\|appShell.section\|'crm'" admin/test backend/test packages/*/src` and list every test enumerating sections so T010 updates them in the same change
  - The grep found no test enumerating the whole section set — each names the sections it asserts on, and `crm/nav-section.test.tsx` only asserts `options` contains `crm` — so T010 updated none. Seen red 2026-10-26 for the stated reason: `options` lacks `work`, the bundles lack `appShell.section.work`, and the shell throws *"Module 'projects' contributes a sidebar entry in section 'work', which this shell does not declare"*.
- [x] T008 Implement `packages/contracts/src/tasks.ts` and `packages/contracts/src/projects.ts` — every Zod schema, inferred type, port and registry interface, event payload type and error code of `contracts/admin-api.md` and `contracts/ports-and-events.md`, for **all** stories (later stories add no contract); withhold each port's `Container name:` marker until the change that registers it (`check:port-shape`, CRM N-5); export both from `packages/contracts/src/index.ts`; T005 green
  - Error codes are exported as `TASKS_ERROR_CODES` / `PROJECTS_ERROR_CODES` lists, **not** added to `ERROR_CODES` (`errors.ts`): `check:error-translations` P3 refuses an `ERROR_CODES` member no manifest declares, and CRM's precedent adds each code "in the change that adds its first raise site". So Phase 2+ must edit `packages/contracts/src/errors.ts`, which `contracts/foreign-module-changes.md` §A does not list.
  - Codes added beyond those `admin-api.md` names, each for a refusal the contracts describe without a code: `TASK_ASSIGNEE_INVALID`, `PROJECT_MESSAGE_IMMUTABLE`, `PROJECT_STAGE_TASKS_NOT_RETRYABLE` (the `materialize-tasks` "409 otherwise"), `PROJECT_LOSS_REASON_INVALID` (FR-005), `PROJECT_MEMBER_INVALID` (FR-008), `PROJECT_TEMPLATE_NOT_FOUND`, `PROJECT_ATTACHMENT_TOO_LARGE`.
  - `RecordHistoryPage` (named by `admin-api.md` for both modules) is `RecordHistoryPageSchema` in `record-references.ts`, CRM's `OpportunityHistoryResponse` shape; CRM's own history schemas are untouched. List answers follow the contract literally (`{ items, nextCursor[, total] }`, no envelope); single-record answers also have `dataEnvelope` `*ResponseSchema` siblings, as CRM's do.
  - `Container name:` markers withheld on all five ports/registries (CRM N-5).
- [x] T009 Implement `packages/contracts/src/record-references.ts` and move `packages/contracts/src/crm-rich-text.ts`'s helpers to `record-rich-text.ts` under neutral names; keep every name `crm.ts` §9 and `crm-rich-text.ts` export today as **aliases** of the shared ones (types widened to five, research R-14); run `packages/contracts/src/crm.test.ts` unchanged plus T006 → green; rebuild `contracts`
  - **Deviation (2026-10-26):** widening CRM's aliases to five types does not compile in `mod-crm` without CRM edits that `foreign-module-changes.md` §C lists but schedules for the CRM reference-standard work: `StoredReference.targetType` no longer fits `CrmReferenceTargetType`, and `ReferenceField.tsx` / `editor/reference-node.ts` index three-key maps by the widened type. It is also a runtime defect, not only a type error: with the widened grammar a CRM text holding `[[task:<uuid>]]` answers **500** (`crm_opportunity_references_target_type_check`). Minimal, behaviour-preserving edits in listed files: `reference-service.ts` stores only the three types the constraint admits (others resolve `available: false`); `ReferenceField.tsx` and `lib/mention-trigger.ts` narrow the *pickable* kinds to the three; `reference-node.ts` gains chip classes for the two types; CRM `i18n/{en,pl}.json` gain `references.unavailable.{quote_request,task}`. Proven by a new case in `backend/test/integration/crm/references.test.ts` (§C lists it), seen red with the filter removed (500, check-constraint violation) and green with it. The CRM reference-standard phase replaces all of it.
  - `crm.test.ts` and `crm-rich-text.test.ts` pass unchanged; `mod-crm` 440 tests, `admin/test/modules/crm` 544 tests, and `backend/test/{integration/crm/{references,mentions,comments},contract/crm}` 294 tests green.
- [x] T010 Add the host navigation group (research R-16): `'work'` in `AdminNavSectionNameSchema` (`packages/contracts/src/admin-contributions.ts`); `{ key: 'work', labelKey: 'appShell.section.work', items: [] }` after `crm` in `packages/admin-shell/src/components/AppShell.tsx`; `appShell.section.work` = "Projects & tasks" / "Projekty i zadania" in `packages/modules/_i18n/i18n/{en,pl}.json`; update the tests T007 listed; T007 green
- [x] T011 [P] Write changesets (`minor`, never `major` in `0.x`): `.changeset/tasks-module.md` (new `@endora-commerce/mod-tasks`), `.changeset/projects-module.md` (new `@endora-commerce/mod-projects`), `.changeset/contracts-tasks-projects.md` (new exports, shared reference grammar, `work` section); verify with `pnpm --filter backend exec tsx scripts/check-release-intent.ts --since origin/master`
  - A fourth changeset, `.changeset/crm-reference-grammar-widened.md` (`mod-crm` patch), records T009's CRM-visible change; `admin-shell` and `mod-i18n` are named in `contracts-tasks-projects.md`, the `work` section's one meaning.
- [x] T012 Phase gate: `pnpm run build:packages`, `pnpm -r run typecheck`, `pnpm -r run lint`, `pnpm --filter backend run test:unit:fast`, `pnpm --filter '!backend' run test`
  - Run 2026-10-26 on Node 26.2.0: `build:packages`, `pnpm -r run typecheck` and `pnpm -r run lint` exit 0 (lint warnings only, none in a file this phase touched). `test:unit:fast` 360 files / 7 709 tests green — after deleting and rebuilding `packages/modules/price_lists/dist`, whose two stale `*.entity.js` (entities removed upstream, never cleaned by `tsc`) failed `tenancy/classification-check.test.ts` (*package read 11 entity class(es), repository read 9*). `pnpm --filter '!backend' run test`: every workspace green except `admin`, whose 64 failures in five product-browser files (`kit/kit-product-browser`, `orders/OrderCreatePage.{catalog-permission,product-browser}`, `quote_requests/RfqCreatePage.{catalog-permission,product-browser}`) are `window.localStorage` undefined — Node 26's built-in Web Storage — and pass with `NODE_OPTIONS=--no-experimental-webstorage` (64/64); none of those files or their subjects differ from `origin/master`. One `--no-bail` rerun also failed `crm/OpportunitiesList.more-filters` once under load; it passes 3/3 alone. `check:off-state-coverage` reports `tasks` and `projects` uncovered until T014/T026.

**Checkpoint**: the workspace installs and builds with two empty modules registered.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: both modules' whole schema and entities, activation, the Task context seam, the
`ProjectAccess` seam, one gated route each, off-state proofs, docs skeletons.

**⚠️ CRITICAL**: no user story starts before this phase is green.

### 2A — Tasks: tests first

- [x] T013 [P] Write failing `backend/test/integration/tasks/migration.test.ts` (model `backend/test/integration/crm/migration.test.ts`): table `tasks` with every column, check and index of `data-model.md` §1, the context all-or-nothing check, `tasks_number_seq`
  - Seen red 2026-10-26: 10 of 10 failed, no `tasks` relation. Green after T018. The `id` column defaults to `gen_random_uuid()` and the timestamps to `now()`, per `data-model.md`'s conventions (CRM's init declares neither).
- [x] T014 [P] Write failing `backend/test/integration/tasks/off-state.test.ts` with `expectModuleAbsent(h, 'tasks', { routes: [{ url: '/api/v1/admin/tasks', cookies: admin }], adminPresence: { cookies: admin } })`, positive control first
  - Seen red 2026-10-26: the positive control answered 404 `NOT_FOUND` where 200 was expected, and the deactivated phase 404 where 503 `MODULE_DISABLED` was. Green after T021.
- [x] T015 [P] Write failing `backend/test/integration/tasks/context-visibility.test.ts`: a probe contributor registers `contextType: 'probe'`; Tasks without context visible to any `tasks:read` holder; a Task whose context id the probe hides is absent from `GET /tasks`, its count and `GET /tasks/:id` (404 identical to non-existent); an **unregistered** context type hides its Tasks; the contributor's module switched off hides them and switching it on restores them
  - Seen red 2026-10-26: `AwilixResolutionError: Could not resolve 'taskContextRegistry'`. *Its count* is read as `taskReadPort.countInContext` asked as the administrator — `TaskListResponse` carries no total (`admin-api.md` §1). One more case proves the system actor is not narrowed. The probe is owned by `crm` (a toggleable module) for the length of the file.
- [x] T016 [P] Write failing unit tests `packages/modules/tasks/src/backend/services/task-visibility.test.ts` for the SQL pre-filter builder (no contributors; one; two; empty visible set; system actor not narrowed)
  - Seen red 2026-10-26: `Cannot find module './task-visibility.js'`. Also covers `canSee` for a single Task; `task-context-registry.test.ts` beside it holds the registry's enumeration policy.

### 2A — Tasks: schema, seam, ports

- [x] T017 Scaffold `pnpm --filter backend run migration:new -- --module tasks --name init` and write `up`/`down` in the scaffolded `packages/modules/tasks/src/migrations/<stamp>_tasks_init.ts` per `data-model.md` §1; export it from `src/migrations/index.ts`
- [x] T018 Create `packages/modules/tasks/src/backend/entities/task.entity.ts` — `@RuleScoped()`, class `Task`; export it in `entities` from `src/backend/index.ts`; run `composer:generate` + `manifests:generate` + `pnpm install --lockfile-only`; add it to `backend/test/helpers/package-entities.ts` only if that file enumerates packages by hand (read its header first — [unverified] in `foreign-module-changes.md` §E); T013 green; `check-entity-tenant-classification` green
  - `backend/test/helpers/package-entities.ts` does enumerate packages by hand, so `Task` was added. `check-entity-tenant-classification`: 225 classified, 0 unclassified.
- [x] T019 Implement `packages/modules/tasks/src/backend/services/task-context-registry.ts` (ungated `TaskContextRegistryPort`; enumerates contributors filtered by `effectiveState.isPresent(ownerModuleId)`; absent-owner policy in the header comment) and `services/task-visibility.ts` (builds the pre-filter of research R-9 from `allVisibleContextIds()` per present contributor; system actor unfiltered); register the registry with `ctx.di.register` in the *Context* section of `src/backend/index.ts`; T016 green
- [x] T020 Implement `packages/modules/tasks/src/backend/services/task-number.ts` (`nextTaskNumber(em)` → `TSK-000001`, model `crm/…/opportunity-number.ts`, re-exported by name from `./backend`)
  - `task-number.test.ts` seen red (`Cannot find module './task-number.js'`), then green.
- [x] T021 Implement `packages/modules/tasks/src/backend/services/task-service.ts` read side only — `findVisible(id)`, `list(query)` with the visibility pre-filter, keyset cursor, filters of `contracts/admin-api.md` §1 — and `routes/routes.tasks.ts` `GET /api/v1/admin/tasks`, `GET /api/v1/admin/tasks/:id` gated `requireAdmin('tasks:read')`; manifest `permissions: [tasks:read]` with label in `i18n/{en,pl}.json`
  - Manifest `dependencies` += `admin_users` (`adminUserReadPort` names assignee and creator). The list is newest first on a keyset cursor `(created_at, id)`.
  - **Not done:** `TaskDetail.references` answers `[]` — resolving a Task description's reference tokens is scheduled by no task of this feature (see the Phase 2A report).
  - **Outside the module, not listed in `foreign-module-changes.md`** (each forced by a red test, CRM's precedent for both): `backend/test/fixtures/error-code-routing/reference-ledgers.ts` (`MINTED_ERROR_CODES` += the three `TASK_*` codes) and `backend/test/unit/_i18n/error-code-migration-progress.test.ts` (`tasks` on the roster).
- [x] T022 Implement and publish `taskReadPort` (`services/task-read-port.ts`, `ctx.di.providePort<TaskReadPort>('taskReadPort', …)`; visibility applied for an admin actor, not for the system) and `taskWritePort` (`services/task-write-port.ts`; `createMany` = one `tasks.task.create` Command per Task, ≤ 100, context must be registered + present; `deleteInContext`); add their `Container name:` markers in `packages/contracts/src/tasks.ts`
  - Proven by `backend/test/integration/tasks/write-port.test.ts` (not named by any task): one Command, audit row and event per Task; unregistered type, absent owner, inactive assignee, > 100 and blank title refused before anything is written; `deleteInContext`; both ports 503 while `tasks` is off. Written before the port existed; it was not run on its own red before the port landed. `createMany` refuses an ambient actor that is no administrator (`created_by_admin_user_id` is `not null`).
- [x] T023 [P] Write `packages/modules/tasks/docs/tasks.md` (front matter `title`, `description`; *What it does*, *Switching it on and off*, *Permissions*, *For developers: Task contexts* — the registry contract) and its Polish copy under `docs/i18n/pl/`; `manifest.docs = { dir: 'docs' }`; `composer:generate`, `check:module-docs`, `check:docs-translations`
  - Also: the Polish copy of the generated module reference (`generated:module-reference/tasks`), the sidebar id `sidebar.main.category.tasks`, and the module map's Polish entry, which Phase 1 had left stale (`stale-translation`) — it now carries the `projects` and `tasks` rows. `check:module-docs` and `check:docs-translations` 0 findings.
- [x] T024 T014 and T015 green; add `tasks` to `MIGRATED_MODULES` in `backend/scripts/check-command-coverage.ts`; `pnpm --filter backend run check:off-state-coverage`
  - `check:off-state-coverage` reports only `projects` (expected until T026); `check:command-coverage -- --strict --module tasks` 0 findings. `backend/test/fixtures/openapi-baseline.json` regenerated with `UPDATE_OPENAPI_BASELINE=1` for the two routes (+18 lines, nothing else) — T039 does the same for `projects`.

### 2B — Projects: tests first

- [x] T025 [P] Write failing `backend/test/integration/projects/migration.test.ts`: all 23 tables, checks, indexes and the sequence of `data-model.md` §2; the only FK out of the module is `project_organizations.organization_id → organizations on delete restrict`; unique `(record_kind, record_id)` on `project_links`; unique `(stage_id, offset_days, deadline_on)` on `project_stage_alert_deliveries`; seeded Roles `sales_rep`, `project_manager` and the five loss reasons with en + pl names; `projects.custom_field_values jsonb default '{}'`
  - Seen red 2026-10-26: every case failed on `relation "projects" does not exist` / an empty catalogue. Green after T033 (26 cases). **Deviation:** the baseline table is `project_message_read_baselines` (plural, CRM's `crm_message_read_baselines` shape and the data model's own "tables plural" convention), not `project_message_read_baseline`. Entity classes are enumerated from the ORM metadata rather than `backend/test/helpers/package-entities.ts`, which is therefore untouched.
- [x] T026 [P] Write failing `backend/test/integration/projects/off-state.test.ts`: `expectModuleAbsent(h, 'projects', { routes: [{ url: '/api/v1/admin/projects', cookies: admin }], adminPresence: { cookies: admin }, settingWrite: { code: 'projects.visibility', value: 'everyone', cookies: admin } })`, positive control first
  - Seen red 2026-10-26: positive control 404 `NOT_FOUND` (no route), `projects.visibility` 404 `SETTING_NOT_REGISTERED`, deactivated phase 404 where 503 was expected. A second positive control proves the setting is writable while on (`{ scope: 'all', value }` — the harness's own `settingWrite` sends no `scope`, see the report). Green after T037.
- [x] T027 [P] Write failing unit tests `packages/modules/projects/src/backend/domain/visibility-rule.test.ts`: the Organization rule of research R-2 (all mode; set mode with every / some / none of the Organizations; zero Organizations visible only in all mode) × the visibility rule of R-3 (setting × Project visibility × member / listed / other / `see_all`), as a truth table
  - Seen red 2026-10-26: `Cannot find module './visibility-rule.js'`. 67 cases (10 Organization-rule rows, 6 effective-visibility rows, the 24-row setting × visibility × relation table, and the same 24 out of reach). Green after T034 (one test-side bug fixed: a case reused another case's Project).
- [x] T028 [P] Write failing `backend/test/integration/projects/organization-reach.test.ts` (owner ruling Q1 = C): a sales representative assigned one of a Project's two Organizations gets 404 on detail and no row in the list or its total; an internal Project (no Organization) is visible to an unrestricted admin only; an unrestricted admin sees both; answers are byte-identical to a non-existent id
  - Seen red 2026-10-26: `beforeAll` failed on `relation "projects" does not exist`. Reuses `seed-crm.ts`' Organization, administrator and sales-representative helpers unchanged. Green after T037.
- [x] T029 [P] Write failing `packages/modules/projects/src/backend/project-access-seam.test.ts` (research R-2): parses every file under `src/backend/routes/` and `src/backend/services/` and fails if a `@RuleScoped` projects entity is read with `em.findOne`/`em.find`/`findOneOrFail`/raw `select … from "project…"` outside `services/project-access.ts` and the files that file allow-lists with a reason
  - Seen red 2026-10-26: `Cannot find module './services/project-access.js'`. The rule-scoped set is derived from the entity declarations; the allow-list is two-way (a stale entry fails); the detector has its own cases, and a planted `em.findOne(Project, id)` plus a raw `select … from "project_members"` in a scratch service file were both reported. Green after T035.

### 2B — Projects: schema, access seam, first route

- [x] T030 Scaffold `migration:new -- --module projects --name init` and write `up`/`down` in `packages/modules/projects/src/migrations/<stamp>_projects_init.ts` per `data-model.md` §2 — every table, check, index, the sequence `projects_number_seq`, the seeded Roles and loss reasons (own tables only, `name` jsonb `{en,pl}` + `default_name`, `is_system = true`), `project_message_read_baseline` row id 1 = `now()`; export from `src/migrations/index.ts`
  - "Not null while open (deferred check)" is a **deferred constraint trigger** `projects_open_has_current_stage` (a row check cannot be deferred). Added where the data model's notes imply them: `(state = 'lost') = (lost_stage_id is not null)`, a stage-entry `notes` subset check, length/colour/duration/offset-range checks, `from <> to` on both move tables, `created_at`/`updated_at` on the configuration tables, `projects` and Stages, `unique (template_id, position) deferrable` on Template Stages. Not in the database: distinct alert offsets (a check cannot compare array elements without a subquery) — the service owns it. `current_stage_id`/`lost_stage_id` reference `project_stages` `on delete no action`.
- [x] T031 [P] Create the configuration entities `@GlobalEntity()` in `packages/modules/projects/src/backend/entities/`: `project-role`, `project-loss-reason`, `project-template`, `project-template-role`, `project-template-stage`, `project-template-stage-task`, `project-template-stage-move` (`*.entity.ts`)
  - Arrays are MikroORM `ArrayType` (`uuid[]`, `int[]`, `text[]`) — no precedent in the tree.
- [x] T032 [P] Create the Project entities `@RuleScoped()` in `packages/modules/projects/src/backend/entities/`: `project`, `project-organization`, `project-member`, `project-member-role`, `project-viewer`, `project-stage`, `project-stage-task`, `project-stage-move`, `project-stage-entry`, `project-link`, `project-comment`, `project-message-read`, `project-message-read-baseline`, `project-reference`, `project-attachment`, `project-stage-alert-delivery` (`*.entity.ts`)
  - **Deviation:** `ProjectMessageReadBaseline` is `@GlobalEntity`, not `@RuleScoped` — one installation-wide row naming no Project (CRM's `CrmMessageReadBaseline` is global for that reason). So 15 rule-scoped and 8 global classes.
- [x] T033 Export all 23 classes as `entities` from `packages/modules/projects/src/backend/index.ts`; manifest `dependencies` += `organizations` (the FK forces it — `fk-dependency-drift.test.ts`); `composer:generate` + `manifests:generate` + `pnpm install --lockfile-only`; T025 green; `fk-dependency-drift.test.ts`, `migrations-registry.test.ts`, `check-entity-tenant-classification` green
  - Manifest `dependencies` = `admin_roles` (`permissionService`), `admin_users` (`adminUserReadPort`), `auth`, `organizations` (the FK, `adminTenantScopePort`, `organizationDetailsPort`), `settings` — all non-deactivatable. `fk-dependency-drift`, `migrations-registry`, `module-graph` green; `check-entity-tenant-classification` 248 classified, 0 unclassified.
- [x] T034 Implement `packages/modules/projects/src/backend/domain/visibility-rule.ts` (pure `projectOrgRule`, `effectiveVisibility`, `canSee`); T027 green
- [x] T035 Implement `packages/modules/projects/src/backend/services/project-access.ts` (research R-2, R-3): `currentViewer()` (admin id, `projects:see_all` via `permissionService`, `orgConstraintFor()`), `visibleProjectSql(viewer)` (Organization rule + visibility rule, one fragment over `projects p`), `loadVisible(id)` (404 `PROJECT_NOT_FOUND`), `visibleIds(ids)`, `allVisibleIds()`, `canSeeAs(adminUserId, projectId)` for another admin (`adminTenantScopePort.resolveForAdmin`, every-Organization rule, research R-4); `isOrgInScope` on writes; header comment states it is the module's only read path and why (no ORM filter behind `@RuleScoped`)
  - `canSeeAs` also requires an active administrator holding `projects:read` (R-4's notification rule). `projects:see_all` is read through `permissionService` (wildcard included) although the code is declared only by T086. `isOrgInScope` is exposed as a boolean; `PROJECT_ORGANIZATION_OUT_OF_SCOPE` is raised by the first write (US1). `project-access.test.ts` (SQL fragment, 4 cases) was written after the service, not before.
- [x] T036 Declare in `packages/modules/projects/src/manifest.ts`: settings `projects.visibility` (`everyone`|`members`, default `members`) and `projects.alerts_time_zone` (default `Europe/Warsaw`) with names and descriptions; `permissions` `projects:read`; `i18n: { bundlesDir: 'i18n' }`; create `i18n/{en,pl}.json` with `adminRoles.permission.projects:read`
  - `projects.visibility` is a `string` setting with `enumOptions`; the bundles also carry `settingGroups.projects.name` and `settingLabels.projects.*` (en + pl) so the Settings screen renders them in Polish. `errorCodes: [PROJECT_NOT_FOUND]` with `errors.PROJECT_NOT_FOUND` en + pl; `PROJECT_NOT_FOUND` joins `ERROR_CODES`, `MINTED_ERROR_CODES`, and `projects` the progress roster — those two tests seen red (4 failures: the roster and the ledger both missing the code) before the entries.
- [x] T037 Implement `GET /api/v1/admin/projects` and `GET /api/v1/admin/projects/:id` minimal read (number, title, state, Organizations) in `packages/modules/projects/src/backend/routes/routes.projects.ts` + `services/project-read-service.ts` through `ProjectAccess`, gated `requireAdmin('projects:read')`; T026, T028, T029 green
  - **Not done / narrowed:** `GET /projects/:id` answers `{ data: ProjectSummary }`, not `ProjectDetail` (Stages, Members, moves, permissions arrive with US1); `GET /projects` sorts by `createdAt` (keyset, `order` asc/desc) and refuses `sort=value|deadline` with 400 until the list screen (US1). `overdue` uses "today" in `projects.alerts_time_zone`.
- [x] T038 [P] Write `packages/modules/projects/docs/projects.md` skeleton (*What it does*, *Switching it on and off*, *Who sees a Project*, *Permissions*, per-story placeholders, *For developers*) and its Polish copy; `manifest.docs`; `check:module-docs`, `check:docs-translations`
  - Also the Polish module reference, the Polish module-map row and `sidebar.main.category.projects`. `check:module-docs` and `check:docs-translations` 0 findings.
- [x] T039 Add `projects` to `MIGRATED_MODULES` in `backend/scripts/check-command-coverage.ts`; regenerate `backend/test/fixtures/openapi-baseline.json` with `UPDATE_OPENAPI_BASELINE=1` (CRM N-11)
  - Baseline +18 lines (the two routes), nothing else. `check:command-coverage -- --strict --module projects` 0 findings.
- [x] T040 Phase gate: `quickstart.md` § *Verification before reporting done* for what exists; report every result with its output
  - Run 2026-10-26 on Node 26.2.0, all exit 0: `build:packages`, `pnpm -r run typecheck`, `pnpm -r run lint` (warnings only, none in `projects`), `test:unit:fast` (360 files / 7 715 tests), `check:naming`, `check:language`, `check:command-coverage -- --strict --module projects` and `--module tasks` (0 findings each), `check:off-state-coverage` (switchable 41, proven 41, findings 0 — fully green), `check:admin-zones`, `check:port-dependencies`, `check:port-catches`, `check:entry-scope`, `check:entry-presence`, `check:module-boundary`, `check:module-docs`, `check:docs-translations`, `check:bundle-pairing`, `check:error-translations`, `check:action-route-permissions`, `check-entity-tenant-classification` (248/0), `overlay:check`, `composer:check`, `manifests:check`, `pnpm install --frozen-lockfile`. Targeted: `test/integration/{projects,tasks}/` + the OpenAPI baseline (8 files / 62 tests), and the module-sweeping `_i18n/error-translation`, `settings/retired-activation-rows`, `admin_users/off-state`, `admin_actions/i18n-resolution`, `transactional_emails/registration`, `crm/{references,off-state}`; `pnpm --filter '!backend' run test` with `NODE_OPTIONS=--no-experimental-webstorage` (#442) green, `admin` 371 files.

**Checkpoint**: both modules installed, migrated, toggleable, absent when off; `ProjectAccess`
proven against Organization reach. Stories may start.

---

## Phase 3: User Story 1 — Run a Project through its Stages (Priority: P1) 🎯 MVP

**Goal**: create a Project by hand with Organizations, Members, Roles and Stages; walk it; close
it as completed or lost; reopen it — all with the Tasks module **off**.

**Independent Test**: `backend/test/integration/projects/stage-walk.test.ts` (quickstart US1).

### Tests for User Story 1 (write first, see them fail)

- [x] T041 [P] [US1] Write failing `packages/modules/projects/src/backend/domain/stage-graph.test.ts`: `canMove`, default linear moves from positions, `unreachable()`, a move naming a foreign Stage refused
  - Seen red 2026-10-26: `Cannot find module './stage-graph.js'`. Also covers `first()`, `last()`, `targets()`, self and duplicate moves (`StageGraphError.rule`).
- [x] T042 [P] [US1] Write failing `packages/modules/projects/src/backend/domain/deadline.test.ts`: `deadline = started_on + planned_duration_days`; zero duration = entry day; manual deadline kept on recompute; re-entry restarts `started_on`
  - Seen red 2026-10-26: `Cannot find module './deadline.js'`. Also covers `todayIn` across the October DST change and an invalid zone (`RangeError`); `project-number.test.ts` beside the service was written and seen red the same way.
- [x] T043 [P] [US1] Write failing `backend/test/contract/projects/projects.contract.test.ts`: every endpoint of `contracts/admin-api.md` §2.1–§2.2 against its schema, permission (401/403), and error codes
  - Seen red 2026-10-26: every route 404 `NOT_FOUND` (none registered). Covers the gates (401 without a session, 403 for a `projects:read`-only and a no-`projects` administrator on every route), each answer against its schema and each code this story raises; Stage Task definitions and `materialize-tasks` are US2's and not served.
  - **Contract additions** (`packages/contracts/src/projects.ts`): `CreateProjectBody.stages` (`ProjectStageInputSchema[]`, 1–50) — the body had no way to give a Project its Stages, and an open Project must be in one; without a Template at least one is required (422 `VALIDATION_FAILED`). A resolved `label` on `ProjectRole` / `ProjectLossReason` rows (`pickLocalized` in the response language, then `defaultName`), and `ProjectDictionaryListQuerySchema` (`active=true|false`). Schema cases added to `projects.test.ts`, seen red (2 failures) without the schema change.
  - An administrator's response language is their stored preference, not `Accept-Language` — the Polish-label case sets it on a seeded administrator.
- [x] T044 [US1] Write failing `backend/test/integration/projects/stage-walk.test.ts` with `tasks` switched off: create a Project (2 Organizations, 3 Members, one with *Sales Rep* + *Project Manager*), 3 Stages default-linear, walk to the last, close completed (closed time, entry rows); a second Project closed lost in Stage 2 (reason required, lost Stage recorded); a non-permitted move refused with nothing changed; reopen returns to the closing Stage; a stale `version` → 409 `PROJECT_CHANGED`; the same user is *Sales Rep* in A and *Project Manager* in B
  - Seen red 2026-10-26: `POST /projects` 404 `NOT_FOUND`. Runs every case inside `withModulesDeactivated(['tasks'])` (`helpers.ts` beside it — the `integration/<module>/helpers.ts` precedent — holds the fixtures the projects suites share). Green after T054, first run.
- [x] T045 [P] [US1] Write failing `backend/test/integration/projects/stage-guards.test.ts`: a probe guard registered in `projectStageGuardRegistry` refuses a move with a reason (nothing changes) and is skipped while its owner module is off; events `projects.stage.moved.v1` / `projects.project.closed.v1` / `.reopened.v1` emitted once per Command
  - Seen red 2026-10-26: `AwilixResolutionError: Could not resolve 'projectStageGuardRegistry'`. The probe guard is owned by `crm`; also asserts the guard is asked about `close_completed`, `close_lost` and `reopen` with their stage ids, and that a refused move emits nothing.
- [x] T046 [P] [US1] Write failing `backend/test/integration/projects/audit-coverage.test.ts`: every write of this story produces exactly one audit row with the action names of `data-model.md` §2.4 and `objectType: 'project'`
  - Seen red 2026-10-26: `POST /projects` 404. `PUT /organizations` is **one Command per Organization added or removed** (`organization_add` / `organization_remove`, each one row), so the trail names each; a refused write leaves no row; the loss comment never reaches the trail (its length does).
- [x] T047 [P] [US1] Write failing admin tests `admin/test/modules/projects/ProjectsList.test.tsx`, `ProjectCreate.test.tsx`, `ProjectDetail.stage-bar.test.tsx` (permitted moves only as buttons; completion button only where permitted; lost dialog requires a reason; 409 messages rendered)
  - Seen red 2026-10-26: the three screen files `Failed to resolve import …/pages/ProjectsList|ProjectCreate|ProjectDetail`; also written and seen red: `admin/test/modules/projects/off-state.test.tsx` (no `projects` entry in the admin registry, no `/projects` in the sidebar) and the package's `src/admin/index.test.ts` (`Cannot find module './index.js'`). `projects-fixtures.tsx` beside them renders over the shipped bundles. `ProjectCreate.test.tsx` stands the kit's `AdminUserPicker` in with a select: the picker searches through the kit's private `api-client` module, which no `vi.mock` of the published `lib` barrel reaches.

### Implementation for User Story 1

- [x] T048 [P] [US1] Implement `packages/modules/projects/src/backend/domain/stage-graph.ts` (model `crm/…/domain/opportunity-status-graph.ts`); T041 green
- [x] T049 [P] [US1] Implement `packages/modules/projects/src/backend/domain/deadline.ts` with the alert-zone "today" from `projects.alerts_time_zone`; T042 green
  - `todayIn(timeZone)` is the domain half; the services read `projects.alerts_time_zone` through `ProjectReadService.timeZone()`. An invalid zone throws (`RangeError`) — T118's validator is what prevents one.
- [x] T050 [US1] Implement `services/project-number.ts` (`PRJ-000001`) and `services/project-service.ts` — create (Organizations each in scope, Members active admins, default visibility `inherit`), update (title, description, value two decimals + currency, start date; `version`), delete (409 `PROJECT_HAS_LINKS`), set Organizations (409 `PROJECT_ORGANIZATION_IN_USE`, 422 out of scope), set Members + Roles — every write a Command per `data-model.md` §2.4
  - Every write is a Command on the locked Project row; every refusal is checked before it. Version: `PATCH` and every transition bump it; Stage, Organization and Member edits lock the row but do not.
  - Inserts are flushed in foreign-key order by hand: these entities hold each other's ids as values, not relations, so the unit of work cannot order them (`projects_current_stage_fk` is not deferrable; the open-Project trigger is).
  - **Not done here, each refused or deferred to its story:** `templateId` → 422 until T077; non-empty `customFieldValues` → 422 until T124; `PATCH` of `visibility` / `viewerIds` → 422 until T086 (create **does** store `visibility` and `viewerIds`, validated as active administrators); `PROJECT_ORGANIZATION_IN_USE` is not raised — which Organization a linked record belongs to needs the owners' read ports (T092), and no link can be made before US6; deleting a Project does not delete its Tasks yet (T069).
  - Organizations: unknown and out of reach answer the same 422 `PROJECT_ORGANIZATION_OUT_OF_SCOPE`. Members: an archived Role is refused unless that Member already holds it on the Project.
- [x] T051 [US1] Implement `services/stage-service.ts` — create/update/delete/reorder Stages (refusals of `data-model.md`), `PUT moves` returning `unreachableStageIds`, default moves on creation, the last Stage `completion_permitted`
  - A Stage added at the end gets the default move from the Stage that was last; its `completionPermitted` defaults to false. Delete checks `PROJECT_STAGE_LAST` before `PROJECT_STAGE_CURRENT` (the only Stage of an open Project is always current), and treats a closed Project's closing Stage as current; the remaining Stages are renumbered.
  - **Not done:** `PROJECT_STAGE_HAS_TASKS` — no Stage can hold a Task until the `project` context is registered (T068); T069 adds the check with `taskReadPort.countInContext`.
- [x] T052 [US1] Implement `services/move-service.ts` — `move`, `close`, `reopen`: graph check, `version` check, `projectStageGuardRegistry` before-guards (ungated `ctx.di.register`, presence-filtered), Stage entry with `started_on`/deadline, `project_stage_entries` row with names as they were, events on commit; lost requires a non-archived reason
  - Reopening an open Project and closing a closed one answer 409 `PROJECT_MOVE_NOT_PERMITTED` (no code of the contract names them). `ProjectStageGuardRegistry` is registered in the *Stages* section of `index.ts`; its `Container name:` marker is in `contracts/src/projects.ts`. The stale-version and the concurrent cases are both `PROJECT_CHANGED` — the version and the workflow are re-read under the row lock.
- [x] T053 [US1] Implement read endpoints for configuration the story needs: `GET /api/v1/admin/projects/roles` and `GET /api/v1/admin/projects/loss-reasons` (`projects:read`), names via `pickLocalized`
  - `label` per row (see T043); `?active=true` leaves archived rows out.
- [x] T054 [US1] Wire routes `routes.projects.ts` (create/update/delete/organizations/members), `routes.stages.ts` (stages, moves, move, close, reopen, stage-history) per `contracts/admin-api.md` §2.1–§2.2; manifest permissions `projects:write` (+ labels en/pl); T043, T044, T045, T046 green
  - `projects:write` (requires `projects:read`) declared with en/pl labels. Ten codes minted, each in `ERROR_CODES`, the manifest, both bundles and `MINTED_ERROR_CODES`: `PROJECT_HAS_LINKS`, `PROJECT_ORGANIZATION_OUT_OF_SCOPE`, `PROJECT_STAGE_CURRENT`, `PROJECT_STAGE_LAST`, `PROJECT_MOVE_NOT_PERMITTED`, `PROJECT_CHANGED`, `PROJECT_GUARD_REFUSED` (sentence `{reason}`, CRM's `CRM_TRANSITION_VETOED` arrangement), `PROJECT_COMPLETION_NOT_PERMITTED`, `PROJECT_LOSS_REASON_INVALID`, `PROJECT_MEMBER_INVALID`.
  - OpenAPI baseline regenerated (+136 lines, the new routes only); the generated module reference and its Polish copy carry `projects:write`. `GET /projects/:id` now answers `{ data: ProjectDetail }`.
- [x] T055 [P] [US1] Admin: `packages/modules/projects/src/admin/index.ts` (routes `/projects`, `/projects/new`, `/projects/:id`; nav entry *Projects* in section `work`), `admin/api.ts`, `pages/ProjectsList.tsx` (filters state, Organization, member/me; columns of `contracts/admin-surfaces.md` §2), `pages/ProjectCreate.tsx` (title, Organizations multi with the internal-Project note, value, start date, Members + Roles via `AdminUserPicker`); **list sort `value` and `deadline`** in `project-read-service.ts` (today refused with 400): keyset over the nullable column, nulls last, then `created_at`, `id`, with an integration case
  - **Read-service half done with the backend (2026-10-26):** `sort=value|deadline` in `project-read-service.ts` — keyset over the nullable key, empty keys last in both directions, then `created_at`, `id` in the same direction; a cursor carries its sort and is refused (400) by another. Proven by `backend/test/integration/projects/list-sort.test.ts` (7 Projects paged two at a time, both keys × both orders) — seen red only through the missing create route, not on the sort itself. The admin screens remain. **For `ProjectCreate.tsx`:** `POST /projects` requires `stages` (at least one, in order) when no Template is chosen (T043 note) — the create screen needs a Stage list (name + colour at least) or a Template; roles and loss reasons for pickers come from `GET /projects/roles?active=true` / `…/loss-reasons?active=true`, each row with a ready `label`.
  - **Admin half done (2026-10-26).** List: search, state, Organization (kit `OrganizationPicker`), *only projects I am a member of* (`memberId=me` — no arbitrary-member picker yet), sort `createdAt` / `value` / `deadline` both ways, the kit's `PaginationFooter` over the keyset cursor (the list knows its total). Create: title, Organizations (`OrganizationPickerMulti`, the internal-Project note while empty), value + three-letter currency, start date, a plain description (`ReferenceField` is US7's), the Stage list (name, colour, planned days; reorder, remove, at least one), Members through `AdminUserPicker` with Role check boxes from `roles?active=true`. **Not offered**, each its story's: visibility / viewers, Template, custom fields. The two pickers read `/admin/organizations` and `/admin/admin-users`, so a role with `projects:write` alone gets empty pickers — `requires` does not name those codes (see the report's follow-ups).
- [x] T056 [US1] Admin: `pages/ProjectDetail.tsx` with header, `components/StageBar.tsx`, `components/CloseProjectDialog.tsx`, tab registry `pages/project-detail/tabs.ts` with **Overview** (description, members by Role) and **Stages** (`components/StageEditor.tsx` — Stages, durations, responsible Roles, alerts field, gate, completion permitted; moves editor on `StatusTransitionGraph` with the unreachable warning) and **Stage history**; T047 green
  - The Stage-history tab's id is `stage-history`, leaving `history` to US7's audit *History* tab. `StageEditor` calls the Project's endpoints itself — each Stage saved on its own (`PATCH`), then the Project re-read; add / reorder / delete; moves on `StatusTransitionGraph` (`PUT /moves`), a plain list for a reader; the Template editor (US3) will have to lift those calls into props. No control for a manual `deadlineOn` (shown, not edited) and no *Delete project* button — neither is in the task. The bar's buttons follow `permissions.canWrite` of the server's answer.
- [x] T057 [US1] Extend `backend/test/integration/projects/off-state.test.ts` with the routes of this story; docs section *Running a Project* in `docs/projects.md` + Polish copy
  - **Backend half done (2026-10-26):** the off-state probe list carries every route of this story (writes probe a missing Project or a refused body, so the "on" phases write nothing). Docs: *Running a project*, `projects:write`, the API table, and *Stage guards and events* for developers, English and Polish (cache entry refreshed). **Left open for the admin half:** the page's *In the Admin UI* section still says the screens arrive later — T055/T056 rewrite it (EN + PL, cache entry) when the screens land, and the admin tests own the screens' absence while the module is off.
  - **Admin half done (2026-10-26):** *In the Admin UI* rewritten for the three screens (list, create, a Project with its Stage bar and tabs), *Switching it on and off* names the screens' absence; Polish copy and its cache entry refreshed. The absence itself is `admin/test/modules/projects/off-state.test.tsx` (nav and every route gone while off or without the code, back when on).
- [x] T058 [US1] Phase gate (quickstart verification set for what exists)
  - Run 2026-10-26 on Node 26.2.0, all exit 0: `build:packages`, `pnpm -r run typecheck`, `pnpm -r run lint` (warnings only, none in `projects`), `test:unit:fast` (360 files / 7 715 tests), `pnpm --filter '!backend' run test` with `NODE_OPTIONS=--no-experimental-webstorage` (#442; `admin` 375 files / 3 697 tests, `mod-projects` 8 files / 112 tests), `pnpm --filter admin run build`, `i18n:hardcoded` (0 regressions), `check:naming`, `check:language`, `check:command-coverage -- --strict --module projects` and `--module tasks`, `check:off-state-coverage` (41/41, 0 findings), `check:admin-zones`, `check:admin-surface`, `check:port-dependencies`, `check:port-catches`, `check:entry-scope`, `check:entry-presence`, `check:module-boundary`, `check:module-docs`, `check:docs-translations`, `check:bundle-pairing`, `check:error-translations`, `check:action-route-permissions`, `check-entity-tenant-classification`, `overlay:check`, `composer:check`, `manifests:check`, `pnpm install --frozen-lockfile`. The admin half changed no backend source, so the backend contract and integration suites were not re-run here (the backend half's runs stand).

**Checkpoint**: the MVP — a Project walked from first Stage to a completed or lost outcome without
the Tasks module.

---

## Phase 4: User Story 2 — Tasks, inside and outside a Project (Priority: P1)

**Goal**: the Tasks screens; Stage Task definitions, materialisation on Stage entry, the
completion gate; Projects behaving correctly with Tasks off.

**Independent Test**: `integration/tasks/tasks-crud.test.ts` + `integration/projects/completion-gate.test.ts`.

### Tests for User Story 2

- [x] T059 [P] [US2] Write failing `backend/test/contract/tasks/tasks.contract.test.ts` for `contracts/admin-api.md` §1 (schemas, 401/403, `TASK_CONTEXT_INVALID`, `TASK_NOT_FOUND`)
  - Seen red 2026-10-26: 15 of 16 failed, every write and the new reads 404 `NOT_FOUND` (no route). The probe context `contract_probe` (owned by `crm`) has one group, so the file also proves a group-less Task in a record with groups is refused (`TASK_CONTEXT_INVALID`, see T065).
- [x] T060 [P] [US2] Write failing `backend/test/integration/tasks/tasks-crud.test.ts`: create (number, `todo`), edit, status changes set/clear `completed_at`, assign to another admin notifies them once (bell, `admin_notifications` present) and not when self-assigned, *My Tasks* ordering and overdue flag, delete, audit rows, events
  - Seen red 2026-10-26: 7 of 7, `POST /tasks` 404. One test-side bug fixed on the way to green (the last hand-over was a self-assignment). Also proves the bell off (`admin_notifications` deactivated): the assignment succeeds, nothing is recorded.
- [x] T061 [P] [US2] Write failing `backend/test/integration/projects/completion-gate.test.ts`: gated Stage with an open Task refuses move and completion naming the Task (`PROJECT_STAGE_GATE_OPEN_TASKS`); cancelled counts as closed; lost bypasses; gate off lets go and the Task stays under its Stage; `tasks` off → move allowed, entry note `gate_not_applied_tasks_off`; `tasks` back on → the gate applies again
  - Seen red 2026-10-26: 5 of 6, every `POST /tasks` into a Project 422 `TASK_CONTEXT_INVALID` (no `project` context registered). Green after T069, first run.
- [x] T062 [P] [US2] Write failing `backend/test/integration/projects/stage-tasks.test.ts`: Stage Task definitions on a Project; materialised on entry with due = start + offset and context `{ project, projectId, stageId }`; single Role holder assigned, otherwise unassigned with the Role in `contextNote`; re-entry creates nothing; `tasks` off at entry → `tasks_skipped_at`, nothing created later; port failure → Stage entered, `tasks_materialize_failed`, retry endpoint creates them once
  - Seen red 2026-10-26: 6 of 6, `PUT …/stages/:stageId/tasks` 404 (no route). The port failure is a `vi.spyOn` on the container's `taskWritePort` singleton. Also covers the definitions route (replace whole, > 100 → 400, unknown Role → 422, one `stage_tasks_set` audit row each) and `GET /projects/:id/tasks`. Green after T069, first run.
- [x] T063 [P] [US2] Write failing `backend/test/integration/projects/task-context.test.ts`: Project Tasks visible in `/tasks` and *My Tasks* only to users who may see the Project (setting `members`); `projects` off → they vanish from Tasks; on → back; deleting a Project deletes its Tasks
  - Seen red 2026-10-26: `beforeAll` failed, `POST /tasks` into the Project 422 `TASK_CONTEXT_INVALID`. Also proves a Project Task assigned to somebody who may not see the Project stays hidden from their *My Tasks*, that they cannot create one in it, and `PROJECT_STAGE_HAS_TASKS`. Green after T069, first run.
- [ ] T064 [P] [US2] Write failing admin tests `admin/test/modules/tasks/TasksList.test.tsx`, `MyTasks.test.tsx`, `TaskDetail.test.tsx` (context card links to the Project; zone `task.detail.after` mount), `admin/test/modules/tasks/TaskDetail.after-zone.test.tsx` (model `admin/test/modules/orders/OrderDetail.after-zone.test.tsx`), `admin/test/modules/projects/ProjectDetail.tasks-tab.test.tsx` (tab absent when `tasks` off)

### Implementation for User Story 2

- [x] T065 [US2] Complete `packages/modules/tasks/src/backend/services/task-service.ts` writes (create/update/status/assign/delete as Commands of `data-model.md` §1, events) and routes `POST/PATCH/DELETE /tasks`, `GET /tasks/mine`, `GET /tasks/lookups/assignees`, `GET /tasks/:id/history`; manifest permission `tasks:write` + labels; a context id the owner's `describe()` omits renders as an unavailable context (fail closed, i18n label), never `label: ''`
  - Writes are the Commands of `services/task-commands.ts`, shared with the write port (one statement of each action). A `PATCH` runs up to three Commands — `tasks.task.update` (title, description, due date, context), `.assign` (+ `tasks.task.assigned.v1`), `.status_change` (+ `tasks.task.status_changed.v1`) — each only when it changes something, every refusal checked before the first. Audit states carry `descriptionLength`, never the text.
  - A context written over HTTP must be registered by a present owner, listed visible to the caller, and — when the owner describes the record with groups (a Project's Stages) — name one of them: a Task belongs to a Stage, never to a Project alone (FR-031). Otherwise 422 `TASK_CONTEXT_INVALID`.
  - **Contract change** (`TaskContextSummarySchema`): `available: boolean`, `href: string | null`, `label` non-empty. An undescribed context id answers `available: false`, `label` = `context.unavailable` in the reader's language through `_i18n`'s `adminI18nService` (manifest `dependencies` += `_i18n`, `audit_logs`), `href`/`groupLabel` `null`.
  - `GET /tasks/mine` caps at 500 rows; `GET /tasks/lookups/assignees` at 50 (diacritic-insensitive name/e-mail search). `GET /tasks/:id/history` is CRM's `RecordHistoryPage` shape, `references` always `[]` (audit states hold no text).
- [x] T066 [US2] Implement `packages/modules/tasks/src/backend/services/task-notifier.ts` (presence-first, model `crm/…/crm-notifier.ts`; bell text names the Task number only) and the `degrades-without` edge on `adminNotificationRecordPort` with its `whenAbsent` sentence; `auditReferenceRegistry` label resolver for `task`; T059, T060 green
  - Bell kind `tasks.task.assigned`, subject `task`, link `/tasks/:id`, key `notifications.assigned.title` (en + pl), proven by `task-notifier.test.ts` (seen red on the missing bundle key). Told after the commit, on create and on `PATCH`, never the caller themselves. The audit-reference resolver (`task-audit-references.ts`) labels `number title`, through the visibility seam.
- [ ] T067 [P] [US2] Admin for `tasks`: `src/admin/index.ts` (routes, nav entries *My Tasks* and *Tasks* in `work`), `api.ts`, `pages/TasksList.tsx`, `pages/MyTasks.tsx`, `pages/TaskCreate.tsx`, `pages/TaskDetail.tsx` (edit in place, status control, context card from `describe()`, history list); declare zone `task.detail.after` with `TaskDetailZoneProps` in `packages/contracts/src/admin-contributions.ts` and mount it in `TaskDetail.tsx` in the same change; `check:admin-zones` green; T064 tasks parts green
- [x] T068 [US2] Projects: register the `project` Task context from an `onBoot` contribution hook (no presence probe) in `packages/modules/projects/src/backend/index.ts` → `services/task-context-descriptor.ts` backed by `ProjectAccess.allVisibleIds()` / `visibleIds()` and `describe()` (Project number + title, Stage names); manifest `nonBindingDependencies` for `tasks`: `taskContextRegistry` `contributes-to`, `taskReadPort` and `taskWritePort` `degrades-without` with the `whenAbsent` of `contracts/ports-and-events.md` §3
  - `services/task-context-descriptor.ts`: label `<number> <title>`, href `/projects/:id`, groups = Stage names; `describe` answers only the ids `visibleIds` hands back (on `PROJECT_ACCESS_READERS`). The seam is `services/project-tasks.ts` (`present()` + both lazy ports), decided before every call.
- [x] T069 [US2] Implement `packages/modules/projects/src/backend/services/stage-task-service.ts` (definitions CRUD `PUT /projects/:id/stages/:stageId/tasks`, ≤ 100; materialisation after the move Command commits per research R-8; `materialize-tasks` retry endpoint) and the gate as the module's first guard in `move-service.ts`; delete a Project → `taskWritePort.deleteInContext` when present; T061, T062, T063 green; also raise `PROJECT_STAGE_HAS_TASKS` in `stage-service.ts` `delete`, and pull the T118 `projects.alerts_time_zone` validator forward here (an invalid zone answers 500 on every Stage entry and list read)
  - Materialisation: a Stage **with definitions** is stamped on its first entry — `tasks_materialized_at` inside the move Command (Tasks on) and `createMany` after the commit, or `tasks_skipped_at` + `stage_tasks_skipped` (Tasks off). **Deviation from R-8's letter:** a Stage entered with no definitions is stamped neither way, so definitions added later are created on its next entry. Assignment: the one **active** Member holding the Role; otherwise unassigned, `contextNote` = `Responsible role: <default name>` (stored English — see the report's follow-ups).
  - Failure: Command `projects.project.stage_tasks_failed` withdraws the stamp and adds `tasks_materialize_failed` to the entry; retry = Command `projects.project.stage_tasks_retry` (claims under the lock; 409 `PROJECT_STAGE_TASKS_NOT_RETRYABLE` unless the Stage's last entry recorded the failure), then `createMany`. Two audit actions beyond `data-model.md` §2.4. A partial failure inside `createMany` (one Command per Task) would duplicate on retry — the port validates everything first, so only a database failure mid-batch can cause it.
  - Gate: before the registered guards, on `move` and `close completed` (not `lost`, not `reopen`); with Tasks off a gated Stage records `gate_not_applied_tasks_off` on the entry (also on a close). `PUT /stages/:stageId/tasks` answers `{ data: ProjectStage }`.
  - **Also served for the admin half (T071):** `GET /projects/:id/tasks` (`stage-task-service.ts`), `{ data: { tasksAvailable, stages: [{ stageId, tasks: TaskSummary[] }] } }` in Stage order; `tasksAvailable: false` while Tasks is off **or the reader lacks `tasks:read`** (the Tasks module's own gate — beyond `admin-api.md`, which names `projects:read` only). Quick-add into a Stage is `POST /tasks` with `context: { contextType: 'project', contextId, contextGroupId: stageId }`.
  - Stage delete with Tasks off does not count (nothing to ask) and deletes; its Tasks then sit under no Stage the Project shows. Project delete calls `deleteInContext` after its Command commits, only while Tasks is on.
  - Time-zone validator: `services/alerts-time-zone-validator.ts` (`Intl.supportedValuesOf('timeZone')` + `UTC`), registered into `settingWriteValidatorRegistry` from a contribution hook; 422 `VALIDATION_FAILED`. Unit test written after the code; `integration/projects/alerts-time-zone.test.ts` seen red with the registration removed (the write answered 200).
- [ ] T070 [US2] **Measure research R-9 [unverified]**: `backend/test/perf/tasks/context-visibility.perf.test.ts` with 5 000 Projects and 20 000 Tasks — `GET /tasks` p95 for a `members`-setting viewer; record the number in the PR; if over 500 ms apply the first fallback named in R-9 before continuing
- [ ] T071 [P] [US2] Admin for Projects: **Tasks** tab (`pages/project-detail/tabs/TasksTab.tsx` by Stage, quick-add into a Stage) and the Stage Task definitions section of `StageEditor.tsx`, both rendered only when `useModulePresence().isPresent('tasks')`; T064 projects part green; also a *Delete project* action on `ProjectDetail.tsx` (confirm dialog; 409 `PROJECT_HAS_LINKS` shown) — the API exists since US1
- [ ] T072 [US2] Extend both off-state tests; docs: `tasks.md` *Using Tasks*, `projects.md` *Stage Tasks and the completion gate* + Polish copies; phase gate

**Checkpoint**: Tasks usable on their own; Projects gate Stages on Tasks when Tasks is on and
ignore it, visibly, when off.

---

## Phase 5: User Story 3 — Project Templates (Priority: P2)

**Goal**: operators define Templates; a Project created from one is prefilled and independent.

**Independent Test**: `integration/projects/templates.test.ts`.

- [ ] T073 [P] [US3] Write failing `backend/test/contract/projects/templates.contract.test.ts` (`contracts/admin-api.md` §2.5 Templates; `projects:configure` required to write)
- [ ] T074 [P] [US3] Write failing `backend/test/integration/projects/templates.test.ts`: create a Template (Roles, 3 Stages, 2 Stage Tasks in Stage 1, alert on Stage 2, a backward move); create a Project from it — structure, default description, first-Stage Tasks created (with `tasks` on), later Stage Tasks only on entry; editing and deleting the Template leaves the Project unchanged and `template_id` set null on delete; duplicate is independent; archived Template not offered; > 100 Stage Tasks per Stage refused
- [ ] T075 [P] [US3] Write failing admin tests `admin/test/modules/projects/TemplateEditor.test.tsx` and `ProjectCreate.from-template.test.tsx` (loading a Template prefills every field, still editable)
- [ ] T076 [US3] Implement `packages/modules/projects/src/backend/services/template-service.ts` (whole-graph `PUT` in one Command `projects.template.save`, duplicate, archive/restore) and `routes/routes.templates.ts`; manifest permission `projects:configure` + labels
- [ ] T077 [US3] Extend `project-service.ts` create with `templateId`: copy Stages, moves, gates, alerts, Stage Task definitions and description (research R-7), Roles offered from the Template's Roles; T073, T074 green
- [ ] T078 [P] [US3] Admin: `pages/TemplatesList.tsx`, `pages/TemplateEditor.tsx` reusing `StageEditor.tsx`; Template picker as the first step of `ProjectCreate.tsx`; nav entry *Templates* (`projects:configure`); T075 green; also the list filters still missing on `ProjectsList.tsx`: Template, Role, any member, current Stage name (API supports them)
- [ ] T079 [US3] Docs *Templates* (EN + PL); off-state extended; phase gate

---

## Phase 6: User Story 4 — Project Roles (Priority: P2)

**Goal**: operators manage Project Roles (and loss reasons); Roles grant nothing.

**Independent Test**: `contract/projects/roles.contract.test.ts` + `integration/projects/roles-grant-nothing.test.ts`.

- [ ] T080 [P] [US4] Write failing `backend/test/contract/projects/roles.contract.test.ts` and `loss-reasons.contract.test.ts`: seeded rows with en/pl names; add, rename, archive, restore; system rows not deletable (409); archived not offered by the read endpoints' `active` filter but still rendered on Projects using them
- [ ] T081 [P] [US4] Write failing `backend/test/integration/projects/roles-grant-nothing.test.ts`: assigning any Role changes nothing in `permissionService.listPermissions` for that user
- [ ] T082 [US4] Implement `services/role-service.ts`, `services/loss-reason-service.ts` and their write routes (`projects:configure`); T080, T081 green
- [ ] T083 [P] [US4] Admin: `pages/RolesPage.tsx`, `pages/LossReasonsPage.tsx` (name per language, archive/restore), nav entries; `admin/test/modules/projects/RolesPage.test.tsx`
- [ ] T084 [US4] Docs *Project Roles* (EN + PL) stating Roles are not permissions; phase gate

---

## Phase 7: User Story 5 — Who sees a Project (Priority: P2)

**Goal**: module setting, per-Project visibility with listed people, `projects:see_all`, applied on
every route.

**Independent Test**: `integration/projects/visibility.test.ts` (SC-003).

- [ ] T085 [US5] Write failing `backend/test/integration/projects/visibility.test.ts`: the matrix of `quickstart.md` US5 over list, total, detail, global search (once Phase 13 lands — leave a `todo` there and a pointer), `GET /projects/records/:kind/:id/project` (once Phase 8 lands — same), `GET /projects/lookups/mentionable` (Phase 9 — same), Project Tasks in `/tasks` (exists), analytics (Phase 12 — same); every invisible answer byte-identical to a non-existent one
- [ ] T086 [US5] Implement `PATCH` of `visibility` and `viewerIds` (`project_viewers`, Command `projects.project.viewers_set` / `.visibility_set`) in `project-service.ts`; manifest permission `projects:see_all` + labels; confirm `visibleProjectSql` covers listed viewers; T085 green for the routes that exist
- [ ] T087 [P] [US5] Admin: visibility control on create and Overview (three options; listed people picker shown for *Members and listed people*; the effective result explained in one sentence) — `components/VisibilityControl.tsx`; `admin/test/modules/projects/VisibilityControl.test.tsx`
- [ ] T088 [US5] Docs *Who sees a Project* (EN + PL) incl. Organization reach and internal Projects; phase gate. **Each later phase that adds a read route un-`todo`s its row of T085**; **picker permissions**: the create form's `OrganizationPickerMulti` / `AdminUserPicker` read `/organizations` and `/admin-users`, so a role with only `projects:*` gets empty pickers — add projects-owned lookups (`GET /projects/lookups/organizations`, `/lookups/admin-users`, `projects:write`, model `/crm/lookups/*`) and use them for members, viewers and Organizations

---

## Phase 8: User Story 6 — Links and "which Project" panels (Priority: P2)

**Goal**: link Orders, Quote Requests, Opportunities; show the Project on their screens and on a
Task's.

**Independent Test**: `integration/projects/links.test.ts` + the panel tests.

- [ ] T089 [P] [US6] Write failing `backend/test/integration/projects/links.test.ts`: link an Order / Quote Request / Opportunity of a Project Organization; another Organization → 422; second Project → 409 naming the holder only if visible; concurrent double link → one 409; unreadable kind rendered unavailable without number/status/amount; crm / quote_requests off → their links unavailable, not addable (503), restored on; an Opportunity deleted in CRM → unavailable, removable by hand with an audit row; removing an Organization with a linked record → 409
- [ ] T090 [P] [US6] Write failing `backend/test/contract/projects/record-project.contract.test.ts` for `GET /projects/records/:kind/:recordId/project` (404 when none or invisible; owner read permission enforced for the kind)
- [ ] T091 [P] [US6] Write failing admin tests `admin/test/modules/projects/ProjectPanel.test.tsx` (renders on 200, nothing on 404), `LinkedRecords.test.tsx`, and `admin/test/modules/crm/OpportunityDetail.after-zone.test.tsx` (model `OrderDetail.after-zone.test.tsx`)
- [ ] T092 [US6] Implement `services/owner-read-permissions.ts` (copy of the CRM shape, research R-10/R-17: `orders:read`, `rfqs:handle`, `crm:read`, `tasks:read`, `catalog:read`, `custom_fields:read`) and `services/link-service.ts` (validation through `orderReadPort`, `quoteRequestReadPort`, `opportunityReadPort`; presence via `effectiveState.isPresent`; Commands `link_add` / `link_remove`; events); manifest `dependencies` += `orders`; `nonBindingDependencies` `crm` (`opportunityReadPort`) and `quote_requests` (`quoteRequestReadPort`) `degrades-without` with `whenAbsent`; raise `PROJECT_ORGANIZATION_IN_USE` in `project-service.ts` `setOrganizations` (not raised before links exist)
- [ ] T093 [US6] Implement `services/record-project-service.ts` and the route (`task` kind via `taskReadPort.findById` when present); routes `GET/POST/DELETE /projects/:id/links`; T089, T090 green; un-`todo` T085's panel row
- [ ] T094 [US6] Read the list endpoints `GET /api/v1/admin/quote-requests` and `GET /api/v1/admin/crm/opportunities` for `organizationId` + `q` support (research R-10 [unverified]); use them in `admin/api.ts` or fall back to global search with `entityTypes` as R-10 states; record the finding
- [ ] T095 [US6] Declare zone `opportunity.detail.after` (`OpportunityDetailZoneProps { opportunityId }`) in `packages/contracts/src/admin-contributions.ts` and mount `<AdminZone name="opportunity.detail.after" props={{ opportunityId: id }} />` after the tabs card in `packages/modules/crm/src/admin/pages/OpportunityDetail.tsx` in the same change; `check:admin-zones` green; `.changeset/crm-opportunity-zone.md` folded into the crm changeset of Phase 9 if that lands in the same release
- [ ] T096 [US6] Admin: `zones/ProjectPanel.tsx` contributed to `order.detail.after`, `quote_request.detail.after`, `opportunity.detail.after`, `task.detail.after` (weight 650, `requiredPermission: 'projects:read'`), **Linked records** tab `components/LinkedRecords.tsx` (groups per kind, picker per kind limited to the Project's Organizations, absent owner shows "unavailable"); T091 green
- [ ] T097 [US6] Docs *Linking records* (EN + PL); off-state extended (panels absent when `projects` off); phase gate

---

## Phase 9: User Story 7 — Notes, messages, references, attachments, and one reference standard (Priority: P2)

**Goal**: collaboration on a Project as on an Opportunity, on components promoted to admin-kit;
the `@@` document list as one standard in Projects and CRM (FR-044).

**Independent Test**: quickstart rows US7 and FR-044.

### 9A — Promote CRM's collaboration UI to admin-kit (research R-17)

- [ ] T098 [US7] Baseline: run `admin/test/modules/crm/` and `backend/test/{contract,integration}/crm/` and record the green set in the PR; `grep -rn` `admin/test`, `backend/test`, `packages` for every path of `contracts/foreign-module-changes.md` §C's first table and list the importers; switch `packages/admin-kit/src/components/admin-user-picker/AdminUserPicker.tsx` to import the `lib` barrel (not `../../lib/api-client.js`) so screen tests can stub it
- [ ] T099 [P] [US7] Write failing kit tests in `packages/admin-kit` (or its test dir per the kit's convention) for `ReferenceField` (triggers `@`/`@@`/`@@@` from a `kinds` prop; lookups through a `ReferenceLookups` adapter; e-mail `@` opens nothing; tokens rendered as names; caret-anchored list), `ReferenceText` (five chip kinds, unavailable chip), `CommentThread`/`CommentComposer`, `AttachmentUploader`, `RecordHistory` (labels/renderers injected), `CursorPagination` — porting CRM's existing component tests where they exist
- [ ] T100 [US7] Move the components into `packages/admin-kit/src/components/{references,comments,attachments,record-history}/` with `crmApi` calls replaced by props/adapters, their strings into the kit's i18n bundle (en + pl); move the Tiptap peer + dev declaration to `packages/admin-kit/package.json` (`^3.22.5`, the `echarts` arrangement); export from `@endora-commerce/admin-kit/components`; T099 green
- [ ] T101 [US7] Move CRM onto the kit components: `crm/src/admin/api.ts` adapters, call sites in `pages/opportunity-detail/tabs/*`, `OpportunitySidebar.tsx`, `LinkedDocuments.tsx`; delete the moved CRM files; `manifests:generate` (Tiptap peers leave `mod-crm` if no direct import remains) + `pnpm install --lockfile-only`; T098's baseline set green **unchanged**; `.changeset/admin-kit-collaboration.md` (minor)

### 9B — One reference standard in CRM (FR-044, research R-14)

- [ ] T102 [P] [US7] Write failing `backend/test/integration/crm/references-documents.test.ts`: Quote Request and Task tokens saved in description, note and message; resolved to number + link; unavailable when unreadable (`rfqs:handle`, `tasks:read`), hidden by Task context, gone, or owner off; pre-existing texts unchanged byte-for-byte
- [ ] T103 [P] [US7] Write failing `backend/test/contract/crm/document-lookups.contract.test.ts` for `GET /api/v1/admin/crm/lookups/documents?opportunityId=&q=` (`crm:write`; groups present only with permission + presence; Orders and Quote Requests of the Opportunity's Organization only)
- [ ] T104 [P] [US7] Write failing `admin/test/modules/crm/ReferenceField.documents.test.tsx`: `@@` opens the grouped list; groups gated; picking a Quote Request / Task inserts its token; list the CRM tests that asserted `@@` = Orders and change **only** those, naming each in the commit
- [ ] T105 [US7] Scaffold `migration:new -- --module crm --name opportunity_reference_documents`: widen `crm_opportunity_references_target_type_check` to five types; `down` deletes rows of the two new types first (precedent `20261007T180600_crm_opportunity_reference_admin_user.ts`); migration up/down test in `backend/test/integration/crm/migration.test.ts`; `composer:generate`
- [ ] T106 [US7] CRM backend: `reference-service.ts` resolves `quote_request` (existing `quoteRequestReadPort`) and `task` (`lazyPort<TaskReadPort>(ctx, 'taskReadPort')`); `owner-read-permissions.ts` += `tasks:read`; `crm-document-lookup-service.ts` + `routes/routes.document-lookups.ts` `GET /crm/lookups/documents` returning `RecordDocumentLookupResponse`; manifest `nonBindingDependencies` += `tasks` `taskReadPort` `degrades-without` with the `whenAbsent` of `foreign-module-changes.md` §C; T102, T103 green
- [ ] T107 [US7] CRM admin: `ReferenceField` kinds `['admin_user','document','product']` with the `lookupDocuments` adapter; T104 green; CRM i18n + `docs/crm.md` + Polish copy describe `@@`; one-line pointer at User Story 18 in `specs/143-crm-sales-opportunities/spec.md`; `.changeset/crm-reference-standard.md` (minor); **also undo the Phase 1 interim (T009 note)**: remove `STORED_TARGET_TYPES` in `reference-service.ts`, the `PickableKind`/`MentionTriggerKind` narrowing, flip the `references.test.ts` interim case to "resolved", and update the `referenceTokensOf` doc comment in `domain/reference-tokens.ts` to name the five-type grammar

### 9C — Collaboration on a Project

- [ ] T108 [P] [US7] Write failing `backend/test/integration/projects/comments.test.ts`: notes edit/delete by author only (403 `PROJECT_NOTE_NOT_AUTHOR`), soft delete, audit without text; messages append-only, every Member except the author notified once; unread count and `messages/read` forward-only marker; nothing visible to a storefront customer
- [ ] T109 [P] [US7] Write failing `backend/test/integration/projects/mentions.test.ts`: newly mentioned person notified once with the Project number and never the text; not the author; not someone who may not see the Project (setting `members`, non-member) or lacks `projects:read`; a mentioned Member gets one notification for a message, not two; `GET /projects/lookups/mentionable` and `/lookups/documents` (internal Project → no Orders/Quote Requests group)
- [ ] T110 [P] [US7] Write failing `backend/test/integration/projects/attachments.test.ts`: upload-then-attach with compensation, private + live + not active content (415), download link, the asset library refuses deletion of an attached file naming the Project, removal audited
- [ ] T111 [US7] Implement `services/reference-service.ts` (five kinds, batched per kind, permission + presence per kind, `available:false`), `services/mention-service.ts` (`newlyMentioned`, `mentionable` with `ProjectAccess.canSeeAs`), `services/project-notifier.ts` (presence-first, bell titles name the number only; `nonBindingDependencies` `admin_notifications` `degrades-without`), `services/comment-service.ts` and `routes/routes.comments.ts`, lookups routes; manifest `dependencies` += `catalog` (Product labels); T108, T109 green
- [ ] T112 [US7] Implement `services/attachment-active-content.ts` (copy, research R-17), `services/attachment-service.ts`, upload route, and register the `assetReferenceRegistry` descriptor (`ownerModuleId: 'projects'`, one batched query, label "Project PRJ-…") from an `onBoot` contribution hook; manifest `dependencies` += `assets_library`; T110 green
- [ ] T113 [US7] Implement `services/history-service.ts` (audit read `objectType: 'project'`, cap 500, cursor, references resolved in before/after, custom-field values hidden without `custom_fields:read`) and `GET /projects/:id/history`; `auditReferenceRegistry` resolver for `project`; manifest `dependencies` += `audit_logs`, `admin_users`
- [ ] T114 [P] [US7] Admin: Notes, Messages (unread badge), Attachments and History tabs, and the description editor, on the kit components with Projects' adapters; `admin/test/modules/projects/ProjectDetail.collaboration.test.tsx`
- [ ] T115 [US7] Un-`todo` T085's mentionable row; docs *Notes, messages and references* and *Attachments* (EN + PL); off-state extended; phase gate

---

## Phase 10: User Story 8 — Deadline alerts on Stages (Priority: P3)

**Goal**: every eligible Member is told once, N days before a Stage's deadline, in the bell and
by e-mail.

**Independent Test**: `integration/projects/stage-alerts.test.ts` (SC-004).

- [ ] T116 [P] [US8] Write failing `backend/test/integration/projects/stage-alerts.test.ts` with a controlled clock over 60 days crossing the October DST change in `Europe/Warsaw`: one delivery per eligible Member per (Stage, offset, deadline) on the due day after 08:00; none for a left Stage or a closed Project; a moved deadline re-arms once; none backdated on entering late; a Member out of reach or deactivated skipped; `admin_notifications` off → e-mail only, outcome `email`; no recipient → `no_recipient`; two concurrent sweeps deliver once
- [ ] T117 [P] [US8] Write failing unit tests `packages/modules/projects/src/backend/services/stage-alert-service.test.ts` for the due-day computation and the claim/settle state machine
- [ ] T118 [US8] Implement `services/stage-alert-service.ts` (claim by `insert … on conflict do nothing returning`, deliver outside the transaction, settle outcome; recipients via `ProjectAccess.canSeeAs`), `services/stage-alert-email.ts`, `email-templates/stage-alert-defaults.ts` (en-US + pl-PL via `simpleEmailBodyTree`), manifest `transactionalEmails` entry `projects_stage_deadline_alert`, `emailDefaultsPort` registration in an `onBoot` contribution hook; manifest `dependencies` += `transactional_emails`; register a `SettingWriteValidatorRegistryPort` validator for `projects.alerts_time_zone` (IANA zone via `Intl.supportedValuesOf('timeZone')`) — an invalid zone would break every list read
- [ ] T119 [US8] Copy `scheduled-work-probe.ts` into `packages/modules/projects/src/backend/services/` and add it to the parity test; implement `workers/stage-alert-worker.ts` (Job Scheduler `projects-stage-alerts` every 15 min, data-less, `concurrency: 1`, presence probe → `anyRowExists` probe → `enterSystemScope(reason, tick)`, `ctx.worker`, only where `processRunsWorkers && moduleQueueRedis`); add the probe to `backend/test/unit/kernel/scheduled-work-probes.test.ts`; `check:entry-scope`, `check:entry-presence` green; T116, T117 green
- [ ] T120 [P] [US8] Admin: alert offsets input in `StageEditor.tsx` (Project and Template), deadline display + manual override on the Stage bar; settings `projects.alerts_time_zone` described on `/settings?group=projects`
- [ ] T121 [US8] Docs *Deadline alerts* (EN + PL); off-state: sweep does no work while `projects` is off; phase gate; `StageEditor.tsx` gains a manual deadline control (set / clear → recompute) — `PATCH …/stages/:stageId` already accepts `deadlineOn`

---

## Phase 11: User Story 9 — Custom Fields on a Project (Priority: P3)

**Independent Test**: `integration/projects/custom-fields.test.ts`.

- [ ] T122 [P] [US9] Write failing `backend/test/integration/projects/custom-fields.test.ts`: *Project* offered on the custom-fields screen while `projects` is on and not while off (definitions not editable); a required field refused naming it; values shown only to those who may see the Project; changes in history; hidden there without `custom_fields:read`
- [ ] T123 [US9] Foreign changes per `contracts/foreign-module-changes.md` §A/§D: `'project'` in `supportedEntityTypeSchema` (grep every exhaustive use first and repair in the same change), `SUPPORTED_ENTITIES.project` (`ownerModuleId: 'projects'`, `orgOwned: true`, `listFilter: true`), `host-storage-binding.ts` entry, `customFields.entity.project` label en/pl; run the `custom_fields` contract tests unchanged; `.changeset/custom-fields-project-host.md`
- [ ] T124 [US9] Projects: `validateAndMerge` inside the create/update Commands and `project()` on read via `lazyPort<CustomFieldValuePort>(ctx, 'customFieldValueService')`; list filter via `customFieldListFilterPort`; manifest `dependencies` += `custom_fields`; T122 green
- [ ] T125 [P] [US9] Admin: `components/ProjectCustomFields.tsx` on create and Overview (model `crm/…/OpportunityCustomFields.tsx`); docs section (EN + PL); phase gate

---

## Phase 12: User Story 10 — Project analytics, including lost Projects (Priority: P3)

**Independent Test**: `integration/projects/analytics.test.ts` (SC-005).

- [ ] T126 [P] [US10] Write failing `backend/test/integration/projects/analytics.test.ts` over a seeded set of ≥ 50 Projects with hand-computed expectations: summary, durations, time in Stage by name, losses by lost-Stage name (ranked) and by reason, lost value per currency, average value per currency, top open, managers; Template / Organization / Project Manager filters; a sales representative and a non-member under `members` see figures over their visible Projects only; `projectCount` and `excluded.noValue` correct
- [ ] T127 [US10] Implement `domain/analytics-range.ts` and `services/analytics-service.ts` — one grouped raw SQL per figure, every statement carrying `ProjectAccess.visibleProjectSql`, `null` → no query when nothing is visible, money grouped by currency — and `routes/routes.analytics.ts` (`projects:analytics`); manifest permission + labels; T126 green; un-`todo` T085's analytics row
- [ ] T128 [P] [US10] Admin: `pages/AnalyticsPage.tsx` with filters and cards (`<EChart>` for Time in Stage and Losses by Stage, figure cards elsewhere; model `crm/src/admin/pages/AnalyticsPage.tsx`), nav entry *Analytics*; `admin/test/modules/projects/AnalyticsPage.test.tsx`
- [ ] T129 [US10] `backend/test/perf/projects/analytics.perf.test.ts`: each figure < 2 s at 1 000 Projects; docs *Analytics* (EN + PL); phase gate

---

## Phase 13: User Story 11 — Found and switchable like every module (Priority: P3)

**Independent Test**: palette, search, Organization panel and off-state tests.

- [ ] T130 [P] [US11] Write failing `backend/test/contract/projects/palette-actions.test.ts` and `backend/test/contract/tasks/palette-actions.test.ts`: the seven actions of `contracts/admin-surfaces.md` §4 resolve to real routes with the routes' permissions (`check:action-route-permissions`)
- [ ] T131 [P] [US11] Write failing `backend/test/integration/projects/global-search.test.ts`: `projects.project` and `tasks.task` providers return only visible records; absent when their module is off
- [ ] T132 [US11] Add manifest `actions` to both modules (icons `ClipboardList`, `FolderPlus`, `LineChart`, `Layers`, `ListChecks`, `Plus`), labels en/pl; `admin-search-provider.ts` in both modules registered from `onBoot` contribution hooks (`contributes-to` `adminSearchProviderRegistry`); T130, T131 green; un-`todo` T085's search row
- [ ] T133 [P] [US11] Admin: `zones/OrganizationProjects.tsx` contributed to `organization.detail.after` (the Organization's visible Projects with state and current Stage, "New project" shortcut); `admin/test/modules/projects/OrganizationProjects.test.tsx`
- [ ] T134 [US11] Demo: `packages/demo-composition/src/projects.ts` `demoProjectsStep` (Template *Showroom fit-out*, four Projects — open, completed, lost, internal — with Members, links to demo Orders where they exist, Tasks only when `tasks` is installed, created through `taskWritePort` with the demo admin as creator — `created_by_admin_user_id` is not null), registered in `packages/demo-composition/src/composition.ts`; `projects.test.ts` beside it; module `demo` bodies seed nothing else
- [ ] T135 [US11] Final off-state sweep: both off-state tests cover every route, the four panels, the Organization panel, palette, search, custom-field type, the sweep, the Task context; `check:off-state-coverage`; phase gate

---

## Phase 14: Polish & Cross-Cutting Concerns

- [ ] T136 [P] Complete `packages/modules/tasks/docs/tasks.md` and `packages/modules/projects/docs/projects.md` for users and developers (Task contexts, `ProjectAccess`, stage guards, events, ports); Polish copies; `check:module-docs`, `check:docs-translations`
- [ ] T137 [P] `backend/test/perf/projects/list.perf.test.ts`: list + filter < 2 s at 1 000 Projects (SC-008)
- [ ] T138 Confirm T085 has no `todo` left; run the full matrix
- [ ] T139 Grep `backend/test/**` and `admin/test/**` for every path moved or deleted in Phase 9A and for every renamed contracts export (AGENTS.md trap: deleted files fail only in contract/integration trees)
- [ ] T140 Full verification set of `quickstart.md` § *Verification before reporting done*, including `pnpm --filter backend run test` (contract + integration, `TEST_DATABASE_URL` on `dev:infra:test`) and `pnpm --filter '!backend' run test`; report every result with its output
- [ ] T141 Read-size bands: only if a band is refused, re-measure on a clean tree after reading `specs/conventions/check-estate.md` first; never widen a band
- [ ] T142 Release intent: changesets present for every package touched (`foreign-module-changes.md` §F); `check-release-intent.ts --since origin/master`; rewrite `.changeset/projects-module.md` and `tasks-module.md` bodies to describe what actually ships (they still say "no migration, table, permission, route or screen")
- [ ] T143 Browser walk of `quickstart.md` § *Manual walk* on a `pnpm run setup` instance with demo data, light and dark, phone width for the list and detail screens
- [ ] T144 Independent review of the tenant path (`ProjectAccess`, the Task context descriptor, analytics SQL, the sweep's recipient check) by a reviewer who did not write it; close every finding before the merge request; reviewer also judges whether `project-access-seam.test.ts` must refuse any `em.execute` in `services/` outside its allow-list (today it sees class identifiers and literal SQL only); and the two by-design visibility skips: `ProjectAccess.rowAfterWrite` (only after `loadVisible`) and `ProjectReadService.graphOf` (caller passes a visible Project)

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 → Phase 2**: strictly sequential. Inside Phase 2, **2A (Tasks) and 2B (Projects)
  can run in parallel worktrees** after T012; both must be green before any story.
- **Phase 3 (US1)** needs Phase 2B only (it runs with Tasks off).
- **Phases 4–13** as below; **Phase 14** after the stories that ship.

### Story dependencies

| Story | Needs | Notes |
| --- | --- | --- |
| US1 | Phase 2B | MVP; Tasks off |
| US2 | US1, Phase 2A | the gate is a guard in US1's `move-service.ts` |
| US3 | US1 (Stage Tasks part: US2) | Template Stage Tasks materialise only with US2 |
| US4 | US1 | reads already exist from US1 (T053) |
| US5 | US1 | its matrix test grows as US6, US7, US10, US11 add routes |
| US6 | US1 | `task` panel kind needs US2's zone |
| US7 | US1; 9A before 9B and 9C | 9B (CRM) and 9C (Projects) parallel after 9A |
| US8 | US1 | Template alerts need US3 for the Template half only |
| US9 | US1 | the only story touching `custom_fields` |
| US10 | US1 | Template filter meaningful after US3 |
| US11 | US1 | demo best last |

### Within each story

Tests first and red → domain → services → routes → admin → docs → phase gate.

### Parallel opportunities

- After Phase 1: Phase 2A ∥ Phase 2B.
- After US1: US2 ∥ US4 ∥ US5 ∥ US6 ∥ Phase 9A ∥ US8 ∥ US9 ∥ US10 (separate worktrees; hot files
  `src/backend/index.ts`, `manifest.ts`, `admin/index.ts`, `admin/api.ts`, i18n bundles,
  `docs/projects.md`, `contracts/src/projects.ts` are rebased by adding a section).
- Inside a phase, every `[P]` test-writing task runs together, e.g. Phase 4: T059, T060, T061,
  T062, T063, T064.

### Parallel example — User Story 6

```text
T089 integration/projects/links.test.ts
T090 contract/projects/record-project.contract.test.ts
T091 admin ProjectPanel / LinkedRecords / crm after-zone tests
```

## Implementation Strategy

### MVP first

1. Phase 1 → Phase 2B (2A may proceed in parallel) → Phase 3 (US1).
2. **Stop and validate**: `stage-walk.test.ts` green with Tasks off; demo a Project walked to
   completed and to lost.

### Incremental delivery

US2 (Tasks + gate) → US3 Templates → US5 visibility + US6 links (the two that make Projects
usable by a team) → US7 collaboration and the CRM reference standard → US4 → US8 → US9 →
US10 → US11 → Polish. **US5 must be complete before any release** that includes US6, US7 or
US10, because those add read routes the visibility matrix must cover.

## Requirement traceability

| FR | Task(s) proving it |
| --- | --- |
| FR-001 – FR-003, FR-006 | T043, T044 |
| FR-004 | T027, T028 |
| FR-005 | T044, T080 |
| FR-007 – FR-009 | T080, T081 |
| FR-010 – FR-013 | T041, T042, T044 |
| FR-014 | T045 |
| FR-015 – FR-017 | T062, T073, T074 |
| FR-018 – FR-020 | T027, T085 |
| FR-021 – FR-024 | T089, T090 |
| FR-025 – FR-028 | T046, T108 – T110 |
| FR-029 – FR-034 | T015, T059, T060, T063 |
| FR-035 | T116, T117 |
| FR-036 | T122 |
| FR-037, FR-038 | T126 |
| FR-039, FR-040 | T014, T026, T061, T135 |
| FR-041 | T130 |
| FR-042 | T023, T038, T136 |
| FR-043 | T108 |
| FR-044 | T102 – T104 |
| SC-008 | T137 |
