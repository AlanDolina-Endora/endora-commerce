---
'@endora-commerce/mod-assets-library': minor
---

Stable asset URLs: an asset's file can be replaced in place and its previous version restored, and soft-deleted assets and replaced files are now purged by a scheduled retention sweep.

**Behaviour change for operators.** Soft-deleted assets are now actually hard-deleted. An hourly
sweep removes at most 500 assets per run, oldest deletion first, once
`assets.soft_delete_retention_days` have passed since their deletion — the setting **read when the
sweep runs**, so a changed setting applies to assets already deleted, and the purge date the API
reports (`DELETE /api/v1/admin/assets/:id`, its repeat, and the read model's `purgeAfterAt`)
follows the current setting. The effective period is at least one day: `0` now means one day.
Kept previous versions are purged on the same rule, counted from when they were replaced. An
asset something still references is skipped and stays soft-deleted. **The first runs after
upgrading purge every asset soft-deleted longer ago than the period**; an operator who wants to
keep those assets lengthens the setting before upgrading. Each run writes one
`assets_library.retention.sweep` log line, also when nothing was due, and a storage object the
module stopped needing is retried by the sweep until it is gone.

**Behaviour change for consumers.** `AssetSummary.url` / `AssetDetail.url`, `AssetRecord.storageUrl`
(what the catalogue's product, gallery, attachment and Open Graph URLs come from) and
`assetReadPort.resolvePublicUrls` (product feeds) now carry `?v=<contentVersion>` for public
assets, and so does the transactional e-mail logo; signed private URLs, legacy rows and `data:`
values are unchanged, and so is the stored `storageUrl` of a row with no storage key — a URL no
adapter of this platform wrote. A replace changes the marker, so every embed picks up the new file and can be
cached for a year. The stable, unversioned form is `fileUrl` and `GET /api/v1/admin/assets/:id/url`,
and the new `AssetsLibraryService.resolveEmbedUrl(id)` answers the embed form. A CMS storefront page
cached before a replace keeps serving the previous marker for up to five minutes (the CMS page
cache's lifetime); that URL redirects to the current file when it is requested. A browser that
already holds the old `?v=` URL in its cache — it was served as immutable — can keep showing the
previous image until the CMS page cache has turned over and the page is reloaded.

**Behaviour change for the file URL.** `GET /assets/file/<id>` answers a public local asset with
`Cache-Control: public, no-cache` (it was `public, max-age=31536000, immutable`), so a replaced file
is picked up on the next request; the URLs the platform embeds carry `?v=<contentVersion>` and stay
cacheable for a year, and a `v` that is no longer current redirects (`302`, `no-store`) to the current
one. The route also answers `GET /assets/file/<permalink>` (one or more segments, matched
case-insensitively). A private asset is checked for a valid signature before anything else: without
one it answers `403` by id — also when it is soft-deleted, where it used to answer `410` — and `404`
by permalink, exactly as for a name that does not exist. Public cloud assets reached through the
route are redirected to their stable bucket URL. Redirects and error answers carry `no-store`,
`X-Content-Type-Options: nosniff` and a fixed content policy, whatever the stored type.

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

**Replace a file in place.** `POST /api/v1/admin/assets/:id/replace` (`assets.write`, multipart, one
`file` part, an optional `expectedContentVersion` field before it) swaps an asset's file and keeps
everything else: the id, the folder, the label, the alternate text, the visibility, every reference
to it, its storage key and therefore every URL already handed out. It answers the updated detail,
with a new `contentVersion`. The write runs as the audited Command `asset.replace` (before and after:
filename, type, size, content version).

- The replacement passes the same size, type and content policy as an upload. The configured
  maximum size now also applies to the bytes actually received — on an upload as well — so a
  tightened limit takes effect without a restart. On an S3 asset a replacement above 5 GiB is
  refused with `413` naming 5120 MB.
- An asset keeps its kind: an image is replaced by an image (an SVG counts), a video by a video, a
  PDF by a PDF, and anything else by anything else, judged by what the new bytes are rather than the
  declared type. A mismatch is `415 ASSET_REPLACE_KIND_MISMATCH` with `details.currentKind` and
  `details.newKind`. A certificate stays a certificate. An admin's MIME override is cleared.
- Two replaces racing on the same version: one wins, the other gets `409 ASSET_REPLACE_CONFLICT`.
  A soft-deleted asset answers `410`, a legacy row `409 ASSET_LEGACY_CANNOT_REPLACE`, an
  unconfigured storage backend `503`. The asset's own backend is used, whatever the active one is.
- The replaced file is kept as the asset's previous version under a random, private storage key; a
  further replace discards the one before. Staging and previous objects are recorded in
  `asset_object_cleanups` before they exist, so a failed or interrupted replace leaves nothing that
  is not either referenced or due for cleanup.
- A visibility change now takes the asset's row lock, as a replace does.
- The file route's `ETag` is now `"<id>-<contentVersion>"`: it changes when the file changes and no
  longer when only the label or folder does.

**The previous version and its restore.** The asset detail now carries `previousVersion` — the
replaced file's name, type, size, content version, when and by whom it was replaced, and
`restorableUntil` (replaced at plus `assets.soft_delete_retention_days`) — or `null`. `POST
/api/v1/admin/assets/:id/previous-version/restore` (`assets.write`) swaps it back: the body names
both `expectedContentVersion` and `expectedPreviousContentVersion`, so a restore brings back
exactly the file the admin saw, and either one being out of date answers
`409 ASSET_REPLACE_CONFLICT`. The restored file keeps its own content version, so its old ETag and
cached copies are valid again; the file it replaces becomes the previous version with a fresh
retention period. Without a previous version the answer is `409 ASSET_NO_PREVIOUS_VERSION`. The
write runs as the audited Command `asset.restore_previous_version`. `assets_library` now declares
a dependency on `admin_users`, whose `adminUserReadPort` names the admin who replaced the file.

**Permalinks.** `PUT /api/v1/admin/assets/:id/permalink` (`{ permalink, confirmReuse? }`) and
`DELETE /api/v1/admin/assets/:id/permalink` (`assets.write`) set and remove an asset's
operator-chosen permalink, as the audited Commands `asset.permalink_set` and
`asset.permalink_remove`; setting the same value again, or removing none, writes nothing. A permalink
is checked by the shared rule (`400 ASSET_PERMALINK_INVALID` with `details.code`) and is unique
case-insensitively (`409 ASSET_PERMALINK_TAKEN` with the holder's id); a soft-deleted asset keeps
its permalink. A permalink that was changed, removed or freed by a purge can be taken at once, but
when the asset that held it last was a **different** one the request answers
`409 ASSET_PERMALINK_PREVIOUSLY_USED` until `confirmReuse: true` is sent — links already printed with
that name will open the new asset — and the audit entry records which asset held it. The list
search (`q`) also matches permalinks.

**Retention floor.** `assets.soft_delete_retention_days` is now read as at least one day: `0`
(or anything below one) behaves as one day, so a deletion or a replaced file is never due at once.

**Storage.** Every storage backend can now copy one stored file over another on the server, and
the cloud backends write two more headers on the objects they store: `Cache-Control: no-cache` and a
`Content-Disposition` chosen by the serving policy — images, video, PDFs and plain text `inline`; SVG
and every type a browser would not just display as `attachment`. The ACL of a copied object is always
set explicitly from the asset's visibility. Objects stored before this release keep their headers
until they are next written.

**Error codes.** Seven new codes are declared with their English and Polish sentences:
`ASSET_REPLACE_KIND_MISMATCH`, `ASSET_LEGACY_CANNOT_REPLACE`, `ASSET_REPLACE_CONFLICT`,
`ASSET_NO_PREVIOUS_VERSION`, `ASSET_PERMALINK_TAKEN`, `ASSET_PERMALINK_PREVIOUSLY_USED` and
`ASSET_PERMALINK_INVALID` (with one sentence per reason the permalink rule names).
