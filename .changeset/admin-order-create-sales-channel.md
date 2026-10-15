---
'@endora-commerce/mod-orders': patch
'@endora-commerce/mod-carts': patch
'@endora-commerce/contracts': patch
---

`POST /api/v1/admin/orders` now honours the sales channel the operator chose for the order.

- A `salesChannelId` that names no sales channel is refused with `404 NOT_FOUND` before anything is written; the customer's basket is left as it was. It used to be accepted and the order was placed on the system-default channel.
- The ordered products are checked against the assortment of the order's channel rather than the channel the admin request itself resolved (the system default, unless a channel header is sent). A product the chosen channel sells is now accepted even when the default channel does not sell it, and a product the chosen channel does not sell is refused with `404 PRODUCT_NOT_FOUND` even when the default channel sells it.

`CartWritePort.addItem` accepts an optional `salesChannelId` in its input: the channel whose assortment decides whether the product may be added. Without it the request's resolved channel decides, as before. Buyer-facing cart, shopping-list and quick-order paths do not pass it and behave exactly as before.
