---
'@endora-commerce/mod-cms': patch
---

`PATCH /api/v1/admin/cms/hooks/:id/attachments/:blockId` for a block that is not attached to the hook answers `404 CMS_BLOCK_NOT_FOUND` ("CMS Hook attachment not found."), as it was always meant to. It answered `200` with the unchanged attachment list, because the not-found check read a `rowCount` field the database driver's result does not carry. A block that is attached is reordered exactly as before, and detaching a block that is not attached still answers `204`.
