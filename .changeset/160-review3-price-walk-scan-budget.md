---
'@endora-commerce/mod-catalog': patch
---

A price-sorted or price-filtered product listing page that runs out of its scan budget (it reads at most eight times the page size of rows) no longer ends the walk and loses the products after it: it answers `hasMore: true` with a cursor that continues from where its scan stopped. Such a page can be short, or empty where every row it read was hidden from the viewer or already served; the walk still reaches the end, since every page moves the scan forward.
