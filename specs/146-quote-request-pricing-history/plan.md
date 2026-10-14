# Implementation Plan: quote request reference price, readable history, per-customer negotiation lock

**Branch**: `feat/146-quote-request-pricing-history` | **Date**: 2026-10-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/146-quote-request-pricing-history/spec.md` (status
"Clarified — ready for plan"; issues #279, #283, #284). Every clarification is binding.

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

No new runtime dependency. Two additive `quote_requests` migrations.

## Technical Context

**Language/Version**: TypeScript 5.x `strict`, Node.js ≥ 22.17, ESM
**Primary Dependencies**: Fastify, MikroORM (PostgreSQL), Zod (backend); React 19 + Vite + admin-kit zones (admin); Next.js 15 App Router server components and server actions (storefront) — **no new runtime dependency**
**Storage**: PostgreSQL — three nullable columns on `quote_request_items` and two new tables (`quote_request_org_policies`, `quote_request_account_policies`), all owned by `quote_requests`, in two migrations
**Testing**: Vitest — co-located unit tests in `packages/modules/{quote_requests,price_lists}/src/backend/**` and `packages/contracts/src`, `backend/test/{contract,integration}/quote_requests` and `price_lists` against Postgres, `admin/test/modules/quote_requests`, `storefront/test/rfq`
**Target Platform**: Linux server; backend, admin SPA and storefront deployed separately
**Project Type**: web application — monorepo with `backend/`, `admin/`, `storefront/`, `packages/`
**Performance Goals**: submission adds one batch port call per request (not per line); admin detail adds one revision read; history is loaded only when the tab opens, with one name lookup per actor kind
**Constraints**: no reference supplied by a client is trusted (FR-001); the lock is decided in the writing request and never fails open (spec edge case); the customer reply's actor exposure does not widen (FR-019); a switched-off module contributes nothing and keeps its values (FR-028)
**Scale/Scope**: 3 modules changed (`quote_requests`, `price_lists`, `carts`) plus `contracts`, admin and storefront; 6 new routes, 1 new port, 2 Commands, 2 zone contributions, 2 migrations, 1 error code; 14 task phases

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design — same verdict.*

| Principle | Verdict | How the design meets it |
| --- | --- | --- |
| **I. Modular architecture (NN)** | Pass | `quote_requests` owns the reference columns, the policy tables, the history projection, the routes, the Commands, the zone panels, the bundle keys and the tests. `price_lists` owns pricing and publishes it as a port; `carts` changes only what it sends through a port it already resolves. No module imports another's internals; every new edge is a `lazyPort` with a contract type (research R2, R9). |
| **II. API-first** | Pass | Every new shape — history entry, negotiation DTOs, item additions, `BuyerLinePricePort`, `CreateForCustomerOptions`, the error code — is written in `packages/contracts/` first; each phase's first task is the contract and its test. All changes additive. |
| **III. TDD (NN)** | Pass | Each phase in `tasks.md` lists failing tests before implementation; § *Requirement → test* maps every FR. |
| **IV. YAGNI, minimal dependencies** | Pass | No dependency. No cache, queue, event or backfill. The packaging "× units per package" clause, an `original_desired_unit_price` column and a revision validity column were each considered and not built. |
| **V. TypeScript everywhere** | Pass | Zod at every HTTP boundary; the history projection and diff are pure typed functions. |
| **VI. Naming (NN)** | Pass | Tables and columns snake_case plural (`quote_request_org_policies`), routes kebab-case (`/quote-price-negotiation`), JSON camelCase, action codes dot-namespaced. `check:naming` in the final phase. |
| **VII. SEO, performance** | Pass | The storefront draft page stays a server component handing a prop to the client view; it is `noindex` already. One extra authenticated fetch per draft page load. |
| **VIII. English (NN)** | Pass | Code, comments, specs and `docs/` English; Polish only in bundles, the inline storefront dictionary and the Polish docs tree. |
| **IX. UI reuse** | Pass | Panels follow `carts`' `CartApprovalPolicyPanel` (admin-kit `Card`, `Checkbox`/`Select`, `Alert`); History uses the existing `Section` and list markup; no new primitive. |
| **X. Queue consumers** | N/A | Nothing asynchronous added. |
| **XI. Tenant isolation (NN)** | Pass | `QuoteRequestOrgPolicy` is `@OrgScoped`; `QuoteRequestAccountPolicy` is `@TransitivelyScoped('CustomerAccount', 'customerAccountId')` so an organization administrator acting on a colleague's draft reads the owner's override within the organization and a sales representative's allowed set reaches the accounts of their organizations (R10). No "no-organization" path: every quote request and every account has one. |
| **XII. Sales-channel scoping (NN)** | Pass | The reference is resolved on the request's recorded `salesChannelId`, never on the admin's request channel; the probe takes the channel explicitly. No `sales_channel_*` bridge is touched. |
| **XIII. Command Bus (NN)** | Pass | The two new writes are Commands run through `commandBus.run` (R12). The module's older hand-audited writes stay (bounded-migration clause); none is added. `check:command-coverage -- --strict` in the final phase. |
| **XIV. Entity-agnostic extensibility** | Pass, with a recorded choice | The lock is not "add a field": it is an enforced, audited, three-state policy. Custom fields were considered and rejected in R9. |
| **XV. Untouched core, overlay** | Pass | Nothing deployment-specific; an overlay can contribute to the same zones or decorate the port. |
| **XVI. Command palette** | Pass | No new admin surface: the controls live on `/organizations/:id` and `/customers/:id`, already in the palette (FR-029); the quote desk keeps `open-rfq-inbox`. |
| **XVII. Operator-toggleable modules (NN)** | Pass | Every new route sits in `quote_requests`' `ctx.routes`; the zone contributions are filtered by the host when the contributor is off; enforcement lives in the module's services; the stored rows stay and apply again on return. The off-state test is extended (Phase 13). The new `price_lists` dependency points at a non-deactivatable module and creates no dead switch. |

**Verdict: PASS.** No violation requires justification; Complexity Tracking records the choices a
reviewer would otherwise ask about.

## Deviations from the spec, and reinterpretations

Nothing changes the requirements' text. These are technical readings for the orchestrator to
accept or send back.

| # | Spec text | What the plan does | Why |
| --- | --- | --- | --- |
| **D1** | Edge case: "If the line is in packaging units, the reference is per packaging unit (base unit price × units per package)" | Resolves at the line's quantity, per the unit that quantity is in; every path that carries a packaging unit (cart conversion) stores the quantity **in base pieces** and the cart price per base piece, so no multiplication applies | Measured in `cart-service.ts` (`effectiveQuantity`) and `rfq-packaging-snapshot.test.ts`. The spec's governing clause ("per the unit the line quantity is expressed in") holds; the parenthesis describes a line shape no path produces. Listed as an ambiguity for the owner |
| **D2** | FR-031 "(and `price_lists:read` for price resolution, already required by it)" | Stored at-request references reach any `rfqs:handle` holder through the detail reply; **current** prices (FR-006) and the prefill (FR-007) come through the `price_lists:read`-gated probe, and degrade to "—" without it | Keeps D-173's permission boundary: price-list prices are `price_lists:read` data, the at-request snapshot is quote data |
| **D3** | FR-003 "the current agreed unit price" per line on Overview | Shown as today's Agreed column, beside the new Reference / Proposed / Difference columns | Already rendered |
| **D4** | Edge case: admin list "already follows the same every-line rule" | Unchanged code — but because `modify` now carries the proposal, the admin list's customer-price total no longer turns `null` at the first revision | R4 consequence, not a rule change |
| **D5** | FR-020 labels "allowed / not allowed" | Wire values `inherit` / `allowed` / `not_allowed` for the override; booleans for the organization and the effective value | Codes on the wire, words in the bundles (`module-i18n.md`) |
| **D6** | FR-021 "MUST NOT send stored proposals" | `RfqDraftView` omits `desiredUnitPrice` when `priceProposalsAllowed === false`; the client draft keeps the typed values in `localStorage` untouched | Clearing them would lose data if the override is lifted; nothing is sent either way |

## Inferred, to be proven by the first test of the phase

Read from source, not run. Each has a fallback that changes a file, not the design.

| # | Assumption | Proved by | If refuted |
| --- | --- | --- | --- |
| I1 | `@TransitivelyScoped('CustomerAccount', 'customerAccountId')` resolves a parent owned by another module at boot when that module is a binding dependency, and filters a buyer's `single-org` context to accounts of their organization | Phase 3 `[PG]` integration test (T011) reading a colleague's override under an organization-administrator context and a stranger's under another organization | `@GlobalEntity()` with every query keyed by `customerAccountId` and authorised by the route (R10) |
| I2 | A Command upserting a `@TransitivelyScoped` / `@OrgScoped` row runs under a sales representative's `allowed-set` context without the org write guard refusing it | Phase 10 `[PG]` route test as a scoped sales representative with `customers:manage` | Run the Command's write inside `withSystemScope` after the route's `canSeeOrganization` check, with the reason string naming the check |
| I3 | `check:admin-zones` accepts a contribution whose `requiredPermission` (`customers:read`) is the read gate while the write route needs `customers:manage` | Phase 11 run of `check:admin-zones` | Declare `customers:manage` (as `carts` does) and accept that read-only holders do not see the panel; record it as a deviation from FR-027's read clause. **Consequence of the chosen gate even when accepted**: a zone declares one code, so a role holding `customers:manage` *without* `customers:read` reaches `/organizations/:id` (gated by either) and sees no panel. Realistic roles hold both; listed as an owner question in the hand-off |
| I4 | Fastify ranks `GET /api/v1/quote-requests/price-negotiation` above `GET /api/v1/quote-requests/:id` | Phase 10 route test | Move the route to `/api/v1/quote-request-settings/price-negotiation` |
| I5 | `quote_requests` can resolve `requireAdminAny` and `commandBus` from the container (both are registered by the platform for `organizations` and `catalog`) | Phase 10 compose test (`harness-parity.test.ts`) | Gate the `GET` with `requireAdmin('customers:read')` only |

## Requirement → test

| FR | Test (new unless it says "extend") |
| --- | --- |
| FR-001, FR-002 | `quote_requests/src/backend/services/reference-price.test.ts` (owner and channel passed, failure tolerated, `ModuleDisabledError` re-thrown); `backend/test/integration/quote_requests/reference-price.test.ts` `[PG]` (create, resubmit, quick order, draft edit; channel A vs default, US1 #4b) |
| FR-003 – FR-005 | `admin/test/modules/quote_requests/RfqDetail.reference.test.tsx` (columns, signs, 2 decimals, "—" cases, currency mismatch, zero reference) |
| FR-006, FR-007 | same file: probe called with `customerAccountId` + `salesChannelId`, "current price" label, prefill not from the storefront probe; extend `backend/test/contract/price_lists/admin-resolved-price.test.ts` `[PG]` |
| FR-008, FR-023 | `backend/test/integration/quote_requests/cart-conversion-reference.test.ts` `[PG]`; extend `carts` unit `cross-module-ports.unit.test.ts` for the call shape |
| FR-009 | `quote_requests/src/backend/services/summarize.test.ts`; `storefront/test/rfq/rfq-list-total.test.tsx`; extend `backend/test/integration/crm/` with a cart-converted request valued 0 `[PG]` |
| FR-010, FR-011, FR-014, FR-017, FR-018 | `quote_requests/src/backend/services/history/history-projection.test.ts`; `admin/test/modules/quote_requests/RfqDetail.history.test.tsx` (every kind and change kind mapped in en and pl, no raw identifier) |
| FR-012, FR-013, FR-015, FR-016, FR-036 | `quote_requests/src/backend/services/history/history-diff.test.ts` (variants, packaging, legacy snapshots, empty diff); extend `backend/test/integration/quote_requests/history.test.ts` `[PG]` |
| FR-019 | contract test: customer `GET /api/v1/quote-requests/:id` carries no `referencePrice`, no `customerProposedUnitPrice`, no `actorAdminUserId`; `/history` refuses a customer and a rep outside the organization `[PG]` |
| FR-020, FR-026, FR-027 | `backend/test/integration/quote_requests/negotiation-policy-routes.test.ts` `[PG]` (gates, three states, effective + source, audit row with old → new); `admin/test/modules/quote_requests/negotiation-zones.test.tsx` |
| FR-021, FR-025 | `storefront/test/rfq/rfq-draft-locked.test.tsx`; storefront read route test in the same integration file |
| FR-022, FR-037 | `quote_requests/src/backend/services/negotiation-policy-service.test.ts`; `backend/test/integration/quote_requests/negotiation-enforcement.test.ts` `[PG]` (US4 #3, #7, #7a–#7d, nothing written) |
| FR-024 | same integration file: admin create/modify for a locked customer unchanged |
| FR-028 | extend `backend/test/integration/quote_requests/off-state.test.ts` `[PG]` (routes 503, values kept and back); `admin/test/modules/quote_requests/negotiation-zones.test.tsx` absence case |
| FR-029, FR-031 | `check:action-route-permissions`, permission-inventory contract test (no new code) |
| FR-030 | `check:bundle-pairing`, `registered-bundles-shape.test.ts`, `i18n:hardcoded`, storefront `tsc` over the `Strings` interface |
| FR-033 | `check:module-docs`, `check:docs-translations` |
| FR-034, FR-035 | `quote_requests/src/backend/services/line-carry-over.test.ts`; `backend/test/integration/quote_requests/line-carry-over.test.ts` `[PG]` (US1 #9, #10); `admin/test/modules/quote_requests/RfqDetail.modify-payload.test.tsx` |
| FR-038 | extend `backend/test/integration/quote_requests/negotiation-loop.test.ts` `[PG]` (US1 #11) |

## Project Structure

### Documentation (this feature)

```text
specs/146-quote-request-pricing-history/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R15
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
├── routes.ts                    # probe: salesChannelId
└── index.ts                     # providePort('buyerLinePricePort')

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
   `quote_request_account_policies` (FK `customer_accounts`), both `on delete cascade`. Both
   targets are already binding `dependencies`; no cross-module DML.

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
| A stale generated artefact (entities and migrations registries, package manifests) | `composer:generate`, `manifests:generate`, `pnpm install --lockfile-only` in the phase that adds the entity, and `manifests:check` + `overlay:check` in the final gate |

## Complexity Tracking

No constitution violation. Recorded so a reviewer does not have to ask:

| Choice | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| New port `buyerLinePricePort` | One definition of "price this buyer pays on this channel" for the stored and the current reference | Assembling `LinePricePort` + three ports inside `quote_requests` is a second implementation of the probe's rule (R2) |
| Two policy tables in `quote_requests` | Ownership, off-state and auditing in one module | Columns on `organizations` / `customer_accounts` need foreign migrations and write ports for a quote concept (R9) |
| History as a separate read endpoint | Pairing, diff and names are logic with tests; customer reply untouched | Extending `events` widens a schema shared with the customer (FR-019) |
| Optional port argument for cart references | The cart snapshot is the reference and the HTTP body must not carry one | A schema field is client-writable (R3) |
| **New runtime dependency** | — | **None.** |

## Hand-off summary for `endora-commerce-dev`

- Work the phases of [tasks.md](./tasks.md) in order; each is sized for one builder spawn and ends
  with its own **Verification** line. Phases 4–7 (US1), 8–9 (US2/US3) and 10–12 (US4) are
  independent after Phase 3, but share `rfq-service.ts`: do not run two in parallel on one checkout.
- Contracts first in every phase (Principle II); a failing test before every implementation task
  (Principle III).
- Never place a module test beside `src/manifest.ts` (`manifests:check` refuses it): module tests go
  under `src/backend/**`, admin tests under `admin/test/modules/quote_requests/`, storefront tests
  under `storefront/test/rfq/`.
- Paths handed to `pnpm --filter backend …` resolve against `backend/`: write `../packages/...` when
  pointing a backend script at a package file.
- After adding an entity or a migration: `composer:generate`, `manifests:generate`,
  `pnpm install --lockfile-only`, and commit all three artefacts.
- Changesets (`minor`, never `major`): `@endora-commerce/contracts`, `@endora-commerce/mod-quote-requests`,
  `@endora-commerce/mod-price-lists`, `@endora-commerce/mod-carts`, each written for the consumer.
- Owner questions are listed in the hand-off report, not resolved in code: D1 (packaging
  multiplication) and I3's fallback if `check:admin-zones` refuses the read gate.
