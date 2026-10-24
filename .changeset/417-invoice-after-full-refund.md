---
'@endora-commerce/mod-invoices': minor
'@endora-commerce/contracts': minor
---

An order refunded in full before it is invoiced is not invoiced (issue #417, owner ruling of 2026-10-24): there is no sale left to document. When the refunds of its captured payments equal what was captured and cover the whole order total, issuing a VAT invoice answers `422 INVOICE_ORDER_REFUNDED` and draws no number; the automatic issuance on an order status skips the order and logs the reason instead of failing. An order refunded in part is invoiced as before, with what was kept as paid. `ERROR_CODES` gains `INVOICE_ORDER_REFUNDED` (`@endora-commerce/contracts`), declared by `invoices` with an English and a Polish sentence.
