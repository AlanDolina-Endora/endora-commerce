# Feature Specification: Order and Quote status push notifications — operator switches and customer preferences

**Feature Branch**: `feat/149-pwa-order-status-push`
**Created**: 2026-10-16
**Status**: Draft
**Input**: Product owner request (translated from Polish): "Add a Setting in the PWA section of
the Admin UI that determines whether push notifications are shown when an Order / Quote (Offer)
status changes. The Customer can also set on their account whether they want to receive push
notifications."

## Context — what exists today

This feature extends the push notifications delivered by the PWA module (pre-migration feature
`046-pwa-module`, whose FR-024 promised automatic pushes "at minimum on order-status changes and
quote-request updates"). Measured on the tree this spec was written against:

- **Order status pushes are sent**, whenever push is enabled for the sales channel, with no way
  for the operator to switch that category off short of switching push off altogether. The
  sentence is English-only, the status is shown as its raw code, and the link opens the order
  *list* rather than the order.
- **Quote status pushes have never been sent by any deployment.** The handler exists but listens
  to an event no module emits and is given no way to read the quote; the storefront nevertheless
  promises "notifications about your orders and quotes".
- **A customer can only switch push off per browser**, on the account profile ("Notifications on
  this device"). There is no account-level choice, and no way to keep order updates while
  dropping quote updates (or the reverse).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — The operator decides which status changes produce a push (Priority: P1)

An administrator opens **Settings → PWA** and, in the push section, finds two switches: "Order
status changes" and "Quote status changes". Each can be set globally or overridden per sales
channel, exactly like the existing push switch. Turning one off stops that category of automatic
notification on that channel; manual sends from the same screen are unaffected.

**Why this priority**: It is the product owner's primary ask and the operator's only lever today
is all-or-nothing.

**Independent Test**: With push enabled and a customer device subscribed, change an order's status
with "Order status changes" on → a notification is queued; switch it off → the next status change
queues nothing; the admin manual send still works.

**Acceptance Scenarios**:

1. **Given** push is enabled on channel A and "Order status changes" is on, **When** an order
   placed on channel A by a subscribed customer changes status, **Then** one notification is
   queued for that customer's devices on channel A.
2. **Given** "Order status changes" is off globally, **When** an order changes status, **Then**
   no notification is queued and nothing is reported as an error.
3. **Given** "Order status changes" is off globally but on for channel B, **When** orders change
   status on channel A and on channel B, **Then** only the channel B order produces a
   notification.
4. **Given** push itself is off for a channel, **When** the category switches are on, **Then** no
   automatic notification is sent on that channel (the master switch wins), and the admin screen
   shows the category switches as inactive while push is off.
5. **Given** the Quote Requests module is switched off, **When** the administrator opens the PWA
   screen, **Then** the "Quote status changes" switch is not offered.

---

### User Story 2 — The customer receives a meaningful, localised notification when an order or quote changes (Priority: P1)

A customer who has notifications on receives a notification when one of **their** orders changes
status, or when one of **their** quote requests is prepared, revised, approved, cancelled or
expires. The notification is in the shop's language for that channel (Polish or English), names
the order or quote number, names the new order status the way the shop labels it, and opens that
order or quote when tapped.

**Why this priority**: Without it the quote half of the product owner's request does nothing at
all, and the order half shows raw status codes and links to the wrong page.

**Independent Test**: On a Polish channel, approve a subscribed customer's quote request from the
admin → one Polish notification naming the quote number, opening the quote's page.

**Acceptance Scenarios**:

1. **Given** a Polish-language channel whose order status `shipment_sent` is labelled "Wysłane",
   **When** order `ORD-1001` moves to it, **Then** the notification reads (in Polish) that order
   ORD-1001 now has status "Wysłane", and tapping it opens that order's detail page.
2. **Given** an English-language channel, **When** an administrator approves quote request
   `QR-77`, **Then** the customer who requested it receives an English notification that quote
   QR-77 was approved, opening that quote's page.
3. **Given** an administrator revises the prices of a quote request, **When** the revision is
   saved, **Then** the requester is notified that a revised offer is waiting.
4. **Given** an administrator creates a quote request on a customer's behalf, **When** it is
   saved, **Then** that customer is notified that a quote was prepared for them.
5. **Given** a quote request expires, **When** the expiry is recorded, **Then** the requester is
   notified that it expired.
6. **Given** the same status-change announcement is delivered twice, **When** it is processed,
   **Then** the customer receives one notification, not two.
7. **Given** an order placed by a guest (no account), **When** it changes status, **Then** no
   notification is produced.

---

### User Story 3 — The customer chooses on their account which updates they want (Priority: P2)

On the account profile, a signed-in customer sees a "Push notifications" section. Besides the
existing per-browser control ("Notifications on this device"), it offers two account-wide choices,
"Order status updates" and "Quote updates", which apply to **every** device on which they have
notifications turned on. Both are on by default. Unticking one stops that kind of notification
on all their devices; the browser subscription is left alone, so the other kind keeps arriving.

**Why this priority**: It is the product owner's second ask; it is valuable only once Story 1 and
2 produce notifications worth choosing between.

**Independent Test**: Customer unticks "Quote updates" → an admin approves their quote → nothing
is queued; an order status change on the same account still produces a notification.

**Acceptance Scenarios**:

1. **Given** a customer who never changed their choices, **When** they open the account profile,
   **Then** both choices are shown ticked.
2. **Given** a customer unticks "Order status updates" and saves, **When** any of their orders
   changes status, **Then** no notification is produced for any of their devices, and the choice
   is still unticked on their next visit from any browser.
3. **Given** the shop's operator switched "Quote status changes" off for this channel, or the
   Quote Requests module is off, **When** the customer opens the section, **Then** the "Quote
   updates" choice is not shown.
4. **Given** push is not enabled for the channel, **When** the customer opens the account
   profile, **Then** the whole section is absent.
5. **Given** the browser has blocked notifications, **When** the customer opens the section,
   **Then** the per-device control explains that notifications are blocked in the browser, while
   the account-wide choices remain editable (they govern other devices too).
6. **Given** a customer is not signed in, **When** a request is made to read or change these
   choices, **Then** it is refused.

---

### Edge Cases

- **Module switched off.** With PWA off: no notification is queued for any status change, the
  customer's choices cannot be read or changed (the request is refused as unavailable), the
  account section is absent, the admin screen is absent; switching PWA back on restores every
  saved switch and choice unchanged and notifications resume for subsequent changes. With Quote
  Requests off: quote notifications cannot occur, the quote switch and choice are not offered,
  and order notifications are unaffected.
- **A status change while the order or quote cannot be read** (its owning module refuses):
  nothing is sent, the business change itself is never undone or delayed, and the skip is logged
  distinctly from a genuine failure.
- **A status label missing in the channel's language**: the shop's default label for that status
  is used, then the status code.
- **A channel language the platform ships no bundle for**: English.
- **A quote request with no recorded sales channel** (created outside a storefront request):
  the shop's default channel is used to choose devices, language and switches.
- **An account that is deleted or anonymised**: no notification is produced for it.
- **Bulk status changes** (an operator moves many orders at once): one notification per order and
  per customer device; the business operation is never slowed by notification work.
- **Self-initiated changes** (the customer cancels their own order or accepts an offer): notified
  like any other change (see Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

**Operator configuration**

- **FR-001**: The PWA settings screen MUST offer an "Order status changes" switch and a "Quote
  status changes" switch in its push section, each settable globally and overridable per sales
  channel with the same scope selector the screen already uses.
- **FR-002**: Both switches MUST default to **on**, so a shop that already has push enabled keeps
  today's order behaviour after upgrading.
- **FR-003**: An automatic order-status notification MUST be produced only when push is enabled
  **and** "Order status changes" is on for the order's channel; likewise for quotes with "Quote
  status changes".
- **FR-004**: Changing either switch MUST be restricted to administrators holding the existing
  "Configure PWA" permission and MUST be recorded in the audit trail like every other PWA setting.
- **FR-005**: The "Quote status changes" switch MUST NOT be offered while the Quote Requests module
  is absent (switched off or not installed); its stored value MUST be kept.
- **FR-006**: The switches MUST NOT affect notifications an administrator sends manually.

**Triggers and content**

- **FR-007**: An order notification MUST be produced for every committed order status change of an
  order placed by a customer account, addressed to that account only.
- **FR-008**: A quote notification MUST be produced, addressed to the requesting customer account,
  when a quote request is created on the customer's behalf by staff, when its offer is revised,
  approved, cancelled, or when it expires. A customer's own submission MUST NOT produce one.
- **FR-009**: A notification MUST be delivered only to that account's devices that are currently
  subscribed on the relevant sales channel.
- **FR-010**: The title and body MUST be rendered in the channel's default language when the
  platform ships it (Polish or English), falling back to English; both languages MUST be supplied
  for every sentence this feature introduces.
- **FR-011**: An order notification MUST name the order number and the new status using the shop's
  own label for that status in the notification's language, falling back to the shop's default
  label and then to the status code.
- **FR-012**: A quote notification MUST name the quote number and say what happened (prepared for
  you / revised offer / approved / cancelled / expired).
- **FR-013**: Tapping a notification MUST open the storefront page of that specific order or
  quote request.
- **FR-014**: The same status-change announcement MUST produce at most one notification, however
  many times it is delivered.
- **FR-015**: Producing a notification MUST NOT block, slow, fail or roll back the status change
  that caused it; any failure MUST be logged, and a skip caused by a module being switched off
  MUST be logged distinctly from a failure.
- **FR-016**: No notification MUST be produced for a guest order or for a deleted or anonymised
  account.

**Customer preference**

- **FR-017**: A signed-in customer MUST be able to read and change two account-wide choices —
  order status updates and quote updates — from the account profile.
- **FR-018**: A customer who never made a choice MUST be treated as having both choices on.
- **FR-019**: When a choice is off, no notification of that kind MUST be produced for any of the
  account's devices; the device subscriptions MUST be left untouched.
- **FR-020**: The account section MUST be shown only when push is enabled for the current channel;
  each choice MUST be shown only when its category is currently offered on that channel (FR-003,
  FR-005).
- **FR-021**: The existing per-browser control MUST keep working as today and MUST remain the place
  where browser permission and the device subscription are handled.
- **FR-022**: Reading or changing the choices MUST be refused to anyone but the signed-in customer
  the choices belong to, and every change MUST be recorded in the audit trail with that customer
  as the actor.
- **FR-023**: All storefront text this feature adds or reworks in the section MUST be available in
  Polish and English.

**Module presence**

- **FR-024**: While PWA is switched off: no notification MUST be queued, the preference read/write
  MUST be refused as unavailable, and both the admin screen and the storefront section MUST be
  absent. Switching it back on MUST restore all switches and choices unchanged. Nothing is
  deleted.
- **FR-025**: PWA MUST keep working with Quote Requests switched off or uninstalled: order
  notifications, the order switch and the order choice are unaffected.

### Key Entities

- **Status-notification switches** (operator configuration): two on/off values per scope (global,
  or one sales channel), one for order status changes and one for quote status changes.
- **Customer push preference**: one per customer account; whether that account wants order status
  updates and whether it wants quote updates. Absent means both on. Belongs to the customer's
  organisation for visibility purposes.
- **Push notification** (existing): one per status-change announcement, addressed to one account's
  devices on one channel, with a title, body and destination.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With both switches and both choices on, 100% of committed order status changes and
  of the five quote events in FR-008 for an account-owned order/quote produce exactly one queued
  notification (verified by automated test over every trigger).
- **SC-002**: With a switch or a choice off, 0 notifications of that category are queued
  (verified by automated test for each of the four switch/choice combinations).
- **SC-003**: Every sentence this feature introduces exists in both Polish and English; a Polish
  channel's notification contains no English words other than the order/quote number and an
  operator-supplied status label.
- **SC-004**: A tapped notification lands on the specific order or quote in one step (no list
  page in between).
- **SC-005**: An operator can change either switch in under 30 seconds from opening the PWA
  screen, and a customer can change either choice in under 30 seconds from opening the account
  profile.
- **SC-006**: With PWA switched off, a status change produces no notification and no stored
  notification record; after switching it back on, the first subsequent status change notifies
  as configured before.

## Assumptions

- **Recipients**: only the account that placed the order or requested the quote is notified;
  other members of the same organisation are not. (Product owner may extend later.)
- **Which quote events count as a "status change"**: created on the customer's behalf, offer
  revised, approved, cancelled, expired. A revised offer is not a status change in the strict
  sense, but it is the moment the customer is waiting for, so it is included. Conversion of an
  approved quote into an order is notified through the order's own status changes.
- **Self-initiated changes are notified too** (e.g. the customer cancels their own order); this
  doubles as a confirmation on other devices. Suppressing them would need the announcing modules
  to say who acted, which they do not for quotes today.
- **No per-status filtering**: the operator switches categories, not individual statuses. Choosing
  which order statuses notify is out of scope.
- **Language**: the channel's default language. Customers have no stored language preference
  today; transactional e-mails make the same choice.
- **Default for customers**: both choices on — the customer already consented to notifications
  when their browser subscribed, and the per-device control remains the way to stop everything.
- **Admin users** still receive no push (unchanged from feature 046's FR-025).
- **Notification grouping** (one notification replacing the previous one for the same order on
  the device) is out of scope.

## Resolved defaults (2026-10-16 — product owner may still override)

The questions this spec left open were resolved at implementation time by taking the defaults
below; each is implemented and tested as stated. Overriding one is a follow-up change, not a
blocker.

1. A **revised offer** (`rfq.modified`) notifies — *resolved: yes* (FR-008).
2. Changes the **customer made themselves** notify — *resolved: yes*.
3. The operator chooses **categories only**, not individual order statuses — *resolved: two
   category switches, no per-status selection*.
4. **Recipients** — *resolved: only the account that placed the order or requested the quote*;
   other members of the organisation are not notified (Assumptions).
