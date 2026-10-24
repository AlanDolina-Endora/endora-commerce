---
'@endora-commerce/mod-price-lists': patch
---

A whole rebuild of the price surface is about three times faster (issue #416), so a catalogue-wide change shows in the price-sorted order sooner.

- **What is faster.** A catalogue-wide change used to take about 4.5 minutes to show in the price sort. It now takes about 1.5 minutes, measured on 202 built profiles of the 50 000-product SC-005 fixture: 275.64 s → 90.89 s for an all-products row, and 273.47 s → 90.62 s for a sales-channel identity event. A catalogue-wide change is an all-products or attribute-only row on an everyone or base book, a sales-channel identity or lifecycle event, or a change to more than 10 000 products. Targeted changes and the prices on cards are unchanged.
- **How.** A build reads the catalogue through `catalogProductReadPort.listPricingRefs()`, one statement with no entity hydration, at its own start, so it always prices the catalogue as it is. It resolves the next batch of products while it writes the previous one, and reads a buyer's comparison rows beside the resolution. The surface's resolution skips the display-mode chain, which the surface does not store.
- **A product deleted during a rebuild no longer stops the worker.** A build that meets a product deleted after it read the catalogue rolls back and runs again on a fresh read. After three such attempts the profile keeps its mark for a later pass, and the pass goes on with the other profiles. Before this, the error aborted the whole pass.
- **Unchanged.** Every surface row is still computed by the resolver the cards use. A build still writes the next generation beside the served one and swaps it in in one transaction. A failed build swaps nothing, and a failed write fails it at once. A whole-profile mark that lands while a build no pass asked for is reading the catalogue is no longer cleared by that build.
- `BookPricing.resolveProfileListing` is new. It is the listing resolution of a fixed profile without the display mode, and `resolveListing` answers as before.
