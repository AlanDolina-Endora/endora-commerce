# Research: quote request reference price, readable history, per-customer negotiation lock

**Feature**: `specs/146-quote-request-pricing-history/` | **Date**: 2026-10-14 | **Spec**: [spec.md](./spec.md)

**Revised 2026-10-14** after `/speckit.analyze` and the security threat model: R2 (probe authority,
batching), R3 (create schema strips, reference validation), R5 (omitted proposal carried), R8
(exposure and bounds), R10 (classification no longer carries enforcement), R11 (primary-key reads in
system scope, current organization, placement), R12 (authority inside the Commands), R15 (three-way
guard, re-checked under the row lock), R16 (new: abuse bounds).

Every decision below is stated as *decision → rationale → alternatives rejected*. Paths are relative
to the repository root; module sources are under `packages/modules/<id>/src/`. Nothing here was run
against a built tree — the assumptions that only a test can settle are collected in
[plan.md](./plan.md) § *Inferred, to be proven by the first test of the phase*.

## R1 — Where the reference price is stored

**Decision**: three nullable columns on `quote_request_items` — `reference_unit_price numeric(12,2)`,
`reference_currency varchar(3)`, `reference_captured_at timestamptz` — written all-or-none (a check
constraint holds it), plus **carry-over** of those three columns on every line rewrite (R5). A line
with the three columns `null` has no stored reference and is shown with the *current* price
(FR-006).

**Rationale**:

- The lines are deleted and recreated on every revision (`rfq-admin-service.ts` `modify`,
  `rfq-service.ts` `patchDraft`). FR-034 already obliges both paths to carry variant, line note and
  packaging unit across that rewrite by line identity (R5); the reference is one more set of fields
  on the same carry-over, not a second mechanism.
- The value is read on every admin detail view, per line; a column is the cheapest read and needs
  no join.
- `numeric(12,2)` matches `desired_unit_price` / `agreed_unit_price`, so the difference is computed
  on one basis.

**Alternatives rejected**:

- *A side table keyed by `(quote_request_id, product_id, variant_id)`* — survives the rewrite
  without carry-over, but the key is not unique (two lines of one product and variant with
  different packaging units are legal, `carts` keeps them apart by `packagingUnitId`), and the
  carry-over it avoids is required anyway by FR-034.
- *Only in the revision snapshot (`items_snapshot` jsonb)* — the value would have to be found again
  by matching the current line to a line of the submission revision on every read; that match is
  exactly what R5 settles once, at write time.
- *Reusing `discount_percent`* — the spec puts it out of scope, and it is a percentage, not a price.

## R2 — Where and how the reference is resolved (and on which channel)

**Decision**: `price_lists` publishes a new port, **`buyerLinePricePort`** (contract
`BuyerLinePricePort` in `packages/contracts/src/price-lists.ts`), with one batch method
`resolveForBuyer({ buyer: { customerAccountId, organizationId }, salesChannelId, lines })`. Its
implementation is the body the admin probe `GET /api/v1/admin/products/:id/resolved-price`
(`packages/modules/price_lists/src/backend/routes.ts`) runs today, lifted into a service, with the
system-default channel replaced by `salesChannelId ?? <system default>`. The probe gains an optional
`salesChannelId` query parameter and calls the same service. `quote_requests` resolves the port with
`lazyPort<BuyerLinePricePort>(ctx, 'buyerLinePricePort')` and calls it with the request's
`salesChannelId` and **owner** (`rfq.customerAccountId`, `rfq.organizationId`), never the actor.

**Rationale**:

- The spec's Assumptions define the reference as "resolved the way the admin create screen's prefill
  resolves it, but on the sales channel the request was raised on". One implementation behind both
  the probe (current price, FR-006/FR-007, read by the admin UI) and the port (at-request price,
  FR-001, written by the server) is what makes "price at request" and "current price" the same
  question asked at two moments. Two assemblies of one rule are what feature 075 / issue #108 kept
  finding drifted (`organizationSalesRepScopePort` exists for that reason).
- The rule "customer's group overrides the organization's" (`customer?.customerGroupId ??
  organization?.customerGroupId`) and the channel lookup (`SalesChannel` is a kernel entity
  `price_lists` already reads) stay inside the module that owns pricing.
- A batch method keeps a 50-line submission at one port call and lets the implementation load the
  products, customer, organization and channel once.

**Alternatives rejected**:

- *Assemble the call in `quote_requests` from `LinePricePort` (`pricingService`)* — the port
  already accepts `salesChannel`, but the caller would have to read the customer, the organization
  (as `PriceOrganization`) and the channel's `defaultCurrency` through three more ports and
  re-implement the group precedence. That is the second assembly the rationale rejects.
- *Have the admin UI call the probe at submission time* — the reference must be server-side and
  untrusted input must not set it (FR-001).

**Probe authority (threat model T8, coordinator decision D-3M)**: the probe today answers any
`price_lists:read` holder about any organization or customer account. Once it accepts a channel and
backs a screen every sales representative uses, a representative scoped to organization A could
read organization B's negotiated prices through it. The route therefore resolves the organization
it is asked about (`organizationId`, else the account's own), refuses a `customerAccountId` that is
not a member of the given `organizationId` (`400`), and for a non-platform admin requires
`organizationSalesRepScopePort.canSeeOrganization` — refusing with the same status and body as an
unknown organization, so the answer discloses nothing about existence. An unknown `salesChannelId`
answers the same `400 VALIDATION_FAILED` as a malformed one, without echoing the id. `price_lists`
already depends on `organizations`, so the `lazyPort` adds no manifest edge. The **port** performs
no such check: its one caller (`quote_requests`) passes the owner of a quote request it has already
authorised, and the check belongs to the HTTP boundary. *Alternative rejected*: leaving the probe
platform-wide on the ground that `price_lists:read` is a broad grant — the grant is about price
lists, not about other organizations' customers, and every other sales-rep surface is scoped.

**Batching bound (T11)**: the service resolves in chunks (one load of products, customer,
organization and channel per chunk), and `quote_requests` sends lines in chunks, so a large cart
conversion is several bounded queries rather than one unbounded `IN` list.

**Dependency edge**: `quote_requests` adds `price_lists` to its manifest `dependencies`. `price_lists`
is `nonDeactivatable`, so the edge makes no activation control a dead switch (`module-composition.md`
item 4a is about the reverse direction: a non-deactivatable *dependent*); it is what
`check:port-dependencies` requires for a `lazyPort` read. The existing manifest comment on
`permissions` ("not a `dependencies` entry") argues about the advisory `requires: ['price_lists:read']`
for the **UI probe**; that comment is updated in the same change to say the port edge is now a
real dependency while the probe permission stays advisory. No cycle, checked over the **closure** and not only the direct list: `price_lists` depends on
`audit_logs`, `catalog`, `currencies`, `customer_accounts`, `organizations`, `settings`, and their own
`dependencies` add `auth`, `admin_users`, `admin_roles`, `assets_library`, `custom_fields`,
`dictionaries`, `email`, `sales_channels` and `transactional_emails`. The manifests that name
`'quote_requests'` at all are `carts`, `crm`, `customers`, `orders`, `organizations`, `quick_order` and
`shopping_lists`; of these only `organizations` is in the closure, and there the name occurs in a
comment about `rfqs:handle`, not in `dependencies`. `test/unit/db/module-graph.test.ts` (T033) is
the instrument that confirms it.

**Failure handling (FR-001 Assumption, composition rule 7)**: `price_lists` answers "nothing
applies" as `null` per line (that is "no price", stored as no reference). Any thrown error at
customer submission is tolerated by **one** narrow `catch` in
`quote_requests/src/backend/services/reference-price.ts` whose first line is
`rethrowIfModuleDisabled(error)` and whose comment states why the tolerance is right (the reference
is informational; the spec says the submission proceeds). The admin read path does not catch.

**Unit of the reference (packaging units)**: verified in `carts/src/backend/services/cart-service.ts`
(`effectiveQuantity = packagingUnit.baseQuantity * input.quantity`) and
`backend/test/integration/quote_requests/rfq-packaging-snapshot.test.ts`: a packaging-unit line
reaches a quote request with its quantity **in base pieces** and the cart's unit price **per base
piece**; the storefront draft (`storefront/lib/rfqDraft.ts`) has no packaging units, and quick order
sends none. So the reference is resolved at the line's quantity and per the unit that quantity is
expressed in — base pieces — which is the governing rule of the spec's edge case. **Resolved by
12efc10ac**: the spec now states that a quote line's quantity is always in base pieces and that no
multiplication by units per package applies, which is what this design does. The resolver is asked
with the line's `quantity` only — `packagingUnitBaseQuantity` never enters the query (T6) — and the
admin screen labels the reference "per base unit". Whether a customer-supplied
`packagingUnitName` / `packagingUnitBaseQuantity` should be validated against the catalogue's
packaging units is **not decided here**: it is an owner question in the plan's hand-off.

**Currency**: the reference is resolved in the channel's default currency (what a normal order on
that channel is priced in — the probe's own default). Lines are still hard-coded `PLN`; when the
two differ, FR-005 applies (shown in its own currency, no difference). Fixing `lineCurrency` is out
of scope (coordinator decision D-3K); the defect is logged, not fixed (tasks T089a).

## R3 — Cart conversion: the reference comes from the cart, and the HTTP body cannot supply one

**Decision**: `RfqCustomerPort.createForCustomer` gains an optional third argument,
`options?: { lineReferencePrices?: ReadonlyArray<{ amount: string; currency: string } | null> }`,
index-aligned with `input.items`. It is a TypeScript port parameter, not a field of
`createQuoteRequestLineSchema`, so it is unreachable from `POST /api/v1/quote-requests`. That body
is parsed by `createQuoteRequestSchema`, which is **not** strict: an unknown key such as
`referenceUnitPrice` or `lineReferencePrices` is stripped, not refused, and it stays that way (the
request schemas are not tightened, analyze finding M4). The guarantee is therefore *ignored*, and
the test asserts that the stored reference equals the server-resolved value, not a 400.
`PATCH /api/v1/quote-requests/:id` parses with `patchQuoteRequestSchema`, which is already
`.strict()` and refuses the same keys. `carts`' `convertToQuoteRequest` stops sending
`desiredUnitPrice` and passes `{ amount: it.unitPrice, currency: it.currency }` per line. When a
caller passes `lineReferencePrices`, `createForCustomer` validates every entry before any write —
finite, ≥ 0, at most two decimals, currency matching `/^[A-Z]{3}$/`, array length equal to
`input.items` — and throws on the first violation (T6); then it stores those and does not call
`buyerLinePricePort` for the supplied lines; every other path resolves server-side (R2). The port
is in-process, so the validation defends against a programming error in a composed module, not a
buyer; it is cheap and it keeps a malformed value out of a `numeric(12,2)` column.

**Rationale**: FR-001 forbids trusting a client-supplied reference and FR-008 makes the cart's own
server-side snapshot the reference. An in-process port argument is the trust boundary: only modules
composed in this process can reach it, and only `carts` does. The quick order, shopping list and
order-copy paths pass nothing and are resolved server-side.

**Alternatives rejected**:

- *A `referenceUnitPrice` field on `createQuoteRequestLineSchema`* — the HTTP route parses with
  that schema, so any buyer could set their own reference.
- *A second port method `createFromCart`* — duplicates `createForCustomer`'s 100 lines of
  validation for one extra datum.
- *Let conversion resolve server-side like every other path* — the spec's clarification is
  explicit: the cart price is the reference (US1 #8), and a cart price can legitimately differ from
  a fresh resolution (a sale that ended between add-to-cart and conversion).

## R4 — Customer's proposal survives admin revisions

**Decision**: `modify` carries `desiredUnitPrice` across the rewrite by line identity (R5), exactly
as it carries the reference. For lines of requests revised **before** this feature (whose current
rows already lost it), the admin detail falls back on read to the **submission record**: the latest
revision authored by a customer (`created_by_customer_account_id` set) that precedes the first
admin-authored revision, matched by the R6 line-matching rule. The admin item DTO exposes the
result as `customerProposedUnitPrice` (admin replies only).

**Rationale**: FR-002 and US1 #4. After the first admin revision the customer can no longer edit
(FR-038), so carrying the column freezes the last customer proposal; the spec's edge case names the
submission record as the source for what was lost. The fallback reads one revision row per detail
view.

**Consequences, accepted and stated**: the admin list's `totalAtCustomerPrice` (every line must
carry a proposal) now survives a revision instead of turning `null` at the first one; the CRM value
(`agreedUnitPrice ?? desiredUnitPrice`) is unchanged in practice because a revised line carries an
agreed price. Neither is a regression; both are listed in the plan.

**Alternatives rejected**: *a new `original_desired_unit_price` column* — one more column holding
what `desired_unit_price` already holds once it is carried; *no legacy fallback* — leaves US1 #4
false for every request revised before release, which the spec's edge case addresses explicitly.

## R5 — Line identity on a rewrite (FR-034, FR-035, FR-036)

**Decision**: a shared pure helper `services/line-carry-over.ts` pairs incoming lines with existing
rows:

1. **Admin `modify`**: a line carrying `id` that names an existing row of this request **and** the
   same `productId` is that row. A line without `id` is paired with a not-yet-paired existing row by
   the R6 rule (product, variant, then packaging name, then position). Unpaired incoming lines are
   new; unpaired existing rows are removed.
2. **For a paired line** the server keeps `packagingUnitName`, `packagingUnitBaseQuantity`,
   `desiredUnitPrice`, the three reference columns and the product name snapshot (which carries the
   packaging suffix); it keeps `variantId` and `lineNote` when the body omits the key, takes them
   from the body when present (`lineNote: null` clears). A **new** line carries the variant and note
   the rep chose, no packaging unit and no reference (FR-006 current price applies).
3. **Customer `patchDraft`**: lines arrive without ids; pairing is by the R6 rule. Variant and line
   note are taken from the body as today; packaging unit is stored **as sent** (FR-035) and the
   name suffix is applied as `createForCustomer` does. A paired line whose product, variant,
   quantity and packaging unit are unchanged keeps its stored reference; any other line is
   re-resolved (spec Assumption: such a change can move the bracket). A change of proposal or line
   note alone keeps the reference. **A paired line whose body omits `desiredUnitPrice` keeps the
   stored proposal** (threat model T5): otherwise a locked owner — who may not send a proposal —
   could erase a proposal stored before the lock just by resending the line, which FR-024 forbids
   ("MUST NOT alter proposals already stored"). An explicit value replaces it; the lock decides
   whether an explicit value is allowed (R11).
4. **The admin Modify tab** sends `id`, `variantId` and `lineNote` for every kept line (FR-034).

**Rationale**: `adminPatchQuoteRequestLineSchema` already declares an optional `id`, which `modify`
ignores today; using it is additive and needs no contract change. "Absent key = keep" protects
direct API clients that send only `{ id, productId, quantity, agreedUnitPrice }`.

**Alternatives rejected**: *match on product only* — collides on variants (FR-015); *update rows in
place instead of delete + recreate* — a larger rewrite of two services whose `em.removeAndFlush` /
`persistAndFlush` sequence the revision snapshot relies on; the carry-over gets the same result.

## R6 — The history diff: computed on read, admin-only, variant-aware

**Decision**: a new pure function `historyDiff(before, after)` in
`quote_requests/src/backend/services/history/history-diff.ts` compares two revision snapshots and
returns the FR-012 change list: line added (quantity, agreed price), line removed, quantity,
agreed price, **proposed price**, **line note**, header note; plus a **validity** change taken from
the event (R7). Lines are matched by: same `productId` and `variantId`; within such a group, equal
`packagingUnitName` first (when both snapshots carry the field), then by order. Packaging-unit
changes and custom-field changes are never listed. The existing `RfqRevisionService.diffRevisions`
and `rfqDiffEntrySchema` are **unchanged**.

**Rationale**:

- FR-016: history for requests created before release must come from stored data; consecutive
  revision snapshots hold lines, quantity, agreed and proposed price, line note and header note.
  Computing on read covers old and new requests with one code path and no backfill.
- `rfqDiffEntrySchema` is shared with the customer's `comparisonAgainstLastSeen`, and the storefront
  renders it through an exhaustive `switch (d.kind)`
  (`storefront/app/(account)/quote-requests/[id]/page.tsx:335`). New kinds there would be a
  customer-facing change the spec puts out of scope.
- The revision snapshot (`QuoteRequestRevisionLine`, jsonb) gains optional `packagingUnitName` and
  `packagingUnitBaseQuantity` so the matcher can tell two packaging lines apart. Old snapshots
  lack them; the matcher treats an absent field as "unknown" and falls back to order — no migration.

**Alternatives rejected**: *extend `diffRevisions` and persist the richer diff in `payload.diff`* —
changes the customer contract and leaves pre-release events with the old diff, so history would
need two renderers; *diff the event payloads* — they never held proposals, notes or variants.

## R7 — Validity changes

**Decision**: `modify` adds `validity: { before: string | null; after: string | null }` (ISO
timestamps) to the `modified` event payload when `expiresInDays` was sent and the resulting
`expiresAt` differs from the previous one. History reads it from the event. Pre-release
modifications carry no such key and list no validity change (spec US2 #8).

**Rationale**: the event is written in the same call that changes `expiresAt` and already carries a
payload; no schema change. The value is not sensitive towards the customer: the customer reply
already carries `expiresAt`, and FR-019 restricts actor exposure only.

**Alternatives rejected**: *a `expires_at_snapshot` column on `quote_request_revisions`* — a
migration for a value that, unlike lines, is only ever needed as a before/after pair at the moment
it changes; and old rows would be `null`, indistinguishable from "no validity".

## R8 — History projection: merged entries, names, served by the backend

**Decision**: a new admin endpoint `GET /api/v1/admin/quote-requests/:id/history` (gated by
`rfqs:handle` and the existing sales-rep visibility rule through `findVisibleForAdmin`) returns
**structured** entries — kind, timestamp, actor, revision number, note/reason, change list — built
by `services/history/history-projection.ts` from the events and revisions. The admin History tab
renders them with keys from the module's own bundle. The pairing rules (FR-011) are:

| Stored events (adjacent, same actor) | One entry |
| --- | --- |
| `created` + `submitted` | `submitted` |
| `created` (with `sourceRfqId`) + `re-submitted` | `resubmitted` |
| `created` by an admin + `note-added` whose note equals the automatic English sentence | `created_by_admin` (note dropped) |
| `customer-accepted-revision` + `approved` | `accepted_by_customer` (revision number) |
| `customer-rejected-revision` + `canceled` | `rejected_by_customer` (reason) |
| admin `note-added` + `approved` | `approved` (note) |

Every other event is one entry. Actors are resolved in one batch each through
`AdminUserReadPort.findByIds` and `CustomerAccountReadPort.findByIds` (both already resolved by this
module); an actor that cannot be resolved yields the recorded role label and "unknown user"
(FR-018). `System` is an actor kind, not a name. Recorded role labels `Customer`, `System`,
`Platform administrator`, `Sales representative`, `Administrator` are mapped to bundle keys in the
UI; any other label (a custom role name) is shown as stored.

**Rationale**:

- The customer DTO's `events` stay byte-identical (FR-019: no widened actor exposure), and the
  storefront's `describeEvent` is untouched (out of scope).
- Pairing, diffing and name resolution are logic; on the backend they are unit-testable as pure
  functions and do not ship revision snapshots to the browser.
- **Where the words come from** (`specs/conventions/module-i18n.md`, the translation boundary): the
  backend composes no prose here — it returns codes and values, like every admin status label, and
  the admin renders them from its bundle in the administrator's language. The automatic English
  creation note is the one piece of stored prose and it is *replaced* by a translated title
  (FR-011), recognised by exact equality with the constant `rfq-admin-service.ts` writes.
- A separate endpoint, loaded when the tab opens, keeps the detail response (read on every visit
  and every save) from paying for revisions and name lookups.

**Exposure and bounds (threat model T9)**:

- **Actor mapper, explicit**: from `AdminUserRecord` only `firstName` and `lastName` are copied
  (never `email`, `lastLoginAt`, `twoFactorEnabled`, `status`); from `CustomerAccountRecord` the
  name and e-mail FR-017 requires. A mapper rather than a spread, so a field added to either record
  later does not reach the response.
- **No deleted-customer PII**: customer lookups pass `activeOnly: true`. A deleted customer is then
  not returned and renders through FR-018's path — recorded role and "unknown user" — rather than
  a dedicated "deleted user" string, which the spec does not define.
- **Bounded reads**: `RfqEventService.listForRfq` already caps at 100 oldest-first. History reads
  the **most recent** 100 events (`limit: 101` to detect more), returns them oldest-first with
  `truncated: true` when older ones exist, and reads only the revisions those events reference plus
  each one's predecessor. A request with more than 100 events is not a realistic negotiation; the
  bound is about a hostile or runaway writer, and the admin sees a notice rather than a silent cut.
- **Gate**: `401` without a session, `401`/`403` for a customer session (the route is admin-only),
  and for a sales representative outside the request's organization the same `404` and body as an
  unknown id — `findVisibleForAdmin` already behaves so, and a test pins it (C1, Constitution XI).

**Alternatives rejected**: *names on `events` in the detail reply* — widens a schema shared with the
customer path, and still leaves pairing and diff to the browser; *backend-composed sentences* —
plural readers are not the issue here, but a sentence per locale on the server duplicates the
admin's bundle mechanism for one screen.

## R9 — Where the negotiation lock is stored

**Decision**: two tables owned by `quote_requests`, created by one `quote_requests` migration:

- `quote_request_org_policies` — `organization_id uuid primary key references organizations(id) on
  delete cascade`, `price_proposals_allowed boolean not null default true`, `updated_at`.
- `quote_request_account_policies` — `customer_account_id uuid primary key references
  customer_accounts(id) on delete cascade`, `price_proposals_allowed boolean null` (`null` = "as
  organization"), `updated_at`.

A missing row means the default (organization: allowed; account: as organization). The effective
value is computed, never stored (Key Entities). The controls are `quote_requests`' contributions to
the existing zones `organization.detail.after` and `customer.detail.after`, backed by
`quote_requests`' own routes.

**Rationale**:

- **Principle I and `module-migrations.md` 4a/R2**: the concept is the quote module's. A column on
  `organizations` or `customer_accounts` would have to be added by *their* migrations and written
  through a port each of them publishes for a field they do not use.
- **Principle XVII / FR-028**: with the module off, its routes answer 503, its zone contributions
  are filtered by the host, its enforcement is inside its own services — and its rows are simply not
  read. Nothing about the stored values needs a rule. A column on another module's table would stay
  visible to that module's surfaces with nothing to switch it off.
- FKs to `organizations` and `customer_accounts` are permitted: both are already binding
  `dependencies` of `quote_requests` (`fk-dependency-drift.test.ts`).
- A nullable boolean is the three-state override with no enum to translate; an `ON DELETE CASCADE`
  removes the policy with its subject.

**Alternatives rejected**:

- *Columns on the organization and customer-account entities* — the `carts` precedent
  (`requiresCartApproval` on `organizations`, written through `organizationCartApproval`). That
  policy is shared with the organization's own administrators and predates R2; this one is an
  admin-only quote policy, and taking the precedent would create two foreign-owned columns and two
  write ports.
- *Runtime custom fields* (Principle XIV) — the requirement is not "add a field": it is an enforced,
  audited policy with a three-state override. A custom-field definition can be renamed or deleted by
  an operator, its values are not typed booleans, and the enforcement would read another module's
  storage on every quote write.
- *A Settings value* — settings are per sales channel only (`setting-value.entity.ts`), and the
  spec rules out any channel or platform default.

## R10 — Tenant classification of the two tables (Principle XI)

**Decision**: `QuoteRequestOrgPolicy` is `@OrgScoped()` on `organizationId`.
`QuoteRequestAccountPolicy` is `@TransitivelyScoped('CustomerAccount', 'customerAccountId')`.

**Rationale**:

- `@OrgScoped` gives the right answer in all three contexts: a buyer (`single-org`) reads their own
  organization's row; a platform admin (`all`) reads any; a sales representative (`allowed-set`)
  reads the rows of the organizations they may see.
- The override follows the **account**, which can move between organizations (spec edge case).
  `@CustomerScoped` would filter `customerAccountId = actor` in a buyer context, and in a sales
  representative's `allowed-set` context a `@CustomerScoped` table without an organization column
  matches nothing (`filters.ts`, `customerFilterCond`), so the admin screens could not show it.
- **What this classification is for, and what it is not for** (revised after threat model T1):
  it governs the **admin reads** (`GET …/quote-price-negotiation`) and satisfies
  `check-entity-tenant-classification`. **Enforcement does not rely on it.** The lock is read in
  the writing request by exact primary key inside a named `withSystemScope` (R11), because any
  filtered read can return "no row" for a row that exists — and for the lock "no row" means
  "allowed". The earlier version of this section argued that `@TransitivelyScoped` avoided that
  fail-open for an organization administrator acting on a colleague's draft; that is true, but
  making enforcement depend on a filter's reach is the fragile shape, and T1 removes the
  dependency instead of reasoning about it.
  Copying `organization_id` onto the row would go stale when the account moves.
  `@TransitivelyScoped` grounds the row in `CustomerAccount`'s own organization, which is the truth
  at every read, and `CustomerAccount` is always composed when `quote_requests` is, because
  `customer_accounts` is a binding dependency (the condition whose absence made `invoice_ledger`
  leave the transitive form).

**Alternatives rejected**: `@CustomerScoped` (above); `@GlobalEntity` like the module's older
tables — every read's tenant constraint would be hand-written, which is the shape feature 087
measured as disclosing. *If* the first test of Phase 3 (T011) shows the transitive filter cannot resolve a
cross-module parent at boot, the fallback is `@GlobalEntity` with every query keyed by
`customerAccountId` and authorised by the route (plan, Inferred I1). The enforcement read is the
same either way.

## R11 — Effective value, enforcement and the read path

**Decision**: one service, `services/negotiation-policy-service.ts`, owns:

- `effectiveFor(customerAccountId, em)` → `{ allowed, source: 'account' | 'organization' |
  'default' }`:
  - **Owner ids** come from the `rfq` row (draft edit) or the session (create, resubmit) — never
    from the body.
  - **Organization** = the account's **current** organization, read through
    `customerAccountReadPort.findById(customerAccountId)` (coordinator decision D-3L, analyze M3).
    Not `rfq.organizationId`: an account moved after raising a draft follows its new organization,
    as the spec's edge case says, and the request row's stamp is history, not policy.
  - **Both policy rows are read by exact primary key** (`organizationId`, `customerAccountId`)
    inside `withSystemScope('quote_requests: negotiation lock for the request owner, read by
    primary key after the caller authorised the request', …)`, **on the caller's `em`** (threat
    model T1). The reason string is the documentation the escape hatch requires; the authorisation
    it refers to is the visibility check that loaded the `rfq` (`findVisibleForCustomer`) or the
    session itself. A primary-key read in system scope can only answer "this row" or "no row", and
    "no row" then really means no row — a tenant filter can no longer make an existing lock read
    as absent, which would be a fail-open.
  - An unreadable lock (any thrown error) propagates: no `catch` (spec edge case, analyze M5).
- `assertProposalsAllowed(owner, lines, em)` → throws `HttpError(422,
  RFQ_PRICE_PROPOSAL_NOT_ALLOWED)` when any line carries a proposal and the owner's effective value
  is "not allowed"; returns without reading anything when no line carries one. **"Carries a
  proposal" is `line.desiredUnitPrice !== undefined`** on the validated body (T4) — `0` and
  `0.00` are proposals; a truthiness test would let a zero price through.

**Placement (T4)**: `createForCustomer` calls it with the acting customer (who is the owner) after
body validation and before the first `persist`. `patchDraft` calls it for `rfq.customerAccountId`
(FR-037) **inside `underRowLock`, after the version check and the FR-038 re-check** (R15), before
any line is written — so the decision and the write are serialised against a concurrent change of
the request. Cart conversion and `resubmit` send no proposal and are therefore never refused (T4
regression tests).
The storefront reads its own effective value through `GET /api/v1/quote-requests/price-negotiation`
(`requireCustomer`, `Cache-Control: private, no-store`), answering `{ priceProposalsAllowed }` and
nothing else (FR-025). No cache, so no Redis invalidation is needed (the lifecycle pub/sub pattern
applies to cached values; this value is read per request from two primary-key lookups).

**Error code**: `RFQ_PRICE_PROPOSAL_NOT_ALLOWED`, added to `ERROR_CODES`
(`packages/contracts/src/errors.ts`), declared in `quote_requests`' manifest `errorCodes` (its
`RFQ_` prefix routes to this module), with `errors.RFQ_PRICE_PROPOSAL_NOT_ALLOWED` in
`i18n/{en,pl}.json`. **422**, not 403: the session is authorised to create quote requests; the
content is what this customer may not send, and the storefront treats 401/403 as authentication
failures.

**Alternatives rejected**: *strip the proposals silently* — the spec's clarification says refuse;
*check in the route* — `patchDraft` resolves the owner only after loading the request, and two call
sites would diverge; *read through the tenant filter* (the first version of this decision) — see
R10's revision and T1; *use `rfq.organizationId`* — stale after an account move (D-3L).

## R12 — Auditing the two writes (Principle XIII)

**Decision**: two Commands in `quote_requests/src/backend/commands/negotiation-policy-commands.ts`,
run through `commandBus.run` — `quote_request_policy.organization.set` (objectType `organization`)
and `quote_request_policy.customer_account.set` (objectType `customer_account`), with `capture`
returning the old value and `run` returning the new one, so the audit row carries the
administrator (from the ambient TenantContext), the subject and old → new (FR-026). A write that
does not change the value returns `skipAudit: true`. `commandBus` joins `QuoteRequestsCradle`.

**Authority inside the Command (threat model T2)**: the route's gate is necessary, not sufficient
— a Command is reachable from more than one caller, and the audit row must never record a write
that should not have happened. Each Command therefore checks before its first read-for-write:

- organization Command: for a non-platform admin, `salesRepAssignment.canSeeOrganization(actor,
  organizationId)`; refused → `404 NOT_FOUND`, identical to an unknown organization;
- account Command: resolve the account's current organization, confirm membership with
  `customerAccountReadPort.findInOrganization(accountId, organizationId)`, then the same
  `canSeeOrganization`; refused → the same `404`.

A refusal writes nothing and records no audit row. The write is **find, then `em.create` or
assign, then flush** — never `em.upsert`, `nativeUpdate` or `nativeInsert`, which bypass the unit
of work and with it the org write guard that is the second line of defence. If plan I2 shows the
guard refusing a legitimate sales-representative write, the write moves inside `withSystemScope`
**after** the authority step, with a reason string naming it. The audit row carries
`actorAdminUserId` on every path, including that one (T16).

**Rationale**: Constitution XIII's last bullet — new sensitive writes are Commands even in a module
that still hand-audits its older writes. The older `recordAuditFromContext` calls in this module are
not migrated here (bounded migration; not this feature's to do).

**Alternatives rejected**: `recordAuditFromContext` like the module's other writes — forbidden for a
new write by XIII.

## R13 — Admin and storefront surfaces, i18n

**Decisions**:

- **Admin strings** for everything new — the Overview/Modify reference columns, the History tab and
  the two zone panels — go into `packages/modules/quote_requests/i18n/{en,pl}.json` (flat keys:
  `detail.reference.*`, `detail.history.*`, `negotiation.*`), read with
  `useTranslation('quote_requests')`. The existing `rfq.detail.*` keys stay in `_i18n`'s bundle and
  are not moved (not this feature's drain). Precedent: `carts`' `policy.*` keys for its
  organization-screen panel.
- **Zones**: `organization.detail.after` at weight **500** (taken: 100, 200, 300, 400, 600) and
  `customer.detail.after` at weight **200** (taken: 100), each with
  `requiredPermission: 'customers:read'`; the panel renders its control disabled unless
  `useAuth().hasPermission('customers:manage')` (FR-027: reading follows `customers:read`, changing
  needs `customers:manage`). The routes enforce the same split: `GET` through `requireAdminAny(['customers:read',
  'customers:manage'])` (the shape `organizations` uses for its own detail), `PUT` through
  `requireAdmin('customers:manage')`. Non-platform admins are additionally held to
  `salesRepAssignment.canSeeOrganization` for the subject's organization.
- **No new permission code, no palette entry** (FR-027, FR-029). `customers:manage` and
  `customers:read` are owned by `organizations` (non-deactivatable) among others, so they stay
  grantable whatever this module's state; `quote_requests` does not redeclare them.
- **Storefront**: `storefront/app/(commerce)/quote-request/page.tsx` (server component) reads the
  value with the session cookie and passes `priceProposalsAllowed` to `<RfqDraftView>`; an anonymous
  visitor or an unreadable answer yields `true` (fail-open display, spec edge case) — the server's
  refusal is the guarantee. When `false`, the proposed-price input is not rendered, the catalogue
  unit price is shown read-only, a note says sales will price the request, and the submit omits
  every `desiredUnitPrice`. New storefront strings go into the component's existing inline
  `strings(pl)` dictionary, beside `proposedPriceLabel`, whose `Strings` interface makes a missing
  Polish entry a `tsc` error — the same totality `lib/i18n/messages.ts` gives — so the component
  keeps one source of copy instead of two.

**Alternatives rejected**: *a browser `fetch` from `RfqDraftView`* — the session cookie is httpOnly
and scoped to the storefront origin (`actions.ts` explains); *new keys in `_i18n`* — grows the legacy
core bundle a module installed from a registry cannot rely on.

## R14 — List totals (FR-009)

**Decision**: `summarize` in `rfq-service.ts` computes `totalAtCustomerPrice` with the admin list's
every-line-or-`null` rule. The storefront's `formatTotal` already renders `null` as "—"; it gets a
test, not a change. CRM is unchanged: a cart-converted request now has no proposal and is valued 0
until priced, which a CRM integration test asserts.

**Alternatives rejected**: *fall back to the reference price* — ruled out by the clarification.

## R15 — Draft-edit guard (FR-038)

**Decision** (revised after threat model T3): `patchDraft` refuses with `409 RFQ_NOT_DRAFT` when
**any** of these holds — they are three views of "an administrator has revised this request", and
each one alone can be true before the others are:

1. `rfq.awaitingCustomerRevisionAcceptance` is set;
2. a `modified` event with `actorAdminUserId` set exists (`{ quoteRequestId, eventType:
   'modified', actorAdminUserId: { $ne: null } }`);
3. the current (latest) revision was authored by an administrator (`created_by_admin_user_id` set).

The check runs once before the lock (a cheap early refusal) and **again inside `underRowLock`,
after the version check, re-reading the row, the latest revision and the events** — the admin
`modify` commits its revision and line rewrite before it appends its event, so a check outside the
lock, or one that looked only at events, could let a customer edit land on top of an admin
revision in that window. Customer-authored `modified` events (including an organization
administrator's edit of a colleague's draft) never close the draft, however many there are. No data
change; requests that already carry one customer `modified` event become editable again (spec
Assumption). *Alternative rejected*: the event query alone (the first version of this decision) —
correct in steady state, wrong in the race.

## R16 — Abuse bounds on the customer write paths (threat model T11)

**Decision**:

- `createQuoteRequestSchema.items` and `patchQuoteRequestSchema.items` gain `.max(200)` — an
  additive cap on an array that had none; neither schema's strictness changes (M4). In-process
  callers (cart conversion, quick order, shopping lists, order copy) do not parse that schema; they
  stay uncapped and the chunking of R2 bounds their pricing queries.
- The customer `PATCH /api/v1/quote-requests/:id` route gets a per-route `config: { rateLimit }`
  (`@fastify/rate-limit`, registered globally by the platform's HTTP server; the module declares it
  as a peer and dev dependency for the type augmentation, exactly as `product_feeds` and `settings`
  do). Lifting the one-edit limit (FR-038) is what makes an unbounded edit loop possible, and each
  edit appends a revision and an event.
- History reads are bounded (R8).

**Rationale**: the cheapest instruments that already exist in the stack; nothing new is installed
(the package is already a dependency of `packages/platform`).

**Alternatives rejected**: *a hard cap of N customer edits per request* — needs a new error code,
bundle keys and a spec-visible refusal the owner did not ask for, while a rate limit is generic
infrastructure answering `429`; *no bound* — FR-038 removed the only one there was.
