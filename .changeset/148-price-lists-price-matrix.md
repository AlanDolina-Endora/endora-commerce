---
'@endora-commerce/mod-price-lists': minor
---

Price lists gain a **price matrix**: one entry prices a selection of products for an optional organization and a quantity window, at a fixed unit price or a percentage discount.

- **Selections**: one product (with an organization), a category, an attribute value, a category
  and an attribute value, or every product. Attribute selections accept only attributes flagged
  *Price list rules* (`isPriceRule`) whose values are a single choice, multiple choices or yes/no
  and that are neither per-language nor per-channel; clearing the flag deactivates the entries
  without a pricing error.
- **Resolution**: list selection, the Base/Sale partitions and fall-through are unchanged. Inside
  the picked list, the list's own bracket and its entries compete — organization-specific first
  (nearest organization in the inheritance chain first), then product > category ∩ attribute >
  attribute > category > all products, then the higher starting quantity, the lower price and the
  entry id. A percentage is taken off the list's own bracket, else the system Default list's,
  rounded half-up to four decimals; without a reference it is skipped.
- **Every surface agrees**: `resolveLinePrice`, `resolveListingPrices`, the storefront price sort
  and filter (`orderByUnitPrice`, `pricedProductIds`), the quantity-tier ladder
  (`listBracketMinQuantities`) and the admin resolved-price probe, which now answers
  `resolvedPrice.matrixEntryId`. `namedListPrices` (pinned feeds) still reads brackets only.
  `PricingLineResult` gains an optional `matrixEntryId`; the published `LinePricePort`,
  `LinePriceResult` and `BuyerLinePriceAnswer` are unchanged.
- **Admin API** behind the existing `price_lists:read` / `price_lists:write`:
  `GET|POST /api/v1/admin/price-lists-engine/:id/matrix`,
  `GET|PATCH|DELETE /api/v1/admin/price-lists-engine/:id/matrix/:entryId` and
  `GET /api/v1/admin/pricing/rule-targets/attributes`. Writes are audited as
  `price_list.matrix_entry_create|update|delete` (declared for Recent activity), tenant-scoped,
  limited to 5 000 entries per list, and refuse overlaps. Duplicating a list copies its matrix.
- **Admin UI**: a *Price matrix* tab on the price-list editor (`?tab=matrix`), English and Polish.
- **Schema**: one migration creates `price_list_matrix_entries`.
- **Composition**: `PriceListTargetReads` gains a required `catalogAttributeRead`
  (`CatalogAttributeReadPort`); the module resolves it as `catalogAttributeReadPort`. A deployment
  constructing `PriceListService` or `PricingService` by hand must pass it.
