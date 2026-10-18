---
description: "Task list for 154 — sales-channel access for visitors, customers and their baskets"
---

# Tasks: Sales-channel access for visitors, customers and their baskets

**Input**: `specs/154-sales-channel-access/` — plan.md, spec.md, research.md, data-model.md,
contracts/ (`channel-access-rule.md`, `storefront-api.md`, `admin-api-and-ui.md`,
`basket-attribution.md`, `storefront-ux.md`), quickstart.md
**Tests**: REQUIRED — Constitution III. Every implementation task follows the failing test it turns
green; a test task names the behaviour it must prove **red** first.

**Organization**: setup, foundational (contracts and kernel pieces every story needs), then one phase
per user story in priority order, then cross-cutting. `[PR-x]` marks the implementation PR of the
plan's *Merge order and PR split*.

## Format: `[ID] [P?] [Story] Description`

Paths: `PF` = `packages/platform/src`, `SC` = `packages/modules/sales_channels`, `OR` =
`packages/modules/organizations`, `CA` = `packages/modules/customer_accounts`, `CR` =
`packages/modules/carts`, `OD` = `packages/modules/orders`, `CT` = `packages/contracts/src`,
`BT` = `backend/test`, `SF` = `storefront`.

---

## Phase 1: Setup

- [X] T001 [PR-A] Worktree from `origin/master` (`scripts/setup-worktree.sh`), `pnpm run build:packages`, `pnpm -r run typecheck`; record the baselines of `pnpm --filter backend run test:unit:fast`, `pnpm --filter '!backend' run test` and of `BT/contract/sales_channels/` (green before any change) — done from `origin/feat/154-sales-channel-access` (spec included) and rebased on `origin/master` after #345 merged; no separate pre-change baseline run was recorded, master CI is the baseline
- [X] T002 [PR-A] Inventory for the MR description (research R-16): `grep -rli "x-sales-channel" BT | sort` (140 files), `grep -rln "create(Organization\|insert into \"\?organizations\"\?" BT packages/modules/*/src` (≈126 files), and the non-admin `/api/v1/*` routes of the composed test server (dump from an `onRoute` collector) — attach the three lists — counts in the PR A description (144 test files send `X-Sales-Channel`; 103 files create Organizations directly; 212 non-admin routes probed by the open-route test)
- [X] T003 [PR-A] Confirm PR #345 status; if merged, rebase this branch; if not, note in PR D that it waits for it (research R-13 *Merge order*) — #345 merged 2026-10-18; PR A is rebased on `origin/master`

---

## Phase 2: Foundational (blocking)

### Contracts

- [X] T004 [P] [PR-A] Extend `CT/sales-channels.test.ts` (or create) — red: `anonymousAccess` required on `SalesChannelSummarySchema`/detail, optional with default `true` on create, optional on update; `PublicSalesChannelSchema.anonymousAccess`; `SalesChannelAccessResponseSchema` (contracts/storefront-api.md §2)
- [X] T005 [PR-A] Implement in `CT/sales-channels.ts`; add `SALES_CHANNEL_SIGN_IN_REQUIRED`, `SALES_CHANNEL_NOT_PERMITTED`, `ORDER_SALES_CHANNEL_MISMATCH` to `CT/errors.ts` with doc comments — T004 green; `pnpm run build:packages`
- [X] T006 [P] [PR-A] Extend `CT/carts.ts` `CartCustomerContext` with `salesChannelId: string` (type only; producers follow in US6) — `pnpm -r run typecheck` lists every producer; record them in the PR D checklist and keep the field optional until PR D (`salesChannelId?: string`) so PR A compiles

### Kernel: flag, cache shape, route option

- [X] T007 [PR-A] Scaffold `pnpm --filter backend run migration:new -- --module core --name sales-channels-anonymous-access` (M1, data-model §1) and add `anonymousAccess` to `PF/kernel/sales-channels/sales-channel.entity.ts` (+ `OptionalProps`); `composer:generate`; commit the registry
- [X] T008 [P] [PR-A] Extend `PF/kernel/sales-channels/sales-channels-cache.test.ts` — red: `anonymousAccess` in `toCachedChannel`; prefix `sales-channels:v3:` ignores a v2 entry — then implement in `sales-channels-cache.ts`
- [X] T009 [P] [PR-A] Extend the reconciler test (`default-channel-reconciler`) — red: a created default channel has `anonymousAccess: true` — implement in `default-channel-reconciler.ts`
- [X] T010 [P] [PR-A] Add `FastifyContextConfig.salesChannelAccess?: 'open'` in `PF/http/` (beside `request-actor.ts`), exported with the http barrel; a type test asserting a route may declare it

### Kernel: access cache, policy, port

- [X] T011 [P] [PR-A] Write `PF/kernel/sales-channels/sales-channel-access-cache.test.ts` — red: miss → loader, LRU hit within 30 s, LRU expiry, Redis hit, `invalidateAfterWrite` drops Redis then LRU and publishes `{organizationId}`, failed Redis drop → bypass until a later drop succeeds, `invalidateAllAfterWrite` publishes `'*'`, a pub/sub message drops the local entry (contracts/channel-access-rule.md §5)
- [X] T012 [PR-A] Implement `PF/kernel/sales-channels/sales-channel-access-cache.ts` over `SharedDropMarks`; register with `inProcessCaches` (namespace `sales_channel_access`) — T011 green
- [X] T013 [P] [PR-A] Write `PF/kernel/sales-channels/sales-channel-access-policy.test.ts` — red: decision table of contract §2 (anonymous open/closed; customer assigned/unassigned; empty `organizationId`; impersonation); `assertCustomerMayUse` throws 403 with `details.channelCode`
- [X] T014 [PR-A] Implement `sales-channel-access-policy.ts` and `SalesChannelAccessPort` in `PF/kernel/ports/sales-channel.ts`; export the port type from `PF/kernel/index.ts`; update `backend/test/unit/kernel/published-surface.test.ts` expectations — T013 green
- [X] T015 [P] [PR-A] Extend `PF/kernel/sales-channels/sales-channel-membership.service` tests — red: for `entityType 'organization'` every committed mutation (add, remove, replace, bind, copy) awaits `invalidateAfterWrite(orgId)` **before** emitting; non-organization types do not touch it; `options.em` makes the statements run on that manager's transaction (rolled-back caller ⇒ no row)
- [X] T016 [PR-A] Implement in `sales-channel-membership.service.ts` (constructor takes an optional `SalesChannelAccessCacheInvalidation`) and `MembershipMutationOptions.em` — T015 green
- [X] T017 [PR-A] Compose: `PF/kernel/sales-channels/compose.ts` builds the access cache and policy; `PF/composition/compose-app.ts` registers `salesChannelAccessPort` and arms the `b2b:sales-channel-access:changed` subscriber (Redis duplicate connection, re-armed like `registry-cache.ts`); `SC` `SalesChannelsService.delete` awaits `invalidateAllAfterWrite()`. Run `BT/contract/kernel/harness-parity.test.ts`; re-derive `BT/unit/kernel/module-removal.test.ts` if it reds

### Kernel: the access step

- [X] T018 [P] [PR-A] Write `BT/contract/sales_channels/channel-access.contract.test.ts` — red, over header, `?salesChannel`, host map and fallback: anonymous on closed → 403 `SALES_CHANNEL_SIGN_IN_REQUIRED` with `details.channelCode` and the echo header; anonymous on open → 200; customer unassigned → 403 `SALES_CHANNEL_NOT_PERMITTED`; customer assigned → 200; impersonation follows the customer; admin and bound/unbound API key unchanged; `/api/v1/admin/*` untouched; unknown channel → 400 first; a closed **default** channel refuses a request with no channel signal
- [X] T019 [PR-A] Implement the step in `PF/kernel/sales-channels/sales-channel-resolver.middleware.ts` (after `setResolvedChannel`, skip rules of contract §1) — T018 green; extend the existing resolver contract tests rather than rewriting them
- [X] T020 [P] [PR-A] Write `BT/contract/sales_channels/channel-access-open-routes.test.ts` + ledger `BT/helpers/channel-access-open-routes.ts` (two-way, disclosure line) — red against the route set of research R-4
- [X] T021 [PR-A] Declare `config: { salesChannelAccess: 'open' }` on the routes of research R-4, each in its owning module: `auth` (admin login/logout), `mfa` (verify, setup-ticket, oauth providers/start/callback, both surfaces), `OR` (customer login/logout, password reset, e-mail verification, business registration, invitation routes), `SC` (`/storefront/sales-channel`), `_i18n` (`/i18n/config`), `_lifecycle` (`/storefront/module-presence`, `PF/lifecycle/routes.storefront.ts`), platform OpenAPI route, `dictionaries` (`/dictionary`, `/dictionary/by-code`), `seo` (`/storefront/seo/robots-policy`), `product_feeds` (`/public/product-feeds/:token`), `newsletter` (`confirm`, `c/:token`, `o/:token.gif`, `unsubscribe`) — T020 green
- [X] T022 [PR-A] Error codes: `SC/src/manifest.ts` `errorCodes` += the two channel codes; `SC/i18n/{en,pl}.json` `errors.*` sentences (contract §3); `OD/src/manifest.ts` += `ORDER_SALES_CHANNEL_MISMATCH`, `OD/i18n/{en,pl}.json`; update `backend/test/fixtures/error-code-routing/*` ledgers; run `check-error-translations`, `registered-bundles-shape.test.ts`

### Test estate (so the rule does not red unrelated suites)

- [X] T023 [PR-A] Shared fixture helper `BT/helpers/sales-channel-access.ts`: `assignOrganizationChannels(app|em, orgId, codes[])` through the membership port, `closeChannel(code)`; update `BT/helpers/{seed-organizations,seed-commerce,seed-crm,viewer-priced-fixture,admin-search-fixtures}.ts` so every Organization they create is bound to the default channel
- [ ] T024 [PR-A] Run `pnpm --filter backend run test` (complete suite); for every new 403 `SALES_CHANNEL_NOT_PERMITTED`, add the assignment in the fixture (customer on a non-default channel, or an Organization created by `em.create`) — never by opening the rule; list the touched files in the MR. Expected areas (research R-16): `contract|integration/{catalog,cms,megamenu,comparisons,quick_order,search,price_lists,blog,seo,quote_requests,carts,orders,shopping_lists,returns,payments,invoices,customers,pwa,inventory}`
- [X] T025 [P] [PR-A] `BT/integration/demo/demo-reset-after-use.test.ts`: assert the demo Organization's bridge row is created by seed and removed by reset; `OR/src/backend/demo/seed.ts` binds the default channel after create (FR-019); `packages/demo-composition` steps creating Organizations bind likewise
- [X] T026 [PR-A] Re-record the OpenAPI baseline (new route option has no wire effect; the two 403 responses are added as a shared component) — additions only: the two response components and the new access route

**Checkpoint**: the rule exists, nothing is closed, every Organization in fixtures has the default
channel; the complete suite is as green as the T001 baseline.

---

## Phase 3: User Story 3 — existing shops keep working (P1) 🎯 MVP part 1

**Goal**: upgrade assigns default + order channels; channels open. **Independent test**: backfill
integration test.

- [X] T027 [US3] [PR-A] Write `BT/integration/organizations/channel-access-backfill.test.ts` — red: Organizations with no orders → default only; orders on A and B → default + A + B; pre-existing assignment kept; second run changes nothing; a database without an `orders` table (simulate by running the statement with the guard on a schema lacking it) does not fail
- [X] T028 [US3] [PR-A] Scaffold `migration:new -- --module organizations --name channel-access-backfill` (M2, research R-7) — T027 green; `composer:generate`; add the R1 ledger entry in `backend/scripts/ledgers/migration-undeclared-references/organizations.ts` (`permanent: true`, reason per research R-7); `pnpm --filter backend run check:module-boundary` — the R1 ledger entry was **not** added: `check:module-boundary` does not see the `orders` read inside the migration's `do $$` block (it scans no DO body), so an entry would be reported stale; recorded as an open issue for the check estate
- [X] T029 [P] [US3] [PR-A] M1 migration test: existing channels `anonymous_access = true`; new insert without the column → `true`
- [X] T030 [US3] [PR-A] `BT/perf/sales_channels/access-step.bench.ts`: anonymous request — 0 extra queries (query counter); customer request warm — LRU hit; record p50/p99 in the MR (SC-004)

---

## Phase 4: User Story 1 — a business-only store refuses anonymous visitors (P1) 🎯 MVP part 2

**Goal**: closed channel → sign-in. **Independent test**: contract T018 rows + storefront redirect.

### Backend

- [X] T031 [P] [US1] [PR-A] Extend `BT/contract/sales_channels/admin-crud-lifecycle.contract.test.ts` — red: create without the field → `anonymousAccess: true`; patch to `false` audited with before/after, bumps `version`, honours `If-Match`; the identity read reflects it after invalidation
- [X] T032 [US1] [PR-A] Implement in `SC/src/backend/services/sales-channels.service.ts` and `routes.admin.ts` (create/update/summary mapping) — T031 green
- [X] T033 [P] [US1] [PR-A] Write `BT/contract/sales_channels/storefront-access-read.contract.test.ts` — red: `/storefront/sales-channel` carries `anonymousAccess`; `/storefront/sales-channel/access` for anonymous on open/closed, customer permitted/not (with `permittedChannels` and `storefrontUrl` from the channel setting), admin → `viewer: 'other'`; `Cache-Control: private, no-store`; never 403
- [X] T034 [US1] [PR-A] Implement both in `SC/src/backend/routes.storefront.ts` (open route; `salesChannelAccessPort`, `settingsReadPort` for `sales_channels.storefront_url` per channel) — T033 green
- [ ] T035 [P] [US1] [PR-B] `BT/contract/customers/register-channel.contract.test.ts` — red: individual self-registration on a closed channel → 403 `SALES_CHANNEL_SIGN_IN_REQUIRED`, no account created (proves the route is *not* open)

### Storefront (D1 transport + closed-store UX)

- [ ] T036 [P] [US1] [PR-E] Write `SF/test/lib/channel-header-coverage.test.ts` (contracts/storefront-ux.md §1.7) — red on today's tree, naming `lib/api/rfq.ts`, `newsletter.ts`, `speculation-rules.ts`, `comparisons.ts`, `components/ProductCardActions.tsx`
- [ ] T037 [P] [US1] [PR-E] Write `SF/test/lib/active-channel.test.ts` — red: middleware stamps `x-sales-channel` from the cached identity when no proxy did, keeps a proxy's value; `getServerContext().ctx.salesChannelCode` always defined; `apiGetAuthed`/`apiMutate`/`apiGet` without `ctx` send the stamped header; outside a request scope they send none and do not throw
- [ ] T038 [US1] [PR-E] Implement `SF/lib/api/channel-headers.ts` (`activeChannelHeaders`), use it in `lib/api/client.ts`, `lib/api/mutations.ts`, `lib/api/cart.ts`; middleware stamping in `SF/middleware.ts` with the cached identity read (reuse the crawler-policy cache seam) — T037 green
- [ ] T039 [US1] [PR-E] Thread the code into the five raw `fetch` sites and make `salesChannelCode` required on `SearchAutocomplete`, `MobileSearchOverlay`, `NotifyWhenAvailableDialog`, comparison widgets and `ProductCardActions` (layout supplies it); federated start links append `?salesChannel=` — T036 green
- [ ] T040 [P] [US1] [PR-E] Extend `SF/test/seo/middleware-effect.test.ts` — red: closed channel + no session → 307 to `/login?next=…&reason=sign-in-required` for content paths; every allow-listed path (contract §2) passes; open channel → no redirect; with a session → no redirect
- [ ] T041 [US1] [PR-E] Implement the redirect in `SF/middleware.ts`; login page notice `auth.login.signInRequired`; hide the individual registration link and redirect `/register-customer` on closed channels; `app/sitemap.ts` empty on refusal; messages en-US + pl-PL in `SF/lib/i18n/messages.ts` — T040 green
- [ ] T042 [US1] [PR-E] Update storefront tests that assumed an absent header: `SF/test/lib/order-placement-channel.test.ts`, `method-catalogues-channel.test.ts`, `viewer-priced-reads.test.ts`, `SF/test/channel-theme.test.tsx`; run `pnpm --filter storefront run test` and the visual suite (`SF/test/visual`), adding a closed-store sign-in snapshot

**Checkpoint**: US1 + US3 = a closed store works end to end; open stores unchanged.

---

## Phase 5: User Story 2 — customers only on assigned stores (P1)

**Goal**: sign-in and every customer request follow the assignment. **Independent test**: T043–T046.

### Backend

- [ ] T043 [P] [US2] [PR-B] Write `BT/contract/organizations/login-channel-access.contract.test.ts` — red: unassigned channel → 403 `SALES_CHANNEL_NOT_PERMITTED`, no `Set-Cookie`, no session row, no MFA challenge issued, `lastLoginAt` unchanged; wrong password on an unassigned channel → 401 (precedence); assigned → authenticated; anonymous basket of the login channel merged only when permitted
- [ ] T044 [US2] [PR-B] Implement in `CA/src/backend/services/customer-auth-service.ts` (`assertCustomerMayUse` after the blocked check, before `beginLogin`; resolve `salesChannelAccessPort` with `lazyPort` in `CA/src/backend/index.ts`) — T043 green
- [ ] T045 [P] [US2] [PR-B] Write `BT/contract/mfa/federated-channel-access.contract.test.ts` and an MFA-verify case — red: federated callback for an unassigned Organization redirects to `<storefront>/login?error=sales_channel_not_permitted` and creates no session; verify after the assignment was removed between steps → 403
- [ ] T046 [US2] [PR-B] Implement in `packages/modules/mfa/src/backend/routes.oauth.ts` (customer surface, using `tx.salesChannelId`) and the customer MFA verify path — T045 green; plus a test that with `mfa` deactivated password sign-in still refuses (R-14)
- [X] T047 [P] [US2] [PR-A] Write `BT/integration/sales_channels/channel-access-invalidation.test.ts` — red: assign/unassign through the admin route → next request on the writer decided on the new set; a second composed app instance drops its LRU on the pub/sub message (≤ 1 s in test), and without pub/sub within the LRU TTL (fake clock)
- [X] T048 [US2] [PR-A] Make T047 green (wiring fixes only; behaviour is T012/T016/T017)

### Storefront

- [ ] T049 [P] [US2] [PR-E] Write `SF/test/auth/login-channel-refusal.test.tsx` — red: login action maps `SALES_CHANNEL_NOT_PERMITTED` to `auth.login.channelNotPermitted` (en/pl); MFA step and `?error=sales_channel_not_permitted` likewise
- [ ] T050 [US2] [PR-E] Implement in `SF/app/(auth)/login/*` and the MFA step — T049 green
- [ ] T051 [P] [US2] [PR-E] Write `SF/test/components/ChannelAccessDenied.test.tsx` — red: layout renders it when `getMe` answers `SALES_CHANNEL_NOT_PERMITTED`; lists permitted stores (linked when `storefrontUrl`), sign-out form, `noindex`; no redirect loop
- [ ] T052 [US2] [PR-E] Implement `SF/components/ChannelAccessDenied.tsx`, `SF/lib/api/sales-channel.ts` `getSalesChannelAccess(ctx)` (no-store, viewer session) and the branch in `SF/app/layout.tsx`; map both codes in the client error toast — T051 green

---

## Phase 6: User Story 4 — new Organizations get the channel they were created for (P1)

> **PR A interim (2026-10-18):** so that a business or personal Organization created after PR A
> merges is not locked out before PR B lands, PR A binds both — and the demo Organization (T025) —
> to the **system-default** channel inside the creating step (`bindToDefaultIfEmpty` with the
> caller's `em`). On a single-channel shop that is the request channel. T054/T056 replace the
> default with the registering store's channel.

**Goal**: D6. **Independent test**: T053–T057.

- [ ] T053 [P] [US4] [PR-B] Write `BT/contract/organizations/registration-channel.contract.test.ts` — red: business registration with `X-Sales-Channel: b` → exactly B (also when B is closed to anonymous visitors); without a header → exactly the default; invitation accept on any channel → the Organization's channels unchanged
- [ ] T054 [US4] [PR-B] Implement in `OR/src/backend/services/registration-service.ts`: `replaceChannelsForEntity('organization', id, [getResolvedChannel().id], { em: <registration tx em> })` inside the creating transaction — T053 green
- [ ] T055 [P] [US4] [PR-B] Extend `BT/contract/customers/register-channel.contract.test.ts` — red: individual registration on open channel A → personal Organization holds exactly A and the issued session is accepted on A; personal-Organization provisioning without a request channel (unit, `OR` provisioning service) → default
- [ ] T056 [US4] [PR-B] Implement: `CA` passes `currentSalesChannel()?.id ?? null` into `PersonalOrganizationProvisionApi` (extend the `OR/src/ports` type with `salesChannelId: string | null`); `OR/src/backend/services/personal-organization-service.ts` binds that channel or the default on the provisioning `em` — T055 green
- [ ] T057 [P] [US4] [PR-B] Unit test in `OR` asserting every `em.create(Organization` site in `OR/src/backend` is followed by a bind (a source-level guard listing the three sites: registration, provisioning, demo seed) so a fourth creation path cannot skip it

---

## Phase 7: User Story 5 — operators manage channel access (P2)

**Goal**: admin switch, Organization panel, *New organization*. **Independent test**: T058–T066.

- [ ] T058 [P] [US5] [PR-C] Write `admin/test/modules/sales_channels/channel-form-anonymous-access.test.tsx` — red: switch present, default on for new, hint text, saves `anonymousAccess`, roster badge (StrictMode, axe-core)
- [ ] T059 [US5] [PR-C] Implement in `SC/src/admin/components/ChannelIdentityForm.tsx`, `pages/SalesChannelsListPage.tsx`, `api/sales-channels-client.ts`; bundle keys en/pl — T058 green
- [ ] T060 [P] [US5] [PR-C] Write `BT/contract/organizations/admin-sales-channels.contract.test.ts` — red: GET gate (`customers:read` or `customers:manage`), PUT gate (`customers:manage`), unknown org 404, unknown channel id 422 with path, `[]` refused, replace whole set, idempotent no audit, one audit row per added/removed membership with the admin actor, cache drop observed
- [ ] T061 [US5] [PR-C] Implement routes in `OR/src/backend/routes.admin.ts` + schemas in `CT/organizations.ts` (`OrganizationSalesChannelsResponseSchema`) — T060 green
- [ ] T062 [P] [US5] [PR-C] Write `admin/test/modules/organizations/sales-channels-panel.test.tsx` — red: multi-select with inactive/default markers, Save disabled until changed and on empty with the message, read-only without `customers:manage`
- [ ] T063 [US5] [PR-C] Implement `OR/src/admin/panels/SalesChannelsPanel.tsx` in `OrganizationDetail.tsx`; delete `SC/src/admin/zones/OrganizationChannelMembership.tsx` and its registration in `SC/src/admin/index.ts`; replace `admin/test/modules/sales_channels/organization-channels-zone.test.tsx`; run `check:admin-registrations` — T062 green
- [ ] T064 [P] [US5] [PR-C] Write `BT/contract/organizations/admin-organization-create.contract.test.ts` — red: gate `customers:manage`; body validation; channels min 1; created with exactly the selected channels in one transaction (a failing bind rolls the Organization back); duplicate tax id refused as in registration; Command audit `organization.create`
- [ ] T065 [US5] [PR-C] Implement `POST /api/v1/admin/organizations`, `OR/src/backend/commands/create-organization.command.ts`, `AdminOrganizationCreateBodySchema` in `CT/organizations.ts` — T064 green
- [ ] T066 [P] [US5] [PR-C] Write `admin/test/modules/organizations/organization-create.test.tsx` — red: route `/organizations/new` gated, *Sales channels* pre-selects the system default, submit navigates to detail, list button shown only with `customers:manage`
- [ ] T067 [US5] [PR-C] Implement `OR/src/admin/pages/OrganizationCreate.tsx`, route in `OR/src/admin/index.ts`, list button; palette action `new-organization` in `OR/src/manifest.ts`; bundle keys en/pl; `composer:generate` — T066 green
- [ ] T068 [US5] [PR-C] Run `BT/contract/admin_users/permission-inventory.test.ts`, `check:action-route-permissions`, `BT/unit/_i18n/registered-bundles-shape.test.ts`, `pnpm --filter backend run i18n:hardcoded`

---

## Phase 8: User Story 6 — the basket belongs to its store (P2)

**Goal**: attribution, pricing, merge, placement. Depends on PR #345. **Independent test**: T069–T076.

- [ ] T069 [P] [US6] [PR-D] Write `BT/integration/carts/cart-channel-attribution.test.ts` — red: two channels with different price lists and a product quote-only on one: add on A and B → two baskets, prices and quote-only per channel; anonymous token of A on B → no basket, write mints a new token; merge on login same channel / other channel (`noop_no_anon`)
- [ ] T070 [US6] [PR-D] Implement in `CR/src/backend/services/cart-service.ts` (lookups by owner + channel, delete `#defaultSalesChannelId`, merge rule), `cart-line-pricing.ts` (`contextFor` takes `salesChannelId`), `cart-pricing-recompute.ts` (drop the default fallback), `CR/src/backend/routes.ts` (pass `getResolvedChannel().id`; cookie re-mint) — T069 green
- [ ] T071 [US6] [PR-D] Make `CartCustomerContext.salesChannelId` required (T006) and pass it from every producer: `CR` routes and ports, `quick_order`, `shopping_lists`, cart → quote conversion and quote → cart in `quote_requests`, `OD` placement; `pnpm -r run typecheck`
- [ ] T072 [P] [US6] [PR-D] Write `BT/integration/orders/place-order-cart-channel.test.ts` — red: placement on B uses B's basket and prices; forced mismatch → 422 `ORDER_SALES_CHANNEL_MISMATCH`, nothing written, basket kept; #345 drift check priced on B (red if `contextFor` falls back to the default)
- [ ] T073 [US6] [PR-D] Implement in `CR/src/backend/services/cart-placement-apply-port.ts` and `OD/src/backend/services/order-service.ts`; update the comment block at `OD/src/backend/routes.ts:300-312` to describe the new behaviour — T072 green
- [ ] T074 [P] [US6] [PR-D] Write `BT/contract/carts/cart-channel.contract.test.ts` (HTTP of contract §1) and the M3 test — red
- [ ] T075 [US6] [PR-D] Scaffold `migration:new -- --module carts --name carts-channel-backfill` (M3); `composer:generate` — T074 green
- [ ] T076 [US6] [PR-D] Rebase #345's tests (`place-order-line-price-current.test.ts`, `cart-line-repricing.test.ts`, `cart-line-pricing.test.ts`) on the new `contextFor` signature

---

## Phase 9: Polish and cross-cutting

- [ ] T077 [P] [PR-E] Docs: `SC/docs/sales_channels/admin-usage.md` (the switch; *Multi-storefront set-up* — make line 71 accurate: products and prices per channel, customers only when their Organization is assigned, anonymous visitors only on open channels), `index.md`, `developer-guide.md` (the rule, `salesChannelAccess: 'open'` for module authors incl. provider callbacks, `SalesChannelAccessPort`, per-customer record unused)
- [ ] T078 [P] [PR-E] Docs: `OR/docs/organizations.md` (*Sales channels* panel, *New organization*, registration rule D6, invitations), `CR/docs/carts.md` (one basket per channel, placement refusal)
- [ ] T079 [PR-E] Polish versions under `docs/i18n/pl/docusaurus-plugin-content-docs/current/modules/…` with their hash files per `docs/docs/contributing/documentation-i18n.md`; `pnpm --filter backend run check:module-docs`; docs build
- [X] T080 [P] [PR-A] Changesets: `@endora-commerce/platform` (minor — access step, route option, port, `em` option; note for module authors), `@endora-commerce/contracts` (minor), each changed module package; per `specs/conventions/release-intent.md`
- [X] T081 [PR-A] `pnpm --filter backend run manifests:generate` + `pnpm install --lockfile-only` if any package manifest changes; commit both
- [ ] T082 Every PR: `pnpm -r run typecheck`, `pnpm -r run lint`, targeted tests, `pnpm --filter '!backend' run test`, `check:naming`, `check:language`, `check:module-boundary`, `check:port-dependencies`, `check:port-catches`; the complete backend suite before PR A and PR D merge (D-198: MR pipelines do not run it)
- [ ] T083 [PR-E] Walk [quickstart.md](./quickstart.md) §1–§6 on a fresh `pnpm run setup` and on a restored pre-feature database; record results in PR E

---

## Dependencies & execution order

- Phase 1 → Phase 2 (blocks everything). T006 is type-only in PR A and completed by T071.
- US3 (Phase 3) and US1 backend (T031–T034) need only Phase 2 → **PR A**.
- US2 backend and US4 (T043–T048 minus T047/T048 which are PR A, T053–T057) → **PR B**, after A.
- US5 (Phase 7) → **PR C**, after A (T060/T064 need the port and membership `em`).
- US6 (Phase 8) → **PR D**, after A and after **PR #345**.
- Storefront tasks (T036–T042, T049–T052) and docs (T077–T079, T083) → **PR E**, after A, with or after B.

### Parallel opportunities

- Phase 2: T004/T006/T008/T009/T010/T011/T013/T015 are independent files.
- US1: T031, T033, T035, T036, T037, T040 in parallel (different suites).
- US5: T058, T060, T062, T064, T066 in parallel.
- US6: T069, T072, T074 in parallel.

## Implementation strategy

MVP = PR A (US3 + US1 backend): the rule exists, the upgrade is safe, a closed channel works at the
API. PR B makes sign-in honest and new registrations land on the right store; PR C gives operators the
controls; PR D fixes basket attribution once #345 is in; PR E makes the storefront send the channel
everywhere and show the three refusal experiences, and ships the documentation.

**Task count**: 83 (Setup 3, Foundational 23, US3 4, US1 12, US2 10, US4 5, US5 11, US6 8, Polish 7).
