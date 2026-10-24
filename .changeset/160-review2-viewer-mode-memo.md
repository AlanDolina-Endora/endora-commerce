---
'@endora-commerce/mod-price-lists': patch
---

The price-book engine reads the viewer's tail of the display-mode chain (the organization override, then the `pricing.*` display-mode settings) once per pricing generation and viewer rather than on every resolve, so a warm resolve whose lines are all cached issues no display-mode statements. Every write the tail reads now bumps the pricing generation: an organization override (as before), `PriceListService.setSettingsDisplayMode` (it did not), and a settings write of `pricing.default_display_mode` or `pricing.unauthenticated_display_mode` through the settings module, which `price_lists` now hears as `settings.value_changed`. `ViewerModeKey` and the engine option `viewerModeMemo` are new.
