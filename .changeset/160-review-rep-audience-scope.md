---
'@endora-commerce/mod-price-lists': patch
---

A sales representative can no longer widen a price book's audience beyond their own organizations.

- `PATCH /api/v1/admin/price-books/:id` now asks what create and duplicate ask: a representative may give a book only an organization audience, so patching their own draft to everyone or to customer groups answers `403`.
- An organization book naming no organization named none outside a representative's scope, so it was visible and writable to every representative. It now answers to a representative exactly as a missing book (`404`, absent from lists and counts), and a representative cannot create, duplicate or patch a book to an organization audience naming no one (`400 PRICE_BOOK_AUDIENCE_KIND`). A platform administrator is unaffected.
