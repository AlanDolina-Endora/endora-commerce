---
'@endora-commerce/contracts': minor
---

`importExportEntitySchema` (and so `importExportEntitiesResponseSchema`) gains two required
booleans, `canExport` and `canImport`: whether the caller may export and import the entity.
`GET /api/v1/admin/import-export/entities` lists an entity only when one of them is true. An
entity whose import is supported but not permitted keeps its `importHeader` and carries
`canImport: false`; `importHeader: null` still means the import does not exist.
