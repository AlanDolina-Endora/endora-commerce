---
'@endora-commerce/mod-quote-requests': patch
---

The admin quote request's Modify tab pre-fills an empty agreed unit price with the customer's current price rounded half-up on its decimal digits (`roundAmountHalfUp`), as a stored reference price is. It wrote `toFixed(2)` of the binary double, so a price of 9.0450 was offered as 9.04 and, once accepted, charged as 9.04 against the 9.05 the storefront shows. The current reference price the screen asks for is held at those two places too, and a price already defined on the request is written by the same rule.
