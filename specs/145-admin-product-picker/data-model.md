# Data model: Admin product picker

**Feature**: `specs/145-admin-product-picker/` | **Date**: 2026-10-13

**No persistent schema change.** No table, column, index or migration is added, changed or
removed by this feature, so there is nothing to scaffold with `migration:new` and no
`composer:generate` migration registration. Everything below is either an existing record the
feature writes through an existing path, or a transient shape that lives in a request, a
response or the admin's memory.

## Existing records (unchanged shape)

| Record | Owner / table | How this feature touches it |
| --- | --- | --- |
| Product | `catalog` / `products` | Read only — list endpoint (picker), `batch-by-id` (roster names), `CatalogProductReadPort.findByIds` (preview, bulk add). Fields used: `id`, `sku`, `slug`, `name`, `status` (`draft`·`active`·`inactive`), `type` (`simple`·`configurable`·`grouped`·`bundle`·`virtual`), `visibility`, `allowedOrganizationIds`, `deletedAt` (through `liveOnly`). |
| Price-list roster entry | `price_lists` / `price_list_products` (`PriceListProduct`, `@GlobalEntity`, PK `(price_list_id, product_id)`, FK `product_id → products`) | **Written** by the new bulk add: one row per `added` product, no bracket rows. Existing rows and their `price_list_price_brackets` are never touched (FR-042, SC-006). |
| Price list | `price_lists` / `price_lists` (`PriceList`) | `modifiedAt` bumped once when at least one product is added (as `addProduct` does). `isSystem` read for the Default refusal. |
| Audit log entry | platform / `audit_log_entries` | One entry per bulk add with `added ≥ 1`, written by the Command Bus (see below). |
| Sales-channel membership | platform bridge `sales_channel_products`, read only through `SalesChannelMembershipPort.filterEntityIdsInChannel` | Read once per preview. |
| Order line / quote-request line | `orders` / `quote_requests` create payloads | Shapes unchanged: `{ productId, variantId?, quantity }` and `{ productId, variantId?, quantity, agreedUnitPrice, lineNote? }` (SC-006). |

## New transient shapes

### Picker row — `ProductBrowserItem` (admin-kit, client only)

```text
id: uuid
sku: string
slug: string
name: Record<locale, string>      // en-US primary; pl-PL shown as a second line when different
status: 'draft' | 'active' | 'inactive'
type: 'simple' | 'configurable' | 'grouped' | 'bundle' | 'virtual'
```

A projection of the list endpoint's row (`serializeAdminProduct`); no price, no stock.

### Picker rules — `ProductBrowserRules` (admin-kit, passed by the host)

```text
initialStatus: 'all' | 'active'
blockedTypes: ReadonlyArray<ProductType>        // shown, not selectable, reason typeBlocked
blockedStatuses: ReadonlyArray<ProductStatus>   // shown, not selectable, reason statusBlocked
alreadyAddedLabelKey?: string                   // core key; default productBrowser.reason.alreadyAdded
```

### Selectability — `productSelectability(row, rules, ctx)`

```text
ctx: { alreadyAddedIds: ReadonlySet<id>, selectedIds: ReadonlySet<id>, max: number }
→ { selectable: true }
| { selectable: false, reason: 'alreadyAdded' | 'typeBlocked' | 'statusBlocked' | 'limitReached' }
```

Evaluation order (first match wins): `alreadyAdded` → `typeBlocked` → `statusBlocked` →
`limitReached` (only when `row.id ∉ selectedIds` and `selectedIds.size ≥ max`). A selected row is
always de-selectable.

### Picker session state (admin-kit, client only, never stored)

```text
selection: insertion-ordered Map<id, ProductBrowserItem>     // ≤ ADMIN_PRODUCT_SELECTION_MAX
filter: { status: 'all'|'active'|'draft'|'inactive', type: ProductType | null, q: string }
page: number (0-based), pageSize: PageSizeOption
view: 'all' | 'selectedOnly'
load: 'loading' | 'ready' | 'empty' | 'error'
confirm: 'idle' | 'pending' | 'failed'                       // 'pending'/'failed' only when onConfirm returns a promise
```

State transitions:

```text
open ──> loading ──> ready | empty | error
error ──Retry──> loading
any filter/page change ──> loading (selection kept)
Cancel | Esc | scrim ──> closed (selection discarded, host unchanged)
Confirm (sync host)  ──> closed, onConfirm(items in selection order)
Confirm (async host) ──> pending ──resolve──> closed
                                 └─reject──> failed (selection kept) ──Retry──> pending
```

### Bulk-add request / result (`packages/contracts/src/price-lists.ts`)

```text
BulkAddPriceListProductsRequest  = { productIds: uuid[] }        // 1 ≤ length ≤ 200
BulkAddPriceListProductsResult   = {
  added:     uuid[]                                              // in request order, de-duplicated
  unchanged: uuid[]                                              // already on the roster
  failed:    Array<{ productId: uuid, reason: 'product_not_found' }>
}
```

Invariant: after de-duplication, every requested id is in exactly one of the three arrays
(FR-043). Precedence for one id: `unchanged` (on the roster) > `failed` (not a live product) >
`added`.

### Bulk-add audit entry (written by the Command Bus)

```text
action:     'price_list.products_add'
objectType: 'price_list'
objectId:   <price list id>
before:     null
after:      { name, added: <count>, unchanged: <count>, failed: <count> }   // counts only
```

Not written when `added` is empty (the command returns `skipAudit`), nor when the request is
refused as a whole (the command throws and rolls back).

### Order-preview unavailability reason (`packages/contracts/src/orders.ts`)

```text
AdminOrderPreviewMessageCode =
  'PRODUCT_NOT_FOUND' | 'PRODUCT_NOT_VISIBLE_TO_CUSTOMER' | 'PRODUCT_NOT_IN_SALES_CHANNEL' | 'QUOTE_ONLY'
ADMIN_ORDER_PREVIEW_MESSAGE_PRECEDENCE = [ ...same order... ]       // first wins
```

Exactly one `messages` entry per unavailable line; `adminOrderPreviewResponseSchema.messages[].code`
stays `z.string()` on the wire.

### Host line state (client only)

```text
Order line:          { productId, sku, name, quantityInput: string }
Quote-request line:  { productId, sku, name, quantityInput: string, agreedUnitPrice: string,
                       priceSource: 'resolved' | 'manual' | 'none' }
```

Keyed by `productId` (unique per host by FR-009). `quantityInput` is valid iff it parses as an
integer ≥ 1; an invalid line is marked and blocks submit.
