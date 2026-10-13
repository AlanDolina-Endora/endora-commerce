# Feature Specification: Admin product picker (orders, quote requests, price lists)

**Feature Branch**: `feat/145-admin-product-picker` (spec directory `specs/145-admin-product-picker/`)
**Created**: 2026-10-13
**Status**: Draft — one clarify session held 2026-10-13; clarify pending, 2 open questions (see *Open questions*)
**Input**: Product owner's request, summarised in English. Three admin screens that put products
onto a document — **Create order** (`/orders/new`), **Create quote request**
(`/quote-requests/new`) and a price list's **Products & brackets** tab (`/price-lists/:id`) — make
the operator find products one at a time through a single-product search. The operator wants the
same filterable, paginated product table the **Products** list (`/catalog/products`) offers, with
multi-select, so that many products can be added in one action; after adding, the operator sets
quantity (orders, quote requests) and agreed unit price (quote requests), and sees unit price and
line total (orders). On **Create order**, the **Items** and **Order summary** sections should not
be shown until the inputs that pricing needs are set in **Customer & methods**.

## What the product does today (measured on `origin/master` at `8c2be9fba`, release 0.106.0)

Section labels are the `en` strings of the `core` bundle
(`packages/modules/_i18n/i18n/en.json`); the key is cited where it matters. No changeset is pending
in `.changeset/`; the 0.105.0 and 0.106.0 changelog entries of `mod-catalog`, `mod-orders`,
`mod-quote-requests`, `mod-price-lists`, `mod-i18n` and `admin-kit` were read, and the one that
touches these screens (per-channel delivery and payment methods, 0.105.0) is reflected below.

### Products list (`/catalog/products`) — the screen to mirror

- `packages/modules/catalog/src/admin/pages/ProductsList.tsx`. A hand-built `b2b-*` table with
  `PaginationFooter` from `@endora-commerce/admin-kit/components`; page size remembered per screen
  through `usePageSizePreference('catalog-products')`.
- Columns: checkbox, product (colour swatch placeholder + `en-US` name, the `pl-PL` name as a second
  line when it differs), SKU, status, type, visibility, updated, and an empty row-action button.
- **Filters that filter** (sent to `GET /api/v1/admin/catalog/products`): status tabs with counts
  (All / Active / Draft / Inactive → `status`), a Type chip cycling simple / configurable / grouped /
  bundle / virtual (`type`), and a 250 ms debounced text search (`q`). The search matches **SKU,
  slug and name** (`catalog-admin.service.ts`, `listProducts`). The list always sends
  `includeArchived=1`, `page` (0-based) and `pageSize`.
- **Filters that do not filter**: the Stock chip is a client-side kill switch (any value other than
  "all" shows zero rows); the Category and Channel chips have empty click handlers. The endpoint
  accepts `categorySlug`; the list never sends it.
- Endpoint: `packages/modules/catalog/src/backend/routes.admin.ts` (`GET
  /api/v1/admin/catalog/products`), gated `catalog:read`; default page size 20, maximum 500, newest
  first (`catalog-admin.service.ts`, `listProducts`). A row (`serializeAdminProduct`) carries id,
  SKU, slug, type, status, localized name, visibility, `allowedOrganizationIds`, stock flags and the
  raw `attributeValues` — no resolved price, no stock quantity, no variant count.
- `POST /api/v1/admin/catalog/products/batch-by-id` (same file, gated `catalog:read`; contract
  `batchByIdProductsRequestSchema` in `packages/contracts/src/catalog.ts`, at most 500 ids,
  paginated, archived rows included) reads products by id. None of the three host screens uses it.
- Bulk selection: a per-page id set; when the whole page is selected a banner offers "select all N
  matching", which freezes the filter and resolves ids through `POST
  /api/v1/admin/catalog/products/resolve-ids` (`admin/lib/resolve-product-selection.ts`, hard
  maximum 10 000). **Any filter change clears the selection** (feature 033 FR-006); the header
  checkbox replaces the selection with the current page.
- The status pill, the visibility label and the relative "updated" time are hard-coded English.

### Existing single-product picker

- `packages/admin-kit/src/components/product-picker/ProductPicker.tsx` — a combobox (`mode:
  "select" | "multiselect"`) over the same list endpoint: page 0 only, 20 results, search only, no
  filters, no table, no pagination. It omits `includeArchived` by default, so inactive products are
  not offered; drafts are, with a `· draft` suffix. It accepts `excludeIds`. Its strings are
  `productPicker.*` in `core`. Used by both create screens below (and by `seo`).

### Create quote request (`/quote-requests/new`)

- `packages/modules/quote_requests/src/admin/pages/RfqCreatePage.tsx`; route gated `rfqs:handle`
  (`packages/modules/quote_requests/src/admin/index.ts`).
- Sections: **Customer** (`rfqCreate.section.customer`; customer combobox, organization derived from
  the customer; a warning when the customer has no organization), **Line items**
  (`rfqCreate.section.items`; one row per line: single-product combobox + quantity + agreed unit
  price + remove; **Add line**; running total), **Options** (header note, expiry days).
- The page can be opened with `organizationId`, `customerAccountId`, `originType`/`originId` and
  `returnTo` in the query string (feature 143); the customer then arrives chosen.
- The agreed unit price is prefilled per line from `GET /api/v1/admin/products/:id/resolved-price`
  (`packages/modules/price_lists/src/backend/routes.ts`, gated `price_lists:read`) with organization,
  customer and quantity. The route always prices on the **system default sales channel** and its
  default currency. A failure leaves the field empty. Changing the customer **or the quantity**
  re-resolves and overwrites the price, including one typed by hand.
- Lines with no product, quantity ≤ 0 or an empty price are silently dropped from the submit; submit
  needs an organization and at least one valid line. Payload: `POST /api/v1/admin/quote-requests`,
  items `{productId, variantId?, quantity, agreedUnitPrice, lineNote?}`
  (`adminCreateQuoteRequestLineSchema`, `packages/contracts/src/quote-requests.ts`;
  `agreedUnitPrice` is required and may be 0). The page never sends `variantId` and has no input for
  `lineNote`.
- The server (`RfqAdminService.createOnBehalf`) refuses an unknown product id and checks neither
  product status nor type; it is exempt from the visibility and channel-assortment filters by
  ruling (see `isProductVisibleTo` in `packages/contracts/src/catalog.ts`).

### Create order (`/orders/new`)

- `packages/modules/orders/src/admin/pages/OrderCreatePage.tsx`; route gated `orders:write`
  (`packages/modules/orders/src/admin/index.ts`). Above the form, the `order.entry.tabs` zone shows
  the **Standard** / **Quick order** tab strip; the Quick order tab is `quick_order`'s separate
  screen (`/orders/quick-order`) and is not part of this feature.
- Sections, in order: **Customer & methods** (`orderCreate.section.parties`; customer, sales
  channel, payment method, delivery method, delivery and billing address), **Items**
  (`orderCreate.section.items`; single-product combobox + quantity rows, unit price and line total
  shown once priced, **No price** — `orderCreate.line.unavailable`, PL "Brak ceny" — when the
  preview marks the line unavailable; **Add item**), **Order summary** (`orderCreate.summary.title`;
  subtotal, tax, delivery, payment surcharge, discount, total), then the note and submit.
- **Items is always visible**, including before a customer is chosen. Order summary renders only
  once a price preview exists.
- Since 0.105.0 the payment and delivery selects offer only the methods of the chosen sales channel
  (`methodsOfferedInChannel`), and a method the new channel does not offer is cleared.
- The page can be opened with `organizationId`, `customerAccountId`, `salesChannelId`,
  `originType`/`originId` and `returnTo` in the query string (feature 143); customer and channel
  then arrive chosen. An unsaved-changes prompt (`useUnsavedChangesPrompt`) fires when the form is
  dirty, and lines count towards dirtiness.
- Pricing: a debounced `POST /api/v1/admin/orders/preview` (`packages/modules/orders/src/backend/routes.ts`;
  `adminOrderPreviewRequestSchema` in `packages/contracts/src/orders.ts`) fires once **customer +
  sales channel + at least one line** are set; delivery and payment methods are optional inputs that
  add delivery cost and surcharge. Response lines carry `unitPrice`, `currency`, `lineTotal`,
  `unavailable`; the response adds a summary and per-product `messages` (`PRODUCT_NOT_FOUND`,
  `QUOTE_ONLY`). Any message blocks submit. A product without an applicable price list is priced
  from its catalogue `defaultPrice`/`price` attribute, possibly 0.00. A customer without an
  organization makes the preview fail (422), which the page shows as **Could not calculate prices**
  (`orderCreate.preview.error`) without blocking submit.
- Submit needs customer, channel, delivery method, payment method, both addresses, at least one line
  and no preview message; lines with quantity ≤ 0 are silently dropped. Items `{productId,
  variantId?, quantity}` (`adminCreateOrderRequestSchema`); the page never sends `variantId`.
- The order is created by filling the customer's cart line by line
  (`order-creation-admin-service.ts` → `CartService.addItem`), which refuses a product the customer
  may not see (`isProductVisibleTo`: `allowedOrganizationIds`, `organization_restricted`,
  `logged_in_only`) or one outside the **request's** sales channel (`outOfRequestChannel`) with
  `404 PRODUCT_NOT_FOUND`. The preview runs neither check. Nothing on the server refuses a product
  for its status or type.

### Price list — Products & brackets (`/price-lists/:id`)

- `packages/modules/price_lists/src/admin/pages/PriceListDetailPage.tsx` (`ProductsAndBracketsPanel`,
  `ProductPickerDialog`); route gated `price_lists:read`, writes gated `price_lists:write` on the
  server.
- Left: the roster of products on the list; right: the per-product, per-currency bracket editor
  (`packages/modules/price_lists/src/admin/components/BracketGrid.tsx`). **Add**
  (`priceLists.detail.products.add`) is disabled only for the system list — there is no client-side
  write-permission gate. It opens a side drawer: a search box filtering client-side over name and
  SKU, and a plain list (capped at 100 rows) that hides products already on the list; clicking one
  product adds it at once (`POST /api/v1/admin/price-lists-engine/:id/products {productId}`) and
  closes the drawer.
- **Defect**: the drawer and the roster's name lookup both call `GET
  /api/v1/admin/catalog/products` with no parameters, so they see only the first page — the 20
  newest non-inactive products. Products beyond that cannot be added from the drawer. A roster row
  for a product beyond that shows an id prefix instead of a name and SKU, **and selecting it never
  opens the bracket editor** — the panel stays on *Loading product…*
  (`priceLists.detail.products.loadingProduct`), because the editor renders only when the product is
  in that 20-row map.
- Server: `POST …/products` is an idempotent single append (`price-list-service.ts`, `addProduct`),
  one `price_list.product_add` audit entry per new assignment, no product-existence check of its own
  (`price_list_products.product_id` has a foreign key to `products`). `PUT …/products
  {productIds}` is a **delta replace** that removes every roster entry absent from the body, with
  their brackets. There is no bulk-append endpoint.
- Roster and brackets are per **product**; there is no variant level.

### Line unit: products, not variants

- The order and quote-request contracts accept an optional `variantId`, but no admin screen sends
  it; the price-list roster has no variant concept. The purchasable unit on all three screens is the
  product.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bulk-add products to a new order with live prices (Priority: P1)

A sales rep creating an order for a customer opens a product table inside **Items**, filters it the
same way as the Products list, ticks many products (across pages and filter changes), and adds them
in one go. The added products appear as order lines where the rep sets quantities and sees each
line's unit price and line total.

**Why this priority**: Order entry is the highest-value sales flow; today it takes one combobox
search per line and offers no browsing by status or type.

**Independent Test**: With a customer and sales channel chosen, add 20 products from two pages of a
filtered table in one action, set quantities, and see unit price and line total per line plus the
order summary.

**Acceptance Scenarios**:

1. **Given** customer and sales channel are chosen, **When** the rep opens the product picker in
   **Items**, **Then** a paginated table appears with the same working filters as the Products list
   (status tabs with counts, type, text search) and a checkbox per row.
2. **Given** the rep ticked 5 products on page 1, **When** they go to page 2 or change a filter and
   tick 3 more, **Then** the picker shows "8 selected" and all 8 remain ticked when revisited.
3. **Given** 8 products are selected, **When** the rep confirms "Add 8", **Then** the picker closes
   and 8 new lines appear, each with quantity 1, unit price and line total (quantity × unit price)
   in the order's currency, and the order summary updates.
4. **Given** lines exist, **When** the rep changes a line's quantity, **Then** that line's unit price
   (which may change with quantity brackets), line total and the summary update.
5. **Given** a product is already a line, **When** the picker is opened again, **Then** that
   product's row is shown as already added and cannot be selected again.
6. **Given** a selected product the pricing preview reports as unavailable (product not found, or
   quote-only for this customer and channel), **When** it is added, **Then** its line shows
   **No price** and the order cannot be submitted until that line is removed. (A product with no
   applicable price list is priced from its catalogue default price, possibly 0.00, as today; it is
   not "No price".)
7. **Given** the picker opens on the order screen, **When** it loads, **Then** the Active tab is
   selected, and grouped/bundle parents and draft/inactive products are shown with a reason and
   cannot be ticked.
8. **Given** the rep knows a SKU, **When** they type it in the quick search beside **Browse
   products** and pick the result, **Then** one new line is appended without opening the picker.
9. **Given** the rep has ticked 200 products, **When** they try to tick another, **Then** the
   checkbox is unavailable and the picker says the per-Add limit of 200 is reached.
10. **Given** the rep cancels the picker, **When** it closes, **Then** no lines are added and the
    existing lines are unchanged.

---

### User Story 2 - Order items and summary hidden until the order can be priced (Priority: P1)

On **Create order**, **Items** and **Order summary** stay hidden until the customer and the sales
channel are set in **Customer & methods** — the two inputs pricing needs. Until then the rep sees a
short hint naming what is missing.

**Why this priority**: Prevents building a basket that cannot show prices; small and separately
testable.

**Independent Test**: Open `/orders/new` fresh; verify neither section is shown; set the customer,
then the sales channel; verify the sections appear only after both are set, without needing
payment, delivery or addresses.

**Acceptance Scenarios**:

1. **Given** a fresh order form, **When** it loads, **Then** **Items** and **Order summary** are
   not shown and a hint lists the fields still required (customer, sales channel).
2. **Given** only the customer is set, **When** the rep sets the sales channel, **Then** **Items**
   appears; the summary appears as soon as at least one line is priced.
3. **Given** lines exist, **When** the rep changes the customer or sales channel to another value,
   **Then** the lines are kept and re-priced against the new value.
4. **Given** lines exist, **When** the rep clears a required field, **Then** both sections are hidden
   again; the lines are kept and reappear when the field is set again.
5. **Given** the page is opened with `customerAccountId` and `salesChannelId` in the query string
   (the feature 143 hand-over another screen uses), **When** it loads, **Then** **Items** is shown
   immediately.

---

### User Story 3 - Bulk-add products to a new quote request (Priority: P2)

A sales rep creating a quote request opens the same product picker in **Line items**, adds many
products in one go, and then sets quantity and agreed unit price on each added line. The agreed
price is prefilled from the customer's price lists where possible.

**Why this priority**: Same pain as orders, lower volume.

**Independent Test**: With a customer (with an organization) chosen, add 10 products via the
picker, see lines with quantity 1 and a prefilled agreed price where one resolves, edit prices and
quantities, submit.

**Acceptance Scenarios**:

1. **Given** the quote-request form, **When** the rep opens the picker in **Line items**, **Then**
   the same table, filters and multi-select behaviour as in User Story 1 are available.
2. **Given** 10 products are selected, **When** the rep confirms "Add 10", **Then** 10 lines appear
   with quantity 1 and the agreed unit price prefilled from the price resolved for the chosen
   customer, or left empty for manual entry when no price resolves.
3. **Given** lines exist, **When** the rep edits a quantity, **Then** the agreed price is
   re-prefilled only if the rep has not edited that line's price by hand (FR-033).
4. **Given** lines exist, **When** the rep edits an agreed unit price, **Then** the running total
   updates.
5. **Given** a line has an empty agreed price, **When** the rep tries to submit, **Then** submit is
   blocked and the line is visibly marked as missing a price (it is not silently dropped).
6. **Given** a product is already a line, **When** the picker is reopened, **Then** it is shown as
   already added and cannot be selected again.
7. **Given** the picker on the quote-request screen, **When** the rep switches to the Draft or
   Inactive tab, **Then** those products can be ticked; grouped/bundle parents still cannot.

---

### User Story 4 - Bulk-add products to a price list (Priority: P2)

A pricing admin on a price list's **Products & brackets** tab clicks **Add** and gets the same
filterable, paginated product table; they tick many products and add them to the price list in one
action. Products already on the list are marked and cannot be ticked. Brackets for added products
are then edited as today.

**Why this priority**: Price-list setup is periodic rather than daily, but today the drawer cannot
reach any product beyond the newest 20, and roster products beyond them cannot have their brackets
edited at all.

**Independent Test**: On a non-system price list, add 30 products (from more than one page) in one
action; the roster shows all 30 by name, each opens the bracket editor, and none of the previously
present products changed their brackets.

**Acceptance Scenarios**:

1. **Given** a non-system price list, **When** the admin clicks **Add**, **Then** the product picker
   opens with the Products list's working filters and pagination over the whole catalog.
2. **Given** products already on the list, **When** the picker shows them, **Then** they are marked
   "already on this price list" and cannot be selected.
3. **Given** 30 products are selected, **When** the admin confirms "Add 30", **Then** all 30 join
   the roster without prices, the picker closes and the first added product is selected in the
   roster with its bracket editor open.
4. **Given** some products could not be added (e.g. deleted meanwhile), **When** the add finishes,
   **Then** the successful ones are on the roster and a message names the ones that failed.
5. **Given** products already on the list have brackets, **When** new products are added, **Then**
   those existing brackets are unchanged.
6. **Given** the system (Default) price list, **When** the tab is shown, **Then** **Add** stays
   disabled as today.
7. **Given** a price list whose roster holds products older than the catalog's newest 20, **When**
   the tab loads, **Then** every roster row shows its name and SKU and selecting it opens the
   bracket editor.

---

### Edge Cases

- **Already-added products**: shown in the picker, marked, not selectable (orders, quote requests,
  price lists). Removing a line and reopening the picker makes the product selectable again.
- **Selection across pages and filters**: the selection persists while the picker is open, across
  page changes, page-size changes and filter changes, until Add or Cancel. A visible selected count
  with **Clear selection** and a "show selected only" view let the user review it. This deliberately
  differs from the Products list, which clears the selection on a filter change.
- **Header checkbox**: selects or deselects the selectable rows on the current page only, adding to
  (not replacing) the existing selection.
- **Product removed or deactivated between selection and Add**: order / quote request — the line is
  added and then priced by the existing pricing (a removed product shows as unavailable on the
  order; a deactivated one is priced as today and the create endpoint's existing rules apply; on the
  quote request its price may stay empty). Price list — a product the server refuses is reported as
  a failed add (FR-043).
- **Non-purchasable products (grouped/bundle parents, draft, inactive)**: shown with a reason and not
  selectable where FR-012 says so; the quick search applies the same rules. These are rules of the
  admin screens; the server does not refuse these products today and this feature does not add such
  a refusal.
- **Product the customer may not see, or outside the channel's assortment (orders)**: the preview
  prices it, and order creation refuses it with "Product not found." (existing behaviour, see
  *What the product does today*). Whether this feature closes that gap is open — see *Open
  questions*.
- **No price for the customer**: the order line shows **No price** and blocks submit only when the
  preview marks it unavailable (FR-024); otherwise the catalogue default price applies, as today,
  including 0.00. The quote-request line keeps an empty agreed price for manual entry.
- **Pricing preview fails as a whole** (e.g. a customer with no organization, or a method the
  organization may not use): the existing **Could not calculate prices** message is shown; lines
  stay and show no price. Behaviour otherwise unchanged by this feature.
- **Customer or channel changed after lines exist**: lines kept and re-priced (order) / re-prefilled
  except hand-edited prices (quote request). On the order screen, changing the channel can also
  clear a delivery or payment method the new channel does not offer (existing, 0.105.0).
- **Unsaved-changes prompt**: hiding **Items** (FR-025) does not remove the lines from the draft, so
  leaving the page with hidden lines still prompts.
- **Large selections**: a single Add is capped (FR-008); the picker tells the user when the cap is
  reached and does not allow ticking more.
- **Empty result for the current filter while items are selected**: empty-state message, the
  selected count still visible and Add still enabled.
- **Load error**: an error message inside the picker with a retry; existing lines untouched.
- **Quantity**: integer ≥ 1; 0, negative or non-numeric is rejected on the line, not silently
  dropped.
- **Long names / SKUs**: truncated with the full text on hover; the PL name shown as a second line
  as on the Products list.
- **Narrow viewport**: the picker remains usable at tablet width (horizontal scroll inside the table
  only).
- **Permissions**: a user who can open the host screen but lacks product read permission sees the
  picker trigger disabled with a reason, not an error after opening.
- **Price list status**: adding is allowed on a non-system list regardless of its status (as today).

## Requirements *(mandatory)*

### Functional Requirements

**Product picker (shared by all three screens)**

- **FR-001**: The system MUST provide one product picker, opened from a host screen, that lists
  catalog products in a paginated table and is identical in look, columns, filters and selection
  behaviour on all three host screens (only host-specific labels, row states and the confirm action
  differ).
- **FR-002**: The picker MUST offer the filters that work on the Products list today: status tabs
  (All, Active, Draft, Inactive) with per-status counts, product type, and free-text search (SKU,
  slug, name — what the list endpoint matches) with typing debounce. Filter labels and values MUST
  match the Products list, except that status and type values are shown translated (FR-014).
- **FR-003**: The picker MUST show at least these columns: selection checkbox, product name (PL name
  as a secondary line when different), SKU, status, type. Visibility and "updated" columns MAY be
  omitted.
- **FR-004**: The picker MUST paginate with a page-size control consistent with the Products list
  and MUST reach every product matching the filters (no hidden first-page limit).
- **FR-005**: Users MUST be able to select and deselect individual rows and all selectable rows on
  the current page; the selection MUST persist across page, page-size and filter changes until the
  picker is confirmed or cancelled.
- **FR-006**: The picker MUST show the running count of selected products, a way to clear the
  selection, and a way to review only the selected products.
- **FR-007**: The confirm action MUST be labelled with the count ("Add N" / "Dodaj N") and be
  disabled when nothing is selected; Cancel (and closing the picker) MUST discard the selection
  without changing the host.
- **FR-008**: A single confirm MUST accept at most 200 products; once the limit is reached further
  rows cannot be ticked and the picker says why. There is no "select all N matching the filter"
  action in the picker.
- **FR-009**: Products already present in the host (order lines, quote-request lines, price-list
  roster) MUST be shown as already added and MUST NOT be selectable.
- **FR-010**: The picker MUST show distinct loading, empty-result and load-error states; a load error
  MUST offer retry and MUST NOT alter the host's existing lines.
- **FR-011**: The picker MUST be usable by keyboard (focus moves into the picker on open, Esc
  cancels, rows and checkboxes are reachable and labelled for screen readers) and MUST return focus
  to the trigger on close.
- **FR-012**: Selectability by host screen:
  - On the order and quote-request screens the picker MUST open on the Active status tab; the other
    tabs stay reachable.
  - On the order and quote-request screens, `grouped` and `bundle` parent products MUST be shown but
    not selectable, with a visible reason (e.g. "Product group — pick its individual products").
  - On the order screen, draft and inactive products MUST be shown but not selectable, with a visible
    reason.
  - On the quote-request screen, draft and inactive products MUST be selectable.
  - On the price-list screen every product type and status MUST be selectable, and the picker opens
    on the All tab.
- **FR-013**: The picker trigger MUST be disabled with an explanatory hint when the signed-in user
  lacks `catalog:read`; the host screen's own permissions are unchanged.
- **FR-014**: Every new user-visible string (picker, hints, row states, messages, confirm labels)
  MUST exist in Polish and English and follow the admin's language setting; the picker's status,
  type and visibility labels MUST be translated (unlike the current hard-coded English on the
  Products list).

**Create order**

- **FR-020**: **Items** MUST offer a **Browse products** action that opens the product picker, and
  beside it a quick single-product search (by name or SKU) that appends the chosen product as a new
  line in one step. The per-row product search on each line is removed; lines are created only
  through these two entry points. The quick search MUST apply the same selectability rules as the
  picker (FR-009, FR-012).
- **FR-021**: **Items** and **Order summary** MUST NOT be shown until both the customer and the sales
  channel are set in **Customer & methods**; payment method, delivery method and addresses do not
  gate them. Until then a hint in their place MUST name the missing fields (customer, sales channel,
  or both).
- **FR-022**: Each added line MUST show product name and SKU, an editable integer quantity (≥ 1,
  default 1), the unit price and the line total (quantity × unit price) in the order currency, and a
  remove action.
- **FR-023**: Line prices and the summary MUST be recalculated whenever lines, quantities, customer,
  sales channel, delivery or payment method change, using the same pricing the order will be created
  with.
- **FR-024**: A line the pricing preview reports as unavailable (today: product not found or
  quote-only) MUST be marked **No price** and MUST block submit (existing rule, kept; a product
  without an applicable price list keeps today's catalogue-default pricing, possibly 0.00).
- **FR-025**: Hiding the sections because a gating field is cleared MUST NOT discard the lines
  already added.
- **FR-026**: The created order MUST contain exactly the visible lines and quantities; the submitted
  payload shape is unchanged.

**Create quote request**

- **FR-030**: **Line items** MUST offer the same two entry points as the order screen (FR-020:
  **Browse products** and the quick single-product search, with the quote-request selectability
  rules) plus the list of added lines; each line shows product name and SKU, an editable integer
  quantity (≥ 1, default 1), an editable agreed unit price, and remove.
- **FR-031**: On add, each line's agreed unit price MUST be prefilled with the price resolved for the
  chosen customer (and its organization) at the line's quantity, or left empty when none resolves.
- **FR-032**: If no customer is chosen when products are added, lines MUST be added with empty prices
  and be prefilled as soon as a customer with an organization is chosen.
- **FR-033**: Changing quantity or customer MUST re-prefill a line's agreed price only while that
  price has not been edited by hand; a hand-edited price MUST NOT be overwritten.
- **FR-034**: A line with an empty agreed price or an invalid quantity MUST be visibly marked and
  MUST block submit; lines MUST NOT be silently dropped.
- **FR-035**: The running total (Σ quantity × agreed unit price) MUST update on every edit.
- **FR-036**: The existing customer-without-organization warning and the submit rules for customer
  and organization remain.

**Price list — Products & brackets**

- **FR-040**: **Add** MUST open the product picker over the whole catalog (FR-004) instead of the
  current single-product drawer.
- **FR-041**: Confirming MUST add every selected product to the price list without prices; the
  roster MUST then show every product on the list (newly added and pre-existing, regardless of
  catalog size) by name and SKU, MUST open the bracket editor for any roster product selected, and
  MUST select the first added one.
- **FR-042**: Adding products MUST NOT change, remove or reset any product or bracket already on the
  price list.
- **FR-043**: If some products fail to add, the others MUST still be added and a message MUST name
  the failed products and the reason.
- **FR-044**: **Add** MUST stay disabled on the system price list (as today) and MUST be disabled for
  users without `price_lists:write` (a new client-side gate; the server already refuses the write).

### Key Entities

- **Product (catalog)**: the selectable unit — id, SKU, localized name, status, type. The line unit
  on all three screens; variants are not selected.
- **Picker selection**: the transient set of product ids chosen in one picker session; never stored.
- **Order line / quote-request line / price-list roster entry**: the existing host records the
  selection is turned into; shapes unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can add 20 products found through two different filters to an order, a quote
  request or a price list in a single picker session (one open, one confirm).
- **SC-002**: The three host screens expose the identical filter set and column set in the picker
  (verified by one checklist applied to all three).
- **SC-003**: On a catalog of more than 500 products, any product matching the filters can be found
  and added on the price-list screen, and every roster product opens its bracket editor (today only
  the newest 20 are reachable).
- **SC-004**: On a fresh order form, 0 product lines can be entered before the gating fields are
  set; after they are set, every added line shows unit price and line total without a manual
  refresh.
- **SC-005**: 100% of new strings exist in both PL and EN; switching the admin language changes all
  picker text.
- **SC-006**: Orders and quote requests created through the new flow are accepted by the existing
  create endpoints with no payload changes; price-list brackets of pre-existing roster products are
  byte-for-byte unchanged after a bulk add.

## Assumptions

- The picker mirrors only the Products-list filters that work today (status, type, search). The
  Stock, Category and Channel chips on the Products list are non-functional and are not copied;
  adding a category filter is out of scope.
- The line unit is the product. Variant selection is not offered.
- `simple`, `virtual` and `configurable` products are selectable on orders and quote requests
  (subject to the status rules in FR-012); a `configurable` product is added without a variant, as
  today.
- FR-012 and FR-009 are rules of the admin screens. The order, preview and quote-request endpoints
  keep accepting what they accept today.
- The picker sorts like the Products list (newest first); no column sorting is added.
- The picker opens as an overlay (dialog or side panel) above the host screen; the exact pattern is a
  design decision constrained by FR-001…FR-011 and the admin design system.
- Added lines appear in the order the products were selected; new lines are appended after existing
  ones.
- The picker's default page size follows the user's Products-list page-size preference.
- Quote-request prices resolve against the system default sales channel and its default currency, as
  today; the quote-request screen gets no channel or currency selector.
- The order currency is the one the pricing preview returns (the delivery method's currency when one
  is chosen, otherwise the channel's default); the picker shows no prices.
- Permissions are the existing ones: `orders:write` (create order), `rfqs:handle` (create quote
  request), `price_lists:read` / `price_lists:write` (price lists), `catalog:read` (product listing),
  `price_lists:read` (quote-request price prefill). No new permission codes.
- **Line items** on the quote-request screen stays visible before a customer is chosen (no gating
  was asked for there); prices are filled once a customer with an organization is chosen (FR-032).
- The existing read endpoints are expected to suffice for the picker and the roster (the list
  endpoint for browsing, `batch-by-id` for names of products already on a host). Whether the
  price-list bulk add needs a new write endpoint is an open question, not a given.
- The **Quick order** tab (`quick_order`, `/orders/quick-order`) is unchanged.

## Out of Scope

- Variant-level selection (the contracts allow `variantId`, but no host uses it).
- "Select all N matching the filter" (collection mode) inside the picker.
- New filters beyond the Products list's working ones (category, sales channel, stock, price).
- Showing prices or stock inside the picker table.
- Changing the Products list screen itself (`/catalog/products`), including its broken chips and
  English labels.
- Line notes, packaging units, or discounts on quote-request lines.
- Any change to the request payloads of the order and quote-request create endpoints (SC-006). The
  preview response is the subject of open question 2.

## Clarifications

### Session 2026-10-13

Answers given by the product owner.

- Q: Which **Customer & methods** fields must be set before **Items** and **Order summary** appear on
  Create order? → A: Customer and sales channel only (FR-021, User Story 2).
- Q: How are grouped parents and draft/inactive products treated in the picker? → A: The picker opens
  on the Active tab; grouped/bundle parents are shown but not selectable, with a reason (orders and
  quote requests); draft/inactive are not selectable on orders and are selectable on quote requests;
  on price lists everything is selectable and the picker opens on All (FR-012).
- Q: What happens to a product that is already a line or already on the roster? → A: Shown as
  already added, not selectable (FR-009).
- Q: Maximum products per single Add? → A: 200 per Add; no "select all N matching" (FR-008).
- Q: Keep a quick single-product search next to the picker on orders and quote requests? → A: Yes,
  beside **Browse products**; the per-row product search is removed (FR-020, FR-030).
- Q: Should a line priced at 0.00 (no applicable price list, catalogue default 0) be blocked or
  flagged? → A: No; it keeps today's behaviour and no new block is added (FR-024).
- Q: Is the price-list defect — **Add** and the roster seeing only the newest 20 products — in scope?
  → A: Yes; fix it (FR-040, FR-041, SC-003).

## Open questions

Raised by re-deriving the current state on 0.106.0; not answered by the session above. To be put to
the product owner before `/speckit.plan`.

1. **Price-list bulk add — write path.** With up to 200 products per Add (FR-008), should the page
   call the existing single-product `POST …/products` once per product (no backend change; up to 200
   requests and 200 `price_list.product_add` audit entries; per-product failures fall out naturally
   for FR-043), or should `price_lists` gain an additive bulk-append endpoint (one request, one
   audited write; the partial-success semantics FR-043 needs must be defined)? `PUT …/products` is
   not usable, because it removes every roster entry absent from the body.
2. **Order lines the create will refuse.** Order creation refuses a product the chosen customer may
   not see (organization restriction, `logged_in_only`) or that is outside the request's sales
   channel, but the preview prices it, so the rep learns only at submit ("Product not found."). Should
   this feature (a) leave it as today, (b) have the order picker and quick search show such products
   as not selectable with a reason (organization restriction is decidable from the list row;
   channel assortment is not), or (c) have the preview report them as unavailable with an additive
   `messages` code, so FR-024 marks the line before submit?
