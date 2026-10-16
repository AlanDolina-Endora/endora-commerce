---
'@endora-commerce/mod-orders': minor
'@endora-commerce/contracts': minor
---

Behaviour change for API clients of the order list's saved views (`/api/v1/admin/orders/list-views`).

- Names are stored trimmed. One admin can no longer hold two saved views on the order list whose names differ only by letter case or surrounding spaces: `POST`, and a `PATCH` that changes a view's name, answer `409 ORDER_SAVED_VIEW_NAME_TAKEN` with a translated message (English and Polish). The rule binds the view's owner — a platform admin renaming a colleague's shared view is refused when the colleague already uses that name. Duplicates saved before this release are kept, and a `PATCH` that does not change the name is never refused for one.
- Every item returned by `GET`, `POST` and `PATCH` carries two booleans computed for the caller: `ownedByCaller`, and `canModify` (the caller owns the view, or the view is shared and the caller is a platform admin).
- A `PATCH` that changes nothing — an empty body, or every value as already stored — writes nothing and logs nothing; it answers `200` with the current view. It is still refused (`403`/`404`) to a caller who may not modify the view.
- `PATCH` and `DELETE /api/v1/admin/orders/list-views/{id}` answer an `id` that is not a UUID with the same `404 NOT_FOUND` as a view that does not exist, instead of `500`.
- All four routes answer `401 UNAUTHORIZED` when no admin session resolves, instead of acting under an empty owner id.
- Who counts as a platform admin for saved views is now read from the request's tenant context (`mode === 'all'`: any role except `sales_representative`), as on the product and quote request lists. It fails closed: an admin whose reach cannot be resolved — no admin tenant scope composed, or no resolvable role — is no longer treated as a platform admin, so `canModify` is `false` on other admins' shared views and modifying or deleting one answers `403`.
- When a platform admin changes or deletes another admin's view, the `orders` module logs one `info` record (`event: 'saved_view.updated' | 'saved_view.deleted'`, `list`, `viewId`, `ownerAdminUserId`, `actorAdminUserId`).

`@endora-commerce/contracts` gains the `ERROR_CODES.ORDER_SAVED_VIEW_NAME_TAKEN` member.
