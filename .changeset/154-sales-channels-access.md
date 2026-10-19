---
'@endora-commerce/mod-sales-channels': minor
---

Channels carry *open to anonymous visitors* (`anonymousAccess`) on the admin list, detail, create
(default open) and update, audited and versioned like every identity field.
`GET /api/v1/storefront/sales-channel` returns it and stays reachable on a closed channel. New
`GET /api/v1/storefront/sales-channel/access` tells the viewer whether it may use the store and,
for a refused customer, which active stores its Organization may use (with each store's
`sales_channels.storefront_url`); it is `private, no-store` and never refuses. The module declares
the `SALES_CHANNEL_SIGN_IN_REQUIRED` and `SALES_CHANNEL_NOT_PERMITTED` codes with English and
Polish sentences. Deleting a channel drops the access cache.
