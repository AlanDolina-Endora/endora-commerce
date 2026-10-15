---
'@endora-commerce/mod-carts': minor
---

`CartsDeps.cartCouponService`, `cartConversionService`, `pushLineToShoppingList` and `appendShoppingListToCart` are required. A composition that left one out made the matching cart route answer `503` with the `NOT_FOUND` code and an untranslated token as its message (`promotions_unavailable`, `quote_requests_unavailable`, `shopping_lists_unavailable`). Those branches are gone. The module's own `registerModule` already wires all four, so a deployment using it sees no change: a cross-module owner that is off still answers `503 MODULE_DISABLED` naming the module, with the translated sentence. Code calling `registerCartRoutes` directly must now pass all four.
