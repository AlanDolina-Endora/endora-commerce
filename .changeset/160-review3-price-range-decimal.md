---
'@endora-commerce/mod-catalog': patch
---

A price range (`minPrice`, `maxPrice`) on the product listing selects the same products under every sort. The bounds are read once, exactly — a minimum rounded up and a maximum rounded down to the four places a price has — and compared as decimals on every path; the price-sorted path rounded them with `toFixed(4)` and the other sorts compared binary numbers, so `minPrice=9.04504` kept a product at 9.0450 when sorted by price and dropped it otherwise. It is now dropped on both.
