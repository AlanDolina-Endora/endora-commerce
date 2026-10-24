---
'@endora-commerce/contracts': minor
'@endora-commerce/mod-carts': patch
'@endora-commerce/mod-orders': patch
'@endora-commerce/mod-quote-requests': patch
'@endora-commerce/mod-product-feeds': patch
---

A price is rounded to two places the same way everywhere: half-up on its decimal digits.

- **`@endora-commerce/contracts`.** New `roundAmountHalfUp(value: string | number): string` — an amount at two places, half-up on its decimal digits (half away from zero when negative). A number is read as the shortest decimal that round-trips it.
- **`@endora-commerce/mod-carts`.** The basket line stores the resolver's four-place amount through `roundAmountHalfUp`, and the placement drift check (`storedPriceDiffers`) compares with it. `Number(amount).toFixed(2)` rounded the binary double, so a 9.0450 price was stored and charged as 9.04 while the card showed 9.05, and 1.0050 as 1.00 against 1.01.
- **`@endora-commerce/mod-orders`.** The admin order preview rounds its line prices the same way.
- **`@endora-commerce/mod-quote-requests`.** A quote line's stored reference price is rounded the same way.
- **`@endora-commerce/mod-product-feeds`.** Feed prices (`123.45 PLN`) are rounded the same way.
