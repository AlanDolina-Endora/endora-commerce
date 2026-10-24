---
'@endora-commerce/mod-price-lists': patch
---

The price-book engine's cached line (`CachedBookLine`, internal to the package) no longer stores the currency: the pricing profile it is keyed by carries the currency, so an answer reads the request's own. No answer changes.
