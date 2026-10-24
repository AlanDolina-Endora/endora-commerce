---
'@endora-commerce/mod-price-lists': patch
---

The price explanation (`POST /api/v1/admin/price-books/resolve`) cuts the runner-ups to ten **after** leaving out the books outside the caller's scope. The cut used to happen first, in the resolver, so a sales representative lost one visible runner-up for every hidden book ranked above it; the answer is now exactly what it would be had the hidden books not existed. `BookExplanation.candidates` (internal to the package) carries every ranked candidate.
