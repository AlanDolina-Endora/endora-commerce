---
'@endora-commerce/mod-newsletter': patch
---

The newsletter click tracker (`GET /api/v1/newsletter/c/:token?u=<url>`) redirects only when its
token verifies, and only to the `u` destination the token was minted for: a click token now binds
its destination through a `urlHash` claim signed into it at send time. A token that does not
verify answers `410`; a valid token that binds no destination, or whose binding does not match
`u`, records the click and lands on the storefront home page.
