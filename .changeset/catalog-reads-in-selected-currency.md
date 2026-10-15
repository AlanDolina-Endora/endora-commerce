---
'@endora-commerce/contracts': minor
'@endora-commerce/mod-catalog': minor
'@endora-commerce/mod-search': patch
'@endora-commerce/mod-price-lists': patch
---

Storefront catalogue reads can be priced in the currency the shopper selected. `GET /api/v1/catalog/products`, `GET /api/v1/catalog/products/:idOrSlug` and `GET /api/v1/catalog/products/:idOrSlug/links` accept `?currency=` (an ISO 4217 code, any case). The listing price, the price ordering, the price-range filter, the link tiles and the Meilisearch-served listing are all resolved in that currency when the request's sales channel lists it in its `currencies`, and in the channel's `defaultCurrency` otherwise. A malformed code answers `400 VALIDATION_FAILED`. Without the parameter, every read asks the pricing engine exactly what it asked before.

`@endora-commerce/contracts` exports the pieces both modules use: `listingCurrencyQuerySchema` (the parameter), `resolveListingCurrency(requested, channel)` (requested if the channel offers it, else its default) and `listingPriceChannelContext(channel, currency)` (the `salesChannel` and `currencyCode` half of a `ListingPriceViewerContext`, with the default currency left implicit). `SearchQueryContext` gains an optional `currency`.

`@endora-commerce/mod-price-lists`: a listing priced in a currency other than the channel's default no longer falls back to the Product's own `defaultPrice` / `price` attribute. That attribute has no currency of its own and was entered in the default one, so the fallback would have quoted, for example, 100 PLN as 100 EUR; such a product now has no listing price in that currency (`source: 'none'`). In the default currency nothing changes.
