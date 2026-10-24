---
'@endora-commerce/mod-catalog': patch
---

A price-sorted listing with no price surface built yet pages to its end.

While no price order exists for the viewer (right after the 0.108.0 upgrade, on a new channel, before the surface worker has run), `sort=price` is served in the default order. That fallback dropped the cursor too, so every page was page 1 with `hasMore: true` and an infinite scroll never ended. The fallback now returns the default listing's cursor wrapped in the price cursor, and a later page honours it: the walk meets every product once and ends, also when the surface is built in the middle of it.
