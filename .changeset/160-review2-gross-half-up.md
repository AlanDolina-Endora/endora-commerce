---
'@endora-commerce/contracts': minor
'@endora-commerce/mod-product-feeds': patch
---

A gross price is computed on decimals and rounded half-up, the same way everywhere.

- **`@endora-commerce/contracts`.** New `grossAmountHalfUp(net: string | number, ratePercent: string | number): string` — `net × (1 + rate / 100)` at two places, half-up on the exact decimal product, beside `roundAmountHalfUp`. A number is read as the shortest decimal that round-trips it.
- **`@endora-commerce/mod-product-feeds`.** A gross feed (the default presentation) computes its price with it. It rounded the binary double, so 29.50 at 23 % was published as 36.28 instead of 36.29, 4.30 at 5 % as 4.51 instead of 4.52, and 31.50 at 23 % as 38.74 instead of 38.75.
