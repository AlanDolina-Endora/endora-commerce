# Tasks: Saved list views (`specs/147-saved-views/`)

**Input**: [spec.md](./spec.md) (clarified 2026-10-14), [plan.md](./plan.md),
[research.md](./research.md), [data-model.md](./data-model.md),
[contracts/saved-list-views-api.md](./contracts/saved-list-views-api.md),
[contracts/admin-kit-saved-views.md](./contracts/admin-kit-saved-views.md),
[quickstart.md](./quickstart.md).

**Organisation**: ten phases, each ≤ 10 tasks and **independently committable** on
`feat/147-saved-views` (`git commit -s`, no AI trailer). Each phase ends with a **Verification**
line: the exact targeted commands for that phase, run serially. Phases are marked **[backend]**,
**[admin UI]**, **[docs]** or **[gate]** so UI phases can be routed to `endora-commerce-designer`.

## Format

`- [ ] T### [P?] [US?] Description — path(s)`

- **[P]** — may run in parallel with its neighbours (different files, no dependency on an
  unfinished task).
- **[US1] [US2] [US3]** — the story served; none = shared by every story.
- **RED** — the deliverable is a failing test. Run it and see it fail **for the reason named**
  before starting the task that turns it green (Constitution III).

## Standing rules for every task

1. **Rebuild what you edit.** Tests read each package's `dist`; `tsc` reads sources. After
   editing anything under `packages/`, run `pnpm --filter <package> run build` before a test
   that imports it (`@endora-commerce/contracts`, `@endora-commerce/admin-kit`,
   `@endora-commerce/mod-orders`, `@endora-commerce/mod-catalog`,
   `@endora-commerce/mod-quote-requests`, `@endora-commerce/mod-crm`, `@endora-commerce/mod-i18n`).
2. **Admin component tests render inside `<StrictMode>`** — wrap the element passed to
   `renderWithI18n` (`admin/test/helpers/render-with-i18n.tsx` does not add it). A `useRef`
   "alive" flag set only in a cleanup hangs the dialog in StrictMode; set it in the effect body
   (contract `admin-kit-saved-views.md` §1).
3. **Never put a test next to a module's `src/manifest.ts`** — `manifests:check` rejects
   manifest neighbours. Module unit tests go under `src/backend/` beside their subject; admin
   tests go under `admin/test/`; server-bound tests under `backend/test/{contract,integration}/`.
4. **Paths in `pnpm --filter backend …` commands resolve from `backend/`** — a module source is
   `../packages/modules/<id>/src/…`.
5. **Services for contract/integration tests.** Run from `backend/`, with
   `TEST_DATABASE_URL=postgresql://b2b:b2b@localhost:5432/b2b_test REDIS_URL=redis://localhost:6380 MEILISEARCH_URL=http://localhost:7700 MEILISEARCH_API_KEY=devMasterKeyChangeMe`
   — written below as `$SVC`; define it once per shell with
   `export SVC="TEST_DATABASE_URL=postgresql://b2b:b2b@localhost:5432/b2b_test REDIS_URL=redis://localhost:6380 MEILISEARCH_URL=http://localhost:7700 MEILISEARCH_API_KEY=devMasterKeyChangeMe"`
   and run a command as `(cd backend && env $SVC pnpm exec vitest run <file>)`. A unit test without services:
   `pnpm --filter backend exec vitest run --config vitest.unit.config.ts <file>`.
6. **Extra admins in a contract test** get **their own** stub session ids in
   `backend/test/helpers/test-actors.ts` (`ADMIN_COOKIES`) and their roles/users are created by
   the test file itself — the precedent documented there; never reuse another file's ids.
7. **Saved-view writes are not Commands** (spec *Assumptions*, research R-14): every
   EntityManager `create` / `persist*` / `remove*` / `flush` in a saved-view service carries the
   `// command-coverage-ignore: per-admin saved list preset — personal UI configuration, not a
   domain mutation` comment, as `order-list-view-service.ts:36-38` does.
8. **A regenerated artefact is committed with its input** — `composer:generate` (registries,
   docs sidebars), `manifests:generate` + `pnpm install --lockfile-only` (package manifests,
   lockfile).
9. **The test database is shared across files in a run.** A list assertion checks membership by
   id (present / absent) and relative order of the rows the test created — never the list's
   length or exact equality of the whole list — so another file's shared views cannot redden it.
   **Every view name a contract or integration test writes carries a per-run unique suffix**
   (e.g. `` `Unpaid EU ${randomUUID().slice(0, 8)}` ``): several files act as the shared
   `TEST_ADMIN_ID`, and with FR-022's 409 a fixed name collides with another file's leftover row.
10. **Deleting a file?** `grep -rn` its name across `backend/test`, `admin/test`, `docs/` and
   `backend/scripts/ledgers` before committing (`AGENTS.md`, traps).

---

## Phase 1: Shared contracts **[backend]**

**Goal**: the shapes and the name rule every list uses (research R-9, R-10; contract §1).

- [x] T001 [P] **RED** Unit test `packages/contracts/src/saved-list-views.test.ts`: `savedListViewNameSchema` trims (`'  a  '` → `'a'`), rejects `''`, `'   '` and 161 characters, accepts exactly 160; rejects a name containing a control or format character (`'a\u0000b'`, `'a\u202Eb'`, `'a\u200Bb'` — `/[\p{Cc}\p{Cf}]/u`, S-06) and accepts Polish letters and emoji; `SAVED_LIST_VIEW_NAME_MAX === 160`; **bounds (S-05)** on every create/update schema: `filters` whose `JSON.stringify` exceeds `SAVED_LIST_VIEW_FILTERS_MAX_BYTES` (8192, UTF-8 bytes) rejected and one just under accepted, `visibleColumns` of 65 entries or with a 65-character entry rejected (64 / 64 accepted), `sort.field` of 65 characters rejected; `savedListViewNameKey(' Unpaid EU ') === savedListViewNameKey('unpaid eu')`; `savedListViewSchema` accepts an item without `sort`/`visibleColumns` and with them `null`, and requires `ownedByCaller` and `canModify`; `createProductSavedViewRequestSchema` strips `sort`/`visibleColumns`; `createQuoteRequestSavedViewRequestSchema` keeps them; both `update…` schemas are partial. Fails: module does not exist
- [x] T002 Implement `packages/contracts/src/saved-list-views.ts` exactly as contract §1 (schemas with the S-05 bounds and the S-06 character rule, response envelopes, `SAVED_LIST_VIEW_NAME_MAX`, `SAVED_LIST_VIEW_FILTERS_MAX_BYTES`, `hasForbiddenNameCharacters`, `savedListViewNameKey`, product and quote-request create/update schemas) and export it from `packages/contracts/src/index.ts`; T001 green
- [x] T003 [P] **RED** Extend `packages/contracts/src/orders.test.ts`: `createOrderSavedViewRequestSchema` trims and rejects a whitespace-only name and 161 characters; `orderSavedViewSchema` requires `ownedByCaller` and `canModify` and still requires a non-null `sort`; `updateOrderSavedViewRequestSchema` trims a supplied `name`; the orders create/update schemas apply the same S-05 bounds and S-06 rule as the shared ones. Fails: today's schema neither trims nor knows the flags
- [x] T004 Rebuild the orders saved-view schemas in `packages/contracts/src/orders.ts:595-624` on `savedListViewNameSchema`, `savedListViewSortSchema` and `savedListViewSchema` (keeping every exported name and `sort` non-null on the orders response); T003 green; `grep -rn "orderSavedViewSchema\|OrderSavedView\b" packages backend admin --include=*.ts --include=*.tsx | grep -v /dist/` shows no consumer broken (`serializeSavedView` in `orders/src/backend/routes.ts` returns `Record<string, unknown>`)
- [x] T005 Changeset `.changeset/saved-list-views-contracts.md` — `'@endora-commerce/contracts': minor`: the new `saved-list-views` exports, the two flags on `orderSavedViewSchema`, and that order saved-view names are now trimmed, may not be whitespace-only or contain control/format characters, and that `filters` (≤ 8 KB), `visibleColumns` (≤ 64 × 64) and `sort.field` (≤ 64) are bounded (`specs/conventions/release-intent.md`)

**Verification**: `pnpm --filter @endora-commerce/contracts exec vitest run src/saved-list-views.test.ts src/orders.test.ts && pnpm --filter @endora-commerce/contracts run typecheck && pnpm --filter @endora-commerce/contracts run lint && pnpm --filter @endora-commerce/contracts run build && pnpm --filter @endora-commerce/mod-orders run typecheck`

---

## Phase 2: Kit — `ModalDialog` promotion and `SavedViewsControl` **[admin UI]**

**Goal**: the two design-system dialogs and the composite every list mounts (research R-2, R-3,
R-4, R-8, R-13, R-15; contract `admin-kit-saved-views.md`). Serves US1 first; US2 and US3 reuse it.

- [x] T006 Add `axe-core` to `admin/package.json` `devDependencies` at the version already in `pnpm-lock.yaml` (`4.13.0`), run `pnpm install --lockfile-only` and commit `pnpm-lock.yaml`; add `admin/test/helpers/axe.ts` exporting `expectNoAxeViolations(container: Element)` that runs `axe.run` with `runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] }` and the `color-contrast` rule disabled (jsdom cannot compute it — research R-13), failing with the violation ids and targets
- [x] T007 [P] **RED** `admin/test/components/ModalDialog.test.tsx`, every render in `<StrictMode>`, importing `ModalDialog` from `@endora-commerce/admin-kit/components`: `role="dialog"` named by its title; focus moves to `initialFocusRef` when given, else to the first focusable; Tab and Shift+Tab cycle inside; Escape, and a `mousedown` on the scrim, call `onClose`; neither does while `busy` (and `aria-busy="true"`); on unmount focus returns to the opener, or to `finalFocusRef` when given; `expectNoAxeViolations` on the open dialog. Fails: not exported from the kit
- [x] T008 Move `packages/modules/crm/src/admin/components/ModalDialog.tsx` to `packages/admin-kit/src/components/modal-dialog/ModalDialog.tsx`, add the optional `initialFocusRef` and `finalFocusRef` props (contract §1; defaults keep today's behaviour), export `ModalDialog` and `ModalDialogProps` from `packages/admin-kit/src/components/index.ts`; re-point `crm`'s eight importers (`EventDialog.tsx`, `CommentThread.tsx`, `pages/workflow/StatusDialog.tsx`, `pages/TagsPage.tsx`, `pages/WorkflowConfigPage.tsx`, `pages/OpportunityDetail.tsx`, `pages/opportunity-detail/tabs/EventsTab.tsx`, `…/tabs/AttachmentsTab.tsx`) to `@endora-commerce/admin-kit/components`; delete the module file and grep for its old path (standing rule 10) — measured at `62eee1ea8`: no test, ledger or script reads `crm/src/admin/components/ModalDialog.tsx` by path (the `admin/test/modules/crm/*` hits import sibling components, not this file); re-run the grep, and if one appears, update it in this commit; rebuild `admin-kit` and `mod-crm`; T007 green
- [x] T009 [P] Add the eighteen `savedViews.*` keys of contract §4 to `packages/modules/_i18n/i18n/en.json` and `pl.json` (keep `orders.views.*` until Phase 4 — `OrderSavedViews.tsx` still reads them)
- [x] T010 [P] [US1] **RED** `admin/test/components/SavedViewsControl.test.tsx` (StrictMode; `apiClient` mocked through `@endora-commerce/admin-kit/lib` as `admin/test/modules/orders/OrdersList.test.tsx:17-32` does; `window.prompt`/`confirm`/`alert` spied): the selector lists the GET response with a shared view's option text ending in the `savedViews.sharedSuffix` copy; choosing a view calls `onApply` with `{ filters, sort ?? null, visibleColumns ?? null }`; **save dialog** — opens with the name field focused and *Share* unchecked (US1-1); empty/whitespace → inline `nameRequired`, `aria-invalid`, `role="alert"`, no POST (US1-3); 161 chars → `nameTooLong` with 160, no POST (US1-4); a name containing `\u202E` → inline `nameInvalidCharacters`, no POST (S-06); ` unpaid eu ` against an `ownedByCaller` view `Unpaid EU` → `nameTaken`, no POST (US1-5), but allowed against a colleague's shared view of that name (US1-6); Enter submits a trimmed name, `shared`, and `current`'s state, then closes, reloads and returns focus to *Save view* (US1-2); 409 / 500 → envelope message inside the dialog, input and checkbox kept (US1-7, US1-10); while pending, Escape and scrim do nothing, submit disabled, a second submit sends nothing (US1-9); Escape / *Cancel* / scrim close without a request and focus returns (US1-8); Tab stays inside (US1-11); accessible names of both buttons come from `savedViews.save` / `savedViews.delete` (US1-13); the whole flow rendered with a Polish bundle shows the Polish copy (US1-12); views named `<b>x</b>`, `a & b`, `x > y` and `<img src=x onerror=alert(1)>` render as **literal text** in the selector options and in the save dialog's duplicate-name feedback — `textContent` equals the name, no `img`/`b` element is created, the `alert` spy is never called (S-10); no `PATCH` is ever sent; the three native dialogs are never called; `expectNoAxeViolations` on the open save dialog. Fails: component does not exist
- [x] T011 [P] [US1] **RED** `admin/test/components/SavedViewsControl.delete.test.tsx` (StrictMode, same mocks): *Delete view* disabled with no selection and for a selected view with `canModify: false`, enabled with `canModify: true` (FR-014); the confirmation names the view and, for a shared view only, shows `sharedWarning` (US1-14); Escape / *Cancel* / scrim keep the view and return focus to *Delete view* (US1-15); confirm sends `DELETE {endpoint}/{id}`, clears the selection, does not call `onApply`, reloads, focus lands on the selector (US1-16); a 404 shows `savedViews.error.gone` and reloads; a view named `<img src=x onerror=alert(1)>` is named in the confirmation as literal text — no `img` element, `alert` never called (S-10); busy state as in T010; `expectNoAxeViolations` on the open confirmation. Plus `admin/test/components/saved-views-no-native-dialogs.test.ts`: reads every file under `packages/admin-kit/src/components/saved-views/` and `…/modal-dialog/` and asserts none matches `/window\.(prompt|confirm|alert)\b|\b(prompt|confirm|alert)\(/` (SC-001). Fails: component does not exist
- [x] T012 Implement `packages/admin-kit/src/components/saved-views/` — `saved-views-api.ts` (list/create/delete over the kit's `apiClient` and the contract types), `SaveViewDialog.tsx`, `DeleteViewDialog.tsx` (both on `ModalDialog`, internal), `SavedViewsControl.tsx` — to contract §2, reading only `useTranslation('core')`; export `SavedViewsControl`, `SavedViewsControlProps`, `SavedViewState` from the components barrel; rebuild `admin-kit`; T010 and T011 green
- [x] T013 Add `ModalDialog` and `SavedViewsControl` to the `./components` row of `packages/admin-kit/README.md`; changeset `.changeset/admin-kit-modal-dialog-saved-views.md` — `'@endora-commerce/admin-kit': minor` (two new exports, the two new `ModalDialog` props), `'@endora-commerce/mod-crm': patch` (imports the kit's dialog; no behaviour change), `'@endora-commerce/mod-i18n': minor` (the `savedViews.*` keys)

**Verification**: `pnpm --filter @endora-commerce/admin-kit run build && pnpm --filter @endora-commerce/mod-crm run build && pnpm --filter @endora-commerce/mod-i18n run build && pnpm --filter admin exec vitest run test/components/ModalDialog.test.tsx test/components/SavedViewsControl.test.tsx test/components/SavedViewsControl.delete.test.tsx test/components/saved-views-no-native-dialogs.test.ts test/modules/crm && pnpm --filter @endora-commerce/admin-kit run typecheck && pnpm --filter @endora-commerce/admin-kit run lint && pnpm --filter @endora-commerce/mod-crm run typecheck && pnpm --filter @endora-commerce/mod-crm run lint && pnpm --filter admin run typecheck && pnpm --filter backend run check:admin-surface && pnpm --filter backend run i18n:hardcoded && pnpm --filter backend run check:bundle-pairing && pnpm --filter backend run manifests:check && pnpm install --frozen-lockfile`

---

## Phase 3: Orders backend — trimming, the duplicate rule, the flags, the parity test **[backend]**

**Goal**: `orders`' API meets FR-003, FR-013, FR-014 (flags), FR-022 without a schema change
(research R-5 – R-8, R-12; contract §2 – §4).

- [x] T014 [US1] **RED** `backend/test/integration/saved-list-views/rules-parity.test.ts` — a scenario table run against each list's service through one adapter `{ label, make(emFactory), seedRaw(row) }`; this phase supplies the **orders** row (`OrderListViewService` from `../../../../packages/modules/orders/src/backend/services/order-list-view-service.js`) over the harness's EntityManager (`setupBackendServer()`, as `backend/test/integration/quote_requests/off-state.test.ts` does). Scenarios, with actors `{ adminUserId, isPlatformAdmin }`: (S1) `listFor` = own ∪ shared, ordered by name; (S2) another admin's private view is absent from the list and `update`/`remove` reject with 404; (S3) a shared view, caller neither owner nor platform admin → 403 on both; (S4) a platform admin updates and removes another admin's shared view; (S5) `ownedByCaller`/`canModify` per caller for each combination; (S6) `create` with a name whose key the same owner uses → 409 with the list's `*_SAVED_VIEW_NAME_TAKEN`, the same name for another owner succeeds; (S7) `update` renaming to a taken key → 409, and a platform admin's rename is judged against the **owner's** names; (S8) `update` of `shared` on a row that already shares a key with a sibling (rows inserted raw) succeeds; (S9) names are stored trimmed; (S10) two concurrent `create`s with one key → exactly one row and one 409; (S10b, S-04) a platform admin's `update` renaming the owner's shared view to key K, run concurrently with the **owner's** `create` of a view named K → exactly one succeeds and the other gets 409, proving the lock and the probe are keyed on the **view owner's** id, not the caller's; (S12, S-11) with a spy logger passed to the service: an `update` and a `remove` by a platform admin on another owner's view each emit exactly one `info` record `{ event: 'saved_view.updated' | 'saved_view.deleted', list, viewId, ownerAdminUserId, actorAdminUserId }`, and the owner's own `update`/`remove` emit none; (S11) a view created through one list's service is not listed by another's (activates once a second row exists). Fails: no trimming, no conflict, no flags, old signature
- [x] T015 [P] [US1] **RED** Extend `backend/test/contract/orders/list-and-views.test.ts`: `POST` trims; whitespace-only and 161 chars → 400 `VALIDATION_FAILED`; a second `POST` with ` eu unpaid ` by the same admin → 409 `ORDER_SAVED_VIEW_NAME_TAKEN` whose `error.message` is the `orders` bundle's English sentence, and the Polish one after setting the admin's preferred language to `pl` (pattern: `backend/test/integration/_i18n/error-code-ownership.test.ts:66-80`); `PATCH` renaming to a taken key → 409; `GET` items carry `ownedByCaller: true, canModify: true` for the owner; a second admin (own stub session, `sales_representative` role holding `orders:read`) sees a shared view with `ownedByCaller: false, canModify: false`, gets 403 on its `DELETE` and 404 on another admin's private view; an admin without `orders:read` gets 403 on all four routes (FR-015); a request with no admin actor gets 401 on all four and no row with an empty owner id is written (S-03 — today `resolveAdminUserId(request) ?? ''`); a body over the S-05 bounds or a name with `\u202E` → 400 `VALIDATION_FAILED`. **Fails on** the 409, the flags and the non-owner cases; the trim and 400 cases already pass once Phase 1's contract is rebuilt, because the route parses with `createOrderSavedViewRequestSchema` (`routes.ts:719`) — they are kept as regression cover
- [x] T016 Error code `ORDER_SAVED_VIEW_NAME_TAKEN` (contract §3): member of `ERROR_CODES` in `packages/contracts/src/errors.ts`; `{ code: 'ORDER_SAVED_VIEW_NAME_TAKEN' }` in `packages/modules/orders/src/manifest.ts` `errorCodes`; an entry in `MINTED_ERROR_CODES` in `backend/test/fixtures/error-code-routing/reference-ledgers.ts` (`to: 'orders'`, reason naming `order-list-view-service.ts` as the one raise site); `errors.ORDER_SAVED_VIEW_NAME_TAKEN` in `packages/modules/orders/i18n/en.json` and `pl.json`; rebuild `contracts`
- [x] T017 Rewrite `packages/modules/orders/src/backend/services/order-list-view-service.ts` to the uniform shape (`listFor(actor)`, `create(actor, input)`, `update(id, actor, patch)`, `remove(id, actor)` with `actor = { adminUserId, isPlatformAdmin }`, returning `SavedListView` DTOs with `ownedByCaller`/`canModify`): trimmed names; `create` and a key-changing `update` inside `em.transactional` with `pg_advisory_xact_lock(hashtextextended('order_list_saved_views:' || <view owner id>, 0))` and the `lower(btrim(name))` probe for the **view owner** (on `update` the stored row's `ownerAdminUserId`, never the caller's — S-04), lock, probe and write all via the transaction's `execute`/EntityManager (research R-5; `check:transaction-context`); when the actor is not the owner on `update`/`remove`, one `info` log record per research R-18 through a constructor-injected `log: { info(obj: object, msg: string): void }` supplied from the module's logger in `plugin.ts` (S-11); 409 `ORDER_SAVED_VIEW_NAME_TAKEN`; existing 404/403 rules unchanged; `command-coverage-ignore` comments kept on every write (standing rule 7); T014's orders row green
- [x] T018 Update the four routes in `packages/modules/orders/src/backend/routes.ts:708-750`: build the actor from `resolveAdminUserId` and the existing `isPlatformAdmin(request)` (now on `GET` too), **failing closed** — replace the four `resolveAdminUserId(request) ?? ''` fallbacks (`:710`, `:720`, `:732`, `:747`) with a 401 `UNAUTHORIZED` when no admin actor resolves (S-03); parse bodies with the rebuilt contract schemas; serialize the DTO (delete or simplify `serializeSavedView`, `:1290-1308`); rebuild `mod-orders`; T015 green
- [x] T019 Run `pnpm --filter backend run check:error-translations`, `check:command-coverage -- --strict` and `check:transaction-context`; fix what they report in the files above
- [x] T020a Run `pnpm --filter backend exec vitest run test/contract/kernel/openapi-baseline.test.ts` (with `$SVC`, from `backend/`). The fixture records only paths, methods and the `200` description for `/api/v1/admin/orders/list-views` (`backend/test/fixtures/openapi-baseline.json:3905-3936`), so this phase is expected to leave it **unchanged**. If it reds, regenerate with `UPDATE_OPENAPI_BASELINE=1` (same command) and accept the diff only if it touches nothing but the two `…/orders/list-views` entries; anything else is a defect to fix, not to record (the test's header rule)
- [x] T020 Changeset `.changeset/orders-saved-view-names.md` — `'@endora-commerce/mod-orders': minor`, its body opening with **"Behaviour change for API clients"**: saved-view names are trimmed, an admin cannot hold two views whose names differ only by case or surrounding spaces (`409 ORDER_SAVED_VIEW_NAME_TAKEN`; existing duplicates are kept), and list items carry `ownedByCaller` and `canModify`

**Verification**: `pnpm --filter @endora-commerce/contracts run build && pnpm --filter @endora-commerce/mod-orders run build && (cd backend && env $SVC pnpm exec vitest run test/integration/saved-list-views/rules-parity.test.ts test/contract/orders/list-and-views.test.ts test/unit/_i18n) && pnpm --filter @endora-commerce/mod-orders run typecheck && pnpm --filter @endora-commerce/mod-orders run lint && pnpm --filter backend run typecheck && pnpm --filter backend run check:error-translations && pnpm --filter backend run check:command-coverage -- --strict && pnpm --filter backend run check:transaction-context && (cd backend && env $SVC pnpm exec vitest run test/contract/kernel/openapi-baseline.test.ts)`

---

## Phase 4: Order list on the kit control — closes #288 **[admin UI]**

**Goal**: US1 end to end; the native `prompt()`/`confirm()` pair is gone.

- [x] T021 [US1] **RED** `admin/test/modules/orders/OrdersList.saved-views.test.tsx` (StrictMode; `apiClient` mocked as in `OrdersList.test.tsx`): the page mounts `SavedViewsControl` against `/api/v1/admin/orders/list-views`; saving after setting a status filter, a sort and columns posts exactly `currentView`'s filters, `sort` and `visibleColumns`; loading a view applies `applyView` — filters, sort and columns replaced, unknown column ids dropped, empty columns → defaults (FR-011, FR-012); **a view whose `sort` is `null` or absent loads the default sort** (`placedAt:desc`) instead of throwing — `applyView` reads `view.sort.field` unguarded today (`OrdersList.tsx:319`) and the kit hands it `sort ?? null`; no native dialog is called at any point (FR-001). Fails: the page still mounts `OrderSavedViews`
- [x] T022 [US1] In `packages/modules/orders/src/admin/pages/OrdersList.tsx:648` replace `<OrderSavedViews …/>` with `<SavedViewsControl endpoint="/api/v1/admin/orders/list-views" current={currentView} onApply={applyView} onError={setError} />` (import from `@endora-commerce/admin-kit/components`; `SavedViewState` replaces the local type) and guard `applyView`'s sort read (fall back to the default sort when `view.sort` is null); delete `packages/modules/orders/src/admin/components/OrderSavedViews.tsx` and, **in the same commit**, remove its entry `'orders/src/admin/components/OrderSavedViews.tsx'` from the file list in `admin/test/modules/batch-fifteen-surfaces.module-owned-surface.test.tsx:939` (it `readFileSync`s every listed path); then grep for any other reader (standing rule 10); rebuild `mod-orders`; T021 green
- [x] T023 [P] [US1] Delete `orders.views.label`, `orders.views.namePrompt`, `orders.views.none`, `orders.views.sharedPrompt` from `packages/modules/_i18n/i18n/en.json` and `pl.json`; `grep -rn "orders\.views\." packages admin backend --include=*.ts --include=*.tsx --include=*.json | grep -v /dist/` answers nothing
- [x] T024 [US1] Run the existing `admin/test/modules/orders/OrdersList*.test.tsx`; where a mock's `get` does not answer `/api/v1/admin/orders/list-views` with `{ data: [] }`, add it (the control now reads it on mount); no assertion is weakened
- [x] T025 Changeset `.changeset/orders-saved-views-dialogs.md` — `'@endora-commerce/mod-orders': minor` (#288: saving a view opens one in-app dialog for name and sharing, deleting asks for confirmation, both keyboard-operable and translated; a shared view is announced as shared), `'@endora-commerce/mod-i18n': patch` (the four `orders.views.*` keys removed)

**Verification**: `pnpm --filter @endora-commerce/mod-i18n run build && pnpm --filter @endora-commerce/mod-orders run build && pnpm --filter admin exec vitest run test/modules/orders test/components/SavedViewsControl.test.tsx test/modules/batch-fifteen-surfaces.module-owned-surface.test.tsx && pnpm --filter @endora-commerce/mod-orders run typecheck && pnpm --filter @endora-commerce/mod-orders run lint && pnpm --filter admin run typecheck && pnpm --filter backend run i18n:hardcoded && pnpm --filter backend run check:admin-surface && pnpm --filter backend run manifests:check`

---

## Phase 5: Catalog backend **[backend]**

**Goal**: `product_list_saved_views` and its four routes (data-model; contract §2; research R-7,
R-11).

- [x] T026 [P] [US2] **RED** `backend/test/contract/catalog/product-list-views.test.ts` (own stub sessions per standing rule 6: a role with `catalog:read` only; a `sales_representative` role holding `catalog:read`; an admin with neither): the platform admin's `POST` → 201 with a trimmed name, `GET` lists it with both flags true, `DELETE` → 200; the `catalog:read`-only admin saves, lists and deletes **its own** private and shared views (US2-4); the admin without `catalog:read` → 403 on all four (FR-015); ` X ` twice by one owner → 409 `PRODUCT_SAVED_VIEW_NAME_TAKEN` with the `catalog` bundle's sentence; whitespace-only / 161 → 400; the sales representative sees the catalog-reader's shared view with `canModify: false` and gets 403 on `DELETE`, while the platform admin's `DELETE` of it → 200 (US2-6); another admin's private view → 404; `GET /api/v1/admin/catalog/products/list-views` answers the views envelope and not a product 404 (route precedence); a `sort` or `visibleColumns` in the body is not echoed back. Per research R-7 and the spec's *Vocabulary* ("Platform admin (for saved views)" = any role except `sales_representative`, owner ruling A): the `catalog:read`-only admin, whose role is a custom non-`sales_representative` role, sees **another** admin's shared view with `ownedByCaller: false, canModify: true` and its `DELETE` → 200. A request with no admin actor (anonymous, or a customer session) → 401 on all four routes, never a write under an empty owner id (S-03). Fails: routes do not exist
- [x] T027 [P] [US2] **RED** Add the **catalog** row to `backend/test/integration/saved-list-views/rules-parity.test.ts` (`ProductListViewService`), activating S11 between orders and catalog. Fails: service does not exist
- [x] T028 [US2] Scaffold `pnpm --filter backend run migration:new -- --module catalog --name product_list_saved_views` and write `up`/`down` per data-model (table, unique expression index `product_list_saved_views_owner_name_key_uq` on `(owner_admin_user_id, lower(name))`, `filters jsonb not null default '{}'::jsonb`; `down` drops the table); do not hand-pick a timestamp
- [x] T029 [US2] Entity `packages/modules/catalog/src/backend/entities/product-list-saved-view.entity.ts` (`@GlobalEntity()`, `@Entity({ tableName: 'product_list_saved_views' })`, the data-model columns) and add `ProductListSavedView` to the `entities` array in `packages/modules/catalog/src/backend/index.ts` (no named class export, D-168); run `pnpm --filter backend run composer:generate` and commit the regenerated registries
- [x] T030 [US2] Error code `PRODUCT_SAVED_VIEW_NAME_TAKEN` exactly as T016, for `catalog` (`ERROR_CODES`; `packages/modules/catalog/src/manifest.ts` `errorCodes`; `MINTED_ERROR_CODES` `to: 'catalog'`; `errors.PRODUCT_SAVED_VIEW_NAME_TAKEN` in `packages/modules/catalog/i18n/en.json`, `pl.json`)
- [x] T031 [US2] Service `packages/modules/catalog/src/backend/services/product-list-view-service.ts` with the uniform shape of T017 (lock key prefix `product_list_saved_views:` keyed on the view owner (S-04); actor-≠-owner `info` log (S-11); a unique-violation from the index also maps to 409; `command-coverage-ignore` on every write); T027 green
- [x] T032 [US2] Routes in `packages/modules/catalog/src/backend/routes.admin.ts` (`GET`/`POST …/products/list-views`, `PATCH`/`DELETE …/:id`, `requireAdmin('catalog:read')`, contract schemas), actor from `getTenantContext()` (`@endora-commerce/platform/tenancy`): `adminUserId = ctx.actor.id` when `ctx.actor.kind === 'admin'` and **401 `UNAUTHORIZED` otherwise — no empty-string fallback** (S-03), `isPlatformAdmin = ctx.mode === 'all'` (research R-7); construct the service in `packages/modules/catalog/src/backend/plugin.ts` beside `ProductEditorPreferencesService` (`:458`) and pass it in the route deps; rebuild `mod-catalog`; T026 green
- [x] T033 Run `pnpm --filter backend run manifests:generate` and `pnpm install --lockfile-only`; commit any change to `packages/modules/catalog/package.json` and `pnpm-lock.yaml` (none is expected — no new import specifier family)
- [x] T034 [P] Run `pnpm --filter backend exec tsx scripts/check-entity-tenant-classification.ts`, `check:error-translations`, `check:command-coverage -- --strict`, `check:transaction-context`, `check:module-boundary`; fix what they report in the files above
- [x] T034a [US2] API surface: `UPDATE_OPENAPI_BASELINE=1 pnpm --filter backend exec vitest run test/contract/kernel/openapi-baseline.test.ts` (with `$SVC`, from `backend/`); review the diff of `backend/test/fixtures/openapi-baseline.json` — **additions only**, exactly the two paths under `/api/v1/admin/catalog/products/list-views` (four methods), no change to any existing path, parameter or schema (the test header's rule); commit the fixture; re-run without the variable, green
- [x] T035 Changeset `.changeset/catalog-product-list-saved-views.md` — `'@endora-commerce/mod-catalog': minor`: the four `…/catalog/products/list-views` routes, gated by `catalog:read`, the `product_list_saved_views` table, `PRODUCT_SAVED_VIEW_NAME_TAKEN` (completed in T039)

**Verification**: `pnpm --filter @endora-commerce/contracts run build && pnpm --filter @endora-commerce/mod-catalog run build && (cd backend && env $SVC pnpm exec vitest run test/contract/catalog/product-list-views.test.ts test/integration/saved-list-views/rules-parity.test.ts test/unit/db/migrations-registry.test.ts test/unit/_i18n) && pnpm --filter @endora-commerce/mod-catalog run typecheck && pnpm --filter @endora-commerce/mod-catalog run lint && pnpm --filter backend run typecheck && pnpm --filter backend exec tsx scripts/check-entity-tenant-classification.ts && pnpm --filter backend run check:error-translations && pnpm --filter backend run check:command-coverage -- --strict && pnpm --filter backend run check:transaction-context && pnpm --filter backend run check:module-boundary && pnpm --filter backend run overlay:check && pnpm --filter backend run manifests:check && (cd backend && env $SVC pnpm exec vitest run test/contract/kernel/openapi-baseline.test.ts)`

---

## Phase 6: Product list saved views — closes #289 **[admin UI]**

**Goal**: US2 end to end.

- [x] T036 [US2] **RED** `admin/test/modules/catalog/ProductsList.saved-views.test.tsx` (StrictMode; `apiClient` mocked as in `admin/test/modules/catalog/ProductsList.test.tsx`): the control is mounted against `/api/v1/admin/catalog/products/list-views` for an admin holding only `catalog:read` (US2-4); with status *Draft*, type *Configurable*, search `chair` and Stock *Low*, saving posts `filters` `{ status: 'draft', type: 'configurable', q: 'chair' }` and nothing for stock (US2-1, US2-2, FR-010); loading a view replaces status, type and search, returns Stock to *All*, and the next list request carries `page=0` (US2-3, FR-011); loading after selecting rows clears the selection (US2-5); a view with `status: 'archived'`, `type: 'kit'` and an unknown key loads as *All*/*All* without error (FR-012). Fails: no control on the page
- [x] T037 [US2] In `packages/modules/catalog/src/admin/pages/ProductsList.tsx` add `toSavedViewState()` (non-default `status`, `type`, trimmed `query` only) and `applySavedView(state)` (validate against `StatusFilter` / `TypeFilter`, else `'all'`; set `query` and `debouncedQuery`; `setStockFilter('all')`); mount `SavedViewsControl` in the toolbar; `applySavedView` **explicitly** calls `setPage(0)` and clears the selection and its error — the existing reset effects (`:157-169`) alone sent one request with the old page; rebuild `mod-catalog`; T036 green
- [x] T038 [US2] Run the existing `admin/test/modules/catalog/ProductsList*.test.tsx`; add `{ data: [] }` for the list-views `GET` where a mock lacks it; no assertion weakened
- [x] T039 Complete `.changeset/catalog-product-list-saved-views.md` with the admin half (#289: a named, private or shared view of status, type and search on the Product list)

**Verification**: `pnpm --filter @endora-commerce/mod-catalog run build && pnpm --filter admin exec vitest run test/modules/catalog && pnpm --filter @endora-commerce/mod-catalog run typecheck && pnpm --filter @endora-commerce/mod-catalog run lint && pnpm --filter admin run typecheck && pnpm --filter backend run i18n:hardcoded && pnpm --filter backend run check:admin-surface`

---

## Phase 7: Quote requests backend and off-state **[backend]**

**Goal**: `quote_request_list_saved_views`, its routes gated with the module, FR-016 and FR-018
proven (data-model; contract §2; research R-7, R-11, R-16).

- [x] T040 [P] [US3] **RED** `backend/test/contract/quote_requests/list-views.test.ts` (own stub sessions per standing rule 6: a `sales_representative` with `rfqs:handle`; an admin without it): create/list/delete with `sort` and `visibleColumns` round-tripped; 409 `RFQ_SAVED_VIEW_NAME_TAKEN` with the `quote_requests` bundle's sentence; whitespace-only / 161 → 400; the admin without `rfqs:handle` → 403 on all four, exactly as on `GET /api/v1/admin/quote-requests` (US3-6, FR-015); the sales representative sees the platform admin's shared view with `canModify: false`, 403 on `DELETE`; the platform admin's `DELETE` of the representative's shared view → 200; another admin's private view → 404; `GET …/quote-requests/list-views` answers the views envelope, not an RFQ 404. Per R-7 (as in T026): an admin with a custom non-`sales_representative` role holding `rfqs:handle` (own stub session) gets `canModify: true` on another admin's shared view and `DELETE` → 200. A request with no admin actor → 401 on all four routes (S-03). Fails: routes do not exist
- [x] T041 [P] [US3] **RED** In the same file, FR-016: seed requests in `TEST_ORGANIZATION_ID` and `OTHER_TEST_ORGANIZATION_ID` (`backend/test/helpers/test-actors.ts:23-25`), assign only the first to the representative; the platform admin saves a shared view `{ scope: 'all', organizationId: OTHER_TEST_ORGANIZATION_ID }`; the representative reads it back and replays its filters on `GET /api/v1/admin/quote-requests?assignmentScope=all&organizationId=…` → no row of the other organization (US3-4, US3-5); a view saved with `scope: 'mine'` replayed by the representative returns the representative's assignments, not the saver's (US3-3). **What holds FR-016 here:** the harness's `rfqAdminContextResolver` answers `isPlatformAdmin: … || true` (`backend/test/helpers/test-server.ts:2435`), so `RfqAdminService.listAll`'s own sales-rep narrowing is bypassed in this harness; the narrowing this test observes is the tenant guard — `QuoteRequest` is `@OrgScoped` and the representative's request runs in `allowed-set` mode through the `org` filter (`orgFilterCond()`). A failure here is therefore a **tenant-guard regression**, not a saved-views bug — say so in the test's comment. Seed the requests in both organizations under an explicit scope (`withSystemScope('test seed: …', …)` or `withOrgScope`), never on an unscoped EntityManager
- [x] T042 [P] [US3] **RED** Extend `backend/test/integration/quote_requests/off-state.test.ts`: add `{ url: '/api/v1/admin/quote-requests/list-views', cookies: admin }` to the existing `expectModuleAbsent` `routes`; add a case that creates a view, then inside `withModuleOff('quote_requests', 'deactivated', …)` asserts each of `GET` and `POST` on `/api/v1/admin/quote-requests/list-views` **and** `PATCH` and `DELETE` on `/api/v1/admin/quote-requests/list-views/<that view's id>` answers as `GET /api/v1/admin/quote-requests` does — four requests, four assertions (S-09) — and after it the view is listed unchanged (FR-018, US3-7). Do not create a second off-state file
- [x] T043 [P] [US3] **RED** Add the **quote_requests** row to `backend/test/integration/saved-list-views/rules-parity.test.ts` (`QuoteRequestListViewService`). Fails: service does not exist
- [x] T044 [US3] Scaffold `pnpm --filter backend run migration:new -- --module quote_requests --name quote_request_list_saved_views` (DDL per data-model, unique index `quote_request_list_saved_views_owner_name_key_uq`); entity `packages/modules/quote_requests/src/backend/entities/quote-request-list-saved-view.entity.ts` (`@GlobalEntity()`), added to `entities` in `packages/modules/quote_requests/src/backend/index.ts:600-606`; `pnpm --filter backend run composer:generate`; commit the registries
- [x] T045 [US3] Error code `RFQ_SAVED_VIEW_NAME_TAKEN` as T016, for `quote_requests` (`ERROR_CODES`; `packages/modules/quote_requests/src/manifest.ts:258` `errorCodes`; `MINTED_ERROR_CODES` `to: 'quote_requests'`; `errors.RFQ_SAVED_VIEW_NAME_TAKEN` in `packages/modules/quote_requests/i18n/en.json`, `pl.json`)
- [x] T046 [US3] Service `packages/modules/quote_requests/src/backend/services/quote-request-list-view-service.ts`, uniform shape (lock key prefix `quote_request_list_saved_views:` keyed on the view owner (S-04); actor-≠-owner `info` log (S-11); unique violation → 409; `command-coverage-ignore` on every write); T043 green
- [x] T047 [US3] Add the four routes **inside** `registerQuoteRequestsAdminRoutes` in `packages/modules/quote_requests/src/backend/routes.admin.ts`, behind the function's existing `guard` (`requireAdmin('rfqs:handle')`), actor from `getTenantContext()` as in T032 — **not** from `resolveAdminContext`, whose `isPlatformAdmin` is a different predicate (research R-7); add `listViewService` to `QuoteRequestsAdminDeps` and construct it in `packages/modules/quote_requests/src/backend/plugin.ts` beside the other services (`:136-137`); rebuild `mod-quote-requests`; T040, T041, T042 green
- [x] T048 Run `manifests:generate` and `pnpm install --lockfile-only`, commit any change; run `check-entity-tenant-classification.ts`, `check:error-translations`, `check:command-coverage -- --strict`, `check:transaction-context`, `check:module-boundary`, `check:off-state-coverage`; fix what they report
- [x] T048a [US3] API surface: as T034a, for `/api/v1/admin/quote-requests/list-views` — additions only, the two paths (four methods) under that prefix; commit the fixture; re-run green
- [x] T049 Changeset `.changeset/quote-requests-list-saved-views.md` — `'@endora-commerce/mod-quote-requests': minor`: the four `…/quote-requests/list-views` routes gated by `rfqs:handle` and by the module's presence, the table, `RFQ_SAVED_VIEW_NAME_TAKEN` (completed in T053)

**Verification**: `pnpm --filter @endora-commerce/contracts run build && pnpm --filter @endora-commerce/mod-quote-requests run build && (cd backend && env $SVC pnpm exec vitest run test/contract/quote_requests/list-views.test.ts test/integration/quote_requests/off-state.test.ts test/integration/saved-list-views/rules-parity.test.ts test/unit/db/migrations-registry.test.ts test/unit/_i18n) && pnpm --filter @endora-commerce/mod-quote-requests run typecheck && pnpm --filter @endora-commerce/mod-quote-requests run lint && pnpm --filter backend run typecheck && pnpm --filter backend exec tsx scripts/check-entity-tenant-classification.ts && pnpm --filter backend run check:error-translations && pnpm --filter backend run check:command-coverage -- --strict && pnpm --filter backend run check:transaction-context && pnpm --filter backend run check:module-boundary && pnpm --filter backend run check:off-state-coverage && pnpm --filter backend run overlay:check && pnpm --filter backend run manifests:check && (cd backend && env $SVC pnpm exec vitest run test/contract/kernel/openapi-baseline.test.ts)`

---

## Phase 8: Quote Request list saved views — closes #290 **[admin UI]**

**Goal**: US3 end to end.

- [x] T050 [US3] **RED** `admin/test/modules/quote_requests/RfqList.saved-views.test.tsx` (StrictMode; mocks as in `RfqList.mobile.test.tsx`): the control is mounted against `/api/v1/admin/quote-requests/list-views`; saving posts `filters` `{ scope, organizationId, status, q }`, `sort` `{ field, dir }` and `visibleColumns` (US3-1); loading replaces all six and the next list request carries the view's `assignmentScope` and `organizationId` (US3-2); unknown column ids and unknown statuses are dropped, empty columns → `DEFAULT_VISIBLE`, an unknown sort → `updatedAt:desc`, an absent scope → `all` for a platform admin and `mine` otherwise (FR-011, FR-012); with enough rows for two pages, move to page 2, load a view, and the table shows page 1 again (FR-011's first-page clause — the page's reset effect at `RfqList.tsx:148-150` must fire on a load); a view whose `organizationId` is in neither the rows nor the organization picker's results renders no organization name anywhere in the document, and the picker's own requests carry no name for it (FR-017). Fails: no control on the page
- [x] T051 [US3] In `packages/modules/quote_requests/src/admin/pages/RfqList.tsx` add `toSavedViewState()` and `applySavedView(state)` to data-model's table and mount `SavedViewsControl` in the toolbar beside the column picker; remove "saved views" from the omitted-affordances list in the header comment (`:8-19`); rebuild `mod-quote-requests`; T050 green
- [x] T052 [US3] Run the existing `admin/test/modules/quote_requests/*.test.tsx`; add `{ data: [] }` for the list-views `GET` where a mock lacks it; no assertion weakened
- [x] T053 Complete `.changeset/quote-requests-list-saved-views.md` with the admin half (#290: scope, organization, status, search, sort and columns saved as a private or shared view; loading one never widens what the loader sees)

**Verification**: `pnpm --filter @endora-commerce/mod-quote-requests run build && pnpm --filter admin exec vitest run test/modules/quote_requests && pnpm --filter @endora-commerce/mod-quote-requests run typecheck && pnpm --filter @endora-commerce/mod-quote-requests run lint && pnpm --filter admin run typecheck && pnpm --filter backend run i18n:hardcoded && pnpm --filter backend run check:admin-surface`

---

## Phase 9: Documentation, en + pl, and residue **[docs]**

**Goal**: FR-021 for both audiences; nothing derived from a moved or deleted file left stale.
Read `specs/conventions/module-documentation.md` and
`docs/docs/contributing/documentation-i18n.md` first.

- [x] T054 [P] [US1] `packages/modules/orders/docs/orders.md` — rewrite the saved-views passages (`:310`, `:353`): operator — the save dialog, private vs shared, the duplicate-name rule, who may delete, the delete confirmation; engineer — the four routes, the trimmed-name rule, `ORDER_SAVED_VIEW_NAME_TAKEN`, the two flags, and that existing duplicate names were kept
- [x] T055 [P] [US2] `packages/modules/catalog/docs/catalog.md` — a *Saved views* section: what is captured (status, type, search — not Stock, Category, Channel), private vs shared, duplicate rule, who may delete; engineer — routes, gate `catalog:read`, `product_list_saved_views`, `PRODUCT_SAVED_VIEW_NAME_TAKEN`. No relative link to a sibling module's page (rule 1a)
- [x] T056 [P] [US3] `packages/modules/quote_requests/docs/quote_requests.md` — the same, with the six captured parts, `mine` resolving against the loader, loading never widening visibility, `rfqs:handle`, the off-state (views kept), `quote_request_list_saved_views`, `RFQ_SAVED_VIEW_NAME_TAKEN`
- [x] T057 Polish: for each of the three pages update `docs/i18n/pl/docusaurus-plugin-content-docs/current/modules/<page>.md` and its cache entry in `docs/translation-cache/pl/` (`sourceHash` from `hashSourceBody()` in `backend/scripts/lib/docs-translation-cache.ts`, `content` = the Polish markdown)
- [x] T058 Run `pnpm --filter backend run composer:generate` then `pnpm --filter backend run check:docs-translations`; if it reports the generated module references (`generated:module-reference--orders`, `--catalog`, `--quote-requests`) stale because their error-code lists changed, refresh those cache entries as the guide's generated-reference section says
- [x] T059 [P] Residue sweep (`AGENTS.md`, traps): `grep -rn "OrderSavedViews\|crm/src/admin/components/ModalDialog\|orders\.views\." backend admin docs specs/conventions packages --include=*.ts --include=*.tsx --include=*.json --include=*.md | grep -v /dist/` answers nothing outside `specs/147-saved-views/`; confirm no ledger under `backend/scripts/ledgers/` (admin-surface, test-ownership shards, cross-module-imports) and no `backend/test/unit/kernel/module-removal.test.ts` entry names a moved or deleted path
- [x] T060 [P] Confirm `composer:generate` and `manifests:generate` leave no diff (`git status --short` clean after both) and that `pnpm install --frozen-lockfile` succeeds
- [x] T061 [P] Update `specs/147-saved-views/tasks.md` § *Requirement → test* if any test file or task id moved during implementation

**Verification**: `pnpm --filter backend run check:module-docs && pnpm --filter backend run check:docs-translations && pnpm --filter backend run check:doc-snippets && pnpm --filter backend run overlay:check && pnpm --filter docs run build && pnpm --filter backend run verify:docs-build`

---

## Phase 10: The CI gate, run locally **[gate]**

**Goal**: every job a pull request runs, plus the suites a merge-request pipeline does **not**
run (D-198), green on the branch tip. **One command at a time, in this order**; paste each
failure with its output. Do not re-record a read size unless a band refuses it, and then read
`specs/conventions/check-estate.md` first.

- [x] T062 Install and build: `pnpm install --frozen-lockfile && pnpm run build:packages`
- [x] T063 `quality` part 1: `pnpm -r run typecheck` then `pnpm -r run lint`
- [x] T064 `quality` part 2 — each line of `.github/workflows/quality.yml:109-153`, serially: `pnpm --filter backend exec tsx scripts/check-entity-tenant-classification.ts`; `pnpm --filter backend exec tsx scripts/check-channel-resolution.ts --enforce`; `pnpm --filter backend run` each of `check:command-coverage -- --strict`, `check:kernel-boundary`, `check:module-boundary`, `check:admin-surface`, `check:admin-zones`, `check:entry-scope`, `check:container-imports`, `check:port-dependencies`, `check:port-catches`, `check:port-shape`, `check:subscribe-seam`, `check:queue-names`, `check:transaction-context`, `check:singleton-identity`, `check:entry-presence`, `check:lock-claims`, `check:action-route-permissions`, `check:harness-teardown`, `check:fixture-substitution`, `check:shared-table-wipes`, `check:nul-bytes`, `check:diacritic-folds`, `check:doc-snippets`, `check:module-docs`, `check:docs-translations`, `check:error-translations`, `check:bundle-pairing`, `check:env-inputs`, `check:block-names`, `check:block-renderers`, `check:class-vocabulary`, `check:off-state-coverage`, `check:test-ownership`, `check:default-language-prose`, `check:demo-data-budget`, `check:storefront-indexability`, `check:rsc-discipline`, `i18n:hardcoded`; `pnpm run check:pdfmake-footprint`; `pnpm --filter backend run` each of `overlay:check`, `check:divergence`, `check:release-intent`, `check:platform-surface`, `manifests:check`
- [x] T065 `quality:static` and `release:changeset`: `bash scripts/check-naming.sh`; `bash scripts/check-language.sh`; `git fetch --no-tags origin +refs/heads/master:refs/remotes/origin/master && pnpm --filter backend run check:release-intent -- --since origin/master && pnpm --filter backend run test:release-gate`
  - T062 – T065 re-run green on tip `33fc6d2b2` after the rebase onto `854f8564f`.
- [x] T066 `test:backend:unit`: `pnpm --filter backend run test:unit:fast`
  - Green on Linux (Docker `node:22.18-slim`, 2026-10-15, tip `33fc6d2b2`): 352 files / 7534 tests passed, mirroring the job's `before_script` in a `git clone` of the tip. macOS reds are host-only (BSD userland, `/private/var`). The container needs an init as PID 1 (`docker run --init`): with a bare `sleep infinity` as PID 1, orphaned group members are never reaped and `test/unit/scripts/acceptance-process-teardown.test.ts` reports 3 zombies as survivors — identically on `854f8564f`.
- [x] T067 `test:frontend`: `pnpm --filter '!backend' run test`
  - Green on Linux (Docker `node:22.18-slim`, 8 CPU / 8 GB VM, clone at `/builds/endora/endora-commerce`, tip `1de3ba3ab`): 67 vitest members plus the `docs` echo, exit 0, 648 s. The green run was `pnpm -r --no-bail --filter '!backend' run test` — the same verdict with every member forced to execute. The exact command went red three times on three different load-timing tests, none in a file this branch touches, each green when run alone: `packages/cli/test/dev-all.test.ts` (10 s vitest timeout around a blocking `spawnSync`), `admin` `test/modules/crm/board-card-fields.test.tsx` and `test/modules/orders/OrderCreatePage.product-browser.test.tsx` (`waitFor`), `storefront/test/seo/llms-txt-base.test.ts` (257 ms against a 250 ms budget). The macOS reds in `packages/cli` (no util-linux `script`, `blocks:generate` output) are host-only; the branch does not touch `packages/cli`.
- [x] T068 The suites a merge-request pipeline skips (D-198), from `backend/` with `$SVC`: `pnpm exec vitest run test/contract/kernel/openapi-baseline.test.ts test/contract/orders test/contract/catalog test/contract/quote_requests test/integration/saved-list-views test/integration/quote_requests test/integration/_i18n test/unit/_i18n test/unit/db`; then, if time allows before the pull request, the complete `pnpm --filter backend run test`
  - Green on the macOS host against Warden's services: 149 files, 1325 passed / 3 skipped, 1422 s. The optional complete run was not done.
- [x] T069 `pack-gate`: `pnpm --filter backend run pack-gate -- --no-build`
  - Green on Linux (GNU tar 1.34): 73 packages, 0 violations. The macOS red is host-only: `listTarball` in `backend/scripts/pack-gate.ts` parses GNU `tar -tzvf` columns, bsdtar 3.5.3 emits another layout, so every package reads as 0 files (752 violations).
- [x] T070 `boot-gate`: `bash scripts/boot-gate.sh --with-negatives`
  - Green on the macOS host (bash 5.3, host Docker), 494 s: the image boots, installs translations for every composed module, keeps its 9 overlays; all three negative cases red as required.
- [x] T071 `build:docs` and `dco`: `pnpm --filter docs run build && pnpm --filter backend run verify:docs-build`; then `node backend/scripts/dco-signoff.ts origin/master HEAD` (every commit carries `Signed-off-by:` and no AI trailer)
  - Green on the macOS host: 334 pages, 0 findings; DCO 36/36 before this record.
  - T063 re-run green on the macOS host on tip `1de3ba3ab` (typecheck 523 s, lint 118 s, 0 errors). T063 – T071 above are on tip `1de3ba3ab`, base `854f8564f`. `origin/master` advanced to `328ac4c1d` (feature 146, 50 commits) during this run; the gate above was not run against it, so a rebase means re-running T062 – T071.

**Verification**: T062 – T071 each green, in order, on the same tip; the tip is the one pushed.

---

## Dependencies and order

```text
Phase 1 ──┬─► Phase 2 ──┬─► Phase 4 (needs 3)
          │             ├─► Phase 6 (needs 5)
          │             └─► Phase 8 (needs 7)
          └─► Phase 3 ──► Phase 5 ──► Phase 7      (only through the parity test's rows)
Phases 4, 6, 8 ──► Phase 9 ──► Phase 10
```

- Within a phase, a **RED** task precedes the task that turns it green; `[P]` tasks may be
  written in parallel.
- Phase 5–6 (US2) and Phase 7–8 (US3) are otherwise independent; if built in parallel, add the
  parity rows in whichever order the phases land.

## Parallel examples

- Phase 2: T007, T009, T010, T011 are separate files — write them together; T008 and T012 then
  turn them green.
- Phase 7: T040, T041, T042, T043 are four RED tasks in three files — write them together before
  T044.
- Phase 9: T054, T055, T056 are three independent pages.

## Implementation strategy

- **MVP = Phases 1–4** (US1, #288): the defect in shipped behaviour is fixed and the kit control
  exists for the other two lists.
- **Increment 2 = Phases 5–6** (US2, #289). **Increment 3 = Phases 7–8** (US3, #290).
- Phases 9–10 close the feature. One pull request for the branch, or one per increment if the
  orchestrator splits it — each increment carries its own changesets already.

## Requirement → test

| Requirement | Test task(s) |
| --- | --- |
| FR-001 no native dialog | T010, T011 (spies + source scan), T021 |
| FR-002 one dialog, share starts private | T010 |
| FR-003 trimmed, required, ≤ 160 | T001, T003, T010, T015, T026, T040 |
| FR-004 name, focus, trap, Escape/Cancel/backdrop, focus return / selector | T007, T010, T011 |
| FR-005 busy state | T007, T010, T011 |
| FR-006 errors inside the dialog, input kept | T010 |
| FR-007 accessible names, shared announced | T010 |
| FR-008 capability on Product and Quote Request lists; no rename in UI | T036, T050, T026, T040; no `PATCH` asserted in T010 |
| FR-009 a view belongs to one list | T014 (S11), T027, T043 |
| FR-010 captured state per list | T036, T050 |
| FR-011 load replaces, resets the rest, first page | T021 (incl. `sort: null`), T036, T050 (incl. page 2 → page 1) |
| FR-012 stale values tolerated | T021, T036, T050 |
| FR-013 visibility, 404/403, platform-admin override | T014 (+ rows T027, T043), T015, T026, T040 (incl. the R-7-conditional case) |
| FR-014 delete control only where allowed | T011, T015, T026, T040 (flags) |
| FR-015 no new code; list gate gates views | T015, T026, T040; API surface recorded in T020a, T034a, T048a |
| FR-016 loading never widens; `mine` is the loader's | T041 |
| FR-017 no foreign organization name | T050 |
| FR-018 off-state gated, data kept | T042 |
| FR-019 no palette entry | Proved by absence: no manifest `actions` change in any phase; the existing palette seeded-set tests run unchanged in T067, and T064 (`check:action-route-permissions`) stays green |
| FR-020 en + pl | T009, T010 (Polish render), T015/T026/T040 (Polish conflict sentence), T064 (`check:error-translations`, `check:bundle-pairing`) |
| FR-021 docs, both audiences | T054 – T058 (`check:module-docs`, `check:docs-translations`) |
| FR-022 duplicate name key, client and server, concurrency | T001, T010, T014 (S6, S7, S10), T015, T026, T040 |
| FR-023 delete confirmation text | T011 |
| SC-001 zero native dialogs | T011 (source scan), T010, T021 |
| SC-002 keyboard + automated a11y | T007, T010, T011 (`axe-core`, keyboard-only flows) — proved once on the shared kit control, the one component all three lists mount (T021, T036, T050 assert it is mounted with the list's endpoint) |
| SC-003 every string in both languages | T010, T064 |
| SC-004 every scenario automated | this table |
| SC-005 one selection re-applies | T036, T050 |
| Hardening (threat model) S-03 fail-closed actor | T015, T026, T040 → T018, T032, T047 |
| S-04 owner-keyed lock and probe | T014 (S10b) → T017, T031, T046 |
| S-05 payload bounds | T001, T003, T015 → T002, T004 |
| S-06 control/format characters in names | T001, T010, T015 → T002, T012 |
| S-09 off-state on all four methods | T042 |
| S-10 names render as text | T010, T011 |
| S-11 actor-≠-owner log line | T014 (S12) → T017, T031, T046 |
