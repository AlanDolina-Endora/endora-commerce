---
'@endora-commerce/mod-orders': patch
'@endora-commerce/contracts': minor
---

`OrderReturnContext.productsPaidTotal` takes the order-level discount off: subtotal + tax total − discount total, which is what the products were charged (issue #417, review of PR #423). An order of 100.00 net + 23.00 VAT with a 50.00 discount and 10.00 delivery charged 83.00, of which 73.00 for the products; a full return used to read 123.00. `OrderReturnContext` gains `discountTotal` (`@endora-commerce/contracts`), the stored discount a return credits back in part.
