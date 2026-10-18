---
'@endora-commerce/contracts': patch
---

Two new members of `ERROR_CODES`: `CART_PRODUCT_UNPRICED` (a product with no price cannot be
added to a cart) and `CART_PRICE_CHANGED` (an order placement refused because a cart line's stored
price is no longer current; `details.lines` names the lines).
