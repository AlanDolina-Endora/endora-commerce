---
description: "Task list for feature 145 — admin product picker"
---

# Tasks: Admin product picker (orders, quote requests, price lists)

**Issues**: #280, #281, #282, #291
(US1 → #282, US2 → #281, US3 → #280, US4 → #291)

**Input**: `specs/145-admin-product-picker/` — [plan.md](./plan.md), [spec.md](./spec.md),
[research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/),
[quickstart.md](./quickstart.md)

**Tests**: mandatory (Constitution III, TDD). In every phase the test tasks come first and must
be **seen failing for the right reason** before the implementation tasks start. Every FR and SC
traces to a task in the table at the end.

**Sizing**: each phase is one builder spawn on a low-RAM host (≤ 10 tasks) and ends with a
**Verification** line of exact, targeted commands. No `pnpm -r`, no whole-suite run.

## Format: `[ID] [P?] [Story?] [PG?] Description`

- **[P]** — parallelizable (different files, no dependency on an unfinished task)
- **[USn]** — the user story (spec.md) the task serves
- **[PG]** — needs the Postgres-backed services (`pnpm run dev:infra`); run the file on its own
- Paths are repository-relative.

## Standing rules for every phase

- **Build before you test** (D-164): every package resolves at its `dist`; after editing
  `packages/<x>`, run `pnpm --filter <x> run build` before any test that imports it.
- Strings: `core` scope only, flat keys, **both** `packages/modules/_i18n/i18n/en.json` and
  `pl.json` in the same task. No hard-coded literal in `.tsx`.
- Kit code never names a module id or a non-`core` namespace (`check:admin-zones`
  `foreign-module-id`, `admin/test/kit/kit-core-namespace.test.tsx`).
- No new dependency, permission code, Setting, error code or migration.
- A changeset is one file per meaning under `.changeset/`, written for the package's consumer;
  `major` is refused in `0.x` (`specs/conventions/release-intent.md`).

---

## Phase 1: Setup — contracts first (Constitution II) (serves #282, #291)

**Purpose**: every shape the later phases build on, in `packages/contracts/`, before any route
or screen.

- [ ] T001 [P] Write the failing test `packages/contracts/src/price-lists.test.ts`: `bulkAddPriceListProductsRequestSchema` rejects `{}`, `{ productIds: [] }`, 201 ids and a non-uuid member, accepts 1 and exactly `ADMIN_PRODUCT_SELECTION_MAX` (200) ids; `bulkAddPriceListProductsResultSchema` parses `{ added, unchanged, failed: [{ productId, reason: 'product_not_found' }] }` and rejects an unknown reason; `bulkAddPriceListProductsResponseSchema` wraps it in `data` (contracts/price-list-bulk-add.md).
- [ ] T002 [P] Extend `packages/contracts/src/orders.test.ts` (failing): `ADMIN_ORDER_PREVIEW_MESSAGE_PRECEDENCE` equals `['PRODUCT_NOT_FOUND','PRODUCT_NOT_VISIBLE_TO_CUSTOMER','PRODUCT_NOT_IN_SALES_CHANNEL','QUOTE_ONLY']` in that order; `adminOrderPreviewMessageCodeSchema.options` equals it; `adminOrderPreviewResponseSchema` still parses a message with an **unknown** code string (additive, not narrowed — FR-027).
- [ ] T003 Add `export const ADMIN_PRODUCT_SELECTION_MAX = 200` with a doc comment (FR-008 cap, shared by the admin product browser and the bulk-add schema) to `packages/contracts/src/catalog.ts`; confirm it is reachable from the package entry (`packages/contracts/src/index.ts`).
- [ ] T004 Add `bulkAddPriceListProductsRequestSchema`, `bulkAddPriceListProductFailureReasonSchema`, `bulkAddPriceListProductsResultSchema`, `bulkAddPriceListProductsResponseSchema`, their `z.infer` types, and `priceListIdParamsSchema` (`{ id: uuidSchema }`, unless an equivalent exists) to `packages/contracts/src/price-lists.ts`, using `ADMIN_PRODUCT_SELECTION_MAX` for `.max()` — makes T001 pass.
- [ ] T005 Add `ADMIN_ORDER_PREVIEW_MESSAGE_PRECEDENCE` (`as const`), `adminOrderPreviewMessageCodeSchema` and `AdminOrderPreviewMessageCode` to `packages/contracts/src/orders.ts`; add a doc comment on `adminOrderPreviewResponseSchema.messages` naming the four codes and the one-message-per-line rule; leave `code: z.string()` untouched — makes T002 pass.
- [ ] T006 [US1] Record the FR-027 justification in the JSDoc of `isProductVisibleTo` in `packages/contracts/src/catalog.ts`: a third exemption ground beside the two "exempt" paragraphs, naming `POST /api/v1/admin/orders/preview`, the two codes, and research.md R-6's four points (the rule's subject is a buyer; the route is admin-only, `orders:write`, scope-checked by `assertCustomerInScope`; visibility and assortment are already the operator's to read; every buyer-facing seam keeps one `PRODUCT_NOT_FOUND`).
- [ ] T007 Write `.changeset/145-contracts-product-selection.md` — `@endora-commerce/contracts`: **minor**; names `ADMIN_PRODUCT_SELECTION_MAX`, the bulk-add schemas, `adminOrderPreviewMessageCodeSchema` / `ADMIN_ORDER_PREVIEW_MESSAGE_PRECEDENCE`, and states that `messages[].code` is unchanged on the wire.

**Verification**:
`pnpm --filter @endora-commerce/contracts run build && pnpm --filter @endora-commerce/contracts run typecheck && pnpm --filter @endora-commerce/contracts run lint && pnpm --filter @endora-commerce/contracts exec vitest run src/price-lists.test.ts src/orders.test.ts`

---

## Phase 2: Foundational — the product browser in admin-kit (serves #280, #282, #291)

**Purpose**: the shared picker every story uses (FR-001…FR-014) and the quick-search extension
(FR-020). **Blocks Phases 3–8's screen work.** Contract:
[contracts/product-browser-component.md](./contracts/product-browser-component.md).

- [ ] T008 [P] Write the failing pure test `admin/test/kit/kit-product-browser-selectability.test.ts` for `productSelectability`: reason order `alreadyAdded` → `typeBlocked` → `statusBlocked` → `limitReached`; a selected row stays de-selectable at the cap; the three host rule sets of research R-4 over every `status × type` (derive the cases from `productStatusSchema.options` / `productTypeSchema.options` in `@endora-commerce/contracts`, not a hand table).
- [ ] T009 [P] Write the failing component test `admin/test/kit/kit-product-browser.test.tsx` (mock `apiClient` as `kit-pickers.test.tsx` does; render the **shipped** `_i18n` bundle in `en` and `pl`, as `kit-core-namespace.test.tsx` does) covering contract behaviours B1–B14: request parameters incl. `includeArchived=1`, debounce, stale-response discard; tabs with counts opening on `rules.initialStatus`; type filter; columns and the pl second line; pagination with page-size preference; selection persisting across page / page-size / filter changes; header checkbox adds only the current page's selectable rows; "N selected", Clear, Show selected only; Add N disabled at 0; 200-cap notice and disabled rows; reasons on non-selectable rows; loading / empty (Add still enabled) / load-error + Retry; sync confirm returns items in selection order; async confirm pending → resolve closes, reject keeps open with selection and **Retry** re-invokes with the same items; Esc and scrim cancel without calling `onConfirm`; focus enters on open and returns to the trigger; trigger disabled with hint without `catalog:read`.
- [ ] T010 [P] Extend `admin/test/kit/kit-pickers.test.tsx` (failing) for `ProductPicker`'s additive props: with `rules` + `alreadyAddedIds`, a grouped / draft / already-added option is rendered disabled with its translated reason; `onPickProduct` receives the full summary incl. `type`; without the new props the existing behaviour is unchanged (the `seo` usage).
- [ ] T011 Create `packages/admin-kit/src/components/product-browser/types.ts` (`ProductBrowserItem`, status/type unions from the contracts schemas) and `selectability.ts` (`ProductBrowserRules`, `productSelectability`) — makes T008 pass.
- [ ] T012 Create `packages/admin-kit/src/components/product-browser/product-browser-api.ts`: the list query builder and fetch over `GET /api/v1/admin/catalog/products` through the kit `lib` barrel's `apiClient` (as `ProductPicker.tsx` does), returning rows, `pagination` and `counts`.
- [ ] T013 Create `packages/admin-kit/src/components/product-browser/ProductBrowserDialog.tsx` composed from `b2b-scrim` / `b2b-drawer b2b-drawer--wide`, `useFocusTrap`, `ResponsiveTable mode="table-scroll"`, `Checkbox`, `Badge`, `PaginationFooter`, `usePageSizePreference('catalog-products')`, the `b2b-tabs` / `b2b-filterbar` classes; session state per data-model.md; `useTranslation('core')` only.
- [ ] T014 Create `packages/admin-kit/src/components/product-browser/ProductBrowserTrigger.tsx` (**Browse products**; disabled with `productBrowser.trigger.noPermission` when `useAuth().hasPermission('catalog:read')` is false, combined with a host `disabled`/`disabledReason`) — with T013 makes T009 pass.
- [ ] T015 Extend `packages/admin-kit/src/components/product-picker/ProductPicker.tsx` with optional `rules`, `alreadyAddedIds`, `onPickProduct` (and `type` on its summary); disable it with the same `catalog:read` hint — makes T010 pass. Export the new symbols explicitly from `packages/admin-kit/src/components/index.ts` (no `export *`).
- [ ] T016 Add every `productBrowser.*` key of contracts/product-browser-component.md § Keys to `packages/modules/_i18n/i18n/en.json` **and** `pl.json` (flat; `productBrowser.action.confirm` → "Add {count}" / "Dodaj {count}"; status and type labels translated); write `.changeset/145-admin-kit-product-browser.md` (`@endora-commerce/admin-kit` **minor**, naming `ProductBrowserDialog`, `ProductBrowserTrigger`, `productSelectability`, the new `ProductPicker` props) and `.changeset/145-i18n-product-browser.md` (`@endora-commerce/mod-i18n` **patch**).

**Verification**:
`pnpm --filter @endora-commerce/contracts run build && pnpm --filter @endora-commerce/mod-i18n run build && pnpm --filter @endora-commerce/admin-kit run build && pnpm --filter @endora-commerce/admin-kit run typecheck && pnpm --filter @endora-commerce/admin-kit run lint && pnpm --filter admin exec vitest run test/kit/kit-product-browser-selectability.test.ts test/kit/kit-product-browser.test.tsx test/kit/kit-pickers.test.tsx test/kit/kit-core-namespace.test.tsx test/kit/admin-kit-identity.test.ts && pnpm --filter backend exec vitest run --config vitest.unit.config.ts test/unit/_i18n/registered-bundles-shape.test.ts && pnpm --filter backend run i18n:hardcoded -- packages/admin-kit/src/components/product-browser`

**Checkpoint**: the picker works in isolation; host stories can start.

---

## Phase 3: User Story 2 — Items and summary hidden until the order can be priced (P1) — issue #281

**Goal**: on `/orders/new`, **Items** and **Order summary** appear only once customer and sales
channel are set; a hint names what is missing; lines survive hiding (FR-021, FR-025).

**Independent test**: open `/orders/new` fresh, set customer then channel; the sections appear
only after both, without payment, delivery or addresses.

- [ ] T017 [P] [US2] Write the failing test `admin/test/modules/orders/OrderCreatePage.gating.test.tsx`: fresh form → neither section, hint names customer and sales channel (US2 sc. 1); customer only → hint names the channel; both → **Items** shown, summary after the first priced line (sc. 2); change customer or channel with lines → lines kept and a new preview request sent (sc. 3); clear a required field → both hidden, set again → the same lines back (sc. 4, FR-025); opened with `customerAccountId` + `salesChannelId` → **Items** at once (sc. 5); hidden lines still make the form dirty for the unsaved-changes prompt (Edge Cases).
- [ ] T018 [US2] In `packages/modules/orders/src/admin/pages/OrderCreatePage.tsx`, render the **Items** card and the **Order summary** card only when `customerAccountId && salesChannelId`; otherwise one hint card using new keys `orderCreate.gate.missingCustomer`, `orderCreate.gate.missingChannel`, `orderCreate.gate.missingBoth` (add to `_i18n` `en.json` **and** `pl.json`). Keep the lines in state while hidden.
- [ ] T019 [US2] In the same file, make the dirty computation count lines whether or not they are shown — makes T017 pass.

**Verification**:
`pnpm --filter @endora-commerce/mod-i18n run build && pnpm --filter @endora-commerce/mod-orders run build && pnpm --filter @endora-commerce/mod-orders run typecheck && pnpm --filter @endora-commerce/mod-orders run lint && pnpm --filter admin exec vitest run test/modules/orders/OrderCreatePage.gating.test.tsx test/modules/orders/OrderCreatePage.methods-by-channel.test.ts`

---

## Phase 4: User Story 1 (backend) — preview reports visibility and assortment (P1) — issue #282

**Goal**: the order preview marks a line the customer cannot see, or that is outside the order's
chosen channel's assortment, with its own code; one message per line; precedence
`PRODUCT_NOT_FOUND` > visibility > assortment > `QUOTE_ONLY` (FR-024, FR-027, SC-008). Contract:
[contracts/order-preview-unavailability.md](./contracts/order-preview-unavailability.md).

**Independent test**: preview a restricted product and an out-of-channel product for a customer
and see the two codes, other lines priced.

- [ ] T020 [P] [US1] Write the failing unit test `packages/modules/orders/src/backend/services/preview-line-availability.test.ts`: `previewLineAvailability({ product, organizationId, inChannel })` returns `PRODUCT_NOT_FOUND` for `null`; for every `productVisibilitySchema.options` × allow-list (empty / naming the org / naming another org) derives the expected visibility from `isProductVisibleTo` itself and asserts `PRODUCT_NOT_VISIBLE_TO_CUSTOMER` when it is `false` **regardless of `inChannel`**; `PRODUCT_NOT_IN_SALES_CHANNEL` only for a visible product with `inChannel: false`; `available` otherwise. Codes are taken from `ADMIN_ORDER_PREVIEW_MESSAGE_PRECEDENCE`, never literals.
- [ ] T021 [P] [US1] [PG] Write the failing contract test `backend/test/contract/orders/admin-order-preview-availability.test.ts` (seed setup modelled on `backend/test/contract/orders/admin-order-preview.test.ts` and the channel-membership setup in `backend/test/contract/orders/place-order-request-channel.test.ts`): a product whose `allowedOrganizationIds` excludes the customer's org → `unavailable`, one message `PRODUCT_NOT_VISIBLE_TO_CUSTOMER`, the other line priced and in the subtotal (US1 sc. 11); a visible product in channel A only, previewed on B → `PRODUCT_NOT_IN_SALES_CHANNEL`, on A → priced, no message (sc. 12, Principle XII cross-channel); restricted **and** out of channel → exactly one message, the visibility code, on both channels; customer switched to the permitted org on channel B → the assortment code (sc. 13); an unknown product id → `PRODUCT_NOT_FOUND` only; a quote-only product that is visible and in channel → `QUOTE_ONLY` only; a `salesChannelId` naming no channel → every existing visible line `PRODUCT_NOT_IN_SALES_CHANNEL` (fail closed, research R-7); exactly one `messages` entry per unavailable line in every case.
- [ ] T022 [US1] Create `packages/modules/orders/src/backend/services/preview-line-availability.ts` (pure; imports `isProductVisibleTo` and the precedence constant from `@endora-commerce/contracts`) — makes T020 pass.
- [ ] T023 [US1] Thread the `salesChannelMembership` option that `packages/modules/orders/src/backend/plugin.ts` already receives into `registerOrderRoutes`' `OrdersDeps` (`packages/modules/orders/src/backend/routes.ts`) as `salesChannelMembership?: SalesChannelMembershipPort`; the preview handler fails closed with `500 INTERNAL` naming the missing port when it is absent (never "in assortment"). Check every test rig that constructs the plugin for the option (`grep -rn "registerOrderRoutes\|ordersPlugin" backend/test packages/modules/orders/src`).
- [ ] T024 [US1] Rewrite the preview loop in `packages/modules/orders/src/backend/routes.ts`: one `catalogProductRead.findByIds(uniqueIds)` (default lookup options), `previewLineAvailability` per line with `organizationId: customer.organizationId`, **one** `salesChannelMembership.filterEntityIdsInChannel(body.salesChannelId, 'product', idsThatPassedSteps1and2)` — not `outOfRequestChannel`, not the pricing fallback channel; unavailable lines keep the existing `{ unitPrice: '0', lineTotal: 0, unavailable: true }` shape and add nothing to subtotal or VAT; `QUOTE_ONLY` stays after pricing — makes T021 pass.
- [ ] T025 [US1] [PG] Run the unchanged existing preview test and the create-order contract test to prove the rewrite moved no existing behaviour (no edits to either file).
- [ ] T026 [US1] Write `.changeset/145-orders-preview-availability.md` — `@endora-commerce/mod-orders` **minor**: the preview reports `PRODUCT_NOT_VISIBLE_TO_CUSTOMER` and `PRODUCT_NOT_IN_SALES_CHANNEL` (one message per line, the precedence), evaluated against the body's `salesChannelId`; the create path is unchanged.

**Verification**:
`pnpm --filter @endora-commerce/contracts run build && pnpm --filter @endora-commerce/mod-orders run build && pnpm --filter @endora-commerce/mod-orders run typecheck && pnpm --filter @endora-commerce/mod-orders run lint && pnpm --filter @endora-commerce/mod-orders exec vitest run src/backend/services/preview-line-availability.test.ts && pnpm --filter backend exec vitest run test/contract/orders/admin-order-preview-availability.test.ts && pnpm --filter backend exec vitest run test/contract/orders/admin-order-preview.test.ts && pnpm --filter backend exec vitest run test/contract/orders/admin-create.test.ts` (the last three **[PG]**, one at a time)

---

## Phase 5: User Story 1 (admin) — bulk-add products to a new order (P1) — issue #282 🎯 MVP

**Goal**: **Browse products** and the quick search are the only ways to add lines; lines show
name, SKU, quantity, unit price, line total; the two new codes render their own reasons
(FR-020, FR-022…FR-024, FR-026).

**Independent test**: with customer and channel chosen, add 20 products from two pages of a
filtered table in one action, set quantities, see unit price and line total per line and the
summary.

- [ ] T027 [US1] Rewrite the flows in `admin/test/modules/orders/OrderCreatePage.test.tsx` that type into the removed per-row `product-${i}` combobox so they add lines through the quick search instead (same assertions on preview requests and the create payload — FR-026, SC-006); they fail until T030.
- [ ] T028 [P] [US1] Write the failing test `admin/test/modules/orders/OrderCreatePage.product-browser.test.tsx`: picker opens on Active with the order rules (sc. 1, 7); 5 + 3 across a page change and a filter change → "8 selected" (sc. 2); **Add 8** → 8 lines, quantity 1, unit price and line total from the mocked preview, summary updated (sc. 3); quantity change → new preview, line and summary update (sc. 4); an existing line's row is *already added* (sc. 5); cancel adds nothing (sc. 10); 200-cap message (sc. 9); quick search by SKU appends one line and applies the same rules (sc. 8, FR-020); mocked messages `PRODUCT_NOT_VISIBLE_TO_CUSTOMER` / `PRODUCT_NOT_IN_SALES_CHANNEL` / `PRODUCT_NOT_FOUND` / `QUOTE_ONLY` / an unknown code render `orderCreate.line.notVisible` / `notInChannel` / **No price** ×3 and disable submit while other lines keep prices (sc. 6, 11–13); quantity `0` or `abc` marks the line, excludes it from the preview body and disables submit; the create payload lists exactly the visible lines.
- [ ] T029 [US1] Refactor the line model in `packages/modules/orders/src/admin/pages/OrderCreatePage.tsx` to `{ productId, sku, name, quantityInput }` keyed by `productId`, no initial empty row; integer-≥-1 validation with `orderCreate.line.quantityInvalid`; preview and submit use only valid lines; submit additionally requires every line valid.
- [ ] T030 [US1] In the same file, replace the per-row `ProductPicker` with `ProductBrowserTrigger` + `ProductBrowserDialog` (rules `{ initialStatus: 'active', blockedTypes: ['grouped','bundle'], blockedStatuses: ['draft','inactive'] }`, `alreadyAddedIds` = line ids, sync `onConfirm` appending in selection order) and a quick-search `ProductPicker` (`mode="select"`, `value={null}`, `includeArchived`, same rules, `onPickProduct` appending one line); the line shows name and SKU — makes T027 pass.
- [ ] T031 [US1] In the same file, map each line's preview message code to its reason (contracts/order-preview-unavailability.md § Consumer mapping) using `ADMIN_ORDER_PREVIEW_MESSAGE_PRECEDENCE` members, unknown → **No price**; add `orderCreate.line.notVisible`, `orderCreate.line.notInChannel`, `orderCreate.line.quantityInvalid`, `orderCreate.items.browse`, `orderCreate.items.quickSearch`, `orderCreate.items.empty` to `_i18n` `en.json` **and** `pl.json` — makes T028 pass.
- [ ] T032 [US1] Append to `.changeset/145-orders-preview-availability.md` a second paragraph for the screen (product browser on **Create order**, gating, per-cause line reasons).

**Verification**:
`pnpm --filter @endora-commerce/mod-i18n run build && pnpm --filter @endora-commerce/admin-kit run build && pnpm --filter @endora-commerce/mod-orders run build && pnpm --filter @endora-commerce/mod-orders run typecheck && pnpm --filter @endora-commerce/mod-orders run lint && pnpm --filter admin exec vitest run test/modules/orders/OrderCreatePage.test.tsx test/modules/orders/OrderCreatePage.product-browser.test.tsx test/modules/orders/OrderCreatePage.gating.test.tsx test/modules/orders/order-entry-tabs-zone.test.tsx && pnpm --filter backend run i18n:hardcoded -- packages/modules/orders/src/admin/pages/OrderCreatePage.tsx`

**Checkpoint**: US1 + US2 deliver the MVP.

---

## Phase 6: User Story 3 — bulk-add products to a new quote request (P2) — issue #280

**Goal**: same entry points on **Line items**; agreed price prefilled without overwriting a
hand-typed one; nothing silently dropped (FR-030…FR-036).

**Independent test**: with a customer (with an organization), add 10 products, see quantity 1 and
prefilled prices where one resolves, edit, submit.

- [ ] T033 [US3] Rewrite the flows in `admin/test/modules/quote_requests/RfqCreatePage.origin.test.tsx` that use the removed per-row `product-${i}` combobox to add lines through the quick search (origin / returnTo assertions unchanged); they fail until T037.
- [ ] T034 [P] [US3] Write the failing pure test `admin/test/modules/quote_requests/price-prefill-queue.test.ts` for a small queue in `packages/modules/quote_requests/src/admin/lib/price-prefill-queue.ts`: at most 4 requests in flight; a response whose `(productId, quantity, customerId)` key no longer matches the line is discarded; a removed line's response is discarded; order of completion does not matter.
- [ ] T035 [P] [US3] Write the failing test `admin/test/modules/quote_requests/RfqCreatePage.product-browser.test.tsx`: picker with the quote-request rules — Draft/Inactive selectable, grouped/bundle not (sc. 1, 7); **Add 10** → 10 lines, quantity 1, prices prefilled where `resolved-price` answers, empty otherwise (sc. 2); quantity edit re-prefills only a non-hand-edited line (sc. 3, FR-033); price edit updates the running total (sc. 4, FR-035); an empty price marks the line and blocks submit, no line dropped from the payload (sc. 5, FR-034); invalid quantity likewise; already-added rows (sc. 6); lines added before a customer have empty prices and fill once a customer with an organization is chosen (FR-032); customer change clears and re-resolves non-manual prices (research R-11); the no-organization warning stays (FR-036); quick search appends one line.
- [ ] T036 [US3] Implement `packages/modules/quote_requests/src/admin/lib/price-prefill-queue.ts` over the existing `GET /api/v1/admin/products/:id/resolved-price` — makes T034 pass.
- [ ] T037 [US3] In `packages/modules/quote_requests/src/admin/pages/RfqCreatePage.tsx`: line model `{ productId, sku, name, quantityInput, agreedUnitPrice, priceSource }` keyed by `productId`; replace the per-row combobox with `ProductBrowserTrigger` + `ProductBrowserDialog` (rules `{ initialStatus: 'active', blockedTypes: ['grouped','bundle'] }`) and the quick-search `ProductPicker` (`includeArchived`, same rules); typing a price sets `manual`; prefill through the queue on add, quantity change and customer change (clearing non-manual prices first) — makes T033 pass.
- [ ] T038 [US3] In the same file: mark empty price (`rfqCreate.line.priceMissing`) and invalid quantity (`rfqCreate.line.quantityInvalid`), block submit on either, submit every line (no filtering), running total over valid lines; add those keys plus `rfqCreate.items.browse`, `rfqCreate.items.quickSearch`, `rfqCreate.items.empty` to `_i18n` `en.json` **and** `pl.json` — makes T035 pass.
- [ ] T039 [US3] Write `.changeset/145-quote-requests-product-browser.md` — `@endora-commerce/mod-quote-requests` **patch**: product browser and quick search on **Create quote request**; hand-typed agreed prices are no longer overwritten; incomplete lines block submit instead of being dropped.

**Verification**:
`pnpm --filter @endora-commerce/mod-i18n run build && pnpm --filter @endora-commerce/admin-kit run build && pnpm --filter @endora-commerce/mod-quote-requests run build && pnpm --filter @endora-commerce/mod-quote-requests run typecheck && pnpm --filter @endora-commerce/mod-quote-requests run lint && pnpm --filter admin exec vitest run test/modules/quote_requests/price-prefill-queue.test.ts test/modules/quote_requests/RfqCreatePage.product-browser.test.tsx test/modules/quote_requests/RfqCreatePage.origin.test.tsx && pnpm --filter backend run i18n:hardcoded -- packages/modules/quote_requests/src/admin/pages/RfqCreatePage.tsx`

---

## Phase 7: User Story 4 (backend) — price-list bulk-add endpoint (P2) — issue #291

**Goal**: `POST /api/v1/admin/price-lists-engine/:id/products/bulk-add` per
[contracts/price-list-bulk-add.md](./contracts/price-list-bulk-add.md) (FR-042, FR-043, FR-044
server half, FR-045, SC-006, SC-007).

**Independent test**: one request with a mix of new, already-present and soft-deleted ids answers
`{ added, unchanged, failed }`, writes one audit entry, leaves existing brackets untouched.

- [ ] T040 [P] [US4] Write the failing unit test `packages/modules/price_lists/src/backend/services/bulk-add-partition.test.ts` for a pure `partitionBulkAdd({ requested, onRoster, live })`: de-duplicates keeping first occurrence; `unchanged` before `failed` before `added`; every unique id in exactly one bucket; `added` in request order; `failed` reason `product_not_found`.
- [ ] T041 [P] [US4] [PG] Write the failing contract test `backend/test/contract/price_lists/price-list-products-bulk-add.test.ts` (setup as `backend/test/contract/price_lists/price-list-products.test.ts`; audit rows read as `backend/test/unit/price_lists/price-list-audit-emissions.test.ts` does): 30 new ids → 200, all `added`, roster has them, exactly **one** `price_list.products_add` entry with counts and no id list (US4 sc. 3, 9); 2 of them soft-deleted first → 28 `added`, 2 `failed: product_not_found` (sc. 4); one already on the list → `unchanged`, its brackets byte-for-byte equal before/after, the others `added` (sc. 5, 8, FR-042, SC-006); all already present → 200, zero audit entries; 200 ids → one entry (SC-007); Default list → 403 `FORBIDDEN`, roster unchanged, no entry (sc. 10); unknown id and a deleted list → 404 `NOT_FOUND`, nothing written (sc. 11); 201 ids, `[]`, a non-uuid member, a non-object body → 400 `VALIDATION_FAILED`, nothing written, no entry (sc. 12); a role without `price_lists:write` → 403; a retry of an accepted body → all `unchanged`, no entry.
- [ ] T042 [US4] Create `packages/modules/price_lists/src/backend/services/bulk-add-partition.ts` — makes T040 pass.
- [ ] T043 [US4] Add `PriceListService.addProducts(priceListId, productIds, auditCtx)` to `packages/modules/price_lists/src/backend/services/price-list-service.ts` through `#runAudited('price_list.products_add', …)`: `getById` (404) → `isSystem` (403, sentence in the style of the existing Default guards) → roster rows for the ids → `targets().catalogProductRead.findByIds(rest, { liveOnly: true })` → `partitionBulkAdd` → create rows, bump `modifiedAt` → after-state `{ name, added, unchanged, failed }` counts, or `skipAudit` when nothing was added. No hand-written audit call.
- [ ] T044 [US4] Register the route in `packages/modules/price_lists/src/backend/routes.ts` inside `registerPricingRoutes`: `preHandler: writeGate`, `schema: { params: priceListIdParamsSchema, body: bulkAddPriceListProductsRequestSchema }`, `200 { data }`, `buildAuditCtx` passed — makes T041 pass. The existing `POST`/`PUT …/products` are untouched.
- [ ] T045 [US4] [PG] Re-record the OpenAPI frozen baseline: `UPDATE_OPENAPI_BASELINE=1 pnpm --filter backend exec vitest run test/contract/kernel/openapi-baseline.test.ts`, inspect the diff of `backend/test/fixtures/openapi-baseline.json` (only the new route), then run the test again **without** the variable — green.
- [ ] T046 [US4] Write `.changeset/145-price-lists-bulk-add.md` — `@endora-commerce/mod-price-lists` **minor**: the new route, its body/response, its refusals (403 Default, 404 unknown, 400 invalid) and the one-audit-entry rule.

**Verification**:
`pnpm --filter @endora-commerce/contracts run build && pnpm --filter @endora-commerce/mod-price-lists run build && pnpm --filter @endora-commerce/mod-price-lists run typecheck && pnpm --filter @endora-commerce/mod-price-lists run lint && pnpm --filter @endora-commerce/mod-price-lists exec vitest run src/backend/services/bulk-add-partition.test.ts && pnpm --filter backend exec vitest run test/contract/price_lists/price-list-products-bulk-add.test.ts && pnpm --filter backend exec vitest run test/contract/price_lists/price-list-products.test.ts && pnpm --filter backend exec vitest run test/unit/price_lists/price-list-audit-emissions.test.ts && pnpm --filter backend exec vitest run test/contract/kernel/openapi-baseline.test.ts && pnpm --filter backend exec vitest run test/contract/admin_users/permission-inventory.test.ts && pnpm --filter backend run check:command-coverage` (the five vitest files **[PG]**, one at a time)

---

## Phase 8: User Story 4 (admin) — bulk-add on Products & brackets (P2) — issue #291

**Goal**: **Add** opens the product browser over the whole catalogue; one bulk request; the roster
shows every product by name and opens every bracket editor; confirm-failure with **Retry**
(FR-040, FR-041, FR-043 screen half, FR-044 client half, FR-010, SC-003).

**Independent test**: on a non-system list, add 30 products from more than one page in one action;
the roster shows all 30 by name, each opens the bracket editor, earlier brackets unchanged.

- [ ] T047 [P] [US4] Write the failing test `admin/test/modules/price_lists/PriceListProducts.bulk-add.test.tsx` (render `ProductsAndBracketsPanel` through `PriceListDetailPage`): **Add** opens the browser on All with every type/status selectable (sc. 1, FR-012); roster products marked *already on this price list* (sc. 2); **Add 30** → exactly one `POST …/products/bulk-add` with the 30 ids in selection order, drawer closes, roster refreshed, first added selected with its editor (sc. 3); response with 2 `failed` → message naming both products with the translated reason, 28 on the roster (sc. 4); `unchanged` shows no error (sc. 8); no `added` → selection left as it was; refusal (404 / 403 / 500), network error → drawer open, selection kept, error + **Retry**, Retry re-sends the same body (sc. 13); confirm and Retry disabled in flight; Default list → **Add** disabled (sc. 6); without `price_lists:write` → **Add** disabled with hint (FR-044); a roster of 700 ids → names via `batch-by-id` in two chunks (500 + 200), every row named, selecting a product beyond the newest 20 opens its editor (sc. 7, SC-003).
- [ ] T048 [P] [US4] Write the failing pure test `admin/test/modules/price_lists/roster-product-names.test.ts` for `packages/modules/price_lists/src/admin/lib/roster-product-names.ts`: chunks of ≤ 500 ids, ≤ 2 requests in flight, merges pages, ids not returned stay absent (id-prefix fallback).
- [ ] T049 [US4] Implement `packages/modules/price_lists/src/admin/lib/roster-product-names.ts` over `POST /api/v1/admin/catalog/products/batch-by-id` (`{ ids, page: 0, pageSize: 500 }`) — makes T048 pass.
- [ ] T050 [US4] In `packages/modules/price_lists/src/admin/pages/PriceListDetailPage.tsx`: replace the unparameterised `GET /api/v1/admin/catalog/products` in `refresh()` with `roster-product-names`; render the bracket editor for any selected roster entry, its header falling back to the id prefix when the name is unknown (removes the *Loading product…* dead end).
- [ ] T051 [US4] In the same file: **Add** opens `ProductBrowserDialog` (rules `{ initialStatus: 'all', alreadyAddedLabelKey: 'priceLists.detail.picker.alreadyOnList' }`, `alreadyAddedIds` = roster ids); async `onConfirm` posts the bulk add and resolves on 2xx / rejects otherwise; on resolve refresh, select the first `added` (selection order), show the failed-products message; **Add** disabled on the system list and when `useAuth().hasPermission('price_lists:write')` is false (`priceLists.detail.products.add.noPermission`).
- [ ] T052 [US4] Delete the old `ProductPickerDialog` and `handleAddProduct` from the same file; add `priceLists.detail.picker.alreadyOnList`, `priceLists.detail.bulkAdd.failed` (with `{count}` and the product list), `priceLists.detail.bulkAdd.failed.product_not_found`, `priceLists.detail.bulkAdd.error`, `priceLists.detail.products.add.noPermission` to `_i18n` `en.json` **and** `pl.json`; remove `priceLists.detail.picker.{empty,error.load,searchPlaceholder,subtitle}` from both **only if** `grep -rn` finds no other reader — makes T047 pass.
- [ ] T053 [US4] Append to `.changeset/145-price-lists-bulk-add.md` a paragraph for the screen (product browser on **Add**, roster names for any catalogue size, bracket editor for every roster product, write-permission gate).

**Verification**:
`pnpm --filter @endora-commerce/mod-i18n run build && pnpm --filter @endora-commerce/admin-kit run build && pnpm --filter @endora-commerce/mod-price-lists run build && pnpm --filter @endora-commerce/mod-price-lists run typecheck && pnpm --filter @endora-commerce/mod-price-lists run lint && pnpm --filter admin exec vitest run test/modules/price_lists/roster-product-names.test.ts test/modules/price_lists/PriceListProducts.bulk-add.test.tsx test/modules/price_lists/price-lists-zones.test.tsx test/modules/price_lists/LinkedPriceListsPanel.test.tsx && pnpm --filter backend run i18n:hardcoded -- packages/modules/price_lists/src/admin/pages/PriceListDetailPage.tsx`

---

## Phase 9: Polish & cross-cutting (serves #280, #281, #282, #291)

**Purpose**: documentation in both languages, the tree-reading static checks, and the traps.

- [ ] T054 [P] Update `packages/modules/orders/docs/orders.md` (Create order: gating, Browse products, quick search, per-cause line reasons and what to change for each); write the Polish cache entry `docs/translation-cache/pl/packages--modules--orders--docs--orders.md.json` (`sourceHash` per `hashSourceBody()` in `backend/scripts/lib/docs-translation-cache.ts`) and the materialised `docs/i18n/pl/docusaurus-plugin-content-docs/current/modules/orders.md`.
- [ ] T055 [P] Same for `packages/modules/quote_requests/docs/quote_requests.md` (Line items: Browse products, quick search, prefill rule, blocking of incomplete lines) and its PL cache entry and materialisation.
- [ ] T056 [P] Same for `packages/modules/price_lists/docs/price_lists.md` (Products & brackets: Add with the product browser, partial results, the Default list, Retry; the bulk-add endpoint with its refusals) and its PL cache entry and materialisation.
- [ ] T057 Run `pnpm --filter backend run check:docs-translations` and `pnpm --filter backend run check:module-docs`; fix any `stale-translation` / `missing-translation` finding.
- [ ] T058 Run the tree-reading static checks and fix every finding this feature caused (do **not** re-record a read size the band accepts; read `specs/conventions/check-estate.md` first if one refuses): `pnpm --filter backend run check:module-boundary`, `check:admin-surface`, `check:admin-zones`, `check:bundle-pairing`, `check:command-coverage`, `i18n:hardcoded`. `i18n:hardcoded`'s `HARDCODED_STRINGS_BASELINE` is a two-way ratchet: if the rewritten `OrderCreatePage.tsx` / `RfqCreatePage.tsx` / `PriceListDetailPage.tsx` now hold *fewer* literals, **lower** their entries; never raise one. Docs pages (T054–T056) name sibling modules in prose, never as relative links (`foreign-module-link`, `site-tree-link`).
- [ ] T059 Trap sweep (AGENTS.md § traps): `grep -rn "ProductPickerDialog\|handleAddProduct\|product-0\|priceLists.detail.picker.searchPlaceholder" backend/test admin/test packages` returns nothing stale; nothing under `backend/test/**` imports a moved or deleted path.
- [ ] T060 Walk [quickstart.md](./quickstart.md) §1–§4 on a local stack and record the outcome in the merge-request description (incl. the three *Open items* of research.md for the product owner).

**Verification**:
`pnpm --filter backend run check:docs-translations && pnpm --filter backend run check:module-docs && pnpm --filter backend run check:module-boundary && pnpm --filter backend run check:admin-surface && pnpm --filter backend run check:admin-zones && pnpm --filter backend run check:bundle-pairing && pnpm --filter backend run check:command-coverage && pnpm --filter backend run i18n:hardcoded && pnpm changeset:status`

---

## Dependencies & execution order

```text
Phase 1 (contracts) ──┬─> Phase 2 (kit picker) ──┬─> Phase 3 (US2) ──> Phase 5 (US1 admin)
                      │                          ├─> Phase 6 (US3)
                      │                          └─────────────────────> Phase 8 (US4 admin)
                      ├─> Phase 4 (US1 backend) ──────────────────────> Phase 5
                      └─> Phase 7 (US4 backend) ──────────────────────> Phase 8
Phases 1–8 ──> Phase 9 (polish)
```

- Phase 4 and Phase 7 depend only on Phase 1 and may run before or beside Phase 2.
- Phase 5 needs Phases 2, 3 and 4 (gating, picker, preview codes). Phase 6 needs Phase 2 only.
  Phase 8 needs Phases 2 and 7.
- One builder at a time on the primary checkout: run the phases in numeric order unless the
  orchestrator says otherwise.

## Parallel opportunities

- Phase 1: T001 ∥ T002. Phase 2: T008 ∥ T009 ∥ T010. Phase 4: T020 ∥ T021. Phase 6: T034 ∥ T035.
  Phase 7: T040 ∥ T041. Phase 8: T047 ∥ T048. Phase 9: T054 ∥ T055 ∥ T056.
- Phase 6 (US3) is independent of Phases 3–5 once Phase 2 is done.

## Implementation strategy

1. **MVP** = Phases 1–5: contracts, the picker, order gating and order bulk add with the new
   preview reasons (both P1 stories). Demonstrable on its own.
2. Then US3 (Phase 6) — screen only.
3. Then US4 (Phases 7–8) — the endpoint, then the screen and the roster defect fix.
4. Polish (Phase 9) before the merge request.

## Traceability — every FR and SC to its tests

| Requirement | Test task(s) | Implementation task(s) |
| --- | --- | --- |
| FR-001 one picker, identical on three hosts | T009, T028, T035, T047 | T013, T030, T037, T051 |
| FR-002 filters (status tabs + counts, type, search) | T009 | T012, T013 |
| FR-003 columns | T009 | T013 |
| FR-004 pagination reaches every product | T009, T047 | T013 |
| FR-005 selection persists | T008, T009 | T011, T013 |
| FR-006 count, clear, review | T009 | T013 |
| FR-007 Add N / Cancel | T009 | T013 |
| FR-008 200 cap, no select-all | T001, T008, T009, T028 | T003, T004, T011 |
| FR-009 already added | T008, T028, T035, T047 | T011, T030, T037, T051 |
| FR-010 states incl. confirm-failure + Retry | T009, T047 | T013, T051 |
| FR-011 keyboard and focus | T009 | T013 |
| FR-012 selectability per host | T008, T028, T035, T047 | T011, T030, T037, T051 |
| FR-013 `catalog:read` gate | T009, T010 | T014, T015 |
| FR-014 pl + en | T009, T016 checks, T058 | T016, T018, T031, T038, T052 |
| FR-020 Browse + quick search, per-row search removed | T010, T027, T028 | T015, T030 |
| FR-021 gating | T017 | T018 |
| FR-022 line content | T028 | T029, T030 |
| FR-023 re-pricing | T017, T028 | T029 |
| FR-024 unavailable lines block submit | T021, T028 | T024, T031 |
| FR-025 hiding keeps lines | T017 | T018, T019 |
| FR-026 created order = visible lines, payload unchanged | T025, T027, T028 | T029 |
| FR-027 two codes, precedence, body channel, justification | T002, T020, T021 | T005, T006, T022, T023, T024 |
| FR-030 quote-request entry points and lines | T035 | T037 |
| FR-031 prefill | T034, T035 | T036, T037 |
| FR-032 prefill after customer chosen | T035 | T037 |
| FR-033 hand-edited price kept | T034, T035 | T036, T037 |
| FR-034 mark + block, no drop | T035 | T038 |
| FR-035 running total | T035 | T038 |
| FR-036 no-organization warning kept | T033, T035 | T037 |
| FR-040 Add opens the picker | T047 | T051 |
| FR-041 one request, roster by name, editor, first added | T047, T048 | T049, T050, T051 |
| FR-042 nothing existing changes | T041 | T043 |
| FR-043 per-product partial failure; whole-invalid refusals | T040, T041, T047 | T042, T043, T044, T051 |
| FR-044 Add disabled (system list, no write) + server Default refusal | T041, T047 | T043, T051 |
| FR-045 endpoint, contract, one command, ≤ 1 audit entry, errors | T001, T041, T045 | T004, T043, T044 |
| SC-001 20 products in one session | T028, T035, T047 | — |
| SC-002 identical filter and column set | T009 (one component), T028, T035, T047 | T013 |
| SC-003 > 500 products, every roster editor | T047, T048 | T049, T050 |
| SC-004 0 lines before gating; priced after | T017, T028 | T018 |
| SC-005 100% strings pl + en | T009, T058 | T016, T031, T038, T052 |
| SC-006 payloads unchanged; brackets byte-identical | T025, T027, T041 | T029, T043 |
| SC-007 one request, one audit entry | T041, T047 | T043, T051 |
| SC-008 preview marks what create refuses (visibility) | T021 | T024 |
