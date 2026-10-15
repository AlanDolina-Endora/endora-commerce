---
'@endora-commerce/mod-i18n': patch
---

The `core` bundle gains the `productBrowser.*` strings in English and Polish, used by the admin
kit's `ProductBrowserDialog`, `ProductBrowserTrigger` and the rule-aware `ProductPicker`: the
trigger and its missing-permission hint, the status tabs, the type filter, the search
placeholder, the column headers, translated product statuses and types, the reasons a product
cannot be selected, the selection footer (`productBrowser.action.confirm` is "Add {count}" /
"Dodaj {count}"), the per-confirm limit notice, and the loading, empty, load-error and
confirm-error states. No existing key changes.
