# Implementation Plan: Order and Quote status push notifications — operator switches and customer preferences

**Branch**: `feat/149-pwa-order-status-push` | **Date**: 2026-10-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/149-pwa-order-status-push/spec.md`

## Summary

Make the PWA module's automatic status pushes something an operator can switch per category and a
customer can opt out of per category, and make the quote half work at all. Concretely:

1. Two pwa-owned boolean Settings (`pwa.push_order_status_enabled`,
   `pwa.push_quote_status_enabled`, default on, global + per-channel) on the existing PWA screen.
2. A pwa-owned `push_notification_preferences` table (one row per customer account, absent = both
   on) behind `GET`/`PUT /api/v1/storefront/pwa/preferences`, written through the Command Bus, and
   rendered on the storefront account profile beside the existing per-device control.
3. One status-push composer used by both triggers, applying the gates in a fixed order (push on →
   category on → account live → customer choice), rendering pl/en copy from `pwa`'s bundle in the
   channel's language with the shop's own order-status label, and deep-linking to the order or
   quote.
4. The quote trigger rebuilt on the five `rfq.*` events `quote_requests` really emits, reading the
   quote through `quoteRequestReadPort` as a **degrading** (non-binding) dependency; the dead
   `quote_request.updated.v1` subscription removed.

Research: [research.md](./research.md) (R-1 is the measured baseline).

## Technical Context

**Language/Version**: TypeScript 5.x `strict`, Node.js ≥ 22.17, ESM
**Primary Dependencies**: Fastify, MikroORM (PostgreSQL), Zod, ioredis, BullMQ, `web-push` (existing, backend); React 19 + Vite + admin-kit (admin); Next.js 15 App Router server components and server actions (storefront) — **no new runtime dependency**
**Storage**: PostgreSQL — one new table `push_notification_preferences` owned by `pwa`; two new boolean settings in the existing `settings` store; no change to `push_messages`/`push_subscriptions`
**Testing**: Vitest — co-located module unit tests (`packages/modules/pwa/src/backend/**/*.test.ts`), backend contract/integration suites (`backend/test/{contract,integration}/pwa/`), admin tests (`admin/test/modules/`), storefront tests (`storefront/test/pwa/`)
**Target Platform**: Linux server (backend + BullMQ worker), browsers supporting Web Push (storefront)
**Project Type**: web — pnpm monorepo (backend + admin + storefront + packages)
**Performance Goals**: status push production stays O(1) indexed reads per event (one order/quote, one account, one preference row, two cached settings) and adds no latency to the announcing transaction (post-commit, fire-and-forget subscriber)
**Constraints**: FR-015 — a push failure never affects the status change; Principle XVII off-state; pl+en for every sentence
**Scale/Scope**: one module extended (`pwa`), two additive contract changes on `orders` and `quote_requests` read models, ~5 storefront files, 1 admin screen

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design — same verdict.*

| Principle | Verdict | How the design meets it |
| --- | --- | --- |
| **I. Modular architecture (NN)** | Pass | All new state (settings, preference table, composer, routes, bundle keys, docs) is `pwa`'s. `pwa` reacts to events and reads published ports only (`orderReadPort`, `quoteRequestReadPort`, `customerAccountReadPort`, `adminI18nService`); the two additive contract members are implemented by their owners in their own packages. No import of another module's internals; no foreign table read. Detaching `pwa` removes everything this feature adds. |
| **II. API-first** | Pass | Zod schemas in `packages/contracts/src/pwa.ts` (preferences DTOs, config fields), `orders.ts` (`OrderStatusDefinitionRecord`), `quote-requests.ts` (`salesChannelId`) land first with their tests ([contracts/](./contracts/)). All changes additive. |
| **III. TDD (NN)** | Pass | Every implementation task in [tasks.md](./tasks.md) is preceded by a RED test; § *Requirement → test* maps FR-001…FR-025 and SC-001…SC-006. |
| **IV. YAGNI, minimal dependencies** | Pass | No dependency. No new module, no per-status matrix, no preference cache, no new event, no generic notification-preference abstraction (R-3, R-6, R-15). |
| **V. TypeScript everywhere** | Pass | Zod at the two new HTTP boundaries; event payloads read defensively into typed values. |
| **VI. Naming (NN)** | Pass | Table/columns snake_case; routes kebab-case under `/api/v1/storefront/pwa/`; JSON camelCase; setting codes `pwa.*` snake_case; migration scaffolded so its class begins with the `Pwa` segment; Command action `pwa.push_preference.update`. |
| **VII. SEO, performance** | Pass | `/account` is already `noindex`; the new section is a server component plus a server action — SSR preserved, no client fetch on first paint (the device control was already client-only). |
| **VIII. English (NN)** | Pass | Code, comments, specs, docs in English; Polish only in bundles, `messages.ts` and the Polish docs tree. |
| **IX. UI reuse** | Pass | Admin: existing `Checkbox`/`Label` in the existing card; `useModulePresence` (crm precedent). Storefront: native form controls with the account area's existing `b2b-auth__*` classes, as `/preferences` does. No new primitive. |
| **X. Queue consumers** | Pass | The subscriber stays a producer; delivery remains the existing `pwa.push.deliver` BullMQ worker registered through `ctx.worker`. |
| **XI. Tenant isolation (NN)** | Pass | `PushNotificationPreference` is `@CustomerScoped()` with a stamped `organizationId` (D-187 pattern); storefront routes use the session's account only. The event handler runs under `enterSystemScope` with an explicit `customerAccountId` constraint (D-285); no "no-organization" path (every account has one, D-178). |
| **XII. Sales-channel scoping (NN)** | Pass | Storefront routes read `getResolvedChannel(request)` (config) as today; the handler takes the channel from the order/quote record, falling back to `salesChannelResolutionPort.getSystemDefault()` — the sanctioned accessor — for a channel-less quote. |
| **XIII. Command Bus auditing (NN)** | Pass | The customer preference write runs as Command `pwa.push_preference.update` with a server-derived customer actor (R-12). Operator switches are written through `settingsAdminService`, the settings module's audited path, like every PWA setting. Push message rows remain `command-coverage-ignore` infrastructure, unchanged. |
| **XIV. Entity-agnostic extensibility** | N/A | Not an "add a field" requirement (R-3 explains why custom fields were rejected). |
| **XV. Untouched core / overlay** | N/A | No overlay involved. |
| **XVI. Command palette** | Pass, closes a gap | `pwa` has no palette action today; this feature adds `open-settings` → `/settings/pwa` under `pwa:read` (R-16). |
| **XVII. Operator-toggleable modules (NN)** | Pass | Subscriptions via `ctx.subscribe`, routes via `ctx.routes`, delivery via `ctx.worker` — all gated on `pwa`. `quote_requests` is a `degrades-without` non-binding dependency with an `isPresent()` decision in front of the port; its absence hides the quote switch/choice and nothing else. Off-state tests extend `backend/test/integration/pwa/off-state.test.ts`. Off deletes nothing. |

**Admin permission manifest** — no new code; `pwa:read` / `pwa:write` already declared and gate the
routes. **Command palette** — one action added (above). **i18n** — pwa bundle (backend notification
copy, admin strings, palette labels) and storefront `messages.ts`, both languages, `check:bundle-pairing`
unaffected (pwa already ships both). **Settings** — two non-secret booleans; no `secret` type
needed. **Redis cache invalidation** — none needed (R-15). **Tenant scoping** — above.

## Project Structure

### Documentation (this feature)

```text
specs/149-pwa-order-status-push/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── status-push-triggers.md
│   ├── storefront-push-preferences-api.md
│   └── admin-pwa-config.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/contracts/src/
├── pwa.ts                    # +2 setting codes, +2 public-config fields, +2 admin-config fields, preferences DTOs
├── orders.ts                 # +OrderStatusDefinitionRecord, +OrderReadPort.findStatusDefinition
└── quote-requests.ts         # +QuoteRequestRecord.salesChannelId

packages/modules/orders/src/backend/services/order-read-port.ts            # implement findStatusDefinition
packages/modules/quote_requests/src/backend/services/quote-request-read-port.ts  # map salesChannelId

packages/modules/pwa/
├── i18n/{en,pl}.json         # notification.*, settings.field.*Push*, actions.openSettings.*
├── docs/pwa.md               # updated (en); Polish mirror in docs/i18n/pl/…/modules/pwa.md
└── src/
    ├── manifest.ts           # +2 settings, +nonBindingDependencies(quote_requests), +actions
    ├── migrations/<STAMP>_pwa_push_notification_preferences.ts   # scaffolded, not hand-numbered
    ├── admin/pages/PwaPage.tsx                                  # two checkboxes
    └── backend/
        ├── index.ts          # ports wired; 6 subscriptions (1 order + 5 rfq); dead one removed; entity added
        ├── plugin.ts         # options: composer deps; resolveQuoteTarget removed
        ├── routes.storefront.ts   # GET/PUT preferences; config fields
        ├── routes.admin.ts        # config GET/PUT fields
        ├── entities/push-notification-preference.entity.ts
        └── services/
            ├── push-preference-service.ts       (+ .test.ts)
            ├── status-push-composer.ts          (+ .test.ts)
            ├── status-push-copy.ts              (+ .test.ts)  # language pick, keys, label fallback, url
            ├── push-event-subscriber.ts         (reshaped; its test stays at backend/test/unit/pwa/push-event-presence.test.ts)
            ├── cross-module-context.ts          # createOrderPushTargetResolver replaced by the composer
            └── pwa-config-resolver.ts           # effective order/quote flags

storefront/
├── app/(account)/account/page.tsx              # section + server action
├── components/pwa/PushPreferencesForm.tsx      # new (server component)
├── components/pwa/PushNotificationsToggle.tsx  # strings → messages
├── lib/api/pwa-server.ts                       # preferences read/write; DEFAULT_CONFIG fields
└── lib/i18n/messages.ts                        # account.push.* keys (en-US, pl-PL)

backend/test/
├── contract/pwa/admin-and-storefront.contract.test.ts   # preferences API + config fields
└── integration/pwa/{status-push.test.ts (new), off-state.test.ts, cross-module-wiring.test.ts}
```

**Structure Decision**: extend `pwa` (owner of push) rather than create a module (R-3); touch
`orders` and `quote_requests` only to publish two additive read-model facts through their existing
ports.

## Migrations

One migration, owned by `pwa`, scaffolded by
`pnpm --filter backend run migration:new -- --module pwa --name push_notification_preferences`,
registered by `pnpm --filter backend run composer:generate` (commit
`backend/src/db/migrations-registry.generated.ts` and `entities-registry.generated.ts`). It creates
`push_notification_preferences` with the unique and organisation indexes of data-model §1. No
foreign key, no cross-module reference, so no manifest `dependencies` edge and no ordering
interaction. `down()` drops the table.

## Phasing

1. **Contracts** (shared) — additive schemas/types + their tests; the two owner implementations
   (`orders`, `quote_requests`) with co-located tests.
2. **US1 + US2 backend** (P1) — settings, composer, copy, subscriptions, manifest edge; unit then
   integration.
3. **US1 admin** — PwaPage checkboxes, palette action.
4. **US3 backend** — entity, migration, preference service + Command, storefront routes,
   composer preference gate, public config flags.
5. **US3 storefront** — section, form, server action, i18n.
6. **Off-state, docs, changesets, gate.**

US1/US2 are shippable without US3 (absent row = both on).

## Risks

| Risk | Mitigation |
| --- | --- |
| `OrderReadPort` gaining a method breaks test doubles that implement the whole interface. | Task T004 greps `backend/test/**` and `packages/**` for `OrderReadPort` implementers and updates them in the same commit. |
| A test or ledger still references `onQuoteRequestUpdated` / `quote_request.updated.v1` (`backend/test/unit/pwa/push-event-presence.test.ts` does). | Rewritten in the same task that deletes them; grep `backend/test/**` before finishing (AGENTS.md trap). |
| `adminI18nService` is resolved by `pwa` for the first time — `check:port-dependencies` must see the literal and the edge (`_i18n` already in `dependencies`). | `lazyPort<AdminI18nTranslatePort>(ctx, 'adminI18nService')` literal; run the check in the phase gate. |
| The expiry sweep emits `rfq.expired.v1` with no tenant context; a `@CustomerScoped` read would throw. | Composer runs inside `enterSystemScope` (R-11); integration test drives the expiry event with no ambient context. |
| Shops upgrading with push on suddenly start sending quote notifications. | Intended (the storefront already promised them); release note in the changeset and docs; operator can switch the category off. |

## Complexity Tracking

No constitution violation to justify. **New runtime dependencies: none** (Constitution IV) — the
feature reuses Settings, `_i18n`, the Command Bus, BullMQ and `web-push` already in the stack.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| — | — | — |

## Constitution Check — post-design

Re-checked after data-model and contracts: unchanged. The only new cross-module edge is the
`degrades-without` entry on `quote_requests`, which is the shape `module-composition.md` item 4a
prescribes for a switchable owner whose absence should not hold the dependent.

## Handoff to `endora-commerce-dev`

- Work on `feat/149-pwa-order-status-push`; follow [tasks.md](./tasks.md) in order — RED before
  GREEN in every phase; each phase is independently committable.
- Run `pnpm run build:packages` after editing `packages/contracts`, `orders`, `quote_requests` or
  `pwa` before any test that imports them.
- Do not hand-number the migration; scaffold it and run `composer:generate` +
  `pnpm install --lockfile-only` if `manifests:generate` rewrites any `package.json`.
- Phase gate commands are listed per phase in tasks.md; before the MR also run
  `pnpm --filter backend run check:port-dependencies`, `check:port-catches`,
  `check:subscribe-seam`, `check:command-coverage -- --module pwa`, `check:action-route-permissions`,
  `i18n:hardcoded`, `check:module-docs`, `pnpm -r run typecheck`, `pnpm -r run lint`,
  `pnpm --filter '!backend' run test`.
- Changesets: `@endora-commerce/contracts`, `@endora-commerce/mod-pwa`, `@endora-commerce/mod-orders`,
  `@endora-commerce/mod-quote-requests`.
- Open product questions (spec § *Open questions*) have defaults applied; none blocks
  implementation.
