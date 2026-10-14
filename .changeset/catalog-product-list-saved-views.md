---
'@endora-commerce/mod-catalog': minor
'@endora-commerce/contracts': minor
---

Saved views on the admin product list (#289).

- The Product list's toolbar carries the admin kit's saved-views control: a selector of the admin's own views and every shared view, *Save view* and *Delete view*. A view is named, private or shared, and stores the list's status tab, type chip and search text — only the ones not at their default. The Stock, Category and Channel chips are not saved. Loading a view replaces status, type and search, returns Stock to *All*, goes back to the first page and clears the row selection; a status or type the list no longer offers loads as *All*, and keys the list does not know are ignored. Any admin who can open the Product list (`catalog:read`) can use it.
- Four new routes, gated by `catalog:read`: `GET` and `POST /api/v1/admin/catalog/products/list-views`, `PATCH` and `DELETE /api/v1/admin/catalog/products/list-views/{id}`. A view stores the list's filters only (`sort` and `visibleColumns` in a request body are ignored). `GET` returns the caller's own views and every shared view, ordered by name; every item carries `ownedByCaller` and `canModify`. Another admin's private view answers `404`; a shared view is modified or deleted only by its owner or a platform admin (any role except `sales_representative`), `403` otherwise. All four routes answer `401 UNAUTHORIZED` when no admin session resolves.
- Names are trimmed, 1–160 characters, without control or format characters. One admin cannot hold two views on the product list whose names differ only by letter case or surrounding spaces: `POST`, and a `PATCH` that changes the name, answer `409 PRODUCT_SAVED_VIEW_NAME_TAKEN` with a translated message (English and Polish). The rule binds the view's owner.
- New table `product_list_saved_views`, created by the migration `Migration20261014T170531CatalogProductListSavedViews`, with a unique index on the owner and the lower-cased name.
- When a platform admin changes or deletes another admin's view, the `catalog` module logs one `info` record (`event: 'saved_view.updated' | 'saved_view.deleted'`, `list`, `viewId`, `ownerAdminUserId`, `actorAdminUserId`).

`@endora-commerce/contracts` gains the `ERROR_CODES.PRODUCT_SAVED_VIEW_NAME_TAKEN` member.
