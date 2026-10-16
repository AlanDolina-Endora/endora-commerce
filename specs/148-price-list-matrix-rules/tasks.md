# Tasks: Price list matrix rules

**Input**: Design documents from `specs/148-price-list-matrix-rules/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (all present)
**Tests**: REQUIRED — Constitution III (TDD, non-negotiable). Every test task is written and seen
**failing** before the implementation task that follows it.

All paths are relative to the worktree root `/home/mzabielski/www/wt-price-list-rules`.
Abbreviations: `PL` = `packages/modules/price_lists`, `BT` = `backend/test`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 from spec.md

---

## Phase 1: Setup

- [X] T001 Record the baseline in the worktree: `pnpm run build:packages`, then `pnpm --filter @endora-commerce/mod-price-lists run test`, `pnpm --filter @endora-commerce/contracts run test` and `pnpm --filter backend exec vitest run BT/contract/price_lists BT/integration/price_lists`; note any pre-existing red so it is not attributed to this feature
- [X] T002 Scaffold the migration with `pnpm --filter backend run migration:new -- --module price_lists --name price_matrix_entries` → `PL/src/migrations/<stamp>_price_lists_price_matrix_entries.ts` (never pick a number or stamp by hand — `specs/conventions/module-migrations.md`)

---

## Phase 2: Foundational (blocks every story)

- [X] T003 [P] Write failing contract tests in `packages/contracts/test/price-matrix.unit.test.ts` for `priceMatrixEntryInputSchema` (product ⇒ organization required; product excludes category/attribute; fixed ⇒ amount + currency; fixed refused for *all*; percent 0 < p ≤ 100 with ≤ 2 decimals; `maxQuantity ≥ minQuantity`; attribute key/value lengths), `priceMatrixEntryPatchSchema` (`patch_body_empty`), `priceMatrixListQuerySchema` (page/pageSize bounds, `organizationId = 'none'`), `priceMatrixEntrySchema` (incl. `active`, `inactiveReason`, `targetDeleted`) and `PRICE_MATRIX_MAX_ENTRIES_PER_LIST === 5000`
- [X] T004 Implement the schemas and constant of data-model.md §3 in `packages/contracts/src/price-lists.ts` (export through `packages/contracts/src/index.ts` if that file re-exports by name) until T003 passes
- [X] T005 [P] Add `PRICE_MATRIX_ENTRY_NOT_FOUND`, `PRICE_MATRIX_ENTRY_OVERLAP`, `PRICE_MATRIX_ATTRIBUTE_NOT_ELIGIBLE`, `PRICE_MATRIX_ENTRY_LIMIT` to `ERROR_CODES` in `packages/contracts/src/errors.ts`, declare them in `errorCodes` of `PL/src/manifest.ts`, add `errors.<CODE>` sentences to `PL/i18n/en.json` and `PL/i18n/pl.json`, route them as `check:error-translations` requires; run `pnpm --filter backend run check:error-translations`
- [X] T006 Write the DDL of data-model.md §1 (table, CHECKs, FKs with `on delete cascade`, five indexes) into the T002 migration's `up()`; `down()` drops the table
- [X] T007 Create `PL/src/backend/entities/price-list-matrix-entry.entity.ts` (`@RuleScoped()`, columns as data-model §1, `OptionalProps` for defaults) and append it to the `entities` array in `PL/src/backend/index.ts`
- [X] T008 Run `pnpm --filter backend run composer:generate`; keep `backend/src/db/migrations-registry.generated.ts` changes (the entities registry does not change — module entities are read from the `entities` export — and the package `src/migrations/index.ts` barrel is edited by hand, `composer:generate` does not write it); run `pnpm --filter backend exec vitest run BT/unit/db/fk-dependency-drift.test.ts BT/unit/db/migrations-registry.test.ts BT/unit/tenancy/classification-check.test.ts` and `pnpm --filter backend run db:reset` (dev DB) to prove the migration applies and reverts
- [X] T009 [P] Write failing tests in `PL/src/backend/services/matrix-decimal.test.ts`: parse `DECIMAL_STRING`/percent to integer ten-thousandths, `applyDiscount('100.0000','12') = '88.0000'`, half-up at the 5th digit (`'0.0525'` × 33.33% etc.), 100% ⇒ `'0.0000'`, no float drift on 1e9-scale amounts, `compareDecimal`
- [X] T010 Implement `PL/src/backend/services/matrix-decimal.ts` (BigInt-based, no dependency — research R17/R18) until T009 passes
- [X] T011 Wire the attribute read port: add `catalogAttributeRead: lazyPort<CatalogAttributeReadPort>(ctx, 'catalogAttributeReadPort')` to `targetReads` in `PL/src/backend/index.ts`, add the field to `PriceListTargetReads` in `PL/src/backend/services/price-list-service.ts`, thread it through `PL/src/backend/plugin.ts`; add `#attributeRead()` to `PricingService` in `PL/src/backend/services/pricing-service.ts` that throws when unwired (same shape as `#categoryRead()`); run `pnpm --filter backend run check:port-dependencies`
- [X] T012 Add optional `matrixEntryId?: string` to `PriceBracketRow` in `PL/src/backend/services/price-bracket-resolver.ts` and `matrixEntryId?: string | null` to `PricingLineResult` in `PL/src/backend/services/pricing-service.interface.ts`; make `lineFromEngine` in `pricing-service.ts` carry it (assert in `PL/src/backend/services/listing-price-chain.test.ts` or a new case in T013)

**Checkpoint**: schema, table, entity, port wiring and decimal helper exist; nothing prices differently yet.

---

## Phase 3: User Story 1 — Price a catalogue slice for an organization (P1) 🎯 MVP

**Goal**: category / all-products / product entries × organization (with inheritance) × quantity, fixed or percentage, priced by every resolver path and manageable from the admin.
**Independent test**: spec US1 — one entry, Default price 100.00 PLN; Acme 600 units ⇒ 88.00, 400 ⇒ 100.00, other org ⇒ 100.00.

### Tests (write first, see them fail)

- [X] T013 [P] [US1] Write failing tests in `PL/src/backend/services/matrix-price-resolver.test.ts` for `resolveListCandidate` (contract `pricing-resolution-matrix.md` §2–§3): product / category / all selections; organization rank via chain (own org rank 0, parent rank 1, anonymous `[]` matches only org-less); quantity windows incl. open-ended; fixed only in its currency; percentage off own-list bracket; percentage falls back to Default brackets; `needs_reference` when `defaultBrackets === null`; unpriced percentage skipped when `defaultBrackets` supplied but empty; own bracket alone still returns it; returned row carries `matrixEntryId` and the entry's `minQuantity`/`maxQuantity`
- [X] T014 [P] [US1] Write failing tests in `PL/src/backend/services/matrix-entry-rules.test.ts` for pure validation: shape refinements mirrored from the DB CHECKs, overlap detection (same coordinates; currency intersection where `null` intersects all; quantity intersection incl. open-ended), limit check at 5 000, merge-then-validate for PATCH
- [X] T015 [P] [US1] Write failing contract tests in `BT/contract/price_lists/price-matrix-entries.test.ts`: `POST/GET/PATCH/DELETE /api/v1/admin/price-lists-engine/:id/matrix[/:entryId]` happy paths (category × org × percent, product × org × fixed, all × org × percent); 400 `VALIDATION_FAILED` for unknown product/category/organization and unoffered currency; 409 `PRICE_MATRIX_ENTRY_OVERLAP` with `details.conflictingEntryId`; 404 `PRICE_MATRIX_ENTRY_NOT_FOUND` for an entry of another list; 404 `PRICE_LIST_NOT_FOUND` for a missing list; no-op PATCH returns 200 with no audit row
- [X] T016 [P] [US1] Write failing integration tests in `BT/integration/price_lists/price-matrix-resolution.test.ts` covering spec US1 scenarios 1–7 through `pricingService.resolveLinePrice` and one cart line through the carts API (amount and `priceListId` asserted)
- [X] T017 [P] [US1] Extend `BT/integration/price_lists/listing-prices-batch.test.ts` with a matrix fixture (category entry, org-chain entry, percentage needing the Default reference, an entry on a list that falls through) and keep its per-product identity assertion green-by-design (red until T021)
- [X] T018 [P] [US1] Write failing `BT/integration/price_lists/matrix-statement-budget.test.ts`: a 50-product `resolveListingPrices` issues exactly +1 statement over the no-matrix baseline when no entry exists, and ≤ +3 with category, attribute and percentage-reference entries present (count with the same instrumentation `listing-prices-batch.test.ts` uses)

### Implementation

- [X] T019 [US1] Implement `PL/src/backend/services/matrix-price-resolver.ts` (`resolveListCandidate`, `MatrixEntryRow`, the full precedence key of research R8, attribute selection delegated to a matcher that US2 completes — until then an attribute entry is never a candidate) until T013 passes
- [X] T020 [US1] Implement `PL/src/backend/services/matrix-entry-rules.ts` until T014 passes
- [X] T021 [US1] Integrate into `PL/src/backend/services/pricing-service.ts`: per-wave matrix prefetch (data-model §5) in `pickAndResolveBracket` and `pickAndResolveBracketsForSet`, pass `organizationChain`, replace the bracket pick with `resolveListCandidate`, handle `needs_reference` with one Default-list (`isSystem`) bracket read per wave; leave list selection, partitions, display mode and cache keys untouched; T016–T018 pass
- [X] T022 [US1] Implement `PL/src/backend/services/price-matrix-service.ts` (list/get/create/patch/delete; existence checks through the existing target ports; overlap + limit inside the command after locking the parent `PriceList` row) running every write through `PriceListService`'s audited runner with actions `price_list.matrix_entry_create|update|delete`, `objectType: 'price_list'`; register the routes of contract `admin-price-matrix-api.md` §1–§5 in `PL/src/backend/routes.ts` with `readGate`/`writeGate` as `preHandler`; T015 passes
- [X] T023 [US1] Add the three actions to `recentActivity` in `PL/src/manifest.ts` and their `activity.verb.price_list.matrix_entry_*` labels to `PL/i18n/en.json` and `PL/i18n/pl.json`
- [ ] T024 [P] [US1] Write failing tests `PL/src/admin/lib/price-matrix-format.test.ts` (selection summary, `500+` / `1–99`, `9.50 PLN`, `−12%`) and `admin/test/modules/price_lists/PriceMatrixTab.test.tsx` (tab renders on `?tab=matrix`, empty state, create dialog posts the contract body for category × org × percent, table shows the created row)
- [ ] T025 [US1] Implement `PL/src/admin/lib/price-matrix-api.ts`, `PL/src/admin/lib/price-matrix-format.ts`, `PL/src/admin/components/PriceMatrixTab.tsx`, `PL/src/admin/components/PriceMatrixEntryDialog.tsx` (product / category / all selections, organization, quantity, fixed|percent) and the `'matrix'` tab in `PL/src/admin/pages/PriceListDetailPage.tsx` per contract `admin-ui-price-matrix.md`; add the `priceMatrix.*` keys to `PL/i18n/{en,pl}.json`; T024 passes; `pnpm --filter backend run i18n:hardcoded` clean

**Checkpoint**: US1 is shippable alone — an operator can create category/product/all entries per organization and buyers are charged them everywhere the resolver runs.

---

## Phase 4: User Story 2 — Attribute selection gated by *Price list rules* (P1)

**Goal**: attribute and category ∩ attribute selections, eligible only for `isPriceRule` attributes of choice/boolean type; unflagging deactivates without errors.
**Independent test**: spec US2 — flag *Material*, entry on *Stainless*, stainless product discounted, brass not; clear the flag ⇒ not discounted, no error.

### Tests

- [X] T026 [P] [US2] Add failing cases to `PL/src/backend/services/matrix-price-resolver.test.ts`: select/enum equality, multiselect any-of, boolean `'true'`/`'false'` (missing value never matches `'false'`), missing key, attribute absent from `eligibleAttributes` ⇒ not a candidate, category ∩ attribute requires both
- [X] T027 [P] [US2] Add failing contract tests: `GET /api/v1/admin/pricing/rule-targets/attributes` in `BT/contract/price_lists/rule-targets.test.ts` (only flagged + eligible attributes, options with labels, boolean options, `price_lists:read` gate); in `BT/contract/price_lists/price-matrix-entries.test.ts`, 400 `PRICE_MATRIX_ATTRIBUTE_NOT_ELIGIBLE` for each `details.reason` (`not_found`, `not_flagged`, `language_scoped`, `channel_scoped`, `value_type`, `unknown_value`)
- [X] T028 [P] [US2] Add failing integration cases to `BT/integration/price_lists/price-matrix-resolution.test.ts` (spec US2 scenarios 2, 3, 4, 6 — flag flip off ⇒ base price and no error, flag back on ⇒ discount; flip `isPriceRule` through the catalogue admin PATCH, cache TTL 0 in the harness) and extend `BT/integration/price_lists/absent-owner-refuses.test.ts` so an attribute-entry resolution refuses rather than prices when `catalogAttributeReadPort` is unavailable

### Implementation

- [X] T029 [US2] Implement attribute eligibility (`buildEligibleAttributes(views)`) and matching (contract §4–§5) in `PL/src/backend/services/matrix-price-resolver.ts`; in `pricing-service.ts` call `#attributeRead().listByFlag('isPriceRule')` once per resolution only when a prefetched entry has `attributeKey`; T026, T028 pass
- [X] T030 [US2] Implement write-time eligibility (incl. option-value membership) in `matrix-entry-rules.ts` / `price-matrix-service.ts` and the attribute picker route in `PL/src/backend/routes.ts` (labels in the request's admin language, boolean labels from `priceMatrix.attribute.boolean.*`); T027 passes
- [ ] T031 [US2] Derive `active` / `inactiveReason` on every DTO in `price-matrix-service.ts`; in the admin dialog add *Attribute value* and *Category and attribute value* selections and the `priceMatrix.form.noEligibleAttributes` hint, in the table the *Inactive* badge with reason; extend `admin/test/modules/price_lists/PriceMatrixTab.test.tsx` first (attribute flow, inactive badge)

**Checkpoint**: both P1 stories complete — the MVP the owner asked for.

---

## Phase 5: User Story 3 — Precedence and explanation (P2)

**Goal**: the documented, total precedence; the admin probe names the winning entry.
**Independent test**: overlapping entries at each level on one list; each resolution names the expected entry.

- [X] T032 [P] [US3] Add failing precedence cases to `PL/src/backend/services/matrix-price-resolver.test.ts`: org-specific beats a more specific org-less candidate; nearer org beats farther; product > category∩attribute > attribute > category > all; higher `minQuantity` wins at equal level; lower amount wins next; `id` breaks the last tie; own bracket beats an org-less category entry; unpriced best candidate yields to the next
- [X] T033 [P] [US3] Add failing cases to `BT/contract/price_lists/admin-resolved-price.test.ts`: `resolvedPrice.matrixEntryId` is the entry id for a matrix-priced line and `null` for a bracket-priced one
- [X] T034 [P] [US3] Add failing integration cases (spec US3 scenarios 1–5, including fall-through to the next applicable list when the picked list prices nothing) to `BT/integration/price_lists/price-matrix-resolution.test.ts`
- [X] T035 [US3] Make T032–T034 pass: correct the key order in `matrix-price-resolver.ts` if needed; expose `matrixEntryId` from `PL/src/backend/services/buyer-line-price-service.ts` to the probe route response only (do not widen `BuyerLinePriceAnswer` / `LinePriceResult` in contracts)

---

## Phase 6: User Story 4 — Manage the matrix safely (P2)

**Goal**: filters, paging, permissions, tenant scope, audit, duplicate, cascade, deleted-target marker, limit.
**Independent test**: spec US4 scenario 3 — scoped admin cannot observe an out-of-scope entry.

### Tests

- [X] T036 [P] [US4] Write failing `BT/integration/price_lists/price-matrix-tenant-scope.test.ts`: a scoped admin lists only org-less and in-scope entries (`total` excludes the rest); GET/PATCH/DELETE of an out-of-scope entry returns a body byte-identical to a missing entry; creating or moving an entry to an out-of-scope organization answers like an unknown organization; overlap with an invisible entry omits `conflictingEntryId`
- [X] T037 [P] [US4] Extend `BT/contract/price_lists/permission-gates.test.ts`: matrix GET and the attributes picker need `price_lists:read`; POST/PATCH/DELETE need `price_lists:write` and answer 403 before validation; then run `pnpm --filter backend exec vitest run BT/contract/admin_users/permission-inventory.test.ts`
- [X] T038 [P] [US4] Extend `BT/unit/price_lists/price-list-audit-emissions.test.ts`: create/update/delete each emit one Command Bus audit with the action name, `objectType: 'price_list'`, list id and before/after DTOs; a no-op PATCH emits none
- [X] T039 [P] [US4] Write failing `BT/integration/price_lists/price-matrix-lifecycle.test.ts`: duplicate copies entries (new ids, same coordinates) and the duplicate audit `after.matrixEntryCount`; deleting a list removes its entries; a purged product/category/organization row cascades; a soft-deleted category leaves the entry listed with `targetDeleted: true`; the 5 001st entry is refused with `PRICE_MATRIX_ENTRY_LIMIT` (seed 5 000 rows with one native insert)
- [X] T040 [P] [US4] Add list filter, paging and ordering cases (`selectionKind`, `organizationId` incl. `none`, `productId`, `categoryId`; order org-less first, specificity desc, `minQuantity` asc) to `BT/contract/price_lists/price-matrix-entries.test.ts`

### Implementation

- [X] T041 [US4] Apply scope in `price-matrix-service.ts`: parent-list visibility via `ruleVisibleForScope(extractRuleOrgTargets(...))` (move `extractRuleOrgTargets` from `routes.ts` to a shared helper in `PL/src/backend/services/`), entry visibility in the SQL `where` from `orgConstraintFor()`, `isOrgInScope` on create/move; T036 passes
- [X] T042 [US4] Copy matrix entries inside `duplicate()` in `PL/src/backend/services/price-list-service.ts` (same command run) and add `matrixEntryCount` to its audit `after`; T039's duplicate cases pass
- [X] T043 [US4] Implement filters, paging, ordering, batched live-only label resolution and `targetDeleted` in `price-matrix-service.ts`; T039, T040 pass
- [ ] T044 [US4] Admin: filters (selection kind, organization), `PaginationFooter`, read-only notice and hidden write controls without `price_lists:write`, delete confirmation, overlap banner with *Show*, `{count} of {limit}` counter, *deleted item* marker — tests first in `admin/test/modules/price_lists/PriceMatrixTab.test.tsx`, then `PL/src/admin/components/PriceMatrixTab.tsx` / `PriceMatrixEntryDialog.tsx` and `PL/i18n/{en,pl}.json`

---

## Phase 7: User Story 5 — Every price surface agrees (P3)

**Goal**: listing, product page, cart and probe agree; the tier ladder includes matrix starts; out-of-channel lists never apply.
**Independent test**: one matrix-priced product; listing, cart and probe amounts equal; tier ladder lists the entry's start.

- [X] T045 [P] [US5] Write failing `BT/integration/price_lists/price-matrix-surfaces.test.ts`: for an Acme buyer the storefront listing (`resolveListingPrices` via the catalogue route), `/api/v1/storefront/products/:id/resolved-price`, a cart line and the admin probe return the same amount; an entry on a list bound to channel A does not apply on channel B; an unresolved channel never widens the match
- [X] T046 [P] [US5] Add failing cases: `listBracketMinQuantities` returns matrix `min_quantity` values for product-less and same-product entries in matching or `null` currency on active lists only (in `price-matrix-surfaces.test.ts`); and pin Q2 — `namedListPrices` ignores matrix entries (a test named for the limitation, so the follow-up must change it). *(Amended by owner decision Q1: `orderByUnitPrice` / `pricedProductIds` are no longer pinned as ignoring the matrix — see T057–T061.)*
- [X] T047 [US5] Implement the union in `listBracketMinQuantities` in `PL/src/backend/services/pricing-service.ts` (data-model §5); T045, T046 pass

### Owner decision Q1 (2026-10-16) — the price sort sees the matrix (FR-029, SC-007)

- [X] T057 [P] [US5] Write failing tests for a new `catalogProductReadPort.listProductIdsByAttributeValue({ key, value, match })` (`match: 'scalar' | 'array' | 'boolean'` — the three matching rules of contract `pricing-resolution-matrix.md` §5): in `packages/contracts/src/catalog.ts` add the method to `CatalogProductReadPort`; a service test beside `packages/modules/catalog/src/backend/services/catalog-product-read.service.ts` (structural — soft-deleted and inactive products included, like `listProductIdsInCategory`); then implement it and update every structural stub of the port the type-check names
- [X] T058 [P] [US5] Write failing pure tests in `PL/src/backend/services/unit-price-ordering.test.ts` for the matrix-stream SQL shape: a stream with `matrix` emits a derived relation (`distinct on`) instead of the bracket scan, its exclusion predicate for later streams, the amount range / keyset / watermark applied to the derived amount, and a stream without `matrix` byte-identical to today's text
- [X] T059 [P] [US5] Write failing integration cases in `BT/integration/price_lists/unit-price-ordering.test.ts`: a product priced only by a matrix entry sorts by that price (inside the priced stream, not the tail); a matrix entry undercutting a bracket price changes the order; for an organization viewer with category, attribute, product and percentage entries the ordered rows equal `resolveListingPrices` sorted, product by product; `pricedProductIds` includes matrix-only priced products and excludes a percentage entry with no reference; an anonymous viewer is unaffected by org-specific entries; an amount range filters on the matrix price
- [X] T060 [US5] Implement matrix streams: `UnitPriceStream.matrix` and the derived-relation branch + exclusion predicate in `PL/src/backend/services/unit-price-ordering.ts`; in `pricing-service.ts` `#candidateStreams` reads the viewer-applicable quantity-1 entries for all candidate lists in one statement, filters attribute eligibility, expands selections through the catalogue ports and attaches them; `pricedProductIds` uses the same predicate; T058, T059 pass
- [ ] T061 [P] [US5] Extend `BT/perf/price_lists/matrix-resolver.bench.ts` with the price-ordered listing (0 entries vs a category percentage entry vs an *all products* percentage entry) and note the measured cost in `PL/docs/price_lists.md` (performance note) and research R11

---

## Phase 8: Polish & cross-cutting

- [X] T048 [P] Add `BT/perf/price_lists/matrix-resolver.bench.ts` beside `resolver.bench.ts`: 50-product listing with 0, 100 and 5 000 entries on the applicable list
- [ ] T049 [P] Document the matrix in `PL/docs/price_lists.md` (concept, selections, *Price list rules* flag, precedence table, percentage reference, rounding, limit, known limitations Q1/Q2, API table rows)
- [ ] T050 [P] Translate T049 into `docs/i18n/pl/docusaurus-plugin-content-docs/current/modules/price_lists.md` and update `docs/translation-cache/pl/packages--modules--price_lists--docs--price_lists.md.json`; run `pnpm --filter backend run check:docs-translations`
- [ ] T051 [P] Replace "Price Lists have no attribute-based rule yet" in `packages/modules/catalog/docs/catalog/attributes.md` with what the flag now does (name the module, no cross-module link — `module-documentation.md` 1a), and mirror in `docs/i18n/pl/docusaurus-plugin-content-docs/current/modules/catalog/attributes.md` + `docs/translation-cache/pl/packages--modules--catalog--docs--catalog--attributes.md.json`
- [ ] T052 [P] Write changesets: `.changeset/148-price-lists-price-matrix.md` (`@endora-commerce/mod-price-lists` minor), `.changeset/148-contracts-price-matrix.md` (`@endora-commerce/contracts` minor), `.changeset/148-catalog-docs-price-rule.md` (`@endora-commerce/mod-catalog` minor — the new port method, T057 — plus the docs sentence; `@endora-commerce/contracts` minor covers the port) per `specs/conventions/release-intent.md`; run `pnpm --filter backend run check:release-intent -- --since origin/master`
- [ ] T053 Regenerate and commit artefacts: `pnpm --filter backend run composer:generate`, `pnpm --filter backend run manifests:generate`, `pnpm install --lockfile-only` (AGENTS.md trap 4)
- [ ] T054 Run the static checks: `pnpm run check:naming && pnpm run check:language`; `pnpm --filter backend run check:module-boundary check:port-dependencies check:error-translations check:bundle-pairing check:action-route-permissions check:module-docs check:default-language-prose check:test-ownership i18n:hardcoded` (one by one); `pnpm --filter backend exec vitest run BT/unit/_i18n/registered-bundles-shape.test.ts`; read `specs/conventions/check-estate.md` before touching any recorded read size
- [ ] T055 Verify: `pnpm -r run typecheck`, `pnpm -r run lint`, `pnpm --filter backend run test:unit:fast`, `pnpm --filter backend exec vitest run BT/contract/price_lists BT/integration/price_lists BT/integration/carts BT/contract/catalog`, `pnpm --filter '!backend' run test`; report failures with output
- [ ] T056 Walk `specs/148-price-list-matrix-rules/quickstart.md` §1–§5 against a running stack and record the result in the merge request

---

## Dependencies & execution order

- **Phase 1 → Phase 2 → stories.** T003–T012 block everything; within Phase 2, T006 → T007 → T008 and T009 → T010 are ordered, the rest parallel.
- **US1 (Phase 3)** blocks US2–US5 for implementation (they extend the same resolver, service and tab), but their *tests* can be written in parallel once Phase 2 is done.
- **US2** depends on US1's T019/T021/T022/T025. **US3** depends on US1 (and benefits from US2 for the attribute rows of the specificity order). **US4** depends on US1's T022/T025. **US5** depends on US1's T021.
- **Polish** after the stories it documents; T053–T056 last.

```text
T001 → T002 → [T003 ∥ T005 ∥ T009] → T004 ; T006 → T007 → T008 ; T010 ; T011 ; T012
  → US1: [T013 ∥ T014 ∥ T015 ∥ T016 ∥ T017 ∥ T018 ∥ T024] → T019 → T020 → T021 → T022 → T023 → T025
  → US2: [T026 ∥ T027 ∥ T028] → T029 → T030 → T031
  → US3: [T032 ∥ T033 ∥ T034] → T035
  → US4: [T036 ∥ T037 ∥ T038 ∥ T039 ∥ T040] → T041 → T042 → T043 → T044
  → US5: [T045 ∥ T046] → T047 ; [T057 ∥ T058 ∥ T059] → T060 → T061
  → Polish: [T048 ∥ T049 ∥ T050 ∥ T051 ∥ T052] → T053 → T054 → T055 → T056
```

## Parallel examples

- **US1 tests**: T013 (package unit), T014 (package unit), T015 (contract), T016–T018 (integration), T024 (admin) touch six different files.
- **US4 tests**: T036, T037, T038, T039, T040 are five different files.
- **Docs**: T049, T050, T051, T052 are independent.

## Implementation strategy

1. **MVP = Phase 1 + 2 + US1 + US2** (both P1): the owner's request end to end — matrix by category, attribute (flag-gated), quantity, organization and product; audited; in the admin.
2. **US3** hardens precedence and explains prices (needed before multiple overlapping entries are configured in production).
3. **US4** adds the operational guard rails (scope, filters, duplicate, limit) — required before scoped sales representatives get write access.
4. **US5** closes the tier ladder and pins the known limitations.

## Traceability (FR → tests)

| FR | Tests |
| --- | --- |
| FR-001–FR-004 | T003, T014, T015 |
| FR-005 | T014, T015, T036 |
| FR-006 | T015 |
| FR-007 | T014, T039 |
| FR-008, FR-009 | T027 |
| FR-010 | T026, T028, T031 |
| FR-011 | T026, T028 |
| FR-012 | T016, T034 |
| FR-013 | T013, T016 |
| FR-014 | T032, T034 |
| FR-015 | T009, T013 |
| FR-016 | T013, T034 |
| FR-017 | T017, T045 |
| FR-018 | T046 |
| FR-019 | T045 |
| FR-020 | T033 |
| FR-021 | T024, T031, T044 |
| FR-022 | T037 |
| FR-023 | T038 |
| FR-024 | T036 |
| FR-025 | T039 |
| FR-026 | T028 (TTL-0 harness), T015 (same-process read-back) |
| FR-027 | T005, T025, T054 |
| FR-028 | T049–T051 |
| FR-029 | T057, T058, T059, T060 |
| SC-003 | T018, T048 |
| SC-005 | T036 |
| SC-007 | T059 |
