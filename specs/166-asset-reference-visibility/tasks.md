---
description: "Task list for asset visibility following the records that reference it"
---

# Tasks: Asset visibility follows the records that reference it

**Input**: Design documents from `specs/166-asset-reference-visibility/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED. Constitution III is non-negotiable.
- In every phase the test tasks come first.
- Run each test and see it fail *for the stated reason* before starting the implementation task that turns it green.
- Record under the task which tests were seen red and why, as 165 did.
- Every new integration file builds the full reader matrix of `quickstart.md` (A, B, S, W, N). The wildcard reader W is the **control**, never the subject: a test that passes only for W proves nothing.

**Organization**: by user story. Phase 2 carries everything every story stands on: the registry's attribution and the batched scanners (R-6), the `readerRestriction` contract (R-2) and its three owner implementations, `AssetVisibility` with the caller classes (R-3) and the owner-off branch (R-4), and the by-id route guard (R-7) with its structural test. US1–US3 are P1; US4 and US5 are P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: the task can run in parallel with its neighbours **inside its own phase**: it touches a different file and depends on no unfinished task of that phase.
- **[US#]**: the user story of `spec.md` the task serves. Setup, Foundational and Polish tasks carry none.

## Path conventions

- **The library:** `packages/modules/assets_library/` (written `AL/` below; `AL/backend/` = `AL/src/backend/`):
  - `src/manifest.ts`;
  - `src/backend/index.ts` (composition), `plugin.ts`, `routes.admin.ts`, `services/`;
  - `docs/assets-library/index.md` at the package root.
- **Other modules:** `T/` = `packages/modules/tasks/`, `P/` = `packages/modules/projects/`, `C/` = `packages/modules/crm/`, `X/` = `packages/contracts/src/`. Unrestricted contributors are written out in full (`packages/modules/{catalog,cms,blog,megamenu}/`).
- **Tests:**
  - Unit tests sit beside their subject as `*.test.ts` (`specs/106-module-owned-tests/`).
  - Backend tests: `backend/test/{integration,contract,perf}/assets_library/` and the owners' `backend/test/integration/{tasks,projects,crm}/`.
- **Targeted runs:**
  - `pnpm --filter backend exec vitest run <path>`
  - `pnpm --filter @endora-commerce/mod-assets-library run test` (and `mod-tasks`, `mod-projects`, `mod-crm`, `mod-megamenu`)
  - `pnpm --filter @endora-commerce/contracts run test`

## Standing rules for every task

1. **Read before writing.**
   - Read the routed convention for what you are about to do (`AGENTS.md` § *Where the rest of it lives*). In particular:
     - `module-composition.md` before the manifest edge, the boot hooks and the lazy `permissionService` wiring;
     - `module-activation.md` before the owner-off branch and any contribution hook (item 3: contribution hooks stay probe-free);
     - `release-intent.md` before changesets;
     - `backend-test-suite.md` before running or changing anything in `backend/test/`.
   - Read the prior art the task names: `TaskContextDescriptor` (`P/src/backend/services/task-context-descriptor.ts`) for an ambient-caller contribution; `owner-read-permissions.ts` in each owner for the read check.
2. **Re-derive a premise marked "checked first" or "verify"** in `research.md` from the tree, at the task that names it. Line numbers in `contracts/foreign-module-changes.md` were measured at `4d2c03490`; re-measure them after the T005 merge. Record the finding under the task.
3. **`pnpm run build:packages` before running anything**, and rebuild a package you edited (`pnpm --filter <pkg> run build`) before running tests against it (D-164).
4. **Regenerate generated files, never edit them.** Run `pnpm install --lockfile-only` beside `manifests:generate`, and commit what they render in the same change.
5. **Touch a file outside `packages/modules/assets_library/` only if `contracts/foreign-module-changes.md` lists it.** Otherwise add the line there first, with its reason, in the same commit. T001 names two lines this list is already expected to need.
6. **No port call is wrapped in a `catch`** (`check:port-catches`), and no owner's visibility code is called while that owner is not present (R-4). The library decides presence; owners never probe it in their contribution hooks.
7. **Never run `db:fresh`, `db:reset`, `setup` or `module:*`** against the development database unprefixed. Integration tests use `TEST_DATABASE_URL` on `pnpm run dev:infra:test`; the manual walk uses a separate database.
8. **Commit** in conventional style with `git commit -s` (DCO). Add no `Co-Authored-By` or other AI/LLM trailer. Deliver through a merge request from `166-asset-reference-visibility`, never straight to `master`.
9. **Ledgers.** Update each in the change that needs it:
   - `contracts/foreign-module-changes.md` (rule 5);
   - `backend/test/fixtures/openapi-baseline.json` — no route or schema changes, so a regeneration (`UPDATE_OPENAPI_BASELINE=1`) must render nothing; if it renders anything, stop and report;
   - `backend/test/unit/kernel/module-removal.test.ts` and any other ledger **derived** from a file's location (`AGENTS.md` traps) — nothing is moved or deleted by this plan, so it must stay green untouched;
   - no error code, permission, setting, palette action or migration is added, so `X/errors.ts`, the permission manifests and the migration registries are **not** touched.
10. **Admin tests on Node 26:** none is planned (no UI change), but if a task runs the admin suite (`packages/admin-kit` picker, the library drawer), run it with `NODE_OPTIONS=--no-experimental-webstorage`.
11. **Shell conditions in scripts and Monitor loops use `command grep`**, never the hooked `grep`, whose exit codes for `-q` / `-v` are unreliable.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: re-derive the premises the design rests on, land the additive descriptor contract, and declare the one new dependency edge. Nothing is user-visible yet.

- [ ] T001 Re-derive the design's premises from the tree and record each answer under this task. Stop and report if (a), (b) or (c) is "no".
  - (a) F-21: `effectiveState.isPresent(moduleId)` is a synchronous read exported from the published barrel `@endora-commerce/platform/kernel` (not a `host-internal-subpath`; `check:platform-surface`).
  - (b) F-20: `permissionService.listPermissions(adminUserId)` returns `[]` and does not throw for a role-less administrator, and returns `'*'` for the Platform administrator role.
  - (c) R-7: in `AL/src/backend/routes.admin.ts`, a route-level `preHandler` placed after the permission gate runs **before** the replace route's multipart stream is consumed (`request.file()` / `request.parts()` in the handler), so a refused replace stages no bytes.
  - (d) R-2: `check:port-shape` accepts an optional **data property** (`readonly readerRestriction?`) on `AssetReferenceDescriptor`, which is a contribution shape, not a port.
  - (e) R-14 / F-22 and the spec's Edge Case "an owner not part of the deployment": a platform-unavailable or soft-uninstalled owner is still composed and still contributes its descriptor; only an uncomposed package contributes none.
  - (f) **Where the owners' complement tests can run.** `quickstart.md` places them co-located in `T/`, `P/`, `C/`; measured at planning time, no co-located test in those three packages opens a database. If that holds, keep the co-located files for the restriction's wiring (getters resolved per call, the read-permission clause, a `null` condition) and put the SQL complement property in `backend/test/integration/{tasks,projects,crm}/asset-reference-restriction.test.ts`; add those three lines to `contracts/foreign-module-changes.md` §F.
  - (g) **Catalog has no reference-scanner test today** (`command grep -rl asset-references backend/test` finds blog and the kernel seam test only). Add `backend/test/integration/catalog/asset-references.test.ts` to `contracts/foreign-module-changes.md` §E for T011.
- [ ] T002 [P] Write failing type-level tests in `X/assets-library.test.ts`:
  - a descriptor returning plain `AssetReference[]` still compiles as an `AssetReferenceDescriptor` (compatibility, `ports.md` §1);
  - a descriptor returning `AssetReferenceHit[]` with `assetId` compiles;
  - a restricted descriptor exposes `readerRestriction.visibleEntityIds`, `assetIdsWithHiddenReferences` and `allReferencedAssetIds` with the `ports.md` §1 signatures;
  - `readerRestriction` is optional and readonly.
- [ ] T003 Implement the descriptor half of the contract in `X/assets-library.ts` per `contracts/ports.md` §1–§2: `AssetReferenceHit`, `AssetReferenceReaderRestriction`, the optional `AssetReferenceDescriptor.readerRestriction`, `findReferences` returning `AssetReferenceHit[]`, and the doc blocks (who each method answers to; the registry's enumeration policy versus the library's visibility policy). `AssetReadPort.visibleToCaller` is **not** added here: it is required, and lands with its only implementation in T022 so the workspace keeps type-checking. Rebuild `@endora-commerce/contracts`, run `pnpm -r run typecheck`, and record any consumer error under this task (none is expected: the change is additive). T002 green.
- [ ] T004 Add `'admin_roles'` to `dependencies` in `AL/src/manifest.ts` (R-3; `admin_roles` is non-deactivatable, so no `whenAbsent` is owed). Run `pnpm --filter backend run manifests:generate` and `pnpm install --lockfile-only`, and commit what they render. Run `pnpm --filter backend run check:port-dependencies`.

**Checkpoint**: the contract says what a restricted descriptor is, the library may resolve `permissionService`, and the workspace type-checks and builds.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the batched, attributed reference scan (R-6, which also repairs #535), the three owners' `readerRestriction`, the one evaluator `AssetVisibility` (R-3, R-4, R-5's `exclusionFor`, `hiddenAmong`, `visibleReferences`), `assetReadPort.visibleToCaller` (R-13), and the by-id guard (R-7). Every story stands on these.

**⚠️ CRITICAL**: no user-story work begins until this phase's checkpoint is green.

### Tests first

- [ ] T005 Merge `origin/master` into `166-asset-reference-visibility` first (`git fetch origin && git merge origin/master`), to pick up the separate #535 hot-fix of `findReferencesMany` (a minimal per-asset fallback). Record under this task the hot-fix's commit, the fallback it added in `AL/src/backend/services/reference-registry.ts`, and its test file. If #535 has not merged yet, record that, continue, and repeat this merge before T013. Then write failing tests in `AL/src/backend/services/reference-registry.test.ts` (extend the hot-fix's file if it chose this path; **keep every hot-fix case unchanged**):
  - `findReferencesMany([x, y])` attributes each tagged hit to its own asset by `hit.assetId`, asking each tagged descriptor **once** for the batch;
  - a descriptor returning untagged hits for a batch of more than one asset is asked once per asset, and only that descriptor;
  - a batch of one asset attributes an untagged hit without a second call;
  - `findReferences` still asks every descriptor whatever its owner's state (F-9, FR-008, FR-011);
  - the registry exposes the descriptors partitioned into restricted and unrestricted for `AssetVisibility`.
  - Red reason expected: the batched one-call assertion (the hot-fix asks per asset) and the partition.
- [ ] T006 [P] Write failing tests in `AL/src/backend/services/asset-visibility.test.ts` with fake descriptors, a fake `effectiveState` and a fake `permissionService` (`quickstart.md` §1, Foundational row):
  - caller classes (R-3): the system actor → unrestricted `system`; an admin whose `listPermissions` contains `*` → unrestricted `wildcard`; any other admin → `admin`; no context, a customer or an API key → `nobody`; `listPermissions` asked at most once per request;
  - FR-001 a: no reference, or only unrestricted ones → visible;
  - FR-001 b: one visible restricted reference among hidden ones → visible; a restricted hidden reference plus an unrestricted one → visible (rescue);
  - owner off (R-4): its references are hidden from `admin` and `nobody`; `visibleEntityIds` and `assetIdsWithHiddenReferences` are **never** called; `exclusionFor` uses `allReferencedAssetIds`; the wildcard still sees the asset;
  - `nobody` sees no restricted record and asks no owner's `visibleEntityIds`;
  - unrestricted callers skip every owner call;
  - `hiddenAmong(ids)` asks each restricted descriptor's `findReferences` once, each present owner's `visibleEntityIds` once, and the unrestricted descriptors only for the pending ids (FR-014);
  - `exclusionFor(where)` asks each restricted descriptor exactly once, returns nothing without a candidate, and scopes candidates by the list's own `where`;
  - `visibleReferences` returns every unrestricted reference plus the visible restricted ones, all of them for an unrestricted caller, and strips `assetId`;
  - invariant I-1: a visible asset with references has at least one visible reference;
  - `assertVisible(id)` throws the shared `assetNotFound(id)` error, byte-identical to the service's missing-row error.
- [ ] T007 [P] Write failing tests for the Tasks restriction: `T/src/backend/services/task-asset-references.test.ts` (wiring: hits carry `assetId`; getters resolved per call, never at boot; without `tasks:read` `visibleEntityIds` is empty and `assetIdsWithHiddenReferences` is every referenced asset; a `null` visibility condition hides nothing) and, per T001 (f), the SQL complement property over seeded rows — private, draft, public, a Project-context Task the caller cannot see, and a row with a NULL `context_id` — asserting `assetIdsWithHiddenReferences()` is the exact complement of `visibleEntityIds` and `allReferencedAssetIds()` is every attached asset (R-16).
- [ ] T008 [P] Write failing tests for the Projects restriction in `P/src/backend/services/project-asset-references.test.ts` and, per T001 (f), its complement over seeded Member / Viewer / Organization-reach rows, including a caller without `projects:read`.
- [ ] T009 [P] Write failing tests for the CRM restriction in `C/src/backend/services/crm-asset-references.test.ts` and, per T001 (f), its complement over Opportunities in two Organizations for a caller scoped to one, and a caller without `crm:read` (R-15).
- [ ] T010 [P] Write the failing structural test `AL/src/backend/routes.admin.guard.test.ts`: enumerate every admin route of `AL/src/backend/routes.admin.ts` with an `:id` asset parameter (10 today, `contracts/admin-api.md` §1 rows 2–5, 7–11, 13) and fail on any without `requireVisibleAsset` placed after its permission gate; it must also fail on a newly added `:id` route that lacks it (assert against a fixture route list as well as the real file).
- [ ] T011 [P] Write failing two-asset attribution cases in the unrestricted contributors' existing tests (R-6): `backend/test/integration/assets_library/cms-body-scan.test.ts` (cms), `backend/test/integration/blog/asset-references.test.ts` (both blog descriptors), `packages/modules/megamenu/src/backend/services/contributed-reference-scanners.test.ts` (megamenu), `backend/test/integration/{cms,blog}/asset-reference-while-off.test.ts` (attribution while off), and the new `backend/test/integration/catalog/asset-references.test.ts` (all five catalog descriptors, T001 (g)). Each asserts that a batch of two assets returns hits tagged with the right `assetId` and that the jsonpath descriptors issue **one** statement per batch (count queries on the connection).
- [ ] T012 [P] Write failing tests for `visibleToCaller` in `AL/src/backend/services/asset-read-port.test.ts`: hidden and missing ids are absent alike, a non-uuid is absent, the system actor and the wildcard get every existing id, one evaluation per call whatever the batch size; and a type-level assertion in `X/assets-library.test.ts` that `AssetReadPort` declares `visibleToCaller` as a required method.

### Attribution and batching (R-6)

- [ ] T013 Repair the registry in `AL/src/backend/services/reference-registry.ts`, **replacing the #535 hot-fix's per-asset fallback** (re-merge `origin/master` first if T005 recorded it as unmerged): attribute by `hit.assetId`; fall back to one call per asset only for a descriptor that returned an untagged hit in a batch of more than one; drop `__assetId`; expose the restricted/unrestricted partition. The hot-fix's test stays and stays green. T005 green.
- [ ] T014 [P] Tag every hit with `assetId` in all five catalog descriptors and make the category-content descriptor (the per-asset loop, ~163-185) one jsonpath statement over the batch returning the matched id, in `packages/modules/catalog/src/backend/services/asset-references.ts`. T011 catalog cases green.
- [ ] T015 [P] Tag hits and make the per-asset loop (~43-74) one statement in `packages/modules/cms/src/backend/services/asset-references.ts`. T011 cms cases green.
- [ ] T016 [P] Tag hits on both descriptors and make the content loop (~78-108) one statement in `packages/modules/blog/src/backend/services/blog-asset-references.ts`. T011 blog cases green.
- [ ] T017 [P] Tag hits in `packages/modules/megamenu/src/backend/services/asset-references.ts`. T011 megamenu case green.

### Owners' `readerRestriction` (R-2, R-15)

- [ ] T018 [P] Tasks: add `TASKS_READ_PERMISSION` and its check (the existing `createOwnerReadCheck` shape, wildcard included) in `T/src/backend/services/owner-read-permissions.ts`; in `T/src/backend/services/task-asset-references.ts` tag hits with `assetId` and add `readerRestriction` over `TaskAccess.visibleIds`, `TaskVisibility.condition('t')` written `(…) is not true`, and `select distinct asset_id from task_attachments`; take the dependencies as getters; pass the getters from the asset-reference boot hook in `T/src/backend/index.ts` (still contribution-only, no presence probe). T007 green.
- [ ] T019 [P] Projects: tag hits and add `readerRestriction` over `ProjectAccess.visibleIds` / `visibleProjectSql` with `canRead` in `P/src/backend/services/project-asset-references.ts`; pass the getters from the boot hook in `P/src/backend/index.ts`. T008 green.
- [ ] T020 [P] CRM: add the `crm:read` check in `C/src/backend/services/owner-read-permissions.ts`; tag hits and add `readerRestriction` over the scoped EntityManager (`CrmOpportunity`, Organization reach; two statements for `assetIdsWithHiddenReferences`) in `C/src/backend/services/crm-asset-references.ts`; pass the getters from the boot hook in `C/src/backend/index.ts`. T009 green.

### The evaluator, the port method and the guard (R-3, R-4, R-7, R-13)

- [ ] T021 Implement `AssetVisibility` in `AL/src/backend/services/asset-visibility.ts` per `data-model.md` §2: `caller()` (system / wildcard via `permissionService.listPermissions` / admin / nobody, memoised per request), the owner-off branch via `effectiveState.isPresent` read per evaluation, `hiddenAmong`, `exclusionFor`, `visibleReferences`, `assertVisible`, and the shared `assetNotFound(id)` helper that `AL/src/backend/services/assets-library.service.ts` and `AL/src/backend/services/asset-replace.ts` now throw through. Construct it in `AL/src/backend/plugin.ts` and resolve `permissionService` lazily in `AL/src/backend/index.ts`. Never catch `ModuleDisabledError`. T006 green.
- [ ] T022 Add the required `AssetReadPort.visibleToCaller` to `X/assets-library.ts` (`ports.md` §3) and implement it in `AL/src/backend/services/asset-read-port.ts` over `AssetVisibility` (existing ids only; uuid check first); pass `AssetVisibility` into `AssetReadService` from `AL/src/backend/index.ts`. Rebuild `contracts`, run `pnpm -r run typecheck` (test doubles cast or `Pick` the port, `ports.md` §3; record any that do not). T012 green.
- [ ] T023 Implement the `requireVisibleAsset` preHandler in `AL/src/backend/routes.admin.ts` per R-7 (classify and store the caller on the request; restricted descriptors' `findReferences([id])` issued whether or not the row exists; present owners' `visibleEntityIds`; rescue; `assetNotFound(id)`), and attach it after the permission gate on the 10 `:id` routes, before any body or multipart read. T010 green.
- [ ] T024 Foundational gate. Run `pnpm run build:packages`, `pnpm -r run typecheck`, `pnpm -r run lint`, T005–T012 and the existing reference tests named in T011 (green before and after), `pnpm --filter backend run check:port-shape`, `check:port-catches`, `check:port-dependencies`, `check:entry-presence`, `check:module-boundary`. `command grep -rn 'findReferencesMany\|__assetId' backend/test packages/modules --include='*.ts'` and fix any assertion that encoded the empty answer. Record results under this task.

**Checkpoint**: references are attributed in one call per descriptor, the three owners answer the visibility question, `AssetVisibility` decides it for every caller class with owners on or off, and every by-id route is guarded. US1, US2 and US4 can now start.

---

## Phase 3: User Story 1 — Files of records I cannot see stay hidden in the library (Priority: P1) 🎯 MVP

**Goal**: a file used only by records the reader may not see is absent from the list, search and picker, answers every by-id route exactly as a missing file, is skipped by move-many, never named by a permalink conflict, and cannot be attached to another record (FR-004, FR-005, FR-006, FR-012).

**Independent Test**: `quickstart.md` §1, US1 rows. As B, a file on A's private Task is absent from `GET /assets` (root, `q=`, `includeDeleted`, the picker's query) and every by-id route of `contracts/admin-api.md` §1 answers for it exactly as for a random uuid (status, `code`, `message`, body), per restricted kind; A, S (private Task) and W see it; B's attach-existing is refused with the missing-file 422.

### Tests first

- [ ] T025 [US1] Write the failing integration test `backend/test/integration/assets_library/reference-visibility.test.ts`, US1 block, with the reader matrix A, B, S, W, N built in the file:
  - per hidden kind — private Task, draft Task (S does not see it either), Task in Project P1's context, P1 attachment, O1 Opportunity (B reaches O2 only), and reader N for all of them;
  - `GET /assets` root folder, `q=` the file's name, `includeDeleted=true`, and the picker's query: the file is absent, pages stay full and `nextCursor` never lands on a hidden row only;
  - **not-found identity**, table-driven over `admin-api.md` §1 rows 2–5, 7–11, 13: hidden id versus random uuid, equal status, `code`, `message` and body;
  - replace of a hidden id stages no bytes (storage untouched);
  - move-many with a hidden id: skipped like a missing id (`movedCount`, the audit row's `assetIds`, the file's folder unchanged);
  - a permalink conflict whose holder is hidden answers `details.assetId: null`;
  - A, S (private Task only) and W see and use the file.
  - Red reason expected: list, move-many and permalink cases (the guard rows may already be green after T023; record which).
- [ ] T026 [P] [US1] Extend `backend/test/integration/tasks/attachments.test.ts` with the FR-006 cases: as B, attaching to B's own Task a file hidden by **another** module's record (a P1 attachment) and a hidden **public** file are both refused with the missing-file `422 VALIDATION_FAILED` sentence, before the private-file and active-content refusals.
- [ ] T027 [P] [US1] Extend `backend/test/integration/projects/attachments.test.ts` with the same FR-006 cases for B's own Project.
- [ ] T028 [P] [US1] Extend `backend/test/integration/crm/attachments.test.ts` with the same FR-006 cases for B's own Opportunity.

### Implementation

- [ ] T029 [US1] Narrow the list in SQL (R-5): `listAssets` in `AL/src/backend/services/assets-library.service.ts` takes the caller and adds `id <> all(?::uuid[])` from `AssetVisibility.exclusionFor(where)` for a restricted caller, `includeDeleted` included; `GET /assets` in `AL/src/backend/routes.admin.ts` passes the caller the guard stored (or classifies it). Unrestricted callers run today's query unchanged.
- [ ] T030 [US1] Skip hidden ids in `moveMany` in `AL/src/backend/services/assets-library.service.ts` (R-9): load the ids, drop those `hiddenAmong` returns, move the rest; `movedCount` and the audit row's `assetIds` count only what moved.
- [ ] T031 [US1] Redact a hidden permalink holder (R-11) in the permalink refusal of `AL/src/backend/services/assets-library.service.ts`: `details.assetId` is `null` when the holder is hidden from the caller; status, code, message and `details.permalink` unchanged.
- [ ] T032 [P] [US1] In `T/src/backend/services/attachment-service.ts`, `add()` asks `assets.visibleToCaller([assetId])` right after `findById(…, { liveOnly: true })`, before `#refuseAFileHeldOutOfSight`, the private-file and the active-content refusals; absent → `fileUnavailable()`. Widen the `assets` dependency type. T026 green.
- [ ] T033 [P] [US1] The same in `P/src/backend/services/attachment-service.ts`. T027 green.
- [ ] T034 [P] [US1] The same in `C/src/backend/services/opportunity-attachment-service.ts`, before `#refuseAFileHeldOutOfReach`. T028 green.
- [ ] T035 [US1] US1 gate: T025–T028 green; the existing `backend/test/contract/assets_library/` suite green unchanged (for its full-permission readers nothing changes); `pnpm --filter @endora-commerce/mod-assets-library run test`. Record under this task.

**Checkpoint**: issue #513's leak is closed for files of records the reader cannot see. The "used by" list of a *visible* file still names hidden records until US3.

---

## Phase 4: User Story 2 — Shared files and files uploaded straight to the library keep working (Priority: P1)

**Goal**: unrestricted kinds, unused uploads and multi-referenced files stay exactly as visible as today (FR-001, FR-003, FR-013, SC-002).

**Independent Test**: `quickstart.md` §1, US2 row. B's and W's lists, `nextCursor` and details are equal for product gallery, category, CMS, blog and megamenu images and an unused upload; a file used by A's private Task and a product, and a file used by a Task B sees and one B does not, are visible to B.

### Tests first

- [ ] T036 [US2] Write the US2 block (*unrestricted kinds*) of `backend/test/integration/assets_library/reference-visibility.test.ts`:
  - product gallery, category content, CMS, blog and megamenu images and an unused upload: B's and W's lists (items and order), `nextCursor` and details are equal, in the root folder and in a product-image folder;
  - rescue: a file used by A's private Task **and** a product is visible to B on the list, the detail, the URL and every by-id route;
  - a file used by two Tasks, one B sees and one B does not, is visible to B;
  - the shared picker's query returns the same set to B and W for unrestricted content.
  - Expected: green on first run if Phase 2 is right; a case seen red names a defect in the rescue step. Prove each case measures something by showing it red against a deliberately broken rescue (comment out the step locally, never committed) and record that.

### Implementation

- [ ] T037 [US2] No new code is planned. If T036 finds a defect, fix it in `AL/src/backend/services/asset-visibility.ts` (rescue step or partition) with its unit case added to `AL/src/backend/services/asset-visibility.test.ts` first, and record it under this task.

**Checkpoint**: everyday content work is unchanged for every library reader.

---

## Phase 5: User Story 3 — The "used by" list shows only what I may see (Priority: P1)

**Goal**: a visible file's references list only the records the reader may see; hidden ones are neither named nor counted (FR-007).

**Independent Test**: `quickstart.md` §1, US3 row. For a file used by a product and A's private Task, B's detail lists the product only; A's and W's list both.

### Tests first

- [ ] T038 [US3] Write the *used by* block of `backend/test/integration/assets_library/reference-visibility.test.ts`:
  - `GET /assets/:id`: B sees the product only, A and W see both, and no response carries `assetId` on a reference;
  - the detail every mutating by-id route returns (rename via `PATCH`, move, replace, previous-version restore, permalink set and remove, restore) is filtered the same way for B;
  - the same for a Project and an Opportunity reference alongside a CMS embed.

### Implementation

- [ ] T039 [US3] Filter `detail()` in `AL/src/backend/services/assets-library.service.ts` through `AssetVisibility.visibleReferences` for the caller, and strip `assetId` from the wire; make every route that returns a detail (`AL/src/backend/routes.admin.ts`, and the replace and previous-version paths in `AL/src/backend/services/asset-replace.ts`) return it through the same call. T038 green.

**Checkpoint**: all P1 stories hold. No record's number or existence leaks through the library for a restricted reader.

---

## Phase 6: User Story 4 — Deleting a file in use is still refused (Priority: P2)

**Goal**: the in-use check counts every reference whoever asks, the refusal names only visible ones, the recursive folder delete really refuses (the R-6 repair), folder counts follow the reader, and a folder holding only hidden files deletes as empty with those files re-homed (FR-008, FR-012, SC-003, R-10).

**Independent Test**: `quickstart.md` §1, US4 row. As B, deleting a file used by a product and A's private Task is refused naming one record, count 1; a hidden file gives 404; `deleteRecursively` over a referenced file refuses; a folder of only hidden files deletes under `cancel` and the files sit in the parent afterwards.

### Tests first

- [ ] T040 [US4] Write the failing integration test `backend/test/integration/assets_library/folder-delete-references.test.ts` with the reader matrix:
  - `DELETE /assets/:id` as B on F (product + A's private Task): `409 ASSET_REFERENCED`, message count 1, `details` the product only; as W: both named; a hidden file: the 404 of a missing one;
  - `deleteRecursively` over a subtree holding a referenced visible file refuses with `details` = visible ids only, and soft-deletes nothing (red today without the #535 hot-fix; with it, red on the visible-only `details` and on re-homing);
  - `deleteRecursively` with hidden files: they are re-homed to the deleted root's parent (root when none), not soft-deleted; `softDeletedAssetIds` lists only visible unreferenced files;
  - `cancel` on a folder of only hidden files: deleted, files in the parent; on a folder with a visible file: `409 ASSET_FOLDER_NOT_EMPTY` counting visible files only;
  - `moveContentsToParent`: unchanged;
  - the `asset_folder.delete` audit row carries `stateBefore.rehomedAssetIds` in the same flush;
  - `GET /assets/folders/:folderId/permalink-count` excludes hidden files for B and counts them for W;
  - deletion stays refused for W too while any reference exists (FR-010 keeps FR-008).
- [ ] T041 [P] [US4] Extend `backend/test/contract/assets_library/admin-soft-delete.contract.test.ts`: the 409's count and `details` are the visible references (at least one, invariant I-1); a full-permission reader's answer is unchanged.
- [ ] T042 [P] [US4] Extend `backend/test/contract/assets_library/admin-folders.contract.test.ts`: the permalink count and the `ASSET_FOLDER_NOT_EMPTY` count are reader-aware; the folder tree response is unchanged.

### Implementation

- [ ] T043 [US4] In `softDelete` of `AL/src/backend/services/assets-library.service.ts`, keep asking every descriptor through the registry (count all, FR-008) and build the 409's count and first 20 `details` from `AssetVisibility.visibleReferences` (R-8). T041 green.
- [ ] T044 [US4] Make the permalink count in `AL/src/backend/services/folders.service.ts` subtract the caller's exclusion set over the subtree (R-10). T042 permalink case green.
- [ ] T045 [US4] Rework folder delete in `AL/src/backend/services/folders.service.ts` per `contracts/admin-api.md` §1.1: reader-aware `cancel` refusal; real recursive reference check through the repaired `findReferencesMany`; hidden files re-homed (`folder_id` → parent or root) inside the existing folder-delete Command and flush; `stateBefore.rehomedAssetIds` on the existing audit row. Run `pnpm --filter backend run check:command-coverage` (expected clean: no new write path). T040 and T042 green.

**Checkpoint**: data integrity is at least as strong as before (stronger: the recursive delete refuses), and no refusal or count names a hidden record.

---

## Phase 7: User Story 5 — Switching a module off does not expose or destroy its files (Priority: P2)

**Goal**: a switched-off owner's files stay hidden from every non-wildcard reader and undeletable for everyone; switching back on restores every reader's view with no write (FR-009, FR-010, SC-005, Constitution XVII).

**Independent Test**: `quickstart.md` §1, US5 row. `withModuleOff('tasks')`: F is absent for B and S, present for W, and `DELETE` is refused for everyone, W included; switched back on, B's, S's and W's lists equal the ones taken before. Repeated for `projects` and `crm`.

### Tests first

- [ ] T046 [US5] Write `backend/test/integration/assets_library/reference-visibility-owner-off.test.ts`, for each of `tasks`, `projects`, `crm`, on both axes (`deactivated`, `platform-unavailable`, F-22):
  - snapshot B's, S's and W's lists and details before;
  - while off: the owner-only file is absent for B and S and answers by-id as a missing file, present for W; `DELETE` refused for all three, W included; the library's list does **not** answer 503 (R-4: the library never resolves the owner's gated code);
  - rescue while off: a file used by the switched-off owner's record **and** a CMS page stays visible to B;
  - switched back on: every reader's list and details equal the snapshot; no row was written (assert `assets.updated_at` unchanged).
  - Expected: green on first run if T021 is right; prove each case measures something as in T036 and record it.
- [ ] T047 [P] [US5] Extend the existing "library refuses delete while off" case in `backend/test/integration/tasks/off-state.test.ts`: the file is also absent from a restricted reader's list while off and back once Tasks is on. Run `pnpm --filter backend run check:off-state-coverage`.

### Implementation

- [ ] T048 [US5] No new code is planned. If T046 or T047 finds a defect, fix it in `AL/src/backend/services/asset-visibility.ts` with its unit case in `AL/src/backend/services/asset-visibility.test.ts` first, and record it under this task.

**Checkpoint**: Constitution XVII holds for the library's view of every restricted owner.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T049 Write `backend/test/perf/assets_library/reference-visibility.perf.test.ts` on the `PERF_RUN` pattern of `backend/test/perf/tasks/context-visibility.perf.test.ts` (R-16): 50 root-folder assets × 3 references of different kinds plus 2 000 hidden Task attachments; `GET /assets?limit=50` p95 over 30 iterations for B < 1 000 ms and ≤ 1.2 × W's p95 (env-overridable); the missing-versus-hidden by-id latency recorded, not gated. Run with `PERF_RUN=true` and record the figures under this task. If SC-004 fails, apply R-5's fallback (memoise each owner's scope per request) and re-measure.
- [ ] T050 [P] Write the English documentation:
  - `packages/modules/assets_library/docs/assets-library/index.md`: a "Who sees which files" section for users (hidden files, the "used by" list, delete refusals, folders re-homing hidden files, owner switched off, the Platform administrator, public links unchanged, FR-009a's two ways to remove files for good) and, for developers, the `readerRestriction` contract, `AssetReferenceHit.assetId`, batching, and `assetReadPort.visibleToCaller`;
  - one sentence each in the attachments sections of `packages/modules/tasks/docs/tasks.md`, `packages/modules/projects/docs/projects.md` and `packages/modules/crm/docs/crm.md`.
  - Run `pnpm --filter backend run check:module-docs` and `check:doc-snippets`.
- [ ] T051 Write the Polish copies per `docs/docs/contributing/documentation-i18n.md` (manual workflow): `docs/i18n/pl/docusaurus-plugin-content-docs/current/modules/assets-library/index.md` and the one sentence in `docs/i18n/pl/docusaurus-plugin-content-docs/current/modules/{tasks,projects,crm}.md`, UI labels taken from each module's `i18n/pl.json`; update the cache entries under `docs/translation-cache/pl/` with the English source's hash. Run `check:docs-translations` (0 findings) and `pnpm --filter docs run build` in both locales.
- [ ] T052 [P] Write the changesets in `.changeset/` per `plan.md` *Other gates* and `release-intent.md`, one per meaning: `@endora-commerce/contracts` minor; `@endora-commerce/mod-assets-library` minor (reader-aware admin API; repaired recursive folder delete, with a release note that it now refuses in-use files); `mod-tasks`, `mod-projects`, `mod-crm` minor; `mod-catalog`, `mod-cms`, `mod-blog`, `mod-megamenu` patch. Review each body against `specs/conventions/commercial-data.md`. Run `pnpm run check:release-intent --since origin/master` (or the backend script it routes to).
- [ ] T053 Regenerate the generated artefacts: `pnpm --filter backend run manifests:generate` then `pnpm install --lockfile-only`; `composer:generate` (expected: nothing, no migration); the OpenAPI baseline with `UPDATE_OPENAPI_BASELINE=1` (expected: nothing). Commit whatever renders; if anything beyond `assets_library`'s package manifest changes, stop and report.
- [ ] T054 Derived-ledger and deleted-symbol sweep: `command grep -rn 'findReferencesMany\|__assetId' backend/test admin/test packages --include='*.ts'`, plus the #535 hot-fix's fallback symbol recorded in T005; confirm no test still encodes the empty `findReferencesMany` answer or the hot-fix's per-asset call count. Nothing is moved or deleted, so `backend/test/unit/kernel/module-removal.test.ts` and the recorded read sizes must be green untouched; run `module-removal.test.ts` and record the result. Do not re-record a read size the band accepts.
- [ ] T055 Have an independent reviewer go over every leak path: each by-id route and the guard's placement, the list and picker, move-many, folder counts and folder delete, the permalink conflict, the delete refusal, the error bodies, and the three owners' attach paths. Record the result in the merge request description.
- [ ] T056 Run the full verification set of `quickstart.md` §3 on the final tree: `pnpm run build:packages`; `pnpm -r run typecheck && pnpm -r run lint`; `pnpm --filter backend run test:unit:fast`; the targeted integration and contract directories (`test/integration/assets_library`, `test/contract/assets_library`, `test/integration/{tasks,projects,crm,cms,blog,catalog}`); `pnpm --filter '!backend' run test`; `PERF_RUN=true` perf run; `check:port-dependencies`, `check:port-catches`, `check:port-shape`, `check:entry-presence`, `check:module-boundary`, `check:command-coverage`, `check:off-state-coverage`; `pnpm run check:naming && pnpm run check:language`; `git status` clean after regeneration. Record every result, failures with their output.
- [ ] T057 Do the manual browser walk of `quickstart.md` §2 on a **separate** database (never the development database), with readers A, B and the Platform administrator. Record any deviation as a defect under the task that owns it.
- [ ] T058 Update issue #513: a ticked checklist of FR-001…FR-014 and the stories, the progress per phase, the relation to #535 (hot-fix on master, superseded by T013 with its test kept), and the planning amendments the owner acknowledged on 2026-10-29 — R-9 (a hidden id in move-many is skipped like a missing one), R-10, R-12 (the storage page's two counts stay library-wide), R-14 and R-15. Close #535's loop by linking the merge request.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1):** T001 first; its findings (f) and (g) add ledger lines that T007–T011 need. T002 → T003. T004 independent of T002/T003.
- **Foundational (Phase 2):** needs Phase 1 and blocks every story. T005 (merge, then tests) → T013. T006–T012 in parallel. T013 → (T014 ∥ T015 ∥ T016 ∥ T017) and (T018 ∥ T019 ∥ T020) → T021 → T022 → T023 → T024.
- **US1 (Phase 3):** needs Phase 2. T029 → T030 → T031 (one file, sequential); T032 ∥ T033 ∥ T034.
- **US2 (Phase 4):** needs Phase 2 only; may run in parallel with US1 (it shares `reference-visibility.test.ts`, so add its block after US1's fixtures exist, or rebase by adding lines).
- **US3 (Phase 5):** needs US1 (the same test file's fixtures, the same service file).
- **US4 (Phase 6):** needs Phase 2 (T013's repair) and US3's `visibleReferences` use in `detail()` (T039) for the refusal's names.
- **US5 (Phase 7):** needs US1 (the list exclusion) and US4 (the delete refusal it asserts).
- **Polish (Phase 8):** needs every story. T049 needs US1–US3; T053 after every manifest or package change; T056 last before T057–T058.

### Story completion order

US1 → US2 (parallel-capable) → US3 → US4 → US5 → Polish.

### Parallel opportunities

- **Inside Phase 2:** the seven test tasks T006–T012, then the four unrestricted scanners T014–T017 and the three owners T018–T020 — seven different packages.
- **Across stories:** US2 alongside US1 once Phase 2 is green, in a separate worktree branched off this feature branch (`scripts/setup-worktree.sh`).
- **Hot files**, rebased by adding lines: `AL/src/backend/services/assets-library.service.ts`, `AL/src/backend/routes.admin.ts`, `AL/src/backend/services/folders.service.ts`, `backend/test/integration/assets_library/reference-visibility.test.ts`, `X/assets-library.ts` (frozen after T022).

### Parallel example: Foundational

```text
Red first, together:
  T006 asset-visibility.test.ts · T007 tasks restriction · T008 projects restriction
  T009 crm restriction · T010 routes.admin.guard.test.ts · T011 scanner attribution · T012 visibleToCaller
Then: T013 → (T014 ∥ T015 ∥ T016 ∥ T017) ∥ (T018 ∥ T019 ∥ T020) → T021 → T022 → T023 → T024
```

### Parallel example: User Story 1

```text
Red first, together:
  T025 reference-visibility.test.ts (US1) · T026 tasks attachments · T027 projects attachments · T028 crm attachments
Then: T029 → T030 → T031 (assets-library.service.ts) ∥ T032 ∥ T033 ∥ T034 → T035
```

### Parallel example: User Story 2

```text
T036 (after US1's fixtures exist) → T037 only if a case is red
```

### Parallel example: User Story 3

```text
T038 → T039
```

### Parallel example: User Story 4

```text
Red first, together: T040 folder-delete-references.test.ts · T041 admin-soft-delete · T042 admin-folders
Then: T043 (assets-library.service.ts) ∥ T044 → T045 (both folders.service.ts, sequential)
```

### Parallel example: User Story 5

```text
Together: T046 reference-visibility-owner-off.test.ts · T047 tasks/off-state.test.ts → T048 only if red
```

---

## Implementation Strategy

1. **Minimum MVP = Phases 1–3** (Setup, Foundational, US1): issue #513's leak of whole files is closed, and the recursive folder delete is repaired. It is not shippable alone: a visible file's "used by" list still names hidden records.
2. **Shippable MVP = Phases 1–5** (all three P1 stories): nothing a restricted reader receives names, counts or serves a hidden record's file, and everyday content work is proved unchanged. Show it on the demo to the owner at this checkpoint.
3. **Then the P2 stories:** US4 (refusal names and folder behaviour) and US5 (owner off), then Polish.
4. **One merge request** delivers the feature from `166-asset-reference-visibility` to `master`. If the owner wants it earlier, split at the Phase 5 checkpoint; every phase is green on its own, and there is no migration to keep single.

---

## Requirement traceability

| Requirement | Tasks |
| --- | --- |
| FR-001 visibility rule | T006, T021, T025, T036 |
| FR-002 owner decides | T007–T009, T018–T020 |
| FR-003 declared restriction | T002, T003, T018–T020 (unrestricted: T014–T017 add none) |
| FR-004 absent from list, folders, picker, detail, URL | T025, T029, T040, T044 |
| FR-005 by-id actions not found; move-many skip | T010, T023, T025, T030 |
| FR-006 attach-existing refused | T012, T022, T026–T028, T032–T034 |
| FR-007 "used by" filtered | T038, T039 |
| FR-008 deletion counts every reference | T005, T013, T040, T041, T043, T045 |
| FR-009 owner off fails closed | T006, T021, T046, T047 |
| FR-009a removal routes | T001 (e), T050 |
| FR-010 wildcard override | T006, T021, T046 |
| FR-011 system sees all | T005, T006, T012 |
| FR-012 no existence leak | T023, T025, T031, T040, T042, T045, T055 |
| FR-013 no weakening | T025 (A, S), T036 |
| FR-014 batched per page | T005, T006, T011, T014–T017, T049 |
| SC-001 | T025 |
| SC-002 | T036, T035 |
| SC-003 | T040, T041 |
| SC-004 | T049 |
| SC-005 | T046 |
