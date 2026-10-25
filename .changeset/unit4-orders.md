---
'@endora-commerce/mod-orders': minor
---

An order line carries its unit price at four decimal places, unrounded (owner ruling of 2026-10-25): `order_items.unit_price` is `numeric(14,4)` (`Migration20261025T031732OrdersUnitPriceFourPlaces`, lossless), copied from the cart line as it is; the line's net is `unit price × quantity` rounded half-up to two places once, and VAT stays per rate on the summed line nets (`vatByRate`). The admin create-order preview answers a line's `unitPrice` as the four-place decimal string the cart would store (`0.0125`, `29.4950`) instead of rounding it to two. The order screens and the order-confirmation e-mail's `unitPrice` variable show a unit price with its significant places, up to four (`0.0125 PLN`, `40.00 PLN`); line values and totals keep two.
