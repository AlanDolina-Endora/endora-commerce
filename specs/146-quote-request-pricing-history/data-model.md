# Data model: quote request reference price, readable history, per-customer negotiation lock

**Feature**: `specs/146-quote-request-pricing-history/` | **Decisions**: [research.md](./research.md)

All schema changes are owned by `quote_requests` and land as **two** migrations in
`packages/modules/quote_requests/src/migrations/`, scaffolded with
`pnpm --filter backend run migration:new -- --module quote_requests --name <slug>` (no number is
chosen; the stamp and class name are generated, `specs/conventions/module-migrations.md`), then
registered with `pnpm --filter backend run composer:generate`. No other module's schema changes.
No backfill: every new column is nullable or defaulted, and a missing policy row is the default.

## 1. `quote_request_items` — three new columns (migration `item_reference_price`)

| Column | Type | Null | Meaning |
| --- | --- | --- | --- |
| `reference_unit_price` | `numeric(12,2)` | yes | Net unit price the request's owner would have paid for this line on the request's channel when it was captured (R2), or the cart line's unit price on conversion (R3) |
| `reference_currency` | `varchar(3)` | yes | Currency of `reference_unit_price` |
| `reference_captured_at` | `timestamptz` | yes | When it was captured |

- **Constraint** `quote_request_items_reference_all_or_none`: the three columns are either all
  `null` or all non-null.
- **Entity**: `QuoteRequestItem` gains `referenceUnitPrice?: string | null`,
  `referenceCurrency?: string | null`, `referenceCapturedAt?: Date | null` (all in
  `[OptionalProps]`).
- **Written by**: `createForCustomer`, `resubmit`, `patchDraft` (changed lines only, R5.3); carried
  unchanged by `modify` and by `patchDraft` for unchanged lines; never written by
  `createOnBehalf` (admin-created lines have no at-request reference, FR-006).
- **Read by**: the admin detail serialiser only (`referencePrice` on the admin item, contract
  `contracts/admin-quote-request-api.md` §1). Not on the customer reply (the customer serialiser is
  an allow-list, T7). **Also read by `quoteRequestReadPort.listItems`** (owner decision,
  option (b)): `QuoteRequestLineRecord` gains optional `referenceUnitPrice` (decimal string) and
  `referenceCurrency`, `null` when no reference is stored, so ERP / connector readers of a
  cart-converted line — whose `desiredUnitPrice` is now `null` — read the cart price there
  (`contracts/ports.md` §4).
- **Validated on write** (T6): an in-process `lineReferencePrices` entry must be finite, ≥ 0, at
  most two decimals, with a `/^[A-Z]{3}$/` currency; a server-resolved one is the resolver's own
  output. The value is always **per base piece** (the line's quantity unit).
- **States of a line**:

| Stored reference | Customer proposal | Shown (FR-003, FR-005, FR-006) |
| --- | --- | --- |
| present | present | reference "price at request", proposal, difference amount and % |
| present | absent | reference "price at request", proposal "—", no difference |
| absent | any | the UI resolves the current price through the probe on the request's channel and labels it "current price"; no price → "no price" |
| present, currency ≠ line currency | any | reference in its own currency, difference "—" |
| present, amount 0 | present | amount difference shown, percentage "—" |

`discount_percent` stays unused (out of scope).

## 2. `quote_request_items` — carried columns (no schema change)

`desired_unit_price`, `variant_id`, `line_note`, `packaging_unit_name`,
`packaging_unit_base_quantity` and `product_name` are carried across the delete-and-recreate of
`modify` and `patchDraft` by the line-pairing rule (research R5). Validation rules:

- `modify`: a body line with `id` pairs with the existing row of that id **only** if it is a row of
  this request with the same `productId`; otherwise the `id` is ignored and the line is paired by
  the R6 rule or treated as new.
- `modify`: absent `variantId` / `lineNote` keys on a paired line keep the stored values;
  `lineNote: null` clears the note.
- `patchDraft`: `packagingUnitName` / `packagingUnitBaseQuantity` are stored as sent;
  `productName` gets the `" (<packaging name>)"` suffix exactly as `createForCustomer` writes it.
- `patchDraft`: a paired line whose body **omits** `desiredUnitPrice` keeps the stored proposal; an
  explicit value replaces it (research R5.3, threat model T5 — a locked owner cannot erase a
  proposal stored before the lock, FR-024).

## 3. `quote_request_revisions.items_snapshot` — two optional keys (jsonb, no migration)

`QuoteRequestRevisionLine` gains `packagingUnitName?: string | null` and
`packagingUnitBaseQuantity?: number | null`, written from now on by `toSnapshotLine`. Old snapshots
lack them; the history matcher treats an absent key as unknown (research R6). Nothing else in the
snapshot changes; the reference price is **not** snapshotted (history does not list it).

## 4. `quote_request_events.payload` — one optional key (jsonb, no migration)

`modified` events written by `modify` gain `validity?: { before: string | null; after: string |
null }` (ISO-8601) when the call changed `expiresAt` (research R7). Older events lack it.

## 5. `quote_request_org_policies` — new table (migration `negotiation_policies`)

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `organization_id` | `uuid` | no | — | primary key; `references organizations(id) on delete cascade` |
| `price_proposals_allowed` | `boolean` | no | `true` | `false` = members may not propose prices |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | no | `now()` | |

- **Entity** `QuoteRequestOrgPolicy`, `@OrgScoped()` (key `organizationId`) — research R10.
- **No row** = allowed (default). Written only by the `quote_request_policy.organization.set`
  Command, after its authority check, as **find, then create or assign** — never `em.upsert` /
  `nativeUpdate` (research R12, T2).
- The FK cascade removes the **policy row only** when its organization is deleted; it never reaches
  a quote request (migration comment, T14).

## 6. `quote_request_account_policies` — new table (same migration)

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `customer_account_id` | `uuid` | no | — | primary key; `references customer_accounts(id) on delete cascade` |
| `price_proposals_allowed` | `boolean` | **yes** | `null` | `null` = "as organization"; `true` = allowed; `false` = not allowed |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | no | `now()` | |

- **Entity** `QuoteRequestAccountPolicy`, `@TransitivelyScoped('CustomerAccount',
  'customerAccountId')` — research R10.
- **No row** = "as organization". Setting "as organization" writes `null` (the row is kept, so the
  audit before/after is always a value).
- Written only by the `quote_request_policy.customer_account.set` Command, after its authority
  check (`findInOrganization` + `canSeeOrganization`), as find, then create or assign (T2). The FK
  cascade removes the policy row only (T14).

Both new entities join the `entities` array in `quote_requests/src/backend/index.ts` and the
generated `backend/src/db/entities-registry.generated.ts`. Both FKs point at binding
`dependencies` already declared by `quote_requests` (`organizations`, `customer_accounts`), so
`fk-dependency-drift.test.ts` and migration order hold without a manifest change for the schema.

## 7. Effective negotiation value (derived, never stored)

```text
effective(account, organization) =
  account policy row exists and price_proposals_allowed is not null → that value   (source: account)
  else organization policy row exists                                  → its value    (source: organization)
  else                                                                  → true         (source: default)
```

Evaluated for the quote request's **owner** — `rfq.customerAccountId` on draft edit, the acting
customer on create and resubmit (FR-037); ids from the row or the session, never the body.
`organization` is the owner's **current** organization, read through
`customerAccountReadPort.findById` (decision D-3L) — not `rfq.organizationId`, so an account moved
after raising a draft follows its new organization. Both rows are read by **exact primary key**
inside a documented `withSystemScope` on the request's own `em` (research R11, threat model T1):
the reads are not subject to the tenant filter, so an existing row can never read as absent
("allowed"). An unreadable row fails the request. Not channel-dependent. Reading it is skipped when
no line carries a proposal (`desiredUnitPrice !== undefined`; `0` counts, T4).

## 8. History entry (read model, never stored)

Built per request on `GET /api/v1/admin/quote-requests/:id/history` from the **most recent 100**
`quote_request_events` (response flag `truncated` when older ones exist), the
`quote_request_revisions` those events reference plus their predecessors, and two name lookups
(customers with `activeOnly: true`; admin names only, never e-mail — research R8, T9). Shape: `contracts/admin-quote-request-api.md` §3.
Fields: `kind`, `occurredAt`, `eventIds` (1 or 2), `actor` (`admin` with name and recorded role /
`customer` with name and e-mail / `system` / `unknown` with recorded role), `revisionNumber`,
`note`, `reason`, `changes` (modified entries only; empty list = "re-sent without changes",
FR-013), `relatedQuoteRequestId` (resubmission), `orderId` (completion).

## 9. Audit rows (existing `audit_log_entries`, written by the Command Bus)

| Action | objectType | objectId | stateBefore | stateAfter |
| --- | --- | --- | --- | --- |
| `quote_request_policy.organization.set` | `organization` | organization id | `{ priceProposalsAllowed: boolean }` | same |
| `quote_request_policy.customer_account.set` | `customer_account` | account id | `{ priceProposalsAllowed: 'allowed' \| 'not_allowed' \| 'inherit' }` | same |

Actor columns come from the ambient TenantContext. A no-op write records nothing (`skipAudit`).
