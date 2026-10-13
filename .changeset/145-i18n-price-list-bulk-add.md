---
'@endora-commerce/mod-i18n': patch
---

The `core` bundle gains, in English and Polish, the strings of the price list's bulk add through
the product browser: `priceLists.detail.picker.alreadyOnList`, `priceLists.detail.bulkAdd.error`,
`priceLists.detail.bulkAdd.failed` (with `{count}` and `{products}`),
`priceLists.detail.bulkAdd.failed.product_not_found` and
`priceLists.detail.products.add.noPermission`. `priceLists.detail.picker.title` now reads "Add
products" / "Dodaj produkty". The single-product drawer's `priceLists.detail.picker.empty`,
`priceLists.detail.picker.error.load`, `priceLists.detail.picker.searchPlaceholder` and
`priceLists.detail.picker.subtitle` are removed, as are `priceLists.detail.picker.cancel`,
`priceLists.detail.products.error.add` and `priceLists.detail.products.loadingProduct`; nothing
reads them any more.
