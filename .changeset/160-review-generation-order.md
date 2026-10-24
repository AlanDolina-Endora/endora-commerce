---
'@endora-commerce/mod-price-lists': patch
---

A price-book write that commits while a price is being resolved no longer leaves the pre-write price cached for a minute.

`BookPricing.resolve` read the pricing cache's generation after the channel, the precedence and the pricing profile, so a write that committed and invalidated in between (a book moved to draft, say) was stored under the new generation with the profile read before it, and served until the 60-second TTL ran out. The generation is now read before the first statement, as `PricingCache` requires.
