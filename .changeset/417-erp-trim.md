---
'@endora-commerce/contracts': patch
---

An ERP sale document's `netTotal`, `taxTotal`, `grossTotal` and `paidTotal` are trimmed before the decimal grammar (issue #417, review of PR #423): an integration that sends surrounding whitespace keeps working, and the trimmed value is what is stored.
