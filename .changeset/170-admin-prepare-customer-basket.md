---
'@endora-commerce/contracts': minor
'@endora-commerce/mod-quote-requests': minor
'@endora-commerce/mod-i18n': patch
---

The *Place order* action on an approved Quote Request in the Admin UI works. It posted to the storefront's `POST /api/v1/quote-requests/:id/convert-to-order`, which is customer-only: an administrator's session answered `401`, which the Admin UI reads as an expired session, so the operator was signed out — and an accepted call would have seeded the administrator's own basket.

`@endora-commerce/mod-quote-requests` adds `POST /api/v1/admin/quote-requests/:id/prepare-customer-basket`, behind the module's `rfqs:handle` permission and the sales-representative scope of the other admin actions. It puts the approved request's lines into the basket of the customer who owns the request, at the agreed unit prices — replacing what that basket held, exactly as the customer's own conversion does and under the same rules — and records `quote_request.prepare_customer_basket` in the audit log. The customer completes the order at checkout. `@endora-commerce/contracts` exports its response schema, `adminPrepareCustomerBasketResponseSchema` (`cartId`, `customerAccountId`, `itemCount`).

The Admin UI button calls it after a confirmation that names the replaced basket, and is labelled *Prepare the customer's basket* (`@endora-commerce/mod-i18n`, English and Polish).
