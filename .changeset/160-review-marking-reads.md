---
'@endora-commerce/mod-price-lists': patch
---

Marking the price surface after a write that touches several price books reads the price profiles and each book's channel set once, rather than once per book (and the channel set once per before/after state). The profiles are read again only after a deleted book's profiles have been dropped.
