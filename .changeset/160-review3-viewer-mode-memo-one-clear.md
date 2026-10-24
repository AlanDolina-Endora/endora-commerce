---
'@endora-commerce/mod-price-lists': patch
---

The viewer display-mode memo is cleared once per pricing-generation bump, by the module that owns it; `BookPricing.invalidateAll()` no longer clears it a second time and now drops only the engine's own precedence memo. The generation in `ViewerModeKey` still keeps a tail read during a write from being served after it.
