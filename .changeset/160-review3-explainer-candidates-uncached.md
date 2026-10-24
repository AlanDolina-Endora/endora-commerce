---
'@endora-commerce/mod-price-lists': patch
---

Only the admin price explainer (`POST /api/v1/admin/price-books/resolve`) lists every ranked runner-up of a line, and it resolves past the answer cache to do so; every other resolution — listings, carts, the price-surface build — keeps at most ten runner-ups, as before review 2, so the shared answer cache no longer holds an unbounded runner-up list per line. The explainer still cuts its list to ten after leaving out the books outside the caller's scope.
