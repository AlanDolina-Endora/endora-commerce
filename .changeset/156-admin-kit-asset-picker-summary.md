---
'@endora-commerce/admin-kit': patch
---

`AssetPicker` carries the new asset summary members (`fileUrl`, `permalink`, `permalinkUrl`, `contentVersion`) into its grid when an upload completes.

Nothing changes in what the picker shows or selects; the item it adds after an upload now matches the
shape the library's list answers.
