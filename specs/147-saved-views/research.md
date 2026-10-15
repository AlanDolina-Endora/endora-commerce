# Research: Saved list views (`specs/147-saved-views/`)

Every decision below is stated as **decision → rationale → alternatives rejected**. Facts are
measured on `feat/147-saved-views` at `9f9a0f124`; paths are real. Nothing here is marked
`[NEEDS CLARIFICATION]`: the specification's clarify sessions closed every behavioural question,
and what remained was delegated to planning by the spec itself (*Constraints*, I and IX).

---

## R-1 — Where saved views live: persistence per module, rules and UI shared

**Decision.**

- **Persistence stays with the module that owns the list.** `catalog` gains
  `product_list_saved_views`, `quote_requests` gains `quote_request_list_saved_views`, each with
  its own `@GlobalEntity()` class, migration, service and four admin routes, built to the shape
  `orders` already ships (`packages/modules/orders/src/backend/entities/order-list-saved-view.entity.ts`,
  `.../services/order-list-view-service.ts`, `.../routes.ts:708-750`). `orders` keeps its table
  and gains no migration.
- **The rules and the wire shape are shared through `@endora-commerce/contracts`**: one base
  schema family and one name normaliser in a new `packages/contracts/src/saved-list-views.ts`,
  which `orders`' existing schemas are rebuilt on (keeping their exported names) and which
  `catalog` and `quote_requests` use directly.
- **The UI is shared through `@endora-commerce/admin-kit/components`**: a `SavedViewsControl`
  composite (selector + save dialog + delete confirmation) that takes the list's endpoint as a
  prop, built on a `ModalDialog` primitive promoted from `crm` (R-2).
- **Drift between the three services is caught by one parity test** run over all three
  (R-12), not by a shared implementation.

**Rationale.**

1. *Constitution I — a module owns its data and must be detachable.* With a table per module,
   removing `quote_requests` removes its views with it (its migrations revert under its own
   `endora.id`, D-142); nothing in `orders` or `catalog` names it.
2. *Constitution XVII — the two axes differ per module.* `quote_requests` is operator-toggleable
   (`packages/modules/quote_requests/src/manifest.ts:38`); `orders` and `catalog` are
   non-deactivatable (`orders/src/manifest.ts:655`, `catalog/src/manifest.ts:347`). Routes
   registered inside `quote_requests`' own `registerQuoteRequestsAdminRoutes` are gated by
   `ctx.routes` with every other route of the module (`specs/conventions/module-activation.md`
   item 1), which is exactly FR-018. A shared host for the routes would need a per-list presence
   check — the per-handler gate that convention forbids.
3. *The platform surface.* `@endora-commerce/platform` publishes five barrels a module may name
   (`check:platform-surface`, `PUBLISHED_SUBPATHS`). A platform-owned saved-view entity or
   service would need a sixth barrel or a `host-internal-subpath` finding — both are what that
   check exists to refuse — for a feature concern the host has no other reason to know.
4. *Evidence that copies drift.* `returns` carries an unused copy whose rules already diverged
   (name limit 200, owner-only modification, 403 for a non-owner —
   `packages/modules/returns/src/backend/services/return-list-view-service.ts:66-70`, `:84-88`).
   Drift is the real cost of per-module copies, so it is answered where it occurs: one contract
   for the shape and the name rule, one kit component for the behaviour the admin sees, and one
   parity test that drives the same scenario table through all three services.
5. *Constitution IX.* The admin-visible behaviour (two dialogs, keyboard, focus, announcements)
   is the part the issues complain about and the part that is hardest to keep consistent; it is
   written once.

**Alternatives rejected.**

| Alternative | Why rejected |
| --- | --- |
| One platform-owned table `admin_list_saved_views` keyed by a list id, with a platform service | Needs a new published platform barrel (`check:platform-surface`); rows of a detached module outlive it in a table no module owns; FR-018's off-state would need a per-list gate inside a shared handler; and moving `orders`' rows into it is a data migration the spec does not ask for. |
| One module (e.g. `orders`) hosts every list's views behind a `listId` column | `catalog` and `quote_requests` would write another module's table (`check:module-boundary` R2), a switched-off `quote_requests` would still have its views served by `orders`' always-on routes, and detaching `orders` would take the other two lists' views with it. |
| A new `saved_views` module publishing a port | A module whose only purpose is a helper for three others; it would have to be non-deactivatable (two of its consumers are), so it adds a lifecycle edge and a required module for ~120 lines of service code. |
| A generic service factory in the platform kernel (`createSavedListViewService(entityClass)`) | Same surface problem as the first row, and a generic ORM service in the host is a framework abstraction for three call sites (Principle IV). |
| Pure per-module copies, nothing shared | The `returns` divergence is the measured outcome of that choice. |
| Refactor `returns` onto the new shape | Out of scope by the specification (*Out of scope*, second bullet). |

---

## R-2 — The dialog primitive: promote `crm`'s `ModalDialog` into the kit

**Decision.** Move `packages/modules/crm/src/admin/components/ModalDialog.tsx` to
`packages/admin-kit/src/components/modal-dialog/ModalDialog.tsx`, publish it from
`@endora-commerce/admin-kit/components`, re-point `crm`'s eight importers and delete the module
copy. Extend it additively with two optional props:

- `initialFocusRef?: RefObject<HTMLElement | null>` — the element focused on open (the save
  dialog's name field). Without it, behaviour is unchanged (`useFocusTrap` focuses the first
  focusable).
- `finalFocusRef?: RefObject<HTMLElement | null>` — the element focused after close instead of
  the opener (the selector after a confirmed deletion, FR-004's exception).

The save dialog and the delete confirmation are composed from it inside the kit and are **not**
published: only the module code that imports a kit member makes it a member (the barrels'
membership is "derived, never designed", `packages/admin-kit/src/components/index.ts` header).

**Rationale.** The component already does what FR-004/FR-005 require — accessible name through
`aria-labelledby`, the kit's `useFocusTrap` (Tab cycling and focus return), Escape and backdrop
close, a `busy` flag that blocks both — and its own doc comment says it is "a promotion candidate
for the kit the moment a second module wants it". Three modules now want it. Constitution IX
says a primitive that earns its place SHOULD be promoted.

**Alternatives rejected.**

| Alternative | Why rejected |
| --- | --- |
| A new kit dialog, `crm`'s left in place | Two dialog implementations in one product, the divergence IX exists to prevent. |
| Compose each dialog per screen (as `OrdersBulkStatusDialog` does) | Three screens × two dialogs of focus/Escape/busy logic; every a11y fix would be made six times. |
| Radix `@radix-ui/react-dialog` | A new runtime dependency (Principle IV) when a working, tested-in-production primitive exists in the tree. |
| Leave `crm` importing its own copy and also export the moved one | A second copy is exactly what the move removes. |

**Risk.** The move touches `crm`, a module this feature is otherwise not about. It is
mechanical (eight import specifiers, no behaviour change; the two new props default to today's
behaviour) and is verified by `crm`'s existing admin tests plus the new primitive test.

---

## R-3 — The saved-views composite takes an endpoint, holds no module knowledge

**Decision.** `SavedViewsControl` (kit) takes:

```ts
interface SavedViewsControlProps {
  /** e.g. '/api/v1/admin/orders/list-views' — supplied by the module page. */
  endpoint: string;
  /** The list's captured state now (FR-010); what a save stores. */
  current: SavedViewState;
  /** Apply a loaded view's state to the list (FR-011, FR-012 are the page's). */
  onApply: (state: SavedViewState) => void;
  /** Page-level error sink for list-load failures outside a dialog. */
  onError: (message: string) => void;
}
interface SavedViewState {
  filters: Record<string, unknown>;
  sort?: { field: string; dir: 'asc' | 'desc' } | null;
  visibleColumns?: string[] | null;
}
```

It lists, creates and deletes through the kit's own `apiClient` against `endpoint` and the
shared contract types; it never calls `PATCH` (FR-008 — no rename/re-share/overwrite in the UI).
Mapping list state to and from `SavedViewState` stays in each page, because it is the list's
knowledge.

**Rationale.** The kit's rule R6 — *the kit holds no module knowledge*
(`backend/scripts/ledgers/admin-surface.ts`, group A) — is satisfied by the asset-picker
precedent: a kit component may build a request with the published `apiClient` and contract
types. A URL supplied by the caller is the caller's knowledge, not the kit's. One component with
fetching inside is three fewer copies of the load/save/delete/reload sequence than a
presentational component plus per-module data hooks.

**Alternatives rejected.** A presentational-only control with per-module fetch hooks (three
copies of the same sequence, which is where `OrderSavedViews.tsx`'s bugs lived); a kit hook that
derives the URL from a module id (module knowledge in the kit).

---

## R-4 — Translations: kit strings in `core`, conflict sentences in each module's bundle

**Decision.**

- Every string the composite and its dialogs render is a `core` key under a new `savedViews.*`
  prefix, in `packages/modules/_i18n/i18n/{en,pl}.json`, reusing `common.action.cancel`,
  `common.action.save`, `common.action.delete`, `common.field.name` and `common.state.saving`
  where they already say the right thing. The full key list with both languages is in
  [contracts/admin-kit-saved-views.md](./contracts/admin-kit-saved-views.md) §4.
- The four legacy `orders.views.*` keys (`_i18n/i18n/en.json:1036-1039`, `pl.json:1036-1039`)
  are deleted with `OrderSavedViews.tsx`, their only reader.
- Each module's duplicate-name refusal (R-6) carries its sentence as `errors.<CODE>` in **that
  module's** bundle (`packages/modules/<id>/i18n/{en,pl}.json`); the backend resolves it into
  `error.message` by the request's language, and the dialog shows `error.message`.
- No module needs a new admin string of its own: the control's copy is the kit's.

**Rationale.** A kit component may read only `core` — reading a module namespace is module
knowledge (`packages/admin-kit/src/components/asset-picker/AssetPicker.tsx` header, R-1 of
2026-08-31, and `StatusTransitionGraph.tsx` lines 15-25). Where the backend can resolve the
reader's language it translates and ships the code too (`specs/conventions/module-i18n.md`, the
boundary rule) — an HTTP response is that case, so the conflict message is backend-translated.

**Alternatives rejected.** Strings in the orders bundle (unreachable from the kit); keeping
`orders.views.*` and adding `catalog.views.*` / `rfq.views.*` (three copies, and the kit could
read none of them); client-side translation of the conflict by code (the boundary rule says the
backend translates an HTTP response; a third-party API client would get a raw code).

---

## R-5 — The duplicate-name rule (FR-022): advisory lock and probe, uniformly

**Decision.** In all three services, `create` and a name-changing `update` run inside
`em.transactional(async (tx) => …)`:

1. `select pg_advisory_xact_lock(hashtextextended(?, 0))` with the key
   `'<table>:' || ownerAdminUserId` — one lock per owner per list. The owner is the **view's**
   owner: on an `update` by a platform admin it is the stored row's `ownerAdminUserId`, never the
   caller's, so a platform admin's rename and the owner's own save serialise on the same lock
   (threat model S-04);
2. probe: `select 1 from <table> where owner_admin_user_id = ? and lower(btrim(name)) = lower(?)
   [and id <> ?] limit 1`;
3. refuse with 409 and the module's `*_SAVED_VIEW_NAME_TAKEN` code if a row is found, else write.

Both statements go through `tx.execute(...)` — never `getKnex()`, which takes its own pooled
connection outside the transaction (`check:transaction-context`, issue #200). The two **new**
tables additionally carry a unique expression index on `(owner_admin_user_id, lower(name))`, and
their services map a unique violation to the same 409.

An `update` checks only when the submitted name's key differs from the stored name's key, so a
`PATCH` that changes `shared` on a pre-existing duplicate (spec *Assumptions*: legacy duplicates
are left alone) is not refused for a conflict it did not create.

**Rationale.** A unique index cannot be created on `order_list_saved_views` while it may hold the
pre-existing duplicates the spec says to keep: the migration would fail on exactly the databases
that have them. The advisory lock gives the "two concurrent saves leave exactly one view"
guarantee without a schema change, and `packages/modules/blog/src/backend/services/blog-slug-collision.ts`
is the in-tree precedent for the pattern. Using it in all three services keeps one code shape
for the parity test to judge. On the new tables the index costs nothing and makes the invariant a
property of the schema, not only of the service.

**Alternatives rejected.**

| Alternative | Why rejected |
| --- | --- |
| Unique expression index on `orders`' table too | Fails to apply where legacy duplicates exist; renaming or deleting them contradicts the spec's assumption. |
| A partial unique index on `orders` (`where created_at >= <deploy time>`) | A constant in an index predicate encoding a deploy date; a rename of an old row escapes it. |
| A new `name_key` column on `orders`, unique where not null | A schema change to `orders` for a guarantee the lock already gives; backfill rules for legacy duplicates. |
| Probe without lock | Two concurrent saves both pass the probe — the exact race FR-022 names. |
| `select … for update` on the owner's rows | Locks nothing when the owner has no rows yet, which is the first-save race. |

---

## R-6 — The conflict error codes: one per module

**Decision.** Three codes, each minted for and owned by the module that raises it:

| Code | Owner | HTTP |
| --- | --- | --- |
| `ORDER_SAVED_VIEW_NAME_TAKEN` | `orders` | 409 |
| `PRODUCT_SAVED_VIEW_NAME_TAKEN` | `catalog` | 409 |
| `RFQ_SAVED_VIEW_NAME_TAKEN` | `quote_requests` | 409 |

Each one is: a member of `ERROR_CODES` (`packages/contracts/src/errors.ts`), a `{ code }` entry
in the owner's manifest `errorCodes`, an entry in `MINTED_ERROR_CODES`
(`backend/test/fixtures/error-code-routing/reference-ledgers.ts`, `{ to: '<owner>', reason }`),
and `errors.<CODE>` prose in the owner's `en.json` and `pl.json` (`check:error-translations`).

**Rationale.** Each code names a different noun — an order list's view, a product list's view, a
quote request list's view — and each is raised in exactly one module, which is the routine path
feature 090 built (precedent: `ADMIN_AUTHENTICATION_THROTTLED` → `admin_users`,
`reference-ledgers.ts:93`). The kit does not branch on the code; it shows `error.message`.

**Alternatives rejected.** One platform-owned `SAVED_VIEW_NAME_TAKEN` declared by `_i18n`: the
platform block (`PLATFORM_OWNED_ERROR_CODES`, tier T3) is the closed set D-186 §4 gates, admitted
only for a code "no module owns the noun" of — here every raise site belongs to a module that
does own its noun. Reusing `VALIDATION_FAILED` or `VERSION_CONFLICT`: neither says what the
admin must do, and FR-022 requires a translated message specific to the conflict.

---

## R-7 — Who is a "platform admin" for a saved view (FR-013, FR-014)

**Decision.** In `catalog` and `quote_requests`, "platform admin" is **the admin whose ambient
tenant context has `mode === 'all'`**, read with `getTenantContext()` from the published
`@endora-commerce/platform/tenancy` barrel. `orders` derives it the same way since the security
review's SV-1 fix: all three lists read it through their own
`packages/modules/<id>/src/backend/saved-view-actor.ts`. (Before that fix `orders` kept its
`isPlatformAdmin` on `resolveAdminOrdersScope(request).allowAll` in `routes.ts`, the same
predicate except that it answered `true` when no scope resolver was composed.)

**Rationale.** FR-013 says the rules are *those of Order views*. Orders' predicate is
`allowAll`, and `allowAll` is decided by `organizations`' `adminTenantScopePort`
(`packages/modules/organizations/src/backend/services/admin-tenant-scope.ts`): every role except
`sales_representative` reaches all organizations, and the platform's tenant context maps that to
`mode: 'all'` (`packages/platform/src/tenancy/resolve-tenant-context.ts:155-156`). Reading the
context is the same answer with no new wiring. The test harness agrees: its
`resolveTestAdminOrdersScope` (`backend/test/helpers/test-server.ts:1195-1211`) and its tenant
mapping (`:1320-1335`) both confine only a sales representative.

`quote_requests`' own `rfqAdminContextResolver.isPlatformAdmin` (`role.code === 'platform_admin'`)
is **not** used: it is a different predicate from orders' (a non-sales-rep role that is not
`platform_admin` is "all" for orders and not for it), so using it would break FR-013; and the
harness answers it `… || true` (`test-server.ts:2435`), which would make FR-013's refusal cases
untestable through HTTP.

**Owner ruling A (2026-10-14).** The spec's *Vocabulary* now defines "Platform admin (for saved
views)" as any role except `sales_representative`; this decision is therefore the spec's, not
only the plan's.

**Measured consequence, recorded rather than changed.** Under orders' predicate any admin whose
role is not `sales_representative` may delete another admin's shared view. That is today's
Order-list behaviour, which FR-013 extends; it is not a new rule.

**Alternatives rejected.** The RFQ resolver's role-code test (above); a new permission code for
"manage shared views" (FR-015 forbids new codes).

---

## R-8 — The list response tells the client what it may do

**Decision.** Every list item carries two caller-relative booleans computed by the server:
`ownedByCaller` (the caller is the owner) and `canModify` (`ownedByCaller || (shared &&
isPlatformAdmin)`). The kit enables *Delete view* only when `canModify` (FR-014) and runs the
inline duplicate-name check (FR-022) against views with `ownedByCaller`. Added to `orders`'
response too — an additive change to `orderSavedViewSchema`.

**Rationale.** The rule lives once, on the server, next to the refusal it predicts. The kit
otherwise needs the current admin's id (`useAuth()`), which ties a kit component to the
`AuthProvider` in every test and still cannot know "platform admin" without re-implementing R-7
in the browser.

**Alternatives rejected.** Compare `ownerAdminUserId` with `useAuth().me.adminUser.id` in the
kit (couples to the auth context; cannot answer `canModify`); always enable delete and surface
the 403 (today's defect, `OrderSavedViews.tsx:110`).

---

## R-9 — One wire shape for the three lists

**Decision.** The shared response shape is orders' shape plus R-8's flags, with `sort` and
`visibleColumns` **optional and nullable**:

```text
{ id, name, shared, ownerAdminUserId, ownedByCaller, canModify,
  filters: Record<string, unknown>, sort?: { field, dir } | null, visibleColumns?: string[] | null }
```

`orders` stores and returns all three state fields (unchanged). `quote_requests` stores all three
(it has a sort and a column picker). `catalog` stores `filters` only — the Product list has no
sort and no column picker (spec *Current state*) — and its create schema does not accept the
other two (Zod's default `strip`). `filters` stays an opaque JSON object on the server, as on
orders: what a list captures is the page's knowledge (FR-010, FR-012), enforced by the admin
tests of each page.

**Rationale.** One shape lets one kit component serve three lists. Adding a `sort` and a
`visible_columns` column to `product_list_saved_views` for a list that has neither would be a
speculative schema (Principle IV).

**Alternatives rejected.** Typed per-list `filters` schemas on the server (they would re-state
each list's option vocabulary, which changes, and make a stale-but-tolerated view unwritable via
the API for no user benefit); three response shapes (three type parameters in the kit).

---

## R-10 — Names: trimmed on write, compared by key

**Decision.** The shared `savedListViewNameSchema` is `z.string().trim().min(1).max(160)` and is
used by every create and update schema, `orders`' included. The server compares keys in SQL as
`lower(btrim(name))`; the kit compares `name.trim().toLocaleLowerCase()` for its inline check.
The server is authoritative; the client check exists to answer before a request (FR-022).
`SAVED_LIST_VIEW_NAME_MAX = 160` is exported for the dialog's limit message.

**Characters (threat model S-06).** The name schema refuses control and format characters
(`/[\p{Cc}\p{Cf}]/u` — NUL, bidi overrides such as U+202E, zero-width characters) with 400, and
the dialog mirrors it inline (`savedViews.error.nameInvalidCharacters`). No homoglyph folding:
two shared views whose names look alike (Latin `a` vs Cyrillic `а`) remain possible. That is
**accepted as low risk** — a view stores filter values only, a look-alike can at worst make an
admin load the wrong filters, which the list then shows them, and the shared suffix plus the
owner-only/platform-admin delete rule bound the nuisance.

**Payload bounds (threat model S-05).** `filters` is opaque but bounded: its serialised JSON ≤
8 192 UTF-8 bytes; `visibleColumns` ≤ 64 entries of ≤ 64 characters; `sort.field` ≤ 64
characters; anything larger is 400. The largest real captured state (the Order list's twelve
filters) is well under 1 KB. **No per-owner view-count cap** is added: the spec's *Assumptions*
keep "no limit", and the owner is asked separately.

**Rationale.** FR-003 requires trimming before validation and storage; doing it in the shared
schema puts it on every path, API clients included. For orders this tightens two inputs that were
accepted before — a whitespace-only name and surrounding whitespace — which is the behaviour the
spec requires; it is called out in the orders changeset.

**Alternatives rejected.** A stored `name_key` column (R-5); folding diacritics into the key
(`foldDiacritics`, `packages/contracts/src/text-normalization.ts`) — the spec defines the key as
trimmed and case-insensitive only, and *Kraków* and *Krakow* are different names to an admin.

---

## R-11 — Routes, gates and placement

**Decision.**

| List | Routes | Gate | Registered in |
| --- | --- | --- | --- |
| Orders | `GET`/`POST /api/v1/admin/orders/list-views`, `PATCH`/`DELETE …/:id` (unchanged paths) | `orders:read` (unchanged) | `orders/src/backend/routes.ts` |
| Products | `GET`/`POST /api/v1/admin/catalog/products/list-views`, `PATCH`/`DELETE …/:id` | `catalog:read` | `catalog/src/backend/routes.admin.ts` |
| Quote requests | `GET`/`POST /api/v1/admin/quote-requests/list-views`, `PATCH`/`DELETE …/:id` | `rfqs:handle` | `quote_requests/src/backend/routes.admin.ts`, inside `registerQuoteRequestsAdminRoutes` |

**Rationale.** FR-015 fixes the codes. The paths mirror orders'. The static `list-views` segment
outranks the `:id` parameter in Fastify's router, so `GET /products/list-views` never reaches
`GET /products/:id` — a contract test pins that. Placing the RFQ routes in the function the
module already registers through `ctx.routes` is what gates them with the module (R-1, item 2).

---

## R-12 — How it is tested

**Decision.**

- **Contracts** — `packages/contracts/src/saved-list-views.test.ts` beside its subject (the
  package's existing convention, e.g. `orders.test.ts`).
- **Rule parity** — one integration test,
  `backend/test/integration/saved-list-views/rules-parity.test.ts`, drives the same scenario table
  (visibility, private-404, shared-non-owner-403, platform-admin override, name-key conflict on
  create and rename, same name for another owner, legacy-duplicate tolerance, concurrent create)
  through each module's service on a real database. It names three modules, so under
  `check:test-ownership` §1 it is the repository's file (`|owners| ≥ 2`). It opens with the
  orders row in the orders phase and gains a row per module after.
- **HTTP contracts per module** — `backend/test/contract/{orders,catalog,quote_requests}/…`:
  gates, status codes, envelopes, trimming, translated conflict message, route precedence.
  Server-bound tests stay under `backend/test/` (no module can host one today —
  `check-test-ownership.ts`, `serverBoundHosts`). Each file that needs extra admins creates its
  own roles and users with **its own** stub session ids in `backend/test/helpers/test-actors.ts`,
  following the precedent there (two files sharing an admin id couple their fixtures).
- **Off-state** — the existing `expectModuleAbsent` call in
  `backend/test/integration/quote_requests/off-state.test.ts` gains the new route, and the file
  gains a "views survive off → on" case. No second off-state file: `check:off-state-coverage`
  counts the call that already exists.
- **Admin** — `admin/test/components/ModalDialog.test.tsx` and `SavedViewsControl.test.tsx` for
  the kit (the `KanbanBoard` precedent); `admin/test/modules/<id>/…saved-views.test.tsx` for each
  page's mapping. **Every render is wrapped in `<StrictMode>`** (the admin runs in it —
  `packages/admin-shell/src/AdminRoot.tsx:85`; `renderWithI18n` does not add it), so a focus or
  cleanup bug that only double-mounting reveals fails the test.
- **Accessibility (SC-002)** — `axe-core` run against each open dialog in jsdom, WCAG 2.0/2.1/2.2
  A and AA rule tags. See R-13.

---

## R-13 — `axe-core` as an `admin` devDependency

**Decision.** Add `axe-core` to `admin/package.json` `devDependencies` at the version already in
`pnpm-lock.yaml` (`axe-core@4.13.0`, present transitively through the storefront's
`@axe-core/playwright`), with a small helper `admin/test/helpers/axe.ts`.

**Rationale.** SC-002 requires "an automated accessibility check of each open dialog". Nothing in
the admin's test stack performs one today. A devDependency ships in no package and no runtime
bundle; the version adds no tarball to the store.

**Alternatives rejected.** Hand-written ARIA assertions only (they test what the author thought
of, not the rule set — kept anyway as the behavioural tests); `vitest-axe` / `jest-axe` wrappers
(a second dependency for a ten-line helper); Playwright against a running admin (no admin
end-to-end harness exists to extend). jsdom cannot compute colour contrast, so axe's contrast
rule is inapplicable there; the dialogs use only existing theme tokens, which is the contrast
argument.

---

## R-14 — No Command Bus, by the spec's assumption

**Decision.** Saved-view writes stay outside `CommandBus.run` (spec *Assumptions*: personal UI
configuration, following the `command-coverage-ignore` precedent at
`order-list-view-service.ts:36-38`). Every new `create`/`persist*`/`remove*`/`flush` call on an
EntityManager in the two new services carries the same `// command-coverage-ignore:` comment so
`check:command-coverage -- --strict` stays green.

---

## R-15 — Selector behaviour, settled where the spec leaves it to "as today"

- **After a save** the selector reloads and the new view appears; the selection is **not**
  changed (Order list today, `OrderSavedViews.tsx:62-69`).
- **After a confirmed delete** the selection is cleared, the current filters are kept, the list
  reloads and focus moves to the selector (US1 scenario 16).
- **A delete that answers 404** (deleted elsewhere) shows `savedViews.error.gone` inside the
  confirmation, reloads the selector and clears the selection (spec edge case).
- **A shared view** is listed as `<name> (shared)` — the suffix is translated text inside the
  `<option>`, so a screen reader announces it (FR-007); the `★` goes.
- **Long names** — the selector has a bounded width with text truncation; the option text stays
  whole, which is what assistive technology reads.

---

## R-16 — FR-016 / FR-017 on the Quote Request list hold by construction; tests prove it

**Decision.** No server code is added for FR-016/FR-017. A loaded view only sets component state;
the list request that follows is the loader's own, and `RfqAdminService.listAll` narrows to the
loader's organizations whatever scope is requested (`rfq-admin-service.ts:134-152`); `mine`
resolves against the caller. The organization filter chip takes a name only from rows the loader
received and otherwise shows an id prefix (`RfqList.tsx:201-207`), and `OrganizationPicker`
labels only organizations its own scoped query returned. The view stores the organization **id**
only. Tests: a contract test replays a captured state as a sales representative and gets only
their organizations' requests; an admin test loads a view naming an organization absent from the
rows and the picker's results and asserts that organization's name is nowhere in the document.

---

## R-18 — Hardening from the threat model

- **Fail-closed actor (S-03).** Every saved-view route answers 401 when no admin actor resolves;
  `orders`' four `resolveAdminUserId(request) ?? ''` fallbacks (`routes.ts:710,720,732,747`) are
  removed in the orders phase. An empty owner id would otherwise be a shared bucket every
  actor-less request writes into.
- **Owner-keyed lock (S-04)** — R-5. **Bounds (S-05), characters (S-06)** — R-10.
- **Off-state on every method (S-09)** — the off-state test drives `GET`/`POST` on the collection
  and `PATCH`/`DELETE` on `/:id`, not only the collection `GET`.
- **Names are text (S-10)** — rendered as React text children everywhere, tested with markup-like
  names.
- **Actor-≠-owner trail (S-11).** No audit row (R-14), but when a platform admin modifies or
  deletes another admin's view, the service writes one structured `info` log record
  `{ event: 'saved_view.updated' | 'saved_view.deleted', list, viewId, ownerAdminUserId,
  actorAdminUserId }` through a constructor-injected logger (the module's own logger, supplied in
  `plugin.ts`). No schema change, no Command Bus. The parity test passes a spy logger, which is
  why the services take it as a constructor argument rather than reading a global.

## R-17 — What this feature does not touch

`returns`' saved-view backend; the 21 `window.confirm` files and the Returns rejection prompt
(spec *Out of scope*); the Product list's Category/Channel/Stock chips; any command-palette entry
(FR-019); any permission code (FR-015); the `orders` table schema.
