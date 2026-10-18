---
'@endora-commerce/mod-assets-library': patch
---

Make `assetsLibraryModule` honor `assets.soft_delete_retention_days` for single-asset and recursive-folder soft deletion. The setting is read when the purge runs, so a changed value applies to assets already deleted. Default to 30 days for missing, empty, non-numeric, negative or non-finite values, and treat any value below one day as one day — a stored `0` is read as 1 day.
