# Implementation Plan: Admin global search

**Branch**: `feat/150-admin-global-search` | **Date**: 2026-10-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/150-admin-global-search/spec.md` (clarified by the
owner on 2026-10-16: module id confirmed, Q1 and Q3 defaults kept, **Q2 changed** — see spec
*Clarifications*).

## Summary

The admin's ⌘K palette — which the sidebar search field already opens — learns to find records of
seven types, and a configuration screen decides which fields each type is searched by. The
approach, with evidence and rejected alternatives in [research.md](./research.md):

- **A new, switchable module `admin_search`** hosts the capability (R-1): a provider registry, a
  federated `GET /api/v1/admin/global-search`, a capability probe, the configuration endpoints, a
  results page and a configuration page. It owns **no table**.
- **Owners contribute providers** through an ungated `contributes-to` registry,
  `adminSearchProviderRegistry` — the `promptActionToolRegistry` idiom (R-2). Seven providers in six
  modules (`orders`, `quote_requests`, `crm`, `organizations`, `customers`, `catalog`×2), each built
  over its own module's services and answering with a bounded, live PostgreSQL read under the
  request's tenant context (R-3). The host never names a provider module.
- **Visibility is server-side and three-layered** (R-4): presence at enumeration (`effectiveState`),
  per-type permission (the code the type's own list enforces), and scope inside each provider with
  the same rule as its admin list.
- **Configuration is one hidden `json` Setting** owned by `admin_search`, written through
  `settingsAdminService` — audit, optimistic version, cache drop and off-state refusal come with it
  (R-5). Owners declare the field **allow-list**; it is enforced on the route, by a
  `SettingWriteValidator`, and on read (R-6).
- **The shell stays module-agnostic** (R-8): it probes a capability endpoint per palette open and
  renders server-resolved strings, so it holds no `admin_search` literal and no module bundle.
- **No new runtime dependency, no migration, no new error code, no new index** — the reference-volume
  perf test decides whether trigram indexes are ever needed (R-10).

## Technical Context

**Language/Version**: TypeScript 5.x `strict`, Node.js ≥ 22.17, ESM
**Primary Dependencies**: Fastify, MikroORM (PostgreSQL), Zod (backend); React 19 + Vite + react-router-dom 7 through `@endora-commerce/admin-kit` and `@endora-commerce/admin-shell` (admin) — **no new runtime dependency**
**Storage**: PostgreSQL — no new table or column; three new rows in the existing `settings` store owned by `admin_search` (plus its activation row); reads of existing tables by their owners only
**Testing**: Vitest — co-located unit tests in `packages/modules/admin_search/src/**` and beside each provider; `backend/test/contract/admin_search/` and `backend/test/integration/admin_search/` for server-bound tests; `backend/test/perf/admin_search/fan-out.bench.ts` (run by `test:perf`) for SC-002; `admin/test/components/AppShell.palette-records.test.tsx` and `admin/test/modules/admin_search/` for UI, renders in `<StrictMode>`, `axe-core` (already an `admin` devDependency since feature 147) for SC-006
**Target Platform**: Linux server (backend) and the admin SPA in evergreen browsers
**Project Type**: web application — monorepo with `backend/`, `admin/`, `packages/`
**Performance Goals**: full seven-type fan-out p95 < 800 ms server-side at the spec's reference volume (SC-002); palette shows records within 1 s of typing pausing
**Constraints**: per-provider deadline 1 500 ms; `limit` ≤ 10 in the palette, ≤ 25 on the page; minimum text 2–10 (default 3); text ≤ 100 chars; 250 ms client debounce with abort; no search text persisted
**Scale/Scope**: 1 new module (0 tables, 4 settings, 1 permission, 2 palette actions, 1 nav entry, 4 routes, 2 pages); 7 providers in 6 modules; 1 contracts file + 2 additive fields on one existing criteria type; 1 shell hook + palette changes; 5 core keys; 7 module bundles touched; 7 docs pages × 2 languages; 0 migrations; 0 error codes

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design — same verdict.*

| Principle | Verdict | How the design meets it |
| --- | --- | --- |
| **I. Modular architecture (NN)** | Pass | Each record type's query, scope rule, field list and labels live in the module that owns the records; `admin_search` owns the registry, the configuration and the screens. The only cross-module seams are the contracts-typed registry (`contributes-to`) and existing published ports (`organizationDetailsPort`, `customerAccountReadPort`, `customerAccountAdminSearchPort`, `settingsAdminService`, `permissionService`, `adminI18nService`). No table read across modules, no internals imported. Detaching `admin_search` drops every push (`contribution-sinks.ts`); detaching a provider removes one group. |
| **II. API-first** | Pass | `packages/contracts/src/admin-search.ts` (schemas + provider interfaces) and its test are Phase 1, before any route ([contracts/admin-search-api.md](./contracts/admin-search-api.md), [contracts/provider-contract.md](./contracts/provider-contract.md)). The one change to an existing contract is additive (two optional criteria fields). |
| **III. TDD (NN)** | Pass | Every implementation task in [tasks.md](./tasks.md) follows the failing test it turns green; § *Requirement → test* maps FR-001…FR-033 and SC-001…SC-006. |
| **IV. YAGNI, minimal dependencies** | Pass | No dependency, no table, no index, no cache, no error code. Trigram indexes and Meilisearch are documented escalation paths gated on the SC-002 measurement, not built. |
| **V. TypeScript everywhere** | Pass | Zod at every new HTTP boundary; provider types in contracts; the shell parses responses with the same schemas. |
| **VI. Naming (NN)** | **Pass (owner decision recorded)** | Routes kebab-case (`/global-search`), settings snake_case, JSON camelCase, entity types `<module>.<snake>`. The module id `admin_search` is refused by `check:naming`'s plural heuristic; the owner confirmed (2026-10-16) adding it to `allowed_singular` beside `search` (research R-16, resolved). |
| **VII. SEO, performance** | N/A (storefront) / Pass (perf) | Admin only. Performance budget SC-002 is a test, not an assumption. |
| **VIII. English (NN)** | Pass | Code, comments, specs, docs in English; Polish only in bundles and the Polish docs tree. |
| **IX. UI reuse** | Pass | Palette rows reuse `PaletteItem`, `resolveIcon`, the existing cursor loop; pages compose kit `Card`, `Input`, `Checkbox`, `Label`, `Badge`, `Button`, `SaveButtonGroup`, `ModalDialog`. No new kit component. |
| **X. Queue consumers** | N/A | Nothing asynchronous: searches are request-bound reads. |
| **XI. Tenant isolation (NN)** | Pass | Providers run inside the admin request, under its tenant context; `@OrgScoped` reads are filtered by the guard; the one `@GlobalEntity` with an organization meaning (Organization) follows its own admin list's visibility exactly (owner answer to Q2) and only *ranks* the admin's assigned organizations first through `orgConstraintFor()` — no row the Organizations list would hide is returned; owners reuse their list's scope logic (orders' `ordersAdminScopeResolver`, customers' moderation actor). No "no-organization" path. Proven by the permission/scope matrix test (SC-003). |
| **XII. Sales-channel scoping (NN)** | N/A, stated | Admin lists are cross-channel and so is admin lookup (research R-19); no storefront or channel-resolved read is added. |
| **XIII. Command Bus auditing (NN)** | Pass | The only write — the configuration — goes through `settingsAdminService`, which records the audit row with `stateBefore` (the CRM board-card precedent); `admin_search` joins `MIGRATED_MODULES` in `check-command-coverage.ts`. Searches are reads. |
| **XIV. Entity-agnostic extensibility** | Pass | Any module adds a record type by contributing a provider — no host change. Custom fields are not searchable in this release (an owner may add them to its offer later). |
| **XV. Untouched core / overlay** | Pass | An overlay module can contribute a provider through the same registry. |
| **XVI. Command palette** | Pass | Two palette actions (`open-global-search`, `open-global-search-configuration`); the capability *is* the palette. |
| **XVII. Operator-toggleable modules (NN)** | Pass | `admin_search` declares `activation: { settingCode: 'admin_search.enabled', default: true }`; routes via `ctx.routes`; palette hides records on a failed probe; settings not editable while off. Providers' contributions are filtered at enumeration, so switching `crm`/`quote_requests`/`customers` off removes their groups without restart. Off-state tests for `admin_search` and the three switchable providers. |

**Cross-cutting checklist** (agent prompt § Method 4):

- **Admin permission manifest** — new `admin_search:configure` in `admin_search`'s manifest, label in its
  bundle (en + pl), enforced on two routes and declared on the configuration route, nav entry and
  palette action; `permission-inventory.test.ts` and `check:action-route-permissions` cover it. No other
  new code: providers reuse the read codes their lists enforce.
- **Command palette** — two manifest actions (contracts/admin-ui.md §2.3) plus the records groups.
- **i18n pl + en** — `admin_search` bundle; provider keys in six module bundles; five `core` keys;
  labels resolved server-side through `adminI18nService`.
- **Settings** — four settings (activation, two numbers, one hidden json); no secret involved.
- **Auditing** — R-13.
- **Tenant scoping** — R-4, XI row above.
- **Redis cache invalidation** — nothing new to invalidate (R-12): configuration rides the settings cache
  (dropped inside every write), presence rides the existing `b2b:module:state-changed` pub/sub, and
  results are never cached.

## Project Structure

### Documentation (this feature)

```text
specs/150-admin-global-search/
├── spec.md
├── plan.md                          # this file
├── research.md                      # R-1 … R-21
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
├── contracts/
│   ├── admin-search-api.md          # HTTP + Zod
│   ├── provider-contract.md         # registry, provider obligations, wiring
│   └── admin-ui.md                  # palette, pages, i18n keys, icons, category focus
└── tasks.md
```

### Source Code (repository root)

```text
packages/contracts/src/
├── admin-search.ts                  # NEW — schemas, provider + registry interfaces
├── admin-search.test.ts             # NEW
├── customer-accounts.ts             # + CustomerAccountAdminSearchCriteria.qFields?, .excludeDeleted?
└── index.ts                         # + export

packages/modules/admin_search/       # NEW package @endora-commerce/mod-admin-search
├── package.json, tsconfig*.json, vitest.config.ts, tailwind.css, LICENSE, README.md, CHANGELOG.md
├── src/manifest.ts                  # id, deps, activation, settings, permission, actions, i18n, docs
├── src/backend/index.ts             # registerModule: registry, services, routes, validator hook
├── src/backend/provider-registry.ts (+ .test.ts)
├── src/backend/configuration-resolver.ts (+ .test.ts)
├── src/backend/search-service.ts (+ .test.ts)        # fan-out, deadline, isolation
├── src/backend/configuration-service.ts (+ .test.ts) # view, validate, merge, write
├── src/backend/settings-validator.ts (+ .test.ts)
├── src/backend/like-pattern.ts (+ .test.ts)          # LIKE escaping, internal (see note below)
├── src/backend/routes.ts
├── src/migrations/index.ts          # export const migrations = []
├── src/admin/index.ts               # contributions
├── src/admin/pages/GlobalSearchPage.tsx
├── src/admin/pages/GlobalSearchConfigurationPage.tsx
├── src/admin/api.ts
├── i18n/{en,pl}.json
└── docs/admin-search.md

packages/modules/{orders,quote_requests,crm,organizations,customers,catalog}/
├── src/backend/admin-search-provider.ts (+ .test.ts)   # catalog: two providers in one file
├── src/backend/index.ts             # + contribution-only boot hook
├── src/backend/services/…           # field-aware search method on the owner's own service
├── src/manifest.ts                  # + nonBindingDependencies contributes-to
├── i18n/{en,pl}.json                # + adminSearch.* keys
└── docs/<module>.md                 # + "Global search" section

packages/modules/customer_accounts/src/backend/services/customer-account-lifecycle-ports.ts
                                     # honour qFields / excludeDeleted
packages/modules/catalog/src/admin/pages/CategoriesTree.tsx   # ?focus=<id>

packages/admin-shell/src/
├── lib/global-search/api.ts         # NEW
├── lib/global-search/useGlobalSearch.ts   # NEW
└── components/AppShell.tsx          # CommandPalette: Records groups, see-all row, live region

packages/modules/_i18n/i18n/{en,pl}.json    # + appShell.palette.records.*

scripts/check-naming.sh                      # + admin_search in allowed_singular (owner decision)
backend/scripts/check-command-coverage.ts    # + 'admin_search' in MIGRATED_MODULES
backend/src/…generated…                      # composer:generate / manifests:generate outputs
backend/test/fixtures/openapi-baseline.json  # regenerated
backend/test/contract/admin_search/{search-api,configuration-api,provider-conformance}.test.ts
backend/test/integration/admin_search/{visibility-matrix,off-state,providers-off-state}.test.ts
backend/test/perf/admin_search/fan-out.bench.ts
admin/test/components/AppShell.palette-records.test.tsx
admin/test/modules/admin_search/{GlobalSearchPage,GlobalSearchConfigurationPage}.test.tsx
admin/test/modules/catalog/CategoriesTree.focus.test.tsx
docs/i18n/pl/…/modules/{admin-search,orders,quote-requests,crm,organizations,customers,catalog}.md
.changeset/*.md                               # one per meaning
```

**Note on the LIKE escape helper**: providers need the same escaping; it is passed to them already
done (`query.likeEscaped`, contracts/provider-contract.md §1), so no provider imports a helper from
`admin_search` (that would be a module-boundary reach). The helper is internal to `admin_search`.

**Structure Decision**: the existing monorepo layout. Each provider is a file in its owner's
`src/backend/`, composed by the owner's `index.ts`; `check:port-dependencies` reads registrations only
from the file exporting `registerModule` (`specs/143-crm-sales-opportunities/research.md` N-6), so
nothing is split into `compose/` files.

## Migrations

**None.** No module gains a table, column or index (research R-3, R-10). If the SC-002 perf test
fails at the reference volume, the remedy is a follow-up per owning module, scaffolded with
`pnpm --filter backend run migration:new -- --module <owner> --name admin_search_trgm` — never in
`admin_search`, which owns no table.

## Phasing

Eleven phases, detailed in [tasks.md](./tasks.md). **Backend** and **admin UI** phases are marked so UI
phases can be routed to the designer.

| # | Phase | Kind | Story |
| --- | --- | --- | --- |
| 1 | Setup: naming decision, empty registered module, contracts | backend (shared) | all |
| 2 | Foundational: registry, resolver, search service, routes, settings, activation, off-state | backend | all |
| 3 | US1 providers: orders, quote_requests, crm | backend | US1 |
| 4 | US1 providers: organizations, customers (+ customer_accounts criteria), catalog ×2 | backend | US1 |
| 5 | US1 visibility matrix, provider off-states, perf | backend | US1 |
| 6 | US1 palette records in the shell | admin UI | US1 |
| 7 | US1 category focus in the catalog tree | admin UI | US1 |
| 8 | US2 configuration API + validator hardening | backend | US2 |
| 9 | US2 configuration screen | admin UI | US2 |
| 10 | US3 results page | admin UI | US3 |
| 11 | Docs (en + pl), changesets, CI gate run locally | docs / verification | all |

Dependencies: 1 → 2 → {3, 4} → 5; 2 → 6 (6 can start against a stub provider registered in a test);
4 → 7; 2 → 8 → 9; 6 → 10; everything → 11. Phases 3 and 4 are parallel by module (different packages,
different owners' files); `packages/contracts/src/customer-accounts.ts` is touched only in Phase 4.

## Complexity Tracking

No constitution violation to justify and **no new runtime dependency**. One item is recorded rather
than justified: the module id needs a naming-check exemption (Principle VI tooling, not the principle —
`search` already holds the same exemption), confirmed by the owner on 2026-10-16 (research R-16).

## Handoff to `endora-commerce-dev`

- T001's owner check on the module id is answered (confirmed, 2026-10-16).
- Phases 1–2 are blocking; then 3/4 (backend) and 6 (UI) can run in parallel.
- Every provider follows contracts/provider-contract.md §3 — the scope rule is the owner's own list
  rule, not a new one; when in doubt, call the list's own service with field selection added.
- Run `quickstart.md` § *Before calling a phase done* at each checkpoint, and report every result with
  its output.
- Open questions Q1–Q3 are answered (spec *Clarifications*): Q1 and Q3 keep their defaults; **Q2
  changed** — Organization results follow the Organizations list's visibility with assigned
  organizations ranked first (FR-015a, research R-4). Quote Requests apply scope in the statement,
  never `RfqAdminService.listAll`'s in-memory filter (T032).
