# Tasks: quote request reference price, readable history, per-customer negotiation lock

**Feature**: `specs/146-quote-request-pricing-history/` | **Issues**: #279, #283, #284
**Input**: `spec.md` (clarified; edits through 12efc10ac), `plan.md`, `research.md` (R1–R16),
`data-model.md`, `contracts/admin-quote-request-api.md`, `contracts/price-negotiation-api.md`,
`contracts/ports.md`, `quickstart.md`. Revised after `/speckit.analyze` (findings G1, C1, M1–M6,
L1–L7) and the security threat model (T1–T17); the finding id is cited on the task it changed.

**Organisation**: sixteen phases, each sized for **one builder spawn** (≤ 10 tasks) and ending with
an exact **Verification** line. Tests are mandatory (Principle III): inside every phase the
`RED` task — a failing test — precedes the task that makes it pass. Run it and see it fail before
implementing. Task ids are stable: tasks added after the first issue of this file carry a letter
suffix (`T040a`) rather than renumbering.

## Format

`- [ ] T### [P?] [US?] [PG?] description — file path(s)`

- **[P]** — may run in parallel with its neighbours (different files, no dependency on an
  unfinished task).
- **[US1…US4]** — the spec's user story; none = foundational or cross-cutting.
- **[PG]** — needs Postgres (and Redis) running: `pnpm run dev:infra`. These tests are **not** in
  `test:unit:fast` and **not** run by CI before merge (D-198) — run them locally and paste the
  result into the pull request.
- **RED** — the deliverable is a failing test.
- **[Tn]** / **[Mn]** … — the threat-model or analyze finding the task answers.

## Rules for every phase (read once)

- **Every commit is signed off: `git commit -s`** (the `dco` PR job refuses an unsigned commit,
  G1). Never add a `Co-Authored-By` or any other AI trailer.
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
  Service-free backend unit tests run with `--config vitest.unit.config.ts` (L3); `[PG]` files run
  with the default config.
- After adding an entity, a migration or a manifest change: `pnpm --filter backend run composer:generate`,
  `pnpm --filter backend run manifests:generate`, `pnpm install --lockfile-only`; commit every
  regenerated artefact in the same commit. **If `composer:generate` rewrites
  `docs/docs/module-reference/quote-requests.md` (or `price-lists.md`), refresh its Polish mirror in
  the same commit** (M1): the cache entry `docs/translation-cache/pl/generated:module-reference--<slug>.json`
  (`sourceHash` of the new English body, `content`) and the materialised page under
  `docs/i18n/pl/docusaurus-plugin-content-docs/current/module-reference/`, per
  `docs/docs/contributing/documentation-i18n.md` § *Three-step edit sequence*; then
  `check:docs-translations`.
- Migrations are scaffolded, never numbered by hand:
  `pnpm --filter backend run migration:new -- --module quote_requests --name <slug>`.
- **Never make a request schema strict** that is not strict today (M4). `createQuoteRequestSchema`
  strips unknown keys and stays that way; `patchQuoteRequestSchema` is already `.strict()`.
- **No `em.upsert`, `nativeUpdate` or `nativeInsert` on the two policy entities** (T2): find, then
  `em.create` or assign, then flush, so the org write guard sees the row.

## Dependency chain

```text
Phase 1 ─► Phase 2 (contracts) ─► Phase 3 (schema)
                                     ├─► US1: Phase 4 ─► Phase 5 ─► Phase 6 ─► Phase 7
                                     ├─► US2/US3: Phase 8 ─► Phase 9        (Phase 8 after Phase 6: both edit rfq-admin-service.ts)
                                     └─► US4: Phase 10 ─► Phase 10b ─► Phase 11, Phase 12   (Phase 10 after Phase 6: both edit patchDraft)
Phases 4–12 ─► Phase 13 (off-state, docs, changesets) ─► Phase 14 (quality.yml gate) ─► Phase 15 (the other PR workflows)
```

Phases 5, 6, 8 and 10 all edit `rfq-service.ts` / `rfq-admin-service.ts`: build them **in
sequence** on one checkout, not in parallel. Phases 11 and 12 may run in parallel after Phase 10b.

---

## Phase 1: Setup

**Goal**: a known-good baseline before any change.

- [ ] T001 Confirm branch `feat/146-quote-request-pricing-history`, clean tree, and run `pnpm install --frozen-lockfile && pnpm run build:packages`
- [ ] T002 Record the baseline: `pnpm --filter @endora-commerce/mod-quote-requests run test` and `pnpm --filter backend exec vitest run test/integration/quote_requests` `[PG]` — note any pre-existing red in the PR description so it is not attributed to this feature

**Verification**: `pnpm --filter @endora-commerce/mod-quote-requests run test && pnpm --filter @endora-commerce/mod-quote-requests run typecheck`

---

## Phase 2: Foundational — contracts first (Principle II)

**Goal**: every new shape exists in `packages/contracts/` with a test, before any service code.

- [ ] T003 [P] RED contract tests for the quote-request additions: item `referencePrice` / `customerProposedUnitPrice` / packaging keys optional; history entry, change and actor unions (every kind parses, an unknown kind is refused); the history response carries `truncated` (T9); the admin actor carries no `email` key (T9); negotiation DTOs parse and the two `set*` bodies refuse an unknown key (declared `.strict()` in `contracts/price-negotiation-api.md` — new bodies; see plan § Hand-off, coordinator question 1); `storefrontQuoteRequestNegotiationSchema` has exactly one key; `createQuoteRequestSchema` and `patchQuoteRequestSchema` refuse 201 items and accept 200 (T11), and `createQuoteRequestSchema` still **strips** an unknown line key such as `referenceUnitPrice` (it is not made strict, M4); a `QuoteRequestLineRecord` stub without the two new reference fields still type-checks against `QuoteRequestReadPort` (option (b) is additive) — `packages/contracts/src/quote-requests.test.ts`
- [ ] T004 [P] RED contract test for `BuyerLinePricePort` / `BuyerLinePriceQuery` (type-level: a structural stub compiles; `LinePricePort` stubs still compile unchanged) — `packages/contracts/src/price-lists.test.ts`
- [ ] T005 Add to `packages/contracts/src/quote-requests.ts`, per `contracts/admin-quote-request-api.md` §1, §3:
  - (a) the admin item keys, `salesChannelId` (admin-only, optional) on `quoteRequestSchema`, the history schemas (`{ entries, truncated }`) and `QuoteRequestHistoryEntry` types;
  - (b) `.max(200)` on `items` of `createQuoteRequestSchema` and `patchQuoteRequestSchema` (T11; additive cap, strictness unchanged);
  - (c) optional `referenceUnitPrice?: string | null` and `referenceCurrency?: string | null` on `QuoteRequestLineRecord`, with the doc comment updated (export readers use them; the quote → cart conversion still ignores money) — owner decision, option (b), `contracts/ports.md` §5.
- [ ] T006 Add the negotiation schemas (`quoteRequestOrgNegotiationSchema`, `setQuoteRequestOrgNegotiationSchema`, `quoteRequestNegotiationOverrideSchema`, `quoteRequestAccountNegotiationSchema`, `setQuoteRequestAccountNegotiationSchema`, `storefrontQuoteRequestNegotiationSchema`) per `contracts/price-negotiation-api.md` — `packages/contracts/src/quote-requests.ts`
- [ ] T007 Add `CreateForCustomerOptions` and the optional third parameter of `RfqCustomerPort.createForCustomer` per `contracts/ports.md` §2, with the T6 validation rules written into its doc comment — `packages/contracts/src/quote-requests.ts`
- [ ] T008 Add `BuyerLinePriceLine`, `BuyerLinePriceQuery`, `BuyerLinePriceAnswer`, `BuyerLinePricePort` per `contracts/ports.md` §1 — `packages/contracts/src/price-lists.ts`
- [ ] T009 Add `RFQ_PRICE_PROPOSAL_NOT_ALLOWED` to `ERROR_CODES` — `packages/contracts/src/errors.ts`; export everything new from `packages/contracts/src/index.ts` if that barrel lists names explicitly
- [ ] T010 Build contracts and type-check every consumer of `RfqCustomerPort` (carts, orders, shopping_lists, quick_order, customers must compile unchanged)

**Verification**: `pnpm --filter @endora-commerce/contracts exec vitest run src/quote-requests.test.ts src/price-lists.test.ts && pnpm --filter @endora-commerce/contracts run build && pnpm -r run typecheck`

---

## Phase 3: Foundational — schema and entities

**Goal**: the two migrations, the extended and new entities, registered; tenant classification proven (plan I1).

- [ ] T011 [PG] RED integration test: the item reference columns exist and the all-or-none constraint refuses a partial row; both policy tables exist with their FKs and cascade; a `QuoteRequestAccountPolicy` row is readable by an organization administrator of the account's organization, unreadable from another organization, and visible to a sales representative of that organization (plan I1); **and a `QuoteRequestOrgPolicy` row is likewise unreadable from another organization's buyer context and from a sales representative not assigned to it** (C1) — `backend/test/integration/quote_requests/pricing-history-schema.test.ts`
- [ ] T012 Scaffold migration `item_reference_price` (three columns + check constraint, `down` drops them) per `data-model.md` §1 — `pnpm --filter backend run migration:new -- --module quote_requests --name item_reference_price`, then fill `packages/modules/quote_requests/src/migrations/<generated>_quote_requests_item_reference_price.ts`
- [ ] T013 Scaffold migration `negotiation_policies` (both tables, FKs `on delete cascade`, defaults) per `data-model.md` §5–§6, with a comment on each FK that the cascade removes **policy rows only** — it never reaches a quote request (T14) — `pnpm --filter backend run migration:new -- --module quote_requests --name negotiation_policies`
- [ ] T014 [P] Extend `QuoteRequestItem` with `referenceUnitPrice`, `referenceCurrency`, `referenceCapturedAt` (in `[OptionalProps]`) — `packages/modules/quote_requests/src/backend/entities/quote-request-item.entity.ts`
- [ ] T015 [P] Extend `QuoteRequestRevisionLine` with optional `packagingUnitName`, `packagingUnitBaseQuantity`; write them in `toSnapshotLine` — `packages/modules/quote_requests/src/backend/entities/quote-request-revision.entity.ts`, `packages/modules/quote_requests/src/backend/services/rfq-revision-service.ts`
- [ ] T016 [P] Create `QuoteRequestOrgPolicy` (`@OrgScoped()`) and `QuoteRequestAccountPolicy` (`@TransitivelyScoped('CustomerAccount', 'customerAccountId')`) — `packages/modules/quote_requests/src/backend/entities/quote-request-org-policy.entity.ts`, `quote-request-account-policy.entity.ts`; add both to the `entities` array in `src/backend/index.ts`. The class comment states that **enforcement does not rely on the filter** (it reads by primary key under a named system scope, research R11/T1); the classification governs the admin reads
- [ ] T017 Regenerate and commit artefacts: `composer:generate` (`backend/src/db/migrations-registry.generated.ts`, `entities-registry.generated.ts`), `manifests:generate`, `pnpm install --lockfile-only`
- [ ] T018 If T011's tenant case fails on I1, apply research R10's fallback (`@GlobalEntity()` + explicit keys) and record it in `plan.md` § Inferred; otherwise mark I1 proven there. Either way the enforcement read stays the exact-primary-key, system-scoped read of R11 (T1) — the fallback changes the admin reads only

**Verification**: `pnpm --filter backend exec vitest run test/integration/quote_requests/pricing-history-schema.test.ts test/integration/quote_requests/migration.test.ts` `[PG]` `&& pnpm --filter backend exec tsx scripts/check-entity-tenant-classification.ts && pnpm --filter backend exec vitest run --config vitest.unit.config.ts test/unit/db/migrations-registry.test.ts test/unit/db/fk-dependency-drift.test.ts`

---

## Phase 4: US1 — channel-aware buyer price in `price_lists` (FR-001, FR-006, FR-007)

**Goal**: one implementation answers "what does this buyer pay on this channel", as a port and through the probe; the probe answers only about organizations the caller may see.

- [ ] T019 [P] [US1] RED unit test for `BuyerLinePriceService.resolveForBuyer`: customer group precedence (account over organization), channel by id vs system default when `null`, unknown channel → `400 VALIDATION_FAILED` with a message that does not echo the id, unknown product → `price: null` for that key, quantity bracket honoured, keys echoed in order; a 250-line query is resolved in bounded chunks with one product/customer/organization/channel load per chunk (T11) — `packages/modules/price_lists/src/backend/services/buyer-line-price-service.test.ts`
- [ ] T020 [P] [US1] [PG] RED contract test: `GET /api/v1/admin/products/:id/resolved-price?salesChannelId=` resolves on that channel (120.00 on A vs 130.00 on default — US1 #4b); absent → default; unknown id → 400 identical in body to a malformed one; `price_lists:read` still required; **a sales representative holding `price_lists:read` asking about an organization they are not assigned to (by `organizationId`, or by a `customerAccountId` of that organization) → refused with the same status and body as an unknown organization; a `customerAccountId` not in the given `organizationId` → 400; a platform administrator unaffected** (T8, D-3M) — extend `backend/test/contract/price_lists/admin-resolved-price.test.ts`
- [ ] T021 [US1] Implement `BuyerLinePriceService` by lifting the probe body out of `routes.ts` (batch, chunked per T019: load products, customer, organization and channel once per chunk) — `packages/modules/price_lists/src/backend/services/buyer-line-price-service.ts`
- [ ] T022 [US1] Make the probe route delegate to the service and accept `salesChannelId`; add the T8 authority step before resolving: resolve the organization (from `organizationId`, else the account's own), refuse an account/organization mismatch, and for a non-platform admin require `organizationSalesRepScopePort.canSeeOrganization` (resolved with `lazyPort` in `index.ts`; `organizations` is already a dependency of `price_lists`) — `packages/modules/price_lists/src/backend/routes.ts`, `src/backend/index.ts`
- [ ] T023 [US1] Publish `ctx.di.providePort<BuyerLinePricePort>('buyerLinePricePort', …)` — `packages/modules/price_lists/src/backend/index.ts`. The port itself performs no authority check: its only caller passes the request owner from a row it already authorised (comment says so)
- [ ] T024 [US1] Build `price_lists`; run `check:port-shape` and `check:port-dependencies`

**Verification**: `pnpm --filter @endora-commerce/mod-price-lists exec vitest run src/backend/services/buyer-line-price-service.test.ts && pnpm --filter @endora-commerce/mod-price-lists run typecheck && pnpm --filter backend exec vitest run test/contract/price_lists/admin-resolved-price.test.ts` `[PG]` `&& pnpm --filter backend run check:port-shape && pnpm --filter backend run check:port-dependencies`

---

## Phase 5: US1 — capture at submission, cart conversion, list totals (FR-001, FR-002, FR-008, FR-009, FR-023)

**Goal**: every customer write path stores a server-side reference for the request's owner and channel; cart conversion stores the cart price as reference and no proposal; the customer list total follows the every-line rule.

- [ ] T025 [P] [US1] RED unit test for `resolveReferencePrices(port, { owner, salesChannelId, lines, supplied? })`: supplied references used verbatim and not resolved; `null` answer → no reference; a thrown error → no reference for any line; `ModuleDisabledError` re-thrown; lines are sent to the port in chunks (T11); the query's `quantity` is the line's `quantity` and never multiplied by `packagingUnitBaseQuantity` (T6) — `packages/modules/quote_requests/src/backend/services/reference-price.test.ts`
- [ ] T026 [P] [US1] RED unit test for `summarize`: no proposal → `totalAtCustomerPrice: null`; partial → `null`; all (2 × 100 + 1 × 50) → 250 (US1 #8a–#8c) — `packages/modules/quote_requests/src/backend/services/summarize.test.ts` (export `summarize` from `rfq-service.ts` or move it to `services/summarize.ts`)
- [ ] T027 [P] [US1] [PG] RED integration test: customer create on channel A stores 120.00 / PLN / timestamp for the owner (US1 #1, #4b); resubmit resolves on its own channel; a pricing failure still creates the request with no reference; **a `POST` body carrying `referenceUnitPrice`, `referencePrice` or `lineReferencePrices` (per line and at the top level) is accepted with those keys ignored, and the stored reference equals the server-resolved value** (M4, T6 — the create schema strips; do not assert a 400); a `PATCH` body carrying them is refused `400` by the already-strict patch schema — `backend/test/integration/quote_requests/reference-price.test.ts`
- [ ] T028 [P] [US1] [PG] RED integration test: cart → quote conversion stores the cart unit price as reference and `desiredUnitPrice: null` (US1 #8, FR-008); the storefront list summary shows `totalAtCustomerPrice: null`; the CRM opportunity value of that request is 0 (FR-009); `createForCustomer` called in-process with an invalid `lineReferencePrices` entry (negative, non-finite, three decimals, lower-case or 2-letter currency, length ≠ items) throws and writes nothing (T6); **`quoteRequestReadPort.listItems` on the converted request returns `desiredUnitPrice: null`, `referenceUnitPrice` = the cart unit price and `referenceCurrency` = the cart currency, and both `null` on a line with no stored reference** (owner decision (b)) — `backend/test/integration/quote_requests/cart-conversion-reference.test.ts`, extend `backend/test/integration/crm/value.test.ts`
- [ ] T029 [US1] Implement `reference-price.ts` with the single narrow `catch` (first line `rethrowIfModuleDisabled(error)`, comment citing research R2) and chunked port calls — `packages/modules/quote_requests/src/backend/services/reference-price.ts`
- [ ] T030 [US1] Wire `lazyPort<BuyerLinePricePort>(ctx, 'buyerLinePricePort')` into the module options and `RfqService` deps; add `'price_lists'` to manifest `dependencies` and update the `permissions` comment that said it is not one (research R2); then `composer:generate` — **the generated module reference `docs/docs/module-reference/quote-requests.md` gains a `price_lists` row in its Dependencies table: commit it with its Polish mirror (cache entry `docs/translation-cache/pl/generated:module-reference--quote-requests.json` and the materialised page) per the phase rules** (M1) — `packages/modules/quote_requests/src/backend/index.ts`, `src/backend/plugin.ts`, `src/manifest.ts`
- [ ] T031 [US1] Capture references in `createForCustomer` (honouring `options.lineReferencePrices` after validating each entry — finite, ≥ 0, at most 2 decimals, `/^[A-Z]{3}$/` currency, length equal to `input.items`, else throw before any write, T6) and `resubmit`; fix `summarize` to the every-line rule — `packages/modules/quote_requests/src/backend/services/rfq-service.ts`
- [ ] T032 [US1] Change `convertToQuoteRequest` to send no `desiredUnitPrice` and pass `lineReferencePrices` from `CartItem.unitPrice` / `currency` (the net unit price, T12); update its call-shape assertion — `packages/modules/carts/src/backend/services/cart-conversion-service.ts`, `backend/test/unit/carts/cross-module-ports.unit.test.ts`
- [ ] T032a [US1] Populate `referenceUnitPrice` / `referenceCurrency` in `listItems` from the item's reference columns (`null` when none), making T028's read-port assertions pass — `packages/modules/quote_requests/src/backend/services/quote-request-read-port.ts`
- [ ] T033 [US1] Build `quote_requests`, `carts`; run the checks the new edge and catch touch, `overlay:check` (the manifest dependency changed, M1) and `check:docs-translations`

**Verification**: `pnpm --filter @endora-commerce/mod-quote-requests exec vitest run src/backend/services/reference-price.test.ts src/backend/services/summarize.test.ts && pnpm --filter backend exec vitest run --config vitest.unit.config.ts test/unit/carts/cross-module-ports.unit.test.ts test/unit/db/module-graph.test.ts test/unit/_lifecycle/dead-activation-switches.test.ts && pnpm --filter backend exec vitest run test/integration/quote_requests/reference-price.test.ts test/integration/quote_requests/cart-conversion-reference.test.ts test/integration/crm/value.test.ts test/integration/quote_requests/conversion.test.ts` `[PG]` `&& pnpm --filter backend run check:port-dependencies && pnpm --filter backend run check:port-catches && pnpm --filter backend run overlay:check && pnpm --filter backend run check:docs-translations`

---

## Phase 6: US1 — line carry-over and the draft-edit guard (FR-002, FR-034, FR-035, FR-036, FR-038)

**Goal**: rewrites keep what the rep or customer did not change; customers may edit until an admin revision exists, and never after one, however the two race.

- [ ] T034 [P] [US1] RED unit test for the pairing helper: `id` + same product pairs; `id` with another product does not; no `id` pairs by product + variant, then packaging name, then order; two variants of one product never cross-pair; unpaired existing rows reported removed; **a paired customer line whose body omits `desiredUnitPrice` carries the stored proposal, an explicit value replaces it** (T5) — `packages/modules/quote_requests/src/backend/services/line-carry-over.test.ts`
- [ ] T035 [P] [US1] [PG] RED integration test: admin `modify` changing only the agreed price keeps variant V, line note and packaging unit, `desiredUnitPrice` and the stored reference (US1 #9); absent `lineNote` keeps, `lineNote: null` clears; a new line has no reference — `backend/test/integration/quote_requests/line-carry-over.test.ts`
- [ ] T036 [P] [US1] [PG] RED integration test: customer `patchDraft` stores packaging unit as sent with the name suffix, keeps the reference of an unchanged line, re-resolves a line whose quantity changed (US1 #10, R5.3); a paired line sent without `desiredUnitPrice` keeps its stored proposal (T5) — same file
- [ ] T037 [P] [US1] [PG] RED integration test, FR-038 / US1 #11 and T3: two consecutive customer draft edits succeed, and so do five more (customer-only edits never close the draft); after an admin `modify`, a further customer edit is refused `409 RFQ_NOT_DRAFT` and writes nothing; an admin `note-added` does not close the draft; the edit is also refused when **only** `rfq.awaitingCustomerRevisionAcceptance` is set, and when **only** the latest revision is admin-authored with no `modified` event yet; an organization administrator's edit of a colleague's draft does not close it — extend `backend/test/integration/quote_requests/negotiation-loop.test.ts`
- [ ] T037a [US1] [PG] RED integration race test (T3): an admin `modify` that has committed its revision and line rewrite but not yet appended its `modified` event (hold it between the two with a test hook or a second connection holding the row lock) — a concurrent customer `patchDraft` either waits on the row lock and is then refused, or is refused outright; it never writes over the admin revision — same file
- [ ] T038 [US1] Implement `line-carry-over.ts` (including the T5 carry of an omitted proposal) — `packages/modules/quote_requests/src/backend/services/line-carry-over.ts`
- [ ] T039 [US1] Use it in `modify` (carry packaging, product name snapshot, `desiredUnitPrice`, reference; variant / note per R5.2) — `packages/modules/quote_requests/src/backend/services/rfq-admin-service.ts`
- [ ] T040 [US1] Use it in `patchDraft` (packaging as sent with suffix, reference kept or re-resolved for the **owner**, omitted proposal carried, T5); replace the guard with `assertDraftOpenForCustomer` (research R15): refuse when `rfq.awaitingCustomerRevisionAcceptance`, **or** a `modified` event with `actorAdminUserId` set exists, **or** the latest revision is admin-authored; evaluate it before the lock for a cheap refusal **and again inside `underRowLock`** after the version check, re-reading the row and events there (T3); add a per-route `config: { rateLimit }` to the customer `PATCH /api/v1/quote-requests/:id` (research R16, T11; `@fastify/rate-limit` as peer + dev dependency of the package, the `product_feeds` / `settings` precedent) — `packages/modules/quote_requests/src/backend/services/rfq-service.ts`, `src/backend/routes.customer.ts`, `packages/modules/quote_requests/package.json`
- [ ] T041 [US1] Build, `pnpm install --lockfile-only` (package.json changed), and re-run the module's existing quote-request integration suite to catch a carry-over regression

**Verification**: `pnpm --filter @endora-commerce/mod-quote-requests exec vitest run src/backend/services/line-carry-over.test.ts src/backend/services/revision-diff.test.ts && pnpm --filter backend exec vitest run test/integration/quote_requests` `[PG]` `&& pnpm --filter backend run manifests:check`

---

## Phase 7: US1 — admin detail: reference, proposal, difference (FR-003 – FR-007, FR-019)

**Goal**: the rep sees reference, proposal and difference on Overview and while modifying; the Modify tab sends what it must keep; nothing admin-only leaks to the customer.

- [ ] T042 [P] [US1] [PG] RED contract test: admin `GET /api/v1/admin/quote-requests/:id` items carry `referencePrice`, `customerProposedUnitPrice` (including the submission-record fallback for a line whose row lost the proposal, R4), packaging keys, and the request carries `salesChannelId`; **the customer `GET /api/v1/quote-requests/:id` and `GET /api/v1/quote-requests` carry no `referencePrice`, `customerProposedUnitPrice` or `actorAdminUserId` anywhere — not on items, not on `events[]`, not inside any `events[].payload`; and the customer notification / e-mail payloads emitted on create and modify carry none of the three** (T7, FR-019) — extend `backend/test/contract/quote_requests/admin-routes.test.ts`, `customer-routes.test.ts`
- [ ] T043 [P] [US1] RED admin test for Overview: columns Reference / Proposed / Difference / Agreed; −20.00 PLN and −16.67 % for 120 vs 100; "+" for a higher proposal; "—" for no proposal, currency mismatch, zero reference (% only); "price at request" vs "current price" vs "no price" labels (US1 #1, #3, #5–#7); **any 4xx or 5xx from the current-price probe (403, 404, 400, 500) renders "no price" / "—" and the rest of the screen renders** (L2) — `admin/test/modules/quote_requests/RfqDetail.reference.test.tsx`
- [ ] T044 [P] [US1] RED admin test for Modify: reference and proposal beside the agreed input, live difference as typed (US1 #2); the reference is labelled "per base unit" (T6); the empty-input prefill calls `/api/v1/admin/products/:id/resolved-price` with `customerAccountId`, `salesChannelId`, `quantity`, `variantId` and never the storefront probe (FR-007); the PATCH body carries `id`, `variantId`, `lineNote` per kept line (FR-034); **any 4xx or 5xx from the probe leaves the input empty and shows "—"** (L2) — `admin/test/modules/quote_requests/RfqDetail.modify-payload.test.tsx`
- [ ] T045 [US1] Serialise the admin-only item keys and `salesChannelId` in `serializeFull(…, true)`; implement the submission-record fallback with one revision read; **turn the customer branch into an explicit allow-list** of item, event and payload keys rather than a delete-list (T7) — `packages/modules/quote_requests/src/backend/services/rfq-service.ts`
- [ ] T046 [P] [US1] RED unit test for the pure difference helper: amount, percentage to 2 decimals, signed, every `null` rule of FR-005 (L7) — `admin/test/modules/quote_requests/reference-difference.test.ts`
- [ ] T046a [US1] Implement the helper to pass T046 — `packages/modules/quote_requests/src/admin/reference-difference.ts`
- [ ] T047 [US1] Overview columns and Modify additions ("per base unit" label); replace `resolvePriceListPrice` with the customer-and-channel probe, treating every non-2xx as "no price"; send `id` / `variantId` / `lineNote` — `packages/modules/quote_requests/src/admin/pages/RfqDetail.tsx`
- [ ] T048 [US1] Add `detail.reference.*` keys (column headers, "price at request", "current price", "no price", "per base unit") in both languages — `packages/modules/quote_requests/i18n/en.json`, `pl.json`
- [ ] T049 [US1] Run the admin suite for the module, `i18n:hardcoded` for `RfqDetail.tsx`, and `registered-bundles-shape`

**Verification**: `pnpm --filter admin exec vitest run test/modules/quote_requests && pnpm --filter backend exec vitest run test/contract/quote_requests/admin-routes.test.ts test/contract/quote_requests/customer-routes.test.ts` `[PG]` `&& pnpm --filter backend run i18n:hardcoded && pnpm --filter backend exec vitest run --config vitest.unit.config.ts test/unit/_i18n/registered-bundles-shape.test.ts && pnpm --filter @endora-commerce/mod-quote-requests run typecheck && pnpm --filter admin run typecheck`

---

## Phase 8: US2 + US3 — history projection (FR-010 – FR-019)

**Goal**: a backend read model that merges, attributes and diffs — bounded, and exposing only what the admin needs.

- [ ] T050 [P] [US2] RED unit test for `historyDiff`: added (quantity, agreed), removed, quantity, agreed price, proposed price, line note, header note; two variants of one product stay distinct (FR-015); a packaging-only change lists nothing; legacy snapshots without packaging keys still pair; identical snapshots → `[]` (FR-013) — `packages/modules/quote_requests/src/backend/services/history/history-diff.test.ts`
- [ ] T051 [P] [US2] [US3] RED unit test for `projectHistory`: every pairing of research R8 (created + submitted, created + re-submitted, admin created + automatic note, accept + approved, reject + canceled with reason, note + approved); an operator-typed note after an admin create is kept; non-adjacent or different-actor pairs do not merge; actor kinds admin / customer / system / unknown; B (organization administrator) named on an acceptance of A's request (US3 #1); missing admin or account → `name: null` (FR-018); `validity` change from the event payload; **the actor mapper copies only `firstName` + `lastName` for an admin (no `email`, `lastLoginAt`, `twoFactorEnabled`, `status`) and name + e-mail for a customer** (T9) — `packages/modules/quote_requests/src/backend/services/history/history-projection.test.ts`
- [ ] T052 [P] [US2] [US3] [PG] RED integration test, content: `GET /api/v1/admin/quote-requests/:id/history` on a request submitted, modified **three** times by a rep (price, quantity, removal, validity) and accepted — entries, actors, changes (US2 #2–#4, #6), and the customer's original proposal still present on the detail after the third revision (SC-002, M6); a customer draft edit before any revision appears as one customer `modified` entry naming the customer with "proposed price 100.00 → 95.00" and the line-note change (US2 #4a, M6); **end-to-end US1 #9 and #10: an agreed-price-only rep save lists only the agreed-price change, and a customer quantity-only draft edit lists only the quantity change — no removed/added line, no line-note change** (FR-036, M6); a pre-release request (events without `validity`) still lists line changes (US2 #8) — extend `backend/test/integration/quote_requests/history.test.ts`
- [ ] T052a [P] [US2] [US3] [PG] RED integration test, authority and bounds (C1, T9): no session → 401; a customer session → 401/403; **a sales representative not assigned to the request's organization gets the same status and body as for an unknown id (404)**; a deleted customer actor is not looked up with deleted rows (renders `name: null` → "unknown user", FR-018); a request with 101 events answers 100 entries' worth of events and `truncated: true`, and revision reads are bounded to those events; every admin actor in the response has no `email` key — same file
- [ ] T053 [US2] Implement `historyDiff` — `packages/modules/quote_requests/src/backend/services/history/history-diff.ts`
- [ ] T054 [US2] [US3] Implement `projectHistory` with an explicit actor mapper (T9) and export `AUTOMATIC_ADMIN_CREATION_NOTE` from `rfq-admin-service.ts` (use it where the note is written) — `packages/modules/quote_requests/src/backend/services/history/history-projection.ts`, `src/backend/services/rfq-admin-service.ts`
- [ ] T055 [US2] Record `payload.validity` in `modify` when `expiresAt` changes (research R7) — `packages/modules/quote_requests/src/backend/services/rfq-admin-service.ts`
- [ ] T056 [US2] [US3] Add `RfqAdminService.history(ctx, id)` (visibility through `findVisibleForAdmin`, the most recent 100 events read with `limit: 101` to set `truncated`, only the revisions those events reference plus their predecessors, one `findByIds` per actor port — customers with `activeOnly: true`, variant labels through `catalogProducts.listVariantsByProductIds`) and the route — `packages/modules/quote_requests/src/backend/services/rfq-admin-service.ts`, `src/backend/routes.admin.ts`

**Verification**: `pnpm --filter @endora-commerce/mod-quote-requests exec vitest run src/backend/services/history && pnpm --filter backend exec vitest run test/integration/quote_requests/history.test.ts` `[PG]` `&& pnpm --filter @endora-commerce/mod-quote-requests run typecheck && pnpm --filter backend run check:port-catches`

---

## Phase 9: US2 + US3 — admin History tab (FR-010, FR-011, FR-013, FR-014, FR-017, FR-018, FR-030)

**Goal**: the tab reads as a translated, attributed timeline.

- [ ] T057 [P] [US2] [US3] RED admin test: the tab fetches `/history` when opened; every entry kind and change kind renders a translated title in `en` and `pl` and no raw identifier (FR-010, a test iterates the schema enums); actor shows name + e-mail for customers, name + translated role for admins, "System", or recorded role + "unknown user"; reason and note shown; an empty change list renders "re-sent without changes"; `truncated: true` renders a "older entries not shown" notice; **a note, reason or line note containing `<img src=x onerror=…>` renders as literal text** (T17) — `admin/test/modules/quote_requests/RfqDetail.history.test.tsx`
- [ ] T058 [P] [US2] RED test that every `quoteRequestHistoryEntryKindSchema` and change `kind` value has a `detail.history.*` key in both bundles — `packages/modules/quote_requests/src/backend/history-bundle-coverage.test.ts`
- [ ] T059 [US2] [US3] History tab component (entry list, change list formatting with the locale's money and date formats, role-label mapping for the five known labels, custom role shown as stored, truncation notice; free text rendered as React text only — no `dangerouslySetInnerHTML`, T17) — `packages/modules/quote_requests/src/admin/pages/RfqHistory.tsx`, mounted from `RfqDetail.tsx`
- [ ] T060 [US2] [US3] `detail.history.*` keys in both languages — `packages/modules/quote_requests/i18n/en.json`, `pl.json`
- [ ] T061 [US2] Run the module's admin tests, `i18n:hardcoded`, `check:bundle-pairing`

**Verification**: `pnpm --filter admin exec vitest run test/modules/quote_requests && pnpm --filter @endora-commerce/mod-quote-requests exec vitest run src/backend/history-bundle-coverage.test.ts && pnpm --filter backend run i18n:hardcoded && pnpm --filter backend run check:bundle-pairing && pnpm --filter admin run typecheck`

---

## Phase 10: US4 — lock service and enforcement (FR-020, FR-022 – FR-024, FR-037)

**Goal**: the owner's effective value is read by primary key in a named system scope and enforced in the writing request, failing closed.

- [ ] T062 [P] [US4] RED unit test for `NegotiationPolicyService.effectiveFor` (account over organization over default; `null` account value = inherit; both reads are by exact primary key; both run inside `withSystemScope` with the documented reason string) and `assertProposalsAllowed` (no proposal → no read; **`desiredUnitPrice: 0` counts as a proposal**, T4; locked + proposal → `422 RFQ_PRICE_PROPOSAL_NOT_ALLOWED`; **a read that throws propagates — never "allowed"**, M5) — `packages/modules/quote_requests/src/backend/services/negotiation-policy-service.test.ts`
- [ ] T065 [P] [US4] [PG] RED integration test for enforcement: locked customer's create with a proposal → 422, nothing written (US4 #3), also with `desiredUnitPrice: 0.00` (T4); without proposal → created; cart conversion succeeds with the lock on (US4 #4, T4); **`resubmit` succeeds with the lock on** (T4); account override allowed under a locked organization (US4 #7a) and locked under an allowed one (US4 #7b); organization administrator B (allowed) editing locked colleague A's draft with a proposal → 422, and locked B proposing on allowed colleague's draft succeeds (US4 #7d, T1, T13); a locked owner's draft edit that omits `desiredUnitPrice` on a line already carrying a proposal succeeds and keeps the stored proposal (T5, FR-024); admin create/modify for a locked customer unchanged (US4 #6, FR-024); existing proposals untouched (US4 #5); **lock state unreadable (policy table read fails — inject through the service seam) → the request fails 5xx and nothing is written; the same failure with no proposal in the body → created** (M5). Seed policy rows directly through the entity in the test fixture — the Commands arrive in Phase 10b — `backend/test/integration/quote_requests/negotiation-enforcement.test.ts`
- [ ] T065a [P] [US4] [PG] RED integration test, tenant-blind reads (T1, M3): with A's account row (or A's organization row) locked, call `effectiveFor` for A under a tenant context the filter would **exclude** A's rows from — a `single-org` context for a different organization, and a sales-representative `allowed-set` that omits A's organization — and assert it still answers "not allowed" (a same-organization context would pass through the filter and prove nothing) — **a row that exists never reads as absent**; B (same organization, allowed) editing A's draft with a proposal → 422 end-to-end; an organization row and an account row are each read only by their primary key (assert no other row is touched with two organizations' rows present); **moved account: account X moved from organization O (locked) to organization P (allowed), no override, still owning a draft stamped `organizationId = O` → X's next draft edit with a proposal is governed by P (allowed); with O and P swapped → refused** (D-3L) — same file
- [ ] T066 [US4] Implement `NegotiationPolicyService` (research R11): owner ids from the `rfq` row or the session, never the body; the owner's **current** organization from `customerAccountReadPort.findById` (D-3L, M3); both reads `em.findOne(…, { <primary key> })` inside `withSystemScope('quote_requests: negotiation lock for the request owner, read by primary key after the caller authorised the request', …)` on the caller's `em`; no `catch` — `packages/modules/quote_requests/src/backend/services/negotiation-policy-service.ts`
- [ ] T069 [US4] Call `assertProposalsAllowed` in `createForCustomer` (acting customer = owner) **after body validation and before the first `persist`**, and in `patchDraft` **inside `underRowLock`, after the version check and the T3 guard re-check, before any line is written**, for `rfq.customerAccountId` (organization resolved per T066); the predicate is `line.desiredUnitPrice !== undefined` on the body as sent (T4) — `packages/modules/quote_requests/src/backend/services/rfq-service.ts`
- [ ] T070 [US4] Declare `RFQ_PRICE_PROPOSAL_NOT_ALLOWED` in manifest `errorCodes` (update the count in the comment by re-deriving it) and add `errors.RFQ_PRICE_PROPOSAL_NOT_ALLOWED` to both bundles; run `composer:generate` and, if it rewrote the module reference page, refresh its Polish mirror (phase rules, M1) — `packages/modules/quote_requests/src/manifest.ts`, `i18n/en.json`, `i18n/pl.json`
- [ ] T071 [US4] Build; run the checks that judge errors and ports

**Verification**: `pnpm --filter @endora-commerce/mod-quote-requests exec vitest run src/backend/services/negotiation-policy-service.test.ts && pnpm --filter backend exec vitest run test/integration/quote_requests/negotiation-enforcement.test.ts` `[PG]` `&& pnpm --filter backend run check:error-translations && pnpm --filter backend run check:port-dependencies && pnpm --filter backend run check:docs-translations && pnpm --filter backend run overlay:check`

---

## Phase 10b: US4 — Commands and routes (FR-020, FR-025 – FR-027)

**Goal**: audited, authority-checked writes and the admin and storefront reads.

- [ ] T063 [P] [US4] RED unit test for the two Commands: action, objectType, objectId, before/after values, `skipAudit` on no change; **the authority step runs before any read-for-write — organization Command: `canSeeOrganization` for a non-platform admin; account Command: `customerAccountReadPort.findInOrganization(accountId, account's organization)` then `canSeeOrganization` — and a refusal writes nothing and records no audit row**; the write path never calls `em.upsert` / `nativeUpdate` (T2) — `packages/modules/quote_requests/src/backend/commands/negotiation-policy-commands.test.ts`
- [ ] T064 [P] [US4] [PG] RED integration test for the routes: `GET` with `customers:read`, `PUT` refused without `customers:manage`; three override states; effective value + source, computed from the account's **current** organization (M3); audit row with administrator (`actorAdminUserId` set) and old → new (US4 #8, T16); 404 for unknown subjects; **a sales representative scoped to organization A, holding `customers:manage`, `PUT`ting organization B's value or the override of a customer of B → refused with the same status and body as an unknown id (404), no policy row, no audit row; the same rep's `GET` of B's subjects → identical 404** (T2, C1, plan I2); the storefront `GET /api/v1/quote-requests/price-negotiation` answers only `priceProposalsAllowed`, `private, no-store`, ignores any query parameter naming another account, and does not shadow `GET /api/v1/quote-requests/:id` (plan I4) — `backend/test/integration/quote_requests/negotiation-policy-routes.test.ts`
- [ ] T067 [US4] Implement the two Commands (authority step first, then find-then-create/assign, T2; if plan I2 forces a `withSystemScope` write, it comes **after** the authority step and carries a reason string naming it) and add `commandBus` (and `requireAdminAny`) to `QuoteRequestsCradle` — `packages/modules/quote_requests/src/backend/commands/negotiation-policy-commands.ts`, `src/backend/index.ts`
- [ ] T068 [US4] Admin and storefront routes per `contracts/price-negotiation-api.md` §1–§3, registered from `plugin.ts` inside `ctx.routes`; the storefront route reads only `request.customer` ids — `packages/modules/quote_requests/src/backend/routes.negotiation.ts`, `src/backend/plugin.ts`
- [ ] T071a [US4] Build; run the checks that judge commands, entries and permissions

**Verification**: `pnpm --filter @endora-commerce/mod-quote-requests exec vitest run src/backend/commands && pnpm --filter backend exec vitest run test/integration/quote_requests/negotiation-policy-routes.test.ts test/contract/admin_users/permission-inventory.test.ts test/contract/kernel/harness-parity.test.ts` `[PG]` `&& pnpm --filter backend run check:command-coverage -- --strict && pnpm --filter backend run check:entry-scope && pnpm --filter backend run check:action-route-permissions && pnpm --filter backend run check:port-dependencies`

---

## Phase 11: US4 — admin zone panels (FR-020, FR-027, FR-028, FR-029, FR-030)

**Goal**: the two controls on the existing organization and customer screens.

- [ ] T072 [P] [US4] RED admin test: the organization panel loads state, toggles through `PUT`, is disabled without `customers:manage`; the customer panel shows the three options and "Effective: … (from account / organization / default)"; both absent when the contributor is off (zone filtered) — `admin/test/modules/quote_requests/negotiation-zones.test.tsx`
- [ ] T073 [US4] `OrganizationPriceNegotiation.tsx` (pattern: `carts`' `CartApprovalPolicyPanel`) — `packages/modules/quote_requests/src/admin/zones/OrganizationPriceNegotiation.tsx`
- [ ] T074 [US4] `CustomerPriceNegotiation.tsx` — `packages/modules/quote_requests/src/admin/zones/CustomerPriceNegotiation.tsx`
- [ ] T075 [US4] Register both: `zoneComponent('organization.detail.after', …, { weight: 500, requiredPermission: 'customers:read' })` and `zoneComponent('customer.detail.after', …, { weight: 200, requiredPermission: 'customers:read' })`; update the file's header comment (it says "three routes and one sidebar entry") — `packages/modules/quote_requests/src/admin/index.ts`
- [ ] T076 [US4] `negotiation.*` keys (title, label, description, three override labels, effective/source sentences, saved/error notices) in both languages — `packages/modules/quote_requests/i18n/en.json`, `pl.json`
- [ ] T077 [US4] Run `check:admin-zones`. **If it refuses `customers:read`, apply the pre-authorised fallback (coordinator decision D-3J, plan I3) without asking**: switch both contributions to `customers:manage`, drop the disabled state and its test case from T072, and record in `plan.md` § Inferred I3 "refuted — fallback applied (D-3J)" with the consequence (read-only holders see no panel; a `customers:manage`-only role sees the panel). If it accepts, record I3 proven; the consequence that a `customers:manage`-only role sees no panel is then documented in T086

**Verification**: `pnpm --filter admin exec vitest run test/modules/quote_requests/negotiation-zones.test.tsx && pnpm --filter backend run check:admin-zones && pnpm --filter backend run check:admin-surface && pnpm --filter backend run i18n:hardcoded && pnpm --filter backend run check:bundle-pairing && pnpm --filter @endora-commerce/mod-quote-requests run typecheck`

---

## Phase 12: US4 + US1 — storefront (FR-009, FR-021, FR-025, FR-030)

**Goal**: a locked buyer sees no proposal input and sends none; the list total renders "—".

- [ ] T078 [P] [US4] RED storefront test. `RfqDraftView` is `'use client'` and loads its lines from `localStorage` in a `useEffect`, so an SSR render (`renderToString`, the suite's only renderer — see `storefront/test/rfq/rfq-detail-actions.test.tsx`) shows an empty draft and would pass vacuously. Test the two units instead: (a) `DraftLine`, exported, rendered with a fixture line and `proposalsAllowed={false}` → no proposed-price input, catalogue price read-only, and with `true` → input present (US4 #1, #2), both languages; (b) a pure `buildSubmitItems(items, proposalsAllowed)` → no `desiredUnitPrice` on any line when `false`, unchanged when `true` (FR-021); (c) the page-level note rendered by an exported `LockedPricingNote` — `storefront/test/rfq/rfq-draft-locked.test.tsx`
- [ ] T078a [P] [US4] RED storefront test of the server action, separate from the view (L7): with the API answering `422 RFQ_PRICE_PROPOSAL_NOT_ALLOWED` and a translated envelope message, `submitQuoteRequest` returns that message to the caller unchanged; the session cookie is forwarded — `storefront/test/rfq/rfq-submit-action.test.ts`
- [ ] T079 [P] [US1] RED storefront test: the account list renders `totalAtCustomerPrice: null` as "—" (never `0,00 PLN`) and 250.00 for a fully proposed request (US1 #8a–#8c) — `storefront/test/rfq/rfq-list-total.test.tsx`
- [ ] T080 [US4] `getQuoteRequestNegotiation(sessionCookie)` validating with `storefrontQuoteRequestNegotiationSchema`, fetched with `cache: 'no-store'` and the session cookie, never through `unstable_cache` or a shared cache key (T15); returns `true` on any failure or no session (fail-open display) — `storefront/lib/api/rfq.ts`
- [ ] T081 [US4] Read it in the server page and pass the prop — `storefront/app/(commerce)/quote-request/page.tsx`
- [ ] T082 [US4] Export `DraftLine`, extract `buildSubmitItems` and `LockedPricingNote`, thread `priceProposalsAllowed` through; hide input / read-only price / note / omit proposals; new strings in the inline `strings(pl)` dictionary and `Strings` interface — `storefront/components/rfq/RfqDraftView.tsx`
- [ ] T083 [US4] Make T078a pass: surface the 422 message from the server action as the translated envelope message (no change if `actions.ts` already passes `err.message` through) — `storefront/app/(commerce)/quote-request/actions.ts`
- [ ] T084 [US4] Storefront typecheck, lint, tests; `check:rsc-discipline`

**Verification**: `pnpm --filter storefront exec vitest run test/rfq && pnpm --filter storefront run typecheck && pnpm --filter storefront run lint && pnpm --filter backend run check:rsc-discipline`

---

## Phase 13: Cross-cutting — off-state, documentation, changesets (FR-028, FR-030, FR-033)

**Goal**: the module's absence is proven, the page describes the feature in both languages, the release intent is written, the known defect touched is logged.

- [ ] T085 [PG] RED-then-green: extend the off-state test — with `quote_requests` off, the four negotiation admin routes, the storefront read and `/history` answer `503 MODULE_DISABLED`; the stored policy rows are untouched; after switching it back on the routes answer the values set before (FR-028) — `backend/test/integration/quote_requests/off-state.test.ts`
- [ ] T086 [P] Document the reference price (per base unit; net; stored at request vs current), the history entries (bounded to the last 100 events, with a notice) and the negotiation lock for operators and engineers — `packages/modules/quote_requests/docs/quote_requests.md`. The lock section states: **the lock binds the request's owner, not the acting user** — a locked organization administrator may propose on an unlocked colleague's draft, and an allowed one may not on a locked colleague's (T13); **who sees the panels** — with `customers:read` as the zone gate a role holding `customers:manage` without `customers:read` sees no panel (or, if T077 applied D-3J's fallback, read-only holders see none) (D-3J); the lock is read per request, uncached
- [ ] T087 [P] Polish translation of the same sections: update the cache entry `docs/translation-cache/pl/packages--modules--quote_requests--docs--quote_requests.md.json` (`sourceHash` of the new English body, `content`) **and** the materialised `docs/i18n/pl/docusaurus-plugin-content-docs/current/modules/quote_requests.md` (M1)
- [ ] T088 [P] Document the probe's `salesChannelId`, its organization-scope refusal (T8) and `buyerLinePricePort` — `packages/modules/price_lists/docs/` page, with its Polish cache entry and materialised counterpart as in T087
- [ ] T089 [P] Changesets, `minor`, one per meaning, written for the consumer — `.changeset/146-*.md`:
  - `@endora-commerce/contracts`: new schemas, port, error code, `RfqCustomerPort` third argument, the 200-line cap on customer create/patch bodies, optional `referenceUnitPrice` / `referenceCurrency` on `QuoteRequestLineRecord`;
  - `@endora-commerce/mod-quote-requests`: reference price, history endpoint, lock, `totalAtCustomerPrice` meaning; **the manifest gains a binding dependency on `price_lists`**; **the admin list's customer-price total no longer turns `null` at the first revision** (the proposal is now carried); **a revised line the customer left unpriced is valued in CRM at the proposal carried from the customer's last draft edit** rather than nothing, until sales sets an agreed price; customer draft edits are rate-limited (L6); **for ERP / connector readers of `quoteRequestReadPort.listItems`: cart-converted lines now carry `desiredUnitPrice = null` — read the cart price from the new `referenceUnitPrice` / `referenceCurrency`** (owner decision (b));
  - `@endora-commerce/mod-price-lists`: port, probe parameter, probe refuses organizations outside a sales representative's scope;
  - `@endora-commerce/mod-carts`: conversion no longer writes a proposal.
- [ ] T089a [P] Log the known defect this feature works around without fixing (D-3K): `lineCurrency` is hard-coded `'PLN'` on every write path in `rfq-service.ts` and `rfq-admin-service.ts`, so a non-PLN channel's reference is shown without a difference (FR-005). Target `specs/deferred-defects.md`, following that file's own format. **[NEEDS CLARIFICATION]**: that file is cited by `AGENTS.md` and the constitution but is **not in this checkout** at 12efc10ac (a withheld pre-migration record, D-247). Do not create it with an invented format: ask the coordinator whether to create it here or where to log the entry, and leave this task open until answered
- [ ] T090 Run the docs and release checks

**Verification**: `pnpm --filter backend exec vitest run test/integration/quote_requests/off-state.test.ts` `[PG]` `&& pnpm --filter backend run check:off-state-coverage && pnpm --filter backend run check:module-docs && pnpm --filter backend run check:docs-translations && pnpm --filter backend run check:doc-snippets && pnpm --filter backend run check:release-intent`

---

## Phase 14: Final — `quality.yml` gate

**Goal**: everything the `quality`, `quality:static`, `test:backend:unit`, `test:frontend` and `release:changeset` jobs of `.github/workflows/quality.yml` run, run locally, in that job's order. PR #297 went red on checks no targeted run reached; this phase and Phase 15 are why.

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

## Phase 15: Final — the other pull-request workflows (G1)

**Goal**: the four PR-triggered jobs outside `quality.yml` — `pack-gate.yml`, `boot-gate.yml`, `build-docs.yml`, `dco.yml` — run locally, so the PR opens green on all **nine** PR checks (five in `quality.yml` plus these four). Each command is copied from its workflow; re-read the workflow first in case it changed.

- [ ] T099a `pack-gate`: `pnpm --filter backend run pack-gate -- --no-build` (after T091's build; the job is path-filtered to `packages/**`, which this feature touches)
- [ ] T099b `boot-gate`: `bash scripts/boot-gate.sh --with-negatives` — **needs Docker**; if Docker is unavailable on the builder, say so in the PR instead of skipping silently
- [ ] T099c `build:docs`: `pnpm --filter docs run build && pnpm --filter backend run verify:docs-build` (the module docs, the generated reference page and the Polish mirrors changed)
- [ ] T099d `dco`: `node backend/scripts/dco-signoff.ts origin/master HEAD` — every commit on the branch carries `Signed-off-by` (the phase rules' `-s`); fix an unsigned commit by amending or rebasing with `--signoff`, never by force-pushing a shared branch without the coordinator

**Verification**: T099a–T099d all exit 0 (T099b may be reported as "not runnable here: no Docker"); results pasted into the PR beside T097's.

---

## Requirement coverage

Every FR traces to a RED task: FR-001/002 → T025, T027, T042, T052 (SC-002); FR-003–005 → T043, T046; FR-006/007 → T020, T043, T044; FR-008/023 → T028, T032a, T065; FR-009 → T026, T028, T079; FR-010/011/014 → T051, T057; FR-012/013/015/016/036 → T050, T052; FR-017/018 → T051, T052a, T057; FR-019 → T042, T052a; FR-020/026/027 → T063, T064, T072; FR-021/025 → T064, T078, T078a; FR-022/037 → T062, T065, T065a; FR-024 → T065; FR-028 → T072, T085; FR-029/031 → T071a (permission inventory, no new code), T093 (`check:action-route-permissions`); FR-030 → T058, T049, T061, T076, T078; FR-033 → T086–T088, T090; FR-034/035 → T034–T036, T044, T052; FR-038 → T037, T037a.

Threat model → task: T1 → T016, T018, T062, T065, T065a, T066; T2 → T063, T064, T067; T3 → T037, T037a, T040; T4 → T062, T065, T069; T5 → T034, T036, T038, T040, T065; T6 → T005, T007, T025, T027, T028, T031, T044; T7 → T042, T045; T8 → T020, T022; T9 → T003, T051, T052a, T054, T056; T11 → T003, T005, T019, T021, T025, T029, T040, T056; T12 → T032, `contracts/ports.md` §3; T13 → T065, T086; T14 → T013; T15 → T080; T16 → T064; T17 → T057, T059.

## Parallel opportunities

- Phase 2: T003 ‖ T004; Phase 3: T014 ‖ T015 ‖ T016; every phase's RED tasks are mutually parallel.
- After Phase 10b: Phase 11 ‖ Phase 12 (admin and storefront, different files).
- Phase 13: T086 ‖ T087 ‖ T088 ‖ T089 ‖ T089a.

## Implementation strategy

MVP = Phases 1–7 (US1: the reference price on the admin screen, with carry-over). Then US2/US3
(Phases 8–9), then US4 (Phases 10–12). Each story is independently testable as listed in
`spec.md`; Phases 13–15 close the feature.
