---
'@endora-commerce/mod-returns': minor
---

Return refunds account for the order-level discount, include complaints, and are created one at a time per order (issue #417, review of PR #423).

- **The discount**: an order takes its discount off the gross, so a return refunds the goods less the share of the discount they carried — shared over the order's rate groups (lines, for an order placed before 0.108.0) by their amounts, and carried in proportion to what came back. A full return of an order that captured 83.00 for 100.00 net + 23.00 VAT − 50.00 discount + 10.00 delivery refunds 73.00, where it refunded 123.00. Each line records the discount its default refund carries (new column `return_case_items.default_discount_amount`, migration `Migration20261024T174052ReturnsCaseItemDiscount`, default 0), and the settlement passes it to the correction in proportion to the amount approved (new `carriedDiscount`).
- **Complaints**: a complaint on a line that was not returnable enters the same cumulative accounting and the same cap, so a return and a complaint can no longer refund more than was paid (0.08 against 0.07). `caseDefaultRefunds` answers `{ refund, discount }` per line and takes the order's `discountTotal`.
- **The target**: a case that completes the order — every unit of every line back, returned or complained about — refunds exactly what remains of the stored products total (subtotal + tax − discount); for an order placed before 0.108.0 that may be a cent off the sum of its stored line totals, and the money charged decides. The correction credits exactly that refund.
- **Concurrency**: creating a case takes a transaction-scoped advisory lock keyed by the order and reads the order's earlier cases once, inside that transaction, so two cases created at once no longer both see none (three simultaneous returns of the last unit created three cases).
