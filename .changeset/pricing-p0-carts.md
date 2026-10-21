---
'@endora-commerce/mod-carts': minor
---

Cart pricing is batched, on the customer's own group, and in the basket's currency (D-287 P0).

- **Batched.** `CartLinePricing` takes `LinePricesPort` and gains `orderablePrices(ctx, lines)`; a basket's lines are priced in one `resolveLinePrices` call on the login/reorder reprice, the batch add and the placement price-drift check (each was one `resolveLinePrice` per line). `CartPricingRecompute` (the `GET /api/v1/cart` re-pricing) takes `LinePricesPort` and resolves every line in one call. `CartService`'s `pricingService` is now `LinePricesPort`.
- **Customer group.** `CartLinePricing.contextFor` and `CartPricingRecomputeContext` accept `customerAccountId`; adds, quantity changes, the read re-pricing and the placement check price on the customer's own group.
- **Behaviour change — currency of the own-price fallback.** A line priced from the product's own `defaultPrice` attribute is labelled with the basket channel's default currency, as the catalogue listing labels it; it was hard-coded `PLN` (issue #303's cart half). A basket whose channel no longer exists is now unpriced for such a product instead of being priced in `PLN`.
