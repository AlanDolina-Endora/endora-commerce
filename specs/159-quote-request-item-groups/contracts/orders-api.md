# Contract: orders — grouping at creation, carry-over at placement, read-only replies

**Owner**: `orders` (`packages/modules/orders`), shapes in `packages/contracts/src/orders.ts`.

## 1. `POST /api/v1/admin/orders` — create on a customer's behalf

`requireAdmin('orders:write')` and `assertCustomerInScope` unchanged.

```jsonc
{
  "customerAccountId": "…", "salesChannelId": "…", "deliveryMethodId": "…", "paymentMethodId": "…",
  "groups": [ { "key": "g1", "name": "Hall A" }, { "key": "g2", "name": "Hall B" } ],  // NEW, optional
  "items": [
    { "productId": "…", "quantity": 10, "groupKey": "g1" },     // NEW key, optional
    { "productId": "…", "quantity": 4,  "groupKey": "g2" },
    { "productId": "…", "quantity": 1 }                         // ungrouped
  ],
  …addresses, note, comment unchanged…
}
```

- `adminCreateOrderLineSchema = adminCreateOrderItemSchema.extend({ groupKey: lineGroupKeySchema.nullable().optional() })`;
  `adminCreateOrderRequestSchema.items` uses it; `groups: newLineGroupInputSchema[]` optional; the shared
  `refineLineGrouping` applies (400 on a malformed body). `adminOrderPreviewRequestSchema` is unchanged.
- **422 `VALIDATION_FAILED`** with `details: [{ path: 'items.<j>.groupKey', code: 'group_conflict' }]`
  when two lines of one `(productId, variantId)` name different groups (FR-062; the basket merges them —
  research R-2). Checked first, after `assertWithinAdminOrderItemBound`, before the basket is touched.
- Groups with no line are not created (D2).
- `OrderCreationAdminService.create` hands `placeOrder` an internal option:

```ts
interface OrderLineGroupingInput {
  readonly groups: readonly { key: string; name: string }[];      // in display order
  /** `${productId}:${variantId ?? ''}` → { groupKey | null, index } — index = position in the request. */
  readonly lines: ReadonlyMap<string, { groupKey: string | null; index: number }>;
}
placeOrder(ctx, req, options?: { origin?; language?; lineGrouping?: OrderLineGroupingInput })
```

Not on `OrderPlacementPort` (like `origin`): only this module's admin path supplies it.

## 2. Placement — grouping written in the placement transaction

Inside `OrderService.placeOrder`'s `em.transactional`, after the `OrderItem`s are created and before the
transaction returns:

```text
if options.lineGrouping                → layout = adminLayout(orderItems, lineGrouping)
else if quoteSource.sourceQuoteRequestId (vouched)
                                       → layout = carryQuoteGrouping(quoteSource.quoteRequestLines, orderItems)
else                                   → layout = basketOrder(orderItems)      // positions only, no groups
write order_item_groups (non-empty only), set order_items.group_id / position
```

`OR/src/backend/domain/quote-line-groups.ts` — pure, unit-tested:

```ts
export interface QuoteLineForCarry {
  productId: string; variantId: string | null; agreedUnitPrice: string | null;
  position?: number; group?: { id: string; name: string; position: number } | null;
}
export interface OrderLineForCarry { key: string; productId: string; variantId: string | null; unitPrice: string }
export interface CarriedGrouping {
  groups: { sourceId: string; name: string; position: number }[];            // non-empty, renumbered
  lines: Map<string /* order line key */, { groupSourceId: string | null; position: number }>;
}
export function carryQuoteGrouping(quote: readonly QuoteLineForCarry[], order: readonly OrderLineForCarry[]): CarriedGrouping;
```

Matching, per order line in basket order: (1) the first unclaimed quote line with the same product,
variant and `Number(agreedUnitPrice) === Number(unitPrice)`; else (2) the first unclaimed with the same
product and variant; else unmatched. Matched lines take the quote line's group, ordered by the quote
display order; unmatched lines are ungrouped after the matched ungrouped lines, in basket order. Quote
groups receiving no line are dropped; the rest keep their relative order, positions renumbered `0…`.

`#assessQuoteRequestSource` returns the `quoteRequestLines` it already read, so no second port call.
The quote lines come from `quoteRequestReadPort.listItems` with `group` and `position`
([quote-requests-api.md](./quote-requests-api.md) §6); a record without them (an old stub, an overlay)
carries no grouping — the order is placed with positions only.

Audit: `order.place_on_behalf`'s `stateAfter` += `groups: [{ name, lineCount }]` when any group was
written. A customer checkout writes no audit entry (unchanged).

## 3. Replies — every order reply (`serializeShared`, `OR/src/backend/order-response.ts`)

Admin (`GET /api/v1/admin/orders/:id` and the admin write replies), customer (`GET /api/v1/orders`,
`GET /api/v1/orders/:id`, the placement reply), and external (`/api/v1/external/orders…`) share the
serializer:

```jsonc
{
  "itemGroups": [ { "id": "…", "name": "Hall A", "position": 0 } ],     // NEW; default []
  "items": [ { …existing…, "groupId": "…" | null, "position": 0 } ]     // NEW keys; display order
}
```

Lines are read with `orderBy: { position: 'asc', createdAt: 'asc', id: 'asc' }`, groups by `position`,
then arranged with `arrangeLineGroups`. There is no write route for a placed order's grouping (R-18).

## 4. Unchanged

No order PDF (owner answer Q-A). Storefront checkout and its preview, the external intake (`POST /api/v1/external/orders` — no grouping
input), reorder, clone-to-quote, invoices and the order read port records, `order.created.v1`.
