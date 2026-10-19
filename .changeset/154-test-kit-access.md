---
'@endora-commerce/test-kit': patch
---

The composed test server hands its subscriber connection to the sales-channel kernel, so the
access cache's cross-process announcement is received where a test arms pub/sub.
