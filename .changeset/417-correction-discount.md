---
'@endora-commerce/mod-invoices': patch
'@endora-commerce/contracts': minor
---

A correction credits an order-level discount the way the invoice charged it (issue #417, review of PR #423). `CorrectiveInvoiceLine` gains an optional `discount` (`@endora-commerce/contracts`): the part of the order's discount the line's refund carries. The goods are credited at `amount + discount` at their VAT rate, and the discount comes back on a negative 0 % line mirroring the invoice's own discount line, so the correction totals the refund and credits the goods' VAT as charged: a full return of 100.00 net at 23 % with a 50.00 discount credits 123.00 of goods (23.00 VAT) and −50.00 of discount, 73.00 in all, where it credited 73.00 of goods with 13.65 VAT. Earlier corrections' discount lines stay out of the goods' cumulative nets.
