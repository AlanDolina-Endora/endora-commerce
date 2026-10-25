---
'@endora-commerce/contracts': patch
---

`settlementRequestSchema` refuses a settlement that names one return case line twice (`400 VALIDATION_FAILED`, issue `duplicate_line` on the repeated `returnCaseItemId`), before anything moves (issue #417, review of PR #423).
