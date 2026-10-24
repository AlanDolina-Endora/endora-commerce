---
'@endora-commerce/mod-price-lists': patch
---

A whole rebuild of the price surface is about three times faster (issue #416), so a catalogue-wide change shows in the price-sorted order sooner.

- **What is faster.** A catalogue-wide change used to take about 4.5 minutes to show in the price sort. It now takes about 1.5 minutes, measured on 202 built profiles of the 50 000-product SC-005 fixture: 275.64 s → 90.89 s for an all-products row, and 273.47 s → 90.62 s for a sales-channel identity event. A catalogue-wide change is an all-products or attribute-only row on an everyone or base book, a sales-channel identity or lifecycle event, or a change to more than 10 000 products. Targeted changes and the prices on cards are unchanged.
- **How.** A worker pass reads the catalogue once instead of once per profile that prices every product. A build resolves the next batch of products while it writes the previous one. The surface's resolution skips the display-mode chain, which the surface does not store.
- **Unchanged.** Every surface row is still computed by the resolver the cards use. A build still writes the next generation beside the served one and swaps it in in one transaction. A failed build swaps nothing.
- `BookPricing.resolveProfileListing` is new. It is the listing resolution of a fixed profile without the display mode, and `resolveListing` answers as before.
