---
'@endora-commerce/mod-catalog': patch
'@endora-commerce/mod-price-lists': patch
---

The catalogue and pricing documentation now state what a price-sorted walk guarantees: every product whose price does not change during the walk is met exactly once, including when the price order goes missing midway; a product repriced meanwhile may be met twice or not at all, as with any cursor over a live price. They no longer claim that nothing is ever repeated or lost, and they say that a page may be short or empty and still have more after it.
