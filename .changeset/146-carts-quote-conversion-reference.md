---
'@endora-commerce/mod-carts': minor
---

Converting a cart into a quote request no longer records the cart's unit prices as the customer's proposed prices. Each cart line's unit price is passed to `RfqCustomerPort.createForCustomer` as that line's reference price instead (`options.lineReferencePrices`), so the resulting quote lines carry no proposal and conversion keeps working for a customer who may not propose prices.
