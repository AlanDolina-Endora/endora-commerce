---
'@endora-commerce/mod-invoices': patch
---

An invoice's `paidTotal` is what was kept from what was captured for the order: each captured payment attempt's amount less its `refundedAmount`, summed once per attempt (issue #417, review of PR #423). An order refunded before invoicing records only what was kept (nothing, after a full refund); the invoice is still issued, since the sale happened and its return is a correction's to document. An order recorded as paid with no captured attempt still records its stored total; an overpayment is shown as it is.
