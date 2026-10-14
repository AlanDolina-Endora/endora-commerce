# Implementation Plan: quote request reference price, readable history, per-customer negotiation lock

**Branch**: `feat/146-quote-request-pricing-history` | **Date**: 2026-10-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/146-quote-request-pricing-history/spec.md` (clarified;
product-owner edits through 12efc10ac — packaging = base pieces, FR-031's advisory
`price_lists:read`, proposal kept across revisions; issues #279, #283, #284). Every clarification is
binding. **Revised 2026-10-14** with the `/speckit.analyze` findings (G1, C1, M1–M6, L1–L7) and the
security threat model (T1–T17); § *Security threat model — disposition* maps each to the design.

## Summary

A sales representative sees, per quote line, the price the customer would normally pay, the
customer's proposal and the difference; the History tab reads as a translated, attributed timeline
with what changed; and an administrator can forbid price proposals per organization with a
three-state override per customer account.

The technical approach, with the evidence in [research.md](./research.md):

- **Reference price stored on the line** (three nullable columns on `quote_request_items`),
  captured server-side at every customer write path through a new `price_lists` port,
  `buyerLinePricePort`, resolved for the request's **owner** on the request's **sales channel**.
  The admin resolved-price probe gains a `salesChannelId` parameter and runs the same service.
- **Cart conversion** passes the cart price as the reference through a new optional, in-process
  argument of `RfqCustomerPort.createForCustomer`; it is unreachable from the HTTP body.
- **Line carry-over** by line identity on `modify` and `patchDraft` keeps variant, note, packaging
  unit, the customer's proposal and the stored reference across the delete-and-recreate rewrite.
- **History is a read model**: a new admin endpoint projects events and revision snapshots into
  merged, attributed entries with a variant-aware diff computed on read — no backfill, no change to
  the customer reply or the customer comparison diff. Validity changes are recorded in the
  `modified` event payload from now on.
- **The lock lives in `quote_requests`' own two tables**, contributed to the existing organization
  and customer detail zones, written by two Commands, enforced in the customer create and draft-edit
  services for the request owner, and read by the storefront through one authenticated route.
- **List totals** follow the every-line-or-`null` rule on the customer list too.
- **Trust boundaries hardened** (threat model): the lock is read by primary key in a named system
  scope for the owner's current organization and asserted under the row lock; both Commands check
  authority themselves; the draft-edit guard is three-way and re-checked under the lock; the price
  probe is scoped to a representative's organizations; history exposes admin names only and is
  bounded; customer bodies are capped and draft edits rate-limited.

No new runtime dependency (one existing platform dependency, `@fastify/rate-limit`, is declared as a
peer of `mod-quote-requests` — Complexity Tracking). Two additive `quote_requests` migrations.

## Technical Context

**Language/Version**: TypeScript 5.x `strict`, Node.js ≥ 22.17, ESM
**Primary Dependencies**: Fastify, MikroORM (PostgreSQL), Zod (backend); React 19 + Vite + admin-kit zones (admin); Next.js 15 App Router server components and server actions (storefront) — **no new runtime dependency**
**Storage**: PostgreSQL — three nullable columns on `quote_request_items` and two new tables (`quote_request_org_policies`, `quote_request_account_policies`), all owned by `quote_requests`, in two migrations
**Testing**: Vitest — co-located unit tests in `packages/modules/{quote_requests,price_lists}/src/backend/**` and `packages/contracts/src`, `backend/test/{contract,integration}/quote_requests` and `price_lists` against Postgres, `admin/test/modules/quote_requests`, `storefront/test/rfq`
**Target Platform**: Linux server; backend, admin SPA and storefront deployed separately
**Project Type**: web application — monorepo with `backend/`, `admin/`, `storefront/`, `packages/`
**Performance Goals**: submission adds one batch port call per request (not per line); admin detail adds one revision read; history is loaded only when the tab opens, with one name lookup per actor kind
**Constraints**: no reference supplied by a client is trusted (FR-001); the lock is decided in the writing request, by primary key, and never fails open (spec edge case, T1); the customer reply's actor exposure does not widen (FR-019, T7); out-of-scope reads answer exactly like unknown ids (Constitution XI, C1); a switched-off module contributes nothing and keeps its values (FR-028)
**Scale/Scope**: 3 modules changed (`quote_requests`, `price_lists`, `carts`) plus `contracts`, admin and storefront; 6 new routes, 1 new port, 2 Commands, 2 zone contributions, 2 migrations, 1 error code; 16 task phases (see § Hand-off)

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design — same verdict.*

| Principle | Verdict | How the design meets it |
| --- | --- | --- |
| **I. Modular architecture (NN)** | Pass | `quote_requests` owns the reference columns, the policy tables, the history projection, the routes, the Commands, the zone panels, the bundle keys and the tests. `price_lists` owns pricing and publishes it as a port; `carts` changes only what it sends through a port it already resolves. No module imports another's internals; every new edge is a `lazyPort` with a contract type (research R2, R9). |
| **II. API-first** | Pass | Every new shape — history entry, negotiation DTOs, item additions, `BuyerLinePricePort`, `CreateForCustomerOptions`, the error code — is written in `packages/contracts/` first; each phase's first task is the contract and its test. All changes additive. |
| **III. TDD (NN)** | Pass | Each phase in `tasks.md` lists failing tests before implementation; § *Requirement → test* maps every FR. |
| **IV. YAGNI, minimal dependencies** | Pass | No new dependency in the stack; `@fastify/rate-limit` (already a `packages/platform` dependency) gains a peer declaration on `mod-quote-requests`, justified in Complexity Tracking. No cache, queue, event or backfill. The packaging "× units per package" clause, an `original_desired_unit_price` column and a revision validity column were each considered and not built. |
| **V. TypeScript everywhere** | Pass | Zod at every HTTP boundary; the history projection and diff are pure typed functions. |
| **VI. Naming (NN)** | Pass | Tables and columns snake_case plural (`quote_request_org_policies`), routes kebab-case (`/quote-price-negotiation`), JSON camelCase, action codes dot-namespaced. `check:naming` in the final phase. |
| **VII. SEO, performance** | Pass | The storefront draft page stays a server component handing a prop to the client view; it is `noindex` already. One extra authenticated fetch per draft page load. |
| **VIII. English (NN)** | Pass | Code, comments, specs and `docs/` English; Polish only in bundles, the inline storefront dictionary and the Polish docs tree. |
| **IX. UI reuse** | Pass | Panels follow `carts`' `CartApprovalPolicyPanel` (admin-kit `Card`, `Checkbox`/`Select`, `Alert`); History uses the existing `Section` and list markup; no new primitive. |
| **X. Queue consumers** | N/A | Nothing asynchronous added. |
| **XI. Tenant isolation (NN)** | Pass | `QuoteRequestOrgPolicy` is `@OrgScoped`; `QuoteRequestAccountPolicy` is `@TransitivelyScoped('CustomerAccount', 'customerAccountId')`; that classification governs the admin reads (R10). Enforcement reads both rows by exact primary key in a documented `withSystemScope`, after the request was authorised, so a filter can never turn an existing lock into "allowed" (R11, T1). Both Commands check `canSeeOrganization` / `findInOrganization` themselves (R12, T2); the price probe is scoped to a representative's organizations (R2, T8); every out-of-scope read answers like an unknown id (C1). No "no-organization" path: every quote request and every account has one. |
| **XII. Sales-channel scoping (NN)** | Pass | The reference is resolved on the request's recorded `salesChannelId`, never on the admin's request channel; the probe takes the channel explicitly. No `sales_channel_*` bridge is touched. |
| **XIII. Command Bus (NN)** | Pass | The two new writes are Commands run through `commandBus.run` (R12), with the authority check inside the Command and no unit-of-work bypass (`em.upsert` / `nativeUpdate` banned there, T2); every audit row carries `actorAdminUserId` (T16). The module's older hand-audited writes stay (bounded-migration clause); none is added. `check:command-coverage -- --strict` in the final phase. |
| **XIV. Entity-agnostic extensibility** | Pass, with a recorded choice | The lock is not "add a field": it is an enforced, audited, three-state policy. Custom fields were considered and rejected in R9. |
| **XV. Untouched core, overlay** | Pass | Nothing deployment-specific; an overlay can contribute to the same zones or decorate the port. |
| **XVI. Command palette** | Pass | No new admin surface: the controls live on `/organizations/:id` and `/customers/:id`, already in the palette (FR-029); the quote desk keeps `open-rfq-inbox`. |
| **XVII. Operator-toggleable modules (NN)** | Pass | Every new route sits in `quote_requests`' `ctx.routes`; the zone contributions are filtered by the host when the contributor is off; enforcement lives in the module's services; the stored rows stay and apply again on return. The off-state test is extended (Phase 13). The new `price_lists` dependency points at a non-deactivatable module and creates no dead switch. |

**Verdict: PASS.** No violation requires justification; Complexity Tracking records the choices a
reviewer would otherwise ask about.

## Deviations from the spec, and reinterpretations

Nothing changes the requirements' text. These are technical readings for the orchestrator to
accept or send back. **D1, D2 and D6 are resolved by the spec edits in 12efc10ac** (the spec now
says what the plan does); they stay listed for the record.

| # | Spec text | What the plan does | Why |
| --- | --- | --- | --- |
| **D1** — *resolved by 12efc10ac* | Edge case (before 12efc10ac): "If the line is in packaging units, the reference is per packaging unit (base unit price × units per package)" | Resolves at the line's quantity, in base pieces; no multiplication applies | The spec now states it: a quote line's quantity is always in base pieces, and the reference, proposal and agreed price are per base piece. No owner question remains |
| **D2** — *resolved by 12efc10ac* | FR-031 (before 12efc10ac): "(and `price_lists:read` for price resolution, already required by it)" | Stored at-request references reach any `rfqs:handle` holder through the detail reply; **current** prices (FR-006) and the prefill (FR-007) come through the `price_lists:read`-gated probe, and degrade to "—" without it (and on any other probe error, L2) | FR-031 now says this in as many words: `price_lists:read` is an advisory `requires` (D-173), the at-request price is quote data |
| **D3** | FR-003 "the current agreed unit price" per line on Overview | Shown as today's Agreed column, beside the new Reference / Proposed / Difference columns | Already rendered |
| **D4** | Edge case: admin list "already follows the same every-line rule" | Unchanged code — but because `modify` now carries the proposal, the admin list's customer-price total no longer turns `null` at the first revision | R4 consequence, not a rule change |
| **D5** | FR-020 labels "allowed / not allowed" | Wire values `inherit` / `allowed` / `not_allowed` for the override; booleans for the organization and the effective value | Codes on the wire, words in the bundles (`module-i18n.md`) |
| **D6** — *resolved by 12efc10ac* | FR-021 "MUST NOT send stored proposals" | `RfqDraftView` omits `desiredUnitPrice` when `priceProposalsAllowed === false`; the client draft keeps the typed values in `localStorage` untouched | Clearing them would lose data if the override is lifted; nothing is sent either way |

## Inferred, to be proven by the first test of the phase

Read from source, not run. Each has a fallback that changes a file, not the design.

| # | Assumption | Proved by | If refuted |
| --- | --- | --- | --- |
| I1 | `@TransitivelyScoped('CustomerAccount', 'customerAccountId')` resolves a parent owned by another module at boot when that module is a binding dependency, and filters a buyer's `single-org` context to accounts of their organization | Phase 3 `[PG]` integration test (T011) reading a colleague's override under an organization-administrator context and a stranger's under another organization | `@GlobalEntity()` with every query keyed by `customerAccountId` and authorised by the route (R10) |
| I2 | A Command creating or assigning (find-then-create, never upsert — T2) a `@TransitivelyScoped` / `@OrgScoped` row runs under a sales representative's `allowed-set` context without the org write guard refusing it | Phase 10b `[PG]` route test as a scoped sales representative with `customers:manage` (T064) | Run the Command's write inside `withSystemScope` **after the Command's own authority check** (R12), with the reason string naming the check; the audit row still records `actorAdminUserId` (T16) |
| I3 | `check:admin-zones` accepts a contribution whose `requiredPermission` (`customers:read`) is the read gate while the write route needs `customers:manage` | Phase 11 run of `check:admin-zones` (T077) | **Pre-authorised fallback (coordinator decision D-3J) — applied without a further question**: declare `customers:manage` (as `carts` does), drop the disabled state, record "refuted — fallback applied (D-3J)" here. Consequence either way, documented in the module page (T086), not an owner question: with `customers:read` a `customers:manage`-only role sees no panel; with the fallback a read-only holder sees none |
| I4 | Fastify ranks `GET /api/v1/quote-requests/price-negotiation` above `GET /api/v1/quote-requests/:id` | Phase 10b route test (T064) | Move the route to `/api/v1/quote-request-settings/price-negotiation` |
| I5 | `quote_requests` can resolve `requireAdminAny` and `commandBus` from the container (both are registered by the platform for `organizations` and `catalog`) | Phase 10b compose test (`harness-parity.test.ts`) | Gate the `GET` with `requireAdmin('customers:read')` only |

## Requirement → test

| FR | Test (new unless it says "extend") |
| --- | --- |
| FR-001, FR-002 | `quote_requests/src/backend/services/reference-price.test.ts` (owner and channel passed, failure tolerated, `ModuleDisabledError` re-thrown); `backend/test/integration/quote_requests/reference-price.test.ts` `[PG]` (create, resubmit, quick order, draft edit; channel A vs default, US1 #4b; body reference keys ignored, stored = server value, M4); SC-002 three-revision case in `history.test.ts` |
| FR-003 – FR-005 | `admin/test/modules/quote_requests/RfqDetail.reference.test.tsx` (columns, signs, 2 decimals, "—" cases, currency mismatch, zero reference) |
| FR-006, FR-007 | same file: probe called with `customerAccountId` + `salesChannelId`, "current price" label, prefill not from the storefront probe; extend `backend/test/contract/price_lists/admin-resolved-price.test.ts` `[PG]` |
| FR-008, FR-023 | `backend/test/integration/quote_requests/cart-conversion-reference.test.ts` `[PG]`; extend `carts` unit `cross-module-ports.unit.test.ts` for the call shape |
| FR-009 | `quote_requests/src/backend/services/summarize.test.ts`; `storefront/test/rfq/rfq-list-total.test.tsx`; extend `backend/test/integration/crm/` with a cart-converted request valued 0 `[PG]` |
| FR-010, FR-011, FR-014, FR-017, FR-018 | `quote_requests/src/backend/services/history/history-projection.test.ts`; `admin/test/modules/quote_requests/RfqDetail.history.test.tsx` (every kind and change kind mapped in en and pl, no raw identifier) |
| FR-012, FR-013, FR-015, FR-016, FR-036 | `quote_requests/src/backend/services/history/history-diff.test.ts` (variants, packaging, legacy snapshots, empty diff); extend `backend/test/integration/quote_requests/history.test.ts` `[PG]` (US2 #4a customer entry, US1 #9/#10 end-to-end, M6) |
| FR-019 | contract test: customer `GET /api/v1/quote-requests/:id` and the list carry no `referencePrice`, `customerProposedUnitPrice` or `actorAdminUserId` — not on items, `events[]`, `events[].payload`, nor notification / e-mail payloads (T7); `/history` refuses a customer, and a rep outside the organization gets the unknown-id 404 (C1) `[PG]` |
| FR-020, FR-026, FR-027 | `backend/test/integration/quote_requests/negotiation-policy-routes.test.ts` `[PG]` (gates, three states, effective + source, audit row with old → new; scoped rep writing a foreign org/customer refused, no row, no audit — T2); `negotiation-policy-commands.test.ts`; `admin/test/modules/quote_requests/negotiation-zones.test.tsx` |
| FR-021, FR-025 | `storefront/test/rfq/rfq-draft-locked.test.tsx`; `storefront/test/rfq/rfq-submit-action.test.ts` (server action, L7); storefront read route test in the routes integration file |
| FR-022, FR-037 | `quote_requests/src/backend/services/negotiation-policy-service.test.ts`; `backend/test/integration/quote_requests/negotiation-enforcement.test.ts` `[PG]` (US4 #3, #7, #7a–#7d, nothing written; `0.00`; unreadable lock; moved account; tenant-blind reads — T1, T4, M3, M5) |
| FR-024 | same integration file: admin create/modify for a locked customer unchanged |
| FR-028 | extend `backend/test/integration/quote_requests/off-state.test.ts` `[PG]` (routes 503, values kept and back); `admin/test/modules/quote_requests/negotiation-zones.test.tsx` absence case |
| FR-029, FR-031 | `check:action-route-permissions`, permission-inventory contract test (no new code) |
| FR-030 | `check:bundle-pairing`, `registered-bundles-shape.test.ts`, `i18n:hardcoded`, storefront `tsc` over the `Strings` interface |
| FR-033 | `check:module-docs`, `check:docs-translations` |
| FR-034, FR-035 | `quote_requests/src/backend/services/line-carry-over.test.ts`; `backend/test/integration/quote_requests/line-carry-over.test.ts` `[PG]` (US1 #9, #10); `admin/test/modules/quote_requests/RfqDetail.modify-payload.test.tsx` |
| FR-038 | extend `backend/test/integration/quote_requests/negotiation-loop.test.ts` `[PG]` (US1 #11; three-way guard; the admin-modify-before-event race — T3) |

## Project Structure

### Documentation (this feature)

```text
specs/146-quote-request-pricing-history/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R16
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── admin-quote-request-api.md
│   ├── price-negotiation-api.md
│   └── ports.md
└── tasks.md
```

### Source code touched

```text
packages/contracts/src/
├── quote-requests.ts            # item additions, history schemas, negotiation DTOs, CreateForCustomerOptions
├── price-lists.ts               # BuyerLinePricePort
└── errors.ts                    # RFQ_PRICE_PROPOSAL_NOT_ALLOWED

packages/modules/price_lists/src/backend/
├── services/buyer-line-price-service.ts (+ .test.ts)
├── routes.ts                    # probe: salesChannelId, sales-rep organization scope (T8)
└── index.ts                     # providePort('buyerLinePricePort'); lazyPort organizationSalesRepScopePort

packages/modules/carts/src/backend/services/cart-conversion-service.ts

packages/modules/quote_requests/
├── i18n/{en,pl}.json            # errors.*, detail.reference.*, detail.history.*, negotiation.*
├── docs/quote_requests.md       # FR-033
├── src/manifest.ts              # dependencies + price_lists, errorCodes + RFQ_PRICE_PROPOSAL_NOT_ALLOWED
├── src/migrations/<generated>_quote_requests_item_reference_price.ts
├── src/migrations/<generated>_quote_requests_negotiation_policies.ts
├── src/backend/entities/{quote-request-item, quote-request-revision}.entity.ts   # extended
├── src/backend/entities/{quote-request-org-policy, quote-request-account-policy}.entity.ts   # new
├── src/backend/services/reference-price.ts, line-carry-over.ts, negotiation-policy-service.ts (+ tests)
├── src/backend/services/history/{history-diff, history-projection}.ts (+ tests)
├── src/backend/commands/negotiation-policy-commands.ts (+ test)
├── src/backend/services/{rfq-service, rfq-admin-service, rfq-revision-service}.ts
├── package.json                 # @fastify/rate-limit peer + dev (R16)
├── src/backend/{routes.admin, routes.customer, routes.negotiation, plugin, index}.ts
├── src/admin/pages/RfqDetail.tsx
├── src/admin/zones/{OrganizationPriceNegotiation, CustomerPriceNegotiation}.tsx
└── src/admin/index.ts           # two zone contributions

storefront/
├── app/(commerce)/quote-request/{page.tsx, actions.ts}
├── components/rfq/RfqDraftView.tsx
└── lib/api/rfq.ts

docs/i18n/pl/docusaurus-plugin-content-docs/current/modules/quote_requests.md
.changeset/146-*.md
```

**Structure Decision**: extend the three existing modules; no new module. The lock is a quote
policy (research R9), the price resolution is pricing (R2), and the conversion change is one call
site in `carts` (R3).

## Migrations

Both owned by `quote_requests`, both scaffolded — never numbered by hand — with
`pnpm --filter backend run migration:new -- --module quote_requests --name <slug>`, both registered
by `composer:generate`, ordered by the module graph:

1. `item_reference_price` — `alter table quote_request_items add column reference_unit_price
   numeric(12,2) null, add column reference_currency varchar(3) null, add column
   reference_captured_at timestamptz null`, plus the all-or-none check constraint. `down` drops
   them.
2. `negotiation_policies` — creates `quote_request_org_policies` (FK `organizations`) and
   `quote_request_account_policies` (FK `customer_accounts`), both `on delete cascade`, each FK
   commented that the cascade removes **policy rows only** and never reaches a quote request (T14).
   Both targets are already binding `dependencies`; no cross-module DML.

`price_lists` and `carts` ship no migration.

## Risks

| Risk | Mitigation |
| --- | --- |
| A pricing failure at submission blocks quote requests | One narrow catch with `rethrowIfModuleDisabled` first (R2); integration test with a throwing port stub |
| Carry-over pairs the wrong row (two lines of one product) | Pairing by `id` first, then product + variant + packaging + order; unit-tested matrix in `line-carry-over.test.ts` |
| Meaning change of `totalAtCustomerPrice` for other `listForCustomer` consumers (`customers` admin list of a buyer's quotes) | Not a shape change (spec Assumption); changeset names the change; `customers`' own tests run in the final gate |
| Cart-converted lines lose `desiredUnitPrice`: ERP readers of `QuoteRequestLineRecord` (`comarch_xl`) and CRM valuation see `null` | Field is nullable and both handle `null`; CRM 0-until-priced is the clarified rule (FR-009); changeset says so |
| Transitive tenant scoping across modules (I1) | First `[PG]` test of the schema phase; fallback written in R10 |
| `RfqDetail.tsx` is on the `i18n:hardcoded` per-file ratchet | All new strings through `useTranslation('quote_requests')`; the final gate runs the check |
| A stale generated artefact (entities and migrations registries, package manifests, the generated module reference page and its Polish mirror) | `composer:generate`, `manifests:generate`, `pnpm install --lockfile-only` in the phase that adds the entity or changes the manifest; the reference page's Polish cache entry and materialised page refreshed in the same commit (M1); `overlay:check` + `check:docs-translations` in Phases 5 and 10, `manifests:check` + `overlay:check` in the final gate |
| A filtered read makes an existing lock read as absent ("allowed") | Primary-key reads in a documented `withSystemScope` (R11, T1); `[PG]` test with the row hidden from the acting buyer's context (T065a) |
| A customer edit lands on top of an admin revision in the window before the admin's event is appended | Three-way guard re-checked under the row lock (R15, T3); race test T037a |
| The PR is red on a workflow no local phase ran | Phase 14 runs `quality.yml`'s five jobs; Phase 15 runs `pack-gate`, `boot-gate`, `build:docs` and `dco` (G1) |

## Security threat model — disposition

The threat model followed the plan, as the spec's Assumptions require. Every finding is applied;
none is accepted as residual risk. `T10` was not issued to this plan.

| # | Sev. | Threat | Disposition | Where |
| --- | --- | --- | --- | --- |
| T1 | block | A tenant-filtered read of the policy rows answers "no row" for a row that exists → "allowed" | Exact-primary-key reads, owner ids from the row/session, inside `withSystemScope` with a reason string; owner's current organization | R10, R11; data-model §7; T016, T018, T062, T065, T065a, T066 |
| T2 | block | A scoped representative writes another organization's policy through the Commands | Authority check inside both Commands before any write; find-then-create/assign, no `em.upsert` / `nativeUpdate` | R12; price-negotiation §5; T063, T064, T067 |
| T3 | block | A customer edit lands after an admin revision (event appended late) | Guard: awaiting acceptance ∨ admin `modified` event ∨ admin-authored latest revision; re-checked under `underRowLock` | R15; T037, T037a, T040 |
| T4 | warn | `0.00` proposal slips past a truthy check; assert misplaced | `desiredUnitPrice !== undefined`; after validation, before first persist; in `patchDraft` under the lock after the version check | R11; T062, T065, T069 |
| T5 | warn | A locked owner erases a stored proposal by resending the line | Omitted proposal on a paired line is carried | R5.3; data-model §2; T034, T036, T038, T040, T065 |
| T6 | warn | Malformed or client-supplied reference; packaging multiplication | Validate `lineReferencePrices`; body keys ignored (create) / refused (patch); quantity-only resolution; "per base unit" label. Packaging-vs-catalogue validation → owner question | R2, R3; ports §2; T005, T007, T025, T027, T028, T031, T044 |
| T7 | note | Admin-only keys leak to the customer | Customer serializer is an allow-list; contract test over reply, `events[].payload`, notifications, e-mail | T042, T045 |
| T8 | warn → in scope (D-3M) | The probe reveals a foreign organization's prices to a scoped representative | `canSeeOrganization` for non-platform admins; account/org mismatch refused; unknown channel 400 without leak | R2; admin API §4; T020, T022 |
| T9 | warn | History over-exposes admin PII or is unbounded | Explicit actor mapper (names only); `activeOnly` for customers; most recent 100 events + `truncated`; 404 for out-of-org rep | R8; admin API §3; T003, T051, T052a, T054, T056 |
| T11 | warn | Unbounded lines, price batches, edits | `.max(200)` on customer bodies; chunked port calls; per-route rate limit on draft edit; bounded history | R16; T003, T005, T019, T021, T025, T029, T040, T056 |
| T12 | note | Reference basis mismatch | Cart `unitPrice` is the net per-base-piece price | ports §3; T032 |
| T13 | note | Owner vs actor confusion | Documented: the lock binds the owner | price-negotiation §4; T065, T086 |
| T14 | note | Cascade deletes reach quotes | Migration comment: policy rows only | Migrations; T013 |
| T15 | note | Storefront caches one buyer's lock for another | `cache: 'no-store'` with the cookie; no `unstable_cache` | price-negotiation §3; T080 |
| T16 | note | Audit row without the admin on a system-scope path | `actorAdminUserId` asserted on every path | R12; T064 |
| T17 | note | Stored XSS through notes in History | Text nodes only, no `dangerouslySetInnerHTML` | admin API §3 H5; T057, T059 |

## Complexity Tracking

No constitution violation. Recorded so a reviewer does not have to ask:

| Choice | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| New port `buyerLinePricePort` | One definition of "price this buyer pays on this channel" for the stored and the current reference | Assembling `LinePricePort` + three ports inside `quote_requests` is a second implementation of the probe's rule (R2) |
| Two policy tables in `quote_requests` | Ownership, off-state and auditing in one module | Columns on `organizations` / `customer_accounts` need foreign migrations and write ports for a quote concept (R9) |
| History as a separate read endpoint | Pairing, diff and names are logic with tests; customer reply untouched | Extending `events` widens a schema shared with the customer (FR-019) |
| Optional port argument for cart references | The cart snapshot is the reference and the HTTP body must not carry one | A schema field is client-writable (R3) |
| `@fastify/rate-limit` declared as a peer + dev dependency of `mod-quote-requests` | Per-route rate limit on the customer draft-edit route once FR-038 lifts the one-edit limit (R16, T11); the declaration is what makes `config: { rateLimit }` type-check inside a package | **Not a new runtime dependency**: the plugin is already a dependency of `packages/platform` and registered globally by its HTTP server; `product_feeds` and `settings` declare it the same way. A per-request edit counter needs a new error code and a refusal the spec does not describe |
| **New runtime dependency** | — | **None.** |

## Hand-off summary for `endora-commerce-dev`

- Work the phases of [tasks.md](./tasks.md) in order; each is sized for one builder spawn (≤ 10
  tasks) and ends with its own **Verification** line:

  | Phase | Scope | Tasks |
  | --- | --- | --- |
  | 1 | Setup, baseline | T001–T002 |
  | 2 | Contracts | T003–T010 |
  | 3 | Schema, entities | T011–T018 |
  | 4 | US1 `price_lists` buyer price, scoped probe | T019–T024 |
  | 5 | US1 capture, cart conversion, list totals | T025–T033 |
  | 6 | US1 carry-over, three-way draft guard | T034–T037, T037a, T038–T041 |
  | 7 | US1 admin detail | T042–T046, T046a, T047–T049 |
  | 8 | US2/US3 history projection | T050–T052, T052a, T053–T056 |
  | 9 | US2/US3 History tab | T057–T061 |
  | 10 | US4 lock service, enforcement | T062, T065, T065a, T066, T069–T071 |
  | 10b | US4 Commands, routes | T063, T064, T067, T068, T071a |
  | 11 | US4 admin zone panels | T072–T077 |
  | 12 | US4/US1 storefront | T078, T078a, T079–T084 |
  | 13 | Off-state, docs, changesets, defect log | T085–T089, T089a, T090 |
  | 14 | `quality.yml` gate (5 jobs) | T091–T099 |
  | 15 | Other PR workflows: `pack-gate`, `boot-gate`, `build:docs`, `dco` | T099a–T099d |

  Phases 4–7 (US1), 8–9 (US2/US3) and 10–12 (US4) are independent after Phase 3 but share
  `rfq-service.ts` / `rfq-admin-service.ts`: never two in parallel on one checkout.
- **Every commit with `git commit -s`** (the `dco` job); no AI trailer.
- Contracts first in every phase (Principle II); a failing test before every implementation task
  (Principle III).
- Never place a module test beside `src/manifest.ts` (`manifests:check` refuses it): module tests go
  under `src/backend/**`, admin tests under `admin/test/modules/quote_requests/`, storefront tests
  under `storefront/test/rfq/`.
- Paths handed to `pnpm --filter backend …` resolve against `backend/`: write `../packages/...` when
  pointing a backend script at a package file. Service-free backend unit tests run with
  `--config vitest.unit.config.ts`.
- After adding an entity, a migration or a manifest change: `composer:generate`, `manifests:generate`,
  `pnpm install --lockfile-only`, and commit all artefacts — including the generated module
  reference page and its Polish cache entry and materialised mirror when they move (M1).
- Never tighten a request schema's strictness (M4); never `em.upsert` / `nativeUpdate` the policy
  entities (T2).
- I3's fallback is pre-authorised (D-3J): apply it if `check:admin-zones` refuses, and record it.
- Changesets (`minor`, never `major`): `@endora-commerce/contracts`, `@endora-commerce/mod-quote-requests`,
  `@endora-commerce/mod-price-lists`, `@endora-commerce/mod-carts`, each written for the consumer
  (T089 lists the consequences each must name).
- **Owner / coordinator questions — not resolved in code**:
  1. **[NEEDS CLARIFICATION — answer pending]** ERP / connector readers of cart-converted lines
     (`QuoteRequestLineRecord.desiredUnitPrice` becomes `null`): option (b) adds optional
     `referenceUnitPrice` + `referenceCurrency` to the record. T005 (c) is the single sub-step that
     implements it; do not start it before the answer.
  2. Should a customer-supplied packaging unit (`packagingUnitName`, `packagingUnitBaseQuantity` on
     create / draft edit) be validated against the catalogue's packaging units (T6)? Not decided;
     today it is stored as sent and never affects the price query.
  3. The new `set*` bodies are declared `.strict()`; confirm the "never make request schemas
     strict" rule (M4) is about the existing customer-facing schemas and not these new admin
     bodies.
  4. `specs/deferred-defects.md` (T089a, D-3K) is not in this checkout (withheld pre-migration
     record): where should the `lineCurrency = 'PLN'` entry be logged?
