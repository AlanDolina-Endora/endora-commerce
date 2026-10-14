# Contract: admin quote request API — reference price, line carry-over, history

Owner: `quote_requests`. Schemas live in `packages/contracts/src/quote-requests.ts` and are written
**before** any service code (Principle II). Every change here is **additive**; nothing is versioned.

## 1. `GET /api/v1/admin/quote-requests/:id` — item additions (admin replies only)

Gate unchanged: `requireAdmin('rfqs:handle')` + `findVisibleForAdmin`.

`quoteRequestItemSchema` gains three keys. The two money keys follow the existing
`actorAdminUserId` pattern — **optional, present on admin replies only**; the customer serialiser
(`serializeFull(…, false)`) omits the keys entirely, so `GET /api/v1/quote-requests/:id` is
unchanged.

```ts
/** Admin replies only. The stored at-request reference (research R1); `null` = none stored. */
referencePrice: z.object({
  amount: z.number().finite(),
  currency: z.string().length(3),
  capturedAt: isoDateTimeSchema,
}).nullable().optional(),

/**
 * Admin replies only. The customer's proposal for this line: the line's own `desiredUnitPrice`,
 * or — for a line of a request revised before this feature — the value from the submission
 * record (research R4). `null` = the customer proposed nothing.
 */
customerProposedUnitPrice: z.number().finite().nullable().optional(),

/** Both replies. Packaging-unit snapshot (feature 043), already stored on the row. */
packagingUnitName: z.string().nullable().optional(),
packagingUnitBaseQuantity: z.number().int().positive().nullable().optional(),
```

The request-level `salesChannelId: uuidSchema.nullable().optional()` is added to
`quoteRequestSchema` for **admin replies only**, so the UI can ask the probe for a current price on
the request's channel (§4). `customer.id` is already present on admin replies.

## 2. `PATCH /api/v1/admin/quote-requests/:id` — semantics of an existing field

No schema change: `adminPatchQuoteRequestLineSchema` already has `id?`, `variantId?`, `lineNote?`.

| Body line | Server behaviour (research R5) |
| --- | --- |
| `id` names a row of this request with the same `productId` | paired: keeps packaging unit, product name snapshot, `desiredUnitPrice`, stored reference; `variantId` / `lineNote` from the body when the key is present, otherwise kept; `lineNote: null` clears |
| no `id` (or an `id` that does not pair) | paired with a not-yet-paired row by (product, variant, packaging name, order) if one exists; else a **new** line: variant and note from the body, no packaging unit, no proposal, no stored reference |
| an existing row no body line paired | removed |

`expiresInDays` that changes `expiresAt` adds `payload.validity = { before, after }` to the
`modified` event (research R7). Refusals unchanged.

## 3. `GET /api/v1/admin/quote-requests/:id/history` — new

Gate: `requireAdmin('rfqs:handle')` + `findVisibleForAdmin` (FR-019, FR-031). Response
`{ data: { entries: QuoteRequestHistoryEntry[] } }`, oldest first.

```ts
export const quoteRequestHistoryLineRefSchema = z.object({
  productId: uuidSchema,
  variantId: uuidSchema.nullable(),
  productName: z.string(),          // snapshot name, packaging suffix included
  variantLabel: z.string().nullable(), // resolved on read via catalogProductReadPort; null if gone
});

export const quoteRequestHistoryChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('line_added'), line: lineRef, quantity: z.number().int().positive(),
             agreedUnitPrice: z.number().nullable(), currency: z.string().length(3) }),
  z.object({ kind: z.literal('line_removed'), line: lineRef }),
  z.object({ kind: z.literal('line_quantity'), line: lineRef, before: z.number().int(), after: z.number().int() }),
  z.object({ kind: z.literal('line_agreed_unit_price'), line: lineRef, before: z.number().nullable(),
             after: z.number().nullable(), currency: z.string().length(3) }),
  z.object({ kind: z.literal('line_proposed_unit_price'), line: lineRef, before: z.number().nullable(),
             after: z.number().nullable(), currency: z.string().length(3) }),
  z.object({ kind: z.literal('line_note'), line: lineRef, before: z.string().nullable(), after: z.string().nullable() }),
  z.object({ kind: z.literal('header_note'), before: z.string().nullable(), after: z.string().nullable() }),
  z.object({ kind: z.literal('validity'), before: isoDateTimeSchema.nullable(), after: isoDateTimeSchema.nullable() }),
]);

export const quoteRequestHistoryActorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('admin'), adminUserId: uuidSchema,
             name: z.string().nullable(),          // null = unknown user (FR-018)
             recordedRole: z.string().nullable() }), // the stored actorRoleLabel
  z.object({ kind: z.literal('customer'), customerAccountId: uuidSchema,
             name: z.string().nullable(), email: z.string().nullable(),
             recordedRole: z.string().nullable() }),
  z.object({ kind: z.literal('system') }),
  z.object({ kind: z.literal('unknown'), recordedRole: z.string().nullable() }),
]);

export const quoteRequestHistoryEntryKindSchema = z.enum([
  'submitted', 'resubmitted', 'created_by_admin', 'created', 'modified',
  'approved', 'accepted_by_customer', 'rejected_by_customer', 'canceled',
  'expired', 'completed', 'note_added',
]);

export const quoteRequestHistoryEntrySchema = z.object({
  id: uuidSchema,                         // id of the first merged event
  eventIds: z.array(uuidSchema).min(1).max(2),
  kind: quoteRequestHistoryEntryKindSchema,
  occurredAt: isoDateTimeSchema,
  actor: quoteRequestHistoryActorSchema,
  revisionNumber: z.number().int().positive().nullable(),
  note: z.string().nullable(),            // approval note, standalone note (never the automatic one)
  reason: z.string().nullable(),          // cancellation / rejection reason
  changes: z.array(quoteRequestHistoryChangeSchema).nullable(), // modified only; [] = FR-013
  relatedQuoteRequestId: uuidSchema.nullable(), // resubmission source
  orderId: uuidSchema.nullable(),         // completion
});
```

Rules the projection holds (each a unit test):

- **H1 pairing** (FR-011): adjacent events with the same actor ids merge per research R8's table;
  nothing else merges. The automatic creation note is recognised by exact equality with the
  constant `rfq-admin-service.ts` writes (exported as `AUTOMATIC_ADMIN_CREATION_NOTE`); any other
  note is kept.
- **H2 actor** (FR-017, FR-018): `actorAdminUserId` → `admin`; else `actorCustomerAccountId` →
  `customer` (the **acting** account — for an organization administrator who decided, that is B,
  not the requester A); else `actorRoleLabel === 'System'` → `system`; else `unknown`. Names come
  from one `findByIds` per port (`includeDeleted` where the port offers it); an id no port returns
  gives `name: null`.
- **H3 diff** (FR-012, FR-015, FR-016, FR-036): `changes` for a `modified` event = `historyDiff`
  of its revision against the previous revision (`previousRevisionId`, else revision number − 1),
  plus a `validity` change when the event payload has one. Packaging-unit and custom-field changes
  are never listed.
- **H4 no raw identifiers** (FR-010): the response carries `kind` codes; the UI maps every kind and
  every change kind to a bundle key, and a unit test fails on an unmapped one.

## 4. `GET /api/v1/admin/products/:id/resolved-price` — one new query parameter

Owner: `price_lists`. Gate unchanged: `price_lists:read`.

| Query | Change |
| --- | --- |
| `salesChannelId` (uuid, optional) | **new** — resolve on that channel; absent = system-default channel (today's behaviour). An id naming no channel → `400 VALIDATION_FAILED` |
| `customerAccountId`, `organizationId`, `quantity`, `variantId`, `currency` | unchanged |

Implementation: the route delegates to the same service as `buyerLinePricePort` (`ports.md` §1).
The admin Modify tab and the Overview call it per line **without a stored reference** (FR-006) and
for the empty agreed-price prefill (FR-007) with `customerAccountId = rfq.customerAccountId`,
`salesChannelId = rfq.salesChannelId`, `quantity = line.quantity`, `variantId`. The old prefill
through `GET /api/v1/storefront/products/:id/resolved-price` (the administrator's own price) is
removed. Without `price_lists:read` the probe answers 403 and the screen shows "—" and leaves the
input empty (the degrade D-173 already recorded for `RfqCreatePage`).
