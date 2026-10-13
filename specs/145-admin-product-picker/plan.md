# Implementation Plan: Admin product picker (orders, quote requests, price lists)

**Branch**: `feat/145-admin-product-picker` | **Date**: 2026-10-13 | **Spec**: [spec.md](./spec.md)
**Issues**: #280, #281, #282, #291
(US1 bulk add on Create order → #282 · US2 Items/summary gating → #281 · US3 bulk add on Create quote request → #280 · US4 price-list picker and bulk add → #291)
**Input**: Feature specification from `specs/145-admin-product-picker/spec.md` (status *Clarified —
ready for plan*; sixteen clarifications, all binding)

## Summary

One filterable, paginated, multi-select product table — the **product browser** — replaces the
one-product-at-a-time search on **Create order**, **Create quote request** and a price list's
**Products & brackets** tab. It is a new composite in `@endora-commerce/admin-kit` built from
existing kit primitives (side drawer, `ResponsiveTable`, `PaginationFooter`, `Checkbox`,
`useFocusTrap`), reading the existing `GET /api/v1/admin/catalog/products`, with strings in the
`core` bundle. Each host passes its selectability rules (FR-012) and the ids already present
(FR-009); the selection persists across pages and filters, is capped at 200 per Add, and is handed
back in selection order.

Two server changes, both contract-first in `packages/contracts/` — additive except for one ruled
behaviour change on the admin-only preview route (an unknown `salesChannelId` is refused 404 instead
of falling back to an active channel; item 1):

1. **Order preview** (`POST /api/v1/admin/orders/preview`) reports two new per-line message codes,
   `PRODUCT_NOT_VISIBLE_TO_CUSTOMER` and `PRODUCT_NOT_IN_SALES_CHANNEL`, exactly one message per
   line with precedence `PRODUCT_NOT_FOUND` > visibility > assortment > `QUOTE_ONLY`; assortment is
   checked against the **request body's** `salesChannelId` through the sanctioned membership
   accessor. The active-channel fallback is removed: a `salesChannelId` naming no channel is refused
   **404 `NOT_FOUND`** (PO ruling, research R-7), stated as a behaviour change in the `mod-orders`
   changeset. The distinct codes are justified against `isProductVisibleTo`'s single-answer rule
   and the justification is written into that function's documentation.
2. **Price-list bulk add** (`POST /api/v1/admin/price-lists-engine/:id/products/bulk-add`),
   `price_lists:write`, ≤ 200 ids, one Command Bus command and at most one audit entry, refusing
   the system Default list and whole-invalid requests with nothing written, answering
   `{ added, unchanged, failed }`.

Screen work: **Create order** hides **Items** and **Order summary** until customer and sales
channel are set; lines come only from **Browse products** and a quick single-product search; the
new codes render their own reasons. **Create quote request** gets the same entry points and a
prefill model that never overwrites a hand-typed price. **Products & brackets** fixes the
newest-20 defect by resolving roster names through `batch-by-id` (chunked) and decoupling the
bracket editor from the name lookup, and its picker gains a confirm-failure state with **Retry**.

## Technical Context

**Language/Version**: TypeScript 5.x `strict`, Node.js ≥ 22.17, ESM
**Primary Dependencies**: Fastify, MikroORM (PostgreSQL), Zod (backend); React 19 + Vite + react-router-dom 7 through `@endora-commerce/admin-kit` (admin) — **no new runtime dependency**
**Storage**: PostgreSQL — no schema change and no migration; the one new write goes to the existing `price_list_products` table
**Testing**: Vitest — module-package co-located unit tests (`packages/modules/<id>/src/**/*.test.ts`,
run by the package's own `vitest.config.ts`), `packages/contracts/src/*.test.ts`, backend contract
tests under `backend/test/contract/**` (Postgres-backed), admin tests under `admin/test/**` (jsdom)
**Target Platform**: the admin SPA (desktop and tablet widths) and the backend API
**Project Type**: monorepo web application (backend modules + admin-kit design system + admin host)
**Performance Goals**: a 200-line order preview issues one product read and one membership read
(today: one product read per line); the quote-request prefill keeps ≤ 4 resolved-price requests in
flight; roster names for an N-product list take ⌈N/500⌉ `batch-by-id` requests, ≤ 2 in flight
**Constraints**: request payloads of order create and quote-request create unchanged (SC-006);
preview response additive only (FR-027), the one ruled behaviour change being 404 instead of the
active-channel fallback for an unknown `salesChannelId` on the admin-only preview route; no new permission code, Setting, error code, palette entry
or Redis key
**Scale/Scope**: 200 products per Add; catalogs > 500 products (SC-003); four packages with code
changes (`contracts`, `admin-kit`, `mod-orders`, `mod-price-lists`), two with screen/strings only
(`mod-quote-requests`, `mod-i18n`)

No `NEEDS CLARIFICATION` remains in the technical context. The three readings the code forced are
all resolved: the stale preview channel and soft-deleted products by PO ruling (research R-7), the
other two by defaults accepted at analyze and now written into the spec's Assumptions (research.md
*Open items*).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| Principle | Verdict | Evidence |
| --- | --- | --- |
| **I. Modular architecture (NN)** | PASS | The picker is design-system code in `admin-kit`, consuming a published HTTP API; no module imports another module's file (research R-1 — a `catalog` admin export was rejected as a counted reach under D-171). Backend: `orders` reads products through `CatalogProductReadPort` and channel membership through `SalesChannelMembershipPort`, both already in its composition; `price_lists` reads products through its existing `targetReads.catalogProductRead`. No new manifest edge. |
| **II. API-first** | PASS | Bulk-add request/response schemas, the preview message-code enum and the shared 200 cap are written in `packages/contracts/` before any route or screen (Phase 1 of tasks.md). Both changes are additive except one ruled behaviour change: the admin-only preview refuses an unknown `salesChannelId` with 404 instead of falling back to an active channel. Nothing is versioned — the response shape is unchanged, the route is admin-only, and the change is stated in the `mod-orders` changeset (T026). |
| **III. TDD (NN)** | PASS | Every task group starts with a failing test; the traceability table in tasks.md maps every FR and SC to a test. Pure logic (selectability, preview availability, bulk-add partition) is unit-tested; both routes get Postgres-backed contract tests; each user story has interaction tests. |
| **IV. YAGNI & minimal dependencies** | PASS | No new runtime dependency (Complexity Tracking). No configuration knob: 200 is a product rule held in one constant. No new endpoint beyond the one the PO ruled; roster names and the picker reuse existing read endpoints. |
| **V. TypeScript everywhere** | PASS | Zod at the new route boundary; TS types inferred (`z.infer`). |
| **VI. Naming (NN)** | PASS | Route `…/products/bulk-add` (kebab path, like `batch-by-id`, `resolve-ids`); action `price_list.products_add` (dot-namespaced, like `price_list.products_replace`); codes SCREAMING_SNAKE like their siblings; files kebab-case / PascalCase components per package convention. |
| **VII. SEO & performance** | N/A for the storefront (untouched). Admin performance bounds in Technical Context. |
| **VIII. English-only (NN)** | PASS | All artefacts English; Polish appears only as translation values and the PL docs materialisations. |
| **IX. UI reuse** | PASS with one justified new composite | Reused: side drawer classes, `useFocusTrap`, `ResponsiveTable`, `Checkbox`, `Badge`, `PaginationFooter`, `usePageSizePreference`, `Combobox`, existing `ProductPicker` (extended additively). Net-new: `ProductBrowserDialog` (+ its trigger), promoted to the kit from the start because three modules consume it — justification in Complexity Tracking. |
| **X. Queue consumers** | N/A | No asynchronous or repeatable work. |
| **XI. Multi-tenant isolation (NN)** | PASS | No new tenant-scoped entity (`PriceListProduct` is `@GlobalEntity`, as today). The preview keeps `assertCustomerInScope` before any read; visibility is evaluated for the customer's own organization, never a request-supplied one. There is no "no-organization" path: a customer without an organization is still refused (422) as today. |
| **XII. Sales-channel scoping (NN)** | PASS | The assortment check resolves a concrete channel (the order's chosen one), reads membership only through `filterEntityIdsInChannel`, and refuses (404) an id that names no channel instead of falling back to another channel (research R-7, PO ruling). Cross-channel tests: product in channel A only, previewed on A and on B. No query on a `sales_channel_*` table. |
| **XIII. Command Bus auditing (NN)** | PASS | The one new write runs as one `CommandBus.run` through `PriceListService.#runAudited` (action `price_list.products_add`), co-transactional, actor from the ambient TenantContext, one entry or none; no hand-written audit call. The preview writes nothing. |
| **XIV. Entity-agnostic extensibility** | N/A | No field added to any entity. |
| **XV. Untouched core & overlay** | PASS | Core behaviour change requested by the product owner for every deployment; no deployment-specific branch. Overlays are unaffected (no core interface they override changes shape). |
| **XVI. Command palette** | PASS | No new admin surface or route; the three host screens keep their manifest-declared entries. |
| **XVII. Operator-toggleable modules (NN)** | PASS | `catalog`, `orders`, `price_lists` are `nonDeactivatable`; `quote_requests`' screen leaves with its module through the existing mechanism; the new route sits behind the module's existing route-registration gate (research R-13). No module-id literal is written in the kit (`foreign-module-id`). |

**Gate result (pre-research)**: PASS — no unjustified violation.

**Post-design re-check (after Phase 1)**: PASS. The design added no dependency, no schema, no
permission, no Setting, no palette entry and no cross-module edge. The one justified item remains
the new kit composite (Complexity Tracking).

## Project Structure

### Documentation (this feature)

```text
specs/145-admin-product-picker/
├── spec.md
├── plan.md                                   # this file
├── research.md                               # R-1 … R-15, open items
├── data-model.md                             # no schema change; transient shapes
├── quickstart.md                             # manual + targeted verification walkthrough
├── contracts/
│   ├── price-list-bulk-add.md                # new route
│   ├── order-preview-unavailability.md       # additive preview codes
│   └── product-browser-component.md          # admin-kit UI contract
└── tasks.md                                  # /speckit.tasks output
```

### Source code (repository root)

```text
packages/contracts/src/
├── catalog.ts            # + ADMIN_PRODUCT_SELECTION_MAX; isProductVisibleTo JSDoc: preview exemption
├── orders.ts             # + ADMIN_ORDER_PREVIEW_MESSAGE_PRECEDENCE, adminOrderPreviewMessageCodeSchema
├── price-lists.ts        # + bulkAddPriceListProducts{Request,Result,Response}Schema, failure reason enum
├── orders.test.ts        # extended
└── price-lists.test.ts   # NEW

packages/modules/price_lists/src/
├── backend/routes.ts                                 # + POST …/:id/products/bulk-add
├── backend/services/price-list-service.ts            # + addProducts() via #runAudited
├── backend/services/bulk-add-partition.ts            # NEW pure partition
├── backend/services/bulk-add-partition.test.ts       # NEW
└── admin/pages/PriceListDetailPage.tsx               # picker, bulk add, chunked roster names, write gate
packages/modules/price_lists/docs/price_lists.md      # bulk add, Add behaviour

packages/modules/orders/src/
├── backend/routes.ts                                 # preview: batch read, availability, membership
├── backend/plugin.ts                                 # thread salesChannelMembership into OrdersDeps
├── backend/services/preview-line-availability.ts     # NEW pure decision
├── backend/services/preview-line-availability.test.ts# NEW
└── admin/pages/OrderCreatePage.tsx                   # gating, Browse + quick search, line reasons
packages/modules/orders/docs/orders.md

packages/modules/quote_requests/src/admin/pages/RfqCreatePage.tsx   # Browse + quick search, prefill model
packages/modules/quote_requests/docs/quote_requests.md

packages/admin-kit/src/components/
├── product-browser/{ProductBrowserDialog,ProductBrowserTrigger}.tsx   # NEW
├── product-browser/{selectability,product-browser-api,types}.ts       # NEW
├── product-picker/ProductPicker.tsx                                   # + rules, alreadyAddedIds, onPickProduct
└── index.ts                                                           # + explicit exports

packages/modules/_i18n/i18n/{en,pl}.json             # productBrowser.*, orderCreate.*, rfqCreate.*, priceLists.detail.*

backend/test/contract/price_lists/price-list-products-bulk-add.test.ts    # NEW (Postgres)
backend/test/contract/orders/admin-order-preview-availability.test.ts     # NEW (Postgres)
backend/test/fixtures/openapi-baseline.json                               # re-recorded
admin/test/kit/kit-product-browser-selectability.test.ts                  # NEW
admin/test/kit/kit-product-browser.test.tsx                               # NEW
admin/test/kit/kit-pickers.test.tsx                                       # extended
admin/test/modules/orders/OrderCreatePage.{test,gating.test,product-browser.test}.tsx
admin/test/modules/quote_requests/RfqCreatePage.{origin.test,product-browser.test}.tsx
admin/test/modules/price_lists/PriceListProducts.bulk-add.test.tsx       # NEW

docs/translation-cache/pl/*.json, docs/i18n/pl/docusaurus-plugin-content-docs/current/modules/*.md
.changeset/*.md                                                           # six changesets
```

**Structure Decision**: extend the three owning modules and the design-system package; no new
module (the picker has no domain — it is a view over `catalog`'s published list API, which is
why it is design-system code rather than a module). No migration, so no migration ownership to
plan.

## Phase 0 — Research

Complete: [research.md](./research.md). Fifteen decisions, each with rationale and rejected
alternatives; the three open items raised for the product owner are all resolved — one by PO
ruling (R-7), two by defaults accepted at analyze and recorded in the spec's Assumptions.

## Phase 1 — Design & contracts

Complete: [data-model.md](./data-model.md), [contracts/](./contracts/),
[quickstart.md](./quickstart.md). The agent-context appendix of `AGENTS.md` is regenerated by
`.specify/scripts/bash/update-agent-context.sh` (pinned to write `AGENTS.md`).

## Cross-cutting checklist (designed in, not bolted on)

| Concern | Answer |
| --- | --- |
| Admin permission manifest | No new code. New route gated by the existing `writeGate` constant (`price_lists:write`), resolvable by the inventory scanner. Client gates: `catalog:read` (picker trigger; quick search only where the host passes `rules` — existing `ProductPicker` consumers unaffected), `price_lists:write` (**Add**). |
| Command palette | No new surface → no new entry. |
| pl + en i18n | Kit strings `productBrowser.*` and host strings in `core` (`_i18n` bundle), both languages, flat keys; status/type labels translated (FR-014). `i18n:hardcoded` must not grow. |
| Settings / secrets | None. |
| Auditing via Command Bus | Bulk add: one command, one entry or none, counts only. |
| Tenant scoping | Unchanged model; preview keeps the scope assertion and evaluates the customer's organization. |
| Channel scoping | Preview assortment via `filterEntityIdsInChannel(body.salesChannelId, …)`; an unknown `salesChannelId` is refused 404 (no active-channel fallback). |
| Redis cache invalidation | No Redis cache introduced; the bulk add reuses the in-process pricing-cache invalidation every price-list write performs. |
| Activation / off-state | Research R-13: no new seam; the new route inherits the module's registration gate. |
| Changesets | Six, levels in research R-14. |
| OpenAPI baseline | Re-recorded after the route lands (Postgres-backed). |
| Docs | Three module pages EN + PL cache + materialisation. |

## Risks

| Risk | Mitigation |
| --- | --- |
| Two admins bulk-add the same new product at once → composite-PK collision at flush; the loser's whole request errors. | Nothing is written for the loser (one transaction), which is answered 409 `VERSION_CONFLICT` by the platform envelope's existing mapping (research.md R-8); the picker's confirm-failure state offers Retry, which then reports the product `unchanged`. Documented in the contract; no `ON CONFLICT` bypass of the unit of work. |
| A product is **hard**-deleted between the existence read and the flush → FK violation aborts the request. | Catalogue deletion is a soft delete (`deletedAt`); the window is a race against a path that does not exist in the admin. Same Retry path. |
| Large Default list rosters (seeded with every product) make the name lookup ⌈N/500⌉ requests. | ≤ 2 in flight; Add stays disabled on the Default list; the roster renders immediately with id-prefix labels that fill in. Same order of cost as the roster endpoint itself, which already returns every row. |
| Existing admin tests drive the removed per-row `product-${i}` combobox. | Rewritten as explicit tasks (T027, T033), not left red. |
| Preview loop rewrite (batch product read) changes behaviour for existing codes. | `backend/test/contract/orders/admin-order-preview.test.ts` stays green unchanged; precedence unit-tested. |
| `check:admin-zones` `foreign-module-id` on the kit. | Kit gates by permission code only; never a `module:` literal or a non-`core` namespace (`kit-core-namespace.test.tsx`). |
| A stale `dist` makes an admin or backend test read the previous package build (D-164). | Every Verification line builds the edited package before the dependent test. |
| Integration/contract suites do not run on merge requests (D-198). | Each Postgres-backed test is listed in its phase's Verification line and must be run locally by the builder; the reviewer checks the output. |

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| **New runtime dependency** | **None.** | — The default holds: React, the kit's primitives, Zod and the existing ports cover everything. |
| **Net-new kit composite `ProductBrowserDialog` (+ `ProductBrowserTrigger`)** — Principle IX UX justification | The pattern that is missing: *a filterable, paginated table of catalogue products with a selection that persists across pages and filters, a per-Add cap, host-declared non-selectable rows with reasons, and an optionally asynchronous confirm with an in-place failure state, inside an overlay over a form*. Three hosts need it identically (FR-001, SC-002). | Evaluated: `ProductPicker` (a combobox — no table, no pagination, no filters, page 0 only); `ResponsiveTable` + `PaginationFooter` (they *are* used inside it, but carry no selection model, filters or overlay); the Products list (`catalog`'s screen, not a component, and its selection deliberately clears on filter change); `MultiSelect` / `MultiCombobox` (option lists, not product tables); the price list's local drawer (client-side filter over 20 rows). Composing them per host would produce three divergent copies. The composite is promoted into the kit on day one so the next consumer reuses it. |
| Additive props on the existing `ProductPicker` | The quick search must apply the picker's selectability rules (FR-020) and hand back the product summary. | A second combobox would duplicate an existing primitive. |

## Handoff summary for `endora-commerce-dev`

- **Read first**: this plan, research.md (R-6 … R-11 are the load-bearing decisions),
  `contracts/*.md`, `specs/conventions/release-intent.md`, `specs/conventions/module-i18n.md`,
  `specs/conventions/backend-test-suite.md`.
- **Order**: contracts (T001–T007) → kit picker (Phase 2) → order gating (US2) → preview
  backend + order screen (US1) → quote request (US3) → bulk-add backend + price-list screen (US4)
  → polish. Phases are sized for one builder spawn each; each ends with an exact Verification line.
- **Build before testing** (D-164): after editing a package, `pnpm --filter <pkg> run build`
  before any test that imports it.
- **Postgres-backed tasks are marked `[PG]`** in tasks.md; they need `pnpm run dev:infra` and are
  run one file at a time.
- **Do not**: add a dependency, a permission code, a Setting, an error code or a migration; touch
  `CartService.addItem` or the order-create path (out of scope); narrow `messages[].code`; write a
  module id or a non-`core` namespace in admin-kit; re-record a read size the band accepts; commit
  with an AI trailer.
- **Open items** (research.md, end): all three resolved — one by PO ruling, two in the spec's
  Assumptions; nothing remains open.
