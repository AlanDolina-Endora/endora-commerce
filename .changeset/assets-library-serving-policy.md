---
'@endora-commerce/mod-assets-library': patch
---

Uploaded files are stored and served under a stricter content policy, and private assets are checked before a storage redirect.

- Uploads of HTML, XHTML, XML (including XSL) and JavaScript files are refused with
  `415 ASSET_UPLOAD_TYPE_NOT_ALLOWED`, judged by the declared MIME type and by the file extension,
  regardless of `assets.allowed_file_types`. SVG uploads are still accepted and are always stored
  as `image/svg+xml`.
- `GET /assets/file/:assetId` now sends `X-Content-Type-Options: nosniff` and a
  `Content-Security-Policy` (`default-src 'none'; style-src 'unsafe-inline'; sandbox`, without
  `sandbox` for PDFs) on every response, and serves only raster images, SVG, video, audio, PDF and
  plain text `inline`; every other stored type is served as an `attachment`.
- For a `private` asset on S3 or GCS, the same route now requires a valid signed token before it
  redirects to the storage URL, as it already did for local assets; without one it answers
  `403 ASSET_ACCESS_DENIED`. URLs from `GET /api/v1/admin/assets/:id/url` are unaffected.
