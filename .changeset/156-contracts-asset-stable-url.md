---
'@endora-commerce/contracts': minor
---

The permalink rule for library assets, the request shapes for setting a permalink and restoring a previous file version, and seven new error codes.

**For a consumer of the contracts.**

- `validateAssetPermalink(value)` — the one permalink rule the server and the admin form share.
  It answers `{ ok: true }` or `{ ok: false, reason }`, the reason being the first broken rule
  of, in this order: `empty`; `too_long` (more than `ASSET_PERMALINK_MAX_LENGTH`, `200`,
  characters); `invalid_characters` (anything outside letters, digits, `-`, `_`, `.` and `/`);
  `invalid_segment` (a leading or trailing `/`, `//`, or a `.` or `..` part); `uuid_shaped`
  (the whole value has the shape of an asset id, in either case). A value such as
  `<uuid>.pdf` is accepted. The reason union is exported as `AssetPermalinkInvalidReason`.
- `isAssetIdShaped(segment)` — true for a UUID in either case; it is how a file URL decides
  whether its path names an asset id or a permalink.
- `assetPreviousVersionSchema` (`AssetPreviousVersion`) — the one kept previous version of an
  asset's file: `filename`, `mimeType`, `sizeBytes`, `contentVersion`, `replacedAt`,
  `replacedBy` (`{ id, displayName }` or `null`) and `restorableUntil`.
- `setAssetPermalinkRequestSchema` (`SetAssetPermalinkRequest`) — `{ permalink, confirmReuse? }`.
  The schema only bounds the length of `permalink`; its shape is judged by
  `validateAssetPermalink`. `confirmReuse: true` acknowledges taking a permalink whose last
  holder was a different asset.
- `restorePreviousAssetVersionRequestSchema` (`RestorePreviousAssetVersionRequest`) —
  `{ expectedContentVersion, expectedPreviousContentVersion }`, both required and non-empty, so
  a restore always names the file it replaces and the file it brings back.
- Seven `ERROR_CODES` members, all owned by the assets library: `ASSET_REPLACE_KIND_MISMATCH`,
  `ASSET_LEGACY_CANNOT_REPLACE`, `ASSET_REPLACE_CONFLICT`, `ASSET_NO_PREVIOUS_VERSION`,
  `ASSET_PERMALINK_TAKEN`, `ASSET_PERMALINK_PREVIOUSLY_USED` and `ASSET_PERMALINK_INVALID`
  (whose `details.code` carries the validator's reason).

**New members on existing shapes — additive for a reader, required for anyone constructing one.**

- `assetSummarySchema` (and so `AssetSummary`, `AssetDetail` and every response carrying them)
  gains four required members: `fileUrl` (the stable, unversioned file URL, the same across
  replaces), `permalink` (string or `null`), `permalinkUrl` (the absolute permalink URL, or
  `null`) and `contentVersion` (the identity of the bytes the asset currently holds).
- `AssetRecord` gains `contentVersion: string` and `permalink: string | null`.

- `AssetDetail` gains `retentionDays` (a whole number, at least 1): the retention, in days, the sweep applies — how long a replaced file stays restorable.
- `AssetDetail` gains `replaceable` (boolean): whether the file can be replaced in place — false for a legacy row and for a row with no storage key.
- New `folderPermalinkCountResponseSchema` (`{ data: { permalinkedAssets } }`) for the folder delete confirmation's count.

A client that only reads these shapes needs no change. Code that builds an `AssetSummary`,
`AssetDetail` or `AssetRecord` by hand — a test fixture, a mock, an optimistic list update — must
add the new members. The `url` and `storageUrl` members keep their shape (a string), but their
values now carry `?v=<contentVersion>` for public assets — see the
`@endora-commerce/mod-assets-library` changeset of this release for which values change and why.

The routes that use the request schemas arrive with the assets library release that ships them.
