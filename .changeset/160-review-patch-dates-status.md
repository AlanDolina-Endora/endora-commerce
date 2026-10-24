---
'@endora-commerce/mod-price-lists': patch
---

Changing a price book's dates now re-decides its status.

`PATCH /api/v1/admin/price-books/:id` with `startsAt` or `endsAt` on an `active` or `scheduled` book sets its status as activation does: `expired` once its end has passed, `scheduled` before its start, `active` otherwise. An active book moved to a future start used to stay `active`; the status sweep only starts `scheduled` books, so when the book began to price nothing marked the price surface and price sorting never took it in. A draft and an expired book keep their status.
