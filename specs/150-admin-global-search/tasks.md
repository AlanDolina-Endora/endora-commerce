# Tasks: Admin global search

**Input**: Design documents from `specs/150-admin-global-search/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: required — Constitution III (TDD, non-negotiable). Every implementation task follows the
failing test it turns green; § *Requirement → test* maps every FR and SC.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2, US3 (spec.md); Setup, Foundational and Polish tasks carry none

## Path conventions

- Module sources: `packages/modules/<id>/src/…`; bundles `packages/modules/<id>/i18n/{en,pl}.json`;
  docs `packages/modules/<id>/docs/`.
- **Harness-free tests sit beside their subject** as `*.test.ts` in the package
  (`specs/106-module-owned-tests/`); `backend/test/{contract,integration,perf}/admin_search/` holds only
  tests that boot the server. `check:test-ownership` refuses a harness-free single-owner test under
  `backend/test`.
- Admin UI tests: `admin/test/components/` (shell) and `admin/test/modules/<id>/` (module pages),
  rendered in `<StrictMode>`.

## Standing rules for every task

- Read the routed convention before the thing it governs: `specs/conventions/module-composition.md`
  (registry, ports, boot hooks), `module-activation.md` (off-state), `module-admin-surfaces.md`
  (permission, palette, nav), `module-i18n.md`, `module-documentation.md`, `check-estate.md` (before
  re-recording any read size).
- Foreign ports only through `lazyPort<T>(ctx, 'literal')`, `T` from `@endora-commerce/contracts`;
  never a bare `catch` around a port call.
- Rebuild a package after editing it (`pnpm --filter <pkg> run build`) before running anything that
  imports it; `tsc` reads sources, tests read `dist`.
- After `manifests:generate`, also `pnpm install --lockfile-only`; commit generated artefacts in the same
  change. Use `npx -y pnpm@9.15.0` if pnpm must write the lockfile; never keep an incidental rewrite of
  `packageManager` or `pnpm-workspace.yaml`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: a registered, empty, buildable `admin_search` module and the contracts file.

- [ ] T001 **Owner decision — confirmed 2026-10-16** (research R-16): run `pnpm run check:naming` against a scratch directory `packages/modules/admin_search/` and confirm it reports *"looks singular"*; add `admin_search` to `allowed_singular` in `scripts/check-naming.sh` (beside `search`)
- [ ] T002 Create the package skeleton `packages/modules/admin_search/` from the non-source scaffolding of `packages/modules/seo/` (`tsconfig.json`, `tsconfig.build.json`, `tsconfig.ui.json`, `vitest.config.ts`, `tailwind.css`, `LICENSE`, `README.md`, empty `CHANGELOG.md`), a hand-seeded `package.json` (`name: "@endora-commerce/mod-admin-search"`, the workspace's current lockstep version, `endora: { type: "module", id: "admin_search" }`) that `manifests:generate` re-renders; `src/manifest.ts` with `defineModuleManifest({ id: 'admin_search', name: 'Global search', version, dependencies: ['_i18n', 'auth', 'admin_roles', 'settings'], activation: { settingCode: 'admin_search.enabled', default: true }, settings: <group 'admin_search' + the `admin_search.enabled` boolean with name/description> })`; `src/backend/index.ts` (`registerModule(ctx)` empty, `export const entities = []`); `src/migrations/index.ts` (`export const migrations = []`); `src/admin/index.ts` (`export const contributions: AdminContributions = {}`)
- [ ] T003 Run `pnpm --filter backend run manifests:generate`, `pnpm install --lockfile-only`, `pnpm --filter backend run composer:generate`; commit exactly the artefacts reported (the package's `package.json`, `pnpm-lock.yaml`, the generated manifest index and registries under `backend/src/`); prove with `composer:check`, `manifests:check`, `pnpm install --frozen-lockfile`, `pnpm --filter @endora-commerce/mod-admin-search run build` and `pnpm --filter backend exec vitest run test/unit/db/module-graph.test.ts test/unit/kernel/`
- [ ] T004 [P] Write failing schema tests `packages/contracts/src/admin-search.test.ts`: accept/reject cases for `AdminSearchEntityTypeSchema`, `AdminSearchFieldCodeSchema`, `AdminSearchQuerySchema` (q > 100 refused; `entityTypes` CSV split), `AdminSearchHitSchema.targetRoute` (relative path with optional query accepted; `https://…` and `//host` refused), `AdminSearchResponseSchema`, `AdminSearchCapabilitySchema`, `AdminSearchConfigurationViewSchema`, `UpdateAdminSearchConfigurationRequestSchema`, `AdminSearchStoredConfigurationSchema` (version literal 1; > 20 fields refused)
- [ ] T005 Implement `packages/contracts/src/admin-search.ts` — every schema of `contracts/admin-search-api.md` and every interface of `contracts/provider-contract.md` §1 **without** the `Container name:` marker (added in T021, when the name is registered — `check:port-shape`); `export * from './admin-search.js'` in `packages/contracts/src/index.ts`; T004 green; `pnpm --filter @endora-commerce/contracts run build`
- [ ] T006 [P] Add `'admin_search'` to `MIGRATED_MODULES` in `backend/scripts/check-command-coverage.ts` (research R-13)
- [ ] T007 Phase gate: `pnpm run build:packages`, `pnpm -r run typecheck`, `pnpm -r run lint`, `pnpm --filter backend run test:unit:fast`, `pnpm --filter '!backend' run test --workspace-concurrency=1`, `pnpm run check:naming`

**Checkpoint**: the workspace installs and builds with an empty, registered `admin_search`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the registry, configuration resolution, the federated search service, the capability and
search routes, the settings and their validator, and the off-state proof. No provider yet.

**⚠️ CRITICAL**: no user-story phase starts before this one is green.

### Tests first

- [ ] T008 [P] Failing unit tests `packages/modules/admin_search/src/backend/provider-registry.test.ts`: `register` refuses a bad `entityType`, an `entityType` not prefixed by `moduleId.`, a duplicate, 0 or > 20 fields, duplicate field codes, no `defaultSelected` field, a malformed `labelKey`; `listVisible({ isPresent, permissions })` drops an absent module's providers and those whose `requiredPermission` (string and any-of array) the permission list does not satisfy; order by `weight` then `entityType`
- [ ] T009 [P] Failing unit tests `packages/modules/admin_search/src/backend/configuration-resolver.test.ts`: every rule of `data-model.md` §3 — no entry ⇒ defaults and enabled; stored subset kept in offer order; unknown codes dropped; empty after intersection ⇒ defaults; `enabled: false` respected; entries for absent providers ignored but preserved by `merge`
- [ ] T010 [P] Failing unit tests `packages/modules/admin_search/src/backend/like-pattern.test.ts`: `%`, `_`, `\` escaped for `ESCAPE '\'`; `isUuid` true for a v4 UUID in any case, false otherwise
- [ ] T011 [P] Failing unit tests `packages/modules/admin_search/src/backend/search-service.test.ts` with in-memory fake providers: below minimum ⇒ no provider called and `belowMinimumLength: true`; providers run concurrently (two 200 ms fakes finish in < 350 ms); a fake exceeding the deadline ⇒ `timed_out`, a throwing fake ⇒ `failed`, the others `ok`; a `ModuleDisabledError` from a fake is **re-thrown**; empty-hit groups omitted; `entityTypes` narrows; `limit` defaults to the setting and is clamped to 25; disabled-by-configuration types not called; `fields` passed are the resolved ones; group labels resolved through a fake `AdminI18nTranslatePort`
- [ ] T012 [P] Failing unit tests `packages/modules/admin_search/src/backend/settings-validator.test.ts`: `admin_search.minimum_query_length` 2–10 integers only; `admin_search.results_per_entity` 1–10; `admin_search.entity_fields` shape, duplicates, not-offered field for a present provider, enabled-with-no-fields — each refused with `VALIDATION_FAILED` details; an absent provider's entry accepted
- [ ] T013 [P] Failing contract test `backend/test/contract/admin_search/search-api.test.ts`: with a fixture provider registered through the harness container's `adminSearchProviderRegistry` (module id of an always-present module, e.g. `catalog.fixture_thing`), `GET /api/v1/admin/global-search/capability` and `GET /api/v1/admin/global-search` answer the schemas; 401 without a session; 400 for q > 100; short q ⇒ 200 with `belowMinimumLength`; a fixture requiring a permission the caller lacks is absent from both capability and results
- [ ] T014 [P] Failing integration test `backend/test/integration/admin_search/off-state.test.ts` (model: `backend/test/integration/quote_requests/off-state.test.ts`): positive control first, then `expectModuleAbsent(h, 'admin_search', { routes: [capability, search], adminPresence: { cookies: admin }, settingWrite: { code: 'admin_search.results_per_entity', value: 4, cookies: admin } })`, then full restoration

### Implementation

- [ ] T015 Implement `packages/modules/admin_search/src/backend/like-pattern.ts`; T010 green
- [ ] T016 Implement `packages/modules/admin_search/src/backend/provider-registry.ts` (`AdminSearchProviderRegistry implements AdminSearchProviderRegistryPort`, presence probe injected — default always-present for unit tests, as `PromptActionBulkProgressRegistry` does); T008 green
- [ ] T017 Implement `packages/modules/admin_search/src/backend/configuration-resolver.ts` (`resolve(stored, providers)`, `merge(stored, submitted, presentProviders)`); T009 green
- [ ] T018 Implement `packages/modules/admin_search/src/backend/search-service.ts` — fan-out with `PROVIDER_DEADLINE_MS = 1500`, per-provider `AbortController`, the narrow tolerance `catch` whose first line is `rethrowIfModuleDisabled(error)` with the R-11 comment, request-id logging on failure, no logging of the text; T011 green
- [ ] T019 Implement `packages/modules/admin_search/src/backend/settings-validator.ts` (`SettingWriteValidator` for the three codes, `contributorModuleId: 'admin_search'`); T012 green
- [ ] T020 Complete `packages/modules/admin_search/src/manifest.ts` for this phase: the three further settings of `data-model.md` §1 (`entity_fields` with `hidden: true`) with English names and descriptions; `docs: { dir: 'docs' }`. **No** `i18n` declaration, permission or action yet — the module has no user-facing key until T066 (`check:bundle-pairing`: a module with no strings owes no bundle) (nothing enforces or routes to them until Phases 8–10 — `permission-inventory.test.ts` sweeps both directions)
- [ ] T021 Implement `packages/modules/admin_search/src/backend/routes.ts` (capability + search, `requireAdmin()` as `preHandler`, `Cache-Control: private, no-store`) and compose in `packages/modules/admin_search/src/backend/index.ts`: `ctx.di.register({ adminSearchProviderRegistry: … })` (plain register, **not** `providePort` — the reason comment from `prompt_actions/src/backend/index.ts:97`), the services, `ctx.routes(…)`, and a contribution-only `ctx.onBoot` pushing the validator into `lazyPort<SettingWriteValidatorRegistryPort>(ctx, 'settingWriteValidatorRegistry')` (the `seo` shape, with its comment on why it owes no presence probe); add the `Container name: adminSearchProviderRegistry. Owner: admin_search.` marker to `packages/contracts/src/admin-search.ts`; rebuild contracts and the module; T013 green
- [ ] T022 [P] Add `packages/modules/admin_search/README.md` content (what the package is, that it owns no table, the provider contract it hosts, a pointer to the module docs page) and confirm `check:test-ownership` reports no `admin_search` file under `backend/test` that is harness-free
- [ ] T023 [P] Write `packages/modules/admin_search/docs/admin-search.md` (front matter `title` + one-sentence `description`; *What it does*, *Switching it on and off*, *Settings*, placeholders for *Configuring searchable fields* and *Permissions*) and its Polish copy per `docs/docs/contributing/documentation-i18n.md`; no relative link to a sibling module or the site tree
- [ ] T024 Run `composer:generate`, `manifests:generate`, `pnpm install --lockfile-only`; T014 green; `pnpm --filter backend run check:off-state-coverage`, `check:port-dependencies`, `check:port-shape`, `check:port-catches`, `check:entry-presence`, `check:container-imports`, `check:module-docs`, `check:docs-translations`, `check:test-ownership`
- [ ] T025 Phase gate: quickstart.md § 6 block; report every result with its output

**Checkpoint**: `admin_search` is installed, toggleable, absent when off, and searches nothing yet.

---

## Phase 3: User Story 1 — Providers for Orders, Quote Requests, Sales Opportunities (Priority: P1) 🎯 MVP

**Goal**: three record types answer global search with their owners' list visibility.

**Independent Test**: `GET /api/v1/admin/global-search?q=<org name>` returns Orders, Quote Requests and
Sales Opportunities groups for a platform admin; a sales representative sees only their organizations'.

### Orders

- [ ] T026 [P] [US1] Failing unit test `packages/modules/orders/src/backend/admin-search-provider.test.ts`: descriptor (`orders.order`, `orders:read`, weight 100, icon `Receipt`, fields and defaults of `data-model.md` §5, `number` and `billingTaxId` identifiers); every `labelKey` present in both bundles; row → hit mapping (title business id, subtitle organization · placed date · total, localized status label, `targetRoute` `/orders/<id>`)
- [ ] T027 [P] [US1] Failing integration test `backend/test/integration/admin_search/orders-provider.test.ts`: each field alone matches its seeded order and no other; exact number ranks first, then prefix, then contains; UUID text finds by id with only `organizationName` selected; `%`/`_` literal; `limit + 1` ⇒ `hasMore`; a sales representative with one assigned organization never receives another organization's order
- [ ] T028 [US1] Add a field-aware read `searchForAdmin(query, scope)` to `packages/modules/orders/src/backend/services/order-list-service.ts` (one statement; organization and customer id lookups through the existing `organizationDetails.searchIdsByName` / `customerAccountRead.searchIdsByName`; scope from `ordersAdminScopeResolver` as `list` takes it; rank `CASE` + `updated_at desc`; `limit + 1`)
- [ ] T029 [US1] Create `packages/modules/orders/src/backend/admin-search-provider.ts`; add a **separate** contribution-only `ctx.onBoot` in `packages/modules/orders/src/backend/index.ts` pushing it into `lazyPort<AdminSearchProviderRegistryPort>(ctx, 'adminSearchProviderRegistry')`; add the `contributes-to` entry (contracts/provider-contract.md §4) to `packages/modules/orders/src/manifest.ts` `nonBindingDependencies`; add the `adminSearch.*` keys (contracts/admin-ui.md §3) to `packages/modules/orders/i18n/{en,pl}.json`; rebuild; T026, T027 green; `check:port-dependencies`, `check:entry-presence`

### Quote Requests

- [ ] T030 [P] [US1] Failing unit test `packages/modules/quote_requests/src/backend/admin-search-provider.test.ts` (descriptor `quote_requests.quote_request`, `rfqs:handle`, weight 200, `ClipboardList`; fields; labels; mapping to `/quote-requests/<id>` with localized status)
- [ ] T031 [P] [US1] Failing integration test `backend/test/integration/admin_search/quote-requests-provider.test.ts` (as T027, plus: the rows a sales representative receives equal the subset `GET /api/v1/admin/quote-requests` shows them for the same seed)
- [ ] T032 [US1] Add `searchForAdmin(ctx, query)` to `packages/modules/quote_requests/src/backend/services/rfq-admin-service.ts` — scope **in the statement** (the list's own scope rule expressed as a `where` clause through `orgConstraintFor`, plus the ambient `@OrgScoped` filter), never the load-all-then-filter shape of `listAll` (owner/architect note, research R-16a); same exclusions as the admin list
- [ ] T033 [US1] Create `packages/modules/quote_requests/src/backend/admin-search-provider.ts`; contribution-only boot hook in `packages/modules/quote_requests/src/backend/index.ts`; manifest `contributes-to`; bundle keys; rebuild; T030, T031 green

### Sales Opportunities

- [ ] T034 [P] [US1] Failing unit test `packages/modules/crm/src/backend/admin-search-provider.test.ts` (descriptor `crm.opportunity`, `crm:read`, weight 300, `CircleDollarSign`; fields; labels; mapping to `/crm/opportunities/<id>` with the status name)
- [ ] T035 [P] [US1] Failing integration test `backend/test/integration/admin_search/crm-provider.test.ts` (as T027)
- [ ] T036 [US1] Add `searchForAdmin(query)` to `packages/modules/crm/src/backend/services/opportunity-service.ts`, reusing the `q` branch's escaping and organization lookup (line ~486) with field selection
- [ ] T037 [US1] Create `packages/modules/crm/src/backend/admin-search-provider.ts`; contribution-only boot hook in `packages/modules/crm/src/backend/index.ts`; manifest `contributes-to`; bundle keys; rebuild; T034, T035 green

**Checkpoint**: three record types searchable through the API.

---

## Phase 4: User Story 1 — Providers for Organizations, Customers, Products, Categories (Priority: P1)

**Goal**: the remaining four record types. Parallel with Phase 3 (different packages).

### Organizations

- [ ] T038 [P] [US1] Failing unit test `packages/modules/organizations/src/backend/admin-search-provider.test.ts` (descriptor `organizations.organization`, `['customers:read','customers:manage']`, weight 400, `Building2`; fields `name` ✓, `taxId` ✓★, `legalName`; mapping to `/organizations/<id>`, subtitle tax ID · city, status)
- [ ] T039 [P] [US1] Failing integration test `backend/test/integration/admin_search/organizations-provider.test.ts`: `lodz` finds `Łódź …` through `name`; personal organizations never returned; soft-deleted never; **owner answer to Q2**: for a sales representative the visible set equals what `GET /api/v1/admin/organizations?q=` shows them for the same text (not scope-limited), their assigned organizations come first, then the rest, and the order within each group is stable (identifier rank, then most recent change, then id) across repeated searches; a platform admin gets one group
- [ ] T040 [US1] Add `searchForAdmin(query)` to the organizations module (a new `packages/modules/organizations/src/backend/services/organization-admin-search.service.ts`): `name_search` with `normalizeOrganizationName`, `tax_id`, `legal_name`; `is_personal = false`, `deleted_at is null` (the Organizations list's rule, not scope-limited — owner Q2); for an `allowed-set` context an `ORDER BY` key ranking `id = any(assigned)` first, from `orgConstraintFor()` in `@endora-commerce/platform/tenancy`; stable tie-break on `id`
- [ ] T041 [US1] Create `packages/modules/organizations/src/backend/admin-search-provider.ts`; contribution-only boot hook in `packages/modules/organizations/src/backend/index.ts`; manifest `contributes-to`; bundle keys; rebuild; T038, T039 green

### Customers

- [ ] T042 [P] [US1] Failing integration test `backend/test/integration/admin_search/customers-provider.test.ts`: through `customerAccountAdminSearchPort`, `qFields: ['email']` does not match by name and `['name']` not by e-mail; `excludeDeleted: true` hides deleted and anonymized accounts; omitting both keeps today's list behaviour (regression guard for `GET /api/v1/admin/customers`); then, through the search API, a sales representative receives only customers their customer list shows
- [ ] T043 [US1] Add `qFields?: ('email' | 'name')[]` and `excludeDeleted?: boolean` to `CustomerAccountAdminSearchCriteria` in `packages/contracts/src/customer-accounts.ts` (doc comments: absent ⇒ today's behaviour); honour both in `packages/modules/customer_accounts/src/backend/services/customer-account-lifecycle-ports.ts` `search`; rebuild contracts and `customer_accounts`
- [ ] T044 [P] [US1] Failing unit test `packages/modules/customers/src/backend/admin-search-provider.test.ts` (descriptor `customers.customer`, `customers:read`, weight 500, `Users`; fields `email` ✓★, `name` ✓; mapping to `/customers/<id>`, subtitle e-mail · organization name, status)
- [ ] T045 [US1] Create `packages/modules/customers/src/backend/admin-search-provider.ts` over `customerAccountAdminSearchPort` with the same scope the admin list passes (`resolveModerationActor`'s `allowedOrganizationIds`, `null` for a platform admin) and organization names through `organizationDetailsPort`; contribution-only boot hook in `packages/modules/customers/src/backend/index.ts`; manifest `contributes-to`; bundle keys; rebuild; T042 (integration half), T044 green

### Products and Categories

- [ ] T046 [P] [US1] Failing unit tests `packages/modules/catalog/src/backend/admin-search-provider.test.ts` for both descriptors (`catalog.product`: `catalog:read`, 600, `Package`, fields `sku` ✓★, `name` ✓, `slug` ★, `quickSearchAttributes`; `catalog.category`: 700, `Layers`, `name` ✓, `slug` ✓★, target `/catalog/categories?focus=<id>`, subtitle the parent path); name shown in the request language with fallback
- [ ] T047 [P] [US1] Failing integration test `backend/test/integration/admin_search/catalog-providers.test.ts`: each field; a name in another language matches; inactive and draft products found with status; soft-deleted never; `quickSearchAttributes` matches only attributes flagged `quickSearchable`
- [ ] T048 [US1] Create `packages/modules/catalog/src/backend/services/catalog-admin-search.service.ts` (`searchProducts`, `searchCategories`; `quickSearchable` keys through the module's own `CatalogAttributeReadPort.listByFlag`, as `catalog-quick-search.service.ts` does; category path from the module's own category read)
- [ ] T049 [US1] Create `packages/modules/catalog/src/backend/admin-search-provider.ts` (two providers); one contribution-only boot hook in `packages/modules/catalog/src/backend/index.ts` registering both; manifest `contributes-to` (`catalog` is `nonDeactivatable` — the reason says why `dependencies` would make `admin_search.enabled` a dead switch); bundle keys; rebuild; T046, T047 green

**Checkpoint**: all seven record types searchable through the API.

---

## Phase 5: User Story 1 — Visibility matrix, provider off-states, performance (Priority: P1)

- [ ] T050 [P] [US1] Contract test `backend/test/contract/admin_search/provider-conformance.test.ts` per contracts/provider-contract.md §5: for every provider in the composed registry — invariants, labels in `en` and `pl`, `requiredPermission` equal to the code the type's list GET route enforces (a seven-row table citing each route file), literal wildcard handling, `limit` respected
- [ ] T051 [P] [US1] Integration test `backend/test/integration/admin_search/visibility-matrix.test.ts` (SC-003): one seed matching all seven types; platform admin sees seven groups; sales representative with one assigned organization sees only in-scope rows in every group except Organizations, which equal the Organizations list's rows with the assigned organization first (owner Q2), and the capability omits nothing they may read; for each of `orders:read`, `rfqs:handle`, `crm:read`, `customers:read`, `catalog:read` a role lacking it gets no corresponding group(s) and the capability omits them
- [ ] T052 [P] [US1] Integration test `backend/test/integration/admin_search/providers-off-state.test.ts` (SC-005): for each of `crm`, `quote_requests`, `customers` — on: group present; off (deactivated while platform-available): group and capability entry absent, other groups unaffected, no restart; on again: present
- [ ] T053 [P] [US1] Perf bench `backend/test/perf/admin_search/fan-out.bench.ts` (`// perf-weight:` header; corpus at the spec's reference volume scaled by `PERF_CORPUS_SIZE`): p95 of a seven-type fan-out for an identifier fragment, a name fragment and a no-match text < 800 ms; record `explain (analyze, buffers)` of the slowest provider statement in the bench output. If it fails, **stop and report** with the plans — the remedy (trigram indexes per owner) is a follow-up, not this feature (research R-10)
- [ ] T054 [US1] Regenerate `backend/test/fixtures/openapi-baseline.json` with `UPDATE_OPENAPI_BASELINE=1`; phase gate: quickstart.md § 6 plus the perf bench

**Checkpoint**: the API is complete and safe for US1.

---

## Phase 6: User Story 1 — Records in the command palette (Priority: P1) — admin UI

**Goal**: the palette shows record groups (contracts/admin-ui.md §1).

- [ ] T055 [P] [US1] Failing tests `admin/test/components/AppShell.palette-records.test.tsx` (model: `AppShell.palette.test.tsx`, `<StrictMode>`, mocked fetch): no search request below the minimum length; one request per 250 ms pause; a superseded request is aborted and its late response ignored; groups render after *Actions* in server order with server labels; ↓/↑/Enter reach records in one cursor sequence and Enter navigates to `targetRoute`; status badge text; `hasMore` header text; a `timed_out` group renders a non-selectable row the cursor skips; "Searching…" row while loading; "See all results for “q”" row navigates to `/global-search?q=…`; a capability 503 or empty `entityTypes` hides records for that open and a re-open re-probes; the live region announces the count; `axe-core` reports 0 violations with results shown
- [ ] T056 [P] [US1] Implement `packages/admin-shell/src/lib/global-search/api.ts` (schema-parsed fetchers, `AbortSignal`)
- [ ] T057 [US1] Implement `packages/admin-shell/src/lib/global-search/useGlobalSearch.ts` (per-open capability probe, debounce, abort, stale-response guard)
- [ ] T058 [US1] Extend `CommandPalette` in `packages/admin-shell/src/components/AppShell.tsx`: `PaletteItem` `'Records'` group with `groupKey`/`groupLabel`, non-selectable status rows excluded from `items` cursor indexing, the see-all row, the live region; no module-id literal and no `useTranslation('<module>')`; T055 green
- [ ] T059 [P] [US1] Add the five `appShell.palette.records.*` keys to `packages/modules/_i18n/i18n/en.json` and `pl.json`
- [ ] T060 [US1] Rebuild `@endora-commerce/admin-shell` and `mod-i18n`; run `pnpm --filter backend run check:admin-zones` and `i18n:hardcoded`; run the existing `admin/test/components/AppShell.*.test.tsx` files unchanged and green

**Checkpoint**: User Story 1 works end to end except the category focus.

---

## Phase 7: User Story 1 — Category focus in the catalog tree (Priority: P1) — admin UI

- [ ] T061 [P] [US1] Failing test `admin/test/modules/catalog/CategoriesTree.focus.test.tsx`: `?focus=<id>` of a nested category expands its ancestors, marks the row `aria-current="true"`, scrolls it into view and focuses it once; an unknown id changes nothing
- [ ] T062 [US1] Implement the `focus` parameter in `packages/modules/catalog/src/admin/pages/CategoriesTree.tsx` (contracts/admin-ui.md §5); rebuild `catalog`; T061 green

**Checkpoint**: User Story 1 complete — the MVP. Walk quickstart.md § 2 by hand.

---

## Phase 8: User Story 2 — Configuration API (Priority: P2)

**Goal**: read and write the search configuration with allow-list enforcement, audit and versioning.

- [ ] T063 [P] [US2] Failing unit tests `packages/modules/admin_search/src/backend/configuration-service.test.ts`: `view(language)` lists present providers only with `selected`/`defaultSelected`/`customized`; `update` validates all submitted entries and reports every failure with its path; merge keeps absent providers' entries and unsubmitted entries; an entry with neither `enabled` nor `fields` restores defaults; writes through a fake `SettingsAdminPort` with the given `expectedVersion` and actor
- [ ] T064 [P] [US2] Failing contract test `backend/test/contract/admin_search/configuration-api.test.ts`: 403 without `admin_search:configure` on GET and PUT (gate before body validation: an invalid body still answers 403); 422 for a not-offered field, an unknown present type, duplicates, enabled-with-no-fields; 409 `VERSION_CONFLICT` on a stale `expectedVersion`; an audit row with before/after after a save (FR-025); a save by admin A changes admin B's very next search (SC-004); a write to `admin_search.entity_fields` through the generic Settings API with a not-offered field is refused (validator); `crm` switched off ⇒ its entry absent from the view and preserved across a save, applied again after `crm` is back on (FR-027)
- [ ] T065 [US2] Implement `packages/modules/admin_search/src/backend/configuration-service.ts` over `lazyPort<SettingsAdminPort>(ctx, 'settingsAdminService')` and the kernel settings read port; T063 green
- [ ] T066 [US2] Add `GET`/`PUT /api/v1/admin/global-search/configuration` to `packages/modules/admin_search/src/backend/routes.ts` gated by `requireAdmin('admin_search:configure')` as `preHandler`; declare `permissions: [{ code: 'admin_search:configure', label: 'Configure global search' }]` and `i18n: { bundlesDir: 'i18n' }` in `packages/modules/admin_search/src/manifest.ts`; create `packages/modules/admin_search/i18n/en.json` and `pl.json` (flat) with `adminRoles.permission.admin_search:configure`; rebuild; T064 green
- [ ] T067 [US2] `pnpm --filter backend exec vitest run test/contract/admin_users/permission-inventory.test.ts test/unit/_i18n/registered-bundles-shape.test.ts`; `check:bundle-pairing`; regenerate the OpenAPI baseline; `check:command-coverage -- --strict`; phase gate

**Checkpoint**: configuration works through the API.

---

## Phase 9: User Story 2 — Configuration screen (Priority: P2) — admin UI

- [ ] T068 [P] [US2] Failing tests `admin/test/modules/admin_search/GlobalSearchConfigurationPage.test.tsx` (`<StrictMode>`): renders one card per entity with translated field labels and "default" text; toggling fields and *Include* updates the draft; an included type with no field shows the inline error and disables Save; Restore defaults; Save sends the merged request with `expectedVersion`; 409 opens the reload dialog (`ModalDialog`, no `window.confirm`); leaving with unsaved changes asks for confirmation; 403 for a role without the permission; `axe-core` 0 violations
- [ ] T069 [P] [US2] Implement `packages/modules/admin_search/src/admin/api.ts` (configuration GET/PUT, search GET, schema-parsed)
- [ ] T070 [US2] Implement `packages/modules/admin_search/src/admin/pages/GlobalSearchConfigurationPage.tsx` (contracts/admin-ui.md §2.2, kit primitives only); add `page.configuration.*` keys to the module's `i18n/{en,pl}.json`; T068 green
- [ ] T071 [US2] Contribute the `/global-search/configuration` route and the `system` nav entry in `packages/modules/admin_search/src/admin/index.ts`; declare the manifest action `open-global-search-configuration` (contracts/admin-ui.md §2.3) with `actions.openConfiguration.*` keys; rebuild; `check:action-route-permissions`, `test/unit/_i18n/registered-bundles-shape.test.ts`, `check:admin-zones`, `i18n:hardcoded`

**Checkpoint**: User Story 2 complete. Walk quickstart.md § 3.

---

## Phase 10: User Story 3 — Results page (Priority: P3) — admin UI

- [ ] T072 [P] [US3] Failing tests `admin/test/modules/admin_search/GlobalSearchPage.test.tsx` (`<StrictMode>`): `q` from the URL prefills and searches with `limit=20`; typing debounces and replaces `q` in the URL; a type chip sets `type` and narrows `entityTypes`, `aria-pressed` reflects it; below-minimum hint; loading, empty and error states; links point at `targetRoute`; unavailable group note; `axe-core` 0 violations
- [ ] T073 [US3] Implement `packages/modules/admin_search/src/admin/pages/GlobalSearchPage.tsx` (contracts/admin-ui.md §2.1); add `page.results.*` keys to `i18n/{en,pl}.json`; T072 green
- [ ] T074 [US3] Contribute the `/global-search` route (no `requiredPermission`) in `packages/modules/admin_search/src/admin/index.ts`; declare the manifest action `open-global-search` with `actions.openGlobalSearch.*` keys; rebuild; extend `backend/test/integration/admin_search/off-state.test.ts` with admin absence of both routes and both actions while off; `check:action-route-permissions`, `registered-bundles-shape.test.ts`

**Checkpoint**: User Story 3 complete. Walk quickstart.md § 4.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [ ] T075 [P] Complete `packages/modules/admin_search/docs/admin-search.md` and its Polish copy: what is searched, the seven record types and their offered fields (table), configuring fields, the two settings, permissions, switching off, what is not stored (search text), the escalation note on performance
- [ ] T076 [P] Add a short *Global search* section (which fields this module's record type offers, and its default) to `packages/modules/{orders,quote_requests,crm,organizations,customers,catalog}/docs/*.md` and their Polish copies; refer to global search by name, never by a relative link (module-documentation.md 1a)
- [ ] T077 Run `composer:generate`, `check:module-docs`, `check:docs-translations`, `check:bundle-pairing`
- [ ] T078 [P] Changesets, one per meaning (`specs/conventions/release-intent.md`; `minor`, never `major` in `0.x`): new package `@endora-commerce/mod-admin-search`; new `admin-search` exports and the two optional customer-search criteria in `@endora-commerce/contracts`; palette records in `@endora-commerce/admin-shell`; record-type providers in `mod-orders`, `mod-quote-requests`, `mod-crm`, `mod-organizations`, `mod-customers`, `mod-catalog` (+ category focus), `mod-customer-accounts`; verify with `pnpm --filter backend exec tsx scripts/check-release-intent.ts --since origin/master`
- [ ] T079 Full quickstart.md § 6 block; then `pnpm --filter backend run test` (all services, ~1 h) once on the final tip — the merge-request pipeline will not run contract/integration suites (D-198); report every failure with its output
- [ ] T080 Manual walk of quickstart.md §§ 2–4 as platform admin, sales representative and a restricted role; record anything that deviates in `research.md` under a new *Implementation notes* heading

---

## Dependencies & execution order

- **Phase 1 → Phase 2** block everything.
- **Phases 3 and 4** run in parallel (one owner module per stream); within a module, test tasks
  precede implementation. T043 (contracts change) precedes T045.
- **Phase 5** needs 3 and 4. **Phase 6** needs only Phase 2 (develop against the T013 fixture
  provider); **Phase 7** needs T049. **Phase 8** needs Phase 2; **Phase 9** needs 8; **Phase 10**
  needs 6 (see-all row) and 8's `api.ts` is shared → T069 before T073.
- **Phase 11** last.

### Parallel examples

```text
Phase 3/4 streams:  [T026–T029 orders] [T030–T033 quote_requests] [T034–T037 crm]
                    [T038–T041 organizations] [T042–T045 customers] [T046–T049 catalog]
Phase 5:            T050 ∥ T051 ∥ T052 ∥ T053
Phase 6 vs 8:       designer/UI dev on T055–T060 while backend dev does T063–T067
```

## Implementation strategy

1. **MVP = Phases 1–7** (User Story 1 with default fields): ship-able on its own — the request's core.
2. **+ Phases 8–9** (User Story 2): the configurability the product owner asked for "ideally".
3. **+ Phase 10** (User Story 3): the full results page.
4. Phase 11 before merge.

## Requirement → test

| Requirement | Test(s) |
| --- | --- |
| FR-001, FR-003, FR-005, FR-006 | T055; T051; provider unit tests T026/T030/T034/T038/T044/T046 |
| FR-002, FR-028 | T011 (below minimum), T012 (ranges), T055 (no request below minimum) |
| FR-004 | T011, T027 (`hasMore`), T055 |
| FR-007 | T055 (abort, stale guard) |
| FR-008 | T011 (timed_out/failed), T055 (unavailable row) |
| FR-009 | T027, T031, T035, T039, T042, T047 (fields, ranking, once) |
| FR-010 | T010, T027 (UUID) |
| FR-011 | T039 (`lodz` → `Łódź`) |
| FR-012 | T004 (length), T010, T027, T050 (literal wildcards) |
| FR-013 | T008, T052 |
| FR-014 | T008, T013, T051 |
| FR-015 | T027, T031, T039, T045, T051 |
| FR-015a (owner Q2: assigned organizations first) | T039, T051 |
| FR-016 | T039, T042, T047 |
| FR-017 | T018 review + T011 (no text logged — asserted on the fake logger) |
| FR-018, FR-019 | T063, T068 |
| FR-020, FR-021 | T012, T063, T064, T068 |
| FR-022 | provider unit tests (fields/defaults tables), T050 |
| FR-023, SC-004 | T064 |
| FR-024 | T064 (403), T068, T071 (`check:action-route-permissions`), permission inventory T067 |
| FR-025 | T064 (audit row) |
| FR-026 | T064 (409), T068 (reload dialog) |
| FR-027 | T009, T064 |
| FR-029, FR-030 | T055 (see-all row), T072 |
| FR-031, SC-005 | T014, T052, T074 |
| FR-032 | T050 (labels en+pl), `registered-bundles-shape.test.ts`, `check:bundle-pairing`, `i18n:hardcoded` |
| FR-033, SC-006 | T055, T061, T068, T072 (keyboard + axe) |
| SC-001 | T055 (shortcut → type → Enter navigates) + T080 manual |
| SC-002 | T053 |
| SC-003 | T051 |
