# Feature Specification: Quote request reference price, readable history, per-customer negotiation lock

**Feature Branch**: `feat/146-quote-request-pricing-history`
**Created**: 2026-10-14
**Status**: Clarified — planned; `/speckit.analyze` run 2026-10-14 (open owner questions in the analysis report)
**Issues**: #279, #283, #284
**Input**: Three open issues against the Quote Requests module:

- **#279 — Display base/initial product price in the Quote Request view.** On the admin quote request
  screen (`/quote-requests/:id`) a sales representative sees the price the customer proposed (e.g. 100.00)
  but not the price the customer would normally pay for the product (e.g. 120.00), so there is no reference
  point for judging the discount asked for, as an amount or a percentage, or for preparing a counter-offer.
- **#283 — Enhance the History section with detailed change logs.** The History tab shows raw status
  identifiers. It must read as a human-readable log, make each modification of the offer inspectable
  (what exactly changed), and attribute approvals and rejections to the person who made them.
- **#284 — Setting to disable price negotiation per Customer.** An administrator must be able to block a
  given customer from proposing prices on quote requests.

## Current state (this checkout, release 0.106.0)

Paths are relative to the repository root. Module source is under `packages/modules/<id>/src/`.

### Line prices on a quote request

- `packages/modules/quote_requests/src/backend/entities/quote-request-item.entity.ts` — a line stores
  `desiredUnitPrice` (the customer's proposal), `agreedUnitPrice` (the seller's offer), `discountPercent`
  and `lineCurrency`, plus `packagingUnitName` / `packagingUnitBaseQuantity`. **No reference price is
  stored.** `discountPercent` is never written by any create or modify path. `lineCurrency` is hard-coded
  `'PLN'` on every write path in `services/rfq-service.ts` and `services/rfq-admin-service.ts`.
- Customer create (`services/rfq-service.ts` `createForCustomer`) and customer draft edit (`patchDraft`)
  accept an optional, non-negative `desiredUnitPrice` per line (`createQuoteRequestLineSchema` in
  `packages/contracts/src/quote-requests.ts`). Resubmit (`resubmit`) copies lines with `desiredUnitPrice: null`.
- Every quote request records the sales channel it was raised on (`salesChannelId`, stamped by
  `services/raised-on-channel.ts` `raisedOnChannelId()` on customer create, resubmit and admin create).
- Admin modify (`services/rfq-admin-service.ts` `modify`) deletes all lines and recreates them from the
  PATCH body. The admin line schema carries no `desiredUnitPrice`, so **after the first admin revision the
  customer's proposed price is gone from the current lines**; it survives only in the earlier revision
  snapshots. `modify` and `patchDraft` also do not carry the packaging-unit fields across the rewrite
  (`patchDraft` carries variant and line note; the admin PATCH line schema has no packaging-unit fields).
- The admin Modify tab (`packages/modules/quote_requests/src/admin/pages/RfqDetail.tsx`, `ModifyCard`)
  saves `{ productId, quantity, agreedUnitPrice }` only — no `variantId` and no `lineNote`, although
  `adminPatchQuoteRequestLineSchema` (`packages/contracts/src/quote-requests.ts`) accepts both — so every
  admin revision saved from the screen strips variants and line notes from the lines.
- The Modify tab opens each line's agreed-price input on `agreedUnitPrice ?? desiredUnitPrice`; only a
  line with neither is prefilled, from `GET /api/v1/storefront/products/:id/resolved-price` called with the
  administrator's own session, so **that prefill is not the customer's price**.
- A customer-specific price probe exists: `GET /api/v1/admin/products/:id/resolved-price`
  (`packages/modules/price_lists/src/backend/routes.ts`; query `customerAccountId`, `organizationId`,
  `quantity`, `variantId`, `currency`). It resolves against the **system-default** sales channel, not the
  channel a quote request was raised on. The admin create screen
  (`packages/modules/quote_requests/src/admin/pages/RfqCreatePage.tsx`) already uses it for its prefill.
  `rfqs:handle` declares `requires: ['price_lists:read']` (`packages/modules/quote_requests/src/manifest.ts`).
- Cart → quote conversion (`packages/modules/carts/src/backend/services/cart-conversion-service.ts`,
  `convertToQuoteRequest` calling `createForCustomer`) writes the cart line's snapshotted unit price **into
  `desiredUnitPrice`**. On that path the "proposed" price is really the catalogue price; the field has two
  meanings today. Quick order (`packages/modules/quick_order/src/backend/services/quick-order-build-service.ts`),
  shopping list → quote (`packages/modules/shopping_lists/src/backend/services/shopping-list-service.ts`)
  and order copy → quote (`packages/modules/orders/src/backend/services/order-clone-to-quote-service.ts`)
  send no proposed price.
- Storefront: the proposed price is typed on the quote request draft page
  (`storefront/components/rfq/RfqDraftView.tsx`, inline `strings(pl)` dictionary key `proposedPriceLabel`,
  mounted at `storefront/app/(commerce)/quote-request/page.tsx`, submitted through
  `storefront/app/(commerce)/quote-request/actions.ts`). The client-side draft (`storefront/lib/rfqDraft.ts`)
  holds a catalogue `unitPrice` snapshot for display; it is **not** sent on submit.
- Admin detail Overview items table: Product / Qty / Desired / Agreed / Line total
  (`rfq.detail.column.*`). No reference price and no difference.

### List totals and CRM value

- Customer list summary (`services/rfq-service.ts` `summarize`): `totalAtCustomerPrice` sums the lines that
  carry a proposal and is `0` when none does; the storefront list
  (`storefront/app/(account)/quote-requests/page.tsx` `formatTotal`) then shows `0,00 PLN`. With some lines
  proposed and some not, it shows a partial sum.
- Admin list summary (`services/rfq-admin-service.ts`): `totalAtCustomerPrice` is `null` ("—") unless every
  line carries a proposal.
- CRM (`packages/modules/crm/src/backend/services/crm-quote-requests.ts`) values a linked quote request
  line at `agreedUnitPrice ?? desiredUnitPrice`; a line with neither adds nothing
  (`packages/modules/crm/src/backend/domain/value-calculation.ts` `sumLines`). A cart-converted request is
  therefore valued at the cart price today.

### History tab

- Append-only event log `quote_request_events` (`entities/quote-request-event.entity.ts`): `eventType`
  (`created`, `submitted`, `modified`, `approved`, `canceled`, `expired`, `completed`,
  `customer-accepted-revision`, `customer-rejected-revision`, `re-submitted`, `note-added`),
  `actorAdminUserId`, `actorCustomerAccountId`, `actorRoleLabel`, `payload` (JSON), `revisionId`.
- `actorRoleLabel` is an English string: `Customer`, `System` (expiry sweep, order completion), or for an
  admin `Platform administrator`, `Sales representative`, the admin role's name, or `Administrator` when
  the user has no role (`packages/modules/quote_requests/src/backend/index.ts`).
- Full snapshot per revision `quote_request_revisions` (`entities/quote-request-revision.entity.ts`):
  `itemsSnapshot` (product, variant, quantity, desired, agreed, line note, currency, discount) and
  `headerNoteSnapshot`, `createdBy*`, `previousRevisionId`. The validity date (`expiresAt`) is not in the
  snapshot.
- `modified` events carry `payload.diff` (`services/rfq-revision-service.ts` `diffRevisions`):
  `header_note`, `line_added`, `line_removed`, `line_quantity`, `line_agreed_unit_price`. Not covered:
  proposed-price changes, line-note changes, variant changes, validity changes, custom-field changes.
  Lines are keyed by product id only, so two variants of one product collide. A PATCH that changes only
  custom fields or validity still appends a `modified` event with an empty diff.
- Payload details available: `approved.approvedBy` (`customer` | `admin`), `canceled.canceledBy` and
  `reason`, `customer-rejected-revision.reason`, `note-added.note`, `re-submitted.sourceRfqId/newRfqId`,
  `customer-*-revision.revisionNumber`, `expired.expiryDaysAtTime`, `completed.orderId`. A customer accept
  writes two events (`customer-accepted-revision` + `approved`), a reject likewise
  (`customer-rejected-revision` + `canceled`); an admin approve with a note writes `note-added` +
  `approved`; an admin create writes `created` + an automatic English `note-added`.
- Since 0.105.0 the expiry sweep actually runs, so `expired` entries with actor `System` occur in practice.
- `GET /api/v1/admin/quote-requests/:id` returns every event with both actor ids
  (`includeFullActorIdentity`) but **no actor names**. Since 0.105.0, customer-facing replies carry no
  `actorAdminUserId` at all.
- The admin History tab (`RfqDetail.tsx`, `tab === 'history'`; labels `rfq.detail.tabs.history`,
  `rfq.detail.history.title`) renders only the date, `actorRoleLabel` and the raw `eventType`. The
  storefront customer page maps event types to Polish labels
  (`storefront/app/(account)/quote-requests/[id]/page.tsx` `describeEvent`).
- An organization administrator on the storefront sees every quote request of the organization and can
  accept or reject one raised by a colleague: the deciding person is not necessarily the request's
  `customerAccountId`.
- `patchDraft` refuses an edit once **any** `modified` event exists — including the one a previous
  customer draft edit wrote — so a customer can edit a draft only once. The guard's own comment says it is
  meant to fire on a modification "written by an admin user"; the query filters on the event type only.
  No storefront screen calls the customer draft-edit API today; it is reachable by direct API clients.
- An organization administrator reaches a colleague's quote request through the same visibility rule
  (`findVisibleForCustomer`, `isOrgAdmin`) and can therefore edit a colleague's draft through the API.
  Create and resubmit always stamp the acting customer account as the request's owner, so draft edit is
  the only customer write where the actor and the owner can differ.

### Settings and per-customer attributes

- `packages/modules/quote_requests/src/manifest.ts` declares `quote_requests.enabled`,
  `quote_requests.expiry_days`, `show_add_to_quote_on_card`, `show_add_to_quote_on_pdp`,
  `business_id.prefix` / `suffix`. No negotiation setting.
- Settings are scoped **per sales channel only** (`packages/platform/src/kernel/settings/setting-value.entity.ts`,
  unique on setting + sales channel). There is no per-customer or per-organization setting scope.
- Per-party policy flags exist as attributes of the party: `requiresCartApproval` on the organization
  (`packages/modules/organizations/src/backend/entities/organization.entity.ts`), `subtreeRollupEnabled`
  on the customer account (`packages/modules/customer_accounts/src/backend/entities/customer-account.entity.ts`).
  Admin organization endpoints are gated on `customers:manage` / `customers:read`.
- The storefront reads the two visibility flags through the public
  `GET /api/v1/storefront/settings/quote-requests` (`packages/modules/quote_requests/src/backend/plugin.ts`,
  `storefront/lib/api/rfq.ts`), cached `max-age=60`, failing open on an unreadable setting.

### i18n

- Admin screen strings are in the core bundle `packages/modules/_i18n/i18n/{en,pl}.json` (`rfq.detail.*`).
  The module bundle `packages/modules/quote_requests/i18n/{en,pl}.json` carries `errors.*`, `actions.*`
  and `nav.*`. Storefront strings are inline in the storefront components.

### Storage

- History readability and actor identity (US2, US3) need **no new storage**: events, actor ids, payloads
  and revision snapshots exist; what is missing is rendering, name resolution and a broader diff
  (computable on read from consecutive revision snapshots, also for requests created before this change),
  plus recording validity changes from now on.
- The reference price (US1) is **not stored anywhere**, and line rows are rewritten on every revision, so
  a value kept only on mutable line rows is lost at the first revision. The storage mechanism is the
  plan's decision.
- The negotiation lock (US4) has no home today (see Settings above): it needs an organization-level value
  and a customer-account-level override. Whether they are columns or runtime custom fields is the plan's
  decision.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sales rep sees the customer's reference price next to the proposal (Priority: P1)

A sales representative opens a quote request in which the customer proposed 100.00 for a product whose price
for that customer is 120.00. On each line the rep sees the proposed price, the reference price, and the
difference both as an amount and a percentage — on the Overview tab and while modifying the offer.

**Why this priority**: It is the information the rep needs to decide the counter-offer; without it every
negotiation starts with a manual price lookup.

**Independent Test**: Submit a quote request from the storefront as a customer with a known price list
(product 120.00, proposal 100.00); open `/quote-requests/:id` in the admin; verify 120.00 / 100.00 / −20.00 /
−16.67 % on the Overview tab and in the Modify tab.

**Acceptance Scenarios**:

1. **Given** a customer whose price for product P is 120.00 PLN submits a quote request line for P with
   proposed price 100.00, **When** a rep opens the request, **Then** the line shows reference price
   120.00 PLN, proposed 100.00 PLN and difference −20.00 PLN / −16.67 %.
2. **Given** the same request, **When** the rep opens the Modify tab, **Then** each line shows the
   reference price and the customer's proposed price beside the agreed-price input, and the difference of
   the agreed price being typed versus the reference price, updated as the rep types.
3. **Given** a line where the customer proposed no price, **When** the rep opens the request, **Then** the
   reference price is shown and the proposed price and difference show "—".
4. **Given** the rep has already sent a revised offer, **When** the request is reopened, **Then** the
   customer's original proposed price is still shown per line (it is not lost by the revision) together
   with the reference price and the current agreed price.
4b. **Given** a customer whose price for P is 120.00 PLN on sales channel A and 130.00 PLN on the
   system-default channel raises a request on channel A, **When** the rep opens it, **Then** the reference
   price is 120.00 PLN (the channel the request was raised on).
5. **Given** the price of P changed after the request was submitted, **When** the rep opens it, **Then**
   the reference price shown is the one stored at submission, labelled "price at request"; the current
   price is not shown for that line.
6. **Given** a request submitted before this feature shipped, **When** the rep opens it, **Then** the line
   shows the customer's current price, labelled "current price" (not the price at submission).
7. **Given** no price can be resolved for the line's product for that customer, **When** the rep opens the
   request, **Then** the reference price shows "no price" and no difference is shown; nothing else on the
   screen fails.
8. **Given** a request created by converting a cart in which P cost 120.00, **When** the rep opens it,
   **Then** the line shows reference price 120.00 (price at request) and no customer proposal ("—").
8a. **Given** that cart-converted request (no line carries a proposal), **When** the customer opens the
   storefront quote request list, **Then** the customer-price total shows "—", not `0,00 PLN` (FR-009).
8b. **Given** a request with two lines of which only one carries a customer proposal, **When** the customer
   opens the storefront list, **Then** the customer-price total shows "—" (no partial sum and no reference
   price filled in for the unproposed line), as the admin list does (FR-009).
8c. **Given** a request on which every line carries a customer proposal (P: 2 × 100.00, Q: 1 × 50.00),
   **When** the customer opens the storefront list, **Then** the customer-price total is 250.00 PLN.
9. **Given** a request whose line for product P has variant V, a line note and a packaging unit, **When** a
   rep changes only the agreed price of that line in the Modify tab and saves, **Then** the line still has
   variant V, the same line note and the same packaging unit, and the History entry for that revision lists
   only the agreed-price change (no line removed/added, no line-note change).
10. **Given** a pending, not-yet-revised request whose line for P has variant V, a line note and a
   packaging unit, **When** the customer, through the customer draft-edit API, resends the line with the
   same variant, line note and packaging-unit fields and a changed quantity, **Then** variant, line note and
   packaging unit are stored as sent and History lists only the quantity change.
11. **Given** a pending request no administrator has modified, **When** the customer edits it through the
   customer draft-edit API twice in a row, **Then** both edits succeed and History shows two customer
   modification entries; **and when** a sales rep then saves a revision and the customer attempts a third
   edit, **Then** that edit is refused and nothing is written (FR-038).

---

### User Story 2 - Readable history with what changed (Priority: P1)

The History tab reads as a timeline of sentences in the administrator's language: who did what, when, with
the details that matter — reasons, notes, and for each modification a list of what changed (line
added/removed, quantity, prices, notes, validity date).

**Why this priority**: The most visible complaint of the three; most of its value needs no new data.

**Independent Test**: On a request that was submitted, modified twice by a rep (price change, quantity
change, line removed, validity set; the customer's proposed price visible in the first revision) and
accepted by the customer, open History and verify every entry has a translated sentence, an actor, and the
modification details.

**Acceptance Scenarios**:

1. **Given** a request with events of every type, **When** the rep opens History, **Then** each entry shows
   a translated human-readable title (Polish in the Polish admin, English in the English admin), date and
   time, and the actor; no raw event-type identifier is visible.
2. **Given** a rep changed line P's agreed price from 110.00 to 105.00 and quantity from 10 to 12, **When**
   History is opened, **Then** the modification entry lists "P: agreed price 110.00 → 105.00 PLN" and
   "P: quantity 10 → 12" (localized).
3. **Given** a modification that added line Q, removed line R and changed the note, **When** History is
   opened, **Then** the entry lists the added line (with quantity and agreed price), the removed line, and
   the note change (old → new text).
4. **Given** a modification that changed only the validity date, **When** History is opened, **Then** the
   entry states the validity change (old → new date, or "set" / "removed").
4a. **Given** a customer edited the draft before sales touched it, changing the proposed price of P from
   100.00 to 95.00 and P's line note, **When** History is opened, **Then** the entry names the customer and
   lists "P: proposed price 100.00 → 95.00 PLN" and the line-note change (old → new).
5. **Given** a modification with none of the listed changes (e.g. only custom fields were edited),
   **When** History is opened, **Then** the entry says the offer was re-sent without changes to lines,
   notes or validity — not a blank card.
6. **Given** a customer accepting an offer produced two log records (acceptance + status change), **When**
   History is opened, **Then** they appear as one entry ("Offer accepted by …").
7. **Given** a cancellation or a rejection with a reason, or an approval with a note, **When** History is
   opened, **Then** the reason / note text is shown in the entry.
8. **Given** requests created before this feature shipped, **When** History is opened, **Then** their
   modification entries show every change derivable from stored revision snapshots (lines, quantity,
   agreed and proposed price, line note, header note); validity changes made before release are not shown
   because no record of them exists.

---

### User Story 3 - Who accepted, rejected, approved or canceled (Priority: P1)

Every decision entry in History names the person: the customer user (name and e-mail) for storefront
decisions, the admin user (name, role) for admin decisions, "System" for automatic expiry and order
completion.

**Why this priority**: Explicitly requested in #283 ("explicit user attribution for approvals or
rejections"); the data exists, only resolution and display are missing.

**Independent Test**: As organization administrator B on the storefront, accept a request raised by
colleague A; as rep C, cancel another request. Verify History names B (not A) and C.

**Acceptance Scenarios**:

1. **Given** customer user B (organization administrator) accepts a request raised by colleague A,
   **When** the rep opens History, **Then** the acceptance entry names B (full name, e-mail), not A.
2. **Given** a customer rejects an offer with a reason, **When** History is opened, **Then** the entry
   names the rejecting customer user and shows the reason.
3. **Given** admin C approves or cancels a request, **When** History is opened, **Then** the entry names C
   and C's role.
4. **Given** a request expired by the scheduler or completed by an order, **When** History is opened,
   **Then** the actor is shown as "System" (translated).
5. **Given** the acting admin user or customer account was later deleted or cannot be read, **When**
   History is opened, **Then** the entry shows the role label it was recorded with (translated) and
   "unknown user"; the screen does not fail.

---

### User Story 4 - Administrator locks price negotiation for a customer (Priority: P2)

An administrator turns off price negotiation for an organization (all its members) or for an individual
customer account, which may override its organization in either direction. A customer for whom negotiation
is not allowed sees no proposed-price input on the storefront quote request draft; they still request
quotes with quantities and notes, and sales prices the lines as today. The block holds for direct API calls
too. Other customers are unaffected.

**Why this priority**: Business control; independent of US1–US3 and small, but it opens a buyer-facing
refusal path that needs API enforcement.

**Independent Test**: Lock organization O on `/organizations/:id`; as member X of O, check the storefront
draft page has no proposed-price input; as X, POST a quote request with a `desiredUnitPrice` directly to the
API and observe the refusal; as X, convert a cart to a quote request and observe it succeeds; set member Y
of O to "allowed" on `/customers/:id` and observe Y gets the input and a successful proposal; as customer Z
of another organization on the same sales channel, observe the input and a successful proposal.

In the scenarios below, "the lock is on / off for a customer" means the customer's effective value (FR-020).

**Acceptance Scenarios**:

1. **Given** the lock is off for a customer (default), **When** that customer uses the draft, **Then**
   behaviour is unchanged: the proposed-price input is available.
2. **Given** the lock is on for a customer, **When** that customer opens the draft page, **Then** no
   proposed-price input is shown; each line shows the customer's catalogue unit price (read-only) where one
   is known, and a short note that prices will be set by sales.
3. **Given** the lock is on for a customer, **When** a client acting as that customer calls the customer
   create or draft-edit API with a proposed price on any line, **Then** the request is refused with a
   translated error and nothing is written.
4. **Given** the lock is on for a customer, **When** that customer converts a cart to a quote request,
   **Then** the conversion succeeds and the resulting lines carry no customer proposal.
5. **Given** the lock is on for a customer, **When** a sales rep opens that customer's requests, **Then**
   the proposed-price column shows "—" for new requests; requests submitted earlier with proposals keep
   showing them.
6. **Given** the lock is on for a customer, **When** an admin creates or modifies a request for that
   customer, **Then** agreed prices work exactly as today (the lock applies to the customer only).
7. **Given** customer X is locked and customer Y is not, both buying on the same sales channel, **When**
   both request quotes, **Then** only X has the input hidden and proposals refused; the lock applies to X
   on every sales channel.
7a. **Given** organization O is locked and its member Y has the account override "allowed", **When** Y and
   another member X (no override) request quotes, **Then** Y may propose prices and X may not.
7b. **Given** organization O is not locked (default) and its member X has the account override "locked",
   **When** X and another member W (no override) request quotes, **Then** X may not propose prices and W
   may.
7c. **Given** member X's account override is cleared ("as organization"), **When** X next loads the draft
   page, **Then** X follows the organization value again.
7d. **Given** organization administrator B, who may propose prices, edits through the draft-edit API a
   pending request owned by colleague A for whom negotiation is not allowed, **When** the edit carries a
   proposed price, **Then** it is refused (the request owner's effective value governs); conversely B, if
   locked, may send a proposal on a request of an allowed colleague.
8. **Given** an administrator changes the organization value or a customer account's override, **When**
   an affected customer next loads the draft page, **Then** the new effective state is reflected, and the
   change is recorded in the audit log with the administrator who made it and the old and new value.

---

### Edge Cases

- **Price changed since the request**: the reference price is the one stored at submission; the current
  price is not shown for that line (Clarifications).
- **Requests created before this feature**: no stored reference → current price, labelled "current price"
  (FR-006). Earlier modifications are diffed from stored revision snapshots (FR-016).
- **Customer proposal lost after an admin revision**: the proposal is retained on the line across revisions
  (FR-002, FR-034); for requests revised before this feature shipped, whose current lines already lost it,
  it is taken from the submission record.
- **Customer edits the draft before sales touches it** (customer draft PATCH): the proposal shown is the
  latest customer-entered one; the reference price is resolved and stored for added or changed lines at that
  moment; the change appears in history as a customer modification with proposed-price changes. Variant,
  line note and packaging unit of lines the edit keeps are carried over (FR-035). A customer may edit the
  draft any number of times until an administrator saves a revision; only an admin-authored modification
  closes the draft to customer edits (FR-038). Edits by an organization administrator on a colleague's
  draft are customer edits and do not close it.
- **Resubmit** (new request cloned from an old one): a new request, reference resolved at its submission;
  no proposals (as today).
- **Cart-converted request**: the cart unit price is not a customer proposal; lines show no proposal and the
  cart price is the stored reference (FR-008). Requests converted before this feature carry the cart price
  in the proposal field and will show a ~0 % difference — accepted, not migrated.
- **List totals for requests without a proposal on every line** (new cart-converted requests, every
  request of a locked customer, requests where the customer proposed prices for some lines only): the
  storefront account list shows "—" instead of a customer-price total (today it shows `0,00 PLN` when no line
  carries a proposal and a partial sum when some do); the admin list already follows the same every-line
  rule. The CRM opportunity value of a request with no proposals is 0 until sales sets agreed prices
  (FR-009). The cart total is no longer shown on those lists.
- **Admin-created request** ("Created from admin"): no customer proposal exists; reference price shown for
  the chosen customer; proposal "—".
- **No resolvable price** for the customer (no price list entry, product not priced): "no price",
  difference hidden (FR-005).
- **Proposal higher than reference**: difference shown with a "+" sign (customer offers more), no special
  warning.
- **Reference price 0** (free item): percentage not computed ("—"), amount difference shown.
- **Currency**: lines are PLN today. If the resolved reference currency differs from the line currency, the
  reference is shown in its own currency and no difference is computed (FR-005).
- **Net vs gross**: proposal, agreed and reference are compared on the same basis — net unit prices, as
  quote prices are net today.
- **Quantity brackets / packaging units**: the reference is resolved for the line's quantity (bracket) and
  variant, per the unit the line quantity is expressed in. A quote request line's quantity is always in base
  pieces, also for a line added as a packaging unit (2 pallets of 100 are stored as quantity 200 with the
  packaging-unit name and units per package kept as a snapshot — `cart-service.ts` `effectiveQuantity`,
  `backend/test/integration/quote_requests/rfq-packaging-snapshot.test.ts`); the reference, the proposal and
  the agreed price are therefore all per base piece, and no multiplication by units per package applies.
- **Line added later by sales**: has no customer proposal and no submission-time reference; shows the
  current reference price, labelled current.
- **Same product twice with different variants**: history and reference must distinguish lines by product
  and variant, not product alone.
- **Actor no longer exists / cannot be read**: recorded role label + "unknown user" (US3 #5).
- **Lock scope**: an organization value (applies to all its members) plus an optional per-customer-account
  override ("allowed" / "locked" / "as organization"); effective value = account override if set, else the
  organization value, else "allowed". Applies on every sales channel; there is no platform or channel
  default (Clarifications). Admin screens show stored proposals regardless of the lock.
- **Lock turned on while requests are pending with proposals**: existing proposals stay; a customer draft
  edit of such a request after the lock is refused only if it sends a proposal (FR-022).
- **Anonymous draft, then sign-in as a locked customer**: the draft is built in the browser before the
  storefront knows who the buyer is, so a proposal may already have been typed. Once the buyer is known to
  be locked, the draft page hides the input and does not send the stored proposals; the server refuses any
  that are sent anyway (FR-021, FR-022). *(Assumption; see Assumptions.)*
- **Organization administrator acting for a colleague**: an organization administrator can edit a
  colleague's pending draft through the draft-edit API. The lock is evaluated for the request's owner
  (`customerAccountId`), not for the acting user (US4 #7d). Create and resubmit always make the acting user
  the owner, so there the two coincide. The storefront draft page reads the signed-in user's own effective
  value, which is correct because the draft page only ever creates the user's own request.
- **Customer account moved to another organization**: the account's override (if any) moves with it; with
  no override it follows the new organization's value.
- **Admin Modify save**: lines the rep keeps retain their variant, line note and packaging unit; a line the
  rep adds has the variant and note the rep chose and no packaging unit (FR-034).
- **Validity changes before release**: not reconstructable (validity is not in revision snapshots); such
  history entries list only the other changes.
- **Lock state unreadable**: the storefront shows the input (fail-open display, as for the existing
  storefront flags); the API decides on the lock (organization value and account override) in the same
  request that writes the quote request, so an unreadable lock fails that request rather than letting a
  proposal through. A request carrying no proposal does not need the lock and is not failed by it.
- **Quote Requests module switched off**: no lock controls, enforcement or UI are contributed (a module that
  is off contributes nothing); the stored lock values are kept and apply again when the module returns.

## Requirements *(mandatory)*

### Functional Requirements

**Reference price (US1)**

- **FR-001**: At customer submission of a quote request (every customer path that creates or edits one:
  storefront form, cart conversion, customer draft edit, resubmit, quick order, shopping list → quote,
  order copy → quote), the system MUST determine, server-side, each line's reference unit price for the
  request's customer (its owning customer account and organization, also when an organization
  administrator edits a colleague's draft): the net unit price that customer would pay for that
  product/variant at that line quantity on a normal order at that moment, on the sales channel the request
  was raised on (`salesChannelId`) (customer's price lists, quantity bracket, active sale price). A reference
  price supplied by the client MUST NOT be trusted. Exception: on cart conversion the reference is the cart
  line's unit price (FR-008), which is itself a server-side snapshot.
- **FR-002**: The system MUST retain the submission-time reference price per line, and the customer's last
  proposed price per line before the first seller revision, for the life of the quote request, unaffected
  by later admin revisions. The stored at-request price is the line's reference; the current price is
  shown only where no stored reference exists (FR-006).
- **FR-003**: The admin quote request detail (Overview) MUST show per line: reference unit price, customer's
  proposed unit price, the difference proposed − reference as an amount and as a percentage of the
  reference (2 decimals, signed), and the current agreed unit price.
- **FR-004**: The admin Modify tab MUST show per line the reference price and the customer's proposed price
  next to the agreed-price input, and the live difference of the agreed price being entered versus the
  reference price (amount and %).
- **FR-005**: When no reference price can be resolved, or the reference currency differs from the line
  currency, or the reference is 0, the screen MUST show the available values and "—" for the
  non-computable difference, without errors.
- **FR-006**: For lines without a stored submission-time reference (requests created before this feature,
  lines added by sales, admin-created requests), the screen MUST show the customer's current reference
  price, resolved on the request's sales channel, visibly labelled "current price", distinct from "price at
  request".
- **FR-007**: The Modify tab's empty agreed-price prefill MUST use the customer-specific price (the same
  resolution as FR-001 for the request's customer and sales channel), not the administrator's own
  storefront price.
- **FR-008**: A cart-to-quote conversion MUST NOT record the cart's unit price as a customer proposal; the
  cart line's unit price MUST be stored as that line's reference (at-request) price.
- **FR-009**: The customer-price total of a quote request MUST exist only when **every** line carries a
  customer proposal: the customer list summary's `totalAtCustomerPrice` MUST be `null` otherwise — the same
  rule the admin list summary already applies, and the same all-lines-or-`null` rule `totalAtAgreedPrice`
  already follows — and the storefront account list MUST render `null` as "—", never `0,00 PLN` and never a
  partial sum. This covers requests with no proposal at all (cart-converted, raised by a locked customer)
  until a total at the agreed price exists. The reference price is not used as a fallback for list totals
  or the CRM opportunity value; the CRM value of a request with no proposals stays 0 until sales prices it.

**Readable history (US2, US3)**

- **FR-010**: The admin History tab MUST render each event as a translated (Polish and English)
  human-readable entry with date/time and actor; raw event identifiers MUST NOT be shown.
- **FR-011**: Paired records of one decision (customer accept + approval, customer reject + cancellation,
  admin note + approval) MUST be rendered as one entry. The system-generated creation pairs (created +
  submitted, created + re-submitted, admin creation on the customer's behalf + its automatic note) MUST
  likewise render as one entry; the automatic English creation note is replaced by the translated title
  (a note an operator typed is always shown).
- **FR-012**: Each modification entry MUST list what changed versus the previous revision: lines added (with
  quantity and agreed price), lines removed, quantity changes, agreed-price changes, customer
  proposed-price changes, line-note changes, header-note changes, and validity-date changes, each as
  old → new. Custom-field changes and packaging-unit changes are not listed.
- **FR-013**: A modification with no listed changes MUST be rendered as "offer re-sent without changes"
  (localized), not as an empty entry.
- **FR-014**: Entries for cancellation, rejection and approval MUST show the reason or note when one was
  given.
- **FR-015**: Lines in history MUST be identified by product name and variant label (when present); two
  variants of the same product MUST NOT be merged.
- **FR-016**: History detail for quote requests created before this feature MUST be derived from the data
  already stored (revision snapshots, event payloads); no backfill of stored rows is required.
- **FR-017**: Every entry MUST name its actor: customer user (full name + e-mail) for storefront actions,
  admin user (full name + translated role) for admin actions, "System" for scheduled expiry and order
  completion. The actor MUST be the person who performed the action, not the request's requester. In
  particular every approval, acceptance, rejection and cancellation entry MUST attribute the decision to
  the individual user who made it (issue #283).
- **FR-018**: If an actor cannot be resolved, the entry MUST show the translated recorded role and "unknown
  user" and the rest of the timeline MUST render.
- **FR-019**: Actor names MUST be visible only on the admin surface (behind `rfqs:handle` and the existing
  sales-rep visibility rule); the customer API's actor exposure MUST NOT widen.

**Negotiation lock (US4)**

- **FR-020**: An administrator MUST be able to set price negotiation at two levels, each with a Polish and
  English label and description:
  (a) on the organization (`/organizations/:id`) — "Members may propose prices": allowed (default) or not
  allowed; applies to every customer account of the organization;
  (b) on the customer account (`/customers/:id`) — an override with three states: "as organization"
  (default, no override), "allowed", "not allowed". The customer screen MUST show the resulting effective
  value and whether it comes from the override or the organization.
  The effective value for a customer account = its override if set, else its organization's value, else
  "allowed". There is no platform-wide or per-sales-channel default. The value applies on every sales
  channel; two customers on one channel, and two members of one organization, can differ.
- **FR-021**: When negotiation is not allowed for the signed-in customer, the storefront quote request draft
  MUST NOT show the proposed-price input and MUST NOT send stored proposals; it MUST show the catalogue unit
  price read-only where known and a localized note that sales will price the request.
- **FR-022**: When negotiation is not allowed for the request's owner (FR-037), the customer create and
  draft-edit APIs MUST refuse a line carrying a proposed price with a dedicated, translated (Polish and
  English) error and write nothing.
- **FR-023**: Cart-to-quote conversion MUST keep working when negotiation is not allowed (FR-008 makes it
  carry no proposal).
- **FR-024**: The lock MUST NOT affect admin create/modify/approve or the agreed price, and MUST NOT alter
  proposals already stored on existing quote requests.
- **FR-025**: The storefront MUST learn the signed-in customer's effective value from an authenticated
  read; it MUST NOT be readable for another customer, it needs only the effective value (not the
  organization value and override separately), and the UI MUST NOT be the only enforcement (FR-022).
- **FR-026**: Changing the organization value or a customer account's override MUST be an audited admin
  write (Command Bus), recording the administrator, the organization or customer account and the old and
  new value (for the override, one of the three states).
- **FR-027**: Both controls (organization value and customer-account override) MUST be gated by the
  existing `customers:manage` permission (already listed on `/admin-roles`); reading them on the admin
  screens follows the existing `customers:read`. No new permission code is introduced.
- **FR-028**: With the Quote Requests module switched off, both lock controls, the storefront read and the
  enforcement MUST NOT be contributed; the stored values MUST be kept and take effect again when the module
  is switched back on.
- **FR-029**: No new command-palette entry is required: the controls live on two existing admin screens
  (`/organizations/:id`, `/customers/:id`), which are already reachable from the palette.
- **FR-037**: Every customer-side check of the lock (FR-021, FR-022) MUST use the effective value of the
  quote request's owner (`customerAccountId`); on create and resubmit the owner is the acting customer, on
  draft edit by an organization administrator it is the colleague who owns the request.

**Customer draft edit and line data carry-over on revisions (Q5)**

- **FR-034**: Saving an admin revision (the Modify tab and the admin modify API) MUST keep each surviving
  line's variant, line note and packaging unit (name and units per package) unless the rep changed them;
  the Modify tab MUST send the line's variant and line note rather than dropping them. Lines the rep adds
  carry the variant and note the rep chose and no packaging unit.
- **FR-035**: A customer draft edit (`patchDraft`) MUST store each line's packaging unit (name and units per
  package) as sent, as customer create already does; variant and line note continue to be carried as today.
- **FR-036**: As a consequence of FR-034 and FR-035, the History diff (FR-012, FR-015) MUST NOT report a
  line as removed and added, or a line note as changed, when the revision did not change it.
- **FR-038**: The customer draft-edit API (`patchDraft`) MUST refuse an edit only once the quote request
  has a `modified` event authored by an administrator (`actorAdminUserId` set). `modified` events written by
  customer draft edits — including an organization administrator's edit of a colleague's draft — MUST NOT
  block further customer edits. The existing refusals (status not `Pending`, version conflict) are
  unchanged.

**Cross-cutting**

- **FR-030**: All new admin and storefront texts MUST exist in Polish and English.
- **FR-031**: Admin-side reading changes (reference price, history) MUST be gated by the existing
  `rfqs:handle` permission (and `price_lists:read` for price resolution, which `rfqs:handle` declares as an
  advisory `requires` — shown on `/admin-roles`, not enforced, D-173). The stored at-request price is quote
  data and is shown to any `rfqs:handle` holder; resolving a current price (FR-006) or the prefill (FR-007)
  needs `price_lists:read`, and without it the screen shows "—" and leaves the input empty, as the admin
  create screen already does. Existing permission codes MUST be reused wherever one fits (FR-027).
- **FR-032**: *Withdrawn.*
- **FR-033**: The module documentation page `packages/modules/quote_requests/docs/quote_requests.md` MUST
  describe the reference price, the history entries and the negotiation lock, for operators and engineers.

### Key Entities

- **Quote request line**: product, variant, quantity, line note, packaging unit, customer's proposed unit
  price, agreed unit price, currency. Gains a submission-time reference unit price and a preserved original
  proposal; variant, line note and packaging unit survive revisions (FR-034, FR-035).
- **Reference price**: net unit price the customer would pay for the line at a given moment; "at request"
  (stored) or "current" (resolved on read).
- **History entry**: a rendered, possibly merged, view over one or more stored events: title, timestamp,
  actor (person + role, or System), details (reason, note, list of changes).
- **Organization negotiation value**: allowed / not allowed per organization, default allowed; changed by
  an administrator with `customers:manage`, audited.
- **Customer-account negotiation override**: as organization (none) / allowed / not allowed per customer
  account, default none; changed by an administrator with `customers:manage`, audited.
- **Effective negotiation value**: derived, never stored: override if set, else organization value, else
  allowed; evaluated for a quote request's owner.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For 100 % of lines on requests submitted after release where a price resolves, the admin
  detail shows reference, proposal and both differences without the rep leaving the screen.
- **SC-002**: The customer's original proposal remains visible after 1..n admin revisions (verified with
  ≥ 3 revisions).
- **SC-003**: No History entry shows a raw event identifier; 100 % of accept/reject/approve/cancel entries
  name a person or "System".
- **SC-004**: A rep can answer "what did we change in revision 2 and who accepted it" from History alone,
  in under 30 seconds, on a request with at least two revisions.
- **SC-005**: For a locked customer, 0 quote requests created through any customer path (UI, direct API,
  cart conversion) carry a customer proposal; cart conversion success rate unchanged; unlocked customers
  unaffected.
- **SC-006**: Every new string renders in both Polish and English admin and storefront locales (no
  missing-key fallbacks).

## Assumptions

- Reference price = effective net unit price for the customer (sale price if active, else base), resolved
  the way the admin create screen's prefill resolves it (`RfqCreatePage.tsx` →
  `GET /api/v1/admin/products/:id/resolved-price`), but on the sales channel the request was raised on
  (`salesChannelId`, stamped by `raisedOnChannelId()`), not the system-default channel the probe uses today;
  the plan makes the probe/port accept a channel. A resubmitted request resolves on its own (new) channel.
- Percentage difference = (proposed − reference) / reference × 100, rounded to 2 decimals; negative means
  a discount requested.
- The customer storefront history (`describeEvent`) is not changed; #283 is about the admin view.
- When locked, the customer may still enter a header note, line notes and line quantities.
- The lock is read at request time; changing either value migrates no quote request state.
- The reference price is resolved for the request's owner (FR-001), including when an organization
  administrator edits a colleague's draft; this follows the owner rule of FR-037.
- Actor role labels stored as English strings are mapped to translated labels for the known values
  (`Customer`, `System`, `Platform administrator`, `Sales representative`, `Administrator`); other values
  (custom role names) are shown as stored.
- An anonymous draft's typed proposals are not sent by the storefront (they stay in the browser draft),
  not refused, once the buyer is known to be locked; the server-side refusal (FR-022) is the guarantee.
- A security threat model follows the plan: the buyer-facing proposal refusal and the per-customer lock
  read are a new trust boundary.
- If reference-price resolution fails at customer submission for a reason other than "no price" (e.g. a
  pricing read error), the submission proceeds and the line stores no reference; on read it falls back to
  the current price (FR-006). Unlike the negotiation lock, the reference price is informational, so it does
  not fail the customer's write.
- A "changed line" in a customer draft edit (for re-resolving and storing the reference, FR-001) is any
  line whose product, variant, quantity or packaging unit differs from the line it replaces, since each can
  move the price bracket; a change of proposal or line note alone keeps the stored reference.
- Requests created before release that already carry one customer-authored `modified` event become editable
  by the customer again under FR-038; no data change is needed.
- An admin note (`note-added`) on a pending request does not close the draft to customer edits; only an
  admin `modified` event does (FR-038).
- The FR-009 every-line rule changes the meaning of `totalAtCustomerPrice` in the customer list summary for
  every consumer of that API, not only the storefront list; it is not a breaking shape change (the field is
  already `z.number().nullable()` in `packages/contracts/src/quote-requests.ts`).

## Out of Scope

- Customer-side (storefront) history readability and storefront display of reference/difference.
- Showing reference/difference on the admin quote request list (`/quote-requests`) or totals at reference
  price.
- A per-sales-channel negotiation lock (superseded by the per-customer lock) and any platform-wide or
  per-channel negotiation default.
- A storefront screen for editing a submitted pending request (the draft-edit API stays API-only).
- Showing the current price beside a stored at-request price.
- Listing custom-field changes in history.
- Listing packaging-unit changes in history (FR-012).
- Recomputing or backfilling reference prices for requests created before release.
- Changing who may accept/reject, status rules, notifications or e-mails.
- Using `discountPercent` (unused column) for anything.

## Clarifications

### Session 2026-10-13

- Q: Which base price does #279 mean — at request time or current? → A: Price at request time, stored; the
  current price, labelled "current price", only for lines without a stored one (FR-001, FR-002, FR-006;
  US1 #5, #6). Answered by the product owner.
- Q: Is the cart's unit price a customer proposal on cart → quote conversion? → A: No — converted lines
  carry no proposal; the cart price is stored as the line's base (reference) price (FR-008, FR-023; US1 #8,
  US4 #4). Answered by the product owner.
- Q: API behaviour when locked and a proposed price is sent? → A: Refuse with a translated error; nothing
  written (FR-022; US4 #3). Answered by the product owner.
- Q: What must a modification entry list? → A: The extended diff: lines added/removed, quantity, agreed
  price, proposed price, line note, header note, validity date; not custom fields (FR-012; US2 #2–#5,
  #4a). Issue #283's explicit attribution of approvals and rejections is part of the same answer (FR-017).
  Answered by the product owner.
- Q: Storefront when locked — hide the field or show it read-only? → A: Hide the proposed-price input, show
  the catalogue price read-only with a note (FR-021). Answered by the product owner.
- Q: With no proposal on cart-converted requests, what do list totals and the CRM value show? → A: No
  customer-price total: lists show "—" (not `0,00 PLN`), no fallback to the reference price; the CRM value
  stays 0 until sales prices the request (FR-009). Answered by the product owner.

### Session 2026-10-14

- Q: Scope of the negotiation lock — per sales channel or per customer? → A: Per customer (issue #284), not
  per sales channel; this supersedes an earlier per-channel answer (FR-020; US4 #7). Answered by the
  product owner; the account-vs-organization question is answered below.
- Q: Which party carries the negotiation lock — the customer account or its organization? → A: Both: an
  organization value applying to all its members, with a per-customer-account override (allowed / locked /
  as organization); effective = override, else organization, else allowed. Controls on `/organizations/:id`
  and `/customers/:id`. An organization administrator editing a colleague's request is governed by the
  request owner's effective value (FR-020, FR-037, FR-022; US4 #7a–#7d). Answered by the product owner.
- Q: Is there a platform-wide or per-channel negotiation default? → A: No; only the organization value and
  the account override, default "allowed" (FR-020; Out of Scope). Answered by the product owner.
- Q: Which permission gates the controls? → A: The existing `customers:manage`, for both (FR-027).
  Answered by the product owner.
- Q: On which sales channel is the reference price resolved? → A: The channel the quote request was raised
  on (`salesChannelId`, `raisedOnChannelId()`); the plan makes the price probe/port accept a channel
  (FR-001, FR-006, FR-007; US1 #4b; Assumptions). Answered by the product owner.
- Q: Is fixing the loss of variant, line note and packaging unit on the Modify-tab save, admin `modify` and
  customer `patchDraft` in scope? → A: Yes, so the History diff shows no false removals or changes (FR-034,
  FR-035, FR-036; US1 #9, #10). Answered by the product owner.
- Q: What does the storefront list's customer-price total show when only some lines carry a proposal? →
  A: "—" unless every line carries a proposal, as on the admin list; no partial sum and no reference-price
  fill (FR-009; US1 #8a–#8c; Edge Cases). Answered by the product owner.
- Q: Is lifting the customer draft-edit "one edit only" limit in scope? → A: Yes — a customer draft edit is
  refused only once an admin-authored `modified` event (`actorAdminUserId` set) exists; the customer's own
  edits do not block further edits (FR-038; US1 #11; Edge Cases). Answered by the product owner.
- Q: Are packaging-unit changes listed in History? → A: No; added to Out of Scope (FR-012; Out of Scope).
  Answered by the product owner.
- Q: Is FR-025's "the storefront needs only the effective value" acceptable as written? → A: Yes,
  unchanged (FR-025). Answered by the product owner.
