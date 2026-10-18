# Implementation Plan: Sales-channel access for visitors, customers and their baskets

**Branch**: `feat/154-sales-channel-access` | **Date**: 2026-10-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/154-sales-channel-access/spec.md` — owner decisions D1–D7
final (D6 revised by the owner on 2026-10-18: new Organizations get the channel they were created for).

## Summary

The kernel channel resolver gains an **access step**: after a request's channel is resolved, an
anonymous request is accepted only on a channel flagged *open to anonymous visitors*, a customer
request only on a channel assigned to the customer's Organization; administrators and API keys are
unaffected. Routes that must stay reachable (sign-in, registration, channel identity, provider and
e-mail callbacks) declare `config.salesChannelAccess: 'open'`, held by a two-way ledger test. With
evidence and rejected alternatives in [research.md](./research.md):

- **Data** (R-5, R-7): one column `sales_channels.anonymous_access` (default `true`); the existing
  `sales_channel_organizations` bridge becomes the assignment, backfilled with *default channel +
  channels with orders*; baskets without a channel recorded on the default. No new table.
- **Enforcement point** (R-2, R-3): `sales-channel-resolver.middleware.ts`, one rule, two 403 codes
  `SALES_CHANNEL_SIGN_IN_REQUIRED` / `SALES_CHANNEL_NOT_PERMITTED`; the same rule is called at
  customer sign-in (password, second factor, federated) so a refused sign-in creates no session.
- **Cache** (R-6): per-Organization permitted set, LRU 30 s over Redis, dropped as part of the
  membership write, fanned out on `b2b:sales-channel-access:changed`; `anonymousAccess` rides on the
  cached channel.
- **New Organizations** (R-8, D6): storefront registrations get exactly the registering store's
  channel (business on any store, individual only on open stores); admin create chooses channels
  (default pre-selected); all other paths get the default; invitations change nothing — always inside
  the creating transaction.
- **Admin** (R-10): channel-form switch; Organization *Sales channels* panel (`customers:manage`); new
  *New organization* screen + palette action; `sales_channels`' generic Organization zone removed.
- **Storefront** (R-11): the transport always sends the active channel; closed store → sign-in;
  not permitted → no-access screen; refused sign-in → message.
- **Basket** (R-13): created and priced on the request channel; one per customer per channel;
  placement refuses another channel's basket (422 `ORDER_SALES_CHANNEL_MISMATCH`). Merges after
  PR #345 and makes the channel an input of its pricing rule.

## Technical Context

**Language/Version**: TypeScript 5.x `strict`, Node.js ≥ 22.17, ESM
**Primary Dependencies**: Fastify, MikroORM (PostgreSQL), Zod, ioredis (backend); React 19 + Vite through `@endora-commerce/admin-kit` (admin); Next.js 15 App Router middleware, server components and server actions (storefront) — **no new runtime dependency**
**Storage**: PostgreSQL — one column `sales_channels.anonymous_access` (platform migration); data backfills of `sales_channel_organizations` (owned by `organizations`) and `carts.sales_channel_id` (owned by `carts`); Redis — one cache prefix and one pub/sub channel
**Testing**: Vitest — co-located `*.test.ts` in `packages/platform/src/kernel/sales-channels/`, `packages/modules/{carts,customer_accounts,organizations,mfa}/src/**`; `backend/test/contract/{sales_channels,organizations,customers,carts,orders,mfa}/`; `backend/test/integration/{sales_channels,carts,orders,organizations}/`; `admin/test/modules/{organizations,sales_channels}/`; `storefront/test/{lib,auth,components,seo}/`
**Target Platform**: Linux server; admin SPA and storefront in evergreen browsers
**Project Type**: web application — monorepo (`backend/`, `admin/`, `storefront/`, `packages/`)
**Performance Goals**: access step adds 0 DB reads for anonymous requests and ≤ 1 cached lookup (LRU hit p99 < 0.1 ms) for customer requests; assignment change visible on the writer at once, everywhere ≤ 30 s
**Constraints**: single-channel shops behave identically after migration; no session on a refused sign-in; no Organization without a channel; admin and API-key actors unchanged
**Scale/Scope**: platform (1 middleware step, 1 policy, 1 cache, 1 port, 1 route-option type, 1 migration); `sales_channels` (2 error codes, 1 route, form switch, zone removed); `organizations` (3 admin routes, 1 Command, 1 panel + 1 page, 1 palette action, 1 migration, registration + provisioning binding, route options); `customer_accounts`, `mfa`, `auth`, `_i18n`, `dictionaries`, `seo`, `product_feeds`, `newsletter` (route options / sign-in checks); `carts` + `orders` (attribution, 1 error code, 1 migration); storefront (transport, middleware, 2 screens); ~140 backend test files reviewed for fixtures

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design — same verdict.*

| Principle | Verdict | How the design meets it |
| --- | --- | --- |
| **I. Modular architecture (NN)** | Pass | The rule is kernel (the resolver it extends is kernel); it reads the bridge through the kernel's bridge registry, naming no module. `organizations` owns the assignment UI/API and its backfill; `carts`/`orders` own attribution; consumers reach the rule through the published `SalesChannelAccessPort`. The one cross-module table read (M2 reading `orders`) is ledgered and guarded (R-7). |
| **II. API-first** | Pass | Zod first in `contracts/src/sales-channels.ts` (`anonymousAccess`, access response), `organizations.ts` (channels, create body), `carts.ts` (`CartCustomerContext.salesChannelId`), `errors.ts` (3 codes). Additive; OpenAPI baseline re-recorded. |
| **III. TDD (NN)** | Pass | [tasks.md](./tasks.md) puts each failing test first; § *Requirement → test* maps FRs. |
| **IV. YAGNI** | Pass | No dependency, no table, no Setting, no kill switch, per-customer record left unused, no repricing on mismatch. |
| **V. TypeScript** | Pass | Fastify `FastifyContextConfig` augmentation typed; ports typed on contracts. |
| **VI. Naming (NN)** | Pass | `anonymous_access`, `salesChannelAccess`, `SALES_CHANNEL_NOT_PERMITTED`, `organization.create`, `/organizations/:id/sales-channels`, `b2b:sales-channel-access:changed`. |
| **VII. SEO, performance** | Pass | Storefront stays SSR; identity read cached; access read only for signed-in viewers on refusal; closed stores serve an empty sitemap; perf budget above. |
| **VIII. English (NN)** | Pass | Polish only in bundles, the storefront catalogue and the Polish docs. |
| **IX. UI reuse** | Pass | admin-kit `Switch`, the channel multi-select idiom of delivery methods, existing page/panel idioms; storefront reuses its auth layout. |
| **X. Queue consumers** | N/A | Nothing repeatable; cache fan-out is pub/sub like module state. |
| **XI. Tenancy (NN)** | Pass | Organization id is session-derived; a customer without one is refused (no "no-organization" path); the bridge is platform-global membership data read by the kernel. |
| **XII. Channel scoping (NN)** | Pass | Builds on the unified resolver; fail-closed (unknown/unassigned → refuse; fallback channel subject to the same rule); bridge read/written only through the membership service (creation binds through it with the caller's `em`); basket evaluation carries its channel (R-13); cross-channel tests in every story. |
| **XIII. Command Bus (NN)** | Pass (pre-existing pattern stated) | `organization.create` is a Command; the channel flag uses the audited identity path; bridge rows are written by the kernel membership service, the single audited writer of bridges (one audit row per membership, admin actor server-derived) — the pattern delivery and payment methods use. Not wrapped in a second Command, which would audit one change twice (R-10). |
| **XIV. Entity-agnostic** | N/A | No "add a field" requirement. |
| **XV. Overlay** | Pass | Overlay routes declare `salesChannelAccess: 'open'` on the same terms and the ledger sees them. |
| **XVI. Palette** | Pass | New screen `/organizations/new` → `new-organization` action; the switch and the panel sit on screens already in the palette. |
| **XVII. Toggleable (NN)** | Pass | Every changed module is `nonDeactivatable` (R-14); the rule is kernel and never module-gated; `mfa` off → federated routes 503 as today and password sign-in is still checked (test). No new activation control. |

**Verdict**: PASS. No violation needs a Complexity Tracking justification; the three items below are
recorded because they are non-obvious, not because they break a principle.

## Project Structure

### Documentation (this feature)

```text
specs/154-sales-channel-access/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── channel-access-rule.md
│   ├── storefront-api.md
│   ├── admin-api-and-ui.md
│   ├── basket-attribution.md
│   └── storefront-ux.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/contracts/src/{sales-channels,organizations,carts,errors}.ts
packages/platform/src/
├── http/                          # FastifyContextConfig.salesChannelAccess
├── kernel/sales-channels/         # access policy, access cache, middleware step, entity field,
│                                  # cache v3, membership `em` option + cache drop, compose
├── kernel/ports/sales-channel.ts  # SalesChannelAccessPort
├── composition/compose-app.ts     # register salesChannelAccessPort, pub/sub subscriber
└── migrations/<stamp>_core_sales_channels_anonymous_access.ts
packages/modules/
├── sales_channels/    # error codes + i18n, access read route, form switch, zone removed, docs
├── organizations/     # admin channels + create routes, Command, panel, create page, palette action,
│                      # registration + provisioning binding, route options, backfill migration, docs
├── customer_accounts/ # login check, request channel into provisioning
├── mfa/               # federated + verify checks, route options
├── auth/ _i18n/ dictionaries/ seo/ product_feeds/ newsletter/   # route options
├── carts/             # attribution, pricing on the cart channel, merge, placement read, backfill, docs
└── orders/            # mismatch refusal, error code + i18n
backend/test/{contract,integration,perf}/…  backend/test/helpers/channel-access-open-routes.ts
admin/test/modules/{organizations,sales_channels}/
storefront/{middleware.ts,lib/api/*,lib/server-context.ts,app/layout.tsx,app/(auth)/login/*,components/*}
docs/i18n/pl/docusaurus-plugin-content-docs/current/modules/…
```

**Structure Decision**: extend the kernel resolver and the owning modules; no new module. A separate
"channel access" module was rejected: the rule is a property of channel resolution (kernel), the
assignment is `organizations`' aggregate, and such a module would own neither table.

## Merge order and PR split

1. **PR #345** (`fix/cart-line-repricing`) merges first — dependency of PR D.
2. **PR A — platform, data, rule** (US1, US3 backend): column, caches, policy, middleware step, port,
   route options + ledger, error codes, migrations M1/M2, test-fixture binding sweep. Neutral for a
   single-channel shop.
3. **PR B — sign-in, registration, creation paths** (US2 backend, US4 backend).
4. **PR C — admin** (US5, US4 admin create): switch, panel, *New organization*, palette, zone removal.
5. **PR D — basket attribution** (US6) on top of #345 (+ M3).
6. **PR E — storefront and documentation** (D1 transport, UX of US1/US2/US4; docs en + pl).

PR E must not merge before A (it reads `anonymousAccess`), and should merge with or after B.

## Requirement → test

| FR | Test |
| --- | --- |
| FR-001–003 | `admin-crud-lifecycle.contract.test.ts` (+ `anonymousAccess`), reconciler unit, M1 migration test |
| FR-004, 005, 007, 008 | `channel-access.contract.test.ts`, `sales-channel-access-policy.test.ts` |
| FR-006 | `channel-access-open-routes.test.ts` |
| FR-009–011 | `login-channel-access.contract.test.ts`, `federated-channel-access.contract.test.ts`, MFA verify case |
| FR-012 | `storefront-access-read.contract.test.ts` |
| FR-013–015 | `admin-sales-channels.contract.test.ts`, membership-service unit (cache drop, `em`) |
| FR-016, 017, 020 | `registration-channel.contract.test.ts`, `register-channel.contract.test.ts`, invitation case |
| FR-018 | `admin-organization-create.contract.test.ts`, `organization-create.test.tsx` |
| FR-019 | provisioning unit, demo seed test |
| FR-021 | `backend/test/integration/organizations/channel-access-backfill.test.ts` |
| FR-022–025 | admin tests, permission inventory, bundles shape, `check:action-route-permissions` |
| FR-026 | `channel-header-coverage.test.ts`, `active-channel.test.ts` |
| FR-027–029 | `middleware-effect.test.ts`, `login-channel-refusal.test.tsx`, `ChannelAccessDenied.test.tsx` |
| FR-030–034 | `cart-channel-attribution.test.ts`, `place-order-cart-channel.test.ts`, `cart-channel.contract.test.ts`, M3 test |
| FR-035–036 | `sales-channel-access-cache.test.ts`, `channel-access-invalidation.test.ts`, `backend/test/perf/sales_channels/access-step.bench.ts` |
| FR-037 | `check:module-docs`, docs build |

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| R1 ledger entry for M2 reading `orders` | D4 requires order history; only `organizations` may write its bridge | an `orders` migration would write another module's table (R2); a CLI step can be forgotten |
| New kernel cache + pub/sub channel | FR-035/036 on every customer request | uncached: one bridge query per request; event-only: in-process and after commit |
| Admin create-Organization endpoint and screen (none existed) | owner decision D6(a) | assigning channels "on create" needs a create path |
| New runtime dependency | none | — |
