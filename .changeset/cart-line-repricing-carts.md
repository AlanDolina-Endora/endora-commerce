---
'@endora-commerce/mod-carts': patch
---

A cart line's stored unit price is now always the price for its current quantity.

- Adding more of a product already in the cart, changing a line's quantity, merging an
  anonymous cart at login and seeding a basket from a past order
  (`CartWritePort.replaceItemsForCustomer` without `sourceQuoteRequestId`) store the price for the
  resulting quantity, so a quantity-tier bracket applies to the quantity actually ordered and a
  reorder is priced at today's prices.
- A product that no price list and no price of its own (`defaultPrice` attribute) applies to is
  refused with `422 CART_PRODUCT_UNPRICED` instead of being added at `0.00`.
- A line seeded from an accepted quote request (`CartWritePort.replaceItemsForCustomer` with
  `sourceQuoteRequestId`) records the quantity its price was agreed for in three new nullable
  `cart_items` columns (`agreed_quantity`, `agreed_unit_price`, `agreed_currency`; one migration).
  It keeps the agreed price only at that quantity and is priced from the list at any other.
- `CartPlacementApplyPort` (`./ports`) gains `findPriceDrift(em, { cartId, organizationId })` and
  `refreshLinePrices({ cartId, organizationId })`, which order placement uses to refuse and then
  bring up to date a cart whose stored prices are no longer current. An implementation of the port
  outside this package has to add both.
- Two new error sentences in the `carts` bundles: `errors.CART_PRODUCT_UNPRICED` and
  `errors.CART_PRICE_CHANGED`.

A cart converted from an accepted quote before this release carries no agreed quantity; its lines
are priced from the list at placement, and converting the quote again restores the agreed prices.
