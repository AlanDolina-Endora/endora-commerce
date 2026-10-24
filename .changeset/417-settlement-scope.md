---
'@endora-commerce/mod-returns': patch
'@endora-commerce/mod-invoices': patch
---

A settlement refunds and corrects one set of lines, and the settlements of one order run one at a time (issue #417, review of PR #423).

- **`@endora-commerce/mod-returns`**: the settlement's total covers every line of the case — a line the request leaves out counts at its stored `approvedRefundAmount`, as the correction already did — so a request naming one of two discounted lines no longer refunds 113.00 while its correction credits 246.00 of goods (46.00 VAT) less 20.00 of discount. A settlement takes the same per-order advisory lock as case creation, on a connection of its own, so two cases of one order settled at once no longer both read the same earlier corrections (2 × 0.03 at 23 % credited 0.02 VAT of the 0.01 invoiced). One that waits more than 15 seconds answers `409` (`details.code: settlement_in_progress`) with nothing moved.
- **`@endora-commerce/mod-invoices`**: `correctionAmounts` credits the goods at `amount + discount` and the discount back only when the correction credits exactly what its lines add up to; any other total is credited as goods in line order, with no discount line.
