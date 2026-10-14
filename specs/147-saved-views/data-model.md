# Data model: Saved list views (`specs/147-saved-views/`)

One concept — a **saved view** (spec *Key Entities*) — stored in one table per owning module
(research R-1). All three tables are **platform-global** for the tenancy guard
(`@GlobalEntity()`, Principle XI): a view holds filter values, never list results, and is
personal configuration of an admin user, not organization-owned data. No row references an
organization by foreign key; a captured organization id inside `filters` is an opaque value that
the list query re-scopes for whoever loads it (FR-016).

No table has a foreign key to `admin_users`: a view outlives its owner's access and its owner
(spec edge case, as on `order_list_saved_views` today), and a foreign key would also be a
cross-module reference requiring a manifest dependency (`specs/conventions/module-migrations.md`
item 4).

## Shared rules (all three tables)

| Rule | Where it holds |
| --- | --- |
| `name` is trimmed, 1–160 characters | `savedListViewNameSchema` in `packages/contracts/src/saved-list-views.ts`, used by every create and update schema |
| Name key = `lower(btrim(name))`; one owner holds no two views with one key on one list | Service: advisory lock per (table, owner) + probe, in one transaction (R-5). New tables also: unique expression index |
| Pre-existing duplicate keys (orders only) are kept | `orders` gets no index; `update` probes only when the key changes |
| Visible to the caller: own views ∪ every `shared` view, ordered by `name` | Service `listFor(adminUserId, isPlatformAdmin)` |
| Another admin's private view behaves as absent | `PATCH`/`DELETE` answer 404 `NOT_FOUND` |
| A shared view is modified or deleted only by its owner or a platform admin | `PATCH`/`DELETE` answer 403 `FORBIDDEN` otherwise; platform admin = tenant context `mode === 'all'` (R-7) |
| `ownedByCaller`, `canModify` | Computed per request, never stored (R-8) |

### Lifecycle

```text
(none) --POST--> stored --PATCH (API only)--> stored --DELETE--> (none)
```

No soft delete, no versioning, no audit row (spec *Assumptions*; R-14). Switching
`quote_requests` off leaves its rows untouched; switching it on serves them again (FR-018).
Uninstalling a module reverts its own migrations and drops its table with it.

---

## `order_list_saved_views` — owned by `orders` (existing, schema unchanged)

Entity: `packages/modules/orders/src/backend/entities/order-list-saved-view.entity.ts`.
Migrations: `20260611T140357_orders_order_comments_and_saved_views.ts`,
`20260611T140406_orders_order_saved_view_columns.ts`.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | uuid | no | PK |
| `owner_admin_user_id` | uuid | no | indexed (`order_list_saved_views_owner_idx`) |
| `name` | varchar(160) | no | legacy rows may carry untrimmed names and duplicate keys |
| `shared` | boolean | no | default `false` |
| `filters` | jsonb | no | Order list captured filters (`OrdersList.tsx:327-344`) |
| `sort` | jsonb | no | `{ field, dir }` |
| `visible_columns` | jsonb | yes | column ids; `null` ⇒ default columns |
| `created_at`, `updated_at` | timestamptz | no | |

**Change in this feature:** behaviour only — trimming, the duplicate-key refusal
(`ORDER_SAVED_VIEW_NAME_TAKEN`), and the two computed flags on the response. No migration.

---

## `product_list_saved_views` — owned by `catalog` (new)

Entity: `packages/modules/catalog/src/backend/entities/product-list-saved-view.entity.ts`
(`ProductListSavedView`), added to the module's `entities` array in
`packages/modules/catalog/src/backend/index.ts`. Migration scaffolded with
`pnpm --filter backend run migration:new -- --module catalog --name product_list_saved_views`
(timestamp assigned by the tool; class name begins `Migration…Catalog…`).

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | uuid | no | PK |
| `owner_admin_user_id` | uuid | no | |
| `name` | varchar(160) | no | stored trimmed |
| `shared` | boolean | no | default `false` |
| `filters` | jsonb | no | default `'{}'::jsonb`; the Product list writes only `status`, `type`, `q` (FR-010) |
| `created_at`, `updated_at` | timestamptz | no | |

Indexes:

- `product_list_saved_views_pkey` — `(id)`
- `product_list_saved_views_owner_name_key_uq` — **unique** on
  `(owner_admin_user_id, lower(name))`; it also serves the owner lookup, so no separate owner
  index is created.

No `sort` or `visible_columns` column: the Product list has neither control (R-9).

**Captured state (FR-010), written by `ProductsList.tsx`:**

| Key | Values the page understands today | On load if absent or unknown |
| --- | --- | --- |
| `status` | `all` · `active` · `draft` · `inactive` | `all` |
| `type` | the type-chip values (`all` · `simple` · `configurable` · `grouped` · `bundle` · `virtual`) | `all` |
| `q` | free text | empty |

Not stored, and reset on load: the Stock chip (to *All*), the Category and Channel placeholder
chips, the page (to the first), the row selection.

---

## `quote_request_list_saved_views` — owned by `quote_requests` (new)

Entity: `packages/modules/quote_requests/src/backend/entities/quote-request-list-saved-view.entity.ts`
(`QuoteRequestListSavedView`), added to the module's `entities` array in
`packages/modules/quote_requests/src/backend/index.ts`. Migration scaffolded with
`pnpm --filter backend run migration:new -- --module quote_requests --name quote_request_list_saved_views`.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | uuid | no | PK |
| `owner_admin_user_id` | uuid | no | |
| `name` | varchar(160) | no | stored trimmed |
| `shared` | boolean | no | default `false` |
| `filters` | jsonb | no | default `'{}'::jsonb` |
| `sort` | jsonb | yes | `{ field, dir }` |
| `visible_columns` | jsonb | yes | `null` ⇒ default columns |
| `created_at`, `updated_at` | timestamptz | no | |

Indexes: `quote_request_list_saved_views_pkey` `(id)`;
`quote_request_list_saved_views_owner_name_key_uq` — **unique** on
`(owner_admin_user_id, lower(name))`.

**Captured state (FR-010), written by `RfqList.tsx`:**

| Key | Values the page understands today | On load if absent or unknown |
| --- | --- | --- |
| `filters.scope` | `mine` · `unassigned` · `all` | the viewer's default: `all` for a platform admin, else `mine` (`RfqList.tsx:108-112`) |
| `filters.organizationId` | an organization id | none |
| `filters.status` | array of the six RFQ status labels (`RfqList.tsx` `RFQ_STATUSES`) | unknown entries dropped; empty |
| `filters.q` | free text | empty |
| `sort` | `{ field: 'updatedAt', dir: 'desc' \| 'asc' }`, `{ field: 'total', dir: 'desc' }` | `updatedAt:desc` |
| `visibleColumns` | the page's `COLUMN_IDS` | unknown ids dropped; empty or absent ⇒ `DEFAULT_VISIBLE` |

`scope: 'mine'` is resolved by the list endpoint against the admin who **loads** the view, and
the endpoint narrows to the loader's organizations whatever scope is sent (FR-016,
`rfq-admin-service.ts:134-152`).

---

## Tenancy classification

| Entity | Classification | Proof |
| --- | --- | --- |
| `OrderListSavedView` | platform-global (existing) | `@GlobalEntity()` |
| `ProductListSavedView` | platform-global | `@GlobalEntity()`; `check-entity-tenant-classification.ts` |
| `QuoteRequestListSavedView` | platform-global | `@GlobalEntity()`; `check-entity-tenant-classification.ts` |

They are global because their reader is the admin who owns or shares them, across all
organizations. No cross-tenant test is owed for the rows themselves; FR-016/FR-017's tests prove
that *loading* a view never widens the organization-scoped list read that follows (research
R-16).
