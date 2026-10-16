---
'@endora-commerce/mod-search': patch
---

A newly created product is searchable as soon as it is created, without a first edit. `search` reindexed a product only on `product.created.v1` / `product.updated.v1`, and `catalog` binds a new product to the default sales channel after `product.created.v1` has been dispatched — so the created event met a product with no channel, indexed it nowhere, and the product appeared only once something edited it. `search` now also reindexes a product on `sales_channels.membership_changed`, which the binding emits once the membership exists; the same subscription keeps the per-channel indexes in step when a product is later added to or removed from a channel. Other member types (CMS pages, blog posts, …) are ignored, and the subscription is gated like the others, so it does nothing while `search` is switched off.
