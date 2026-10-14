---
'@endora-commerce/mod-quote-requests': minor
---

Every quote line now stores a **reference price** — the net unit price, per base unit, that the request's customer would pay on a normal order on the request's sales channel — captured server-side on every customer write (storefront form, cart conversion, draft edit, resubmit, quick order, shopping list, order copy) and kept for the life of the request. The admin detail shows it per line beside the customer's proposal, their difference (amount and percentage) and the agreed price; a line with no stored reference shows the customer's current price on the request's channel, labelled as such. The Modify tab shows the same with a live difference, and prefills an empty agreed price with the customer's own price rather than the administrator's storefront price.

- **The module now depends on `price_lists`** (manifest `dependencies`): the reference is resolved through its `buyerLinePricePort`. `price_lists` cannot be switched off, so no activation control is affected.
- **For ERP and connector readers of `quoteRequestReadPort.listItems`: a line converted from a cart now has `desiredUnitPrice = null`.** The cart's unit price is its reference — read it from the new `referenceUnitPrice` / `referenceCurrency`.
- **Customer list totals**: `totalAtCustomerPrice` is `null` unless every line carries a proposal, the rule the admin list already applied. A cart-converted request therefore shows no customer-price total until it is priced.
- **Admin list totals**: the customer-price total no longer turns `null` at the seller's first revision — a revision now keeps each line's proposal.
- **CRM opportunity value**: a cart-converted request with no agreed price is valued `0` (it used to be valued at the cart prices recorded as proposals); a revised line the customer left unpriced is valued at the proposal carried from the customer's last draft edit until sales sets an agreed price.
- A client cannot supply a reference price: an unknown key in the customer body is stripped. A failure to resolve a price stores no reference and never blocks the request.
