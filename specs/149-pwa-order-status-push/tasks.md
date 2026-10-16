# Tasks: Order and Quote status push notifications (`specs/149-pwa-order-status-push/`)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/status-push-triggers.md](./contracts/status-push-triggers.md),
[contracts/storefront-push-preferences-api.md](./contracts/storefront-push-preferences-api.md),
[contracts/admin-pwa-config.md](./contracts/admin-pwa-config.md), [quickstart.md](./quickstart.md).

**Organisation**: seven phases, each **independently committable** on
`feat/149-pwa-order-status-push` (no AI trailer). Each phase ends with a **Verification** line,
run serially. Phases are marked **[backend]**, **[admin UI]**, **[storefront]**, **[docs]** or
**[gate]** so UI phases can be routed to `endora-commerce-designer` for review.

## Format

`- [ ] T### [P?] [US?] Description — path(s)`

- **[P]** — may run in parallel with its neighbours (different files, no unfinished dependency).
- **[US1] [US2] [US3]** — the story served; none = shared.
- **RED** — the deliverable is a failing test. Run it and watch it fail **for the reason named**
  before the task that turns it green (Constitution III).

## Standing rules

1. **Rebuild what you edit.** Tests read each package's `dist`; `tsc` reads sources. After editing
   `packages/contracts`, `packages/modules/{pwa,orders,quote_requests}`, run
   `pnpm --filter <package> run build` before a test that imports it.
2. **Module unit tests sit beside their subject** under `src/backend/` (never beside
   `src/manifest.ts`); server-bound tests go under `backend/test/{contract,integration}/pwa/`.
3. **Paths in `pnpm --filter backend exec vitest run …` resolve from `backend/`** — a module source
   is `../packages/modules/pwa/src/…`.
4. Contract/integration tests need Postgres + Redis (`pnpm run dev:infra`).
5. **Never** hand-number the migration; never edit a generated registry.

---

## Phase 1 — Contracts and owner read models [backend]

- [X] T001 RED Contract tests for the pwa additions: `PWA_SETTING_CODES` has
  `PUSH_ORDER_STATUS_ENABLED`/`PUSH_QUOTE_STATUS_ENABLED`; `PwaPublicConfigSchema` requires
  `orderStatusPushEnabled`/`quoteStatusPushEnabled`; `PwaAdminConfigSchema` likewise;
  `UpdatePwaConfigRequestSchema` accepts both optionally; `PushPreferencesSchema`;
  `UpdatePushPreferencesRequestSchema` rejects `{}`, unknown keys and non-booleans — 
  `packages/contracts/src/pwa.test.ts` (new)
- [X] T002 GREEN Add the above to `packages/contracts/src/pwa.ts` (data-model §2, §4, §5)
- [X] T003 [P] Add `OrderStatusDefinitionRecord` and `OrderReadPort.findStatusDefinition(code)` to
  `packages/contracts/src/orders.ts`; add `salesChannelId: string | null` to `QuoteRequestRecord` in
  `packages/contracts/src/quote-requests.ts` (data-model §3)
- [X] T004 RED `findStatusDefinition` answers `{ code, name, defaultName }` for a seeded status and
  `null` for an unknown code; `QuoteRequestReadService.findById` carries `salesChannelId` (a uuid,
  and `null` for a channel-less request) — `backend/test/integration/pwa/owner-read-models.test.ts`
  (new; it exists for this feature's consumer, so it lives with the consumer)
- [X] T005 GREEN Implement `findStatusDefinition` in
  `packages/modules/orders/src/backend/services/order-read-port.ts`; map `salesChannelId` in
  `toQuoteRequestRecord` (`packages/modules/quote_requests/src/backend/services/quote-request-read-port.ts`)
- [X] T006 Update every full-interface test double that `pnpm -r run typecheck` now reports
  (known: `backend/test/unit/shipments/shipment-email-outcome.test.ts`,
  `backend/test/unit/invoices/cross-module-ports.unit.test.ts`; any `QuoteRequestRecord` literal)
- [X] T007 [P] Changesets: `@endora-commerce/contracts` (minor: additive schemas/port member),
  `@endora-commerce/mod-orders`, `@endora-commerce/mod-quote-requests` — `.changeset/149-*.md`

**Verification**: `pnpm --filter @endora-commerce/contracts run build && pnpm --filter @endora-commerce/contracts exec vitest run src/pwa.test.ts`;
`pnpm run build:packages`; `pnpm --filter backend exec vitest run test/integration/pwa/owner-read-models.test.ts`;
`pnpm -r run typecheck`.

---

## Phase 2 — Operator switches and working, localised status pushes (US1 + US2, P1) [backend]

- [X] T008 RED [US2] Copy rules, pure: language pick (`pl-PL`→`pl`, `en-US`→`en`, `de-DE`→`en`);
  order label fallback `name[lang]` → `defaultName` → code; key per quote `what`; params
  (`orderNumber`/`quoteNumber`, `status`); url `/orders/<id>` / `/quote-requests/<id>` —
  `packages/modules/pwa/src/backend/services/status-push-copy.test.ts`
- [X] T009 GREEN [US2] `packages/modules/pwa/src/backend/services/status-push-copy.ts`; add the
  `notification.*` keys to `packages/modules/pwa/i18n/en.json` and `pl.json` (data-model §8)
- [X] T010 RED [US1][US2] Composer over stub ports, one case per gate in R-11 order: guest order /
  unknown id → nothing; `push_enabled` off → nothing; category setting off → nothing (order and
  quote independently, per channel); account missing/deleted/anonymised → nothing; quote with
  `quote_requests` not present → port never called; channel-less quote → system default channel;
  happy path → exactly one `createAndEnqueue` with `audience.customers=[id]`, the right `trigger`,
  `sourceEventId=eventId`, translated title/body via the stub translate port —
  `packages/modules/pwa/src/backend/services/status-push-composer.test.ts`
- [X] T011 GREEN [US1][US2] `packages/modules/pwa/src/backend/services/status-push-composer.ts`
  (runs inside `enterSystemScope`; preference gate stubbed as "both on" until Phase 4); delete
  `createOrderPushTargetResolver` from `services/cross-module-context.ts` and its test cases in
  `cross-module-context.test.ts`
- [X] T012 RED [US2] Rewrite `backend/test/unit/pwa/push-event-presence.test.ts` for the new
  handler set (`onOrderStatusChanged`, `onQuoteStatusEvent(what)`): `ModuleDisabledError` →
  `pwa.push_skipped_module_disabled` naming the module; other errors →
  `pwa.push_enqueue_failed`; neither re-thrown; a payload missing `eventId`/`orderId`/`rfqId` is
  dropped without a log line at error level
- [X] T013 GREEN [US2] Reshape `services/push-event-subscriber.ts` onto the composer; in
  `backend/index.ts` replace the `quote_request.updated.v1` subscription with the five `rfq.*`
  subscriptions (`ctx.subscribe`, literal names), resolve `quoteRequestReadPort`,
  `adminI18nService`, `customerAccountReadPort` with `lazyPort` literals; in `plugin.ts` remove
  `resolveQuoteTarget`/`resolveOrderTarget` options and wire the composer — 
  `packages/modules/pwa/src/backend/{index.ts,plugin.ts,services/push-event-subscriber.ts}`
- [X] T014 [US1] Manifest: two settings in `pwaSettingEntries` (hidden, default `true`), the
  `nonBindingDependencies` `degrades-without` entry for `quote_requests` (contract
  status-push-triggers §3) — `packages/modules/pwa/src/manifest.ts`
- [X] T015 RED [US1][US2] Integration over the composed harness: order status change → one
  `push_messages` row with Polish copy on a `pl-PL` channel and the operator's status label;
  same event emitted twice → one row (FR-014); category off globally / on per channel (US1 #3);
  each of the five `rfq.*` events → one row with the right body and url; `rfq.created.v1` → none;
  `rfq.expired.v1` emitted with **no** ambient tenant context → one row —
  `backend/test/integration/pwa/status-push.test.ts` (new); update the order case in
  `backend/test/integration/pwa/cross-module-wiring.test.ts`
- [X] T016 GREEN [US1][US2] Fix whatever T015 surfaces; run the checks below until clean

**Verification**: `pnpm --filter @endora-commerce/mod-pwa run build`;
`pnpm --filter backend exec vitest run ../packages/modules/pwa/src/backend test/unit/pwa test/integration/pwa`;
`pnpm --filter backend run check:port-dependencies && pnpm --filter backend run check:port-catches && pnpm --filter backend run check:subscribe-seam && pnpm --filter backend run check:module-boundary`;
`grep -rn "quote_request.updated\|resolveQuoteTarget\|onQuoteRequestUpdated" backend packages --include='*.ts' | grep -v CHANGELOG` returns nothing.

---

## Phase 3 — Operator switches on the admin screen (US1) [backend + admin UI]

- [ ] T017 RED [US1] Admin config contract: `GET /api/v1/admin/pwa/config` returns both new
  fields for global and channel scope; `PUT` with each field writes the setting (and is audited
  through the settings path); `POST …/config/reset` resets them; `pwa:read`/`pwa:write` gates
  unchanged — `backend/test/contract/pwa/admin-and-storefront.contract.test.ts`
- [ ] T018 GREEN [US1] `packages/modules/pwa/src/backend/routes.admin.ts` (read/write the two codes)
- [ ] T019 RED [US1] Admin screen: both checkboxes render under push, disabled while push is off,
  quote checkbox absent when `quote_requests` is not present, saving sends the fields; labels
  resolve in `pl` — `admin/test/modules/pwa.module-owned-surface.test.tsx` (render inside
  `<StrictMode>`)
- [ ] T020 GREEN [US1] `packages/modules/pwa/src/admin/pages/PwaPage.tsx` + `api/pwa-client.ts`
  types; strings via `useTranslation('pwa')`; `settings.field.*` keys in both bundles
- [ ] T021 [P] [US1] Palette action `open-settings` (contract admin-pwa-config) in
  `packages/modules/pwa/src/manifest.ts`; `actions.openSettings.*` keys in both bundles; a
  manifest assertion beside the existing pwa manifest test
  (`backend/test/contract/pwa/manifest-and-permissions.test.ts`)

**Verification**: `pnpm --filter backend exec vitest run test/contract/pwa test/unit/_i18n/registered-bundles-shape.test.ts`;
`pnpm --filter admin exec vitest run test/modules/pwa.module-owned-surface.test.tsx`;
`pnpm --filter backend run check:action-route-permissions && pnpm --filter backend run i18n:hardcoded`
(the `PwaPage.tsx: 22` baseline must not rise — lower it if T020 translated existing strings).

---

## Phase 4 — Customer preference: storage, API, gate (US3) [backend]

- [ ] T022 [US3] Entity `PushNotificationPreference` (`@CustomerScoped`, data-model §1) and add it
  to `entities` in `backend/index.ts` —
  `packages/modules/pwa/src/backend/entities/push-notification-preference.entity.ts`
- [ ] T023 [US3] Scaffold and write the migration:
  `pnpm --filter backend run migration:new -- --module pwa --name push_notification_preferences`;
  then `pnpm --filter backend run composer:generate`; commit the generated registries
- [ ] T024 RED [US3] Preference service over a stub Command Bus and stub account port: read with no
  row → both true and no write; first write creates with the organisation stamped; partial patch
  keeps the other field; unresolvable account refuses; the Command carries action
  `pwa.push_preference.update`, objectType, before/after —
  `packages/modules/pwa/src/backend/services/push-preference-service.test.ts`
- [ ] T025 GREEN [US3] `packages/modules/pwa/src/backend/services/push-preference-service.ts`
  (resolves `commandBus` from the cradle)
- [ ] T026 RED [US3] Storefront API contract: `GET` default both true; `PUT {quoteStatus:false}` →
  200 full shape, persisted, one `audit_log_entries` row with action `pwa.push_preference.update`
  and no admin actor; `PUT {}` / unknown key → 400; anonymous → 401; another customer cannot see or
  change it; `GET /api/v1/storefront/pwa/config` carries the two effective flags (push off ⇒ both
  false; quote setting off ⇒ quote false; `quote_requests` off ⇒ quote false) —
  `backend/test/contract/pwa/admin-and-storefront.contract.test.ts`
- [ ] T027 GREEN [US3] `routes.storefront.ts` (both routes, `requireCustomer` as `preHandler`) and
  `services/pwa-config-resolver.ts` (effective flags)
- [ ] T028 RED [US3] Composer preference gate: order choice off → no order push, quote push still
  produced; quote choice off → the reverse; a device subscription is never modified — add cases to
  `status-push-composer.test.ts` and one end-to-end case to
  `backend/test/integration/pwa/status-push.test.ts`
- [ ] T029 GREEN [US3] Replace the Phase 2 stub with the real preference read in
  `status-push-composer.ts` (debug log `pwa.push_skipped_customer_preference`)

**Verification**: `pnpm --filter @endora-commerce/mod-pwa run build`;
`pnpm --filter backend exec vitest run ../packages/modules/pwa/src/backend test/contract/pwa test/integration/pwa test/unit/db/migrations-registry.test.ts`;
`pnpm --filter backend run check:command-coverage -- --module pwa`; `pnpm run check:naming`.

---

## Phase 5 — Customer preference on the storefront (US3) [storefront]

- [ ] T030 [P] [US3] `account.push.*` keys in `storefront/lib/i18n/messages.ts` (`en-US` and
  `pl-PL`; the `Record` is total, so a missing Polish key fails `tsc`)
- [ ] T031 RED [US3] Section rendering rules (contract storefront-push-preferences §Public config):
  absent when push off or the preferences read fails; each checkbox per its flag; form absent when
  neither checkbox shows; server action sends `false` only for rendered-and-unchecked boxes —
  `storefront/test/pwa/push-preferences.test.tsx` (new)
- [ ] T032 GREEN [US3] `storefront/lib/api/pwa-server.ts` (`getPushPreferences`,
  `updatePushPreferences`, `DEFAULT_CONFIG` fields), `storefront/components/pwa/PushPreferencesForm.tsx`,
  server action and section in `storefront/app/(account)/account/page.tsx`
- [ ] T033 [US3] Move `PushNotificationsToggle.tsx`'s literals to `messages.ts` (it receives the
  resolved strings or the locale from the page); existing `storefront/test/pwa-push-release.test.tsx`
  stays green

**Verification**: `pnpm --filter storefront run typecheck && pnpm --filter storefront exec vitest run test/pwa test/pwa-push-release.test.tsx && pnpm --filter storefront run lint`.

---

## Phase 6 — Off-state and documentation [backend + docs]

- [ ] T034 RED [US1][US2][US3] Extend `backend/test/integration/pwa/off-state.test.ts`: with `pwa`
  deactivated while platform-available, an order status change and an `rfq.approved.v1` write no
  `push_messages` row, `GET/PUT …/pwa/preferences` answer 503 `MODULE_DISABLED`; after
  reactivation the saved switches and preference are unchanged and the next status change produces
  one row. With `quote_requests` deactivated: order push still produced, public config
  `quoteStatusPushEnabled=false` (FR-024, FR-025, SC-006)
- [ ] T035 GREEN Fix whatever T034 surfaces (expected: nothing beyond Phases 2–4)
- [ ] T036 [P] [docs] Update `packages/modules/pwa/docs/pwa.md` (Product Owner section: the two
  switches, the account choices, the languages; developer table: the two settings, the
  preference table, the five quote events and the `degrades-without` edge; correct the deep links)
  and its Polish mirror `docs/i18n/pl/docusaurus-plugin-content-docs/current/modules/pwa.md`
- [ ] T037 [docs] `pnpm --filter backend run composer:generate` to regenerate
  `docs/docs/module-reference/pwa.md` and its Polish mirror (settings, action, non-binding
  dependency); refresh the translation cache as `0bfab6980` did; changeset for
  `@endora-commerce/mod-pwa` describing the behaviour change for shops with push on (quote pushes
  start; order copy localised; links fixed)

**Verification**: `pnpm --filter backend exec vitest run test/integration/pwa`;
`pnpm --filter backend run check:module-docs && pnpm --filter backend run check:docs-translations && pnpm --filter backend run overlay:check`.

---

## Phase 7 — Gate [gate]

- [ ] T038 `pnpm -r run typecheck && pnpm -r run lint`
- [ ] T039 `pnpm --filter backend run test:unit:fast` and `pnpm --filter '!backend' run test`
- [ ] T040 `pnpm --filter backend exec vitest run test/contract/pwa test/integration/pwa test/integration/quote_requests/off-state.test.ts test/contract/admin_users/permission-inventory.test.ts test/contract/kernel/harness-parity.test.ts`
- [ ] T041 `pnpm run check:naming && pnpm run check:language && pnpm --filter backend run check:bundle-pairing && pnpm --filter backend run check:default-language-prose`
- [ ] T042 Walk [quickstart.md](./quickstart.md) §1–§4 on a dev stack; attach the `push_messages`
  query output to the MR

---

## Dependencies

- Phase 1 blocks all others. Phase 2 blocks 3, 4 and 6. Phase 4 blocks 5. Phase 6 needs 2–5.
- Within a phase, a RED task precedes its GREEN task; `[P]` tasks may run beside their neighbours.
- MVP = Phases 1–3 (US1 + US2): shippable alone because an absent preference row means "both on".

## Requirement → test

| Requirement | Test(s) |
| --- | --- |
| FR-001 | T017, T019 |
| FR-002 | T001 (defaults via manifest), T015 (fresh install notifies) |
| FR-003 | T010, T015 |
| FR-004 | T017 |
| FR-005 | T019, T026 |
| FR-006 | T015 (admin send unaffected with category off — add one case) |
| FR-007 | T010, T015 |
| FR-008 | T010, T015 (`rfq.created.v1` negative) |
| FR-009 | T015 |
| FR-010 | T008, T015 |
| FR-011 | T004, T008, T015 |
| FR-012 | T008, T015 |
| FR-013 | T008, T015 |
| FR-014 | T015 |
| FR-015 | T012 |
| FR-016 | T010 |
| FR-017 | T026, T031 |
| FR-018 | T024, T026 |
| FR-019 | T028 |
| FR-020 | T026, T031 |
| FR-021 | T033 (`pwa-push-release.test.tsx` stays green) |
| FR-022 | T024, T026 |
| FR-023 | T030 (`tsc` totality), T033 |
| FR-024 | T034 |
| FR-025 | T034 |
| SC-001 | T015 |
| SC-002 | T010, T028 |
| SC-003 | T008, T041 (`check:bundle-pairing`, `check:default-language-prose`) |
| SC-004 | T008 |
| SC-005 | T042 (manual walk) |
| SC-006 | T034 |
