---
'@endora-commerce/email-components': patch
---

`sanitizeEmailHtml` reads its input in one left-to-right scan: every `<` either starts a tag that is rebuilt from the allowlist or dropped, or is written out as `&lt;`. Removing a tag can no longer join the surrounding text into a new tag, and HTML comments are dropped.
