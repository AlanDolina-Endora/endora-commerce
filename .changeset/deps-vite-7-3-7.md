---
'@endora-commerce/admin-kit': patch
'@endora-commerce/admin-shell': patch
'@endora-commerce/page-builder-admin': patch
---

Raise `vite` to `^7.3.7`. It includes a dev-server fix that keeps module ids, not URLs, in `safeModulePaths`. `@endora-commerce/admin-shell`'s generated README lists the new peer range.
