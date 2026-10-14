---
'@endora-commerce/contracts': minor
---

New `saved-list-views` exports — the one wire shape and write rule shared by the order, product and quote-request saved-view endpoints: `savedListViewSchema` (with `savedListViewListResponseSchema`, `savedListViewResponseSchema`, `savedListViewDeleteResponseSchema`), `savedListViewNameSchema`, `savedListViewSortSchema`, `savedListViewFiltersSchema`, `savedListViewColumnsSchema`, `createProductSavedViewRequestSchema` / `updateProductSavedViewRequestSchema` (filters only; `sort` and `visibleColumns` are stripped), `createQuoteRequestSavedViewRequestSchema` / `updateQuoteRequestSavedViewRequestSchema`, the constants `SAVED_LIST_VIEW_NAME_MAX` (160), `SAVED_LIST_VIEW_FILTERS_MAX_BYTES` (8192), `SAVED_LIST_VIEW_COLUMNS_MAX` (64) and `SAVED_LIST_VIEW_TOKEN_MAX` (64), and the helpers `hasForbiddenNameCharacters` and `savedListViewNameKey` (trim, then case-insensitive — the key two names are compared by for uniqueness).

`orderSavedViewSchema` gains two required booleans, `ownedByCaller` and `canModify`; its `sort` stays required and non-null. A reader parsing a reply gains the fields; code that builds an `OrderSavedView` by hand must now supply them.

`createOrderSavedViewRequestSchema` and `updateOrderSavedViewRequestSchema` keep their names but tighten what they accept. An order saved-view name is now trimmed before its 1–160 character limit is applied, so a whitespace-only name is refused, and it may not contain control or format characters (`\p{Cc}`, `\p{Cf}` — NUL, bidi overrides, zero-width characters). `filters` is limited to 8192 UTF-8 bytes of its JSON, `visibleColumns` to 64 entries of at most 64 characters each, and `sort.field` to 64 characters (it may no longer be empty). A body breaking any of these fails validation.
