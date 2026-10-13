---
'@endora-commerce/mod-orders': minor
---

The admin order preview says why a line cannot be ordered, and refuses a sales channel that does not exist.

**Two new message codes on `POST /api/v1/admin/orders/preview`.** A line is now also unavailable
when the customer's Organization may not see the product (`PRODUCT_NOT_VISIBLE_TO_CUSTOMER`) or
when the product is not in the assortment of the sales channel named by the request body's
`salesChannelId` (`PRODUCT_NOT_IN_SALES_CHANNEL`). Each unavailable line carries exactly one
`messages` entry, the first that applies in the order `PRODUCT_NOT_FOUND`,
`PRODUCT_NOT_VISIBLE_TO_CUSTOMER`, `PRODUCT_NOT_IN_SALES_CHANNEL`, `QUOTE_ONLY`
(`ADMIN_ORDER_PREVIEW_MESSAGE_PRECEDENCE` in `@endora-commerce/contracts`). An unavailable line
keeps the existing shape — `unitPrice: '0'`, `lineTotal: 0`, `unavailable: true` — and adds
nothing to the subtotal or VAT. The request and response schemas are unchanged; `messages[].code`
stays a string, so a client that does not know a code keeps parsing the response. A soft-deleted
product is priced as before.

**Behaviour change: an unknown `salesChannelId` is now refused.** The preview used to fall back
silently to any active channel when the body's `salesChannelId` named none, and priced the
basket on that other channel. It now answers **404 `NOT_FOUND`** (the route's existing
not-found error) before any line is evaluated, so the channel a preview is priced on
and the channel its assortment is checked against are always the one the operator chose. The
route is admin-only (`orders:write`); an admin client that sends a stale channel id now receives
the error instead of a preview priced on a different channel. Order creation
(`POST /api/v1/admin/orders`) is not changed by this release.
