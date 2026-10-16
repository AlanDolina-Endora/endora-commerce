---
'@endora-commerce/contracts': minor
---

Price matrix contracts and a product read for attribute selections.

- `price-lists`: `priceMatrixEntryInputSchema`, `priceMatrixEntryPatchSchema`,
  `priceMatrixListQuerySchema`, `priceMatrixEntrySchema`, `priceMatrixListResponseSchema`,
  `priceMatrixEntryResponseSchema`, `priceMatrixAttributeTargetSchema`, the price, selection-kind
  and inactive-reason enums, `priceMatrixSelectionKind()`, `priceMatrixEntryShapeIssues()` and
  `PRICE_MATRIX_MAX_ENTRIES_PER_LIST` (5 000), with their types.
- `ERROR_CODES` gains `PRICE_MATRIX_ENTRY_NOT_FOUND`, `PRICE_MATRIX_ENTRY_OVERLAP`,
  `PRICE_MATRIX_ATTRIBUTE_NOT_ELIGIBLE` and `PRICE_MATRIX_ENTRY_LIMIT`.
- `CatalogProductReadPort` gains `listProductIdsByAttributeValue({ key, value, match })`
  (`CatalogAttributeValueQuery`, `match: 'scalar' | 'array' | 'boolean'`). This is a new required
  member: a hand-written implementation or test stub of the port must add it.
