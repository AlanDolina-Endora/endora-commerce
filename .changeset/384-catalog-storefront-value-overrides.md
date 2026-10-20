---
'@endora-commerce/mod-catalog': patch
---

Storefront product reads show a product's per-sales-channel value overrides.

- **Behaviour change for API clients — channel overrides are now visible on the storefront.** `GET /api/v1/catalog/products/:idOrSlug` (name, description, `seo`, `structuredDataJsonLd`, `attributeValues`, `visibleAttributes`, grouped children, bundle options and product-link tiles) and every `GET /api/v1/catalog/products` card name now return the override written in the product scope editor for the request's sales channel and language (`Accept-Language`, else the channel's default language), resolved by the same `resolveAttribute` chain the admin preview and the search index use. Channel-scoped user attributes return their channel override. A product without an override for that channel answers exactly as before.
- Override rows are read once per page (one statement), not per card.
