---
'@endora-commerce/mod-orders': patch
---

Order placement refuses a cart whose stored line prices are no longer current.

`OrderService.placeOrder` asks `carts` (`cartPlacementApplyPort.findPriceDrift`) whether every
line's stored unit price is still the price it may be ordered at for its current quantity,
organization and the agreed quantity of a quote line. When one is not, the placement answers
`409 CART_PRICE_CHANGED` with `details.lines` (`productId`, `variantId`, `quantity`,
`previousUnitPrice`, `currentUnitPrice` — `null` when the line may no longer be ordered —
and `currency`), writes nothing, and has the cart brought up to date, so placing again after
reviewing the cart succeeds at the current prices.
