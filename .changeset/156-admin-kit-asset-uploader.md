---
'@endora-commerce/admin-kit': minor
---

`AssetUploader` takes two optional props: `upload` and `accept`.

- `upload(file)` replaces the default request, which uploads the file as a new asset. The media library's **Replace file** action passes one that replaces an existing asset's file in place. The component still validates the type, shows its progress and errors, and calls `onUploaded` with what `upload` answers.
- `accept` sets the file input's whole `accept` attribute (for example `application/pdf`). Without it, `acceptPrefix` decides as before.

Every existing caller is unchanged.
