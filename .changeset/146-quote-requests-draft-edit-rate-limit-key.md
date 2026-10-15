---
'@endora-commerce/mod-quote-requests': patch
---

The customer draft-edit rate limit (`PATCH /api/v1/quote-requests/:id`, 30 edits per minute per quote request) is now counted after the customer guard and keyed on the customer as well as the request. An unauthenticated caller naming a request's id is answered `401` without consuming the owner's budget, and one customer's edits no longer spend another's. Only a well-formed request id enters the key; any other `:id` counts against one bucket per customer, so varying the path no longer mints a fresh budget.
