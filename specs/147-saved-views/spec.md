# Feature Specification: Saved list views — a design-system save dialog, and saved views on the Product and Quote Request lists

**Feature Branch**: `feat/147-saved-views` (spec directory `specs/147-saved-views/`)
**Created**: 2026-10-14
**Status**: Accepted — 2026-10-15, product-owner acceptance of the implementation at
`54c9f8c72`: FR-001 – FR-023 and SC-001 – SC-005 verified against code and tests. Merge still
waits on the CI gate (`tasks.md` Phase 10) being re-run on the final tip. (Clarified
2026-10-14: Q1 – Q5 answered, the first draft's defaults accepted; see *Clarifications*.)
**Issues**: #288, #289, #290
**Input**: three GitHub issues:

- **#288** — *Replace native browser JS prompt with Design System modal for saving order
  filters.* On the Order list, saving the applied filters as a view opens the browser's native
  `prompt()`, which breaks the consistency of the Admin UI. It is to be replaced with a modal
  dialog built from the design system.
- **#289** — *Save applied filters as saved views on Product list.* `/catalog/products` should
  let an admin name, save and quickly re-select a filter setup, as `/orders` already does.
- **#290** — *Save applied filters as saved views on Quote Request list.* Mirror the `/orders`
  saved-views functionality on the Quote Request list.

## Vocabulary

- **List** — one of the three admin list screens this feature touches: the Order list
  (`/orders`), the Product list (`/catalog/products`) and the Quote Request list.
- **Captured state** — what a saved view remembers for its list. Order list: unchanged (see
  *Current state*). Product list: status, type and search text. Quote Request list: visibility
  scope, organization, status, search text, sort and column selection (FR-010).
- **Saved view** — a named captured state for one list, owned by the admin user who saved it.
- **Private / shared** — a private view is visible to its owner only; a shared view is visible to
  every admin who can open that list.
- **Name key** — a view's name trimmed of leading and trailing whitespace and compared without
  regard to letter case; two names with the same key are the same name for FR-022.
- **Save dialog** / **delete confirmation** — the two design-system modals this feature
  introduces: one replaces the native `prompt()` / `confirm()` pair when a view is saved, the
  other stands in front of deleting a view.
- **Platform admin (for saved views)** — an admin whose role resolves to any role code **other
  than `sales_representative`**: the rule the Order list applied to saved views before this
  feature. As shipped, all three lists derive it the same way on every saved-view route, from
  the request's tenant context: `ctx.mode === 'all'`
  (`packages/modules/<orders|catalog|quote_requests>/src/backend/saved-view-actor.ts`). The
  platform sets `mode: 'all'` for an admin
  (`packages/platform/src/tenancy/resolve-tenant-context.ts:155-156`) when `organizations`'
  admin tenant scope answers `allowAll`, which
  `packages/modules/organizations/src/backend/services/admin-tenant-scope.ts:43` does for every
  role but `sales_representative`. It fails closed: an admin whose role does not resolve, or a
  composition with no admin tenant scope, yields an `allowed-set` context and is not one
  (`backend/test/integration/saved-list-views/rules-parity.test.ts`, A1 – A5). It is **not** the
  `platform_admin` role code: a custom role such as a catalog manager counts as a platform admin
  here and may modify or delete a colleague's shared view on all three lists (owner ruling,
  Session 2026-10-14). Wherever this specification says "platform admin" about saved views, this
  definition applies.
- **Quote Requests off** — the `quote_requests` module is not effectively present (switched off
  by the operator, or not available on the platform; Constitution XVII treats the two alike).

## Current state (measured on `feat/147-saved-views` at `433dc3890`)

### Order list — saved views exist and use native browser dialogs

| Fact | Where |
| --- | --- |
| A saved view is a platform-global row owned by an admin user: name (max 160 chars), `shared` flag, `filters` (free-form JSON), `sort` `{ field, dir }`, nullable `visibleColumns` | `packages/modules/orders/src/backend/entities/order-list-saved-view.entity.ts:13-52`; migrations `packages/modules/orders/src/migrations/20260611T140357_orders_order_comments_and_saved_views.ts`, `20260611T140406_orders_order_saved_view_columns.ts` |
| The list returns the caller's own views plus every shared view, sorted by name | `packages/modules/orders/src/backend/services/order-list-view-service.ts:25-32` |
| A shared view may be edited or deleted by its owner **or a platform admin**; another admin's private view answers 404 (indistinguishable from absent) | same file `:86-103` |
| Four routes — `GET`/`POST /api/v1/admin/orders/list-views`, `PATCH`/`DELETE …/:id` — all gated by `orders:read`, including the three that write | `packages/modules/orders/src/backend/routes.ts:708-750` |
| Request/response shapes: name 1–160 chars, no trimming; `PATCH` accepts any subset of the create body | `packages/contracts/src/orders.ts:597-624` |
| Saved-view writes are deliberately outside Command Bus auditing (`command-coverage-ignore`: "personal UI configuration, not an order domain mutation") | `order-list-view-service.ts:36-38`, `:64-66`, `:79-81` |
| **Saving calls `window.prompt` for the name (issue #288) and then `window.confirm` for "share with other admins?"** — two native dialogs, not one | `packages/modules/orders/src/admin/components/OrderSavedViews.tsx:58`, `:60` |
| Cancelling the prompt or submitting an empty name silently does nothing; there is no length or duplicate-name feedback before the request | same file `:59` |
| Delete removes the selected view immediately, with no confirmation | same file `:75-84` |
| The `PATCH` route has **no UI caller**: a view cannot be renamed, re-shared or overwritten with the current filters from the Admin UI | `OrderSavedViews.tsx` (no `patch` call) |
| The save and delete icon buttons carry hard-coded English accessible names `save-view` / `delete-view`; a shared view is marked only by a `★` appended to its `<option>` text | same file `:102`, `:109`, `:98` |
| The delete button is enabled for a shared view owned by somebody else; the 403 surfaces as a page error | same file `:110`; service `:96-98` |
| The view's strings (`orders.views.*`) live in the legacy `_i18n` bundle, not in the orders module's own bundle | `packages/modules/_i18n/i18n/en.json:1036-1039`, `pl.json:1036-1039` |
| Captured on the Order list: status, payment status, sales channel, payment method, delivery method, date range, search text, organization name, customer name, total range, sort, visible columns. Loading a view drops unknown column ids and falls back to the default columns when none are stored | `packages/modules/orders/src/admin/pages/OrdersList.tsx:303-325` (`applyView`), `:327-344` (`currentView`), `:648` (mount) |
| Tests: one contract test saves, lists and deletes a private view. Nothing tests shared visibility, a non-owner's refusal, the platform-admin override or the admin component | `backend/test/contract/orders/list-and-views.test.ts:161` |

### Returns — an orphaned backend copy

| Fact | Where |
| --- | --- |
| Returns carries a separate copy of the same backend: entity (name max **200**, not 160), service, four routes gated by `returns:read`, contracts | `packages/modules/returns/src/backend/entities/return-list-saved-view.entity.ts`, `.../services/return-list-view-service.ts`, `.../routes.admin.ts:116-145`, `packages/contracts/src/returns.ts:459-486` |
| Its rules differ from orders: **only the owner** may edit or delete, with no platform-admin override, and a non-owner gets 403 rather than 404 | `return-list-view-service.ts:66-70`, `:84-88` |
| **No admin screen calls it.** The returns list has no saved-views control | no reference under `packages/modules/returns/src/admin/` |

### Quote Request list — saved views were omitted on purpose

| Fact | Where |
| --- | --- |
| The screen's header comment states it mirrors the Order list but omits "saved views" among the order-only affordances. No saved-view entity, route or component exists in `quote_requests` | `packages/modules/quote_requests/src/admin/pages/RfqList.tsx:8-19` |
| Filters: visibility scope (`mine` / `unassigned` / `all`) and organization are sent to the server; status (multi), search text, sort (newest / oldest / highest total) and the column picker are applied in the browser | same file `:107-123`, `:126-145`, `:340-342` |
| The default scope depends on who is looking: `all` for an admin holding the literal `platform_admin` role code, `mine` otherwise — a narrower test than the *Platform admin (for saved views)* of the Vocabulary (see *Assumptions*) | same file `:100`, `:108-112` |
| `mine` is relative to the viewer, and visibility is always narrowed server-side to the organizations the caller may see, whatever scope is requested | `packages/modules/quote_requests/src/backend/services/rfq-admin-service.ts:134-152` |
| The list is gated by `rfqs:handle` | `packages/modules/quote_requests/src/backend/routes.admin.ts:40` |
| `quote_requests` is operator-toggleable (`quote_requests.enabled`) | `packages/modules/quote_requests/src/manifest.ts:38` |

### Product list — few real filters

| Fact | Where |
| --- | --- |
| Real filters: status tab (`all` / `active` / `draft` / `inactive`, initial value readable from the URL), type (cycle chip) and search text. Filter state lives in component state, not in the URL | `packages/modules/catalog/src/admin/pages/ProductsList.tsx:107-113`, `:130-141` |
| The **stock** chip is a client-side kill switch: any value other than *all* empties the list by design, because the list payload carries no stock | same file `:184-188` |
| The **Category** and **Channel** chips are no-op placeholders | same file `:442-443` |
| There is **no sort control and no column picker** on this list | same file (no sort state; fixed `<th>` set at `:617-622`) |
| The backend list route already accepts a `categorySlug` the screen never sends | `packages/modules/catalog/src/backend/routes.admin.ts:479-509` |
| The list is gated by `catalog:read`; `catalog` is non-deactivatable | same file `:480`; `packages/modules/catalog/src/manifest.ts:347` |

### Design system — no dialog primitive

| Fact | Where |
| --- | --- |
| `@endora-commerce/admin-kit` publishes no modal/dialog component. It publishes `useFocusTrap`, which traps Tab and returns focus to the opener, and the `b2b-scrim` / `b2b-drawer` styles | `packages/admin-kit/src/components/index.ts` (`useFocusTrap`), `packages/admin-kit/src/components/hooks/useFocusTrap.ts`, `packages/admin-kit/theme.css:1300-1330` |
| Modules draw their own modals. `crm` has a module-private `ModalDialog` (accessible name, focus trap, Escape, busy lock) whose comment calls itself a promotion candidate for the kit; `orders` has its own `OrdersBulkStatusDialog` | `packages/modules/crm/src/admin/components/ModalDialog.tsx:1-30`; `packages/modules/orders/src/admin/components/OrdersBulkStatusDialog.tsx` |

### Native dialogs elsewhere in the Admin UI (out of scope, recorded for follow-up)

- `window.prompt` has exactly two call sites in admin code: `OrderSavedViews.tsx:58` (this
  feature) and `packages/modules/returns/src/admin/pages/ReturnDetail.tsx:141` (the rejection
  reason for a return).
- `window.confirm` is called from 21 admin files across `sales_channels`, `blog`,
  `transactional_emails`, `settings`, `product_feeds`, `meta_ads`, `linkedin_ads`, `inventory`,
  `credentials`, `assets_library`, `orders` and the admin shell's module activation control.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Save and delete Order list views through design-system dialogs (Priority: P1)

An admin has narrowed the Order list to the orders they work through every morning. They press
*Save view*. Instead of the browser's grey prompt and a second grey confirmation, a dialog in the
Admin UI's own style opens, asking for a name and offering to share the view with colleagues in
the same place. They type a name, press Enter, and the view appears in the saved-views selector.
When they later delete a view, a dialog of the same style asks them to confirm first.

**Why this priority**: it is a defect in shipped behaviour (#288), it is the smallest slice, and
the dialogs it introduces are the ones the other two stories reuse.

**Independent Test**: on the Order list, apply filters, open the save dialog, operate it with the
keyboard only, save a private view and a shared view, try a duplicate name, delete a view through
the confirmation, and confirm no native browser dialog appears at any point and the saved views
load back the captured state.

**Acceptance Scenarios**:

1. **Given** filters applied on the Order list, **When** the admin activates *Save view*,
   **Then** a modal dialog opens with a labelled name field focused and a share control set to
   private, and no native browser dialog appears.
2. **Given** the dialog is open, **When** the admin enters a name and submits (button or Enter),
   **Then** the view is saved with the current captured state and the chosen sharing, the dialog
   closes, focus returns to *Save view*, and the new view is listed in the selector.
3. **Given** the dialog is open, **When** the admin submits an empty or whitespace-only name,
   **Then** the dialog stays open and shows an inline, announced validation message on the field;
   nothing is saved.
4. **Given** the dialog is open, **When** the admin enters a name longer than the limit, **Then**
   the dialog tells them so before any request is sent; nothing is saved.
5. **Given** the admin already owns a view named `Unpaid EU` on this list, **When** they submit
   ` unpaid eu ` in the save dialog, **Then** the dialog stays open and shows an inline, announced
   message that they already have a view with that name; nothing is saved.
6. **Given** a colleague owns a shared view named `Unpaid EU`, **When** the admin saves their own
   view under the same name, **Then** the save succeeds — the rule binds one owner's own views.
7. **Given** the name was free when the dialog checked it but another session of the same admin
   saved it first, **When** the save request arrives, **Then** the server refuses it as a
   conflict with a translated message, shown inside the dialog with the input preserved.
8. **Given** the dialog is open, **When** the admin presses Escape, activates *Cancel* or clicks
   the backdrop, **Then** the dialog closes, nothing is saved, and focus returns to *Save view*.
9. **Given** the save is in flight, **When** the admin presses Escape or clicks the backdrop,
   **Then** the dialog does not close, the submit control shows it is busy, and a second submit
   is impossible.
10. **Given** the server refuses or fails the save, **When** the response arrives, **Then** the
    dialog stays open with the admin's input intact and shows the error inside the dialog.
11. **Given** the dialog is open, **When** the admin presses Tab repeatedly, **Then** focus cycles
    within the dialog and never reaches the page behind it.
12. **Given** the Admin UI is in Polish, **When** either dialog opens, **Then** its title, field
    label, share control, buttons, validation and error messages are in Polish; likewise in
    English.
13. **Given** the saved-views controls are rendered, **When** read by a screen reader, **Then**
    the save and delete buttons have translated accessible names and a shared view is announced
    as shared, not only marked by a symbol.
14. **Given** a selected view the admin may delete, **When** they activate *Delete view*, **Then**
    a confirmation dialog names the view and, for a shared view, says it will disappear for every
    admin; nothing is deleted until they confirm.
15. **Given** the delete confirmation is open, **When** the admin presses Escape, activates
    *Cancel* or clicks the backdrop, **Then** the view is kept and focus returns to *Delete view*.
16. **Given** the delete confirmation is open, **When** the admin confirms, **Then** the view is
    deleted, the selector no longer lists it, the current filters are left as they are, and focus
    moves to the selector.

---

### User Story 2 — Saved views on the Product list (Priority: P2)

A catalog manager who repeatedly looks at, say, draft configurable products matching a search
term saves that setup as a named view on `/catalog/products` and later re-applies it from a
selector, exactly as on the Order list.

**Why this priority**: new capability requested in #289. Independent of Story 3.

**Independent Test**: on the Product list, apply status, type and search, save a view through
the same dialog as Story 1, reset the filters, select the view, and confirm the list returns to
the saved state.

**Acceptance Scenarios**:

1. **Given** status, type and search applied on the Product list, **When** the admin saves a view
   through the dialog of Story 1, **Then** the view stores exactly those three values and the
   chosen sharing.
2. **Given** the Stock chip is set to *Low* or *Out*, **When** the admin saves a view, **Then** the
   stock value is not stored; loading that view later leaves the Stock chip at *All*.
3. **Given** saved views exist, **When** the admin selects one from the selector, **Then**
   status, type and search are replaced by the view's values, the Stock chip returns to *All*,
   and the list reloads from the first page.
4. **Given** an admin with `catalog:read` but not `catalog:write`, **When** they open the Product
   list, **Then** they can save, load and delete their own views, private or shared.
5. **Given** a view was selected and then rows were selected for a bulk action, **When** another
   view is loaded, **Then** the row selection is cleared, as any filter change clears it today.
6. **Given** another admin's shared Product view, **When** a platform admin (Vocabulary — any
   role but `sales_representative`, e.g. a custom catalog-manager role) deletes it through the
   confirmation, **Then** it disappears for everyone; **when** an admin who is neither its owner
   nor a platform admin (a `sales_representative`) selects it, **Then** no delete control is
   available to them.

---

### User Story 3 — Saved views on the Quote Request list (Priority: P2)

A sales representative who works through pending requests of a few organizations saves that
setup as a view on the Quote Request list and re-applies it later, as on the Order list.

**Why this priority**: new capability requested in #290. Independent of Story 2.

**Independent Test**: on the Quote Request list, apply scope, organization, status, search, sort
and columns, save a view, reset, load it, and confirm the list returns to the saved state; load a
colleague's shared view and confirm it shows only requests the loader may see; then switch
`quote_requests` off and confirm every trace is gone.

**Acceptance Scenarios**:

1. **Given** scope, organization, status, search, sort and columns applied on the Quote Request
   list, **When** the admin saves a view through the dialog of Story 1, **Then** the view stores
   all six and the chosen sharing.
2. **Given** saved views exist, **When** the admin selects one, **Then** the captured state is
   replaced as in Story 2 scenario 3, and unknown column ids in the view are ignored.
3. **Given** a shared view with scope `mine` saved by admin A, **When** admin B loads it, **Then**
   the list shows the requests of organizations assigned to B, not to A.
4. **Given** a shared view with scope `all` saved by a platform admin (Vocabulary), **When** a
   sales representative loads it, **Then** the list shows only requests of organizations that
   representative may see — loading a view never widens what an admin can see.
5. **Given** a shared view whose captured organization the loader cannot see, **When** they load
   it, **Then** the list is empty and nothing on the screen discloses that organization's name.
6. **Given** an admin without `rfqs:handle`, **When** they call the Quote Request saved-view
   endpoints, **Then** they are refused as for the list itself.
7. **Given** Quote Requests off, **When** any client calls the Quote Request saved-view
   endpoints, **Then** they answer as every other `quote_requests` route answers while the module
   is off (the module route gate of `specs/conventions/module-activation.md`); **and when** the
   module is switched back on, **Then** the views saved before are all still there.

---

### Edge Cases

- **Same name, different owners** — allowed; one owner may not hold two views whose names share a
  name key on the same list (FR-022). The selector may therefore list an admin's own view and a
  colleague's shared view under the same name; the shared marker of FR-007 tells them apart.
- **Same name, different lists** — allowed; uniqueness is per owner per list.
- **Order views saved before this feature with duplicate names** — kept as they are; the rule
  applies to saves from now on (see Assumptions).
- **The view's owner is deleted or loses access to the list** — their shared views remain visible
  to others; only a platform admin (Vocabulary) can then delete them.
- **A view saved before a filter, column or sort option existed, or after one was removed** —
  unknown keys and values are ignored on load and the remaining state is applied; the list never
  errors because of a stale view.
- **A view stores a sales channel, payment method, delivery method or organization that was
  since deleted** — the view loads; the stale value yields no matches rather than an error.
- **The admin changes filters after loading a view** — the selector behaves as the Order list's
  does today; see Assumptions.
- **The view is deleted elsewhere while the delete confirmation is open** — confirming reports
  that the view no longer exists and the selector reloads; nothing else changes.
- **The selector reloads from the server after every save and every delete**, so a view created
  or removed in another tab appears or disappears at that point.
- **Quote Requests is switched off while the save dialog is open** — the save is refused by the
  server and the dialog shows the error (US1 scenario 10); no view is written.
- **Very long names** — rendered truncated in the selector without breaking the toolbar layout;
  the full name is available to assistive technology.

## Requirements *(mandatory)*

### Functional Requirements

**Save dialog and delete confirmation (US1, applies to all three lists)**

- **FR-001**: Saving a view and deleting a view on any of the three lists MUST each go through an
  in-app modal dialog built from the Admin UI design system. No native browser dialog (`prompt`,
  `confirm`, `alert`) may be part of either flow.
- **FR-002**: The save dialog MUST collect, in one step, the view's name and whether it is shared,
  replacing both the current name prompt and the separate share confirmation. The share control
  MUST start at private.
- **FR-003**: The name MUST be required, MUST be trimmed of leading and trailing whitespace before
  validation and storage, and MUST be at most 160 characters (the Order list's existing limit).
  Violations MUST be shown inline on the field, announced to assistive technology, and MUST
  prevent the request.
- **FR-004**: Each dialog MUST have an accessible name (its title), MUST move focus into itself on
  open (the save dialog to the name field), MUST trap focus while open, MUST close on Escape, on
  *Cancel* and on a backdrop click without acting, and MUST return focus to the control that
  opened it — except after a confirmed deletion, when focus moves to the view selector because
  the opening control is disabled.
- **FR-005**: While a save or a delete is in flight the dialog MUST show a busy state, MUST
  refuse a second submission, and MUST NOT close on Escape or backdrop click.
- **FR-006**: A server refusal or failure MUST be shown inside the open dialog, with the admin's
  input preserved in the save dialog.
- **FR-007**: The saved-views controls on every list MUST have translated accessible names, and a
  shared view MUST be distinguishable from a private one in text available to assistive
  technology, not by a symbol alone.
- **FR-022**: One owner MUST NOT hold two views on the same list whose names share a name key
  (trimmed, case-insensitive). The save dialog MUST reject such a name inline before sending the
  request, and the server MUST refuse it independently — on create and on a rename through the
  modify endpoint — with a conflict response carrying a translated message, so that two
  concurrent saves under one name leave exactly one view. Names of other owners' views, and of
  views on other lists, do not count.
- **FR-023**: The delete confirmation MUST name the view being deleted and, when the view is
  shared, state that it will disappear for every admin who can open the list. Nothing is deleted
  until the admin confirms.

**Saved views on the Product and Quote Request lists (US2, US3)**

- **FR-008**: The Product list and the Quote Request list MUST each offer the saved-views
  capability the Order list offers: a selector listing the admin's own views and every shared
  view of that list, ordered by name; saving the current captured state as a new view, private or
  shared; loading a view; deleting a view the admin may delete. No rename, re-share or overwrite
  is offered in the Admin UI on any of the three lists.
- **FR-009**: A saved view MUST belong to exactly one list. Views of one list MUST NOT appear on
  another.
- **FR-010**: The Product list's captured state MUST be its status, type and search text, and
  nothing else — the Stock, Category and Channel chips are not stored. The Quote Request list's
  captured state MUST be its visibility scope, organization, status selection, search text, sort
  and column selection.
- **FR-011**: Loading a view MUST replace every captured part of the list's state with the view's
  values, resetting parts the view does not hold to the list's defaults (on the Product list this
  includes the Stock chip), and MUST return the list to its first page.
- **FR-012**: Loading a view MUST tolerate stored values the list no longer knows: unknown filter
  keys, values and column ids are ignored, and an empty or absent column selection falls back to
  the list's default columns.
- **FR-013**: Visibility, ownership and modification rules for Product and Quote Request views
  MUST be those of Order views: an admin sees their own views and every shared view; another
  admin's private view is indistinguishable from one that does not exist; a shared view may be
  modified or deleted only by its owner or a platform admin as defined in the Vocabulary (any
  role but `sales_representative`, not the `platform_admin` role code alone). The same test
  applies on all three lists.
- **FR-014**: The delete control MUST be available only for a view the current admin may delete —
  their own views and, for a platform admin (Vocabulary), shared views of others; a
  `sales_representative` sees it only on their own views.

**Permissions, tenancy, activation**

- **FR-015**: No new permission code is introduced. Listing, saving, modifying and deleting views
  are gated by the code that gates reading the list: `orders:read` (unchanged), `catalog:read`
  for the Product list, `rfqs:handle` for the Quote Request list.
- **FR-016**: Loading a saved view MUST NOT widen what the loader can see. Every list query issued
  after loading a view runs under the loader's own permissions and tenant scope; the Quote
  Request scope `mine` resolves against the admin who loads the view, not the one who saved it.
- **FR-017**: Nothing about a view — its name aside — may disclose to its loader data from
  organizations outside the loader's scope (e.g. an organization's name resolved from a captured
  organization id).
- **FR-018**: When Quote Requests is off, its saved-view endpoints MUST be gated with the rest of
  the module's routes and answer as they do (the route gate of
  `specs/conventions/module-activation.md`, not a per-handler check), and no Quote Request
  saved-view control may render anywhere. Switching the module off MUST NOT delete stored views;
  switching it back on restores them unchanged.
- **FR-019**: No new command-palette entry is introduced: saved views are a control on an existing
  surface, not a surface of their own.

**Language and documentation**

- **FR-020**: Every new or changed user-facing string — dialog titles, labels, buttons, validation
  and error messages (including the duplicate-name conflict), accessible names, selector
  placeholder — MUST ship in English and Polish.
- **FR-021**: The module documentation for orders, catalog and quote requests MUST describe saved
  views as shipped (what is captured, private versus shared, the duplicate-name rule, who may
  delete), for both the operator and the engineer audience. "Who may delete" MUST state plainly
  that any admin whose role is not `sales_representative` can modify or delete a colleague's
  shared view, and that such a deletion leaves no audit trail (see *Assumptions*), so an
  operator can decide which roles to grant before relying on shared views.

### Key Entities

- **Saved view** — owner (an admin user), name, shared flag, the list it belongs to, and the
  captured state of that list. Unique per owner, list and name key. Platform-global personal
  configuration, not organization-owned data: it holds filter values, never list results.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero `window.prompt` and `window.confirm` calls remain in the saved-views save and
  delete flows of the three lists (a repository search over their admin sources returns none for
  those flows).
- **SC-002**: An admin can save, load and delete a view on each of the three lists using only the
  keyboard, and an automated accessibility check of each open dialog reports no violation at the
  WCAG 2.2 AA level.
- **SC-003**: Every string the feature adds resolves in both English and Polish; none renders as a
  raw translation key.
- **SC-004**: Each acceptance scenario above and each FR is covered by at least one automated
  test, including: a non-owner's refusal, the platform-admin override, a shared view's visibility
  to another admin, the server-side duplicate-name refusal, the loader-scope rule of FR-016, and
  the Quote Requests off-state of FR-018.
- **SC-005**: Reapplying a saved setup on the Product or Quote Request list takes one selection
  instead of re-entering every filter.

## Assumptions

- **Unchanged Order list rules except naming and dialogs**: the Order list's captured state,
  visibility rules, permission gate and storage stay as they are; US1 changes how a view is named,
  shared on save and deleted, adds the duplicate-name rule, and fixes the accessibility of the
  controls.
- **Existing duplicates are left alone**: Order views that already share a name key with another
  view of the same owner are neither renamed nor removed; FR-022 applies to saves and renames from
  this feature on.
- **The selector does not show a shared view's owner**, as on the Order list today.
- **No default view**: no view is applied automatically when a list opens, as on the Order list
  today.
- **No limit** on the number of views per admin or per list, as on the Order list today.
- **No audit trail**: saved-view writes stay outside Command Bus auditing, following the existing
  `command-coverage-ignore` precedent on orders and returns (personal UI configuration, not a
  domain mutation). Constitution XIII is therefore not engaged.
- **Shared views outlive their owner's access**: a shared view stays visible to others when its
  owner leaves or loses the list permission, as on the Order list today.
- **Selector after divergence**: after loading a view and then changing filters, the selector
  behaves as the Order list's does today; making it reflect divergence is not requested by the
  issues.
- **No URL encoding**: saved views are not expressed in the page URL, and a view is not
  shareable as a link.
- **Known, accepted divergence — two meanings of "platform admin" on the Quote Request list**:
  saved views use the Vocabulary's definition (any role but `sales_representative`), while the
  Quote Request list's default visibility scope and its `listAll` visibility still key on the
  literal `role.code === 'platform_admin'`: the admin context resolver sets
  `isPlatformAdmin: role?.code === 'platform_admin'`
  (`packages/modules/quote_requests/src/backend/index.ts:257`), `listAll` skips its
  organization-visibility filter when that flag is set
  (`packages/modules/quote_requests/src/backend/services/rfq-admin-service.ts:144`, the branch
  at `:156`), and the list page picks its default scope from the same role code
  (`packages/modules/quote_requests/src/admin/pages/RfqList.tsx:110`, applied at `:121`).
  Line numbers measured at `54c9f8c72`. So an admin with, say, a
  custom catalog-manager role may delete a colleague's shared Quote Request view yet opens the
  list on scope `mine`. This feature does not change the Quote Request list's rule; aligning
  the two is a separate decision.

## Out of scope

- **Follow-up candidates — other native dialogs in the Admin UI** (owner ruling, Q5):
  - the rejection-reason `window.prompt` in
    `packages/modules/returns/src/admin/pages/ReturnDetail.tsx:141`;
  - the `window.confirm` calls in 21 admin files across `sales_channels`, `blog`,
    `transactional_emails`, `settings`, `product_feeds`, `meta_ads`, `linkedin_ads`, `inventory`,
    `credentials`, `assets_library`, `orders` (outside the saved-views flow) and the admin
    shell's module activation control (see *Current state*).
- A saved-views UI on the Returns list, and aligning Returns' divergent backend rules (name limit
  200, owner-only modification, 403 for a non-owner) with this feature's.
- Making the Product list's Category, Channel and Stock chips functional, or adding a sort control
  or a column picker to the Product list.
- Renaming, re-sharing or overwriting an existing view from the Admin UI (owner ruling, Q3); the
  modify endpoint stays available to API clients under FR-013 and FR-022.
- Default views, per-user pinning, ordering views manually, and views shared with a subset of
  admins (by role or by user).

## Clarifications

### Session 2026-10-14

- Q: On the Product and Quote Request lists, may a view be shared with everyone who can open the
  list? → A: Yes — private or shared, chosen in the save dialog, exactly as on the Order list
  (FR-002, FR-008).
- Q: What does a view capture on each new list? → A: Product list — status, type and search text
  only; the Stock, Category and Channel chips are not saved. Quote Request list — everything:
  visibility scope, organization, status, search text, sort and columns; `mine` resolves against
  the admin loading the view, and the server still narrows visibility (FR-010, FR-011, FR-016).
- Q: Beyond save, load and delete, may views be managed, and may one owner hold two views with
  the same name? → A: Only save, load and delete in the Admin UI — no rename, re-share or
  overwrite. A name the same owner already uses on that list is rejected inline by the dialog and
  refused by the server as a conflict with a translated message. Names are compared trimmed and
  case-insensitive (the rule the owner delegated to the specification) (FR-008, FR-022).
- Q: Who may modify or delete a shared view? → A: Its owner or a platform admin, as on the Order
  list (FR-013, FR-014).
- Q: How far does the new dialog reach? → A: The save flow and a confirmation before deleting a
  view. The Returns rejection-reason prompt and the 21 files calling `window.confirm` stay out of
  scope as a follow-up (FR-001, FR-023, *Out of scope*).
- Q: Are the defaults the first draft chose acceptable — 160-character limit with trimming,
  backdrop click closes a dialog, loading a view resets uncaptured parts and returns to page 1,
  delete control only where deletion is allowed, no new permission code, the `quote_requests`
  module route gate for the off-state, no default view, no limit, no audit? → A: Accepted as
  stated (FR-003, FR-004, FR-011, FR-014, FR-015, FR-018, *Assumptions*).
- Q: Who counts as a "platform admin" for modifying/deleting another admin's shared view? → A: Any admin role except sales_representative — the Order list's existing rule; not the platform_admin role code.

A second clarify pass over the amended specification (functional scope, data, interaction and
UX, non-functional attributes, integration, edge cases, constraints, terminology, completion
signals) found no remaining question whose answer would change behaviour or tests. The choices
made without a ruling are stated as assumptions above — chiefly that pre-existing duplicate Order
view names are left alone and that the share control starts at private — and can be overturned
by amendment.

## Constraints from the constitution and the conventions

- **I. Modular architecture** — each list's saved views are owned by the module that owns the
  list; whether the mechanism is shared or copied per module is a planning decision, not a
  behavioural one, and is left to `/speckit.plan`.
- **II. API-first** — new request/response shapes, and the duplicate-name conflict, are defined
  in `packages/contracts/` first.
- **III. TDD** — SC-004.
- **IX. UI reuse** — both dialogs are built from the design system; the planner decides whether
  they become a kit primitive (see the module-private candidate in `crm`) or are composed per
  screen.
- **XI. Multi-tenant isolation** — FR-016, FR-017; saved views must be classified for the tenancy
  guard (platform-global, as both existing copies are).
- **XVI. Command palette** — FR-019.
- **XVII. Operator-toggleable modules** — FR-018 binds `quote_requests`; `orders` and `catalog`
  are non-deactivatable (`packages/modules/orders/src/manifest.ts:655`,
  `packages/modules/catalog/src/manifest.ts:347`). Read `specs/conventions/module-activation.md`
  before planning the off-state.
- **i18n** — FR-020; `specs/conventions/module-i18n.md` decides which bundle the strings go in.
- **Admin surfaces** — FR-015 adds no permission code; `specs/conventions/module-admin-surfaces.md`.
