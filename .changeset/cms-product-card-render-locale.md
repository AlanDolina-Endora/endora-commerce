---
'@endora-commerce/cms-components': patch
---

`CmsProductCardView` formats its price in the language of the tree it is rendered in — `useBlockRenderEnvironment().language` from `@endora-commerce/page-builder-core/contributions`, which the storefront sets to the request's locale — instead of a hard-coded `pl-PL`. Product cards in `ProductGrid` and `ProductSlider`, which never passed a locale, now follow the shopper's language. An explicit `locale` prop on `CmsProductCardView` or `CmsProductCardLoader` still wins. A host that provides no block render environment gets that environment's default, `en`, where it used to get `pl-PL`.
