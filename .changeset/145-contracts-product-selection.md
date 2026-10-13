---
'@endora-commerce/contracts': minor
---

New shapes for selecting many products at once in the admin, and named codes for the admin order preview.

**For a consumer of the contracts.**

- `ADMIN_PRODUCT_SELECTION_MAX` (`200`) is the most products one admin selection may carry. The
  admin product browser stops at it, and every request that submits such a selection in one call
  uses it as its upper bound.
- Bulk add to a price list: `bulkAddPriceListProductsRequestSchema` (`{ productIds }`, 1 to
  `ADMIN_PRODUCT_SELECTION_MAX` uuids), `bulkAddPriceListProductsResultSchema`
  (`{ added, unchanged, failed: [{ productId, reason }] }`),
  `bulkAddPriceListProductFailureReasonSchema` (`'product_not_found'`),
  `bulkAddPriceListProductsResponseSchema` (the result under `data`), and
  `priceListIdParamsSchema` (`{ id }`) for the price-list routes, each with its inferred type.
  They describe `POST /api/v1/admin/price-lists-engine/:id/products/bulk-add`, which adds the
  products to the list in one audited write and reports a product already on the list as
  `unchanged`, so sending the same request again is safe.
- Admin order preview: `adminOrderPreviewMessageCodeSchema`, its type
  `AdminOrderPreviewMessageCode`, and `ADMIN_ORDER_PREVIEW_MESSAGE_PRECEDENCE` name the four
  reasons a preview line can be unavailable, in the order they are decided: `PRODUCT_NOT_FOUND`,
  `PRODUCT_NOT_VISIBLE_TO_CUSTOMER`, `PRODUCT_NOT_IN_SALES_CHANNEL`, `QUOTE_ONLY`. A line carries
  at most one message, the first that applies. The two middle codes are new answers of the
  preview.

**Nothing changes on the wire for existing fields.** `adminOrderPreviewResponseSchema`'s
`messages[].code` is still a plain string, not narrowed to the new enum, so a client built
against this version keeps parsing an answer that carries a code it does not know yet — map an
unknown code to a generic "unavailable" reason rather than failing.

The documentation of `isProductVisibleTo` now records why the admin order preview may report
visibility and sales-channel assortment as two distinct codes while every buyer-facing answer
keeps a single "product not found".
