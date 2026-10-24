---
'@endora-commerce/mod-price-lists': patch
---

A cached price no longer carries another viewer's display mode.

The price-book engine's cache is keyed by the pricing profile, which a guest and an organization with no buyer book share, while the display mode's organization and settings steps differ between them: whichever asked first decided the net/gross mode the other was shown for up to 60 seconds. The cache now holds only what the profile decides — the price, and the product and category steps of the display-mode chain — and the organization → settings tail is applied per request. The price surface's worker, which resolves a buyer profile with a guest viewer, no longer reads or writes the cache at all.

`BookPricingDeps.displayModes` is replaced by `productDisplayModes` (the product and category steps) and `viewerDisplayMode` (the tail); the cache's value type is the new `CachedBookLine`. `PriceListService.resolveProductDisplayModes` is new; `resolveDisplayModes` answers as before.
