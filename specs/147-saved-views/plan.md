# Implementation Plan: Saved list views — a design-system save dialog, and saved views on the Product and Quote Request lists

**Branch**: `feat/147-saved-views` | **Date**: 2026-10-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/147-saved-views/spec.md` (clarified 2026-10-14;
issues #288, #289, #290).

## Summary

The Order list's saved views lose their two native browser dialogs; the Product list and the
Quote Request list gain saved views that behave identically. The approach, with evidence and the
rejected alternatives in [research.md](./research.md):

- **Persistence stays per module** (R-1). `catalog` and `quote_requests` each get one
  platform-global table, entity, service and four admin routes, mirroring the shape `orders`
  already ships. `orders` keeps its table; it changes behaviour only.
- **One contract, one UI, one parity test keep the three from drifting** — the drift `returns`'
  orphaned copy demonstrates. A shared schema family and name rule in
  `packages/contracts/src/saved-list-views.ts`; a `SavedViewsControl` composite in
  `@endora-commerce/admin-kit/components` that every list page mounts with its own endpoint; and
  one integration test that runs the same rule table through all three services.
- **The dialog primitive is promoted, not written** (R-2): `crm`'s `ModalDialog`, which
  describes itself as a promotion candidate, moves into the kit with two additive focus props.
- **FR-022's uniqueness is an advisory lock plus a probe** in all three services (R-5), because
  `orders`' table may already hold the duplicates the spec says to keep; the two new tables also
  carry a unique expression index.
- **The server tells the client what it may do** (`ownedByCaller`, `canModify`, R-8), with
  "platform admin" defined as orders defines it (R-7).
- **`quote_requests`' views are gated with the module** by registering them in the module's own
  admin-route function (R-11); the existing off-state test is extended.

No new runtime dependency. One new **dev** dependency in `admin` (`axe-core`, already in the
lockfile) for SC-002 — see Complexity Tracking. Two module migrations (one new table each).

## Technical Context

**Language/Version**: TypeScript 5.x `strict`, Node.js ≥ 22.17, ESM
**Primary Dependencies**: Fastify, MikroORM (PostgreSQL), Zod (backend); React 19 + Vite through `@endora-commerce/admin-kit` (admin) — **no new runtime dependency**; `axe-core` added as an `admin` devDependency (test-only)
**Storage**: PostgreSQL — two new platform-global tables, `product_list_saved_views` (owned by `catalog`) and `quote_request_list_saved_views` (owned by `quote_requests`); `order_list_saved_views` unchanged
**Testing**: Vitest — `packages/contracts` co-located unit tests; `backend/test/{contract,integration}` for server-bound tests; `admin/test/{components,modules}` for the kit and the three pages, every render in `<StrictMode>`; `axe-core` for the dialogs
**Target Platform**: Linux server (backend) and the admin SPA in evergreen browsers
**Project Type**: web application — monorepo with `backend/`, `admin/`, `packages/`
**Performance Goals**: list views per admin are tens, not thousands; one indexed read per list mount and after each save/delete; no added request on the list's own data path
**Constraints**: no native browser dialog in the save/delete flows (FR-001); keyboard-only operable, WCAG 2.2 AA (SC-002); no new permission code (FR-015); loading a view never widens visibility (FR-016/FR-017); a switched-off `quote_requests` answers as absent and keeps its rows (FR-018)
**Scale/Scope**: 2 tables, 2 entities, 2 services, 8 new routes, 1 changed service and 4 changed routes in `orders`, 3 error codes, 1 promoted kit primitive, 1 new kit composite, 3 page integrations, 18 `core` keys, 3 module docs pages × 2 languages; 10 phases, 74 tasks

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design — same verdict.*

| Principle | Verdict | How the design meets it |
| --- | --- | --- |
| **I. Modular architecture (NN)** | Pass | Each list's views are owned by the module that owns the list: table, entity, migration, service, routes, error code, bundle sentence, docs. No module reads another's table or imports another's internals. The shared pieces live in the two packages every module already depends on — `contracts` (shapes, a pure function) and `admin-kit` (UI). Detaching `quote_requests` removes its views; nothing else names them. |
| **II. API-first** | Pass | `packages/contracts/src/saved-list-views.ts` and the orders schemas are written first, with their test, before any route ([contracts/saved-list-views-api.md](./contracts/saved-list-views-api.md)). The orders response change is additive; the name-trimming tightening is the spec's FR-003 and is stated in the changeset. |
| **III. TDD (NN)** | Pass | Every implementation task in [tasks.md](./tasks.md) is preceded by the failing test that it turns green; § *Requirement → test* in tasks.md maps every FR-0xx and SC-00x. |
| **IV. YAGNI, minimal dependencies** | Pass | No runtime dependency. No platform abstraction, no new module, no `name_key` column, no sort/column columns for a list without those controls. One dev dependency, justified below. |
| **V. TypeScript everywhere** | Pass | Zod at every new HTTP boundary; types inferred from the schemas; the kit consumes the contract types. |
| **VI. Naming (NN)** | Pass | Routes kebab-case (`…/list-views`); tables and columns snake_case; JSON camelCase; migration class names begin with the owner segment (`Migration…Catalog…`, `Migration…QuoteRequests…`) as `migration:new` produces them. |
| **VII. SEO, performance** | N/A | Admin only; the storefront is untouched. |
| **VIII. English (NN)** | Pass | Code, comments, specs and docs in English; Polish only in bundles and in the Polish docs tree. |
| **IX. UI reuse** | Pass, one promotion | `ModalDialog` is promoted from `crm` rather than written (R-2); `SavedViewsControl` replaces `OrderSavedViews` and is composed from the kit's `Select`, `Button`, `Input`, `Checkbox`, `Label` and the promoted dialog. Net-new in the kit: the composite itself — the pattern (a list's named filter presets with a save and a confirm dialog) exists nowhere else, and three lists need it. |
| **X. Queue consumers** | N/A | Nothing asynchronous. |
| **XI. Tenant isolation (NN)** | Pass | Both new entities are `@GlobalEntity()` (personal configuration, no organization column) and classified for the guard. Views store an organization **id** only; every list read after loading a view runs under the loader's own tenant context, proven by a contract test as a sales representative and an admin test for name non-disclosure (FR-016, FR-017, R-16). |
| **XII. Sales-channel scoping (NN)** | N/A | No channel-scoped read; a captured sales-channel id on an Order view is a filter value re-applied by the list's existing scoped query. |
| **XIII. Command Bus auditing (NN)** | Pass, by the spec's assumption | Saved-view writes are personal UI configuration, not domain mutations; they follow the existing `command-coverage-ignore` precedent on `orders` and `returns` (spec *Assumptions*, R-14). `check:command-coverage -- --strict` stays green through the annotations. |
| **XIV. Entity-agnostic extensibility** | N/A | No "add a field" requirement. |
| **XV. Untouched core / overlay** | N/A | No deployment overlay involved. |
| **XVI. Command palette** | Pass | No new surface, so no new palette entry (FR-019); the three lists keep their existing entries. |
| **XVII. Operator-toggleable modules (NN)** | Pass | `quote_requests`' saved-view routes are registered inside its own route function, gated by `ctx.routes` with the rest of the module; the control lives only on `RfqList`, which is absent with the module; switching off deletes nothing. `orders` and `catalog` are non-deactivatable and owe no off-state. Proven by extending `backend/test/integration/quote_requests/off-state.test.ts` (R-12). |

**Admin permission manifest** — no new code (FR-015); the new routes reuse `orders:read`,
`catalog:read`, `rfqs:handle`, which are already declared and grantable. `check:action-route-permissions`
is unaffected (no manifest action changes).
**Settings module** — no configuration is introduced; nothing to declare.
**Redis cache invalidation** — nothing is cached; the selector re-reads after every write.

## Project Structure

### Documentation (this feature)

```text
specs/147-saved-views/
├── spec.md
├── plan.md                              # this file
├── research.md                          # R-1 … R-17
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── saved-list-views-api.md          # HTTP + Zod + error codes
│   └── admin-kit-saved-views.md         # ModalDialog, SavedViewsControl, core keys
└── tasks.md
```

### Source Code (repository root)

```text
packages/contracts/src/
├── saved-list-views.ts                  # NEW — shared schemas, name max, name key
├── saved-list-views.test.ts             # NEW
├── orders.ts                            # orders saved-view schemas rebuilt on the shared ones
├── errors.ts                            # + 3 codes
└── index.ts                             # + export

packages/admin-kit/src/components/
├── modal-dialog/ModalDialog.tsx         # MOVED from packages/modules/crm/src/admin/components/
├── saved-views/
│   ├── SavedViewsControl.tsx            # NEW (published)
│   ├── SaveViewDialog.tsx               # NEW (internal)
│   ├── DeleteViewDialog.tsx             # NEW (internal)
│   └── saved-views-api.ts               # NEW (internal)
└── index.ts                             # + ModalDialog, SavedViewsControl and their types

packages/modules/crm/src/admin/          # 8 imports re-pointed; components/ModalDialog.tsx deleted

packages/modules/orders/
├── src/backend/services/order-list-view-service.ts   # trim, lock+probe, flags
├── src/backend/routes.ts                              # every route passes savedViewActor(); 409
├── src/admin/pages/OrdersList.tsx                     # mounts SavedViewsControl
├── src/admin/components/OrderSavedViews.tsx           # DELETED
├── src/manifest.ts                                    # + errorCodes entry
├── i18n/{en,pl}.json                                  # + errors.ORDER_SAVED_VIEW_NAME_TAKEN
└── docs/orders.md

packages/modules/catalog/
├── src/backend/entities/product-list-saved-view.entity.ts   # NEW
├── src/backend/services/product-list-view-service.ts        # NEW
├── src/backend/routes.admin.ts, plugin.ts, index.ts         # routes, wiring, entities[]
├── src/migrations/<stamp>_catalog_product_list_saved_views.ts   # NEW (scaffolded)
├── src/admin/pages/ProductsList.tsx
├── src/manifest.ts, i18n/{en,pl}.json, docs/catalog.md

packages/modules/quote_requests/
├── src/backend/entities/quote-request-list-saved-view.entity.ts   # NEW
├── src/backend/services/quote-request-list-view-service.ts        # NEW
├── src/backend/routes.admin.ts, plugin.ts, index.ts
├── src/migrations/<stamp>_quote_requests_quote_request_list_saved_views.ts   # NEW (scaffolded)
├── src/admin/pages/RfqList.tsx
├── src/manifest.ts, i18n/{en,pl}.json, docs/quote_requests.md

packages/modules/_i18n/i18n/{en,pl}.json  # + savedViews.*, − orders.views.*

backend/
├── src/db/{migrations,entities}-registry.generated.ts   # regenerated (composer:generate)
├── test/fixtures/error-code-routing/reference-ledgers.ts   # + 3 MINTED entries
├── test/helpers/test-actors.ts                          # + own stub sessions for new contract tests
├── test/integration/saved-list-views/rules-parity.test.ts   # NEW (three-module, repository-owned)
├── test/contract/orders/list-and-views.test.ts          # extended
├── test/contract/catalog/product-list-views.test.ts     # NEW
├── test/contract/quote_requests/list-views.test.ts      # NEW
└── test/integration/quote_requests/off-state.test.ts    # extended

admin/
├── package.json                          # + axe-core (devDependency)
├── test/helpers/axe.ts                   # NEW
├── test/components/{ModalDialog,SavedViewsControl}.test.tsx      # NEW
└── test/modules/{orders/OrdersList,catalog/ProductsList,quote_requests/RfqList}.saved-views.test.tsx   # NEW

docs/i18n/pl/…/modules/{orders,catalog,quote_requests}.md + docs/translation-cache/pl/*.json
.changeset/*.md                            # one per meaning
```

**Structure Decision**: the existing monorepo layout; each module's sources in its own package,
server-bound tests under `backend/test/`, admin tests under `admin/test/`, harness-free unit tests
beside their subjects. Nothing is placed next to a module's `src/manifest.ts`.

## Migrations

Two, one per owning module, scaffolded — never numbered by hand
(`specs/conventions/module-migrations.md`):

| Module | Scaffold | Content | Depends on |
| --- | --- | --- | --- |
| `catalog` | `pnpm --filter backend run migration:new -- --module catalog --name product_list_saved_views` | `create table product_list_saved_views`; unique index on `(owner_admin_user_id, lower(name))`; `down` drops the table | nothing outside `catalog` (no foreign key) |
| `quote_requests` | `pnpm --filter backend run migration:new -- --module quote_requests --name quote_request_list_saved_views` | same shape plus nullable `sort`, `visible_columns` | nothing outside `quote_requests` |

Each lands with `pnpm --filter backend run composer:generate` and the regenerated
`backend/src/db/migrations-registry.generated.ts` and `entities-registry.generated.ts` in the
same commit. Order across modules is the manifest graph's; neither migration references another
module, so no manifest `dependencies` change.

## Phasing

Ten phases, each independently committable and ≤ 10 tasks, detailed in [tasks.md](./tasks.md).
**Backend** and **admin UI** phases are marked so UI phases can be routed to the designer.

| # | Phase | Kind | Story |
| --- | --- | --- | --- |
| 1 | Shared contracts | backend (shared) | all |
| 2 | Kit: `ModalDialog` promotion and `SavedViewsControl` | admin UI | US1 (+ US2, US3) |
| 3 | Orders backend: trim, duplicate rule, flags, parity test | backend | US1 |
| 4 | Orders list on the kit control (#288 closed) | admin UI | US1 |
| 5 | Catalog backend | backend | US2 |
| 6 | Product list saved views (#289 closed) | admin UI | US2 |
| 7 | Quote requests backend and off-state | backend | US3 |
| 8 | Quote Request list saved views (#290 closed) | admin UI | US3 |
| 9 | Documentation, en + pl | docs | all |
| 10 | Residue and the CI gate, run locally | verification | all |

Dependencies: 1 → everything; 2 → 4, 6, 8; 3 → 4; 5 → 6; 7 → 8; 3 → 5 → 7 only through the
parity test file (each adds a row); 9 after 4, 6, 8; 10 last. Phases 5–6 and 7–8 are
independent of each other once 1–3 have landed.

## Risks

| Risk | Mitigation |
| --- | --- |
| Moving `ModalDialog` changes `crm` behaviour | The two new props default to today's behaviour; `crm`'s admin tests run in phase 2's verification. |
| `getTenantContext()` not established inside a route handler in some composition | It is the ambient context the request-scope hook sets for every request (Principle XI); phase 5's contract test exercises it as a scoped admin and fails loudly (`MissingTenantContextError`) if not. |
| Static `list-views` segment shadowed by a `:id` route | A contract test per list (`GET …/list-views` returns the views envelope, not a product/RFQ 404). |
| StrictMode double-mount breaks focus return or leaves the dialog busy | Every component test renders inside `<StrictMode>`; contract §1 states the rule for "alive" flags. |
| A derived artefact goes stale (registries, manifests, lockfile, Polish docs cache) | Each phase that changes an input regenerates in the same commit; phase 10 runs `overlay:check`, `manifests:check`, `check:docs-translations` and `pnpm install --frozen-lockfile`. |

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| `axe-core` as an `admin` **devDependency** (test-only; `axe-core@4.13.0` already resolved in `pnpm-lock.yaml` through `storefront`'s `@axe-core/playwright`) | SC-002 requires an automated accessibility check of each open dialog; the admin's test stack has none | Hand-written ARIA assertions test only what their author thought of (they are written anyway, as behaviour tests); `vitest-axe` adds a second package for a ten-line helper; no admin end-to-end harness exists to run Playwright against. It ships in no package and no bundle. |
| A new kit composite (`SavedViewsControl`) | Three lists need the same selector + two dialogs; the kit has no equivalent | Per-page composition triplicates the flow that `OrderSavedViews.tsx` got wrong once already. |
| Three per-module saved-view services with identical rules (`OrderListViewService`, `ProductListViewService`, `QuoteRequestListViewService`), each with its own `saved-view-actor.ts` | Each list's views live in a table its module owns, and each module must stay detachable (Constitution I) — a switched-off `quote_requests` keeps its rows and answers as absent (FR-018) | One shared service would have to live in a module the other two import, which `check:module-boundary` refuses and which ties every list to that module's presence; or in the platform, whose barrel surface is deliberately narrow (`check:platform-surface`) and which owns no list. The duplication is held in sync rather than removed: `backend/test/integration/saved-list-views/rules-parity.test.ts` runs one scenario table — ownership, sharing, the name key, the lock, the no-op `PATCH`, the trail line and the platform-admin derivation — over all three services, and the request schemas and the name key are shared from `@endora-commerce/contracts`. |

No runtime dependency is added.

## Constitution Check — post-design

Re-evaluated after research, data model and contracts: **PASS**. No principle is violated; the
one dev dependency is justified above. Nothing is left `[NEEDS CLARIFICATION]`.

## Handoff to `endora-commerce-dev`

- Work the phases of [tasks.md](./tasks.md) in order on `feat/147-saved-views`; commit each
  phase on its own with `git commit -s` and no AI trailer. Phases 2, 4, 6 and 8 are admin UI and
  may go to `endora-commerce-designer` for review of copy, layout and focus behaviour.
- Read first: [research.md](./research.md) R-1 – R-8,
  [contracts/saved-list-views-api.md](./contracts/saved-list-views-api.md),
  [contracts/admin-kit-saved-views.md](./contracts/admin-kit-saved-views.md).
- Do not touch `returns`, the other `window.confirm` call sites, or `orders`' table schema.
- After editing any package, rebuild it before running a test that imports it.
- Merge-request pipelines skip the contract and integration suites (D-198): phase 10 runs them
  locally.
