---
'@endora-commerce/mod-price-lists': minor
---

Add many products to a price list in one request.

**New route: `POST /api/v1/admin/price-lists-engine/:id/products/bulk-add`**, gated by
`price_lists:write`.

- Body: `{ productIds: uuid[] }` with 1 to 200 ids (`bulkAddPriceListProductsRequestSchema` from
  `@endora-commerce/contracts`). Duplicates are collapsed, the first occurrence kept.
- Answer `200 { data: { added, unchanged, failed } }` (`bulkAddPriceListProductsResponseSchema`).
  An id already on the list is `unchanged` and its brackets are left exactly as they were; an id
  the catalogue does not hold as a live product (unknown or soft-deleted) is
  `failed: [{ productId, reason: 'product_not_found' }]`; every other product is `added`, in
  request order, whatever its status or type. Nothing is ever removed.
- Refusals write nothing: `403 FORBIDDEN` for the system Default price list (its roster is seeded
  from each product's default price) and for a caller without `price_lists:write`,
  `404 NOT_FOUND` for an unknown or deleted price list, `400 VALIDATION_FAILED` for an invalid
  body (not an object, no ids, more than 200, a non-uuid id). Two requests racing to add the same
  new product: the loser is answered `409 VERSION_CONFLICT` and a retry reports it `unchanged`.
- One request is one Command, `price_list.products_add`, and writes **one** audit entry whose
  after-state holds counts only — `{ name, added, unchanged, failed }`, never the id list — and
  **no** entry when nothing was added, so a retry of an accepted request is silent.

`PriceListService.addProducts(priceListId, productIds, auditCtx?)` is the service method behind
it. The single-product `POST …/products` and the replacing `PUT …/products` are unchanged.
