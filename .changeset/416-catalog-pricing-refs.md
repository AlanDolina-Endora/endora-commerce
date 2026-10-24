---
'@endora-commerce/contracts': minor
'@endora-commerce/mod-catalog': patch
---

`CatalogProductReadPort` answers products the way pricing resolves them, without building a record of each (issue #416).

- **New, required on every implementation of the port:** `listPricingRefs()` and `findPricingRefsByIds(ids)`, answering `CatalogProductPricingRef` (`{ id, attributeValues }`, exported from `@endora-commerce/contracts`). `listPricingRefs()` answers the products `listAll()` answers, ordered by id; `findPricingRefsByIds(ids)` answers the ones `findByIds(ids)` answers. Soft-deleted and inactive products are included in both. An implementation outside this repository has to add both methods. It can map `listAll()` and `findByIds()` to `{ id, attributeValues }`.
- `@endora-commerce/mod-catalog` answers each with one statement and no entity hydration. The price surface's worker reads the catalogue at the start of every whole build. On a 50 000-product catalogue, `listAll()` took 3.8 s for that, most of it hydrating `Product` entities whose fields the build does not use.
