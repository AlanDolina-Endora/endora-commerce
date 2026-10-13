---
'@endora-commerce/mod-quote-requests': patch
'@endora-commerce/mod-i18n': patch
---

**Create quote request** adds lines through **Browse products** — the admin kit's shared product
browser, many products at once — and a quick search by name or SKU beside it; the per-row product
search and **Add line** are gone. Draft and inactive products can be added; grouped and bundle
parents are shown with a reason and cannot; a product already on the request is marked as already
added. Each line shows name and SKU, an editable whole-number quantity (default 1), an editable
agreed unit price and remove.

The agreed unit price is prefilled from the customer's price lists through a queue with at most
four requests in flight, and a response is applied only while it still answers the line's current
product, quantity and customer. **A hand-typed agreed price is no longer overwritten** — before,
changing the quantity or the customer replaced it. On a customer change every price not typed by
hand is cleared and resolved again for the new customer, so it may become empty; lines added
before a customer is chosen are prefilled once one with an organization is.

**Incomplete lines block submit instead of being dropped**: a line with no agreed price or an
invalid quantity is marked and the request cannot be sent until it is fixed or removed; every line
on screen is sent. The running total counts the lines with both a valid quantity and a price.

The `core` bundle gains `rfqCreate.items.browse`, `rfqCreate.items.quickSearch`,
`rfqCreate.items.empty`, `rfqCreate.line.priceMissing` and `rfqCreate.line.quantityInvalid` in
English and Polish, and loses `rfqCreate.addItem`, which nothing reads any more.
