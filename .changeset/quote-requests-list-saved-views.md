---
'@endora-commerce/mod-quote-requests': minor
'@endora-commerce/contracts': minor
---

Saved views on the admin Quote Request list (#290).

- The Quote Request list's toolbar carries the admin kit's saved-views control beside the column picker: a selector of the admin's own views and every shared view, *Save view* and *Delete view*. A view is named, private or shared, and stores the list's visibility scope, organization, status selection, search text, sort and visible columns. Loading a view replaces all six and goes back to the first page; a status or column the list no longer offers is dropped, an empty column selection loads the default columns, an unknown sort loads *Newest*, and a view without a scope loads the viewer's default (*All* for a platform admin, *My organizations* otherwise). Any admin who can open the Quote Request list (`rfqs:handle`) can use it.
- Loading a view never widens what the loader sees: the list request that follows is the loader's own, narrowed to the organizations they reach, and a saved `scope: 'mine'` means the loader's assignments. A view stores an organization by id only, and the list never shows the name of an organization the loader cannot see — a captured organization outside their scope shows as an id prefix and an empty list.
- Four new routes, gated by `rfqs:handle` and by the module's presence: `GET` and `POST /api/v1/admin/quote-requests/list-views`, `PATCH` and `DELETE /api/v1/admin/quote-requests/list-views/{id}`. A view stores the list's filters, and optionally its sort (`{ field, dir }`) and visible columns; `null` for either means the list's default. `GET` returns the caller's own views and every shared view, ordered by name; every item carries `ownedByCaller` and `canModify`. Another admin's private view answers `404`; a shared view is modified or deleted only by its owner or a platform admin (any role except `sales_representative`), `403` otherwise. All four routes answer `401 UNAUTHORIZED` when no admin session resolves.
- A `PATCH` that changes nothing — an empty body, or every value as already stored — writes nothing and logs nothing; it answers `200` with the current view. It is still refused (`403`/`404`) to a caller who may not modify the view.
- `PATCH` and `DELETE` answer an `id` that is not a UUID with the same `404 NOT_FOUND` as a view that does not exist.
- While `quote_requests` is switched off, all four routes answer `503 MODULE_DISABLED` exactly as the Quote Request list does; saved views are kept and are served again once the module is back.
- Names are trimmed, 1–160 characters, without control or format characters. One admin cannot hold two views on the quote request list whose names differ only by letter case or surrounding spaces: `POST`, and a `PATCH` that changes the name, answer `409 RFQ_SAVED_VIEW_NAME_TAKEN` with a translated message (English and Polish). The rule binds the view's owner.
- New table `quote_request_list_saved_views`, created by the migration `Migration20261014T173236QuoteRequestsQuoteRequestListSavedViews`, with a unique index on the owner and the lower-cased name.
- When a platform admin changes or deletes another admin's view, the `quote_requests` module logs one `info` record (`event: 'saved_view.updated' | 'saved_view.deleted'`, `list`, `viewId`, `ownerAdminUserId`, `actorAdminUserId`).

`@endora-commerce/contracts` gains the `ERROR_CODES.RFQ_SAVED_VIEW_NAME_TAKEN` member.
