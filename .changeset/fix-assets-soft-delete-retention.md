---
'@endora-commerce/mod-assets-library': patch
---

Make `assetsLibraryModule` honor `assets.soft_delete_retention_days` for single-asset and recursive-folder soft deletion. Read the setting at deletion time, default to 30 days for missing, negative or non-finite values, and treat any value below one day as one day — a stored `0` is read as 1 day.
