---
'@endora-commerce/mod-admin-users': patch
'@endora-commerce/mod-mfa': patch
'@endora-commerce/mod-newsletter': patch
'@endora-commerce/mod-seo': patch
'@endora-commerce/mod-languages': patch
'@endora-commerce/mod-dictionaries': patch
'@endora-commerce/mod-product-feeds': patch
---

Routes a visitor reaches before signing in, or that arrive with no storefront channel, declare
`salesChannelAccess: 'open'` and stay reachable when an operator closes a sales channel to
anonymous visitors: administrator sign-in and sign-out, second-factor verification and set-up
tickets and federated sign-in (both surfaces), `GET /api/v1/i18n/config`, the dictionary reads the
registration form uses, the crawler policy, product-feed downloads by token, and the newsletter
confirmation, unsubscribe and tracking links.
