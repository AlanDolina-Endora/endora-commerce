---
'@endora-commerce/mod-import-export': patch
---

Each import/export entity now requires the permission that protects the same rows on the module
that owns them, instead of `catalog:write` for every entity.

| Entity | Export | Import |
| --- | --- | --- |
| `products`, `categories` | `catalog:read` | `catalog:write` |
| `stock` | `inventory:read` | `inventory:write` |
| `customers` | `customers:read` | — |
| `orders` | `orders:read` | — |

- `GET /api/v1/admin/import-export/entities`, `GET /api/v1/admin/export/:entity.csv` and
  `POST /api/v1/admin/import/:entity` require one of these codes; the export and import routes
  then require the entity's own code and answer `403` without it. An import of an export-only
  entity is refused with `403` for a caller who may not export it, and with `405` otherwise.
- The entity listing offers a caller only the entities they may export or import, and each entry
  carries `canExport` and `canImport`.
- The admin screen and its sidebar entry open for an operator holding any of the codes above, and
  each entity card shows only the export and import controls the operator's role permits.

**For an operator upgrading.** A role that used `catalog:write` to export customers, orders or
stock, or to import stock, needs `customers:read`, `orders:read`, `inventory:read` or
`inventory:write` granted on `/admin-roles`. A role holding `catalog:read` can now export
products and categories.
