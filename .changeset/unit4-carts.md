---
'@endora-commerce/mod-carts': minor
---

A cart line carries its unit price at four decimal places, unrounded (owner ruling of 2026-10-25). The resolver's amount, an agreed quote price and a recomputed price are stored as `numeric(14,4)` (`cart_items.unit_price`, `recomputed_unit_price`, `agreed_unit_price`, widened by `Migration20261025T031727CartsUnitPriceFourPlaces`) instead of being rounded to two places half-up at intake; only the line value, `unit price × quantity`, is rounded to two. A screw priced 0.0125 was charged 0.01, so 10 000 pieces cost 100.00 instead of 125.00. Placement compares the stored price with the current one at four places, so a line priced at two places before the upgrade whose price has sub-cent places is repriced before it is ordered. The cart's string unit prices (`CartReadPort`, the placement drift's `storedUnitPrice`) are four-place decimal strings.
