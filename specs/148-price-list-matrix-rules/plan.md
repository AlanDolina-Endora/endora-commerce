# Implementation Plan: Price list matrix rules

**Branch**: `feat/145-price-list-matrix-rules` (spec directory `specs/148-price-list-matrix-rules/`; 145 is `specs/145-admin-product-picker/`) | **Date**: 2026-10-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/148-price-list-matrix-rules/spec.md`

## Summary

Price lists gain **matrix entries**: prices addressed by *product selection* (product | category |
attribute value | category ∩ attribute value | all) × *organization* (optional, inheritance-aware) ×
*quantity window*, charging a fixed unit price or a percentage off a reference price. The catalogue's
existing, unconsumed `isPriceRule` (*Price list rules* / *Reguły cennika*) attribute flag decides
which attributes may be a coordinate. Everything lands in `price_lists`: one new table, one pure
resolver (`matrix-price-resolver.ts`) slotted **inside** the existing per-list bracket step of
`PricingService` so list selection, partitions, fall-through and every consumer stay as they are,
admin CRUD routes behind the existing `price_lists:read/write` gates and Command Bus auditing, a
*Price matrix* tab on the price-list detail page, pl+en strings and documentation. No new module,
permission, setting, queue or runtime dependency.

## Technical Context

**Language/Version**: TypeScript 5.x `strict`, Node.js ≥ 22.17, ESM
**Primary Dependencies**: Fastify, MikroORM (PostgreSQL), Zod (backend); React 19 + Vite + `@endora-commerce/admin-kit` (admin) — **no new runtime dependency**
**Storage**: PostgreSQL — one new table `price_list_matrix_entries` owned by `price_lists`, FKs to `price_lists`, `products`, `categories`, `organizations`; no column added elsewhere
**Testing**: Vitest — co-located package unit tests (`packages/modules/price_lists/src/**/*.test.ts`, `packages/contracts/test/`), backend contract + integration (`backend/test/{contract,integration}/price_lists/`), admin component tests (`admin/test/modules/price_lists/`), one bench (`backend/test/perf/price_lists/`)
**Target Platform**: Linux server (API + workers), admin SPA; storefront unchanged (consumes resolved prices)
**Project Type**: Web monorepo — module package + contracts package + admin host + backend test tree
**Performance Goals**: listing page (50 products, one wave) ≤ 3 extra statements with matrix entries, exactly 1 without (SC-003); the per-product resolution stays ≤ 1 extra statement in the no-matrix case
**Constraints**: identity between batched listing and per-product line resolution (issue #132 obligation); no cross-module table access (D-87); fail closed on absent ports; pricing cache TTL 60 s unchanged
**Scale/Scope**: ≤ 5 000 entries per list; catalogue up to hundreds of thousands of products (Constitution *Performance & Scale Targets*) — entries are never expanded per product

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 (verdicts below are post-design).*

| Principle | Verdict | How |
| --- | --- | --- |
| **I. Modular architecture (NN)** | PASS | All code in `price_lists`. Reads `catalog` through `catalogAttributeReadPort` / `catalogCategoryReadPort` / `catalogProductReadPort` and `organizations` through `organizationDetailsPort` / `organizationInheritancePort` — every one a `lazyPort<ContractType>(ctx, '<literal>')`. `catalog` and `organizations` are already in `dependencies`; the new `catalogAttributeReadPort` edge needs no manifest change. No import of another module's files. |
| **II. API-first** | PASS | Schemas first in `packages/contracts/src/price-lists.ts` (data-model §3); routes parse with them. Additive only — no published port widened (`LinePricePort` untouched, R-D77 reasoning). |
| **III. TDD (NN)** | PASS | tasks.md orders every implementation task after its failing test; each FR maps to a test (tasks.md *Traceability*). |
| **IV. YAGNI & minimal deps** | PASS | No dependency; decimal math is integer arithmetic; no Setting for the limit; no materialisation job — price sorting computes matrix prices in the ordering statement instead (Q1). |
| **V. TypeScript everywhere** | PASS | |
| **VI. Naming (NN)** | PASS | table `price_list_matrix_entries` (snake_case, module-prefixed), entity `PriceListMatrixEntry`, migration class tail `PriceLists…`, routes kebab-case under existing prefixes, error codes `PRICE_MATRIX_*`. `check:naming` in tasks. |
| **VII. SEO / performance** | PASS | Storefront pages unchanged and SSR-capable; statement budget bounded and tested. Price sort is matrix-aware (owner decision Q1). |
| **VIII. English-only** | PASS | Code/comments/docs English; pl strings live in bundles and `docs/i18n/pl/`. |
| **IX. UI reuse** | PASS | `ModalDialog`, `ResponsiveTable`, `PaginationFooter`, `RowActionMenu`, `ProductPicker`, `CurrencyPicker` from admin-kit; tab pattern copied from the page's own `TabBtn`. |
| **X. Queue consumers** | N/A | No long-running or repeatable work. |
| **XI. Multi-tenant isolation (NN)** | PASS | Entity `@RuleScoped()` (R12) — classification check satisfied; admin reads filter by `ruleVisibleForScope` in the query; out-of-scope ⇒ 404 identical to missing; writes naming an org require `isOrgInScope`. Cross-tenant tests: T036. No "no-organization" *tenant* path: an org-less entry is a price coordinate ("all buyers"), not a tenant scope — buyers still always resolve under their organization. |
| **XII. Sales-channel scoping (NN)** | PASS | Entries apply only through a list whose application rule matched the resolved channel; no channel read added. Cross-channel test T045 (spec US5 #3). |
| **XIII. Command Bus auditing (NN)** | PASS | Create/update/delete via `PriceListService.#runAudited` → `CommandBus.run`; duplicate extends the existing `price_list.duplicate` run. Audit test T038. |
| **XIV. Entity-agnostic extensibility** | PASS | Uses catalogue attributes (custom-field backed) as a coordinate rather than adding bespoke product columns. |
| **XV. Untouched core / overlay** | PASS | Core feature; `pricingService` stays decoratable through `ctx.di.decorate` — `PricingServiceContract` is unchanged except an optional result field. |
| **XVI. Command palette** | PASS | No new screen; the tab lives under the existing `open-price-lists` action's route. Deep link `?tab=matrix`. |
| **XVII. Toggleable modules (NN)** | PASS | `price_lists` and `catalog` are `nonDeactivatable`; the new port read fails closed through `lazyPort` and is only issued when an entry names an attribute. No off-state test owed beyond the existing `absent-owner-refuses.test.ts`, which T028 extends to the attribute port. |
| Documentation requirement | PASS | `packages/modules/price_lists/docs/price_lists.md` + pl, catalogue attributes page sentence fixed + pl (T049–T051). |
| Performance & scale targets | PASS with note | Entries never expanded per product in the resolver; budget test. Price-sorted listings price matrix-bearing streams from a derived relation (owner decision Q1) — bench `matrix-resolver.bench.ts` records the cost; pinned feeds ignore matrix prices (Q2). |

**Verdict: PASS.** No violation needs Complexity Tracking.

## Owner decisions (2026-10-16) — formerly open questions

- **Q1 — Price-sorted listings: RESOLVED by owner decision, overriding the default.** Storefront
  *sort / filter by price* (feature 086) MUST order by the same effective buyer price the card
  shows, matrix entries included. `orderByUnitPrice` and `pricedProductIds` are therefore extended
  (research R11, contract `pricing-resolution-matrix.md` §9, tasks T057–T061): a candidate stream
  whose list carries a matrix entry applicable to the viewer at quantity 1 is priced from a derived
  relation over the list's own brackets, its entries and the Default-list reference, using the same
  precedence key as `resolveListCandidate`; streams without such entries keep the index-ordered
  bracket shape, so a catalogue that does not use the matrix pays nothing. Attribute selections
  are expanded to product ids through one new `catalogProductReadPort` method,
  `listProductIdsByAttributeValue` (owner `catalog`), the attribute counterpart of
  `catalogCategoryReadPort.listProductIdsInCategory`.
- **Q2 — Pinned product feeds.** Default stands: a feed pinned to a named list
  (`namedListPrices`) reads that list's product brackets only; a test pins it. Feeds priced through
  the resolver (anonymous) do see org-less matrix entries.
- **Q3 — Precedence.** Default stands: organization-specific beats product specificity (an org's
  category discount beats an all-buyers product bracket on the same list), mirroring the list
  chain.

## Project Structure

### Documentation (this feature)

```text
specs/148-price-list-matrix-rules/
├── spec.md
├── plan.md                 # this file
├── research.md             # R1–R18
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── admin-price-matrix-api.md
│   ├── pricing-resolution-matrix.md
│   └── admin-ui-price-matrix.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/contracts/
├── src/price-lists.ts                       # + matrix schemas, PRICE_MATRIX_MAX_ENTRIES_PER_LIST
├── src/errors.ts                            # + 4 PRICE_MATRIX_* codes
└── test/price-matrix.unit.test.ts           # NEW

packages/modules/price_lists/
├── src/manifest.ts                          # + errorCodes, + recentActivity entries
├── src/backend/
│   ├── entities/price-list-matrix-entry.entity.ts      # NEW (@RuleScoped)
│   ├── index.ts                             # entities[] + targetReads.catalogAttributeRead (lazyPort)
│   ├── plugin.ts                            # thread catalogAttributeRead to service/routes
│   ├── routes.ts                            # + matrix CRUD, + rule-targets/attributes
│   └── services/
│       ├── matrix-price-resolver.ts         # NEW pure: candidates, precedence, percent math
│       ├── matrix-price-resolver.test.ts    # NEW
│       ├── matrix-decimal.ts / .test.ts     # NEW integer decimal helpers
│       ├── matrix-entry-rules.ts / .test.ts # NEW pure validation: shape, overlap, eligibility
│       ├── price-matrix-service.ts          # NEW admin CRUD (uses #runAudited via PriceListService)
│       ├── price-bracket-resolver.ts        # PriceBracketRow.matrixEntryId?
│       ├── pricing-service.interface.ts     # PricingLineResult.matrixEntryId?
│       ├── pricing-service.ts               # both walks call resolveListCandidate; tier ladder; matrix-aware sort
│       ├── unit-price-ordering.ts           # matrix streams (derived relation) in the merge (Q1)
│       ├── price-list-service.ts            # duplicate copies entries; TargetReads type
│       └── buyer-line-price-service.ts      # probe exposes matrixEntryId
├── src/migrations/<stamp>_price_lists_price_matrix_entries.ts   # NEW via migration:new
├── src/migrations/index.ts                  # registered by composer:generate
├── src/admin/
│   ├── pages/PriceListDetailPage.tsx        # + 'matrix' tab
│   ├── components/PriceMatrixTab.tsx        # NEW
│   ├── components/PriceMatrixEntryDialog.tsx# NEW
│   ├── lib/price-matrix-api.ts              # NEW
│   └── lib/price-matrix-format.ts           # NEW (+ co-located .test.ts)
├── i18n/en.json, i18n/pl.json               # + priceMatrix.*, errors.*, activity.*
└── docs/price_lists.md                      # + "Price matrix" section

packages/modules/catalog/docs/catalog/attributes.md   # drop "no attribute-based rule yet"
packages/modules/catalog/src/backend/services/catalog-product-read.service.ts  # + listProductIdsByAttributeValue (Q1)
packages/contracts/src/catalog.ts                     # CatalogProductReadPort + listProductIdsByAttributeValue (Q1)

backend/test/
├── contract/price_lists/price-matrix-entries.test.ts        # NEW
├── contract/price_lists/rule-targets.test.ts                # + attributes picker
├── contract/price_lists/permission-gates.test.ts            # + matrix routes
├── integration/price_lists/price-matrix-resolution.test.ts  # NEW
├── integration/price_lists/listing-prices-batch.test.ts     # + matrix fixture (identity)
├── integration/price_lists/matrix-statement-budget.test.ts  # NEW
├── integration/price_lists/price-matrix-tenant-scope.test.ts# NEW
├── integration/price_lists/price-matrix-lifecycle.test.ts   # NEW (duplicate, cascade, soft-delete marker)
├── integration/price_lists/absent-owner-refuses.test.ts     # + attribute port
├── integration/price_lists/price-matrix-surfaces.test.ts   # NEW (listing = PDP = cart = probe; channel; tier ladder)
├── contract/price_lists/admin-resolved-price.test.ts        # + matrixEntryId
├── integration/price_lists/unit-price-ordering.test.ts      # + matrix-aware sort = card (owner decision Q1)
├── unit/price_lists/price-list-audit-emissions.test.ts      # + matrix actions
└── perf/price_lists/matrix-resolver.bench.ts                # NEW

admin/test/modules/price_lists/PriceMatrixTab.test.tsx       # NEW
docs/i18n/pl/docusaurus-plugin-content-docs/current/modules/price_lists.md   # pl
docs/i18n/pl/docusaurus-plugin-content-docs/current/modules/catalog/attributes.md
docs/translation-cache/pl/packages--modules--price_lists--docs--price_lists.md.json
docs/translation-cache/pl/packages--modules--catalog--docs--catalog--attributes.md.json
.changeset/148-price-lists-price-matrix.md, .changeset/148-contracts-price-matrix.md, .changeset/148-catalog-docs-price-rule.md
backend/src/db/{migrations,entities}-registry.generated.ts   # composer:generate
```

**Structure Decision**: extend the existing `price_lists` module package and the shared contracts
package; tests sit where each layer's tests already sit (co-located package units, backend
contract/integration tree, admin test tree).

## Design notes the implementer needs

1. **Composition** (`specs/conventions/module-composition.md`): add
   `catalogAttributeRead: lazyPort<CatalogAttributeReadPort>(ctx, 'catalogAttributeReadPort')` to
   `targetReads` in `src/backend/index.ts`; extend `PriceListTargetReads` in
   `price-list-service.ts`. `PricingService.#attributeRead()` refuses when unwired, like
   `#categoryRead()` — never "no attribute is eligible".
2. **Engine edit is surgical**: `pickAndResolveBracket` and `pickAndResolveBracketsForSet` keep their
   walk; the line `resolvePriceBracket(rows, currency, qty)` becomes `resolveListCandidate(...)`
   (contract `pricing-resolution-matrix.md` §2–§4). The batched walk handles `needs_reference` by
   collecting product ids, one Default-bracket read, then re-evaluating those products. The cache
   value shape does not change (matrix rows are synthesised `PriceBracketRow`s).
3. **Organization chain** is already computed in both entry points (`organizationChain`); pass it
   through. Anonymous ⇒ `[]`.
4. **Writes** go through a new `PriceMatrixService` that receives `PriceListService`'s audited runner
   (expose `runAudited` as an internal method or construct the service inside `PriceListService`;
   do not create a second Command Bus path). Overlap checks run inside the command after locking the
   parent list row (`em.findOne(PriceList, id, { lockMode: LockMode.PESSIMISTIC_WRITE })`).
5. **Admin labels** are resolved in one batch per page through the existing read ports
   (`findByIds` on products, categories, organizations; `listByFlag` + `optionLabelIndex` for
   attributes), live-only, so a soft-deleted target sets `targetDeleted`.
6. **Generated artefacts**: after the migration and entity, run
   `pnpm --filter backend run composer:generate`, `pnpm --filter backend run manifests:generate`,
   `pnpm install --lockfile-only`; commit what changes (AGENTS.md trap 4).
7. **Static checks to run**: `check:naming`, `check:language`, `check:module-boundary`,
   `check:error-translations`, `check:bundle-pairing`, `check:action-route-permissions`,
   `check:module-docs`, `check:docs-translations`, `i18n:hardcoded`, entity tenant classification,
   `test/unit/db/fk-dependency-drift.test.ts`, `test/contract/admin_users/permission-inventory.test.ts`.
   Read `specs/conventions/check-estate.md` before re-recording any read size.

## Complexity Tracking

No Constitution violation and **no new runtime dependency**; nothing to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Handoff summary for `endora-commerce-dev`

- Work in `/home/mzabielski/www/wt-price-list-rules` on `feat/145-price-list-matrix-rules`; the spec
  directory is **148** (145 is taken).
- Do **not** re-add the attribute flag — `isPriceRule` exists (commit `2d39d9727`); consume it via
  `catalogAttributeReadPort.listByFlag('isPriceRule')`.
- Order: contracts → pure resolver + validation (package unit tests) → migration/entity → engine
  integration (identity + budget tests) → admin API (contract tests, tenancy, audit) → admin UI →
  docs/i18n/changesets → generated artefacts and checks. tasks.md is that order with paths.
- Owner decision Q1 lifts the earlier "leave `orderByUnitPrice` / `pricedProductIds` alone"
  constraint: both become matrix-aware (T057–T061). `namedListPrices` stays as it is beyond the
  pinning test (Q2), and `LinePricePort`, `LinePriceResult` and `BuyerLinePriceAnswer` are not
  widened.
- The full backend suite does not run on merge requests (D-198): run the targeted contract and
  integration paths in tasks.md locally before reporting done.
