# Tasks: quote request reference price, readable history, per-customer negotiation lock

**Feature**: `specs/146-quote-request-pricing-history/` | **Issues**: #279, #283, #284
**Input**: `spec.md` (clarified), `plan.md`, `research.md` (R1–R15), `data-model.md`,
`contracts/admin-quote-request-api.md`, `contracts/price-negotiation-api.md`, `contracts/ports.md`,
`quickstart.md`.

**Organisation**: fourteen phases, each sized for **one builder spawn** (≤ 10 tasks) and ending with
an exact **Verification** line. Tests are mandatory (Principle III): inside every phase the
`RED` task — a failing test — precedes the task that makes it pass. Run it and see it fail before
implementing.

## Format

`- [ ] T### [P?] [US?] [PG?] description — file path(s)`

- **[P]** — may run in parallel with its neighbours (different files, no dependency on an
  unfinished task).
- **[US1…US4]** — the spec's user story; none = foundational or cross-cutting.
- **[PG]** — needs Postgres (and Redis) running: `pnpm run dev:infra`. These tests are **not** in
  `test:unit:fast` and **not** run by CI before merge (D-198) — run them locally and paste the
  result into the pull request.
- **RED** — the deliverable is a failing test.

## Rules for every phase (read once)

- Start from a clean tree; after editing anything under `packages/`, rebuild it
  (`pnpm --filter <package> run build`, or `pnpm run build:packages`) before running a backend,
  admin or storefront test — tests read `dist`, `tsc` reads sources.
- **Never put a module test beside `src/manifest.ts`** — `manifests:check` refuses a sibling there.
  Module tests go under `packages/modules/<id>/src/backend/**`; admin tests under
  `admin/test/modules/quote_requests/`; storefront tests under `storefront/test/rfq/`; backend
  contract/integration tests under `backend/test/{contract,integration}/<module>/`.
- Paths passed to `pnpm --filter backend …` resolve against `backend/`; a package file is
  `../packages/...` from there.
- Module unit tests run through the package:
  `pnpm --filter @endora-commerce/mod-quote-requests exec vitest run <path under the package>`.
- After adding an entity or a migration: `pnpm --filter backend run composer:generate`,
  `pnpm --filter backend run manifests:generate`, `pnpm install --lockfile-only`; commit every
  regenerated artefact in the same commit.
- Migrations are scaffolded, never numbered by hand:
  `pnpm --filter backend run migration:new -- --module quote_requests --name <slug>`.

## Dependency chain

```text
Phase 1 ─► Phase 2 (contracts) ─► Phase 3 (schema)
                                     ├─► US1: Phase 4 ─► Phase 5 ─► Phase 6 ─► Phase 7
                                     ├─► US2/US3: Phase 8 ─► Phase 9        (Phase 8 after Phase 6: both edit rfq-admin-service.ts)
                                     └─► US4: Phase 10 ─► Phase 11, Phase 12
Phases 4–12 ─► Phase 13 (off-state, docs, changesets) ─► Phase 14 (CI-equivalent gate)
```

Phases 5, 6, 8 and 10 all edit `rfq-service.ts` / `rfq-admin-service.ts`: build them **in
sequence** on one checkout, not in parallel. Phases 11 and 12 may run in parallel after Phase 10.

---

## Phase 1: Setup

**Goal**: a known-good baseline before any change.

- [ ] T001 Confirm branch `feat/146-quote-request-pricing-history`, clean tree, and run `pnpm install --frozen-lockfile && pnpm run build:packages`
- [ ] T002 Record the baseline: `pnpm --filter @endora-commerce/mod-quote-requests run test` and `pnpm --filter backend exec vitest run test/integration/quote_requests` `[PG]` — note any pre-existing red in the PR description so it is not attributed to this feature

**Verification**: `pnpm --filter @endora-commerce/mod-quote-requests run test && pnpm --filter @endora-commerce/mod-quote-requests run typecheck`

---

## Phase 2: Foundational — contracts first (Principle II)

**Goal**: every new shape exists in `packages/contracts/` with a test, before any service code.

- [ ] T003 [P] RED contract tests for the quote-request additions: item `referencePrice` / `customerProposedUnitPrice` / packaging keys optional; history entry, change and actor unions (every kind parses, an unknown kind is refused); negotiation DTOs and `set*` schemas strict; `storefrontQuoteRequestNegotiationSchema` has exactly one key — `packages/contracts/src/quote-requests.test.ts`
- [ ] T004 [P] RED contract test for `BuyerLinePricePort` / `BuyerLinePriceQuery` (type-level: a structural stub compiles; `LinePricePort` stubs still compile unchanged) — `packages/contracts/src/price-lists.test.ts`
- [ ] T005 Add the item keys, `salesChannelId` (admin-only, optional) on `quoteRequestSchema`, the history schemas and `QuoteRequestHistoryEntry` types, per `contracts/admin-quote-request-api.md` §1, §3 — `packages/contracts/src/quote-requests.ts`
- [ ] T006 Add the negotiation schemas (`quoteRequestOrgNegotiationSchema`, `setQuoteRequestOrgNegotiationSchema`, `quoteRequestNegotiationOverrideSchema`, `quoteRequestAccountNegotiationSchema`, `setQuoteRequestAccountNegotiationSchema`, `storefrontQuoteRequestNegotiationSchema`) per `contracts/price-negotiation-api.md` — `packages/contracts/src/quote-requests.ts`
- [ ] T007 Add `CreateForCustomerOptions` and the optional third parameter of `RfqCustomerPort.createForCustomer` per `contracts/ports.md` §2 — `packages/contracts/src/quote-requests.ts`
- [ ] T008 Add `BuyerLinePriceLine`, `BuyerLinePriceQuery`, `BuyerLinePriceAnswer`, `BuyerLinePricePort` per `contracts/ports.md` §1 — `packages/contracts/src/price-lists.ts`
- [ ] T009 Add `RFQ_PRICE_PROPOSAL_NOT_ALLOWED` to `ERROR_CODES` — `packages/contracts/src/errors.ts`; export everything new from `packages/contracts/src/index.ts` if that barrel lists names explicitly
- [ ] T010 Build contracts and type-check every consumer of `RfqCustomerPort` (carts, orders, shopping_lists, quick_order, customers must compile unchanged)

**Verification**: `pnpm --filter @endora-commerce/contracts exec vitest run src/quote-requests.test.ts src/price-lists.test.ts && pnpm --filter @endora-commerce/contracts run build && pnpm -r run typecheck`

---

## Phase 3: Foundational — schema and entities

**Goal**: the two migrations, the extended and new entities, registered; tenant classification proven (plan I1).

- [ ] T011 [PG] RED integration test: the item reference columns exist and the all-or-none constraint refuses a partial row; both policy tables exist with their FKs and cascade; a `QuoteRequestAccountPolicy` row is readable by an organization administrator of the account's organization, unreadable from another organization, and visible to a sales representative of that organization (plan I1) — `backend/test/integration/quote_requests/pricing-history-schema.test.ts`
- [ ] T012 Scaffold migration `item_reference_price` (three columns + check constraint, `down` drops them) per `data-model.md` §1 — `pnpm --filter backend run migration:new -- --module quote_requests --name item_reference_price`, then fill `packages/modules/quote_requests/src/migrations/<generated>_quote_requests_item_reference_price.ts`
- [ ] T013 Scaffold migration `negotiation_policies` (both tables, FKs `on delete cascade`, defaults) per `data-model.md` §5–§6 — `pnpm --filter backend run migration:new -- --module quote_requests --name negotiation_policies`
- [ ] T014 [P] Extend `QuoteRequestItem` with `referenceUnitPrice`, `referenceCurrency`, `referenceCapturedAt` (in `[OptionalProps]`) — `packages/modules/quote_requests/src/backend/entities/quote-request-item.entity.ts`
- [ ] T015 [P] Extend `QuoteRequestRevisionLine` with optional `packagingUnitName`, `packagingUnitBaseQuantity`; write them in `toSnapshotLine` — `packages/modules/quote_requests/src/backend/entities/quote-request-revision.entity.ts`, `packages/modules/quote_requests/src/backend/services/rfq-revision-service.ts`
- [ ] T016 [P] Create `QuoteRequestOrgPolicy` (`@OrgScoped()`) and `QuoteRequestAccountPolicy` (`@TransitivelyScoped('CustomerAccount', 'customerAccountId')`) — `packages/modules/quote_requests/src/backend/entities/quote-request-org-policy.entity.ts`, `quote-request-account-policy.entity.ts`; add both to the `entities` array in `src/backend/index.ts`
- [ ] T017 Regenerate and commit artefacts: `composer:generate` (`backend/src/db/migrations-registry.generated.ts`, `entities-registry.generated.ts`), `manifests:generate`, `pnpm install --lockfile-only`
- [ ] T018 If T011's tenant case fails on I1, apply research R10's fallback (`@GlobalEntity()` + explicit keys) and record it in `plan.md` § Inferred; otherwise mark I1 proven there

**Verification**: `pnpm --filter backend exec vitest run test/integration/quote_requests/pricing-history-schema.test.ts test/integration/quote_requests/migration.test.ts` `[PG]` `&& pnpm --filter backend exec tsx scripts/check-entity-tenant-classification.ts && pnpm --filter backend exec vitest run test/unit/db/migrations-registry.test.ts test/unit/db/fk-dependency-drift.test.ts`

---

## Phase 4: US1 — channel-aware buyer price in `price_lists` (FR-001, FR-006, FR-007)

**Goal**: one implementation answers "what does this buyer pay on this channel", as a port and through the probe.

- [ ] T019 [P] [US1] RED unit test for `BuyerLinePriceService.resolveForBuyer`: customer group precedence (account over organization), channel by id vs system default when `null`, unknown channel → `400 VALIDATION_FAILED`, unknown product → `price: null` for that key, quantity bracket honoured, keys echoed in order — `packages/modules/price_lists/src/backend/services/buyer-line-price-service.test.ts`
- [ ] T020 [P] [US1] [PG] RED contract test: `GET /api/v1/admin/products/:id/resolved-price?salesChannelId=` resolves on that channel (120.00 on A vs 130.00 on default — US1 #4b); absent → default; unknown id → 400; `price_lists:read` still required — extend `backend/test/contract/price_lists/admin-resolved-price.test.ts`
- [ ] T021 [US1] Implement `BuyerLinePriceService` by lifting the probe body out of `routes.ts` (batch: load products, customer, organization and channel once) — `packages/modules/price_lists/src/backend/services/buyer-line-price-service.ts`
- [ ] T022 [US1] Make the probe route delegate to the service and accept `salesChannelId` — `packages/modules/price_lists/src/backend/routes.ts`
- [ ] T023 [US1] Publish `ctx.di.providePort<BuyerLinePricePort>('buyerLinePricePort', …)` — `packages/modules/price_lists/src/backend/index.ts`
- [ ] T024 [US1] Build `price_lists`; run `check:port-shape` and `check:port-dependencies`

**Verification**: `pnpm --filter @endora-commerce/mod-price-lists exec vitest run src/backend/services/buyer-line-price-service.test.ts && pnpm --filter @endora-commerce/mod-price-lists run typecheck && pnpm --filter backend exec vitest run test/contract/price_lists/admin-resolved-price.test.ts` `[PG]` `&& pnpm --filter backend run check:port-shape && pnpm --filter backend run check:port-dependencies`

---

## Phase 5: US1 — capture at submission, cart conversion, list totals (FR-001, FR-002, FR-008, FR-009, FR-023)

**Goal**: every customer write path stores a server-side reference for the request's owner and channel; cart conversion stores the cart price as reference and no proposal; the customer list total follows the every-line rule.

- [ ] T025 [P] [US1] RED unit test for `resolveReferencePrices(port, { owner, salesChannelId, lines, supplied? })`: supplied references used verbatim and not resolved; `null` answer → no reference; a thrown error → no reference for any line; `ModuleDisabledError` re-thrown — `packages/modules/quote_requests/src/backend/services/reference-price.test.ts`
- [ ] T026 [P] [US1] RED unit test for `summarize`: no proposal → `totalAtCustomerPrice: null`; partial → `null`; all (2 × 100 + 1 × 50) → 250 (US1 #8a–#8c) — `packages/modules/quote_requests/src/backend/services/summarize.test.ts` (export `summarize` from `rfq-service.ts` or move it to `services/summarize.ts`)
- [ ] T027 [P] [US1] [PG] RED integration test: customer create on channel A stores 120.00 / PLN / timestamp for the owner (US1 #1, #4b); resubmit resolves on its own channel; a pricing failure still creates the request with no reference; a client body cannot set a reference (strict schema refuses an extra key) — `backend/test/integration/quote_requests/reference-price.test.ts`
- [ ] T028 [P] [US1] [PG] RED integration test: cart → quote conversion stores the cart unit price as reference and `desiredUnitPrice: null` (US1 #8, FR-008); the storefront list summary shows `totalAtCustomerPrice: null`; the CRM opportunity value of that request is 0 (FR-009) — `backend/test/integration/quote_requests/cart-conversion-reference.test.ts`, extend `backend/test/integration/crm/value.test.ts`
- [ ] T029 [US1] Implement `reference-price.ts` with the single narrow `catch` (first line `rethrowIfModuleDisabled(error)`, comment citing research R2) — `packages/modules/quote_requests/src/backend/services/reference-price.ts`
- [ ] T030 [US1] Wire `lazyPort<BuyerLinePricePort>(ctx, 'buyerLinePricePort')` into the module options and `RfqService` deps; add `'price_lists'` to manifest `dependencies` and update the `permissions` comment that said it is not one (research R2) — `packages/modules/quote_requests/src/backend/index.ts`, `src/backend/plugin.ts`, `src/manifest.ts`
- [ ] T031 [US1] Capture references in `createForCustomer` (honouring `options.lineReferencePrices`, length mismatch throws) and `resubmit`; fix `summarize` to the every-line rule — `packages/modules/quote_requests/src/backend/services/rfq-service.ts`
- [ ] T032 [US1] Change `convertToQuoteRequest` to send no `desiredUnitPrice` and pass `lineReferencePrices` from `CartItem.unitPrice` / `currency`; update its call-shape assertion — `packages/modules/carts/src/backend/services/cart-conversion-service.ts`, `backend/test/unit/carts/cross-module-ports.unit.test.ts`
- [ ] T033 [US1] Build `quote_requests`, `carts`; run the checks the new edge and catch touch

**Verification**: `pnpm --filter @endora-commerce/mod-quote-requests exec vitest run src/backend/services/reference-price.test.ts src/backend/services/summarize.test.ts && pnpm --filter backend exec vitest run test/unit/carts/cross-module-ports.unit.test.ts && pnpm --filter backend exec vitest run test/integration/quote_requests/reference-price.test.ts test/integration/quote_requests/cart-conversion-reference.test.ts test/integration/crm/value.test.ts test/integration/quote_requests/conversion.test.ts` `[PG]` `&& pnpm --filter backend run check:port-dependencies && pnpm --filter backend run check:port-catches && pnpm --filter backend exec vitest run test/unit/db/module-graph.test.ts test/unit/_lifecycle/dead-activation-switches.test.ts`

---

## Phase 6: US1 — line carry-over and the draft-edit guard (FR-002, FR-034, FR-035, FR-036, FR-038)

**Goal**: rewrites keep what the rep or customer did not change; customers may edit until an admin revision exists.

- [ ] T034 [P] [US1] RED unit test for the pairing helper: `id` + same product pairs; `id` with another product does not; no `id` pairs by product + variant, then packaging name, then order; two variants of one product never cross-pair; unpaired existing rows reported removed — `packages/modules/quote_requests/src/backend/services/line-carry-over.test.ts`
- [ ] T035 [P] [US1] [PG] RED integration test: admin `modify` changing only the agreed price keeps variant V, line note and packaging unit, `desiredUnitPrice` and the stored reference (US1 #9); absent `lineNote` keeps, `lineNote: null` clears; a new line has no reference — `backend/test/integration/quote_requests/line-carry-over.test.ts`
- [ ] T036 [P] [US1] [PG] RED integration test: customer `patchDraft` stores packaging unit as sent with the name suffix, keeps the reference of an unchanged line, re-resolves a line whose quantity changed (US1 #10, R5.3) — same file
- [ ] T037 [P] [US1] [PG] RED integration test: two consecutive customer draft edits succeed; after an admin `modify`, a third is refused `409 RFQ_NOT_DRAFT` and writes nothing; an admin `note-added` does not close the draft (US1 #11, FR-038) — extend `backend/test/integration/quote_requests/negotiation-loop.test.ts`
- [ ] T038 [US1] Implement `line-carry-over.ts` — `packages/modules/quote_requests/src/backend/services/line-carry-over.ts`
- [ ] T039 [US1] Use it in `modify` (carry packaging, product name snapshot, `desiredUnitPrice`, reference; variant / note per R5.2) — `packages/modules/quote_requests/src/backend/services/rfq-admin-service.ts`
- [ ] T040 [US1] Use it in `patchDraft` (packaging as sent with suffix, reference kept or re-resolved for the **owner**), and narrow the guard to `actorAdminUserId: { $ne: null }` — `packages/modules/quote_requests/src/backend/services/rfq-service.ts`
- [ ] T041 [US1] Build and re-run the module's existing quote-request integration suite to catch a carry-over regression

**Verification**: `pnpm --filter @endora-commerce/mod-quote-requests exec vitest run src/backend/services/line-carry-over.test.ts src/backend/services/revision-diff.test.ts && pnpm --filter backend exec vitest run test/integration/quote_requests` `[PG]`

---

## Phase 7: US1 — admin detail: reference, proposal, difference (FR-003 – FR-007, FR-019)

**Goal**: the rep sees reference, proposal and difference on Overview and while modifying; the Modify tab sends what it must keep.

- [ ] T042 [P] [US1] [PG] RED contract test: admin `GET /api/v1/admin/quote-requests/:id` items carry `referencePrice`, `customerProposedUnitPrice` (including the submission-record fallback for a line whose row lost the proposal, R4), packaging keys, and the request carries `salesChannelId`; the customer `GET /api/v1/quote-requests/:id` carries none of the admin-only keys (FR-019) — extend `backend/test/contract/quote_requests/admin-routes.test.ts`, `customer-routes.test.ts`
- [ ] T043 [P] [US1] RED admin test for Overview: columns Reference / Proposed / Difference / Agreed; −20.00 PLN and −16.67 % for 120 vs 100; "+" for a higher proposal; "—" for no proposal, currency mismatch, zero reference (% only); "price at request" vs "current price" vs "no price" labels (US1 #1, #3, #5–#7) — `admin/test/modules/quote_requests/RfqDetail.reference.test.tsx`
- [ ] T044 [P] [US1] RED admin test for Modify: reference and proposal beside the agreed input, live difference as typed (US1 #2); the empty-input prefill calls `/api/v1/admin/products/:id/resolved-price` with `customerAccountId`, `salesChannelId`, `quantity`, `variantId` and never the storefront probe (FR-007); the PATCH body carries `id`, `variantId`, `lineNote` per kept line (FR-034); a 403 from the probe leaves the input empty — `admin/test/modules/quote_requests/RfqDetail.modify-payload.test.tsx`
- [ ] T045 [US1] Serialise the admin-only item keys and `salesChannelId` in `serializeFull(…, true)`; implement the submission-record fallback with one revision read — `packages/modules/quote_requests/src/backend/services/rfq-service.ts`
- [ ] T046 [US1] Pure difference helper (amount, percentage to 2 decimals, signed, `null` rules of FR-005) with its own unit test — `packages/modules/quote_requests/src/admin/reference-difference.ts`, `admin/test/modules/quote_requests/reference-difference.test.ts`
- [ ] T047 [US1] Overview columns and Modify additions; replace `resolvePriceListPrice` with the customer-and-channel probe; send `id` / `variantId` / `lineNote` — `packages/modules/quote_requests/src/admin/pages/RfqDetail.tsx`
- [ ] T048 [US1] Add `detail.reference.*` keys (column headers, "price at request", "current price", "no price") in both languages — `packages/modules/quote_requests/i18n/en.json`, `pl.json`
- [ ] T049 [US1] Run the admin suite for the module, `i18n:hardcoded` for `RfqDetail.tsx`, and `registered-bundles-shape`

**Verification**: `pnpm --filter admin exec vitest run test/modules/quote_requests && pnpm --filter backend exec vitest run test/contract/quote_requests/admin-routes.test.ts test/contract/quote_requests/customer-routes.test.ts` `[PG]` `&& pnpm --filter backend run i18n:hardcoded && pnpm --filter backend exec vitest run test/unit/_i18n/registered-bundles-shape.test.ts && pnpm --filter @endora-commerce/mod-quote-requests run typecheck && pnpm --filter admin run typecheck`

---

## Phase 8: US2 + US3 — history projection (FR-010 – FR-019)

**Goal**: a backend read model that merges, attributes and diffs.

- [ ] T050 [P] [US2] RED unit test for `historyDiff`: added (quantity, agreed), removed, quantity, agreed price, proposed price, line note, header note; two variants of one product stay distinct (FR-015); a packaging-only change lists nothing; legacy snapshots without packaging keys still pair; identical snapshots → `[]` (FR-013) — `packages/modules/quote_requests/src/backend/services/history/history-diff.test.ts`
- [ ] T051 [P] [US2] [US3] RED unit test for `projectHistory`: every pairing of research R8 (created + submitted, created + re-submitted, admin created + automatic note, accept + approved, reject + canceled with reason, note + approved); an operator-typed note after an admin create is kept; non-adjacent or different-actor pairs do not merge; actor kinds admin / customer / system / unknown; B (organization administrator) named on an acceptance of A's request (US3 #1); missing admin or account → `name: null` (FR-018); `validity` change from the event payload — `packages/modules/quote_requests/src/backend/services/history/history-projection.test.ts`
- [ ] T052 [P] [US2] [US3] [PG] RED integration test: `GET /api/v1/admin/quote-requests/:id/history` on a request submitted, modified twice (price, quantity, removal, validity) and accepted — entries, actors, changes (US2 #2–#4, #6); a customer session and a rep outside the organization are refused (FR-019); a pre-release request (events without `validity`) still lists line changes (US2 #8) — extend `backend/test/integration/quote_requests/history.test.ts`
- [ ] T053 [US2] Implement `historyDiff` — `packages/modules/quote_requests/src/backend/services/history/history-diff.ts`
- [ ] T054 [US2] [US3] Implement `projectHistory` and export `AUTOMATIC_ADMIN_CREATION_NOTE` from `rfq-admin-service.ts` (use it where the note is written) — `packages/modules/quote_requests/src/backend/services/history/history-projection.ts`, `src/backend/services/rfq-admin-service.ts`
- [ ] T055 [US2] Record `payload.validity` in `modify` when `expiresAt` changes (research R7) — `packages/modules/quote_requests/src/backend/services/rfq-admin-service.ts`
- [ ] T056 [US2] [US3] Add `RfqAdminService.history(ctx, id)` (visibility, events, revisions, one `findByIds` per actor port, variant labels through `catalogProducts.listVariantsByProductIds`) and the route — `packages/modules/quote_requests/src/backend/services/rfq-admin-service.ts`, `src/backend/routes.admin.ts`

**Verification**: `pnpm --filter @endora-commerce/mod-quote-requests exec vitest run src/backend/services/history && pnpm --filter backend exec vitest run test/integration/quote_requests/history.test.ts` `[PG]` `&& pnpm --filter @endora-commerce/mod-quote-requests run typecheck && pnpm --filter backend run check:port-catches`

---

## Phase 9: US2 + US3 — admin History tab (FR-010, FR-011, FR-013, FR-014, FR-017, FR-018, FR-030)

**Goal**: the tab reads as a translated, attributed timeline.

- [ ] T057 [P] [US2] [US3] RED admin test: the tab fetches `/history` when opened; every entry kind and change kind renders a translated title in `en` and `pl` and no raw identifier (FR-010, a test iterates the schema enums); actor shows name + e-mail for customers, name + translated role for admins, "System", or recorded role + "unknown user"; reason and note shown; an empty change list renders "re-sent without changes" — `admin/test/modules/quote_requests/RfqDetail.history.test.tsx`
- [ ] T058 [P] [US2] RED test that every `quoteRequestHistoryEntryKindSchema` and change `kind` value has a `detail.history.*` key in both bundles — `packages/modules/quote_requests/src/backend/history-bundle-coverage.test.ts`
- [ ] T059 [US2] [US3] History tab component (entry list, change list formatting with the locale's money and date formats, role-label mapping for the five known labels, custom role shown as stored) — `packages/modules/quote_requests/src/admin/pages/RfqHistory.tsx`, mounted from `RfqDetail.tsx`
- [ ] T060 [US2] [US3] `detail.history.*` keys in both languages — `packages/modules/quote_requests/i18n/en.json`, `pl.json`
- [ ] T061 [US2] Run the module's admin tests, `i18n:hardcoded`, `check:bundle-pairing`

**Verification**: `pnpm --filter admin exec vitest run test/modules/quote_requests && pnpm --filter @endora-commerce/mod-quote-requests exec vitest run src/backend/history-bundle-coverage.test.ts && pnpm --filter backend run i18n:hardcoded && pnpm --filter backend run check:bundle-pairing && pnpm --filter admin run typecheck`

---

## Phase 10: US4 — lock backend: service, Commands, routes, enforcement (FR-020, FR-022 – FR-027, FR-037)

**Goal**: an audited, enforced, owner-scoped lock with its admin and storefront routes.

- [ ] T062 [P] [US4] RED unit test for `NegotiationPolicyService.effectiveFor` (account over organization over default; `null` account value = inherit) and `assertProposalsAllowed` (no proposal → no read; locked + proposal → `422 RFQ_PRICE_PROPOSAL_NOT_ALLOWED`) — `packages/modules/quote_requests/src/backend/services/negotiation-policy-service.test.ts`
- [ ] T063 [P] [US4] RED unit test for the two Commands: action, objectType, objectId, before/after values, `skipAudit` on no change — `packages/modules/quote_requests/src/backend/commands/negotiation-policy-commands.test.ts`
- [ ] T064 [P] [US4] [PG] RED integration test for the routes: `GET` with `customers:read`, `PUT` refused without `customers:manage`; three override states; effective value + source; audit row with administrator and old → new (US4 #8); 404 for unknown subjects; a scoped sales representative limited to visible organizations (plan I2); the storefront `GET /api/v1/quote-requests/price-negotiation` answers only `priceProposalsAllowed`, `private, no-store`, and does not shadow `GET /api/v1/quote-requests/:id` (plan I4) — `backend/test/integration/quote_requests/negotiation-policy-routes.test.ts`
- [ ] T065 [P] [US4] [PG] RED integration test for enforcement: locked customer's create with a proposal → 422, nothing written (US4 #3); without proposal → created; cart conversion succeeds (US4 #4); account override allowed under a locked organization (US4 #7a) and locked under an allowed one (US4 #7b); organization administrator editing a locked colleague's draft with a proposal → 422, and the converse (US4 #7d); admin create/modify for a locked customer unchanged (US4 #6, FR-024); existing proposals untouched (US4 #5) — `backend/test/integration/quote_requests/negotiation-enforcement.test.ts`
- [ ] T066 [US4] Implement `NegotiationPolicyService` (reads on the caller's `em`) — `packages/modules/quote_requests/src/backend/services/negotiation-policy-service.ts`
- [ ] T067 [US4] Implement the two Commands and add `commandBus` (and `requireAdminAny`) to `QuoteRequestsCradle` — `packages/modules/quote_requests/src/backend/commands/negotiation-policy-commands.ts`, `src/backend/index.ts`
- [ ] T068 [US4] Admin and storefront routes per `contracts/price-negotiation-api.md` §1–§3, registered from `plugin.ts` inside `ctx.routes` — `packages/modules/quote_requests/src/backend/routes.negotiation.ts`, `src/backend/plugin.ts`
- [ ] T069 [US4] Call `assertProposalsAllowed` before the first write in `createForCustomer` (acting customer) and `patchDraft` (`rfq.customerAccountId`, `rfq.organizationId`) — `packages/modules/quote_requests/src/backend/services/rfq-service.ts`
- [ ] T070 [US4] Declare `RFQ_PRICE_PROPOSAL_NOT_ALLOWED` in manifest `errorCodes` (update the count in the comment by re-deriving it) and add `errors.RFQ_PRICE_PROPOSAL_NOT_ALLOWED` to both bundles — `packages/modules/quote_requests/src/manifest.ts`, `i18n/en.json`, `i18n/pl.json`
- [ ] T071 [US4] Build; run the checks that judge commands, ports, errors and permissions

**Verification**: `pnpm --filter @endora-commerce/mod-quote-requests exec vitest run src/backend/services/negotiation-policy-service.test.ts src/backend/commands && pnpm --filter backend exec vitest run test/integration/quote_requests/negotiation-policy-routes.test.ts test/integration/quote_requests/negotiation-enforcement.test.ts test/contract/admin_users/permission-inventory.test.ts test/contract/kernel/harness-parity.test.ts` `[PG]` `&& pnpm --filter backend run check:command-coverage -- --strict && pnpm --filter backend run check:error-translations && pnpm --filter backend run check:port-dependencies && pnpm --filter backend run check:entry-scope`

---

## Phase 11: US4 — admin zone panels (FR-020, FR-027, FR-028, FR-029, FR-030)

**Goal**: the two controls on the existing organization and customer screens.

- [ ] T072 [P] [US4] RED admin test: the organization panel loads state, toggles through `PUT`, is disabled without `customers:manage`; the customer panel shows the three options and "Effective: … (from account / organization / default)"; both absent when the contributor is off (zone filtered) — `admin/test/modules/quote_requests/negotiation-zones.test.tsx`
- [ ] T073 [US4] `OrganizationPriceNegotiation.tsx` (pattern: `carts`' `CartApprovalPolicyPanel`) — `packages/modules/quote_requests/src/admin/zones/OrganizationPriceNegotiation.tsx`
- [ ] T074 [US4] `CustomerPriceNegotiation.tsx` — `packages/modules/quote_requests/src/admin/zones/CustomerPriceNegotiation.tsx`
- [ ] T075 [US4] Register both: `zoneComponent('organization.detail.after', …, { weight: 500, requiredPermission: 'customers:read' })` and `zoneComponent('customer.detail.after', …, { weight: 200, requiredPermission: 'customers:read' })`; update the file's header comment (it says "three routes and one sidebar entry") — `packages/modules/quote_requests/src/admin/index.ts`
- [ ] T076 [US4] `negotiation.*` keys (title, label, description, three override labels, effective/source sentences, saved/error notices) in both languages — `packages/modules/quote_requests/i18n/en.json`, `pl.json`
- [ ] T077 [US4] Run `check:admin-zones`; if it refuses `customers:read` (plan I3), switch both to `customers:manage`, drop the disabled state, and record the deviation in `plan.md`

**Verification**: `pnpm --filter admin exec vitest run test/modules/quote_requests/negotiation-zones.test.tsx && pnpm --filter backend run check:admin-zones && pnpm --filter backend run check:admin-surface && pnpm --filter backend run i18n:hardcoded && pnpm --filter backend run check:bundle-pairing && pnpm --filter @endora-commerce/mod-quote-requests run typecheck`

---

## Phase 12: US4 + US1 — storefront (FR-009, FR-021, FR-025, FR-030)

**Goal**: a locked buyer sees no proposal input and sends none; the list total renders "—".

- [ ] T078 [P] [US4] RED storefront test. `RfqDraftView` is `'use client'` and loads its lines from `localStorage` in a `useEffect`, so an SSR render (`renderToString`, the suite's only renderer — see `storefront/test/rfq/rfq-detail-actions.test.tsx`) shows an empty draft and would pass vacuously. Test the two units instead: (a) `DraftLine`, exported, rendered with a fixture line and `proposalsAllowed={false}` → no proposed-price input, catalogue price read-only, and with `true` → input present (US4 #1, #2), both languages; (b) a pure `buildSubmitItems(items, proposalsAllowed)` → no `desiredUnitPrice` on any line when `false`, unchanged when `true` (FR-021); (c) the page-level note rendered by an exported `LockedPricingNote` — `storefront/test/rfq/rfq-draft-locked.test.tsx`
- [ ] T079 [P] [US1] RED storefront test: the account list renders `totalAtCustomerPrice: null` as "—" (never `0,00 PLN`) and 250.00 for a fully proposed request (US1 #8a–#8c) — `storefront/test/rfq/rfq-list-total.test.tsx`
- [ ] T080 [US4] `getQuoteRequestNegotiation(sessionCookie)` validating with `storefrontQuoteRequestNegotiationSchema`; returns `true` on any failure or no session (fail-open display) — `storefront/lib/api/rfq.ts`
- [ ] T081 [US4] Read it in the server page and pass the prop — `storefront/app/(commerce)/quote-request/page.tsx`
- [ ] T082 [US4] Export `DraftLine`, extract `buildSubmitItems` and `LockedPricingNote`, thread `priceProposalsAllowed` through; hide input / read-only price / note / omit proposals; new strings in the inline `strings(pl)` dictionary and `Strings` interface — `storefront/components/rfq/RfqDraftView.tsx`
- [ ] T083 [US4] Surface the 422 message from the server action as the translated envelope message (no change if `actions.ts` already passes `err.message` through — assert it in T078) — `storefront/app/(commerce)/quote-request/actions.ts`
- [ ] T084 [US4] Storefront typecheck, lint, tests; `check:rsc-discipline`

**Verification**: `pnpm --filter storefront exec vitest run test/rfq && pnpm --filter storefront run typecheck && pnpm --filter storefront run lint && pnpm --filter backend run check:rsc-discipline`

---

## Phase 13: Cross-cutting — off-state, documentation, changesets (FR-028, FR-030, FR-033)

**Goal**: the module's absence is proven, the page describes the feature in both languages, the release intent is written.

- [ ] T085 [PG] RED-then-green: extend the off-state test — with `quote_requests` off, the four negotiation admin routes, the storefront read and `/history` answer `503 MODULE_DISABLED`; the stored policy rows are untouched; after switching it back on the routes answer the values set before (FR-028) — `backend/test/integration/quote_requests/off-state.test.ts`
- [ ] T086 [P] Document the reference price, the history entries and the negotiation lock for operators and engineers — `packages/modules/quote_requests/docs/quote_requests.md`
- [ ] T087 [P] Polish translation of the same sections — `docs/i18n/pl/docusaurus-plugin-content-docs/current/modules/quote_requests.md`
- [ ] T088 [P] Document the probe's `salesChannelId` and `buyerLinePricePort` — `packages/modules/price_lists/docs/` page (and its Polish counterpart under `docs/i18n/pl/…/modules/`)
- [ ] T089 [P] Changesets, `minor`, one per meaning, written for the consumer: `@endora-commerce/contracts` (new schemas, port, error code, `RfqCustomerPort` third argument), `@endora-commerce/mod-quote-requests` (reference price, history endpoint, lock, `totalAtCustomerPrice` meaning), `@endora-commerce/mod-price-lists` (port, probe parameter), `@endora-commerce/mod-carts` (conversion no longer writes a proposal) — `.changeset/146-*.md`
- [ ] T090 Run the docs and release checks

**Verification**: `pnpm --filter backend exec vitest run test/integration/quote_requests/off-state.test.ts` `[PG]` `&& pnpm --filter backend run check:off-state-coverage && pnpm --filter backend run check:module-docs && pnpm --filter backend run check:docs-translations && pnpm --filter backend run check:doc-snippets && pnpm --filter backend run check:release-intent`

---

## Phase 14: Final — CI-equivalent gate

**Goal**: everything the `quality`, `quality:static`, `test:backend:unit`, `test:frontend` and `release:changeset` jobs of `.github/workflows/quality.yml` run, run locally, in that job's order. PR #297 went red on checks no targeted run reached; this phase is why.

- [ ] T091 Fresh install and build exactly as CI does: `pnpm install --frozen-lockfile && pnpm run build:packages` (a lockfile drift fails here, as it would fail every CI job)
- [ ] T092 `pnpm --filter backend run test:unit:fast` — **run alone**, not combined with anything; includes `agents-router.test.ts` (the `AGENTS.md` appendix grew) and the generated-registry tests
- [ ] T093 The `quality` job's run-block, verbatim and in order:
  `pnpm -r run typecheck && pnpm -r run lint && pnpm --filter backend exec tsx scripts/check-entity-tenant-classification.ts && pnpm --filter backend exec tsx scripts/check-channel-resolution.ts --enforce && pnpm --filter backend run check:command-coverage -- --strict && pnpm --filter backend run check:kernel-boundary && pnpm --filter backend run check:module-boundary && pnpm --filter backend run check:admin-surface && pnpm --filter backend run check:admin-zones && pnpm --filter backend run check:entry-scope && pnpm --filter backend run check:container-imports && pnpm --filter backend run check:port-dependencies && pnpm --filter backend run check:port-catches && pnpm --filter backend run check:port-shape && pnpm --filter backend run check:subscribe-seam && pnpm --filter backend run check:queue-names && pnpm --filter backend run check:transaction-context && pnpm --filter backend run check:singleton-identity && pnpm --filter backend run check:entry-presence && pnpm --filter backend run check:lock-claims && pnpm --filter backend run check:action-route-permissions && pnpm --filter backend run check:harness-teardown && pnpm --filter backend run check:fixture-substitution && pnpm --filter backend run check:shared-table-wipes && pnpm --filter backend run check:nul-bytes && pnpm --filter backend run check:diacritic-folds && pnpm --filter backend run check:doc-snippets && pnpm --filter backend run check:module-docs && pnpm --filter backend run check:docs-translations && pnpm --filter backend run check:error-translations && pnpm --filter backend run check:bundle-pairing && pnpm --filter backend run check:env-inputs && pnpm --filter backend run check:block-names && pnpm --filter backend run check:block-renderers && pnpm --filter backend run check:class-vocabulary && pnpm --filter backend run check:off-state-coverage && pnpm --filter backend run check:test-ownership && pnpm --filter backend run check:default-language-prose && pnpm --filter backend run check:demo-data-budget && pnpm --filter backend run check:storefront-indexability && pnpm --filter backend run check:rsc-discipline && pnpm --filter backend run i18n:hardcoded && pnpm run check:pdfmake-footprint && pnpm --filter backend run overlay:check && pnpm --filter backend run check:divergence && pnpm --filter backend run check:release-intent && pnpm --filter backend run check:platform-surface && pnpm --filter backend run manifests:check`
  (re-read `.github/workflows/quality.yml` first; if a step was added since this list was written, run it too)
- [ ] T094 `quality:static`: `bash scripts/check-naming.sh && bash scripts/check-language.sh`
- [ ] T095 `test:frontend`-equivalent: `pnpm --filter '!backend' run test` (admin, storefront, contracts and every module package — this is the only command that reaches `mod-quote-requests`' and `mod-price-lists`' co-located tests)
- [ ] T096 `release:changeset`-equivalent: `pnpm --filter backend run check:release-intent -- --since origin/master && pnpm --filter backend run test:release-gate`
- [ ] T097 [PG] Every `[PG]` file this feature added or extended, in one run: `pnpm --filter backend exec vitest run test/integration/quote_requests test/contract/quote_requests test/contract/price_lists/admin-resolved-price.test.ts test/integration/crm/value.test.ts test/integration/crm/quote-conversion.test.ts test/integration/crm/quote-requests-off.test.ts test/contract/admin_users/permission-inventory.test.ts test/contract/kernel/harness-parity.test.ts` — paste the summary into the PR (D-198: CI will not run these before merge)
- [ ] T098 Deleted or moved a file? `grep -rn` its path under `backend/test/` before finishing (AGENTS.md trap); confirm `git status` shows no stray generated artefact
- [ ] T099 Walk `quickstart.md` §1–§4 on `pnpm run dev` and note any divergence in the PR

**Verification**: T091–T097 all exit 0, each run on its own; the PR description carries the T097 summary and the T099 notes.

---

## Requirement coverage

Every FR traces to a RED task: FR-001/002 → T025, T027, T042; FR-003–005 → T043, T046; FR-006/007 → T020, T044; FR-008/023 → T028, T065; FR-009 → T026, T028, T079; FR-010/011/014 → T051, T057; FR-012/013/015/016/036 → T050, T052; FR-017/018 → T051, T057; FR-019 → T042, T052; FR-020/026/027 → T063, T064, T072; FR-021/025 → T064, T078; FR-022/037 → T062, T065; FR-024 → T065; FR-028 → T072, T085; FR-029/031 → T071 (permission inventory, no new code), T093 (`check:action-route-permissions`); FR-030 → T058, T049, T061, T076, T078; FR-033 → T086–T088, T090; FR-034/035 → T034–T036, T044; FR-038 → T037.

## Parallel opportunities

- Phase 2: T003 ‖ T004; Phase 3: T014 ‖ T015 ‖ T016; every phase's RED tasks are mutually parallel.
- After Phase 10: Phase 11 ‖ Phase 12 (admin and storefront, different files).
- Phase 13: T086 ‖ T087 ‖ T088 ‖ T089.

## Implementation strategy

MVP = Phases 1–7 (US1: the reference price on the admin screen, with carry-over). Then US2/US3
(Phases 8–9), then US4 (Phases 10–12). Each story is independently testable as listed in
`spec.md`; Phases 13–14 close the feature.
