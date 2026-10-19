---
'@endora-commerce/admin-kit': minor
---

`AssetUploader` takes two optional props: `upload` and `accept`.

- `upload(file)` replaces the default request, which uploads the file as a new asset. The assets library's **Replace file** action passes one that stages the file for its own confirmation. The component still refuses a file outside `acceptPrefix` when one is given — a dropped file included — shows its progress and errors, and calls `onUploaded` with what `upload` answers.
- `accept` sets the file input's whole `accept` attribute (for example `application/pdf`). It only filters the file picker: a dropped file is checked against `acceptPrefix` alone, so pass both to hold a drop to one kind. Without `accept`, `acceptPrefix` decides the attribute as before.

The hidden file input now carries the trigger's label as its accessible name.

Every existing caller is unchanged.
