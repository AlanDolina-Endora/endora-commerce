---
'@endora-commerce/mod-price-lists': patch
---

The price explainer no longer identifies a price book outside a sales representative's scope.

`POST /api/v1/admin/price-books/resolve` named every candidate book — id, name, row and its labels — including books a representative may not see, such as a parent organization's book met through the organization chain or a book shared with an organization outside their scope (FR-034 requires those to answer as missing books). For such a caller, a winning book outside their scope now answers `bookId`, `bookName` and `rowId` as `null` while the price, `tier`, `cell` and `reference` stay what the buyer is charged, and runner-ups from such books are left out of `candidates`. The explainer screen shows *A price book outside your scope* in place of the book. A platform administrator sees every book as before. New `PriceBookReads.visibleBookIds(ids, scope)`.
