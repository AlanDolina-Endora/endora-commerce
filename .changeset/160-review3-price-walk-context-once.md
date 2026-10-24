---
'@endora-commerce/mod-catalog': patch
---

A price-sorted or price-filtered listing page builds the viewer's pricing context (including the organization lookup) and reads the category tree once per page, instead of once per chunk it scans — up to eight times on a page that skips many products.
