---
'@endora-commerce/contracts': minor
'@endora-commerce/mod-price-lists': minor
'@endora-commerce/mod-carts': patch
---

A product sold on request only is refused by the cart whether or not a price list holds it. `CartService.addItem` read the display mode off the resolved list price, so a product no price list prices — priced from the catalogue attribute — resolved nothing, the `CART_PRODUCT_QUOTE_ONLY` guard was skipped, and `POST /api/v1/cart/items` added the line with `200`. It now answers `400 CART_PRODUCT_QUOTE_ONLY` for it too.

`@endora-commerce/contracts` publishes `ProductDisplayModePort` — `resolveDisplayMode({ productId, organizationId, salesChannelId, customerKind })` — and `@endora-commerce/mod-price-lists` provides it as `productDisplayModePort`, over the same Product → Category → Organization → Settings chain its storefront display-mode route answers with. `CartService` takes it as a new required constructor argument, after `channelMembership`; the module's own composition wires it.
