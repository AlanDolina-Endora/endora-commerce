# Feature Specification: Saved list views — a design-system save dialog, and saved views on the Product and Quote Request lists

**Feature Branch**: `feat/147-saved-views` (spec directory `specs/147-saved-views/`)
**Created**: 2026-10-14
**Status**: Draft — five open questions under *Clarifications*; not ready for `/speckit.plan`
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
- **Captured state** — what a saved view remembers for its list: the applied filters, and where
  the list has them, the search text, the sort and the column selection. Which parts are
  captured on the Product and Quote Request lists is open (*Clarifications*, Q2).
- **Saved view** — a named captured state for one list, owned by the admin user who saved it.
- **Private / shared** — a private view is visible to its owner only; a shared view is visible to
  every admin who can open that list.
- **Save dialog** — the design-system modal that replaces the native `prompt()` / `confirm()`
  pair when a view is saved.
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
| The default scope depends on who is looking: `all` for a platform admin, `mine` otherwise | same file `:108-112` |
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

### User Story 1 — Save an Order list view through a design-system dialog (Priority: P1)

An admin has narrowed the Order list to the orders they work through every morning. They press
*Save view*. Instead of the browser's grey prompt and a second grey confirmation, a dialog in the
Admin UI's own style opens, asking for a name and offering to share the view with colleagues in
the same place. They type a name, press Enter, and the view appears in the saved-views selector.

**Why this priority**: it is a defect in shipped behaviour (#288), it is the smallest slice, and
the dialog it introduces is the save flow the other two stories reuse.

**Independent Test**: on the Order list, apply filters, open the save dialog, operate it with the
keyboard only, save a private view and a shared view, and confirm no native browser dialog
appears at any point and both views load back the captured state.

**Acceptance Scenarios**:

1. **Given** filters applied on the Order list, **When** the admin activates *Save view*,
   **Then** a modal dialog opens with a labelled name field focused and a share control, and no
   native browser dialog appears.
2. **Given** the dialog is open, **When** the admin enters a name and submits (button or Enter),
   **Then** the view is saved with the current captured state and the chosen sharing, the dialog
   closes, focus returns to *Save view*, and the new view is listed in the selector.
3. **Given** the dialog is open, **When** the admin submits an empty or whitespace-only name,
   **Then** the dialog stays open and shows an inline, announced validation message on the field;
   nothing is saved.
4. **Given** the dialog is open, **When** the admin enters a name longer than the limit, **Then**
   the dialog tells them so before any request is sent; nothing is saved.
5. **Given** the dialog is open, **When** the admin presses Escape, activates *Cancel* or clicks
   the backdrop, **Then** the dialog closes, nothing is saved, and focus returns to *Save view*.
6. **Given** the save is in flight, **When** the admin presses Escape or clicks the backdrop,
   **Then** the dialog does not close, the submit control shows it is busy, and a second submit
   is impossible.
7. **Given** the server refuses or fails the save, **When** the response arrives, **Then** the
   dialog stays open with the admin's input intact and shows the error inside the dialog.
8. **Given** the dialog is open, **When** the admin presses Tab repeatedly, **Then** focus cycles
   within the dialog and never reaches the page behind it.
9. **Given** the Admin UI is in Polish, **When** the dialog opens, **Then** its title, field
   label, share control, buttons, validation and error messages are in Polish; likewise in
   English.
10. **Given** the saved-views controls are rendered, **When** read by a screen reader, **Then**
    the save and delete buttons have translated accessible names and a shared view is announced
    as shared, not only marked by a symbol.

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

1. **Given** filters applied on the Product list, **When** the admin saves a view, **Then** the
   save dialog of Story 1 is used and the view stores the Product list's captured state (Q2).
2. **Given** saved views exist, **When** the admin selects one from the selector, **Then** every
   captured part of the list's state is replaced by the view's values — filters not stored in
   the view return to their defaults rather than keeping their previous values — and the list
   reloads from the first page.
3. **Given** an admin with `catalog:read` but not `catalog:write`, **When** they open the Product
   list, **Then** they can save, load and delete their own views.
4. **Given** a selected view the admin may delete, **When** they delete it, **Then** it disappears
   from the selector and the current filters are left as they are.
5. **Given** a view was selected and then rows were selected for a bulk action, **When** another
   view is loaded, **Then** the row selection is cleared, as any filter change clears it today.

---

### User Story 3 — Saved views on the Quote Request list (Priority: P2)

A sales representative who works through pending requests of a few organizations saves that
setup as a view on the Quote Request list and re-applies it later, as on the Order list.

**Why this priority**: new capability requested in #290. Independent of Story 2.

**Independent Test**: on the Quote Request list, apply status, search, sort and columns (and,
depending on Q2, scope and organization), save a view, reset, load it, and confirm the list
returns to the saved state; then switch `quote_requests` off and confirm every trace is gone.

**Acceptance Scenarios**:

1. **Given** filters applied on the Quote Request list, **When** the admin saves a view, **Then**
   the save dialog of Story 1 is used and the view stores the Quote Request list's captured state
   (Q2).
2. **Given** saved views exist, **When** the admin selects one, **Then** the captured state is
   replaced as in Story 2 scenario 2, and unknown column ids in the view are ignored.
3. **Given** a shared view that captures a visibility scope or an organization (if Q2 captures
   them), **When** another admin loads it, **Then** the list shows only requests that admin may
   already see — loading a view never widens what an admin can see, and `mine` means the loader's
   own assignments, not the author's.
4. **Given** a shared view whose captured organization the loader cannot see, **When** they load
   it, **Then** the list is empty and nothing on the screen discloses that organization's name.
5. **Given** an admin without `rfqs:handle`, **When** they call the Quote Request saved-view
   endpoints, **Then** they are refused as for the list itself.
6. **Given** Quote Requests off, **When** any client calls the Quote Request saved-view
   endpoints, **Then** they answer as every other `quote_requests` route answers while the module
   is off (the module route gate of `specs/conventions/module-activation.md`); **and when** the module
   is switched back on, **Then** the views saved before are all still there.

---

### Edge Cases

- **Two admins save views with the same name** — allowed today on orders; whether one owner may
  hold two views with the same name is open (Q3).
- **The view's owner is deleted or loses access to the list** — their shared views remain visible
  to others (assumption below); nobody but a platform admin (if Q4 keeps the override) can then
  edit or delete them.
- **A view saved before a filter, column or sort option existed, or after one was removed** —
  unknown keys and values are ignored on load and the remaining state is applied; the list never
  errors because of a stale view.
- **A view stores a sales channel, payment method, delivery method or organization that was
  since deleted** — the view loads; the stale value yields no matches rather than an error.
- **The admin changes filters after loading a view** — the selector behaviour (still showing the
  view's name or reverting to "no view") stays as the Order list behaves today; see Assumptions.
- **Saving while another tab deleted the view list's last view** — the save succeeds; the
  selector reloads from the server after every save and delete.
- **Product list stock chip** — capturing a state whose stock value empties the list by design is
  open (Q2).
- **Quote Requests is switched off while the dialog is open** — the save is refused by the server
  and the dialog shows the error (US1 scenario 7); no view is written.
- **Very long names** — rendered truncated in the selector without breaking the toolbar layout;
  the full name is available to assistive technology.

## Requirements *(mandatory)*

### Functional Requirements

**Save dialog (US1, applies to all three lists)**

- **FR-001**: Saving a view on any of the three lists MUST open an in-app modal dialog built from
  the Admin UI design system. No native browser dialog (`prompt`, `confirm`, `alert`) may be part
  of the save flow.
- **FR-002**: The dialog MUST collect, in one step, the view's name and whether it is shared,
  replacing both the current name prompt and the separate share confirmation.
- **FR-003**: The name MUST be required, MUST be trimmed of leading and trailing whitespace before
  validation and storage, and MUST be at most 160 characters (the Order list's existing limit).
  Violations MUST be shown inline on the field, announced to assistive technology, and MUST
  prevent the request.
- **FR-004**: The dialog MUST have an accessible name (its title), MUST move focus to the name
  field on open, MUST trap focus while open, MUST close on Escape and on *Cancel* (and on a
  backdrop click) without saving, and MUST return focus to the control that opened it.
- **FR-005**: While a save is in flight the dialog MUST show a busy state, MUST refuse a second
  submission, and MUST NOT close on Escape or backdrop click.
- **FR-006**: A server refusal or failure MUST be shown inside the open dialog with the admin's
  input preserved.
- **FR-007**: The saved-views controls on every list MUST have translated accessible names, and a
  shared view MUST be distinguishable from a private one in text available to assistive
  technology, not by a symbol alone.

**Saved views on the Product and Quote Request lists (US2, US3)**

- **FR-008**: The Product list and the Quote Request list MUST each offer the saved-views
  capability the Order list offers: a selector listing the admin's own views and every shared
  view of that list, ordered by name; saving the current captured state as a new view; loading a
  view; deleting a view the admin may delete.
- **FR-009**: A saved view MUST belong to exactly one list. Views of one list MUST NOT appear on
  another.
- **FR-010**: The Product list's captured state MUST be [NEEDS CLARIFICATION: Q2]; the Quote
  Request list's captured state MUST be [NEEDS CLARIFICATION: Q2].
- **FR-011**: Loading a view MUST replace every captured part of the list's state with the view's
  values, resetting parts the view does not hold to the list's defaults, and MUST return the list
  to its first page.
- **FR-012**: Loading a view MUST tolerate stored values the list no longer knows: unknown filter
  keys, values and column ids are ignored, and an empty or absent column selection falls back to
  the list's default columns.
- **FR-013**: Visibility, ownership and modification rules for Product and Quote Request views
  MUST be the same as for Order views (subject to Q1 and Q4): an admin sees their own views and
  every shared view; another admin's private view is indistinguishable from one that does not
  exist; only the owner [NEEDS CLARIFICATION: Q4 — and a platform admin?] may modify or delete a
  shared view.
- **FR-014**: The delete control MUST NOT be offered as available for a view the current admin
  may not delete.

**Permissions, tenancy, activation**

- **FR-015**: No new permission code is introduced. Listing, saving, modifying and deleting views
  are gated by the code that gates reading the list: `orders:read` (unchanged), `catalog:read`
  for the Product list, `rfqs:handle` for the Quote Request list.
- **FR-016**: Loading a saved view MUST NOT widen what the loader can see. Every list query issued
  after loading a view runs under the loader's own permissions and tenant scope; relative values
  such as the Quote Request scope `mine` resolve against the loader.
- **FR-017**: Nothing about a view — its name aside — may disclose to its loader data from
  organizations outside the loader's scope (e.g. an organization's name resolved from a captured
  organization id).
- **FR-018**: When Quote Requests is off, its saved-view endpoints MUST be gated with the rest of
  the module's routes and answer as they do (the route gate of
  `specs/conventions/module-activation.md`, not a per-handler check), and no Quote Request
  saved-view control may render anywhere. Switching the module off MUST NOT
  delete stored views; switching it back on restores them unchanged.
- **FR-019**: No new command-palette entry is introduced: saved views are a control on an existing
  surface, not a surface of their own.

**Language and documentation**

- **FR-020**: Every new or changed user-facing string — dialog title, labels, buttons, validation
  and error messages, accessible names, selector placeholder — MUST ship in English and Polish.
- **FR-021**: The module documentation for orders, catalog and quote requests MUST describe saved
  views as shipped (what is captured, private versus shared, who may modify or delete), for both
  the operator and the engineer audience.

### Key Entities

- **Saved view** — owner (an admin user), name, shared flag, the list it belongs to, and the
  captured state of that list. Platform-global personal configuration, not organization-owned
  data: it holds filter values, never list results.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero `window.prompt` and `window.confirm` calls remain in the saved-views flow of the
  three lists (a repository search over their admin sources returns none for that flow).
- **SC-002**: An admin can save, load and delete a view on each of the three lists using only the
  keyboard, and an automated accessibility check of the open dialog reports no violation at the
  WCAG 2.2 AA level.
- **SC-003**: Every string the feature adds resolves in both English and Polish; none renders as a
  raw translation key.
- **SC-004**: Each acceptance scenario above and each FR is covered by at least one automated
  test, including: a non-owner's refusal, a shared view's visibility to another admin, the
  loader-scope rule of FR-016, and the Quote Requests off-state of FR-018.
- **SC-005**: Reapplying a saved setup on the Product or Quote Request list takes one selection
  instead of re-entering every filter.

## Assumptions

- **Unchanged Order list rules**: the Order list's captured state, visibility rules, permission
  gate and storage stay as they are; US1 changes only how a view is named and shared on save, and
  the accessibility of the controls.
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

## Out of scope

- The rejection-reason `window.prompt` in `packages/modules/returns/src/admin/pages/ReturnDetail.tsx:141`
  and the 21 admin files that call `window.confirm` (see *Current state*), unless Q5 rules
  otherwise. They are candidates for a follow-up issue.
- A saved-views UI on the Returns list, although its backend exists unused.
- Making the Product list's Category, Channel and Stock chips functional, or adding a sort control
  or a column picker to the Product list.
- Renaming, re-sharing or overwriting an existing view from the UI, unless Q3 brings it in.
- Default views, per-user pinning, ordering views manually, and views shared with a subset of
  admins (by role or by user).

## Clarifications

Open — none answered yet. Each question is recorded with the options considered; the answers
come from the owner and will be recorded here as rulings, with the FRs they touch reworded.

- **Q1 — Sharing on the new lists.** On the Product and Quote Request lists, may a view be shared
  with everyone who can open the list (as on the Order list), or are views private only?
  Options: (A) private and shared, chosen in the save dialog, exactly as orders;
  (B) private only on the new lists; (C) shared by default, with an opt-out.
- **Q2 — What a view captures on each new list.** Product list: (A) status, type and search text
  only; (B) as A plus the stock chip, which empties the list by design today; (C) as A, and the
  view is extended automatically when Category/Channel become real filters.
  Quote Request list: (A) every control on the screen — scope, organization, status, search,
  sort and columns; (B) only the browser-side state — status, search, sort, columns — leaving
  scope and organization at their per-user defaults; (C) as A but without organization.
- **Q3 — Managing existing views.** Beyond save, load and delete: (A) nothing more, as on the
  Order list today; (B) rename and toggle sharing through the same dialog; (C) as B plus
  "update this view with the current filters". And may one admin hold two views with the same
  name on the same list: (i) yes, as today; (ii) no — the dialog refuses the duplicate;
  (iii) saving under an existing name of one's own offers to overwrite it.
- **Q4 — Platform-admin override on shared views.** Orders lets a platform admin modify or delete
  anyone's shared view; Returns lets only the owner. Which rule governs the Product and Quote
  Request lists (and, for consistency, should orders keep its rule)? Options: (A) owner or
  platform admin, as orders; (B) owner only, as returns; (C) owner, or any admin holding the
  list's write permission (`orders:write`, `catalog:write`).
- **Q5 — Reach of the new dialog.** Should this feature also: (A) nothing beyond the save flow;
  (B) put a design-system confirmation in front of deleting a saved view (deletion is immediate
  today); (C) as B plus replace the Returns rejection-reason prompt; (D) replace every native
  `prompt`/`confirm` in the Admin UI.

## Constraints from the constitution and the conventions

- **I. Modular architecture** — each list's saved views are owned by the module that owns the
  list; whether the mechanism is shared or copied per module is a planning decision, not a
  behavioural one, and is left to `/speckit.plan`.
- **II. API-first** — new request/response shapes are defined in `packages/contracts/` first.
- **III. TDD** — SC-004.
- **IX. UI reuse** — the dialog is built from the design system; the planner decides whether it is
  a new kit primitive (see the module-private candidate in `crm`) or composed per screen.
- **XI. Multi-tenant isolation** — FR-016, FR-017; saved views must be classified for the tenancy
  guard (platform-global, as both existing copies are).
- **XVI. Command palette** — FR-019.
- **XVII. Operator-toggleable modules** — FR-018 binds `quote_requests`; `orders` and `catalog`
  are non-deactivatable (`packages/modules/orders/src/manifest.ts:655`,
  `packages/modules/catalog/src/manifest.ts:347`). Read `specs/conventions/module-activation.md`
  before planning the off-state.
- **i18n** — FR-020; `specs/conventions/module-i18n.md` decides which bundle the strings go in.
- **Admin surfaces** — FR-015 adds no permission code; `specs/conventions/module-admin-surfaces.md`.
