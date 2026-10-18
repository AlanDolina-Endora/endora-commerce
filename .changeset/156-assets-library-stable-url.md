---
'@endora-commerce/mod-assets-library': minor
---

Groundwork for stable asset URLs: an asset now carries the identity of its current file, an optional permalink and a slot for one previous version.

**Database (one migration, owned by this module).**

- Eleven new columns on `assets`: `content_version` (backfilled with a random 12-character token
  for every existing row, and given the same kind of random default for rows written by raw SQL),
  `permalink`, and the nine `previous_*` columns of the one kept previous version.
  A permalink is unique case-insensitively, and a previous version is recorded in full or not at
  all (`previous_replaced_by` may stay empty for a system actor). Two partial indexes serve the
  retention sweep.
- Two new tables, both platform-global and without foreign keys:
  `asset_permalink_releases` (one row per permalink that stopped being held) and
  `asset_object_cleanups` (storage objects still to delete).
- Rolling back drops all of it. Every asset keeps being served, because the stored file key does
  not change.

**Responses.** Every asset summary and detail now answers `fileUrl` (the stable file URL, unsigned
even for a private asset), `permalink`, `permalinkUrl` (on the same public base as the file URL) and
`contentVersion`; `assetReadPort` records carry `contentVersion` and `permalink`. Every existing
member keeps its value.

**Error codes.** Seven new codes are declared with their English and Polish sentences:
`ASSET_REPLACE_KIND_MISMATCH`, `ASSET_LEGACY_CANNOT_REPLACE`, `ASSET_REPLACE_CONFLICT`,
`ASSET_NO_PREVIOUS_VERSION`, `ASSET_PERMALINK_TAKEN`, `ASSET_PERMALINK_PREVIOUSLY_USED` and
`ASSET_PERMALINK_INVALID` (with one sentence per reason the permalink rule names). Nothing raises
them yet.
