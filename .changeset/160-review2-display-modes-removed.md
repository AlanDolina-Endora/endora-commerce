---
'@endora-commerce/mod-price-lists': minor
---

`PriceListService.resolveDisplayModes` is removed: nothing called it since the price-book engine split the display-mode chain. Call `resolveProductDisplayModes({ productIds })` for the product and category steps, and `resolvePageDisplayMode({ organizationId, salesChannelId, customerKind })` once for every product the first left undecided — the two halves the engine composes.
