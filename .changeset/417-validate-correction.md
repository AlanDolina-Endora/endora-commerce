---
'@endora-commerce/contracts': minor
'@endora-commerce/mod-invoices': patch
'@endora-commerce/mod-returns': patch
---

A correction that cannot be made never follows money that moved (issue #417, review of PR #423).

- `CorrectiveInvoicePort` gains `validateCorrection(input)` (`@endora-commerce/contracts`): it refuses, writing nothing, what `createCorrection` would refuse for the same input. `invoices` implements both from one preparation step.
- The returns settlement builds its correction once and validates it **before** the refund or the credit top-up; a refusal leaves the case in `received` with nothing moved. With `invoices` switched off, a settlement asking for a correction is refused before the credit, where it used to credit first and refuse after.
- A cancelled correction no longer counts against the cap or the cumulative nets of later corrections.
