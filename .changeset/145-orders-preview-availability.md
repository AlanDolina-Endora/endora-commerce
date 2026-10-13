---
'@endora-commerce/mod-orders': minor
'@endora-commerce/mod-i18n': patch
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

**Create order adds products through the product browser.** Inside **Items** — shown once the
customer and the sales channel are chosen — **Browse products** opens the shared picker on the
Active tab, where grouped and bundle parents, draft and inactive products, and products already on
the order are listed with their reason and cannot be ticked; up to 200 ticked products, across
pages and filters, are added in one step as lines of quantity 1. Beside it a quick search by name
or SKU appends one product under the same rules. The per-line product search and **Add item** are
gone: each line shows the product's name and SKU, an editable quantity (a whole number of 1 or
more — anything else marks the line, keeps it out of the preview and blocks submit), the unit
price, the line total and a remove action. A line the preview reports unavailable shows that
cause's reason instead of a price — "The customer cannot see this product" for
`PRODUCT_NOT_VISIBLE_TO_CUSTOMER`, "Not in this sales channel's assortment" for
`PRODUCT_NOT_IN_SALES_CHANNEL`, and **No price** for `PRODUCT_NOT_FOUND`, `QUOTE_ONLY` and any code
the screen does not know — and blocks submit until it is removed; a refused preview (such as a
sales channel deleted meanwhile) shows **Could not calculate prices** and marks no line. The
created order still carries exactly the lines and quantities on screen, in the unchanged payload
shape. The `core` bundle gains `orderCreate.items.browse`, `orderCreate.items.quickSearch`,
`orderCreate.items.empty`, `orderCreate.line.notVisible`, `orderCreate.line.notInChannel` and
`orderCreate.line.quantityInvalid` in English and Polish; no existing key changes.
