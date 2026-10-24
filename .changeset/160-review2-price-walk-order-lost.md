---
'@endora-commerce/mod-catalog': patch
---

A price-sorted listing walk whose price order goes missing midway (its price surface retired or being rebuilt) no longer starts again at the default listing's first page, which showed the buyer products already served. It carries on from the last price it served: the products still to come — those whose live price sorts after it in the walk's direction, then the unpriced ones — in the default order, to the end, so nothing is repeated or lost. A page that loses the order between two chunks ends with the products it collected. The listing's response shape does not change.
